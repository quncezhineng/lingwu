import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AttentionBudget,
  InvestmentNote,
  MonitorDeliveryChannel,
  MonitorDeliveryLog,
  MonitorEvent,
  MonitorEventKind,
  MonitorLevel,
  MonitorMarket,
  MonitorRule,
  MonitorToday,
} from "../../../../packages/domain/src/agent.ts";
import type {
  MarketDataService,
  Quote,
} from "../../../../packages/integrations/src/market-data.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

const RULE_KIND = "monitor_rules";
const EVENT_KIND = "monitor_events";
const DELIVERY_KIND = "monitor_deliveries";
const BUDGET_KIND = "attention_budgets";

export const DEFAULT_ATTENTION_BUDGET = 5;
const DEFAULT_COOLDOWN_MINUTES = 240;
const DEFAULT_QUIET_HOURS = { start: "22:00", end: "07:00", time_zone: "Asia/Shanghai" };

/** L2 事件：财报、公告、分红、停复牌。允许穿透静默期。 */
const L2_KINDS: MonitorEventKind[] = ["EARNINGS", "ANNOUNCEMENT", "DIVIDEND", "HALT"];
/** 需要交易日历判断的事件；非交易日只归档，不推送。 */
const MARKET_BOUND_KINDS: MonitorEventKind[] = ["PRICE_MOVE", ...L2_KINDS];

const DEFAULT_LEVEL: Record<MonitorEventKind, MonitorLevel> = {
  PRICE_MOVE: "ARCHIVE",
  EARNINGS: "MUST_KNOW",
  ANNOUNCEMENT: "MUST_KNOW",
  DIVIDEND: "MUST_KNOW",
  HALT: "MUST_KNOW",
  RATING_CHANGE: "LATER",
  NEWS: "LATER",
  THESIS_SIGNAL: "MUST_KNOW",
  PAGE_CHANGE: "LATER",
};

const MARKET_TIME_ZONE: Record<MonitorMarket, string> = {
  CN: "Asia/Shanghai",
  HK: "Asia/Shanghai",
  US: "America/New_York",
};

/**
 * 2026 年主要休市日。交易日历不追求交易所全量规则，但足以避免
 * 周末与主要节假日把 L1/L2 事件推到用户面前；数据源缺失时宁可少报。
 */
const MARKET_HOLIDAYS: Record<MonitorMarket, ReadonlySet<string>> = {
  CN: new Set([
    "2026-01-01",
    "2026-02-16",
    "2026-02-17",
    "2026-02-18",
    "2026-02-19",
    "2026-02-20",
    "2026-04-06",
    "2026-05-01",
    "2026-06-19",
    "2026-09-25",
    "2026-10-01",
    "2026-10-02",
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
  ]),
  HK: new Set([
    "2026-01-01",
    "2026-02-17",
    "2026-02-18",
    "2026-02-19",
    "2026-04-03",
    "2026-04-06",
    "2026-05-01",
    "2026-05-25",
    "2026-06-19",
    "2026-07-01",
    "2026-10-01",
    "2026-10-19",
    "2026-12-25",
  ]),
  US: new Set([
    "2026-01-01",
    "2026-01-19",
    "2026-02-16",
    "2026-04-03",
    "2026-05-25",
    "2026-06-19",
    "2026-07-03",
    "2026-09-07",
    "2026-11-26",
    "2026-12-25",
  ]),
};

const eventKindSchema = z.enum([
  "PRICE_MOVE",
  "EARNINGS",
  "ANNOUNCEMENT",
  "DIVIDEND",
  "HALT",
  "RATING_CHANGE",
  "NEWS",
  "THESIS_SIGNAL",
  "PAGE_CHANGE",
]);
const levelSchema = z.enum(["MUST_KNOW", "LATER", "ARCHIVE"]);
const marketSchema = z.enum(["CN", "HK", "US"]);
const channelSchema = z.enum(["in_app", "webhook"]);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm");

const priceSchema = z.object({
  threshold_type: z.enum(["PRICE_ABOVE", "PRICE_BELOW", "CHANGE_PCT"]),
  threshold_value: z.number().finite().positive(),
});

