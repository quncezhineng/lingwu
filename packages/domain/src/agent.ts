import { z } from "zod";
import { CURRENCY_CODES, type MonitorCurrency } from "./monitor-currency.ts";

export { CURRENCY_CODES, type MonitorCurrency } from "./monitor-currency.ts";

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
  milestones: { id: string; title: string; done: boolean; completedAt?: string }[];
  createdAt: string;
}
export interface Monitor {
  id: string;
  taskId: string;
  /** Optional goal context. A reminder remains a Monitor; this only groups it in the UI. */
  goalId?: string;
  milestoneId?: string;
  title: string;
  /** 用户希望关注的内容；为空时回退到触发条件文案。 */
  description?: string;
  url: string;
  condition: "change" | "contains" | "price_below";
  value: string;
  /** Currency of the threshold; no FX conversion is performed. Optional for legacy rules. */
  currency?: MonitorCurrency;
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
/** Demo 投资偏好页固定使用多类记忆，值直接作为稳定的持久化契约。 */
export const MEMORY_CATEGORIES = [
  "投资目标",
  "风险偏好",
  "关注领域",
  "分析习惯",
  "关注标的",
  "复盘教训",
] as const;
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

// ─── 多 Agent 记忆系统（M1）───

/** 记忆类型：事实 / 投研论点 / 分析过程 / 投融资决策。 */
export type MemoryKind = "fact" | "thesis" | "analysis" | "decision";

/** 投研术语：结构化字段，供召回 / 筛选 / 分析复用。 */
export interface FinanceTerms {
  assetClass?: "股票" | "债券" | "基金" | "外汇" | "大宗商品" | "数字资产" | "RWA";
  market?: "US" | "CN" | "HK";
  symbol?: string;
  sector?: string;
  strategy?: string;
  timeHorizon?: string;
  valuation?: string;
  riskLevel?: "低" | "中" | "高";
}

/** 个人投融资习惯：针对「投融资决策」记忆的固定术语。 */
export interface DealHabits {
  stage?: "发现" | "尽调" | "谈判" | "决策" | "交割" | "退出";
  counterparty?: string;
  amount?: string;
  terms?: string;
  decision?: string;
  rationale?: string;
}

/**
 * 多 Agent 记忆文件。相比旧 `AgentMemory`，新增：
 *   - agentId：归属 Agent（= agentSpaceSchema.agents[].id），旧数据回退 "default"
 *   - kind：记忆类型（fact/thesis/analysis/decision），旧 category 映射到 fact
 *   - financeTerms / dealHabits：金融投研 / 投融资结构化术语
 * 旧 `AgentMemory` 字段（text/source/category）继续保留以兼容存量数据与现有 UI。
 */
export interface AgentMemoryV2 extends AgentMemory {
  agentId: string;
  kind: MemoryKind;
  /** 正文（分析过程 / 投融资详情，Markdown）。 */
  body?: string;
  financeTerms?: FinanceTerms;
  dealHabits?: DealHabits;
  tags?: string[];
  privacy?: "user_only" | "agent";
  taskId?: string;
  threadId?: string;
  artifactId?: string;
}
export interface AgentArtifact {
  id: string;
  taskId: string;
  kind: "plan" | "comparison" | "finance" | "report" | "market_briefing" | "research_report";
  title: string;
  /** 报告全文。对话里的短摘要在 data.chatBrief，不从这里截取。 */
  summary: string;
  data: Record<string, unknown>;
  createdAt: string;
}

/** 模型为对话写的短摘要。没有这份字段时，界面应去请求生成，而不是截取 summary。 */
export function artifactChatBrief(data: Record<string, unknown> | undefined): string {
  const value = data?.chatBrief;
  return typeof value === "string" ? value.trim() : "";
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
    currency: z.enum(CURRENCY_CODES).optional(),
    intervalMinutes: z.number().int().min(1).max(10080).default(15),
    schedule: z.enum(["interval", "daily", "weekly"]).default("interval"),
    timeOfDay: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    weekday: z.number().int().min(1).max(7).optional(),
    goalId: z.string().min(1).max(200).nullable().optional(),
    milestoneId: z.string().min(1).max(200).nullable().optional(),
  })
  .superRefine((v, c) => {
    if (v.goalId === null && v.milestoneId)
      c.addIssue({ code: "custom", message: "A milestone requires a goal", path: ["milestoneId"] });
    if (v.milestoneId && !v.goalId)
      c.addIssue({ code: "custom", message: "A milestone requires a goal", path: ["milestoneId"] });
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

/** 论点证据：必须可点开、可复核；fetched_at 记录抓取时间，healthy 由链接巡检维护。 */
export const thesisEvidenceSchema = z.object({
  id: z.string().min(1).max(64),
  url: z.string().url().max(1000),
  published_at: z.string().date().optional(),
  /** 证据中的关键数字或原文短句，便于日后比对。 */
  quote_number: z.string().max(120).optional(),
  fetched_at: z.string().datetime(),
  healthy: z.boolean().default(true),
});
export type ThesisEvidence = z.infer<typeof thesisEvidenceSchema>;

/** 论点的证伪条件，后续可映射为监控规则（OPT-01 的 L4）。 */
export const thesisFalsifyConditionSchema = z.object({
  kind: z.enum(["PRICE_ABOVE", "PRICE_BELOW", "CHANGE_PCT", "CUSTOM"]),
  expression: z.string().trim().min(1).max(200),
});
export type ThesisFalsifyCondition = z.infer<typeof thesisFalsifyConditionSchema>;

export const thesisHorizonSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
});
export type ThesisHorizon = z.infer<typeof thesisHorizonSchema>;

