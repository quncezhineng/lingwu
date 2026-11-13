/**
 * 「盯」规则中心数据层（OPT-01）。
 *
 * 后端契约：
 * - GET    /api/monitor/today → 今日事件分组 + 预算 + 规则
 * - GET    /api/monitor/rules
 * - POST   /api/monitor/rules
 * - PUT    /api/monitor/rules/:id
 * - DELETE /api/monitor/rules/:id
 * - POST   /api/monitor/events/:id/dismiss
 * - PUT    /api/monitor/budget
 * - POST   /api/monitor/check
 */
import { useSyncExternalStore } from "react";
import type { LingWuApi } from "./api";

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
export type MonitorLevel = "MUST_KNOW" | "LATER" | "ARCHIVE";
export type MonitorEventState = "new" | "delivered" | "archived" | "dismissed" | "downgraded";
export type MonitorDeliveryChannel = "in_app" | "webhook";

export interface MonitorPriceCondition {
  thresholdType: "PRICE_ABOVE" | "PRICE_BELOW" | "CHANGE_PCT";
  thresholdValue: number;
}

export interface MonitorQuietHours {
  start: string;
  end: string;
  timeZone: string;
}

export interface MonitorRule {
  id: string;
  name?: string;
  targetType: MonitorTargetType;
  targetId: string;
  market: MonitorMarket;
  eventKinds: MonitorEventKind[];
  level: MonitorLevel;
  cooldownMinutes: number;
  intervalMinutes: number;
  enabled: boolean;
  channels: MonitorDeliveryChannel[];
  webhookUrl?: string;
  quietHours?: MonitorQuietHours;
  price?: MonitorPriceCondition;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  lastError?: string;
  disabledReason?: string;
}

export interface MonitorEvent {
  id: string;
  ruleId: string;
  ruleName?: string;
  kind: MonitorEventKind;
  originalLevel: MonitorLevel;
  level: MonitorLevel;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  detectedAt: string;
  marketDate: string;
  state: MonitorEventState;
  reason?: string;
  digestAt?: string;
}

export interface AttentionBudget {
  date: string;
  limit: number;
  used: number;
  downgradedCount: number;
}

export interface MonitorToday {
  date: string;
  budget: AttentionBudget;
  mustKnow: MonitorEvent[];
  later: MonitorEvent[];
  archive: MonitorEvent[];
  rules: MonitorRule[];
}

export interface MonitorRuleInput {
  name?: string;
  targetType: MonitorTargetType;
  targetId: string;
  market: MonitorMarket;
  eventKinds: MonitorEventKind[];
  level: MonitorLevel;
  cooldownMinutes: number;
  intervalMinutes: number;
  enabled: boolean;
  channels: MonitorDeliveryChannel[];
  webhookUrl?: string;
  quietHours?: MonitorQuietHours;
  price?: MonitorPriceCondition;
}

