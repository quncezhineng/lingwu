# PRD — LingWu 多 Agent 记忆系统

> 版本：v1.3（术语体系金融投研化）｜ 状态：待开发评审 ｜ 关联代码：`packages/domain/src/agent.ts`、`apps/server/src/agent-space.ts`、`apps/server/src/engine/conversation.ts`、`apps/server/src/engine/memory-recall.ts`

## 0. 已确认的产品决策（用户拍板）

| # | 决策项 | 结论 |
| --- | --- | --- |
| 1 | 多 Agent 建模 | **一个用户可创建多个 Agent（已有机制），每个 Agent 记住「该 Agent 对话里产生的」记忆**；记忆按 `agentId` 隔离 |
| 2 | 记忆术语体系 | 记忆**面向金融投研**，术语围绕「投研术语（标的/研究/市场资金/风险组合）」与「个人投融资习惯」固定字段体系，同一标的多写法（NVDA / 英伟达）写入时归一化 |
| 3 | 语义召回引擎 | **Vectorize Hindsight**（`retain`/`recall`/`reflect`，四路检索 + 事实抽取 + 观察合并） |
| 4 | 记忆入口 | **右侧栏 = 全局记忆（汇总所有 Agent）**；**左侧栏每个 Agent 详情页 = 该 Agent 专属记忆** |
| 5 | 投融资决策沉淀 | **模型主动调用 `write_memory` + 关键词规则兜底**（双保险） |
| 6 | 存量数据规模 | **~1 GB**，迁移分批 + 幂等 + 断点续传 |

---

## 1. 背景与现状

LingWu 已具备「单 Agent 记忆系统」，且**多 Agent 机制已经存在**：

| 能力 | 现状实现 | 代码位置 |
| --- | --- | --- |
| 多 Agent | `agentSpaceSchema.agents[]`，每个 Agent 有 `id`、`threadId`、`name`、`role`、`persona`、`model` 等；`currentAgentId` 标记当前 Agent | `apps/server/src/agent-space.ts` |
| Agent↔线程映射 | `agentModelForThread(db, owner, threadId)` 用 `threadId → agent` 反查 | `agent-space.ts:123` |
| 记忆数据模型 | `AgentMemory { id, text, source, createdAt, category? }`，四类分类（投资目标/风险偏好/关注领域/分析习惯） | `packages/domain/src/agent.ts` |
| 记忆写入 | `remember_fact` 工具，`id=sha256(key("memory", text))` 幂等去重 | `conversation.ts:477` |
| 记忆召回 | `recall_memory` → `recallMemories()` 关键词评分 | `memory-recall.ts` |
| 记忆存储 | `records` 表，唯一键 `(owner, kind="memories", id)`，JSONB | `db.ts` |
| 前端展示 | Preferences「All memories」卡片；workbench / search-sheet 读取 | `preferences-screen.tsx` 等 |

### 核心问题

1. **记忆未绑定 Agent**：`remember_fact`/`recall_memory` 只按 `owner` 读写，没有记录「是哪个 Agent 说的」，多 Agent 场景下记忆互相污染。
2. **记忆形态太薄**：只能存一句话偏好，无法承载「投研分析过程」「投融资决策」这类结构化资产。
3. **术语未金融化**：分类是泛化的「投资目标/关注领域」，没有投研/投融资专属术语体系。
4. **召回太弱**：纯关键词匹配，无语义召回。
5. **无全局/局部两级记忆视图**。

---

## 2. 目标与范围

**目标**：把记忆升级为「**按 Agent 隔离、金融投研术语结构化、可语义检索、双入口（全局右侧栏 + Agent 详情页）的记忆系统**」。

