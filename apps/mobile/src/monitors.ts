/**
 * OPT-01 移动端数据层：Today 聚合、打扰预算与监控规则。
 *
 * 后端契约（PR #26）：
 * - GET    /api/today                    → { date, budget, events: { MUST_KNOW, LATER, ARCHIVE }, ... }
 * - GET    /api/monitors/rules            → { rules: MonitorRule[] }
 * - POST   /api/monitors/rules            → 201 MonitorRule
 * - PUT    /api/monitors/rules/:id        → MonitorRule
 * - DELETE /api/monitors/rules/:id        → 204
 * - POST   /api/monitors/rules/:id/control { action: pause | resume | check }
 * - POST   /api/monitors/events/:id/dismiss { reason: unnecessary | irrelevant | useful }
 * - PUT    /api/monitors/budget           { limit }
 *
 * Today 必须以 `/api/today` 的 owner 本地日期聚合为准，不能再用
 * `/api/monitors/events?date=` 的市场日期过滤。
 */
import { useSyncExternalStore } from "react";
import type { LingWuApi } from "./api";

export type MonitorLevel = "MUST_KNOW" | "LATER" | "ARCHIVE";
export type MonitorMarket = "CN" | "HK" | "US";
export type MonitorTargetType = "symbol" | "portfolio" | "thesis" | "page";
export type MonitorEventState = "new" | "delivered" | "archived" | "dismissed";
export type DeliveryChannel = "apns" | "fcm" | "email" | "wecom";
export type DismissReason = "unnecessary" | "irrelevant" | "useful";
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

export const MONITOR_EVENT_KINDS: readonly MonitorEventKind[] = [
  "PRICE_ABOVE",
  "PRICE_BELOW",
  "CHANGE_PCT",
  "VOLUME_SPIKE",
  "VOLATILITY_SPIKE",
  "EARNINGS",
  "ANNOUNCEMENT",
  "DIVIDEND",
  "SUSPENSION",
];

/** 需要阈值输入的 L1 条件。 */
export const THRESHOLD_KINDS = {
  PRICE_ABOVE: "priceAbove",
  PRICE_BELOW: "priceBelow",
  CHANGE_PCT: "changePct",
  VOLUME_SPIKE: "volumeMultiplier",
  VOLATILITY_SPIKE: "volatilityPct",
} as const;

export type ThresholdField = (typeof THRESHOLD_KINDS)[keyof typeof THRESHOLD_KINDS];

export interface MonitorThresholds {
  priceAbove?: number;
  priceBelow?: number;
  changePct?: number;
  volumeMultiplier?: number;
  volatilityPct?: number;
}

export interface MonitorQuietHours {
  startHour: number;
  endHour: number;
  timeZone?: string;
}

export interface MonitorRule {
  id: string;
  title?: string;
  targetType: MonitorTargetType;
  targetId: string;
  market?: MonitorMarket;
  eventKinds: MonitorEventKind[];
  level: MonitorLevel;
  cooldownMinutes: number;
  enabled: boolean;
  /** undefined = 使用默认 22:00–07:00；null = 用户显式关闭静默期。 */
  quietHours?: MonitorQuietHours | null;
  intervalMinutes: number;
  thresholds: MonitorThresholds;
  channels: DeliveryChannel[];
  createdAt: string;
  updatedAt: string;
  consecutiveDismissals?: number;
  autoDowngradedAt?: string;
  lastCheckedAt?: string;
  nextCheckAt?: string;
  lastError?: string;
}

export interface MonitorEvent {
  id: string;
  ruleId: string;
  kind: MonitorEventKind;
  layer?: "L1" | "L2" | "SYSTEM";
  level: MonitorLevel;
  severity: "low" | "medium" | "high";
  payload: Record<string, unknown>;
  detectedAt: string;
  lastDetectedAt?: string;
  market?: MonitorMarket;
  marketDate: string;
  state: MonitorEventState;
  downgraded?: boolean;
  downgradedReason?: "quiet_hours" | "budget" | "non_trading_day";
  occurrences: number;
  digestDate?: string;
  dismissedAt?: string;
  dismissReason?: DismissReason;
}

export interface TodayBudget {
  date: string;
  limit: number;
  used: number;
  remaining: number;
  downgradedCount: number;
}

export interface TodayEventGroups {
  MUST_KNOW: MonitorEvent[];
  LATER: MonitorEvent[];
  ARCHIVE: MonitorEvent[];
}