export const MONITOR_MARKETS: MonitorMarket[] = ["CN", "HK", "US"];
export const MONITOR_EVENT_KINDS: MonitorEventKind[] = [
  "PRICE_MOVE",
  "EARNINGS",
  "ANNOUNCEMENT",
  "DIVIDEND",
  "HALT",
  "RATING_CHANGE",
  "NEWS",
  "THESIS_SIGNAL",
  "PAGE_CHANGE",
];
export const MONITOR_LEVELS: MonitorLevel[] = ["MUST_KNOW", "LATER", "ARCHIVE"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function market(value: unknown): MonitorMarket {
  return value === "HK" || value === "US" ? value : "CN";
}
function targetType(value: unknown): MonitorTargetType {
  return value === "portfolio" || value === "thesis" || value === "page" ? value : "symbol";
}
function eventKind(value: unknown): MonitorEventKind | undefined {
  return MONITOR_EVENT_KINDS.includes(value as MonitorEventKind)
    ? (value as MonitorEventKind)
    : undefined;
}
function level(value: unknown): MonitorLevel {
  return value === "MUST_KNOW" || value === "ARCHIVE" ? value : "LATER";
}
function eventState(value: unknown): MonitorEventState {
  return value === "delivered" ||
    value === "archived" ||
    value === "dismissed" ||
    value === "downgraded"
    ? value
    : "new";
}

function parsePrice(value: unknown): MonitorPriceCondition | undefined {
  if (!isRecord(value)) return undefined;
  const thresholdType =
    value.threshold_type === "PRICE_ABOVE" || value.threshold_type === "PRICE_BELOW"
      ? value.threshold_type
      : value.threshold_type === "CHANGE_PCT"
        ? "CHANGE_PCT"
        : undefined;
  const thresholdValue = num(value.threshold_value);
  return thresholdType && thresholdValue !== undefined
    ? { thresholdType, thresholdValue }
    : undefined;
}

function parseQuietHours(value: unknown): MonitorQuietHours | undefined {
  if (!isRecord(value)) return undefined;
  const start = str(value.start);
  const end = str(value.end);
  if (!start || !end) return undefined;
  return { start, end, timeZone: str(value.time_zone) ?? "Asia/Shanghai" };
}

export function parseMonitorRule(value: unknown): MonitorRule | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const targetId = str(value.target_id) ?? str(value.targetId);
  if (!id || !targetId) return undefined;
  const kinds = Array.isArray(value.event_kinds)
    ? value.event_kinds.flatMap((entry) => {
        const kind = eventKind(entry);
        return kind ? [kind] : [];
      })
    : [];
  if (!kinds.length) return undefined;
  return {
    id,
    name: str(value.name),
    targetType: targetType(value.target_type ?? value.targetType),
    targetId,
    market: market(value.market),
    eventKinds: kinds,
    level: level(value.level),
    cooldownMinutes: num(value.cooldown_minutes) ?? 240,
    intervalMinutes: num(value.interval_minutes) ?? 5,
    enabled: value.enabled !== false,
    channels: Array.isArray(value.channels)
      ? value.channels.filter(
          (channel): channel is MonitorDeliveryChannel =>
            channel === "in_app" || channel === "webhook",
        )
      : ["in_app"],
    webhookUrl: str(value.webhook_url),
    quietHours: parseQuietHours(value.quiet_hours),
    price: parsePrice(value.price),
    createdAt: str(value.created_at) ?? new Date().toISOString(),
    updatedAt: str(value.updated_at) ?? new Date().toISOString(),
    lastCheckedAt: str(value.last_checked_at),
    lastError: str(value.last_error),
    disabledReason: str(value.disabled_reason),
  };
}

export function parseMonitorEvent(value: unknown): MonitorEvent | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const ruleId = str(value.rule_id) ?? str(value.ruleId);
  const kind = eventKind(value.kind);
  const title = str(value.title);
  const detectedAt = str(value.detected_at) ?? str(value.detectedAt);
  if (!id || !ruleId || !kind || !title || !detectedAt) return undefined;
  return {
    id,
    ruleId,
    ruleName: str(value.rule_name),
    kind,
    originalLevel: level(value.original_level),
    level: level(value.level),
    title,
    body: str(value.body) ?? "",
    payload: isRecord(value.payload) ? value.payload : {},
    detectedAt,
    marketDate: str(value.market_date) ?? detectedAt.slice(0, 10),
    state: eventState(value.state),
    reason: str(value.reason),
    digestAt: str(value.digest_at),
  };
}

export function parseBudget(value: unknown): AttentionBudget | undefined {
  if (!isRecord(value)) return undefined;
  const date = str(value.date);
  if (!date) return undefined;
  return {
    date,
    limit: num(value.limit) ?? 5,
    used: num(value.used) ?? 0,
    downgradedCount: num(value.downgraded_count) ?? 0,
  };
}

export function parseMonitorToday(value: unknown): MonitorToday | undefined {
  if (!isRecord(value)) return undefined;
  const date = str(value.date);
  const budget = parseBudget(value.budget);
  if (!date || !budget) return undefined;
  const events = (key: string) =>
    Array.isArray(value[key])
      ? value[key].map(parseMonitorEvent).filter((item): item is MonitorEvent => !!item)
      : [];
  return {
    date,
    budget,
    mustKnow: events("must_know"),
    later: events("later"),
    archive: events("archive"),
    rules: Array.isArray(value.rules)
      ? value.rules.map(parseMonitorRule).filter((item): item is MonitorRule => !!item)
      : [],
  };
}

function toApiInput(input: MonitorRuleInput) {
  return {
    ...(input.name ? { name: input.name } : {}),
    target_type: input.targetType,
    target_id: input.targetId,
    market: input.market,
    event_kinds: input.eventKinds,
    level: input.level,
    cooldown_minutes: input.cooldownMinutes,
    interval_minutes: input.intervalMinutes,
    enabled: input.enabled,
    channels: input.channels,
    ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
    ...(input.quietHours
      ? {
          quiet_hours: {
            start: input.quietHours.start,
            end: input.quietHours.end,
            time_zone: input.quietHours.timeZone,
          },
        }
      : {}),
    ...(input.price
      ? {
          price: {
            threshold_type: input.price.thresholdType,
            threshold_value: input.price.thresholdValue,
          },
        }
      : {}),
  };
}

