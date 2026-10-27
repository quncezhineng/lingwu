import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PriceAlert } from "../../../../packages/domain/src/agent.ts";
import {
  MarketDataError,
  type MarketDataService,
  normalizeYahooSymbol,
  type Quote,
} from "../../../../packages/integrations/src/market-data.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

const ALERT_KIND = "price_alerts";
const DEFAULT_INTERVAL_MINUTES = 15;
export const NOTIFICATION_DEDUPE_MS = 24 * 60 * 60 * 1000;

const symbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[A-Za-z0-9^=.-]+$/, "Invalid symbol");
const thresholdTypeSchema = z.enum(["PRICE_ABOVE", "PRICE_BELOW", "CHANGE_PCT"]);

export const createPriceAlertSchema = z.object({
  symbol_code: symbolSchema,
  threshold_type: thresholdTypeSchema,
  threshold_value: z.number().finite(),
  enabled: z.boolean().default(true),
  interval_minutes: z.number().int().min(1).max(1440).default(DEFAULT_INTERVAL_MINUTES),
});

export const updatePriceAlertSchema = z
  .object({
    threshold_type: thresholdTypeSchema.optional(),
    threshold_value: z.number().finite().optional(),
    enabled: z.boolean().optional(),
    interval_minutes: z.number().int().min(1).max(1440).optional(),
  })
  .refine(
    (value) =>
      value.threshold_type !== undefined ||
      value.threshold_value !== undefined ||
      value.enabled !== undefined ||
      value.interval_minutes !== undefined,
    { message: "Provide at least one field to update" },
  );

export type CreatePriceAlertInput = z.infer<typeof createPriceAlertSchema>;
export type UpdatePriceAlertInput = z.infer<typeof updatePriceAlertSchema>;

export interface PriceAlertRecord extends PriceAlert {
  interval_minutes: number;
  last_checked_at?: string;
  last_notified_at?: string;
  next_check_at?: string;
  last_triggered_at?: string;
  last_error?: string;
}

export interface AlertCheckResult {
  alert: PriceAlertRecord;
  quote?: Quote;
  /** Whether the current quote satisfies the alert condition. */
  triggered: boolean;
  /** Whether a notification was actually created (false when deduplicated or disabled). */
  notified: boolean;
  reason?: "disabled" | "deduplicated" | "quote_unavailable" | "not_triggered";
  /** Real notification primary key, usable with POST /api/agent/notifications/:id/read. */
  notification_id?: string;
  /** Dedupe key used for this alert's daily notification bucket. */
  notification_key?: string;
  notification?: { id: string; title: string; body: string };
}

export type AlertNotifier = (
  title: string,
  body: string,
  key: string,
) => Promise<{ id: string; title: string; body: string }>;

function thresholdLabel(alert: PriceAlertRecord): string {
  switch (alert.threshold_type) {
    case "PRICE_ABOVE":
      return `价格高于 ${alert.threshold_value}`;
    case "PRICE_BELOW":
      return `价格低于 ${alert.threshold_value}`;
    case "CHANGE_PCT":
      return `日内涨跌幅达到 ${alert.threshold_value}%`;
  }
}

/** Evaluate one alert against a quote without touching storage. */
export function isTriggered(alert: PriceAlertRecord, quote: Quote): boolean {
  switch (alert.threshold_type) {
    case "PRICE_ABOVE":
      return quote.price >= alert.threshold_value;
    case "PRICE_BELOW":
      return quote.price <= alert.threshold_value;
    case "CHANGE_PCT":
      return Math.abs(quote.changePercent) >= Math.abs(alert.threshold_value);
  }
}

export class PriceAlertsService {
  constructor(
    private readonly db: Store,
    private readonly market: MarketDataService,
  ) {}

  async list(owner: string): Promise<PriceAlertRecord[]> {
    return this.db.list<PriceAlertRecord>(owner, ALERT_KIND);
  }

  private async require(owner: string, id: string): Promise<PriceAlertRecord> {
    const alert = await this.db.get<PriceAlertRecord>(owner, ALERT_KIND, id);
    if (!alert) throw new AppError("Price alert not found", 404);
    return alert;
  }

  async create(owner: string, input: CreatePriceAlertInput): Promise<PriceAlertRecord> {
    if (input.threshold_type === "CHANGE_PCT" && input.threshold_value <= 0)
      throw new AppError("CHANGE_PCT threshold must be positive", 422);
    if (input.threshold_type !== "CHANGE_PCT" && input.threshold_value <= 0)
      throw new AppError("Price thresholds must be positive", 422);
    const now = new Date();
    const alert: PriceAlertRecord = {
      id: randomUUID(),
      user_id: owner,
      symbol_code: normalizeYahooSymbol(input.symbol_code),
      threshold_type: input.threshold_type,
      threshold_value: input.threshold_value,
      enabled: input.enabled,
      interval_minutes: input.interval_minutes,
      created_at: now.toISOString(),
      next_check_at: now.toISOString(),
    };
    return this.db.put(owner, ALERT_KIND, alert);
  }

