import { z } from "zod";
import type { MonitorCurrency } from "./monitor-currency.ts";

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
  // A4：新增三类事件源（到期 / 首次亏损 / 配置偏离）。
  "maturity",
  "first_loss",
  "policy_drift",
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
  maturity: "到期事项",
  first_loss: "首次亏损",
  policy_drift: "配置偏离",
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
  /** A3：产生这条提醒时命中的授权记录，用于「这份授权最近被用了几次」。 */
  consentId?: string;
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
  /**
   * 去重分桶：用于「首次/持续」语义的事件（first_loss 的成本带、policy_drift 的偏离维度）。
   * 分桶不变则视为同一事件、不重复打扰；分桶变化（如回到成本上方再度跌破）才重新提醒。
   */
  dedupeBucket: z.string().trim().max(64).optional(),
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

// ─── A1 个人投资档案 InvestmentProfile ───

/** 字段来源：用户录入，或系统从持仓/自选推断（推断项需用户一键确认）。 */
export type ProfileSource = "user" | "derived";
/** 可信状态三档：用户已确认 / 系统推断 / 已过期需复核。 */
export type ProfileTrust = "user_confirmed" | "derived" | "stale";
export type GoalKind = "education" | "retirement" | "growth" | "preservation" | "other";
export type RiskAppetite = "conservative" | "balanced" | "assertive" | "aggressive";
export const PROFILE_MARKETS = ["CN", "HK", "US"] as const;
export type ProfileMarket = (typeof PROFILE_MARKETS)[number];

export const GOAL_KINDS = ["education", "retirement", "growth", "preservation", "other"] as const;
export const RISK_APPETITES = ["conservative", "balanced", "assertive", "aggressive"] as const;
export const GOAL_KIND_LABELS: Record<GoalKind, string> = {
  education: "教育",
  retirement: "退休",
  growth: "增值",
  preservation: "保值",
  other: "其他",
};
export const RISK_APPETITE_LABELS: Record<RiskAppetite, string> = {
  conservative: "保守",
  balanced: "稳健",
  assertive: "平衡",
  aggressive: "进取",
};

export interface ProfileGoal {
  kind: GoalKind;
  label: string;
  horizonMonths?: number;
  amount?: { value: number; currency: MonitorCurrency };
  source: ProfileSource;
  confirmedAt?: string;
  updatedAt: string;
}

export interface ProfileRisk {
  /** 风险偏好属于高影响字段：模型不能直接改写，且需用户显式确认。 */
  appetite?: RiskAppetite;
  maxDrawdownPercent?: number;
  excludedSectors: string[];
  excludedMarkets: string[];
  source: ProfileSource;
  confirmedAt?: string;
  updatedAt: string;
  /** 过期时间，如风险测评后 12 个月；到期后该组字段判为 stale。 */
  staleAt?: string;
  /** A4：风险测评到期日，用于「到期事项」事件源。 */
  assessmentExpiresAt?: string;
}

export interface InvestmentProfile {
  /** 每账户一份，固定 id。 */
  id: string;
  owner: string;
  goals: ProfileGoal[];
  risk: ProfileRisk;
  scope: { markets: ProfileMarket[]; sectors: string[]; style?: string };
  habits: { language?: string; timeZone?: string; currency?: MonitorCurrency };
  updatedAt: string;
}

/** 「风险偏好 / 期限 / 禁止行业」三项为强制确认字段。 */
export const PROFILE_CONFIRM_REQUIRED_FIELDS = ["risk.appetite", "goals.horizon", "risk.excluded"] as const;

export const profileGoalSchema = z.object({
  kind: z.enum(GOAL_KINDS),
  label: z.string().trim().min(1).max(80),
  horizonMonths: z.number().int().min(0).max(1200).optional(),
  amount: z
    .object({ value: z.number().finite().nonnegative(), currency: z.enum(["CNY", "USD", "HKD"]) })
    .optional(),
});

/**
 * 档案更新入参。
 *
 * - `confirm: true` 表示用户本次确认了高风险字段（风险偏好 / 期限 / 禁止行业）；
 *   未带 confirm 却试图改写这三项，服务端一律拒绝（422），模型也只能走提议流程。
 */
