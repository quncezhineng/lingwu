# 技术方案：LingWu 多 Agent 编排 + 事件溯源改造

> 版本：v0.1 | 日期：2026-11-15 | 作者：技术负责人 | 状态：Draft
>
> 上游依赖：`PRD-LingWu-openbot对标借鉴.md`（§6.1、§6.2）
> 代码基线：基于 `apps/server/src/engine/worker.ts`、`apps/server/src/db.ts`、`apps/server/src/agent-space.ts`、`packages/domain/src/agent.ts` 实测结构

---

## 0. 结论先行（TL;DR）

| 方案 | 建议 | 理由 |
| --- | --- | --- |
| **多 Agent 编排** | ✅ 立即做（M2，增量） | 现有 `agentSchema` 已有多 Agent 模板，`TaskWorker` 已有租约机制，只需新增「编排层」与「委托」语义，改动可控、价值直接 |
| **事件溯源改造** | ⚠️ 分阶段、灰度 | 现有 `Store` 是「快照式 upsert」，全量改事件溯源成本高、风险大；建议先做「审计事件流」增量，再按需演进为「事件 + 投影」 |

---

## 1. 现状盘点（代码级）

### 1.1 存储层 `Store`（`apps/server/src/db.ts`）

- 单一表 `records(owner, kind, id, data jsonb)`，`data` 存整条 JSON。
- `put` = `INSERT ... ON CONFLICT DO UPDATE`（覆盖式快照，**旧状态不可追**）。
- `compareAndSwap(expected, patch)` = `UPDATE ... WHERE data @> expected`（JSONB 乐观锁，**并发安全的核心**）。
- `listAfter` 已支持游标分页（迁移用）。

**含义**：并发控制已达标（CAS 乐观锁），但**没有历史、没有可重放的变更序列**。

### 1.2 任务引擎 `TaskWorker`（`apps/server/src/engine/worker.ts`）

已有能力（值得表扬，很多「事件溯源」诉求其实已满足）：

- **租约抢占**：`leaseId + leaseUntil + attempts`，`compareAndSwap` 抢锁，`LostLeaseError` 表示被抢占。
- **checkpoint**：`checkpoint(patch)` 增量落盘任务状态，支持断点续跑。
- **guard**：每次操作前校验租约仍属自己。
- **状态机**：`TaskStatus` 覆盖 queued/running/waiting_approval/waiting_input/scheduled/paused/succeeded/failed/cancelled。
- **tick 调度**：`pollMs` 轮询 + `inFlight` 并发上限（3）+ 任务不阻塞后续 tick。

**含义**：可靠性基础设施已具备，缺的是「**可审计的事件历史**」和「**多任务编排/依赖**」。

### 1.3 Agent 模型（`apps/server/src/agent-space.ts`）

- `agentSchema` 已定义 9 种模板：`general / market / asset / research / earnings / macro / risk / review / custom`。
- 已有 `role / persona / tone / skills / model` 等字段。
- **缺失**：Agent 之间的**协作关系、委托、任务归属（owner）、共享上下文**。

### 1.4 记忆系统（`packages/domain/src/agent.ts`）

- `AgentMemoryV2` 已有多 Agent 记忆（`agentId / kind / financeTerms / dealHabits / privacy`）。
- 说明多 Agent 方向已启动，编排层可复用这套「按 agentId 归属」的约定。

---

## 2. 方案 A：多 Agent 编排

### 2.1 目标

把一个「投研任务」拆解为多个子任务，派给不同专家 Agent（研究员/分析师/宏观/风控）**并行或串行**执行，由「编排者 Agent」汇总成最终成果。用户只跟编排者对话，无需关心背后有多少 Agent。

### 2.2 核心概念与类型扩展

在 `packages/domain/src/agent.ts` 新增：

```ts
/** 编排计划：一个任务如何拆成多个子任务 */
export interface OrchestrationPlan {
  id: string;
  parentTaskId: string;          // 顶层投研任务
  /** 有向无环图：每个节点是一个子任务 */
  nodes: OrchestrationNode[];
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: string;
}

export interface OrchestrationNode {
  id: string;
  taskId?: string;               // 落盘后的子任务 id
  agentTemplate: AgentTemplate;  // 复用 agentSchema.template
  title: string;
  prompt: string;
  /** 依赖的节点 id（DAG 边） */
  dependsOn: string[];
  status: "pending" | "queued" | "running" | "succeeded" | "failed" | "skipped";
  result?: string;
  error?: string;
}

/** 子任务创建入参：在 AgentTask 上打一个「编排归属」标记 */
export interface AgentTask {
  // ...现有字段...
  /** 编排上下文：归属哪个编排计划、由谁委派 */
  orchestrationId?: string;
  parentTaskId?: string;
  delegatedBy?: string;          // 委派方 agentId
  assignedAgent?: string;        // 执行方 agentId
}
```

### 2.3 架构分层