**范围**：
- ✅ 记忆按 `agentId` 隔离（Agent 只能召回自己的记忆）。
- ✅ 金融投研术语化的记忆结构（投研全生命周期类型 + 投研术语字段 + 投融资习惯）。
- ✅ 全局记忆中枢（右侧栏，汇总所有 Agent 记忆）。
- ✅ 每个 Agent 详情页的专属记忆功能（左侧栏）。
- ✅ 语义召回（向量检索 + 关键词双路 + 术语结构化过滤）。
- ✅ 自动沉淀：Agent 对话/投研分析/投融资内容自动转成投研记忆文件。

---

## 3. 核心概念模型

```
User（用户）
  ├─ Agent A（id=agentA, threadId=tA）
  │     └─ Memory（agentId=agentA，仅 A 可见）
  ├─ Agent B（id=agentB, threadId=tB）
  │     └─ Memory（agentId=agentB，仅 B 可见）
  └─ MemoryHub（全局右侧栏）
        └─ 聚合 A + B 的所有记忆（只读汇总 + 治理入口）
```

- **记忆归属**：`agentId` 唯一决定记忆归属；来自 `agentSpaceSchema.agents[].id`。
- **隔离规则**：Agent 的 `recall_memory` 默认只召回 `agentId = 自己` 的记忆；全局侧栏可查看全部（治理视角）。

---

## 4. 记忆类型与术语体系（金融投研化）

### 4.1 记忆类型（kind）

记忆按**投研全生命周期**组织：**关注 → 研究 → 论点 → 决策 → 执行 → 复盘**，外加基础事实沉淀，形成个人投研记忆闭环。

| kind | 含义 | 触发/来源 | 示例 |
| --- | --- | --- | --- |
| `fact` | 事实/偏好/习惯 | 对话中用户确认 | "用户偏好左侧买入、分批建仓，单标的不超总仓位 20%" |
| `watch` | 自选/关注标的 | 用户添加自选、初筛讨论 | "开始跟踪 AI 算力链，重点关注 NVDA、AMD、台积电" |
| `thesis` | 投研论点（方向+目标价+催化剂） | 分析结论/评级观点 | "NVDA 因 AI 算力需求看多，目标价 200，催化剂 Q3 财报" |
| `analysis` | 分析过程/研究报告 | 完成的投研任务 | "美联储加息路径三情景推演（鹰派/中性/鸽派）" |
| `decision` | 投融资/交易决策 | 投融资谈判、交易决策 | "决定港股 IPO 前减持 20%，保留底仓跟踪弹性" |
| `trade` | 操作/成交记录 | 实际建仓/调仓/清仓 | "2026-11-06 以 180 建仓 NVDA 1000 股，止损 165，目标 210" |
| `mistake` | 复盘/教训 | 归因复盘、回撤检讨 | "追涨杀跌致组合回撤 12%，应严守止损纪律、分批建仓" |

> 旧 `category`（投资目标/风险偏好/关注领域/分析习惯）→ 映射：`category → fact` + `tags:[category]`；其中「关注领域」归为 `watch`。

### 4.2 投研术语字段（`financeTerms`）

记忆文件挂载结构化术语，供召回/筛选/分析复用：

```ts
interface FinanceTerms {
  // ── 标的维度 ──
  assetClass?: "股票" | "债券" | "基金" | "外汇" | "大宗商品" | "数字资产" | "RWA";
  market?: "US" | "CN" | "HK";            // 市场
  symbol?: string;                         // 标的代码（NVDA / 600519，写入时归一化）
  name?: string;                           // 标的名称（英伟达 / 贵州茅台）
  sector?: string;                         // 行业/板块（半导体 / 白酒 / 新能源）
  index?: string;                          // 关联指数（标普500 / 沪深300 / 恒指）

  // ── 研究维度 ──
  strategy?: string;                       // 策略：价值/成长/量化/事件驱动/套利…
  timeHorizon?: string;                    // 持仓周期：短线/波段/中长线/长期
  timeframe?: string;                      // 分析周期：日线/周线/月线
  rating?: "强烈看多" | "看多" | "中性" | "看空" | "强烈看空";  // 投研评级
  targetPrice?: string;                    // 目标价（含币种）
  valuation?: string;                      // 估值口径：DCF/PE/PB/PS/PEG/EV-EBITDA…
  thesisStatus?: "成立" | "待验证" | "不成立" | "已过期";       // 论点追踪状态

  // ── 市场与资金维度 ──
  capitalFlow?: string;                    // 资金面：北向/主力/龙虎榜…
  catalysts?: string[];                    // 催化剂：财报/业绩预告/分红/并购/政策…
  macroFactors?: string[];                 // 宏观变量：利率/CPI/PMI/汇率/政策…

  // ── 风险与组合维度 ──
  riskLevel?: "低" | "中" | "高";          // 风险偏好
  position?: "空仓" | "轻仓" | "半仓" | "重仓" | "满仓";        // 当前仓位
  stopLoss?: string;                       // 止损位
  takeProfit?: string;                     // 止盈位
  riskFactors?: string[];                  // 风险因素：竞争/政策/估值/流动性…
}
```