export interface TodayData {
  date: string;
  timeZone: string;
  budget: TodayBudget;
  rules: MonitorRule[];
  digest: MonitorEvent | null;
  groups: TodayEventGroups;
  generatedAt: string;
}

export interface MonitorRuleInput {
  title?: string;
  targetType: MonitorTargetType;
  targetId: string;
  market?: MonitorMarket;
  eventKinds: MonitorEventKind[];
  level?: MonitorLevel;
  cooldownMinutes?: number;
  enabled?: boolean;
  quietHours?: MonitorQuietHours | null;
  intervalMinutes?: number;
  thresholds?: MonitorThresholds;
  channels?: DeliveryChannel[];
}

/** 规则编辑器里的字符串草稿；纯函数，便于单测校验与提交转换。 */
export interface MonitorRuleDraft {
  title: string;
  targetType: "symbol" | "portfolio";
  targetId: string;
  market: "" | MonitorMarket;
  level: MonitorLevel;
  cooldown: string;
  interval: string;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  channels: DeliveryChannel[];
  kinds: MonitorEventKind[];
  thresholds: Record<ThresholdField, string>;
}

export type MonitorRuleValidation =
  | "target"
  | "kinds"
  | "channels"
  | "cooldown"
  | "interval"
  | "quiet"
  | "threshold";

export type MonitorRuleBuildResult =
  | { input: Partial<MonitorRuleInput> }
  | { error: MonitorRuleValidation; kind?: MonitorEventKind };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return typeof value === "string" && (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function parseLevel(value: unknown): MonitorLevel | undefined {
  return oneOf(value, ["MUST_KNOW", "LATER", "ARCHIVE"] as const);
}

function parseChannels(value: unknown): DeliveryChannel[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is DeliveryChannel =>
      oneOf(item, ["apns", "fcm", "email", "wecom"] as const) !== undefined,
  );
}

function parseKinds(value: unknown): MonitorEventKind[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is MonitorEventKind => oneOf(item, MONITOR_EVENT_KINDS) !== undefined,
  );
}

function parseQuietHours(value: unknown): MonitorQuietHours | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const startHour = num(value.startHour);
  const endHour = num(value.endHour);
  if (startHour === undefined || endHour === undefined) return undefined;
  return {
    startHour,
    endHour,
    ...(text(value.timeZone) ? { timeZone: text(value.timeZone) } : {}),
  };
}

function parseThresholds(value: unknown): MonitorThresholds {
  if (!isRecord(value)) return {};
  const result: MonitorThresholds = {};
  for (const field of [
    "priceAbove",
    "priceBelow",
    "changePct",
    "volumeMultiplier",
    "volatilityPct",
  ] as const) {
    const parsed = num(value[field]);
    if (parsed !== undefined) result[field] = parsed;
  }
  return result;
}

export function parseMonitorRule(value: unknown): MonitorRule | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const targetType = oneOf(value.targetType, ["symbol", "portfolio", "thesis", "page"] as const);
  const targetId = text(value.targetId);
  const level = parseLevel(value.level);
  if (!id || !targetType || !targetId || !level) return undefined;
  return {
    id,
    ...(text(value.title) ? { title: text(value.title) } : {}),
    targetType,
    targetId,
    ...(oneOf(value.market, ["CN", "HK", "US"] as const)
      ? { market: oneOf(value.market, ["CN", "HK", "US"] as const) }
      : {}),
    eventKinds: parseKinds(value.eventKinds),
    level,
    cooldownMinutes: num(value.cooldownMinutes) ?? 240,
    enabled: value.enabled !== false,
    ...("quietHours" in value ? { quietHours: parseQuietHours(value.quietHours) } : {}),
    intervalMinutes: num(value.intervalMinutes) ?? 5,
    thresholds: parseThresholds(value.thresholds),
    channels: parseChannels(value.channels),
    createdAt: text(value.createdAt) ?? "",
    updatedAt: text(value.updatedAt) ?? "",
    ...(num(value.consecutiveDismissals) !== undefined
      ? { consecutiveDismissals: num(value.consecutiveDismissals) }
      : {}),
    ...(text(value.autoDowngradedAt) ? { autoDowngradedAt: text(value.autoDowngradedAt) } : {}),
    ...(text(value.lastCheckedAt) ? { lastCheckedAt: text(value.lastCheckedAt) } : {}),
    ...(text(value.nextCheckAt) ? { nextCheckAt: text(value.nextCheckAt) } : {}),
    ...(text(value.lastError) ? { lastError: text(value.lastError) } : {}),
  };
}

