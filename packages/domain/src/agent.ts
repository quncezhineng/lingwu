import { z } from "zod";

export type TaskStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "waiting_input"
  | "scheduled"
  | "paused"
  | "succeeded"
  | "failed"
  | "cancelled";
export interface Evidence {
  id: string;
  kind: "mail" | "file" | "web" | "user";
  title: string;
  excerpt: string;
  url?: string;
}
export interface TaskStep {
  id: string;
  title: string;
  status: "pending" | "running" | "succeeded" | "failed" | "waiting";
  detail?: string;
}
export interface AgentTask {
  id: string;
  title: string;
  prompt: string;
  kind: "agent" | "document" | "monitor" | "finance" | "plan" | "market_briefing" | "research";
  status: TaskStatus;
  /** 发起该任务的对话 threadId（对话内 delegate_task 创建的任务才有；独立入口创建的任务为空）。 */
  threadId?: string;
  goalId?: string;
  milestoneId?: string;
  plan: TaskStep[];
  evidence: Evidence[];
  input: Record<string, unknown>;
  state: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string;
  leaseId?: string | null;
  leaseUntil?: string | null;
  attempts: number;
  actionId?: string | null;
  result?: string;
  error?: string | null;
  question?: string;
  artifactIds: string[];
}
export interface RunEvent {
  id: string;
  taskId: string;
  date: string;
  kind: "plan" | "step" | "observation" | "approval" | "result" | "error" | "status";
  title: string;
  detail: string;
}
export interface Goal {
  id: string;
  title: string;
  description: string;
  category: string;
  status: "active" | "paused" | "completed";
  milestones: { id: string; title: string; done: boolean }[];
  createdAt: string;
}
export interface Monitor {
  id: string;
  taskId: string;
  title: string;
  /** 用户希望关注的内容；为空时回退到触发条件文案。 */
  description?: string;
  url: string;
  condition: "change" | "contains" | "price_below";
  value: string;
  intervalMinutes: number;
  /** interval 按分钟轮询；daily / weekly 在指定时间运行。 */
  schedule?: "interval" | "daily" | "weekly";
  /** Asia/Shanghai 时区的 HH:mm。 */
  timeOfDay?: string;
  /** 1=周一，7=周日；仅 weekly 使用。 */
  weekday?: number;
  status: "active" | "paused" | "stopped";
  nextCheckAt: string;
  lastCheckedAt?: string;
  lastValue?: string;
  lastHash?: string;
  error?: string;
  checks: number;
}
export interface Idea {
  id: string;
  title: string;
  reason: string;
  evidence: Evidence[];
  prompt: string;
  kind: AgentTask["kind"];
  input: Record<string, unknown>;
  status: "new" | "dismissed" | "accepted";
  taskId?: string;
  createdAt: string;
}
/** Demo 投资偏好页固定使用四类记忆，值直接作为稳定的持久化契约。 */
export const MEMORY_CATEGORIES = ["投资目标", "风险偏好", "关注领域", "分析习惯"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];
export const DEFAULT_MEMORY_CATEGORY: MemoryCategory = "投资目标";
export interface AgentMemory {
  id: string;
  text: string;
  source: string;
  createdAt: string;
  /** 旧版记忆没有分类；界面读取时回退到默认分类。 */
  category?: MemoryCategory;
  updatedAt?: string;
}
export interface AgentArtifact {
  id: string;
  taskId: string;
  kind: "plan" | "comparison" | "finance" | "report" | "market_briefing" | "research_report";
  title: string;
  summary: string;
  data: Record<string, unknown>;
  createdAt: string;
}
export interface AgentNotification {
  id: string;
  taskId?: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}
export type AgentTone = "formal" | "casual" | "playful" | "concise" | "warm" | "thoughtful";
export type AgentCommunication = "short" | "detailed" | "bullets";
export interface AgentIdentity {
  name: string;
  /** Set after the user explicitly edits the name so default-name aliases remain verbatim. */
  nameCustomized?: boolean;
  tagline?: string;
  tone: AgentTone;
  communication?: AgentCommunication;
  style?: string;
  userName?: string;
  avatar?: "avatar1" | "avatar2" | "avatar3" | "avatar4" | "avatar5" | "avatar6";
  showChatUpdates?: boolean;
}
export const defaultAgentName = "Xiao Wu";
export interface AgentWorkspace {
  tasks: AgentTask[];
  goals: Goal[];
  monitors: Monitor[];
  ideas: Idea[];
  memories: AgentMemory[];
  artifacts: AgentArtifact[];
  notifications: AgentNotification[];
  identity: AgentIdentity;
  worker: { running: boolean; lastTickAt?: string };
}
export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  prompt: z.string().trim().min(1).max(12000),
  kind: z
    .enum(["agent", "document", "monitor", "finance", "plan", "market_briefing", "research"])
    .default("agent"),
  goalId: z.string().optional(),
  milestoneId: z.string().min(1).max(200).optional(),
  input: z.record(z.string(), z.unknown()).default({}),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export const monitorInputSchema = z
  .object({
    title: z.string().min(1).max(160),
    description: z.string().trim().max(1000).default(""),
    url: z.url().max(4096),
    condition: z.enum(["change", "contains", "price_below"]).default("change"),
    value: z.string().max(300).default(""),
    intervalMinutes: z.number().int().min(1).max(10080).default(15),
    schedule: z.enum(["interval", "daily", "weekly"]).default("interval"),
    timeOfDay: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    weekday: z.number().int().min(1).max(7).optional(),
  })
  .superRefine((v, c) => {
    if (v.condition !== "change" && !v.value.trim())
      c.addIssue({ code: "custom", message: "Enter a condition value" });
    if (
      v.condition === "price_below" &&
      (!Number.isFinite(Number(v.value)) || Number(v.value) <= 0)
    )
      c.addIssue({ code: "custom", message: "Enter a positive price" });
    if (v.schedule !== "interval" && !v.timeOfDay)
      c.addIssue({ code: "custom", message: "Choose a reminder time" });
    if (v.schedule === "weekly" && !v.weekday)
      c.addIssue({ code: "custom", message: "Choose a weekday" });
  });
