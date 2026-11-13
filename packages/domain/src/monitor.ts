import type { TradingMarket } from "./market-calendar.ts";

export type { TradingMarket };

/** L1 行情异动 + L2 财报/公告。L3/L4 不在本期范围。 */
export type MonitorEventKind =
  | "PRICE_ABOVE"
  | "PRICE_BELOW"
  | "CHANGE_PCT"
  | "VOLUME_SPIKE"
  | "VOLATILITY_SPIKE"
  | "EARNINGS"
  | "ANNOUNCEMENT"
  | "DIVIDEND"
  | "SUSPENSION"
  | "DIGEST";

export type MonitorLayer = "L1" | "L2";

/** 事件层级决定默认打扰级别；DIGEST 是汇总产物，不参与单条事件的层级判断。 */
export const MONITOR_EVENT_LAYERS: Record<Exclude<MonitorEventKind, "DIGEST">, MonitorLayer> = {
  PRICE_ABOVE: "L1",
  PRICE_BELOW: "L1",
  CHANGE_PCT: "L1",
  VOLUME_SPIKE: "L1",
  VOLATILITY_SPIKE: "L1",
  EARNINGS: "L2",
  ANNOUNCEMENT: "L2",
  DIVIDEND: "L2",
  SUSPENSION: "L2",
};

export const MONITOR_EVENT_KINDS = Object.keys(MONITOR_EVENT_LAYERS) as Exclude<
  MonitorEventKind,
  "DIGEST"
>[];

export type MonitorTargetType = "symbol" | "portfolio" | "thesis" | "page";
export type MonitorLevel = "MUST_KNOW" | "LATER" | "ARCHIVE";
export type MonitorEventState = "new" | "delivered" | "archived" | "dismissed";
export type DeliveryChannel = "apns" | "fcm" | "email" | "wecom";

export interface MonitorQuietHours {
  /** 本地时间整点，含起点。默认 22。 */
  startHour: number;
  /** 本地时间整点，不含终点。默认 7。 */
  endHour: number;
  /** 解释静默期所用的时区；缺省为 owner 时区（Asia/Shanghai）。 */
  timeZone?: string;
}

/** 规则阈值；不同 eventKinds 只读取自己需要的字段。 */
export interface MonitorThresholds {
  priceAbove?: number;
  priceBelow?: number;
  changePct?: number;
  /** 相对基准成交量的倍数，例如 2 表示 2 倍放量。 */
  volumeMultiplier?: number;
  /** 日内振幅占前收的百分比。 */
  volatilityPct?: number;
}

export interface MonitorRule {
  id: string;
  ownerId: string;
  title?: string;
  targetType: MonitorTargetType;
  /** symbol 为 Yahoo 代码；portfolio/thesis/page 为对应记录 id。 */
  targetId: string;
  market?: TradingMarket;
  eventKinds: MonitorEventKind[];
  level: MonitorLevel;
  cooldownMinutes: number;
  enabled: boolean;
  /** 缺省表示使用默认静默期；显式 null 表示用户关闭静默期。 */
  quietHours?: MonitorQuietHours | null;
  /** L1 轮询间隔（分钟）。 */
  intervalMinutes: number;
  thresholds: MonitorThresholds;
  channels: DeliveryChannel[];
  createdAt: string;
  updatedAt: string;
  nextCheckAt?: string;
  lastCheckedAt?: string;
  lastError?: string;
  /** 用户连续标记「不必要」的计数；达到 3 次自动降频。 */
  consecutiveDismissals?: number;
  autoDowngradedAt?: string;
  /** VOLUME_SPIKE 的基准成交量（首次观测时写入）。 */
  volumeBaseline?: number;
  /** 记录结构版本，用于兼容旧数据。 */
  schemaVersion?: number;
}

export interface MonitorEventPayload {
  symbol?: string;
  title?: string;
  [key: string]: unknown;
}

export interface MonitorEvent {
  id: string;
  ownerId: string;
  ruleId: string;
  kind: MonitorEventKind;
  layer?: MonitorLayer | "SYSTEM";
  level: MonitorLevel;
  severity: "low" | "medium" | "high";
  payload: MonitorEventPayload;
  /** 规则 + 事件类型 + 标的的稳定去重键。 */
  dedupeKey: string;
  detectedAt: string;
  lastDetectedAt?: string;
  market?: TradingMarket;
  marketDate: string;
  state: MonitorEventState;
  /** 因静默期或预算超额被降级，等待 19:00 汇总。 */
  downgraded?: boolean;
  downgradedReason?: "quiet_hours" | "budget" | "non_trading_day";
  occurrences: number;
  /** 被并入哪一天的汇总。 */
  digestDate?: string;
  digestedAt?: string;
  dismissedAt?: string;
  dismissReason?: "unnecessary" | "irrelevant" | "useful";
  readAt?: string;
}

export interface AttentionBudget {
  /** `${ownerId}:${date}`。 */
  id: string;
  ownerId: string;
  /** owner 本地日期（Asia/Shanghai）。 */
  date: string;
  limit: number;
  used: number;
  downgradedCount: number;
  updatedAt: string;
}

export interface DeliveryLog {
  id: string;
  ownerId: string;
  eventId: string;
  channel: DeliveryChannel;
  sentAt: string;
  providerId: string;
  result: "sent" | "skipped" | "failed";
  reason?: "not_configured" | "duplicated" | "error";
  error?: string;
}