/** 论点状态变更留痕；自动检验只能建议，source=user 才代表状态真的变了。 */
export const thesisStatusChangeSchema = z.object({
  from: z.enum(["ACTIVE", "VALIDATED", "INVALIDATED", "EXPIRED"]).optional(),
  to: z.enum(["ACTIVE", "VALIDATED", "INVALIDATED", "EXPIRED"]),
  at: z.string().datetime(),
  source: z.enum(["user", "automated"]),
});
export type ThesisStatusChange = z.infer<typeof thesisStatusChangeSchema>;

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
  /** 论点证据（仅 THESIS 使用）。 */
  evidence: z.array(thesisEvidenceSchema).max(10).optional(),
  falsify_condition: thesisFalsifyConditionSchema.optional(),
  horizon: thesisHorizonSchema.optional(),
  /** 0–1；不做百分比换算，保持可聚合。 */
  confidence: z.number().min(0).max(1).optional(),
  /** 仅记录人工确认的状态变化，用于「上次的判断后来怎样」。 */
  status_history: z.array(thesisStatusChangeSchema).max(50).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type InvestmentNote = z.infer<typeof investmentNoteSchema>;

/* ------------------------------------------------------------------ *
 * OPT-01 事件监控：规则、事件、投递与打扰预算
 * ------------------------------------------------------------------ */

export type MonitorMarket = "CN" | "HK" | "US";
export type MonitorTargetType = "symbol" | "portfolio" | "thesis" | "page";
export type MonitorEventKind =
  | "PRICE_MOVE"
  | "EARNINGS"
  | "ANNOUNCEMENT"
  | "DIVIDEND"
  | "HALT"
  | "RATING_CHANGE"
  | "NEWS"
  | "THESIS_SIGNAL"
  | "PAGE_CHANGE";
/** 打扰级别：必须知道 / 可以稍后 / 只归档。预算只消耗 MUST_KNOW。 */
export type MonitorLevel = "MUST_KNOW" | "LATER" | "ARCHIVE";
export type MonitorDeliveryChannel = "in_app" | "webhook";

export interface MonitorPriceCondition {
  threshold_type: "PRICE_ABOVE" | "PRICE_BELOW" | "CHANGE_PCT";
  threshold_value: number;
}

export interface MonitorQuietHours {
  /** 用户本地时间 HH:mm，默认 22:00–07:00。 */
  start: string;
  end: string;
  time_zone: string;
}