```
用户 ──► 编排者 Agent (orchestrator)
              │  1. 解析意图，产出 OrchestrationPlan (DAG)
              ▼
        OrchestratorService  ← 新增 apps/server/src/engine/orchestrator.ts
              │  2. 按拓扑序调度子任务
              ▼
        TaskWorker (复用)  ──► 各专家 Agent 执行子任务
              │
              ▼
        OrchestrationPlan 状态回写 + 汇总
```

**关键复用**：子任务直接走现有 `TaskWorker` 的 `queued → running → succeeded/failed` 状态机与租约机制，编排层**不重造调度器**，只负责「拆解 + 依赖 + 汇总」。

### 2.4 OrchestratorService 接口

```ts
export class OrchestratorService {
  constructor(private db: Store, private worker: TaskWorker) {}

  /** 1. 让编排者 Agent 把顶层 prompt 拆成 DAG */
  async plan(parentTaskId: string): Promise<OrchestrationPlan>;

  /** 2. 提交计划：生成子任务，依赖未满足的保持 queued */
  async submit(plan: OrchestrationPlan): Promise<void>;

  /** 3. 子任务完成回调：检查依赖，解锁下游节点 */
  async onNodeSettled(nodeId: string, status: string): Promise<void>;

  /** 4. 全部节点终态后，触发汇总 Agent 生成成果 */
  async finalize(planId: string): Promise<void>;
}
```

### 2.5 调度算法（拓扑排序 + 依赖解锁）

- 维护 `OrchestrationPlan.nodes` 的 `dependsOn` 有向边。
- `submit` 时：入度为 0 的节点 → `TaskWorker` 直接标记 `queued`；其余节点 `pending`。
- `onNodeSettled`：某节点成功后，遍历其下游，入度减一；入度归零的节点 → `queued`。
- 某节点 `failed`：按策略（**fail-fast 或降级**）决定是否跳过其下游（置 `skipped`）。
- 全部终态 → `finalize` 调汇总 Agent，产出 `AgentArtifact`（复用现有 artifact 机制）。

### 2.6 共享上下文（openbot 的「共享工作区」思想）

- 子任务结果（`AgentTask.result` + `AgentArtifact`）通过 `OrchestrationPlan` 关联，汇总 Agent 读取所有子任务产物。
- 记忆系统复用 `AgentMemoryV2.privacy = "agent"`，子 Agent 的中间结论可选择性沉淀为共享记忆，供汇总 Agent 召回。
- 文件共享：复用 `computer` 的 `Shared/` 目录方案（见 PRD §6.3）。

### 2.7 落地步骤（M2，约 3 周）

| 周 | 交付 | 内容 |
| --- | --- | --- |
| W1 | 类型 + 存储 | `OrchestrationPlan/Node` 类型、`Store` 新增 kind `orchestration_plan`、`AgentTask` 加编排字段 |
| W2 | 编排服务 | `OrchestratorService` 的 plan/submit/onNodeSettled/finalize，串行拓扑调度 |
| W3 | 并行 + 汇总 | 支持并行子任务（复用 `inFlight` 并发上限）、汇总 Agent、端到端 demo |

### 2.8 风险与对策

| 风险 | 对策 |
| --- | --- |
| 子任务拆解质量差 | 编排者 Agent 用 few-shot 提示词 + 预置投研任务模板（研究/财报/宏观） |
| 循环依赖 / DAG 非法 | `submit` 前用拓扑排序校验，非法直接拒绝 |
| 子任务失控 | 每个子任务独立租约，超时/抢占自动 `LostLeaseError`，编排层捕获后置 `failed` |
| 汇总上下文过长 | 复用 PRD §6.4 的 compaction 机制，只保留子任务 `result` 摘要 |

---

## 3. 方案 B：事件溯源改造

### 3.1 目标与边界

**目标**：让每个任务、每次状态变更都成为**不可变、可重放的事件**，支撑：
1. 审计（谁在何时改了什么）；
2. 断点恢复（重放事件重建状态）；
3. 调试与回放（复现一次投研任务的完整过程）。

**边界（明确不做）**：本次**不推翻**现有 `records` 快照表，不做 CQRS 大改造；采用「**事件流 + 快照投影**」的折中，事件流是增量补充。

### 3.2 设计：Event Store（增量新增）

新增一张事件表（与现有 `records` 并存）：

```sql
CREATE TABLE IF NOT EXISTS events (
  seq         BIGSERIAL PRIMARY KEY,   -- 全局单调递增序号
  owner       TEXT NOT NULL,
  stream_id   TEXT NOT NULL,           -- 聚合 id（如 taskId）
  stream_kind TEXT NOT NULL,           -- 聚合类型（task/monitor/goal...）
  version     INT  NOT NULL,           -- 流内版本号
  event_type  TEXT NOT NULL,           -- 事件类型（task_created/task_started/...）
  payload     JSONB NOT NULL,          -- 事件体
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stream_kind, stream_id, version)
);
```