  async update(owner: string, id: string, input: UpdatePriceAlertInput): Promise<PriceAlertRecord> {
    const alert = await this.require(owner, id);
    const next: PriceAlertRecord = {
      ...alert,
      threshold_type: input.threshold_type ?? alert.threshold_type,
      threshold_value: input.threshold_value ?? alert.threshold_value,
      enabled: input.enabled ?? alert.enabled,
      interval_minutes: input.interval_minutes ?? alert.interval_minutes,
      ...(input.enabled === true ? { next_check_at: new Date().toISOString() } : {}),
    };
    if (next.threshold_type === "CHANGE_PCT" && next.threshold_value <= 0)
      throw new AppError("CHANGE_PCT threshold must be positive", 422);
    if (next.threshold_type !== "CHANGE_PCT" && next.threshold_value <= 0)
      throw new AppError("Price thresholds must be positive", 422);
    return this.db.put(owner, ALERT_KIND, next);
  }

  async remove(owner: string, id: string): Promise<void> {
    await this.require(owner, id);
    await this.db.remove(owner, ALERT_KIND, id);
  }

  /**
   * Check one alert. Notifications are deduplicated per alert for 24 hours, and a
   * disabled alert never notifies (this is the "off switch").
   */
  async check(
    owner: string,
    id: string,
    notify?: AlertNotifier,
    options: { now?: Date; force?: boolean } = {},
  ): Promise<AlertCheckResult> {
    const alert = await this.require(owner, id);
    const now = options.now ?? new Date();
    const checkedAt = now.toISOString();
    if (!alert.enabled) {
      const skipped: PriceAlertRecord = {
        ...alert,
        last_checked_at: checkedAt,
        next_check_at: new Date(now.getTime() + alert.interval_minutes * 60_000).toISOString(),
      };
      await this.db.put(owner, ALERT_KIND, skipped);
      return { alert: skipped, triggered: false, notified: false, reason: "disabled" };
    }

    let quote: Quote | undefined;
    try {
      quote = await this.market.getQuote(alert.symbol_code);
    } catch (error) {
      const detail = error instanceof MarketDataError ? error.kind : "provider_error";
      const updated: PriceAlertRecord = {
        ...alert,
        last_checked_at: checkedAt,
        last_error: detail,
        next_check_at: new Date(now.getTime() + alert.interval_minutes * 60_000).toISOString(),
      };
      await this.db.put(owner, ALERT_KIND, updated);
      return {
        alert: updated,
        triggered: false,
        notified: false,
        reason: "quote_unavailable",
      };
    }

    const triggered = isTriggered(alert, quote);
    let notified = false;
    let deduplicated = false;
    let notification: { id: string; title: string; body: string } | undefined;
    let notificationKey: string | undefined;

    if (triggered && notify) {
      const lastNotified = alert.last_notified_at ? Date.parse(alert.last_notified_at) : 0;
      deduplicated = !options.force && now.getTime() - lastNotified < NOTIFICATION_DEDUPE_MS;
      const bucket = Math.floor(now.getTime() / NOTIFICATION_DEDUPE_MS);
      notificationKey = `price-alert:${alert.id}:${bucket}`;
      if (!deduplicated) {
        const label = thresholdLabel(alert);
        const title = `${alert.symbol_code} 价格提醒`;
        const body = `${alert.symbol_code} 当前 ${quote.price}（${label}），日内 ${quote.changePercent.toFixed(2)}%。`;
        notification = await notify(title, body, notificationKey);
        notified = true;
      }
    }

    const updated: PriceAlertRecord = {
      ...alert,
      last_checked_at: checkedAt,
      next_check_at: new Date(now.getTime() + alert.interval_minutes * 60_000).toISOString(),
      ...(triggered ? { last_triggered_at: checkedAt } : {}),
      ...(notified ? { last_notified_at: checkedAt } : {}),
      last_error: undefined,
    };
    await this.db.put(owner, ALERT_KIND, updated);

    return {
      alert: updated,
      quote,
      triggered,
      notified,
      ...(triggered && !notified && deduplicated
        ? { reason: "deduplicated" as const }
        : triggered
          ? {}
          : { reason: "not_triggered" as const }),
      ...(notification ? { notification, notification_id: notification.id } : {}),
      ...(notificationKey ? { notification_key: notificationKey } : {}),
    };
  }

  /** Return true when an enabled alert's next check is due. */
  static isDue(alert: PriceAlertRecord, now = new Date()): boolean {
    if (!alert.enabled) return false;
    if (!alert.next_check_at) return true;
    return Date.parse(alert.next_check_at) <= now.getTime();
  }
}