export function parseMonitorEvent(value: unknown): MonitorEvent | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const ruleId = text(value.ruleId);
  const kind = oneOf(value.kind, [...MONITOR_EVENT_KINDS, "DIGEST"] as const);
  const level = parseLevel(value.level);
  if (!id || !ruleId || !kind || !level) return undefined;
  const state = oneOf(value.state, ["new", "delivered", "archived", "dismissed"] as const);
  return {
    id,
    ruleId,
    kind,
    ...(oneOf(value.layer, ["L1", "L2", "SYSTEM"] as const)
      ? { layer: oneOf(value.layer, ["L1", "L2", "SYSTEM"] as const) }
      : {}),
    level,
    severity: oneOf(value.severity, ["low", "medium", "high"] as const) ?? "medium",
    payload: isRecord(value.payload) ? value.payload : {},
    detectedAt: text(value.detectedAt) ?? "",
    ...(text(value.lastDetectedAt) ? { lastDetectedAt: text(value.lastDetectedAt) } : {}),
    ...(oneOf(value.market, ["CN", "HK", "US"] as const)
      ? { market: oneOf(value.market, ["CN", "HK", "US"] as const) }
      : {}),
    marketDate: text(value.marketDate) ?? "",
    state: state ?? "new",
    ...(value.downgraded === true ? { downgraded: true } : {}),
    ...(oneOf(value.downgradedReason, ["quiet_hours", "budget", "non_trading_day"] as const)
      ? {
          downgradedReason: oneOf(value.downgradedReason, [
            "quiet_hours",
            "budget",
            "non_trading_day",
          ] as const),
        }
      : {}),
    occurrences: num(value.occurrences) ?? 1,
    ...(text(value.digestDate) ? { digestDate: text(value.digestDate) } : {}),
    ...(text(value.dismissedAt) ? { dismissedAt: text(value.dismissedAt) } : {}),
    ...(oneOf(value.dismissReason, ["unnecessary", "irrelevant", "useful"] as const)
      ? {
          dismissReason: oneOf(value.dismissReason, [
            "unnecessary",
            "irrelevant",
            "useful",
          ] as const),
        }
      : {}),
  };
}

function parseEvents(value: unknown): MonitorEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseMonitorEvent)
    .filter((event): event is MonitorEvent => !!event)
    .filter((event) => event.kind !== "DIGEST");
}

function parseBudget(value: unknown): TodayBudget | undefined {
  if (!isRecord(value)) return undefined;
  const date = text(value.date);
  const limit = num(value.limit);
  if (!date || limit === undefined) return undefined;
  const used = num(value.used) ?? 0;
  return {
    date,
    limit,
    used,
    remaining: num(value.remaining) ?? Math.max(limit - used, 0),
    downgradedCount: num(value.downgraded_count) ?? 0,
  };
}

/** 解析 `/api/today`。字段缺失时返回 undefined，让调用方显式显示错误。 */
export function parseToday(payload: unknown): TodayData | undefined {
  if (!isRecord(payload)) return undefined;
  const date = text(payload.date);
  const budget = parseBudget(payload.budget);
  if (!date || !budget) return undefined;
  const events = isRecord(payload.events) ? payload.events : {};
  const rules = Array.isArray(payload.rules)
    ? payload.rules.map(parseMonitorRule).filter((rule): rule is MonitorRule => !!rule)
    : [];
  const digest = parseMonitorEvent(payload.digest);
  return {
    date,
    timeZone: text(payload.time_zone) ?? "Asia/Shanghai",
    budget,
    rules,
    digest: digest?.kind === "DIGEST" ? digest : null,
    groups: {
      MUST_KNOW: parseEvents(events.MUST_KNOW),
      LATER: parseEvents(events.LATER),
      ARCHIVE: parseEvents(events.ARCHIVE),
    },
    generatedAt: text(payload.generated_at) ?? new Date().toISOString(),
  };
}

export function parseMonitorRules(payload: unknown): MonitorRule[] | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.rules)) return undefined;
  return payload.rules.map(parseMonitorRule).filter((rule): rule is MonitorRule => !!rule);
}