/** 一条「盯」规则。target_type=thesis 时即 OPT-02 证伪条件对应的 L4 规则。 */
export interface MonitorRule {
  id: string;
  user_id: string;
  name?: string;
  target_type: MonitorTargetType;
  target_id: string;
  market: MonitorMarket;
  event_kinds: MonitorEventKind[];
  level: MonitorLevel;
  cooldown_minutes: number;
  /** L1 行情轮询间隔（分钟）。事件源推送不受此字段影响。 */
  interval_minutes: number;
  enabled: boolean;
  channels: MonitorDeliveryChannel[];
  webhook_url?: string;
  quiet_hours?: MonitorQuietHours;
  price?: MonitorPriceCondition;
  created_at: string;
  updated_at: string;
  last_checked_at?: string;
  last_error?: string;
  /** 规则连续被标记「不必要」后自动降频/停用时的说明。 */
  disabled_reason?: string;
}

export type MonitorEventState = "new" | "delivered" | "archived" | "dismissed" | "downgraded";

export interface MonitorEvent {
  id: string;
  user_id: string;
  rule_id: string;
  rule_name?: string;
  kind: MonitorEventKind;
  /** 规则配置的原始级别。 */
  original_level: MonitorLevel;
  /** 经过预算/静默期后的实际级别。 */
  level: MonitorLevel;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  dedupe_key: string;
  detected_at: string;
  market_date: string;
  state: MonitorEventState;
  reason?: string;
  notification_id?: string;
  delivered_at?: string;
  /** 超出预算被降级时，汇总投递时间（本地 19:00）。 */
  digest_at?: string;
  updated_at: string;
}

export interface MonitorDeliveryLog {
  id: string;
  user_id: string;
  event_id: string;
  channel: MonitorDeliveryChannel;
  sent_at: string;
  provider_id?: string;
  result: "sent" | "failed" | "skipped";
  detail?: string;
}

export interface AttentionBudget {
  id: string;
  user_id: string;
  /** 用户本地日期 YYYY-MM-DD。 */
  date: string;
  limit: number;
  used: number;
  downgraded_count: number;
  updated_at: string;
}

export interface MonitorToday {
  date: string;
  budget: AttentionBudget;
  must_know: MonitorEvent[];
  later: MonitorEvent[];
  archive: MonitorEvent[];
  rules: MonitorRule[];
}

/* ------------------------------------------------------------------ *
 * OPT-04 / OPT-05 交付物中心与溯源合规门
 * ------------------------------------------------------------------ */

export type DeliverableKind =
  | "BRIEFING"
  | "REPORT"
  | "MINUTES"
  | "ONE_PAGER"
  | "REVIEW"
  | "TABLE"
  | "CUSTOM";

/** 默认 draft；sent 只能由人触发，且必须先经过合规门。 */
export type DeliverableStatus = "draft" | "in_review" | "approved" | "sent" | "archived";

/** 数字级出处的解析状态。estimate 表示用户明确标注为估算。 */
export type DeliverableNumberStatus = "sourced" | "unsourced" | "estimate" | "removed";

export interface DeliverableCitation {
  id: string;
  /** 被引用的数字原文，例如 "30%"、"1.2 亿"。 */
  number_text: string;
  source_url: string;
  /** 出处原文片段，点开即可复核。 */
  excerpt: string;
  fetched_at: string;
}

export interface DeliverableNumberRef {
  id: string;
  text: string;
  /** 在当前版本正文中的字符位置；用于无源数字的定向处理。 */
  start: number;
  end: number;
  status: DeliverableNumberStatus;
  citation_id?: string;
  /** 该数字是否出现在最新版本正文中；删除数字后旧引用保留为 false。 */
  present: boolean;
}

export interface DeliverableSourceLink {
  type: "task" | "briefing" | "symbol" | "thesis" | "note" | "artifact" | "deliverable" | "url";
  id: string;
  label?: string;
  url?: string;
}

export interface DeliverableVersion {
  id: string;
  version: number;
  title: string;
  content: string;
  author: "agent" | "user" | "system";
  summary: string;
  created_at: string;
}

export interface DeliverableAuditEntry {
  id: string;
  at: string;
  actor: "agent" | "user" | "system";
  action: string;
  detail?: string;
  version?: number;
}

