/**
 * 价格提醒（F3）数据层，对接 B6 `/api/price-alerts`。
 *
 * - GET    /api/price-alerts            → { alerts: PriceAlertRecord[] }
 * - POST   /api/price-alerts            → 201 PriceAlertRecord
 * - PUT    /api/price-alerts/:id        → PriceAlertRecord
 * - DELETE /api/price-alerts/:id        → 204
 * - POST   /api/price-alerts/:id/check  → { triggered, notified, reason?, quote?, notification_id? }
 */
import type { LingWuApi } from "./api";

export type ThresholdType = "PRICE_ABOVE" | "PRICE_BELOW" | "CHANGE_PCT";

export interface PriceAlertRecord {
  id: string;
  symbol_code: string;
  threshold_type: ThresholdType;
  threshold_value: number;
  enabled: boolean;
  interval_minutes: number;
  last_checked_at?: string;
  last_notified_at?: string;
  next_check_at?: string;
  last_triggered_at?: string;
  last_error?: string;
}

export interface CheckResult {
  triggered: boolean;
  notified: boolean;
  reason?: "disabled" | "deduplicated" | "quote_unavailable" | "not_triggered" | string;
  quote?: { price?: number; changePercent?: number };
  /** 通知表主键（F-06）；可直接用于 POST /api/agent/notifications/:id/read。 */
  notificationId?: string;
  /** 去重 key（旧字段，仅兜底展示，不参与读回逻辑）。 */
  notificationKey?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAlert(value: unknown): PriceAlertRecord | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.id !== "string" || typeof value.symbol_code !== "string") return undefined;
  const type = value.threshold_type;
  if (type !== "PRICE_ABOVE" && type !== "PRICE_BELOW" && type !== "CHANGE_PCT") return undefined;
  if (typeof value.threshold_value !== "number") return undefined;
  return {
    id: value.id,
    symbol_code: value.symbol_code,
    threshold_type: type,
    threshold_value: value.threshold_value,
    enabled: value.enabled !== false,
    interval_minutes: typeof value.interval_minutes === "number" ? value.interval_minutes : 15,
    last_checked_at: typeof value.last_checked_at === "string" ? value.last_checked_at : undefined,
    last_notified_at:
      typeof value.last_notified_at === "string" ? value.last_notified_at : undefined,
    next_check_at: typeof value.next_check_at === "string" ? value.next_check_at : undefined,
    last_triggered_at:
      typeof value.last_triggered_at === "string" ? value.last_triggered_at : undefined,
    last_error: typeof value.last_error === "string" ? value.last_error : undefined,
  };
}

export async function listPriceAlerts(api: LingWuApi): Promise<PriceAlertRecord[]> {
  const payload = await api.request<unknown>("/api/price-alerts");
  const raw = isRecord(payload) && Array.isArray(payload.alerts) ? payload.alerts : [];
  return raw.map(parseAlert).filter((item): item is PriceAlertRecord => !!item);
}

export async function createPriceAlert(
  api: LingWuApi,
  input: {
    symbol_code: string;
    threshold_type: ThresholdType;
    threshold_value: number;
    enabled?: boolean;
    interval_minutes?: number;
  },
): Promise<PriceAlertRecord> {
  const payload = await api.request<unknown>("/api/price-alerts", input);
  const parsed = parseAlert(payload);
  if (!parsed) throw new Error("Unexpected price alert payload");
  return parsed;
}

export async function updatePriceAlert(
  api: LingWuApi,
  id: string,
  patch: {
    threshold_type?: ThresholdType;
    threshold_value?: number;
    enabled?: boolean;
    interval_minutes?: number;
  },
): Promise<PriceAlertRecord> {
  const payload = await api.request<unknown>(
    `/api/price-alerts/${encodeURIComponent(id)}`,
    patch,
    "PUT",
  );
  const parsed = parseAlert(payload);
  if (!parsed) throw new Error("Unexpected price alert payload");
  return parsed;
}

export function deletePriceAlert(api: LingWuApi, id: string): Promise<unknown> {
  return api.request(`/api/price-alerts/${encodeURIComponent(id)}`, undefined, "DELETE");
}

export async function checkPriceAlert(api: LingWuApi, id: string): Promise<CheckResult> {
  const payload = await api.request<unknown>(
    `/api/price-alerts/${encodeURIComponent(id)}/check`,
    {},
  );
  const record = isRecord(payload) ? payload : {};
  const quote = isRecord(record.quote) ? record.quote : undefined;
  return {
    triggered: record.triggered === true,
    notified: record.notified === true,
    reason: typeof record.reason === "string" ? record.reason : undefined,
    quote: quote
      ? {
          price: typeof quote.price === "number" ? quote.price : undefined,
          changePercent: typeof quote.changePercent === "number" ? quote.changePercent : undefined,
        }
      : undefined,
    notificationId:
      typeof record.notification_id === "string"
        ? record.notification_id
        : typeof record.notificationId === "string"
          ? record.notificationId
          : undefined,
    notificationKey:
      typeof record.notification_key === "string"
        ? record.notification_key
        : typeof record.notificationKey === "string"
          ? record.notificationKey
          : undefined,
  };
}