### 4.3 个人投融资习惯字段（`dealHabits`）

针对「投融资决策」记忆的固定习惯术语：

```ts
interface DealHabits {
  stage?: "发现" | "尽调" | "谈判" | "决策" | "交割" | "退出";  // 投融资阶段
  round?: string;                          // 轮次：天使/Pre-A/A/B/C/Pre-IPO/IPO
  counterparty?: string;                   // 参与方/对手方
  amount?: string;                         // 金额（含币种）
  valuation?: string;                      // 估值：投前/投后
  equity?: string;                         // 股权比例
  terms?: string;                          // 条款/结构：回购/优先清算/反稀释/对赌…
  decision?: string;                       // 最终决策
  rationale?: string;                      // 决策依据（含投研结论支撑）
}
```

### 4.4 投研术语表（关键词 → 结构化字段）

用于**召回、筛选、自动沉淀**时的术语识别：对话/分析文本命中关键词后，提取并写入对应结构化字段，随后由 Hindsight 语义检索与关键词双路召回。

| 维度 | 术语/关键词（示例） | 映射字段 |
| --- | --- | --- |
| 标的 | 股票/债券/基金/外汇/大宗商品/数字资产/RWA | `financeTerms.assetClass` |
| 市场 | 美股/A股/港股、US/CN/HK | `financeTerms.market` |
| 行业 | 半导体/白酒/新能源/AI 算力/医药… | `financeTerms.sector` |
| 持仓周期 | 短线/波段/中长线/长期 | `financeTerms.timeHorizon` |
| 分析周期 | 日线/周线/月线 | `financeTerms.timeframe` |
| 估值口径 | PE/PB/PS/PEG/DCF/EV-EBITDA、估值 | `financeTerms.valuation` |
| 评级观点 | 强烈看多/看多/中性/看空/强烈看空、买入/增持/减持 | `financeTerms.rating` |
| 目标价 | 目标价/TP/Target Price | `financeTerms.targetPrice` |
| 资金面 | 北向资金/主力资金/龙虎榜/成交量 | `financeTerms.capitalFlow` |
| 催化剂 | 财报/业绩预告/分红/拆股/并购/定增/政策 | `financeTerms.catalysts` |
| 宏观变量 | 加息/降息/利率/CPI/PPI/PMI/社融/汇率 | `financeTerms.macroFactors` |
| 仓位 | 空仓/轻仓/半仓/重仓/满仓、建仓/加仓/减仓/清仓 | `financeTerms.position` |
| 风险控制 | 止损/止盈/回撤 | `financeTerms.stopLoss` / `takeProfit` / `riskLevel` |
| 投融资阶段 | 发现/尽调/谈判/决策/交割/退出 | `dealHabits.stage` |
| 轮次 | 天使/Pre-A/A轮/B轮/C轮/Pre-IPO/IPO | `dealHabits.round` |
| 条款 | 回购/优先清算/反稀释/对赌 | `dealHabits.terms` |

---

## 5. 功能需求清单

### FR-1 记忆按 Agent 隔离（核心）