interface MonitorState {
  status: "loading" | "ready";
  source: "mock" | "api";
  today?: MonitorToday;
  error?: string;
  tabRequested: boolean;
}

let state: MonitorState = { status: "loading", source: "mock", tabRequested: false };
const listeners = new Set<() => void>();
let loadKey = "";
let loadRequest: Promise<void> | undefined;

function setState(next: Partial<MonitorState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMonitorState() {
  return useSyncExternalStore(subscribe, () => state);
}

export function monitorSnapshot() {
  return state;
}

export function requestMonitorTab() {
  setState({ tabRequested: true });
}

/** 消费一次「打开盯盘中心」的意图，避免每次进入任务页都被强行切 tab。 */
export function consumeMonitorTab(): boolean {
  if (!state.tabRequested) return false;
  setState({ tabRequested: false });
  return true;
}

export function loadMonitor(api: LingWuApi, force = false): Promise<void> {
  const key = api.token;
  if (!force && state.status === "ready" && loadKey === key) return Promise.resolve();
  if (loadRequest) return loadRequest;
  if (!state.today) setState({ status: "loading" });
  const request = (async () => {
    try {
      const today = parseMonitorToday(await api.request<unknown>("/api/monitor/today"));
      if (!today) throw new Error("Unexpected monitor payload");
      loadKey = key;
      setState({ status: "ready", source: "api", today, error: undefined });
    } catch (error) {
      setState({
        status: "ready",
        source: "mock",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      loadRequest = undefined;
    }
  })();
  loadRequest = request;
  return request;
}

export async function createMonitorRule(
  api: LingWuApi,
  input: MonitorRuleInput,
): Promise<MonitorRule> {
  const rule = parseMonitorRule(
    await api.request<unknown>("/api/monitor/rules", toApiInput(input)),
  );
  if (!rule) throw new Error("Unexpected monitor rule payload");
  await loadMonitor(api, true);
  return rule;
}

export async function updateMonitorRule(
  api: LingWuApi,
  id: string,
  patch: Partial<MonitorRuleInput> & { enabled?: boolean },
): Promise<MonitorRule> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.targetType) body.target_type = patch.targetType;
  if (patch.targetId) body.target_id = patch.targetId;
  if (patch.market) body.market = patch.market;
  if (patch.eventKinds) body.event_kinds = patch.eventKinds;
  if (patch.level) body.level = patch.level;
  if (patch.cooldownMinutes !== undefined) body.cooldown_minutes = patch.cooldownMinutes;
  if (patch.intervalMinutes !== undefined) body.interval_minutes = patch.intervalMinutes;
  if (patch.enabled !== undefined) body.enabled = patch.enabled;
  if (patch.channels) body.channels = patch.channels;
  if (patch.webhookUrl !== undefined) body.webhook_url = patch.webhookUrl || null;
  if (patch.quietHours)
    body.quiet_hours = {
      start: patch.quietHours.start,
      end: patch.quietHours.end,
      time_zone: patch.quietHours.timeZone,
    };
  if (patch.price)
    body.price = {
      threshold_type: patch.price.thresholdType,
      threshold_value: patch.price.thresholdValue,
    };
  const rule = parseMonitorRule(
    await api.request<unknown>(`/api/monitor/rules/${encodeURIComponent(id)}`, body, "PUT"),
  );
  if (!rule) throw new Error("Unexpected monitor rule payload");
  await loadMonitor(api, true);
  return rule;
}

export async function deleteMonitorRule(api: LingWuApi, id: string): Promise<void> {
  await api.request(`/api/monitor/rules/${encodeURIComponent(id)}`, undefined, "DELETE");
  await loadMonitor(api, true);
}

export async function dismissMonitorEvent(api: LingWuApi, id: string): Promise<void> {
  await api.request(`/api/monitor/events/${encodeURIComponent(id)}/dismiss`, {});
  await loadMonitor(api, true);
}

export async function setAttentionBudget(api: LingWuApi, limit: number): Promise<void> {
  await api.request("/api/monitor/budget", { limit }, "PUT");
  await loadMonitor(api, true);
}

export async function runMonitorCheck(api: LingWuApi): Promise<void> {
  await api.request("/api/monitor/check", {});
  await loadMonitor(api, true);
}
