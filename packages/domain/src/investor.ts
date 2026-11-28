import { z } from "zod";
import { CURRENCY_CODES, type MonitorCurrency } from "./monitor-currency.ts";

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

/**
 * 事件类型。前三类（PRD A4）由「到期 / 首次亏损 / 配置偏离」三个候选生成器产出，
 * 其余沿用原有关注类事件；旧数据没有新类型，读取时按 rules 判级即可。
 */
export const EVENT_TYPES = [
  "price_move",
  "price_level",
  "thesis_risk",
  "earnings",
  "news",
  "announcement",
  "valuation",
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
  occurredAt: string;
  createdAt: string;
  read: boolean;
  feedback?: "less" | "more";
  notificationId?: string;
  /** A3 使用留痕：这条提醒依据哪份授权产生（撤回授权后可回看）。 */
  consentId?: string;
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
  /**
   * 显式去重键覆盖。缺省时由 `eventDedupeKey` 按类型推导；
   * 到期 / 首次亏损这类需要「同一周期只推一次、跨周期可再推」的事件，
   * 由候选生成器给出含周期信息的键（PRD A4）。
   */
  dedupeKey: z.string().trim().min(1).max(200).optional(),
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

// ═══════════════════════════════════════════════════════════════════════
// A1 投资档案（InvestmentProfile）
//
// 四组字段：目标 / 约束 / 范围 / 习惯。可信状态三档：
//   - user_confirmed：用户显式确认过（高风险字段唯一可信档位）。
//   - derived：系统从持仓等推导，尚未经用户确认。
//   - stale：曾确认过但按评估有效期已过期，需要重新确认。
// 模型只能提议（ProfileChangeProposal），风险偏好 / 期限 / 禁止行业三项
// 必须用户显式 confirm，直接改写一律 422 confirm_required（PRD A1）。
// ═══════════════════════════════════════════════════════════════════════

/** 字段来源：用户填的，还是系统推导的。 */
export type ProfileSource = "user" | "derived";

/** 档案字段的可信状态。 */
export type ProfileTrust = "user_confirmed" | "derived" | "stale";

export const GOAL_KINDS = ["education", "retirement", "growth", "preservation", "other"] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const RISK_APPETITES = ["conservative", "balanced", "assertive", "aggressive"] as const;
export type RiskAppetite = (typeof RISK_APPETITES)[number];

export const PROFILE_MARKETS = ["CN", "HK", "US"] as const;
export type ProfileMarket = (typeof PROFILE_MARKETS)[number];

/** 目标条目；horizonMonths 是投资期限，属于强制确认项。 */
export interface ProfileGoal {
  kind: GoalKind;
  label: string;
  horizonMonths?: number;
  amount?: { value: number; currency: MonitorCurrency };
  source: ProfileSource;
  confirmedAt?: string;
  updatedAt: string;
}

/** 风险约束；appetite / excludedSectors 属于强制确认项。 */
export interface ProfileRisk {
  appetite?: RiskAppetite;
  maxDrawdownPercent?: number;
  excludedSectors: string[];
  excludedMarkets: string[];
  source: ProfileSource;
  confirmedAt?: string;
  updatedAt: string;
  /** 风险测评过期时间；过期后按 stale 读（A4）。 */
  assessmentExpiresAt?: string;
  /** 进入 stale 的时间点。 */
  staleAt?: string;
}

export interface ProfileScope {
  markets: ProfileMarket[];
  sectors: string[];
  style?: string;
}

export interface ProfileHabits {
  language?: string;
  timeZone?: string;
  currency?: MonitorCurrency;
}

/** 每账户一份档案，kind="investment-profiles"，id="profile"。 */
export interface InvestmentProfile {
  owner: string;
  goals: ProfileGoal[];
  risk: ProfileRisk;
  scope: ProfileScope;
  habits: ProfileHabits;
  updatedAt: string;
}

/**
 * 强制确认字段：模型或推导不得直接落库，必须带 confirm=true，
 * 否则服务端返回 422 confirm_required（PRD A1）。
 */
export const PROFILE_CONFIRM_REQUIRED_FIELDS = [
  "risk.appetite",
  "goals.horizon",
  "risk.excluded",
] as const;

export const profileGoalInputSchema = z.object({
  kind: z.enum(GOAL_KINDS),
  label: z.string().trim().min(1).max(80),
  horizonMonths: z.number().int().min(0).max(1200).optional(),
  amount: z
    .object({ value: z.number().finite().nonnegative(), currency: z.enum(CURRENCY_CODES) })
    .optional(),
  source: z.enum(["user", "derived"]).optional(),
  confirmedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const profileRiskInputSchema = z.object({
  appetite: z.enum(RISK_APPETITES).optional(),
  maxDrawdownPercent: z.number().finite().min(0).max(100).optional(),
  excludedSectors: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
  excludedMarkets: z.array(z.enum(PROFILE_MARKETS)).max(10).optional(),
  source: z.enum(["user", "derived"]).optional(),
  confirmedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  assessmentExpiresAt: z.string().datetime().optional(),
});

export const profileScopeSchema = z.object({
  markets: z.array(z.enum(PROFILE_MARKETS)).max(10),
  sectors: z.array(z.string().trim().min(1).max(40)).max(50),
  style: z.string().trim().max(40).optional(),
});

export const profileHabitsSchema = z.object({
  language: z.string().trim().max(20).optional(),
  timeZone: z.string().trim().max(60).optional(),
  currency: z.enum(CURRENCY_CODES).optional(),
});

/** PUT /api/investor/profile 的入参；confirm=true 才允许写强制确认字段。 */
export const profileUpdateSchema = z.object({
  confirm: z.boolean().optional(),
  goals: z.array(profileGoalInputSchema).max(10).optional(),
  risk: profileRiskInputSchema.optional(),
  scope: profileScopeSchema.optional(),
  habits: profileHabitsSchema.optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/** 模型对档案的改动提议；必须用户 accept 才落库。 */
export interface ProfileChangeProposal {
  id: string;
  owner: string;
  /** 目标字段路径，如 "risk.appetite"。 */
  field: string;
  label: string;
  currentValue?: string;
  proposedValue: string;
  rationale: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  resolvedAt?: string;
}

export const profileProposalSchema = z.object({
  field: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(80),
  currentValue: z.string().trim().max(200).optional(),
  proposedValue: z.string().trim().min(1).max(200),
  rationale: z.string().trim().max(400).default(""),
});

export type ProfileProposalInput = z.infer<typeof profileProposalSchema>;

/** 四组字段各自的可信状态。 */
export interface ProfileTrustView {
  goals: ProfileTrust;
  risk: ProfileTrust;
  scope: ProfileTrust;
  habits: ProfileTrust;
}

/** GET /api/investor/profile 的返回：档案 + 可信状态 + 待确认项。 */
export interface InvestorProfileView {
  profile: InvestmentProfile;
  trust: ProfileTrustView;
  /** 尚未确认的强制确认字段路径（PRD A1）。 */
  missingConfirmation: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// A2 目标配置与偏离（InvestmentPolicy / PolicyDrift）
//
// 四维度：asset_class / sector / region / currency，各维度目标合计 100%。
// 主口径按市值（valueBasis="market"），成本口径只展示、不参与 breach。
// 跨币种不折算，界面必须展示 note。偏离带宽 warning=越过 80% 带宽。
// ═══════════════════════════════════════════════════════════════════════

export const POLICY_BASES = ["asset_class", "sector", "region", "currency"] as const;
export type PolicyBasis = (typeof POLICY_BASES)[number];

export const POLICY_BASIS_LABELS: Record<PolicyBasis, string> = {
  asset_class: "资产类别",
  sector: "行业",
  region: "地区",
  currency: "币种",
};

/** 跨币种不折算的固定说明，UI 必须原样展示。 */
export const POLICY_MARKET_NOTE = "按原币市值占比，未做汇率折算";

/** 目标合计的容差（百分点）。 */
export const POLICY_SUM_TOLERANCE = 0.5;

/** 越过 80% 带宽即 warning，超过带宽即 breach。 */
export const POLICY_WARNING_RATIO = 0.8;

export interface PolicyTarget {
  key: string;
  label: string;
  targetPercent: number;
  bandPercent: number;
}

/** 每组合一份目标配置，kind="investment-policies"，id=portfolioId。 */
export interface InvestmentPolicy {
  owner: string;
  portfolioId: string;
  basis: PolicyBasis;
  targets: PolicyTarget[];
  note: string;
  updatedAt: string;
}

export const policyTargetSchema = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  targetPercent: z.number().finite().min(0).max(100),
  bandPercent: z.number().finite().min(0).max(50).default(5),
});

export const investmentPolicySchema = z
  .object({
    basis: z.enum(POLICY_BASES),
    targets: z.array(policyTargetSchema).min(1).max(30),
    note: z.string().trim().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    const sum = value.targets.reduce((total, target) => total + target.targetPercent, 0);
    if (Math.abs(sum - 100) > POLICY_SUM_TOLERANCE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targets"],
        message: `目标权重合计需为 100%（当前 ${sum.toFixed(1)}%）`,
      });
    }
    const seen = new Set<string>();
    for (const target of value.targets) {
      if (seen.has(target.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targets"],
          message: `重复的目标键：${target.key}`,
        });
      }
      seen.add(target.key);
    }
  });

export type PolicyInput = z.infer<typeof investmentPolicySchema>;

export type DriftStatus = "within" | "warning" | "breach";

export interface PolicyDriftRow {
  key: string;
  label?: string;
  target: number;
  actual: number;
  /** 偏离值（百分点，actual - target）。 */
  drift: number;
  status: DriftStatus;
}

export interface PolicyDrift {
  portfolioId: string;
  basis: PolicyBasis;
  valueBasis: "market" | "cost";
  currency?: MonitorCurrency;
  rows: PolicyDriftRow[];
  /** 跨币种等多口径说明。 */
  note?: string;
  computedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════
// A3 授权中心（Consent）
//
// 五维授权：数据类别 / 用途 / 渠道 / 频率 / 有效期。
// 默认最小：新用户默认只有 in_app + research + manual_only；
// external_send 与 monitor 必须显式开启。
// 免打扰：账户级为主（quietHours + dailyPushCap），设备级可覆盖；
// 生效顺序 设备级 > 账户级 > 是否开市。撤回即停，使用可回看（记 consentId）。
// ═══════════════════════════════════════════════════════════════════════

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

export const DEFAULT_DAILY_PUSH_CAP = 5;

/** 默认最小授权：只允许 in_app 的被动研究。 */
export const DEFAULT_CONSENT: {
  dataScope: ConsentDataScope[];
  purposes: ConsentPurpose[];
  channels: ConsentChannel[];
  frequency: ConsentFrequency;
} = {
  dataScope: ["market_data"],
  purposes: ["research"],
  channels: ["in_app"],
  frequency: "manual_only",
};

export interface QuietHours {
  /** "HH:mm"（本地时区）。 */
  start: string;
  end: string;
  timeZone: string;
}

export interface DeviceQuietOverride {
  deviceId: string;
  label?: string;
  quietHours?: QuietHours;
  dailyPushCap?: number;
  updatedAt: string;
}

/** 一份授权，kind="consents"，id=uuid。 */
export interface Consent {
  id: string;
  owner: string;
  dataScope: ConsentDataScope[];
  purposes: ConsentPurpose[];
  channels: ConsentChannel[];
  frequency: ConsentFrequency;
  validFrom: string;
  validTo?: string;
  quietHours?: QuietHours;
  dailyPushCap?: number;
  deviceQuietOverrides?: DeviceQuietOverride[];
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式须为 HH:mm");

export const quietHoursSchema = z.object({
  start: hhmm,
  end: hhmm,
  timeZone: z.string().trim().min(1).max(60),
});

export const deviceQuietOverrideSchema = z.object({
  deviceId: z.string().trim().min(1).max(80),
  label: z.string().trim().max(60).optional(),
  quietHours: quietHoursSchema.optional(),
  dailyPushCap: z.number().int().min(1).max(10).optional(),
  updatedAt: z.string().datetime().optional(),
});

export const consentCreateSchema = z.object({
  dataScope: z.array(z.enum(CONSENT_DATA_SCOPES)).min(1).max(7),
  purposes: z.array(z.enum(CONSENT_PURPOSES)).min(1).max(4),
  channels: z.array(z.enum(CONSENT_CHANNELS)).min(1).max(4),
  frequency: z.enum(CONSENT_FREQUENCIES).default("manual_only"),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().nullable().optional(),
  quietHours: quietHoursSchema.nullable().optional(),
  dailyPushCap: z.number().int().min(1).max(10).nullable().optional(),
});

export type ConsentCreateInput = z.infer<typeof consentCreateSchema>;

export const consentUpdateSchema = z.object({
  dataScope: z.array(z.enum(CONSENT_DATA_SCOPES)).min(1).max(7).optional(),
  purposes: z.array(z.enum(CONSENT_PURPOSES)).min(1).max(4).optional(),
  channels: z.array(z.enum(CONSENT_CHANNELS)).min(1).max(4).optional(),
  frequency: z.enum(CONSENT_FREQUENCIES).optional(),
  validTo: z.string().datetime().nullable().optional(),
  quietHours: quietHoursSchema.nullable().optional(),
  dailyPushCap: z.number().int().min(1).max(10).nullable().optional(),
});

export type ConsentUpdateInput = z.infer<typeof consentUpdateSchema>;

/** 免打扰判定结论；供 UI 与事件降级共同使用。 */
export interface ConsentGate {
  /** 是否已配置过授权（至少一份记录）。未配置时事件管线沿用既有行为，不强制降级。 */
  configured: boolean;
  /** 是否存在覆盖当前时刻的有效提醒（remind）授权。 */
  remind: boolean;
  /** 当前是否处于免打扰。 */
  quiet: boolean;
  /** 生效的每日推送上限（设备级 > 账户级 > 缺省）。 */
  dailyPushCap: number;
  /** 今天剩余可推送条数。 */
  remaining: number;
  quietSource?: "device" | "account";
  /** 命中的授权 id，用于使用留痕。 */
  consentId?: string;
  reasons: string[];
}