export interface DeliverableViolation {
  code: string;
  label: string;
  excerpt: string;
}

export interface DeliverablePiiFinding {
  code: string;
  label: string;
  excerpt: string;
  redacted: string;
}

export interface DeliverableComplianceReport {
  checked_at: string;
  duration_ms: number;
  passed: boolean;
  disclaimer: string;
  disclaimer_missing: boolean;
  violations: DeliverableViolation[];
  pii: DeliverablePiiFinding[];
  unsourced_numbers: string[];
  /** 规则库已执行；模型复核未配置时如实标注，不伪造双检通过。 */
  rule_engine: "ok";
  model_review: "not_configured";
}

export interface DeliverableDiff {
  from_version: number;
  to_version: number;
  added: string[];
  removed: string[];
  changed: boolean;
}

export interface Deliverable {
  id: string;
  user_id: string;
  kind: DeliverableKind;
  title: string;
  /** 最新版本正文；版本历史保留在 versions。 */
  content: string;
  status: DeliverableStatus;
  version: number;
  citations: DeliverableCitation[];
  numbers: DeliverableNumberRef[];
  versions: DeliverableVersion[];
  source_links: DeliverableSourceLink[];
  /** 生成时命中的用户模板；配合 template_version 可追溯历史口径。 */
  template_id?: string;
  template_version?: string;
  disclaimer: string;
  recipient?: string;
  last_compliance?: DeliverableComplianceReport;
  approved_at?: string;
  approved_by?: string;
  sent_at?: string;
  sent_version?: number;
  /** 与生成该交付物的任务 / 简报 / 论点 / 纪要的回链。 */
  created_from?: DeliverableSourceLink;
  audit: DeliverableAuditEntry[];
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ *
 * OPT-03 我的模板：从产出反推口径
 * ------------------------------------------------------------------ */

export interface TemplateSection {
  id: string;
  title: string;
  order: number;
  required: boolean;
  instructions?: string;
}

export interface TemplateField {
  id: string;
  label: string;
  required: boolean;
  unit?: string;
}

export interface TemplateVoice {
  tone: "formal" | "direct" | "concise";
  language: "zh" | "en" | "mixed";
  units: string[];
  conventions: string[];
}

export interface TemplateCounterexample {
  id: string;
  text: string;
  reason: "removed" | "rewritten";
  preferred?: string;
}

export interface TemplateVersion {
  id: string;
  version: number;
  name: string;
  description: string;
  structure: TemplateSection[];
  fields: TemplateField[];
  voice: TemplateVoice;
  counterexamples: TemplateCounterexample[];
  summary: string;
  created_at: string;
}

/** 一次模板复用；同一交付物重复保存只更新最后一条记录。 */
export interface TemplateUsageRecord {
  deliverable_id: string;
  version: number;
  edit_ratio: number;
  edited_chars: number;
  total_chars: number;
  at: string;
}

export interface TemplateMetrics {
  reuse_count: number;
  first_edit_ratio?: number;
  latest_edit_ratio?: number;
  /** 复用后人工改动超过 30%，提示口径可能不清晰。 */
  needs_clarification: boolean;
  match_total: number;
  accepted: number;
  rejections: number;
  /** accepted / (accepted + rejections)；没有反馈时为 1。 */
  match_accuracy: number;
}

export interface UserTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string;
  kind: DeliverableKind;
  version: number;
  structure: TemplateSection[];
  fields: TemplateField[];
  voice: TemplateVoice;
  counterexamples: TemplateCounterexample[];
  /** 从产出反推时保留的正文样例，用于「用这个模板」预填与改动率计算。 */
  sample_content: string;
  created_from?: DeliverableSourceLink;
  versions: TemplateVersion[];
  usage: TemplateUsageRecord[];
  metrics: TemplateMetrics;
  shared: boolean;
  shared_at?: string;
  /** 内置能力单独展示，用户模板永远为 false。 */
  built_in: false;
  created_at: string;
  updated_at: string;
}

export interface TemplateMatch {
  template_id: string;
  name: string;
  version: number;
  score: number;
  reasons: string[];
  sample_content: string;
  metrics: TemplateMetrics;
}
