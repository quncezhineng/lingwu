import type { AgentTask } from "../../../packages/domain/src/agent.ts";

/**
 * 任务仍在后台推进（未进入终态）的状态集合。
 * 只把「真的还在跑 / 等待输入」算作分析中；scheduled / paused 不在此列。
 */
export const TASK_ANALYSIS_ACTIVE: ReadonlySet<AgentTask["status"]> = new Set([
  "queued",
  "running",
  "waiting_approval",
  "waiting_input",
]);

/** 提取任务步骤里的已完成 / 总数；没有步骤时返回 null（不展示进度）。 */
export function taskStepCount(task: AgentTask): { done: number; total: number } | null {
  if (!task.plan || task.plan.length === 0) return null;
  return {
    done: task.plan.filter((step) => step.status === "succeeded").length,
    total: task.plan.length,
  };
}