export const profileUpdateSchema = z.object({
  confirm: z.boolean().default(false),
  goals: z
    .array(
      profileGoalSchema.extend({
        source: z.enum(["user", "derived"]).default("user"),
      }),
    )
    .max(10)
    .optional(),
  risk: z
    .object({
      appetite: z.enum(RISK_APPETITES).optional(),
      maxDrawdownPercent: z.number().finite().min(0).max(100).optional(),
      excludedSectors: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
      excludedMarkets: z.array(z.enum(PROFILE_MARKETS)).max(10).optional(),
      assessmentExpiresAt: z.string().datetime().optional(),
      staleAt: z.string().datetime().optional(),
    })
    .optional(),
  scope: z
    .object({
      markets: z.array(z.enum(PROFILE_MARKETS)).max(3).optional(),
      sectors: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
      style: z.string().trim().max(60).optional(),
    })
    .optional(),
  habits: z
    .object({
      language: z.string().trim().max(20).optional(),
      timeZone: z.string().trim().max(40).optional(),
      currency: z.enum(["CNY", "USD", "HKD"]).optional(),
    })
    .optional(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/** 模型（或前端）提议的档案变更；只能提议，用户确认后才落库。 */
export interface ProfileChangeProposal {
  id: string;
  owner: string;
  /** 受影响字段路径，例如 "risk.appetite" / "scope.markets"。 */
  field: string;
  current?: unknown;
  proposed: unknown;
  reason: string;
  /** 该字段是否属于必须用户确认的高风险字段。 */
  requiresConfirm: boolean;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  decidedAt?: string;
}

export const profileProposalSchema = z.object({
  field: z.string().trim().min(1).max(80),
  proposed: z.unknown(),
  reason: z.string().trim().min(1).max(400),
});
export type ProfileProposalInput = z.infer<typeof profileProposalSchema>;

// ─── A2 目标配置区间 InvestmentPolicy 与偏离 PolicyDrift ───

export const POLICY_BASES = ["asset_class", "sector", "region", "currency"] as const;
export type PolicyBasis = (typeof POLICY_BASES)[number];
export const POLICY_BASIS_LABELS: Record<PolicyBasis, string> = {
  asset_class: "资产类别",
  sector: "行业",
  region: "地区",
  currency: "币种",
};

/** 口径声明：前端必须展示。 */
export const POLICY_MARKET_NOTE = "按原币市值占比，未做汇率折算";

export const policyTargetSchema = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  targetPercent: z.number().finite().min(0).max(100),
  bandPercent: z.number().finite().min(0).max(100).default(5),
});

export interface PolicyTarget extends z.infer<typeof policyTargetSchema> {}

export interface InvestmentPolicy {
  /** 每个组合一份，id = portfolioId。 */
  id: string;
  owner: string;
  portfolioId: string;
  basis: PolicyBasis;
  targets: PolicyTarget[];
  /** 口径声明，前端必须展示（如"按原币市值占比，未做汇率折算"）。 */
  note: string;
  updatedAt: string;
}

/** 目标权重合计必须为 100%（允许 ±0.5 容差），否则拒绝保存并提示差额。 */
export const POLICY_SUM_TOLERANCE = 0.5;

export const investmentPolicySchema = z
  .object({
    basis: z.enum(POLICY_BASES),
    targets: z.array(policyTargetSchema).min(1).max(30),
    note: z.string().trim().max(200).default(POLICY_MARKET_NOTE),
  })
  .superRefine((value, ctx) => {
    const sum = value.targets.reduce((total, item) => total + item.targetPercent, 0);
    if (Math.abs(sum - 100) > POLICY_SUM_TOLERANCE) {
      ctx.addIssue({
        code: "custom",
        path: ["targets"],
        message: `目标权重合计应接近 100%（当前 ${sum.toFixed(2)}%，差 ${(100 - sum).toFixed(2)} 个百分点）`,
      });
    }
    const keys = new Set<string>();
    for (const target of value.targets) {
      if (keys.has(target.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["targets"],
          message: `重复的目标维度 key：${target.key}`,
        });
      }
      keys.add(target.key);
    }
  });
export type InvestmentPolicyInput = z.infer<typeof investmentPolicySchema>;

export type DriftStatus = "within" | "warning" | "breach";

export interface PolicyDriftRow {
  key: string;
  label: string;
  target: number;
  actual: number;
  /** 实际 − 目标（百分点）。 */
  drift: number;
  band: number;
  status: DriftStatus;
}

export interface PolicyDrift {
  portfolioId: string;
  basis: PolicyBasis;
  /** market=按市值（主口径，参与 breach 判定）；cost=按成本（仅对比展示）。 */
  valueBasis: "market" | "cost";
  /** 分币种各算一份。 */
  currency?: MonitorCurrency;
  note: string;
  rows: PolicyDriftRow[];
  computedAt: string;
}

// ─── A3 授权中心 Consent ───

