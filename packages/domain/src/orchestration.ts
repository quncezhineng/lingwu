import { z } from "zod";

/**
 * 多 Agent 编排（M2）。
 *
 * 一个顶层「投研任务」被拆解为一张有向无环图（DAG），每个节点是一个子任务，
 * 派给不同专家 Agent（复用 agent-space 的模板枚举）执行。编排者负责拆解、依赖
 * 调度与汇总，用户只跟编排者对话，无需关心背后有多少 Agent。
 *
 * 与 openbot 的对照：openbot 的「任务 owner + 显式委托 + 共享历史」在此映射为
 * `parentTaskId`（归属）与 `dependsOn`（依赖边）。
 */

/** 子任务节点在 DAG 中的状态。 */
export type OrchestrationNodeStatus =
  | "pending" // 依赖未满足，等待上游
  | "queued" // 依赖已满足，已生成子任务待 worker 领取
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"; // 因上游失败而跳过

/** 编排计划的整体状态。 */
export type OrchestrationPlanStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

/** DAG 中的一个子任务节点。 */
export interface OrchestrationNode {
  id: string;
  /** 落盘后的子任务 id（submit 后回填）。 */
  taskId?: string;
  /** 执行方 Agent 模板（与 agent-space 的 template 枚举一致）。 */
  agentTemplate: string;
  title: string;
  prompt: string;
  /** 依赖的节点 id（DAG 边）。 */
  dependsOn: string[];
  status: OrchestrationNodeStatus;
  result?: string;
  error?: string;
  /** 子任务产出的产物 id（终态后回填，供汇总 Agent 聚合共享工作区）。 */
  artifactIds?: string[];
}

/** 编排计划：顶层投研任务如何拆成多个子任务。 */
export interface OrchestrationPlan {
  id: string;
  /** 顶层投研任务 id（触发编排的那条 AgentTask）。 */
  parentTaskId: string;
  nodes: OrchestrationNode[];
  status: OrchestrationPlanStatus;
  /** 汇总结果（finalize 后回填）。 */
  result?: string;
  createdAt: string;
  updatedAt: string;
}

/** 节点状态 → 是否为终态。 */
export const NODE_TERMINAL: ReadonlySet<OrchestrationNodeStatus> = new Set([
  "succeeded",
  "failed",
  "skipped",
]);

/** 计划状态 → 是否为终态。 */
export const PLAN_TERMINAL: ReadonlySet<OrchestrationPlanStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
]);

/**
 * 强制编排标记（M2）。频道发起的多 Agent 投研请求在 prompt 开头内嵌此标记，
 * 服务端 executeModelTask 检测到后，把顶层任务切换为「必须第一步调用
 * submit_orchestration」的强约束，避免模型自行串行完成而绕过编排。
 */
export const ORCHESTRATION_REQUIRED_MARKER = "[ORCHESTRATION_REQUIRED]";

/** 创建编排计划入参。 */
export const orchestrationPlanInputSchema = z.object({
  parentTaskId: z.string().min(1).max(128),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        // 兼容两种语义：模板枚举值（research/market/...）或频道成员的 Agent id/threadId
        // （UUID 36 字符）。成员 id 由 identifier（max 128）约束，这里放宽到 128 对齐。
        agentTemplate: z.string().min(1).max(128),
        title: z.string().trim().min(1).max(160),
        prompt: z.string().trim().min(1).max(2000),
        dependsOn: z.array(z.string().min(1).max(128)).max(50).default([]),
      }),
    )
    .min(1)
    .max(50),
});
export type OrchestrationPlanInput = z.infer<typeof orchestrationPlanInputSchema>;

/** 校验 DAG 合法性（无自环、依赖引用存在、无环）。非法抛 Error。 */
export function assertAcyclic(input: OrchestrationPlanInput): void {
  const ids = new Set(input.nodes.map((n) => n.id));
  for (const node of input.nodes) {
    if (node.dependsOn.includes(node.id)) {
      throw new Error(`Node "${node.id}" cannot depend on itself`);
    }
    for (const dep of node.dependsOn) {
      if (!ids.has(dep)) {
        throw new Error(`Node "${node.id}" references unknown dependency "${dep}"`);
      }
    }
  }
  // 拓扑排序检测环：Kahn 算法。
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of input.nodes) {
    indegree.set(node.id, node.dependsOn.length);
    for (const dep of node.dependsOn) {
      const list = outgoing.get(dep) ?? [];
      list.push(node.id);
      outgoing.set(dep, list);
    }
  }
  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    if (!id) break;
    visited++;
    for (const next of outgoing.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (visited !== input.nodes.length) {
    throw new Error("Orchestration plan contains a cycle");
  }
}