function severityRank(severity: MonitorEvent["severity"]) {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

/** 组内排序：严重程度优先，其次按最近触发时间倒序。 */
export function sortMonitorEvents(events: readonly MonitorEvent[]): MonitorEvent[] {
  return [...events].sort((left, right) => {
    const severity = severityRank(right.severity) - severityRank(left.severity);
    if (severity) return severity;
    return (right.lastDetectedAt ?? right.detectedAt).localeCompare(
      left.lastDetectedAt ?? left.detectedAt,
    );
  });
}

export function removeMonitorEvent(today: TodayData, eventId: string): TodayData {
  const filter = (events: MonitorEvent[]) => events.filter((event) => event.id !== eventId);
  return {
    ...today,
    groups: {
      MUST_KNOW: filter(today.groups.MUST_KNOW),
      LATER: filter(today.groups.LATER),
      ARCHIVE: filter(today.groups.ARCHIVE),
    },
  };
}

export function upsertMonitorRule(rules: readonly MonitorRule[], rule: MonitorRule): MonitorRule[] {
  const next = rules.filter((item) => item.id !== rule.id);
  return [rule, ...next].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function removeMonitorRule(rules: readonly MonitorRule[], id: string): MonitorRule[] {
  return rules.filter((rule) => rule.id !== id);
}

export function eventTitle(event: MonitorEvent): string {
  const title = text(event.payload.title);
  if (title) return title;
  const symbol = text(event.payload.symbol);
  return symbol ?? event.kind;
}

export function eventDetail(event: MonitorEvent): string {
  const parts: string[] = [];
  const symbol = text(event.payload.symbol);
  if (symbol) parts.push(symbol);
  const price = num(event.payload.price) ?? num(event.payload.currentPrice);
  if (price !== undefined) parts.push(`$${price}`);
  const threshold = num(event.payload.threshold);
  if (threshold !== undefined) parts.push(`≥ ${threshold}`);
  const changePct = num(event.payload.changePct);
  if (changePct !== undefined) parts.push(`${changePct > 0 ? "+" : ""}${changePct}%`);
  const volumeMultiplier = num(event.payload.volumeMultiplier);
  if (volumeMultiplier !== undefined) parts.push(`${volumeMultiplier}×`);
  const volatilityPct = num(event.payload.volatilityPct);
  if (volatilityPct !== undefined) parts.push(`${volatilityPct}%`);
  if (event.occurrences > 1) parts.push(`×${event.occurrences}`);
  return parts.join(" · ");
}

export function quietHoursSummary(rule: MonitorRule): string {
  if (rule.quietHours === null) return "";
  const quiet = rule.quietHours ?? { startHour: 22, endHour: 7 };
  const pad = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
  return `${pad(quiet.startHour)}–${pad(quiet.endHour)}`;
}

export function ruleThresholdSummary(rule: MonitorRule): string {
  const parts: string[] = [];
  const thresholds = rule.thresholds;
  if (thresholds.priceAbove !== undefined) parts.push(`≥${thresholds.priceAbove}`);
  if (thresholds.priceBelow !== undefined) parts.push(`≤${thresholds.priceBelow}`);
  if (thresholds.changePct !== undefined) parts.push(`${thresholds.changePct}%`);
  if (thresholds.volumeMultiplier !== undefined) parts.push(`${thresholds.volumeMultiplier}×`);
  if (thresholds.volatilityPct !== undefined) parts.push(`${thresholds.volatilityPct}%`);
  return parts.join(" · ");
}

export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function draftMonitorRule(rule?: MonitorRule): MonitorRuleDraft {
  const quiet = rule?.quietHours === undefined ? { startHour: 22, endHour: 7 } : rule.quietHours;
  return {
    title: rule?.title ?? "",
    targetType: rule?.targetType === "portfolio" ? "portfolio" : "symbol",
    targetId: rule?.targetId ?? "",
    market: rule?.market ?? "",
    level: rule?.level ?? "ARCHIVE",
    cooldown: String(rule?.cooldownMinutes ?? 240),
    interval: String(rule?.intervalMinutes ?? 5),
    quietEnabled: quiet !== null && quiet !== undefined,
    quietStart: String(quiet?.startHour ?? 22),
    quietEnd: String(quiet?.endHour ?? 7),
    channels: rule?.channels.length ? [...rule.channels] : ["apns", "fcm"],
    kinds: rule?.eventKinds.length ? [...rule.eventKinds] : ["PRICE_ABOVE"],
    thresholds: {
      priceAbove:
        rule?.thresholds.priceAbove !== undefined ? String(rule.thresholds.priceAbove) : "",
      priceBelow:
        rule?.thresholds.priceBelow !== undefined ? String(rule.thresholds.priceBelow) : "",
      changePct: rule?.thresholds.changePct !== undefined ? String(rule.thresholds.changePct) : "",
      volumeMultiplier:
        rule?.thresholds.volumeMultiplier !== undefined
          ? String(rule.thresholds.volumeMultiplier)
          : "",
      volatilityPct:
        rule?.thresholds.volatilityPct !== undefined ? String(rule.thresholds.volatilityPct) : "",
    },
  };
}

function thresholdFieldOf(kind: MonitorEventKind): ThresholdField | undefined {
  return THRESHOLD_KINDS[kind as keyof typeof THRESHOLD_KINDS] as ThresholdField | undefined;
}

/**
 * 草稿 → API 输入。`create=false` 时不回传 targetType/targetId：
 * 服务端更新接口不支持改监控对象。
 */
export function buildMonitorRuleInput(
  draft: MonitorRuleDraft,
  create: boolean,
): MonitorRuleBuildResult {
  if (!draft.targetId.trim()) return { error: "target" };
  if (!draft.kinds.length) return { error: "kinds" };
  if (!draft.channels.length) return { error: "channels" };
  const cooldownMinutes = Number.parseInt(draft.cooldown, 10);
  if (!Number.isFinite(cooldownMinutes) || cooldownMinutes < 30 || cooldownMinutes > 1440)
    return { error: "cooldown" };
  const intervalMinutes = Number.parseInt(draft.interval, 10);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 60)
    return { error: "interval" };
  const quietStart = Number.parseInt(draft.quietStart, 10);
  const quietEnd = Number.parseInt(draft.quietEnd, 10);
  if (
    draft.quietEnabled &&
    (!Number.isFinite(quietStart) ||
      !Number.isFinite(quietEnd) ||
      quietStart < 0 ||
      quietStart > 23 ||
      quietEnd < 0 ||
      quietEnd > 23)
  )
    return { error: "quiet" };
  const thresholds: MonitorThresholds = {};
  for (const kind of draft.kinds) {
    const field = thresholdFieldOf(kind);
    if (!field) continue;
    const raw = draft.thresholds[field];
    const parsed = Number(raw);
    if (!raw.trim() || !Number.isFinite(parsed) || parsed <= 0) return { error: "threshold", kind };
    thresholds[field] = parsed;
  }
  return {
    input: {
      ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
      ...(create ? { targetType: draft.targetType, targetId: draft.targetId.trim() } : {}),
      ...(draft.market ? { market: draft.market } : {}),
      eventKinds: draft.kinds,
      level: draft.level,
      cooldownMinutes,
      intervalMinutes,
      quietHours: draft.quietEnabled ? { startHour: quietStart, endHour: quietEnd } : null,
      thresholds,
      channels: draft.channels,
    },
  };
}

export interface MonitorsState {
  status: "idle" | "loading" | "ready" | "error";
  today?: TodayData;
  rules: MonitorRule[];
  rulesStatus: "idle" | "loading" | "ready" | "error";
  error?: string;
}

const INITIAL_STATE: MonitorsState = { status: "idle", rules: [], rulesStatus: "idle" };

let state: MonitorsState = INITIAL_STATE;
const listeners = new Set<() => void>();
let loadKey = "";
let loadRequest: Promise<void> | undefined;
let rulesRequest: Promise<void> | undefined;

function setState(next: Partial<MonitorsState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMonitorsState() {
  return useSyncExternalStore(subscribe, () => state);
}

/** 非 React 环境（单测/脚本）读取当前快照。 */
export function monitorsSnapshot() {
  return state;
}

/** 单测用：清空缓存与订阅状态。 */
export function resetMonitorsStore() {
  state = INITIAL_STATE;
  loadKey = "";
  loadRequest = undefined;
  rulesRequest = undefined;
  for (const listener of listeners) listener();
}

/** Today 的首屏数据：一次 `/api/today` 读回分组、预算与规则。 */
export function loadMonitors(api: LingWuApi, force = false): Promise<void> {
  const key = api.token;
  if (!force && state.status === "ready" && loadKey === key) return Promise.resolve();
  if (loadRequest) return loadRequest;
  if (!state.today) setState({ status: "loading" });
  const request = (async () => {
    try {
      const payload = await api.request<unknown>("/api/today");
      const today = parseToday(payload);
      if (!today) throw new Error("Unexpected today payload");
      loadKey = key;
      setState({
        status: "ready",
        today,
        rules: today.rules.length ? today.rules : state.rules,
        rulesStatus: "ready",
        error: undefined,
      });
    } catch (error) {
      setState({
        status: state.today ? "ready" : "error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      loadRequest = undefined;
    }
  })();
  loadRequest = request;
  return request;
}

export function loadMonitorRules(api: LingWuApi, force = false): Promise<void> {
  if (!force && state.rulesStatus === "ready") return Promise.resolve();
  if (rulesRequest) return rulesRequest;
  if (!state.rules.length) setState({ rulesStatus: "loading" });
  const request = (async () => {
    try {
      const rules = parseMonitorRules(await api.request<unknown>("/api/monitors/rules"));
      if (!rules) throw new Error("Unexpected monitor rules payload");
      setState({ rules, rulesStatus: "ready", error: undefined });
    } catch (error) {
      setState({
        rulesStatus: state.rules.length ? "ready" : "error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      rulesRequest = undefined;
    }
  })();
  rulesRequest = request;
  return request;
}

function requireRule(payload: unknown): MonitorRule {
  const rule = parseMonitorRule(payload);
  if (!rule) throw new Error("Unexpected monitor rule payload");
  return rule;
}

export async function createMonitorRule(
  api: LingWuApi,
  input: MonitorRuleInput,
): Promise<MonitorRule> {
  const rule = requireRule(await api.request<unknown>("/api/monitors/rules", input, "POST"));
  setState({ rules: upsertMonitorRule(state.rules, rule), rulesStatus: "ready" });
  return rule;
}

export async function updateMonitorRule(
  api: LingWuApi,
  id: string,
  input: Partial<MonitorRuleInput>,
): Promise<MonitorRule> {
  const rule = requireRule(
    await api.request<unknown>(`/api/monitors/rules/${encodeURIComponent(id)}`, input, "PUT"),
  );
  setState({ rules: upsertMonitorRule(state.rules, rule), rulesStatus: "ready" });
  return rule;
}

export async function deleteMonitorRule(api: LingWuApi, id: string): Promise<void> {
  await api.request(`/api/monitors/rules/${encodeURIComponent(id)}`, undefined, "DELETE");
  setState({ rules: removeMonitorRule(state.rules, id) });
}

export async function controlMonitorRule(
  api: LingWuApi,
  id: string,
  action: "pause" | "resume" | "check",
): Promise<MonitorRule | undefined> {
  const payload = await api.request<unknown>(
    `/api/monitors/rules/${encodeURIComponent(id)}/control`,
    { action },
    "POST",
  );
  if (action === "check") return undefined;
  const rule = parseMonitorRule(payload);
  if (rule) setState({ rules: upsertMonitorRule(state.rules, rule) });
  return rule;
}

export interface DismissResult {
  event: MonitorEvent;
  accelerated: boolean;
}

/** 「不必要 / 有用」反馈；成功后立即从 Today 分组移除该事件。 */
export async function dismissMonitorEvent(
  api: LingWuApi,
  eventId: string,
  reason: DismissReason = "unnecessary",
): Promise<DismissResult> {
  const payload = await api.request<unknown>(
    `/api/monitors/events/${encodeURIComponent(eventId)}/dismiss`,
    { reason },
    "POST",
  );
  const record = isRecord(payload) ? payload : {};
  const event = parseMonitorEvent(record.event);
  if (!event) throw new Error("Unexpected monitor dismissal payload");
  const rule = parseMonitorRule(record.rule);
  setState({
    today: state.today ? removeMonitorEvent(state.today, eventId) : state.today,
    ...(rule ? { rules: upsertMonitorRule(state.rules, rule) } : {}),
  });
  return { event, accelerated: record.accelerated === true };
}

export async function setAttentionBudget(api: LingWuApi, limit: number): Promise<TodayBudget> {
  const payload = await api.request<unknown>("/api/monitors/budget", { limit }, "PUT");
  const parsed = parseBudget(payload);
  if (!parsed) throw new Error("Unexpected budget payload");
  const budget: TodayBudget = { ...parsed, downgradedCount: parsed.downgradedCount };
  setState({
    today: state.today ? { ...state.today, budget } : state.today,
  });
  return budget;
}
