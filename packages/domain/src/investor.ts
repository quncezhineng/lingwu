import { z } from "zod";

/**
 * 个人投研智能体的「闭环」领域模型（对应 PRD-灵悟-个人投研智能体-8P进化 R2/R3/R4）。
 *
 * 三块数据结构刻意保持"可溯源、可降级"：
 *   - EventFeedItem：事件判级留痕，push/feed/silent 都能回放判级依据。
 *   - TrackingPlan：研报派生的跟踪计划，未确认前是 draft，落地后才变成监控与论点。
 *   - ThesisSignal / ThesisVerdict：论点必须绑证据才判定，缺数据就明说缺数据。
 */

// ─── 降噪偏好 ───

/** 用户点过「这类少推点」之后的冷却项。 */
export interface InvestorMutedTopic {
  /** 事件类型，或 "price" 这类聚合桶。 */
  topic: string;
  label: string;
  until: string;
  reason: "user_feedback" | "manual";
}

// ─── 事件流与两级判级 ───

export const EVENT_TYPES = [
  "price_move",
  "price_level",
  "thesis_risk",
  "earnings",
  "news",
  "announcement",
  "valuation",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  price_move: "价格异动",
  price_level: "价格阈值",
  thesis_risk: "论点受威胁",
  earnings: "财报/业绩",
  news: "新闻",
  announcement: "公告",
  valuation: "估值变化",
};

/** push=值得打扰；feed=进信息流；silent=只记日志。 */
export type EventDecision = "push" | "feed" | "silent";

/** 一级规则过滤的结论；passed 才进入二级判级。 */
export type EventPrefilter = "passed" | "not_relevant" | "muted" | "below_floor" | "duplicate";

export interface EventFeedItem {
  id: string;
  type: EventType;
  symbol: string;
  title: string;
  body: string;
  decision: EventDecision;
  /** 二级判级打分（0..100），silent 事件也保留分值便于回溯。 */
  score: number;
  level1: EventPrefilter;
  /** 判级依据，按人话写，前端可直接展示"为什么推/为什么不推"。 */
  reasons: string[];
  /**
   * 这条结论是谁给的：规则打分、轻量模型，还是模型失败后的规则兜底。
   * 老数据没有这个字段，一律按 rules 读。
   */
  judgedBy?: "rules" | "model" | "rules_fallback";
  /** 判级用的模型（judgedBy=model 时才有）。 */
  judgeModel?: string;
  /** 另一种判法的结论，只留痕不生效，用来对比推送接收率。 */
  shadow?: {
    source: "rules" | "model" | "rules_fallback";
    decision: EventDecision;
    score: number;
  };
  dedupeKey: string;
  source?: string;
  url?: string;
  occurredAt: string;
  createdAt: string;
  read: boolean;
  feedback?: "less" | "more";
  notificationId?: string;
}

export const eventCandidateSchema = z.object({
  type: z.enum(EVENT_TYPES),
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^[A-Za-z0-9^=.-]+$/, "Invalid symbol"),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(4000).default(""),
  /** 价格异动幅度（绝对百分比）。 */
  magnitudePercent: z.number().finite().nonnegative().max(1000).optional(),
  /** 阈值触发时的目标价/幅度。 */
  thresholdValue: z.number().finite().optional(),
  /** 距离事件发生还有几天（财报日等）；已发生填 0。 */
  daysUntil: z.number().int().min(-365).max(365).optional(),
  source: z.string().trim().max(80).optional(),
  url: z.string().trim().max(2048).optional(),
  occurredAt: z.string().trim().max(40).optional(),
});

export type EventCandidateInput = z.infer<typeof eventCandidateSchema>;

export const feedFeedbackSchema = z.object({
  vote: z.enum(["less", "more"]),
  /** 可选：只针对某个事件类型降噪，缺省用事件自身类型。 */
  scope: z.enum(EVENT_TYPES).optional(),
});

export type FeedFeedbackInput = z.infer<typeof feedFeedbackSchema>;

// ─── 研报 → 跟踪计划 ───

export type TrackingItemKind = "assumption" | "metric" | "catalyst" | "valuation";