export const goalInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(4000).default(""),
  category: z.string().max(80).default("Personal"),
  milestones: z.array(z.string().min(1).max(200)).max(20).default([]),
});

// ─── 投研智能体数据模型 ───

/** 观察列表 */
export const watchlistSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  symbols: z.array(z.string()),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Watchlist = z.infer<typeof watchlistSchema>;

/** 标的元数据 */
export const symbolSchema = z.object({
  code: z.string(),
  name: z.string(),
  market: z.enum(["US", "CN", "HK"]),
  sector: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type Symbol = z.infer<typeof symbolSchema>;

/** 市场简报 */
export const marketBriefingSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  date: z.string().date(),
  summary: z.array(z.string()).min(3).max(5),
  content: z.string(),
  market_data: z.record(z.string(), z.any()),
  symbol_updates: z.record(z.string(), z.any()),
  events: z.array(z.any()),
  /** P0 does not yet ingest calendar/announcement events; clients must not treat [] as "no events today". */
  events_status: z.enum(["not_implemented", "available"]).default("not_implemented"),
  events_note: z.string().optional(),
  /** "partial" means at least one index or watchlist symbol was unavailable when the briefing was generated. */
  data_status: z.enum(["complete", "partial"]).default("complete"),
  unavailable: z.array(z.string()).default([]),
  generated_at: z.string().datetime(),
});
export type MarketBriefing = z.infer<typeof marketBriefingSchema>;

/** 研究报告 */
export const researchReportSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  symbol_code: z.string(),
  title: z.string(),
  sections: z.object({
    company_overview: z.string(),
    financials: z.record(z.string(), z.any()),
    news: z.array(z.any()),
    peer_comparison: z.array(z.any()),
    valuation: z.record(z.string(), z.any()),
    risks: z.array(z.string()),
  }),
  pdf_url: z.string().optional(),
  generated_at: z.string().datetime(),
});
export type ResearchReport = z.infer<typeof researchReportSchema>;

/** 价格提醒 */
export const priceAlertSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  symbol_code: z.string(),
  threshold_type: z.enum(["PRICE_ABOVE", "PRICE_BELOW", "CHANGE_PCT"]),
  threshold_value: z.number(),
  enabled: z.boolean().default(true),
  created_at: z.string().datetime(),
});
export type PriceAlert = z.infer<typeof priceAlertSchema>;

// ─── P1 组合、持仓、笔记 ───

export const CURRENCY_CODES = ["CNY", "USD", "HKD"] as const;

/** 投资组合。base_currency 只用于展示口径；P1 不做汇率折算。 */
export const portfolioSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  name: z.string().min(1).max(100),
  base_currency: z.enum(CURRENCY_CODES).default("CNY"),
  /** 基准：CSI300 / SPX 等，缺省按 base_currency 推导。 */
  benchmark: z.string().max(32).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Portfolio = z.infer<typeof portfolioSchema>;

/** 持仓。quantity/avg_cost 均为原币数值。 */
export const holdingSchema = z.object({
  id: z.string().uuid(),
  portfolio_id: z.string().uuid(),
  symbol_code: z.string(),
  name: z.string().max(200).optional(),
  market: z.enum(["US", "CN", "HK"]),
  sector: z.string().max(100).optional(),
  currency: z.enum(CURRENCY_CODES),
  quantity: z.number().finite().positive(),
  avg_cost: z.number().finite().nonnegative(),
  /** 建仓日期 YYYY-MM-DD。手工录入可省略（默认当天），CSV 导入必填。 */
  buy_date: z.string().date().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Holding = z.infer<typeof holdingSchema>;

/** 论点检验结果。source=manual 表示用户确认，自动周检不得覆盖。 */
export const noteCheckSchema = z.object({
  outcome: z.enum(["valid", "invalid", "inconclusive", "pending_confirmation"]),
  source: z.enum(["automated", "manual"]),
  checked_at: z.string().datetime(),
  note: z.string().max(500).optional(),
});
export type NoteCheck = z.infer<typeof noteCheckSchema>;

/** 投资笔记 / 论点 */
export const investmentNoteSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  symbol_code: z.string(),
  type: z.enum(["BUY_REASON", "SELL_REASON", "RESEARCH", "THESIS"]),
  /** Optional short title (≤80 chars); lists fall back to the content's first line. */
  title: z.string().max(80).optional(),
  content: z.string().min(1).max(20000),
  /** 论点状态；仅 THESIS 类型使用。 */
  status: z.enum(["ACTIVE", "VALIDATED", "INVALIDATED", "EXPIRED"]).optional(),
  /** 最近一次检验；无模型时 outcome=pending_confirmation，绝不伪造结论。 */
  check: noteCheckSchema.optional(),
  last_checked_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type InvestmentNote = z.infer<typeof investmentNoteSchema>;