export const CONSENT_DATA_SCOPES = [
  "portfolio",
  "holdings",
  "notes",
  "thesis",
  "watchlist",
  "profile",
  "market_data",
] as const;
export type ConsentDataScope = (typeof CONSENT_DATA_SCOPES)[number];

export const CONSENT_PURPOSES = ["research", "monitor", "remind", "external_send"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_CHANNELS = ["in_app", "email", "push", "webhook"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const CONSENT_FREQUENCIES = ["realtime", "daily", "weekly", "manual_only"] as const;
export type ConsentFrequency = (typeof CONSENT_FREQUENCIES)[number];

export interface QuietHours {
  /** "HH:MM"，24h。 */
  start: string;
  end: string;
  /** IANA 时区。 */
  timeZone: string;
}

export interface DeviceQuietOverride {
  deviceId: string;
  label?: string;
  quietHours?: QuietHours;
  dailyPushCap?: number;
  updatedAt: string;
}

export interface Consent {
  id: string;
  owner: string;
  dataScope: ConsentDataScope[];
  purposes: ConsentPurpose[];
  channels: ConsentChannel[];
  frequency: ConsentFrequency;
  validFrom: string;
  /** 缺省=长期有效，UI 需标注「长期有效」。 */
  validTo?: string;
  quietHours?: QuietHours;
  /** 每日推送上限 1..10，缺省 5。 */
  dailyPushCap?: number;
  /** 设备级免打扰覆盖（设备优先于账户级），仅影响该设备的推送投放。 */
  deviceQuietOverrides?: DeviceQuietOverride[];
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_DAILY_PUSH_CAP = 5;
const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

export const quietHoursSchema = z.object({
  start: timeOfDaySchema,
  end: timeOfDaySchema,
  timeZone: z.string().trim().min(1).max(40),
});

export const deviceQuietOverrideSchema = z.object({
  deviceId: z.string().trim().min(1).max(120),
  label: z.string().trim().max(60).optional(),
  quietHours: quietHoursSchema.optional(),
  dailyPushCap: z.number().int().min(1).max(10).optional(),
});

export const consentCreateSchema = z.object({
  dataScope: z.array(z.enum(CONSENT_DATA_SCOPES)).min(1).max(CONSENT_DATA_SCOPES.length),
  purposes: z.array(z.enum(CONSENT_PURPOSES)).min(1).max(CONSENT_PURPOSES.length),
  channels: z.array(z.enum(CONSENT_CHANNELS)).min(1).max(CONSENT_CHANNELS.length),
  frequency: z.enum(CONSENT_FREQUENCIES).default("manual_only"),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
  quietHours: quietHoursSchema.optional(),
  dailyPushCap: z.number().int().min(1).max(10).optional(),
});
export type ConsentCreateInput = z.infer<typeof consentCreateSchema>;

export const consentUpdateSchema = z
  .object({
    dataScope: z.array(z.enum(CONSENT_DATA_SCOPES)).min(1).max(CONSENT_DATA_SCOPES.length).optional(),
    purposes: z.array(z.enum(CONSENT_PURPOSES)).min(1).max(CONSENT_PURPOSES.length).optional(),
    channels: z.array(z.enum(CONSENT_CHANNELS)).min(1).max(CONSENT_CHANNELS.length).optional(),
    frequency: z.enum(CONSENT_FREQUENCIES).optional(),
    validTo: z.string().datetime().nullable().optional(),
    quietHours: quietHoursSchema.nullable().optional(),
    dailyPushCap: z.number().int().min(1).max(10).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Provide at least one field to update",
  });
export type ConsentUpdateInput = z.infer<typeof consentUpdateSchema>;

/** 设备级免打扰覆盖的写入入参（设备优先于账户级）。 */
export const deviceQuietOverrideInputSchema = z.object({
  quietHours: quietHoursSchema.nullable().optional(),
  dailyPushCap: z.number().int().min(1).max(10).nullable().optional(),
  label: z.string().trim().max(60).optional(),
});
export type DeviceQuietOverrideInput = z.infer<typeof deviceQuietOverrideInputSchema>;

/**
 * 判级策略闸所需的授权结论（由 ConsentService 解析后传入 event-triage）。
 * 不改判定算法，只加这一道闸。
 */
export interface ConsentGate {
  /** 是否授权主动提醒（remind 用途 + push 渠道）。false → push 降级为 feed。 */
  canRemind: boolean;
  /** 是否处于免打扰时段（设备级 > 账户级）。true → push 降级为 feed。 */
  quietHours: boolean;
  /** 今日推送数是否已达上限。true → push 降级为当日汇总（feed）。 */
  pushCapReached: boolean;
  /** 生效的授权记录 id，用于使用留痕。 */
  consentId?: string;
}