- 每条记忆新增 `agentId`（= `agentSpaceSchema.agents[].id`）。
- `remember_fact` 写入时，通过 `input.threadId → agent.id` 反查（复用 `agentModelForThread` 逻辑）自动带上 `agentId`。
- `recall_memory` 召回时只返回 `agentId = 当前 Agent` 的记忆。
- 旧数据（无 agentId）→ 迁移归到 `agentId = "default"`（system-agent）。

### FR-2 记忆自动沉淀（投研分析/投融资 → 投研记忆文件）

- Agent 完成任务（`succeeded`）、生成 `report` / `market_briefing` / `research_report` artifact 时，自动调用 `write_memory` 落一条结构化记忆，无需用户手动。
- 投研文本识别到评级/目标价/催化剂（如「看多 NVDA，目标价 200」）→ 自动落 `thesis`（带 `rating` / `targetPrice` / `sector` / `thesisStatus`）。
- 投研文本识别到建仓/加仓/减仓/清仓等操作 → 自动落 `trade`（带 `position` / `stopLoss` / `takeProfit`）。
- 投融资对话中识别到决策信号（阶段、金额、决策词）→ 自动落 `decision` 类型记忆（带 `dealHabits`）。
- 幂等：`id = sha256(agentId + kind + title)`，`insertIfAbsent` 去重。

### FR-3 右侧栏全局记忆（Memory Hub）

- **入口**：全局右侧栏（现有 `agent-side-drawer` / `sidebar-state` 框架）。
- **内容**：
  - 总览：记忆总数、按 Agent / kind 分布、最近更新。
  - 筛选：按 Agent、kind、标的（symbol/sector）、市场、评级、时间。
  - 搜索：全文 + 语义检索。
  - 详情：展开单条记忆全文。
  - 治理：编辑、删除、合并重复。
- **数据**：`GET /memory-hub` 返回聚合视图。

### FR-4 左侧栏 Agent 详情页专属记忆

- 每个 Agent 详情页新增「记忆」tab，展示**该 Agent 专属**记忆（`agentId = 该 Agent`）。
- 支持该 Agent 记忆的增删改查。
- 数据：`GET /agents/:agentId/memories`。

### FR-5 语义召回

- 记忆文本做 embedding，向量检索 + 关键词双路，RRF 融合。
- 术语感知：查询命中投研术语（如「美联储加息」「PE 估值」「TSLA」）时，额外按 `financeTerms` / `dealHabits` 结构化字段精确过滤（同标的归一化后匹配），提升召回精度。
- 召回结果带来源、类型、可信度，供 Agent 加权参考。

---

## 6. 非功能需求

- **可追溯**：每条记忆可反查来源 `taskId` / `threadId` / `artifactId`。
- **幂等**：自动沉淀不重复。
- **术语归一化**：同一标的多写法（NVDA / 英伟达 / Nvidia）在写入时归一到 `symbol`，评级/估值口径统一枚举，保证召回一致。
- **向后兼容**：旧记忆归 `default` agent，`category → fact + tags`。
- **性能**：10⁴~10⁵ 条量级聚合/召回流畅（依赖索引 + 向量检索）。
- **隐私**：投融资类记忆默认私有（`privacy = "user_only"`），跨 Agent 不自动共享。

---

## 7. 里程碑

| 阶段 | 内容 | 交付物 |
| --- | --- | --- |
| M1 数据模型 + 隔离 | `AgentMemoryV2` + `agentId` + 金融术语字段 + 迁移 | zod schema + 迁移脚本 |
| M2 自动沉淀 | `write_memory` + 任务完成钩子 + 投融资决策识别 | 沉淀管道 |
| M3 全局 + Agent 双入口 | `/memory-hub` + `/agents/:id/memories` + 前端两处 UI | 路由 + 组件 |
| M4 语义召回 | embedding + 向量检索 + RRF | 召回服务 |
| M5 治理 | 去重/过期/合并 | 治理任务 |
