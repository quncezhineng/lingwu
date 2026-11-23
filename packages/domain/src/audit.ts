import { z } from "zod";

/**
 * 动作审计日志（PRD R6 隐私/审计）。
 *
 * 与事件判级留痕同一思路：agent 做过的每一件"改变了你账户里东西"的事，都要能
 * 回答三个问题——做了什么、依据是什么、我现在能不能撤。所以每条记录只描述
 * 一个已完成或已提交的动作，不写过程噪音（过程在 run-events / task.events 里）。
 *
 * 存储上用一条 `agent_action_log` 记录承载，字段刻意扁平，方便按标的、类型、
 * 时间直接筛，不需要 join。
 */

export const AGENT_ACTION_KINDS = ["task", "plan", "alert", "thesis", "note", "connector"] as const;
export type AgentActionKind = (typeof AGENT_ACTION_KINDS)[number];

export const AGENT_ACTION_LABELS: Record<AgentActionKind, string> = {
  task: "托管任务",
  plan: "跟踪计划",
  alert: "价格提醒",
  thesis: "投资论点",
  note: "笔记",
  connector: "外部系统",
};

/** ok=已生效；pending=等确认/等执行；failed=执行失败；revoked=已被用户撤销。 */
export type AgentActionOutcome = "ok" | "pending" | "failed" | "revoked";

export type AgentActionActor = "assistant" | "user" | "worker";

export interface AgentActionTarget {
  /** 标的代码，便于"这只票 agent 动过什么"直接筛。 */
  symbol?: string;
  /** 连接器 / 外部系统标识。 */
  connector?: string;
  /** 目标对象的人类可读名（文档名、报告名）。 */
  resource?: string;
}

/** 撤销时要找回的对象 id。 */
export interface AgentActionRefs {
  taskId?: string;
  alertId?: string;
  noteId?: string;
  planId?: string;
  artifactId?: string;
}

export interface AgentActionLogEntry {
  id: string;
  /** 发生时间（ISO）。 */
  at: string;
  kind: AgentActionKind;
  /** 一句话说清做了什么，可直接展示给人看。 */
  action: string;
  actor: AgentActionActor;
  outcome: AgentActionOutcome;
  /** 是否支持撤销；不支持时界面上不给撤销按钮，避免点了没反应。 */
  revocable: boolean;
  revokedAt?: string;
  /** 撤销结果的说明（成功或为什么不能撤）。 */
  revokeNote?: string;
  target?: AgentActionTarget;
  refs?: AgentActionRefs;
  /** 依据/原因，留痕用；与事件判级的 reasons 一样写人话。 */
  detail?: string;
  threadId?: string;
  /** 幂等键：同一动作重复记录只留一条。 */
  key?: string;
}

export const agentActionQuerySchema = z.object({
  kind: z.enum(AGENT_ACTION_KINDS).optional(),
  symbol: z.string().trim().max(24).optional(),
  actor: z.enum(["assistant", "user", "worker"]).optional(),
  /** 默认不含已撤销的条目。 */
  includeRevoked: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type AgentActionQuery = z.infer<typeof agentActionQuerySchema>;