const quietHoursSchema = z.object({
  start: timeSchema,
  end: timeSchema,
  time_zone: z.string().trim().min(1).max(64).default("Asia/Shanghai"),
});

const ruleFields = {
  name: z.string().trim().max(80).optional(),
  target_type: z.enum(["symbol", "portfolio", "thesis", "page"]),
  target_id: z.string().trim().min(1).max(200),
  market: marketSchema.default("CN"),
  event_kinds: z.array(eventKindSchema).min(1).max(12),
  level: levelSchema.optional(),
  cooldown_minutes: z.number().int().min(0).max(1440).default(DEFAULT_COOLDOWN_MINUTES),
  interval_minutes: z.number().int().min(1).max(1440).default(5),
  enabled: z.boolean().default(true),
  channels: z.array(channelSchema).min(1).max(2).default(["in_app"]),
  webhook_url: z.string().url().max(1000).optional(),
  quiet_hours: quietHoursSchema.optional(),
  price: priceSchema.optional(),
};

export const createMonitorRuleSchema = z.object(ruleFields).superRefine((value, ctx) => {
  if (value.event_kinds.includes("PRICE_MOVE") && !value.price)
    ctx.addIssue({ code: "custom", message: "PRICE_MOVE rules need a price condition" });
  if (value.channels.includes("webhook") && !value.webhook_url)
    ctx.addIssue({ code: "custom", message: "Webhook delivery needs webhook_url" });
});