**关键点**：`(stream_kind, stream_id, version)` 唯一约束 = 乐观并发控制（与现有 `compareAndSwap` 同款语义，但落在事件流上）。

### 3.3 事件类型（以 task 为例）

| event_type | 触发时机 | 现有代码对应 |
| --- | --- | --- |
| `task_created` | 任务创建 | `Store.put("tasks", ...)` |
| `task_claimed` | worker 抢占租约 | `compareAndSwap` 置 running |
| `task_checkpointed` | checkpoint 增量 | `checkpoint(patch)` |
| `task_completed` / `task_failed` / `task_cancelled` | 终态 | 状态机流转 |

### 3.4 与现有 TaskWorker 的衔接（最小侵入）

在 `worker.ts` 的 `run`/`checkpoint` 里，**在成功 CAS 之后追加一条事件**（同事务或 best-effort）：

```ts
// 伪代码：checkpoint 成功后
await this.eventStore.append(owner, {
  streamKind: "task",
  streamId: taskId,
  version: nextVersion,
  eventType: "task_checkpointed",
  payload: patch,
});
```

**事务策略**：优先「状态写 + 事件写」放同一 DB 事务（PGlite/PG 均支持），保证一致性；若怕改动大，先用 best-effort + 幂等去重，后续再收紧。

### 3.5 投影（Projection）

- 现有 `records.data` **继续作为「读模型」**（快照投影），`TaskWorker` 读路径不变，**零破坏**。
- 事件流作为「写侧事实源」，通过 `reducer` 从事件重放可重建 `records.data`，用于：断点恢复校验、审计、回放。
- 提供 `rebuild(streamKind, streamId)` 工具：从 `events` 重放，比对/重建 `records`，作一致性校验。

### 3.6 迁移路径（灰度）

| 阶段 | 内容 | 风险 |
| --- | --- | --- |
| P1 | 只对 `task` 聚合写事件流，`records` 仍为主读路径 | 低（双写，读不变） |
| P2 | 用 `rebuild` 离线校验事件流与快照一致性 | 低 |
| P3 | 新增「审计/回放」功能消费事件流 | 低 |
| P4 | （可选）关键任务改为「事件重建状态」 | 中，需充分验证 |

### 3.7 落地成本与收益

- **成本**：新增 `events` 表 + `EventStore` 类 + 在 worker 两处埋点；`AgentTask` 状态机无需改。
- **收益**：审计、回放、更彻底的断点恢复（重放而非信任快照）、未来支持 CQRS/时间旅行调试。

---

## 4. 两个方案的组合建议

| 方案 | 依赖关系 | 建议顺序 |
| --- | --- | --- |
| 多 Agent 编排 | 不依赖事件溯源，可直接做 | **先做**（M2） |
| 事件溯源 | 编排的子任务状态变更正好是事件溯源的天然载体 | **编排落地后**，对编排的 DAG 节点 + task 做事件流（P1 灰度） |

**理由**：编排是「业务价值先行」，事件溯源是「可靠性后置增强」。先把编排跑通，事件流顺带把「子任务之间的消息传递、状态流转」记录下来，两者天然契合（openbot 的「事件日志 + 投影」正是用来支撑多 Agent 消息与任务队列的）。

---

## 5. 交付物与验收标准

### 5.1 多 Agent 编排验收

- [ ] 输入「研究比亚迪」→ 产出含 ≥2 个子任务的 OrchestrationPlan。
- [ ] 子任务按 `dependsOn` 拓扑序执行，依赖未满足不启动。
- [ ] 单子任务失败，下游按策略 skipped/failed，顶层任务有明确终态。
- [ ] 汇总 Agent 产出 `research_report` artifact。
- [ ] 断网重启后，未完成的子任务从租约续跑（复用现有 checkpoint）。

### 5.2 事件溯源验收

- [ ] `events` 表记录每次 task 状态变更，`(stream_kind, stream_id, version)` 唯一。
- [ ] `rebuild` 能重放事件重建 `records`，与快照一致。
- [ ] 状态写与事件写在同一事务，无孤儿事件/无丢失事件。
- [ ] 现有 `TaskWorker` 读路径零回归（测试全绿）。

---

## 6. 附录：与 openbot 的对照

| openbot 机制 | LingWu 对应落地 |
| --- | --- |
| FIFO 消息队列 + 事件日志投影 | 现有 `TaskWorker` + 新增 `events` 表 |
| agent-to-agent 消息 + 任务 owner | `AgentTask.parentTaskId / delegatedBy / assignedAgent` + `OrchestrationPlan` |
| 共享工作区 + transfer 清单 | `computer` 的 `Shared/` + 子任务产物关联 |
| compaction（窗口压缩） | 汇总 Agent 上下文压缩（PRD §6.4） |
| MCP tool consent | 编排子任务调用高敏感工具的授权闸门（PRD §6.5） |