export interface TrackingPlanItem {
  kind: TrackingItemKind;
  text: string;
  /** 该条目来自研报的哪一段，便于溯源。 */
  source: string;
  /** derived=研报里有明确依据；placeholder=占位待补，不当作结论。 */
  confidence: "derived" | "placeholder";
}

export interface SuggestedMonitor {
  title: string;
  condition: "price_below" | "price_above";
  value: string;
  currency?: string;
  intervalMinutes: number;
  rationale: string;
}

export interface TrackingPlan {
  id: string;
  symbol: string;
  name?: string;
  reportId: string;
  createdAt: string;
  status: "draft" | "active";
  items: TrackingPlanItem[];
  suggestedMonitors: SuggestedMonitor[];
  thesisDraft: string;
  caveats: string[];
  /** 落地结果：创建的价格提醒与论点笔记。 */
  materialized?: { alertIds: string[]; noteIds: string[]; at: string };
}

// ─── 论点证据与自动判定 ───

/**
 * 一条可观测信号。语义统一为「这个条件成立 = 论点仍然成立」：
 *   - price: 价格在 threshold 之上/之下
 *   - change_pct: 涨跌幅达到某方向幅度
 *   - keyword: 新闻标题里出现/不出现关键词
 *   - financial: 某个财务字段满足阈值
 */
export type SignalBreach = "invalid" | "threat";

export type ThesisSignal =
  | {
      kind: "price";
      direction: "above" | "below";
      value: number;
      currency?: string;
      label?: string;
      onBreach?: SignalBreach;
    }
  | {
      kind: "change_pct";
      direction: "up" | "down";
      value: number;
      label?: string;
      onBreach?: SignalBreach;
    }
  | {
      kind: "keyword";
      keywords: string[];
      expect: "present" | "absent";
      label?: string;
      onBreach?: SignalBreach;
    }
  | {
      kind: "financial";
      field: string;
      operator: ">=" | "<=" | "==";
      value: number;
      label?: string;
      onBreach?: SignalBreach;
    };

export const thesisSignalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("price"),
    direction: z.enum(["above", "below"]),
    value: z.number().finite(),
    currency: z.string().trim().max(8).optional(),
    label: z.string().trim().max(60).optional(),
    onBreach: z.enum(["invalid", "threat"]).optional(),
  }),
  z.object({
    kind: z.literal("change_pct"),
    direction: z.enum(["up", "down"]),
    value: z.number().finite().nonnegative(),
    label: z.string().trim().max(60).optional(),
    onBreach: z.enum(["invalid", "threat"]).optional(),
  }),
  z.object({
    kind: z.literal("keyword"),
    keywords: z.array(z.string().trim().min(1).max(30)).min(1).max(10),
    expect: z.enum(["present", "absent"]),
    label: z.string().trim().max(60).optional(),
    onBreach: z.enum(["invalid", "threat"]).optional(),
  }),
  z.object({
    kind: z.literal("financial"),
    field: z.string().trim().min(1).max(40),
    operator: z.enum([">=", "<=", "=="]),
    value: z.number().finite(),
    label: z.string().trim().max(60).optional(),
    onBreach: z.enum(["invalid", "threat"]).optional(),
  }),
]);

export const thesisEvidenceInputSchema = z.object({
  evidence: z.array(thesisSignalSchema).max(6),
});

export type ThesisEvidenceInput = z.infer<typeof thesisEvidenceInputSchema>;

export type ThesisSignalState = "holds" | "at_risk" | "broken" | "unknown";

export interface ThesisSignalResult {
  signal: ThesisSignal;
  state: ThesisSignalState;
  detail: string;
}

export interface ThesisVerdict {
  outcome: "valid" | "invalid" | "inconclusive" | "pending_confirmation";
  results: ThesisSignalResult[];
  /** 因为取不到数据而无法判定的信号，逐条说明缺什么。 */
  missing: string[];
  summary: string;
}

/** 判定所需的观测快照；缺失字段对应信号会判为 unknown。 */
export interface ThesisSnapshot {
  price?: number;
  changePercent?: number;
  headlines?: string[];
  financials?: Record<string, number | undefined>;
}