export const updateMonitorRuleSchema = z
  .object({
    ...ruleFields,
    target_type: ruleFields.target_type.optional(),
    target_id: ruleFields.target_id.optional(),
    market: marketSchema.optional(),
    event_kinds: z.array(eventKindSchema).min(1).max(12).optional(),
    cooldown_minutes: z.number().int().min(0).max(1440).optional(),
    interval_minutes: z.number().int().min(1).max(1440).optional(),
    enabled: z.boolean().optional(),
    channels: z.array(channelSchema).min(1).max(2).optional(),
    quiet_hours: quietHoursSchema.nullable().optional(),
    price: priceSchema.nullable().optional(),
    webhook_url: z.string().url().max(1000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const ingestMonitorEventSchema = z.object({
  rule_id: z.string().uuid().optional(),
  target_type: z.enum(["symbol", "portfolio", "thesis", "page"]).optional(),
  target_id: z.string().trim().min(1).max(200).optional(),
  kind: eventKindSchema,
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().max(500).default(""),
  payload: z.record(z.string(), z.unknown()).default({}),
  dedupe_key: z.string().trim().max(300).optional(),
  detected_at: z.string().datetime().optional(),
});

export const attentionBudgetSchema = z.object({
  limit: z.number().int().min(1).max(10),
});

export type CreateMonitorRuleInput = z.infer<typeof createMonitorRuleSchema>;
export type UpdateMonitorRuleInput = z.infer<typeof updateMonitorRuleSchema>;
export type IngestMonitorEventInput = z.input<typeof ingestMonitorEventSchema>;

export type MonitorNotifier = (
  owner: string,
  title: string,
  body: string,
  key: string,
) => Promise<{ id: string }>;

export interface MonitorEngineDeps {
  notify?: MonitorNotifier;
  now?: () => Date;
  fetch?: typeof fetch;
}

export function dateInTimeZone(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function hourMinuteInTimeZone(at: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { hour: get("hour"), minute: get("minute") };
}

function weekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function marketDate(market: MonitorMarket, at: Date): string {
  return dateInTimeZone(at, MARKET_TIME_ZONE[market]);
}

export function isTradingDay(market: MonitorMarket, date: string): boolean {
  return !weekend(date) && !MARKET_HOLIDAYS[market].has(date);
}

export function inQuietHours(
  quietHours: { start: string; end: string; time_zone: string } | undefined,
  at: Date,
): boolean {
  const { start, end, time_zone } = quietHours ?? DEFAULT_QUIET_HOURS;
  const { hour, minute } = hourMinuteInTimeZone(at, time_zone);
  const current = hour * 60 + minute;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const from = startHour * 60 + startMinute;
  const to = endHour * 60 + endMinute;
  // 22:00–07:00 跨午夜。
  return from <= to ? current >= from && current < to : current >= from || current < to;
}

export function isL2Kind(kind: MonitorEventKind): boolean {
  return L2_KINDS.includes(kind);
}

function localDate(ownerDate: Date): string {
  return dateInTimeZone(ownerDate, DEFAULT_QUIET_HOURS.time_zone);
}

function budgetId(owner: string, date: string) {
  return `${owner}:${date}`;
}

function effectiveLevel(rule: MonitorRule): MonitorLevel {
  return rule.level;
}

function ruleMatches(
  rule: MonitorRule,
  input: { target_type?: string; target_id?: string; kind: MonitorEventKind },
) {
  if (!rule.enabled) return false;
  if (!rule.event_kinds.includes(input.kind)) return false;
  if (input.target_type && rule.target_type !== input.target_type) return false;
  if (input.target_id && rule.target_id !== input.target_id) return false;
  return true;
}

function eventTitle(rule: MonitorRule, kind: MonitorEventKind, title: string): string {
  const name = rule.name ?? rule.target_id;
  return title || `${name} · ${kind}`;
}

export class MonitorEngine {
  private readonly now: () => Date;
  private readonly fetcher: typeof fetch;
  constructor(
    private readonly db: Store,
    private readonly market: MarketDataService,
    private readonly deps: MonitorEngineDeps = {},
  ) {
    this.now = deps.now ?? (() => new Date());
    this.fetcher = deps.fetch ?? fetch;
  }

  async listRules(owner: string): Promise<MonitorRule[]> {
    return this.db.list<MonitorRule>(owner, RULE_KIND);
  }

  private async requireRule(owner: string, id: string): Promise<MonitorRule> {
    const rule = await this.db.get<MonitorRule>(owner, RULE_KIND, id);
    if (!rule) throw new AppError("Monitor rule not found", 404);
    return rule;
  }

  async createRule(owner: string, input: CreateMonitorRuleInput): Promise<MonitorRule> {
    const at = this.now().toISOString();
    const rule: MonitorRule = {
      id: randomUUID(),
      user_id: owner,
      ...(input.name ? { name: input.name } : {}),
      target_type: input.target_type,
      target_id: input.target_id,
      market: input.market,
      event_kinds: input.event_kinds,
      level: input.level ?? DEFAULT_LEVEL[input.event_kinds[0] ?? "NEWS"],
      cooldown_minutes: input.cooldown_minutes,
      interval_minutes: input.interval_minutes,
      enabled: input.enabled,
      channels: input.channels,
      ...(input.webhook_url ? { webhook_url: input.webhook_url } : {}),
      ...(input.quiet_hours ? { quiet_hours: input.quiet_hours } : {}),
      ...(input.price ? { price: input.price } : {}),
      created_at: at,
      updated_at: at,
    };
    return this.db.put(owner, RULE_KIND, rule);
  }

  /**
   * OPT-02 → OPT-01 L4：把论点的证伪条件注册成一条盯盘规则。
   * 价格条件能解析出数字时同时启用 L1 巡检；命中后写入 THESIS_SIGNAL，
   * 而不是普通的 PRICE_MOVE，便于 Today 直接提示「论点可能被证伪」。
   */
  async createThesisRule(owner: string, note: InvestmentNote): Promise<MonitorRule> {
    if (note.type !== "THESIS" || !note.falsify_condition)
      throw new AppError("Thesis has no falsification condition", 422);
    const condition = note.falsify_condition;
    const threshold = Number.parseFloat(condition.expression.match(/-?\d+(?:\.\d+)?/)?.[0] ?? "");
    const supportsPrice =
      (condition.kind === "PRICE_ABOVE" ||
        condition.kind === "PRICE_BELOW" ||
        condition.kind === "CHANGE_PCT") &&
      Number.isFinite(threshold) &&
      threshold > 0;
    const market: MonitorMarket = note.symbol_code.endsWith(".HK")
      ? "HK"
      : note.symbol_code.endsWith(".SH") ||
          note.symbol_code.endsWith(".SZ") ||
          note.symbol_code.endsWith(".SS")
        ? "CN"
        : "US";
    return this.createRule(owner, {
      name: `${note.symbol_code} 证伪条件`,
      target_type: "thesis",
      target_id: note.id,
      market,
      event_kinds: supportsPrice ? ["THESIS_SIGNAL", "PRICE_MOVE"] : ["THESIS_SIGNAL"],
      level: "MUST_KNOW",
      cooldown_minutes: DEFAULT_COOLDOWN_MINUTES,
      interval_minutes: 5,
      enabled: true,
      channels: ["in_app"],
      ...(supportsPrice
        ? {
            price: {
              threshold_type: condition.kind as "PRICE_ABOVE" | "PRICE_BELOW" | "CHANGE_PCT",
              threshold_value: threshold,
            },
          }
        : {}),
    });
  }

  async updateRule(owner: string, id: string, input: UpdateMonitorRuleInput): Promise<MonitorRule> {
    const rule = await this.requireRule(owner, id);
    const next: MonitorRule = {
      ...rule,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.target_type ? { target_type: input.target_type } : {}),
      ...(input.target_id ? { target_id: input.target_id } : {}),
      ...(input.market ? { market: input.market } : {}),
      ...(input.event_kinds ? { event_kinds: input.event_kinds } : {}),
      ...(input.level ? { level: input.level } : {}),
      ...(input.cooldown_minutes !== undefined ? { cooldown_minutes: input.cooldown_minutes } : {}),
      ...(input.interval_minutes !== undefined ? { interval_minutes: input.interval_minutes } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.channels ? { channels: input.channels } : {}),
      ...(input.webhook_url !== undefined
        ? input.webhook_url
          ? { webhook_url: input.webhook_url }
          : { webhook_url: undefined }
        : {}),
      ...(input.quiet_hours !== undefined
        ? input.quiet_hours
          ? { quiet_hours: input.quiet_hours }
          : { quiet_hours: undefined }
        : {}),
      ...(input.price !== undefined
        ? input.price
          ? { price: input.price }
          : { price: undefined }
        : {}),
      ...(input.enabled === true ? { disabled_reason: undefined } : {}),
      updated_at: this.now().toISOString(),
    };
    if (next.event_kinds.includes("PRICE_MOVE") && !next.price)
      throw new AppError("PRICE_MOVE rules need a price condition", 422);
    if (next.channels.includes("webhook") && !next.webhook_url)
      throw new AppError("Webhook delivery needs webhook_url", 422);
    return this.db.put(owner, RULE_KIND, next);
  }

  async removeRule(owner: string, id: string): Promise<void> {
    await this.requireRule(owner, id);
    await this.db.remove(owner, RULE_KIND, id);
  }

  async budget(owner: string, date = localDate(this.now())): Promise<AttentionBudget> {
    const existing = await this.db.get<AttentionBudget>(owner, BUDGET_KIND, budgetId(owner, date));
    if (existing) return existing;
    const budget: AttentionBudget = {
      id: budgetId(owner, date),
      user_id: owner,
      date,
      limit: DEFAULT_ATTENTION_BUDGET,
      used: 0,
      downgraded_count: 0,
      updated_at: this.now().toISOString(),
    };
    return this.db.put(owner, BUDGET_KIND, budget);
  }

  async setBudgetLimit(owner: string, limit: number, date?: string): Promise<AttentionBudget> {
    const current = await this.budget(owner, date);
    return this.db.put(owner, BUDGET_KIND, {
      ...current,
      limit,
      updated_at: this.now().toISOString(),
    });
  }

  async listEvents(
    owner: string,
    query: { date?: string; state?: string; limit?: number } = {},
  ): Promise<MonitorEvent[]> {
    let events = await this.db.list<MonitorEvent>(owner, EVENT_KIND);
    if (query.date)
      events = events.filter((event) => localDate(new Date(event.detected_at)) === query.date);
    if (query.state) events = events.filter((event) => event.state === query.state);
    return events.slice(0, query.limit ?? 200);
  }

  async listDeliveries(owner: string, eventId?: string): Promise<MonitorDeliveryLog[]> {
    const logs = await this.db.list<MonitorDeliveryLog>(owner, DELIVERY_KIND);
    return eventId ? logs.filter((log) => log.event_id === eventId) : logs;
  }

  async today(owner: string, at = this.now()): Promise<MonitorToday> {
    const date = localDate(at);
    const [budget, rules, events] = await Promise.all([
      this.budget(owner, date),
      this.listRules(owner),
      this.listEvents(owner, { date, limit: 200 }),
    ]);
    const open = events.filter((event) => event.state !== "dismissed");
    return {
      date,
      budget,
      must_know: open.filter((event) => event.level === "MUST_KNOW" && event.state !== "archived"),
      later: open.filter(
        (event) =>
          (event.level === "LATER" || event.state === "downgraded") && event.state !== "archived",
      ),
      archive: open.filter((event) => event.state === "archived"),
      rules,
    };
  }

  async dismiss(
    owner: string,
    eventId: string,
  ): Promise<{ event: MonitorEvent; rule?: MonitorRule }> {
    const event = await this.db.get<MonitorEvent>(owner, EVENT_KIND, eventId);
    if (!event) throw new AppError("Monitor event not found", 404);
    const updated: MonitorEvent = {
      ...event,
      state: "dismissed",
      reason: "unnecessary",
      updated_at: this.now().toISOString(),
    };
    await this.db.put(owner, EVENT_KIND, updated);
    const rule = await this.db.get<MonitorRule>(owner, RULE_KIND, event.rule_id);
    if (!rule) return { event: updated };
    const recent = (await this.db.list<MonitorEvent>(owner, EVENT_KIND))
      .filter((item) => item.rule_id === rule.id)
      .sort((a, b) => b.detected_at.localeCompare(a.detected_at));
    let streak = 0;
    for (const item of recent) {
      if (item.id === event.id || item.state === "dismissed") streak++;
      else break;
    }
    if (streak < 3) return { event: updated, rule };
    const disabled: MonitorRule = {
      ...rule,
      enabled: false,
      disabled_reason: "repeated_unnecessary",
      updated_at: this.now().toISOString(),
    };
    await this.db.put(owner, RULE_KIND, disabled);
    return { event: updated, rule: disabled };
  }

  private async budgetFor(owner: string, at: Date) {
    return this.budget(owner, localDate(at));
  }

  /**
   * 写入一条事件，并决定它是否该打扰用户。
   * 顺序：停用检查 → 交易日历 → 冷却去重 → 静默期 → 打扰预算 → 投递。
   */
  private async accept(
    owner: string,
    rule: MonitorRule,
    input: IngestMonitorEventInput,
    at: Date,
  ): Promise<{ event?: MonitorEvent; skipped?: string }> {
    if (!rule.enabled) return { skipped: "disabled" };
    const kind = input.kind;
    const detectedAt = input.detected_at ?? at.toISOString();
    const mDate = marketDate(rule.market, new Date(detectedAt));
    if (MARKET_BOUND_KINDS.includes(kind) && !isTradingDay(rule.market, mDate))
      return {
        event: await this.storeEvent(
          owner,
          rule,
          input,
          at,
          "ARCHIVE",
          "archived",
          "non_trading_day",
        ),
      };

    const dedupeKey =
      input.dedupe_key ?? `${rule.id}:${kind}:${String(input.payload?.symbol ?? rule.target_id)}`;
    const since = at.getTime() - rule.cooldown_minutes * 60_000;
    const recent = await this.db.list<MonitorEvent>(owner, EVENT_KIND);
    if (
      recent.some(
        (event) =>
          event.rule_id === rule.id &&
          event.dedupe_key === dedupeKey &&
          Date.parse(event.detected_at) >= since,
      )
    )
      return { skipped: "cooldown" };

    let level = effectiveLevel(rule);
    let state: MonitorEvent["state"] = level === "ARCHIVE" ? "archived" : "new";
    let reason: string | undefined;
    let digestAt: string | undefined;
    if (level !== "ARCHIVE" && inQuietHours(rule.quiet_hours, at) && !isL2Kind(kind)) {
      level = "LATER";
      reason = "quiet_hours";
    }
    if (level === "MUST_KNOW") {
      const budget = await this.budgetFor(owner, at);
      if (budget.used >= budget.limit) {
        level = "LATER";
        state = "downgraded";
        reason = "attention_budget";
        digestAt = `${localDate(at)}T19:00:00`;
        await this.db.put(owner, BUDGET_KIND, {
          ...budget,
          downgraded_count: budget.downgraded_count + 1,
          updated_at: at.toISOString(),
        });
      }
    }

    const event = await this.storeEvent(
      owner,
      rule,
      input,
      at,
      level,
      state,
      reason,
      digestAt,
      dedupeKey,
      mDate,
    );
    if (level === "ARCHIVE" || level === "LATER") return { event };

    const deliveries = await this.deliver(owner, rule, event);
    const delivered = deliveries.some((log) => log.result === "sent");
    if (delivered) {
      const budget = await this.budgetFor(owner, at);
      const nextEvent: MonitorEvent = {
        ...event,
        state: "delivered",
        delivered_at: at.toISOString(),
        updated_at: at.toISOString(),
      };
      await this.db.put(owner, EVENT_KIND, nextEvent);
      await this.db.put(owner, BUDGET_KIND, {
        ...budget,
        used: budget.used + 1,
        updated_at: at.toISOString(),
      });
      return { event: nextEvent };
    }
    return { event };
  }

  private async storeEvent(
    owner: string,
    rule: MonitorRule,
    input: IngestMonitorEventInput,
    at: Date,
    level: MonitorLevel,
    state: MonitorEvent["state"],
    reason?: string,
    digestAt?: string,
    dedupeKey?: string,
    marketDay?: string,
  ): Promise<MonitorEvent> {
    const event: MonitorEvent = {
      id: randomUUID(),
      user_id: owner,
      rule_id: rule.id,
      ...(rule.name ? { rule_name: rule.name } : {}),
      kind: input.kind,
      original_level: rule.level,
      level,
      title: eventTitle(rule, input.kind, input.title),
      body: input.body ?? "",
      payload: input.payload ?? {},
      dedupe_key:
        dedupeKey ??
        input.dedupe_key ??
        `${rule.id}:${input.kind}:${String(input.payload?.symbol ?? rule.target_id)}`,
      detected_at: input.detected_at ?? at.toISOString(),
      market_date: marketDay ?? marketDate(rule.market, at),
      state,
      ...(reason ? { reason } : {}),
      ...(digestAt ? { digest_at: digestAt } : {}),
      updated_at: at.toISOString(),
    };
    return this.db.put(owner, EVENT_KIND, event);
  }

  private async deliver(
    owner: string,
    rule: MonitorRule,
    event: MonitorEvent,
  ): Promise<MonitorDeliveryLog[]> {
    const logs: MonitorDeliveryLog[] = [];
    for (const channel of rule.channels) {
      let result: MonitorDeliveryLog["result"] = "skipped";
      let detail: string | undefined;
      let providerId: string | undefined;
      if (channel === "in_app" && this.deps.notify) {
        try {
          const notification = await this.deps.notify(
            owner,
            event.title,
            event.body || event.title,
            `monitor-event:${event.id}`,
          );
          providerId = notification.id;
          result = "sent";
        } catch (error) {
          result = "failed";
          detail = error instanceof Error ? error.message : String(error);
        }
      } else if (channel === "webhook" && rule.webhook_url) {
        try {
          const response = await this.fetcher(rule.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: event.id,
              kind: event.kind,
              level: event.level,
              title: event.title,
              body: event.body,
              payload: event.payload,
              detected_at: event.detected_at,
            }),
            signal: AbortSignal.timeout(5_000),
          });
          if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
          result = "sent";
        } catch (error) {
          result = "failed";
          detail = error instanceof Error ? error.message : String(error);
        }
      } else {
        detail = "channel_not_configured";
      }
      const log: MonitorDeliveryLog = {
        id: randomUUID(),
        user_id: owner,
        event_id: event.id,
        channel: channel as MonitorDeliveryChannel,
        sent_at: this.now().toISOString(),
        ...(providerId ? { provider_id: providerId } : {}),
        result,
        ...(detail ? { detail } : {}),
      };
      await this.db.put(owner, DELIVERY_KIND, log);
      logs.push(log);
    }
    return logs;
  }

  async ingest(
    owner: string,
    input: IngestMonitorEventInput,
  ): Promise<{ events: MonitorEvent[]; skipped: string[] }> {
    const at = this.now();
    const normalized: IngestMonitorEventInput = {
      ...input,
      body: input.body ?? "",
      payload: input.payload ?? {},
    };
    const rules = await this.listRules(owner);
    const matched = normalized.rule_id
      ? rules.filter((rule) => rule.id === normalized.rule_id)
      : rules.filter((rule) => ruleMatches(rule, normalized));
    if (!matched.length) return { events: [], skipped: ["no_rule"] };
    const events: MonitorEvent[] = [];
    const skipped: string[] = [];
    for (const rule of matched) {
      const result = await this.accept(owner, rule, normalized, at);
      if (result.event) events.push(result.event);
      if (result.skipped) skipped.push(result.skipped);
    }
    return { events, skipped };
  }

  /** L1 价格规则巡检：拉一次行情，命中阈值就写入事件走同一套预算/投递。 */
  async checkPriceRules(
    owner: string,
    now = this.now(),
    options: { force?: boolean } = {},
  ): Promise<{ checked: number; triggered: number }> {
    const rules = (await this.listRules(owner)).filter(
      (rule) =>
        rule.enabled &&
        rule.event_kinds.includes("PRICE_MOVE") &&
        rule.price &&
        (options.force ||
          !rule.last_checked_at ||
          Date.parse(rule.last_checked_at) + rule.interval_minutes * 60_000 <= now.getTime()),
    );
    let triggered = 0;
    for (const rule of rules) {
      // 非交易日不跑 L1：连行情都不取，避免把周末波动误当成新事件。
      if (!isTradingDay(rule.market, marketDate(rule.market, now))) continue;
      let quote: Quote;
      try {
        quote = await this.market.getQuote(rule.target_id);
      } catch (error) {
        await this.db.put(owner, RULE_KIND, {
          ...rule,
          last_checked_at: now.toISOString(),
          last_error: error instanceof Error ? error.name : "quote_unavailable",
          updated_at: now.toISOString(),
        });
        continue;
      }
      await this.db.put(owner, RULE_KIND, {
        ...rule,
        last_checked_at: now.toISOString(),
        last_error: undefined,
        updated_at: now.toISOString(),
      });
      if (!rule.price || !priceTriggered(rule.price, quote)) continue;
      triggered++;
      const thesisRule = rule.target_type === "thesis";
      await this.ingest(owner, {
        rule_id: rule.id,
        kind: thesisRule ? "THESIS_SIGNAL" : "PRICE_MOVE",
        title: thesisRule ? `${rule.name ?? "论点"} 触发证伪条件` : `${rule.target_id} 行情异动`,
        body: `${rule.target_id} 当前 ${quote.price}，日内 ${quote.changePercent.toFixed(2)}%。`,
        payload: {
          symbol: rule.target_id,
          price: quote.price,
          change_percent: quote.changePercent,
        },
        dedupe_key: `${rule.id}:PRICE_MOVE:${quote.price}`,
      });
    }
    return { checked: rules.length, triggered };
  }
}

function priceTriggered(
  price: { threshold_type: "PRICE_ABOVE" | "PRICE_BELOW" | "CHANGE_PCT"; threshold_value: number },
  quote: Quote,
): boolean {
  switch (price.threshold_type) {
    case "PRICE_ABOVE":
      return quote.price >= price.threshold_value;
    case "PRICE_BELOW":
      return quote.price <= price.threshold_value;
    case "CHANGE_PCT":
      return Math.abs(quote.changePercent) >= Math.abs(price.threshold_value);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const __test = { DAY_MS, MARKET_HOLIDAYS, localDate };
