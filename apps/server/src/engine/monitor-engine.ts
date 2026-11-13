import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  isTradingDay,
  localClock,
  localDate,
  marketClock,
  marketForSymbol,
  nextTradingDay,
  type TradingMarket,
} from "../../../../packages/domain/src/market-calendar.ts";
import {
  type AttentionBudget,
  type DeliveryChannel,
  MONITOR_EVENT_KINDS,
  type MonitorEvent,
  type MonitorEventKind,
  type MonitorEventPayload,
  type MonitorLevel,
  type MonitorQuietHours,
  type MonitorRule,
  type MonitorThresholds,
} from "../../../../packages/domain/src/monitor.ts";
import {
  MarketDataError,
  type MarketDataService,
  type Quote,
  resolveMarket,
} from "../../../../packages/integrations/src/market-data.ts";
import type { Store } from "../db.ts";
import { DeliveryService } from "../delivery/index.ts";
import { AppError } from "../errors.ts";

export const RULE_KIND = "monitor_rules";
export const EVENT_KIND = "monitor_events";
export const BUDGET_KIND = "attention_budgets";
export const DEFAULT_BUDGET_LIMIT = 5;
export const MAX_BUDGET_LIMIT = 10;
export const DEFAULT_COOLDOWN_MINUTES = 240;
export const DEFAULT_INTERVAL_MINUTES = 5;
export const DEFAULT_DIGEST_HOUR = 19;
export const DEFAULT_OWNER_TIME_ZONE = process.env.MONITOR_TIME_ZONE ?? "Asia/Shanghai";
export const DEFAULT_QUIET_HOURS: MonitorQuietHours = { startHour: 22, endHour: 7 };
const DEFAULT_CHANNELS: DeliveryChannel[] = ["apns", "fcm"];

const marketSchema = z.enum(["CN", "HK", "US"]);
const targetTypeSchema = z.enum(["symbol", "portfolio", "thesis", "page"]);
const eventKindSchema = z.enum(MONITOR_EVENT_KINDS);
const levelSchema = z.enum(["MUST_KNOW", "LATER", "ARCHIVE"]);
const channelSchema = z.enum(["apns", "fcm", "email", "wecom"]);

export const quietHoursSchema = z
  .object({
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(0).max(23),
    timeZone: z.string().trim().min(1).max(80).optional(),
  })
  .nullable();

export const thresholdsSchema = z.object({
  priceAbove: z.number().finite().positive().optional(),
  priceBelow: z.number().finite().positive().optional(),
  changePct: z.number().finite().positive().max(100).optional(),
  volumeMultiplier: z.number().finite().min(1.1).max(100).optional(),
  volatilityPct: z.number().finite().positive().max(100).optional(),
});

const targetIdSchema = z.string().trim().min(1).max(200);

export const createMonitorRuleSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    targetType: targetTypeSchema,
    targetId: targetIdSchema,
    market: marketSchema.optional(),
    eventKinds: z.array(eventKindSchema).min(1).max(9),
    level: levelSchema.optional(),
    cooldownMinutes: z.number().int().min(30).max(1440).optional(),
    enabled: z.boolean().optional(),
    quietHours: quietHoursSchema.optional(),
    intervalMinutes: z.number().int().min(1).max(60).optional(),
    thresholds: thresholdsSchema.optional(),
    channels: z.array(channelSchema).min(1).max(4).optional(),
  })
  .superRefine((value, ctx) => {
    const thresholds = value.thresholds ?? {};
    const required: Partial<Record<MonitorEventKind, keyof MonitorThresholds>> = {
      PRICE_ABOVE: "priceAbove",
      PRICE_BELOW: "priceBelow",
      CHANGE_PCT: "changePct",
      VOLUME_SPIKE: "volumeMultiplier",
      VOLATILITY_SPIKE: "volatilityPct",
    };
    for (const kind of value.eventKinds) {
      const field = required[kind];
      if (field && thresholds[field] === undefined)
        ctx.addIssue({ code: "custom", message: `${kind} requires thresholds.${field}` });
    }
  });

export const updateMonitorRuleSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    market: marketSchema.optional(),
    eventKinds: z.array(eventKindSchema).min(1).max(9).optional(),
    level: levelSchema.optional(),
    cooldownMinutes: z.number().int().min(30).max(1440).optional(),
    enabled: z.boolean().optional(),
    quietHours: quietHoursSchema.optional(),
    intervalMinutes: z.number().int().min(1).max(60).optional(),
    thresholds: thresholdsSchema.optional(),
    channels: z.array(channelSchema).min(1).max(4).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Provide at least one field to update",
  });

export const ingestMonitorEventSchema = z.object({
  ruleId: z.string().trim().min(1).max(200),
  kind: z.enum(["EARNINGS", "ANNOUNCEMENT", "DIVIDEND", "SUSPENSION"]),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  payload: z.record(z.string().max(120), z.unknown()).default({}),
});

export const dismissMonitorEventSchema = z.object({
  reason: z.enum(["unnecessary", "irrelevant", "useful"]).default("unnecessary"),
});

export const updateBudgetSchema = z.object({
  limit: z.number().int().min(1).max(MAX_BUDGET_LIMIT),
});

export type CreateMonitorRuleInput = z.infer<typeof createMonitorRuleSchema>;
export type UpdateMonitorRuleInput = z.infer<typeof updateMonitorRuleSchema>;
export type IngestMonitorEventInput = z.infer<typeof ingestMonitorEventSchema>;

export interface MonitorServiceDeps {
  db: Store;
  market: MarketDataService;
  delivery?: DeliveryService;
  holdings?: (owner: string, portfolioId: string) => Promise<{ symbol_code: string }[]>;
  notify?: (owner: string, title: string, body: string, key: string) => Promise<unknown>;
  now?: () => Date;
  timeZone?: string;
}

export interface MonitorCandidate {
  kind: MonitorEventKind;
  severity: "low" | "medium" | "high";
  symbol?: string;
  payload: MonitorEventPayload;
}

export interface RecordCandidateResult {
  event: MonitorEvent;
  action: "delivered" | "archived" | "coalesced" | "downgraded";
}

export interface MonitorTickResult {
  created: number;
  checked: number;
  skipped: number;
  events: MonitorEvent[];
}

function defaultLevel(eventKinds: MonitorEventKind[]): MonitorLevel {
  return eventKinds.some((kind) => kind === "EARNINGS" || kind === "ANNOUNCEMENT")
    ? "MUST_KNOW"
    : eventKinds.some((kind) => kind === "DIVIDEND" || kind === "SUSPENSION")
      ? "LATER"
      : "ARCHIVE";
}

/** 兼容旧记录：缺省字段补默认值，未知市场按标的推断。 */
export function normalizeMonitorRule(rule: MonitorRule): MonitorRule {
  const eventKinds =
    Array.isArray(rule.eventKinds) && rule.eventKinds.length
      ? rule.eventKinds
      : (["PRICE_ABOVE"] as MonitorEventKind[]);
  const market =
    rule.market ?? (rule.targetType === "symbol" ? marketForSymbol(rule.targetId) : undefined);
  const schemaVersion = rule.schemaVersion ?? 1;
  const legacy = rule.schemaVersion === undefined;
  return {
    ...rule,
    eventKinds,
    market,
    level: rule.level ?? defaultLevel(eventKinds),
    cooldownMinutes: rule.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES,
    enabled: rule.enabled ?? true,
    intervalMinutes: rule.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES,
    thresholds: rule.thresholds ?? {},
    channels: rule.channels?.length ? rule.channels : DEFAULT_CHANNELS,
    consecutiveDismissals: rule.consecutiveDismissals ?? 0,
    schemaVersion,
    // 旧记录没有静默期字段时补默认值；新记录缺省代表用户关闭静默期。
    quietHours:
      rule.quietHours === null || rule.quietHours === undefined
        ? legacy
          ? DEFAULT_QUIET_HOURS
          : undefined
        : rule.quietHours,
  };
}

function inQuietHours(quiet: MonitorQuietHours | undefined, hour: number): boolean {
  if (!quiet) return false;
  if (quiet.startHour === quiet.endHour) return false;
  if (quiet.startHour < quiet.endHour) return hour >= quiet.startHour && hour < quiet.endHour;
  return hour >= quiet.startHour || hour < quiet.endHour;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function severityRank(value: MonitorCandidate["severity"]): number {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}

function eventTitle(event: MonitorEvent): string {
  const symbol = event.payload.symbol ?? "";
  switch (event.kind) {
    case "PRICE_ABOVE":
      return `${symbol} 突破 ${String(event.payload.threshold ?? "")}`;
    case "PRICE_BELOW":
      return `${symbol} 跌破 ${String(event.payload.threshold ?? "")}`;
    case "CHANGE_PCT":
      return `${symbol} 日内波动 ${String(event.payload.changePct ?? "")}%`;
    case "VOLUME_SPIKE":
      return `${symbol} 成交量放大 ${String(event.payload.volumeRatio ?? "")} 倍`;
    case "VOLATILITY_SPIKE":
      return `${symbol} 振幅 ${String(event.payload.volatilityPct ?? "")}%`;
    case "EARNINGS":
      return `${symbol} 财报发布`;
    case "ANNOUNCEMENT":
      return `${symbol} 新公告`;
    case "DIVIDEND":
      return `${symbol} 分红除权`;
    case "SUSPENSION":
      return `${symbol} 停复牌`;
    case "DIGEST":
      return typeof event.payload.title === "string" ? event.payload.title : "今日打扰汇总";
  }
}

function eventBody(event: MonitorEvent): string {
  if (event.kind === "DIGEST") return String(event.payload.summary ?? "");
  const title = typeof event.payload.title === "string" ? event.payload.title : undefined;
  if (title) return title;
  return eventTitle(event);
}

function layerOf(kind: MonitorEventKind): MonitorEvent["layer"] {
  if (kind === "DIGEST") return "SYSTEM";
  return ["EARNINGS", "ANNOUNCEMENT", "DIVIDEND", "SUSPENSION"].includes(kind) ? "L2" : "L1";
}

export class MonitorService {
  private readonly db: Store;
  private readonly market: MarketDataService;
  private readonly delivery: DeliveryService;
  private readonly timeZone: string;

  constructor(private readonly deps: MonitorServiceDeps) {
    this.db = deps.db;
    this.market = deps.market;
    this.delivery = deps.delivery ?? new DeliveryService(deps.db);
    this.timeZone = deps.timeZone ?? DEFAULT_OWNER_TIME_ZONE;
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async listRules(owner: string): Promise<MonitorRule[]> {
    return (await this.db.list<MonitorRule>(owner, RULE_KIND))
      .map(normalizeMonitorRule)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private async requireRule(owner: string, id: string): Promise<MonitorRule> {
    const rule = await this.db.get<MonitorRule>(owner, RULE_KIND, id);
    if (!rule) throw new AppError("Monitor rule not found", 404);
    return normalizeMonitorRule(rule);
  }

  async createRule(owner: string, input: CreateMonitorRuleInput): Promise<MonitorRule> {
    const at = this.now().toISOString();
    const targetId =
      input.targetType === "symbol" ? input.targetId.trim().toUpperCase() : input.targetId;
    const rule: MonitorRule = normalizeMonitorRule({
      id: randomUUID(),
      ownerId: owner,
      ...(input.title ? { title: input.title } : {}),
      targetType: input.targetType,
      targetId,
      ...(input.market ? { market: input.market } : {}),
      eventKinds: input.eventKinds,
      ...(input.level ? { level: input.level } : {}),
      ...(input.cooldownMinutes ? { cooldownMinutes: input.cooldownMinutes } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.quietHours !== undefined ? { quietHours: input.quietHours ?? undefined } : {}),
      ...(input.intervalMinutes ? { intervalMinutes: input.intervalMinutes } : {}),
      ...(input.thresholds ? { thresholds: input.thresholds } : {}),
      ...(input.channels ? { channels: input.channels } : {}),
      createdAt: at,
      updatedAt: at,
      nextCheckAt: at,
    } as MonitorRule);
    if (input.quietHours === null) {
      rule.quietHours = undefined;
      rule.schemaVersion = 1;
    }
    return this.db.put(owner, RULE_KIND, rule);
  }

  async updateRule(owner: string, id: string, input: UpdateMonitorRuleInput): Promise<MonitorRule> {
    const rule = await this.requireRule(owner, id);
    const eventKinds = input.eventKinds ?? rule.eventKinds;
    const thresholds = { ...rule.thresholds, ...(input.thresholds ?? {}) };
    const required: Partial<Record<MonitorEventKind, keyof MonitorThresholds>> = {
      PRICE_ABOVE: "priceAbove",
      PRICE_BELOW: "priceBelow",
      CHANGE_PCT: "changePct",
      VOLUME_SPIKE: "volumeMultiplier",
      VOLATILITY_SPIKE: "volatilityPct",
    };
    for (const kind of eventKinds) {
      const field = required[kind];
      if (field && thresholds[field] === undefined)
        throw new AppError(`${kind} requires thresholds.${field}`, 422);
    }
    const next: MonitorRule = {
      ...rule,
      ...(input.title !== undefined ? { title: input.title || undefined } : {}),
      ...(input.market ? { market: input.market } : {}),
      eventKinds,
      ...(input.level ? { level: input.level } : {}),
      ...(input.cooldownMinutes ? { cooldownMinutes: input.cooldownMinutes } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.quietHours !== undefined ? { quietHours: input.quietHours ?? undefined } : {}),
      ...(input.intervalMinutes ? { intervalMinutes: input.intervalMinutes } : {}),
      thresholds,
      ...(input.channels ? { channels: input.channels } : {}),
      ...(input.enabled === true ? { nextCheckAt: this.now().toISOString() } : {}),
      updatedAt: this.now().toISOString(),
    };
    return this.db.put(owner, RULE_KIND, next);
  }

  async removeRule(owner: string, id: string): Promise<void> {
    await this.requireRule(owner, id);
    await this.db.remove(owner, RULE_KIND, id);
  }

  async pauseRule(owner: string, id: string): Promise<MonitorRule> {
    return this.updateRule(owner, id, { enabled: false });
  }

  async resumeRule(owner: string, id: string): Promise<MonitorRule> {
    return this.updateRule(owner, id, { enabled: true });
  }

  async listEvents(
    owner: string,
    filters: { date?: string; state?: MonitorEvent["state"]; limit?: number } = {},
  ): Promise<MonitorEvent[]> {
    return (await this.db.list<MonitorEvent>(owner, EVENT_KIND))
      .filter((event) => (filters.date ? event.marketDate === filters.date : true))
      .filter((event) => (filters.state ? event.state === filters.state : true))
      .slice(0, filters.limit ?? 200);
  }

  private async requireEvent(owner: string, id: string): Promise<MonitorEvent> {
    const event = await this.db.get<MonitorEvent>(owner, EVENT_KIND, id);
    if (!event) throw new AppError("Monitor event not found", 404);
    return event;
  }

  async budget(owner: string, now = this.now()): Promise<AttentionBudget> {
    return this.ensureBudget(owner, localDate(this.timeZone, now));
  }

  private async ensureBudget(owner: string, date: string): Promise<AttentionBudget> {
    const id = `${owner}:${date}`;
    const existing = await this.db.get<AttentionBudget>(owner, BUDGET_KIND, id);
    if (existing) return existing;
    const created = await this.db.insertIfAbsent<AttentionBudget>(owner, BUDGET_KIND, {
      id,
      ownerId: owner,
      date,
      limit: DEFAULT_BUDGET_LIMIT,
      used: 0,
      downgradedCount: 0,
      updatedAt: this.now().toISOString(),
    });
    if (created) return created;
    const raced = await this.db.get<AttentionBudget>(owner, BUDGET_KIND, id);
    if (!raced) throw new AppError("Attention budget could not be loaded", 500);
    return raced;
  }

  async setBudgetLimit(owner: string, limit: number, now = this.now()): Promise<AttentionBudget> {
    const current = await this.budget(owner, now);
    return this.db.put<AttentionBudget>(owner, BUDGET_KIND, {
      ...current,
      limit,
      updatedAt: this.now().toISOString(),
    });
  }

  /** 用户对事件的反馈；连续 3 次「不必要」自动把冷却时间翻倍并提示。 */
  async dismissEvent(
    owner: string,
    id: string,
    reason: "unnecessary" | "irrelevant" | "useful" = "unnecessary",
    now = this.now(),
  ): Promise<{ event: MonitorEvent; rule?: MonitorRule; accelerated: boolean }> {
    const event = await this.requireEvent(owner, id);
    const updated: MonitorEvent = {
      ...event,
      state: "dismissed",
      dismissedAt: now.toISOString(),
      dismissReason: reason,
    };
    await this.db.put(owner, EVENT_KIND, updated);
    const rule = await this.db.get<MonitorRule>(owner, RULE_KIND, event.ruleId);
    if (!rule) return { event: updated, accelerated: false };
    const normalized = normalizeMonitorRule(rule);
    if (reason === "useful")
      return {
        event: updated,
        rule: await this.db.put(owner, RULE_KIND, {
          ...normalized,
          consecutiveDismissals: 0,
        }),
        accelerated: false,
      };
    if (reason !== "unnecessary") return { event: updated, rule: normalized, accelerated: false };
    const consecutive = (normalized.consecutiveDismissals ?? 0) + 1;
    if (consecutive < 3)
      return {
        event: updated,
        rule: await this.db.put(owner, RULE_KIND, {
          ...normalized,
          consecutiveDismissals: consecutive,
        }),
        accelerated: false,
      };
    const cooldownMinutes = Math.min(Math.max(normalized.cooldownMinutes * 2, 60), 1440);
    const next = await this.db.put(owner, RULE_KIND, {
      ...normalized,
      cooldownMinutes,
      consecutiveDismissals: 0,
      autoDowngradedAt: now.toISOString(),
    });
    await this.notify(
      owner,
      "监控规则已自动降频",
      `连续 3 次标记「不必要」，已把冷却时间调整为 ${cooldownMinutes} 分钟。可在规则设置里继续调整。`,
      `monitor-rule-downrank:${normalized.id}:${now.toISOString()}`,
    );
    return { event: updated, rule: next, accelerated: true };
  }

  /** L2 事件入口：财报 / 公告 / 分红 / 停复牌由数据源或人工写入。 */
  async ingestEvent(
    owner: string,
    input: IngestMonitorEventInput,
    now = this.now(),
  ): Promise<RecordCandidateResult> {
    const rule = await this.requireRule(owner, input.ruleId);
    if (!rule.eventKinds.includes(input.kind))
      throw new AppError(`Rule does not subscribe to ${input.kind}`, 422);
    const payload: MonitorEventPayload = { ...input.payload };
    if (rule.targetType === "symbol") payload.symbol = payload.symbol ?? rule.targetId;
    return this.recordCandidate(
      owner,
      rule,
      { kind: input.kind, severity: input.severity, payload },
      now,
    );
  }

  /** 扫描所有到期的规则；由 maintenance tick 调用。 */
  async runMaintenance(now = this.now()): Promise<MonitorTickResult> {
    const owners = new Set((await this.db.scan<MonitorRule>(RULE_KIND)).map(({ owner }) => owner));
    const aggregate: MonitorTickResult = { created: 0, checked: 0, skipped: 0, events: [] };
    for (const owner of owners) {
      const result = await this.tick(owner, { now });
      aggregate.created += result.created;
      aggregate.checked += result.checked;
      aggregate.skipped += result.skipped;
      aggregate.events.push(...result.events);
    }
    for (const { owner } of await this.db.scan<MonitorEvent>(EVENT_KIND)) {
      await this.runDigest(owner, now).catch(() => undefined);
    }
    return aggregate;
  }

  async tick(
    owner: string,
    options: { now?: Date; ruleId?: string; force?: boolean } = {},
  ): Promise<MonitorTickResult> {
    const now = options.now ?? this.now();
    const rules = await this.listRules(owner);
    const result: MonitorTickResult = { created: 0, checked: 0, skipped: 0, events: [] };
    for (const rule of rules) {
      if (options.ruleId && rule.id !== options.ruleId) continue;
      if (!rule.enabled) {
        result.skipped++;
        continue;
      }
      if (!options.force && rule.nextCheckAt && Date.parse(rule.nextCheckAt) > now.getTime()) {
        result.skipped++;
        continue;
      }
      result.checked++;
      try {
        const events = await this.checkRule(owner, rule, now);
        result.events.push(...events);
        result.created += events.filter((event) => event.detectedAt === now.toISOString()).length;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Monitor check failed";
        await this.db.put(owner, RULE_KIND, {
          ...rule,
          lastCheckedAt: now.toISOString(),
          lastError: message,
          nextCheckAt: new Date(now.getTime() + rule.intervalMinutes * 60_000).toISOString(),
        });
      }
    }
    return result;
  }

  private async checkRule(owner: string, rule: MonitorRule, now: Date): Promise<MonitorEvent[]> {
    const market: TradingMarket =
      rule.market ?? (rule.targetType === "symbol" ? marketForSymbol(rule.targetId) : "US");
    const nextCheckAt = new Date(now.getTime() + rule.intervalMinutes * 60_000).toISOString();
    if (!isTradingDay(market, marketClock(market, now).date)) {
      await this.db.put(owner, RULE_KIND, {
        ...rule,
        lastCheckedAt: now.toISOString(),
        nextCheckAt,
        lastError: undefined,
      });
      return [];
    }
    const symbols = await this.symbolsFor(rule);
    if (!symbols.length) {
      await this.db.put(owner, RULE_KIND, {
        ...rule,
        lastCheckedAt: now.toISOString(),
        nextCheckAt,
        lastError: rule.targetType === "symbol" ? undefined : "No monitorable symbols",
      });
      return [];
    }
    const events: MonitorEvent[] = [];
    let updatedRule = rule;
    for (const symbol of symbols) {
      let quote: Quote;
      try {
        quote = await this.market.getQuote(symbol);
      } catch (error) {
        const detail = error instanceof MarketDataError ? error.kind : "provider_error";
        updatedRule = { ...updatedRule, lastError: detail };
        continue;
      }
      if (
        rule.eventKinds.includes("VOLUME_SPIKE") &&
        updatedRule.volumeBaseline === undefined &&
        quote.volume
      )
        updatedRule = { ...updatedRule, volumeBaseline: quote.volume };
      for (const candidate of this.evaluateQuote(updatedRule, quote)) {
        const outcome = await this.recordCandidate(owner, updatedRule, candidate, now);
        events.push(outcome.event);
      }
    }
    await this.db.put(owner, RULE_KIND, {
      ...updatedRule,
      lastCheckedAt: now.toISOString(),
      lastError: updatedRule.lastError,
      nextCheckAt,
    });
    return events;
  }

  private async symbolsFor(rule: MonitorRule): Promise<string[]> {
    if (rule.targetType === "symbol") return [rule.targetId];
    if (rule.targetType === "portfolio" && this.deps.holdings) {
      const holdings = await this.deps.holdings(rule.ownerId, rule.targetId);
      return [...new Set(holdings.map((holding) => holding.symbol_code))];
    }
    return [];
  }

  /** L1 判定；纯函数，方便单测。 */
  evaluateQuote(rule: MonitorRule, quote: Quote): MonitorCandidate[] {
    const candidates: MonitorCandidate[] = [];
    const thresholds = rule.thresholds;
    const base = {
      symbol: quote.symbol,
      title: `${quote.symbol} ${quote.price}`,
    };
    for (const kind of rule.eventKinds) {
      if (
        kind === "PRICE_ABOVE" &&
        thresholds.priceAbove !== undefined &&
        quote.price >= thresholds.priceAbove
      )
        candidates.push({
          kind,
          severity: "high",
          symbol: quote.symbol,
          payload: { ...base, price: quote.price, threshold: thresholds.priceAbove },
        });
      if (
        kind === "PRICE_BELOW" &&
        thresholds.priceBelow !== undefined &&
        quote.price <= thresholds.priceBelow
      )
        candidates.push({
          kind,
          severity: "high",
          symbol: quote.symbol,
          payload: { ...base, price: quote.price, threshold: thresholds.priceBelow },
        });
      if (
        kind === "CHANGE_PCT" &&
        thresholds.changePct !== undefined &&
        Math.abs(quote.changePercent) >= thresholds.changePct
      )
        candidates.push({
          kind,
          severity: Math.abs(quote.changePercent) >= thresholds.changePct * 1.5 ? "high" : "medium",
          symbol: quote.symbol,
          payload: {
            ...base,
            price: quote.price,
            changePct: Number(quote.changePercent.toFixed(2)),
            threshold: thresholds.changePct,
          },
        });
      if (
        kind === "VOLUME_SPIKE" &&
        thresholds.volumeMultiplier !== undefined &&
        rule.volumeBaseline &&
        quote.volume
      ) {
        const ratio = quote.volume / rule.volumeBaseline;
        if (ratio >= thresholds.volumeMultiplier)
          candidates.push({
            kind,
            severity: ratio >= thresholds.volumeMultiplier * 1.5 ? "high" : "medium",
            symbol: quote.symbol,
            payload: {
              ...base,
              volume: quote.volume,
              volumeRatio: Number(ratio.toFixed(2)),
              threshold: thresholds.volumeMultiplier,
            },
          });
      }
      if (
        kind === "VOLATILITY_SPIKE" &&
        thresholds.volatilityPct !== undefined &&
        quote.dayHigh !== undefined &&
        quote.dayLow !== undefined &&
        quote.previousClose > 0
      ) {
        const volatilityPct = ((quote.dayHigh - quote.dayLow) / quote.previousClose) * 100;
        if (volatilityPct >= thresholds.volatilityPct)
          candidates.push({
            kind,
            severity: "medium",
            symbol: quote.symbol,
            payload: {
              ...base,
              volatilityPct: Number(volatilityPct.toFixed(2)),
              threshold: thresholds.volatilityPct,
            },
          });
      }
    }
    return candidates;
  }

  private async recordCandidate(
    owner: string,
    rule: MonitorRule,
    candidate: MonitorCandidate,
    now: Date,
  ): Promise<RecordCandidateResult> {
    const market: TradingMarket =
      rule.market ?? (candidate.symbol ? resolveMarket(candidate.symbol) : "US");
    const clock = marketClock(market, now);
    const ownerDate = localDate(this.timeZone, now);
    const dedupeKey = [rule.id, candidate.kind, candidate.symbol ?? rule.targetId].join(":");
    const events = await this.db.list<MonitorEvent>(owner, EVENT_KIND);
    const last = events.find(
      (event) =>
        event.dedupeKey === dedupeKey &&
        Date.parse(event.lastDetectedAt ?? event.detectedAt) >
          now.getTime() - rule.cooldownMinutes * 60_000,
    );
    if (last) {
      const merged: MonitorEvent = {
        ...last,
        occurrences: (last.occurrences ?? 1) + 1,
        lastDetectedAt: now.toISOString(),
        severity:
          severityRank(candidate.severity) > severityRank(last.severity)
            ? candidate.severity
            : last.severity,
        payload: { ...last.payload, ...candidate.payload },
      };
      await this.db.put(owner, EVENT_KIND, merged);
      return { event: merged, action: "coalesced" };
    }

    const trading = isTradingDay(market, clock.date);
    const baseEvent: MonitorEvent = {
      id: randomUUID(),
      ownerId: owner,
      ruleId: rule.id,
      kind: candidate.kind,
      layer: layerOf(candidate.kind),
      level: rule.level,
      severity: candidate.severity,
      payload: candidate.payload,
      dedupeKey,
      detectedAt: now.toISOString(),
      lastDetectedAt: now.toISOString(),
      market,
      marketDate: clock.date,
      state: "new",
      occurrences: 1,
    };

    if (!trading) {
      const event = await this.db.put<MonitorEvent>(owner, EVENT_KIND, {
        ...baseEvent,
        state: "archived",
        downgraded: true,
        downgradedReason: "non_trading_day",
        digestDate: nextTradingDay(market, clock.date),
      });
      return { event, action: "archived" };
    }

    const quiet = rule.quietHours ?? DEFAULT_QUIET_HOURS;
    const ownerClock = localClock(quiet.timeZone ?? this.timeZone, now);
    if (inQuietHours(quiet, ownerClock.hour) && rule.level !== "MUST_KNOW") {
      const event = await this.db.put<MonitorEvent>(owner, EVENT_KIND, {
        ...baseEvent,
        state: "archived",
        downgraded: true,
        downgradedReason: "quiet_hours",
        digestDate: ownerClock.hour >= DEFAULT_DIGEST_HOUR ? addDays(ownerDate, 1) : ownerDate,
      });
      return { event, action: "archived" };
    }

    if (rule.level === "MUST_KNOW") {
      const budget = await this.ensureBudget(owner, ownerDate);
      if (budget.used >= budget.limit) {
        const event = await this.db.put<MonitorEvent>(owner, EVENT_KIND, {
          ...baseEvent,
          state: "archived",
          downgraded: true,
          downgradedReason: "budget",
          digestDate: ownerDate,
        });
        await this.db.put(owner, BUDGET_KIND, {
          ...budget,
          downgradedCount: budget.downgradedCount + 1,
          updatedAt: now.toISOString(),
        });
        return { event, action: "downgraded" };
      }
      await this.db.put(owner, BUDGET_KIND, {
        ...budget,
        used: budget.used + 1,
        updatedAt: now.toISOString(),
      });
    }

    const event = await this.db.put<MonitorEvent>(owner, EVENT_KIND, {
      ...baseEvent,
      state: "delivered",
    });
    await this.dispatch(owner, event, now);
    return { event, action: "delivered" };
  }

  private async dispatch(owner: string, event: MonitorEvent, now: Date): Promise<void> {
    const rule = await this.db.get<MonitorRule>(owner, RULE_KIND, event.ruleId);
    const channels = rule?.channels?.length ? rule.channels : DEFAULT_CHANNELS;
    await this.delivery
      .dispatch(
        { ownerId: owner, event, title: eventTitle(event), body: eventBody(event) },
        channels,
        now,
      )
      .catch(() => undefined);
    await this.notify(owner, eventTitle(event), eventBody(event), `monitor-event:${event.id}`);
  }

  private async notify(owner: string, title: string, body: string, key: string): Promise<void> {
    if (!this.deps.notify) return;
    try {
      await this.deps.notify(owner, title, body, key);
    } catch {
      // 应用内通知失败不应回滚已经投递/归档的事件。
    }
  }

  /**
   * 19:00 之后把当天被静默/超额降级的事件合并为一条汇总，预算上再算 1 条。
   * 幂等：同一天只会生成一个 DIGEST 事件。
   */
  async runDigest(owner: string, now = this.now()): Promise<MonitorEvent | null> {
    const date = localDate(this.timeZone, now);
    const clock = localClock(this.timeZone, now);
    if (clock.hour < DEFAULT_DIGEST_HOUR) return null;
    const id = hash(`monitor-digest:${owner}:${date}`);
    const existing = await this.db.get<MonitorEvent>(owner, EVENT_KIND, id);
    if (existing) return existing;
    const events = (await this.db.list<MonitorEvent>(owner, EVENT_KIND)).filter(
      (event) =>
        event.kind !== "DIGEST" &&
        event.digestDate === date &&
        !event.digestedAt &&
        event.state === "archived",
    );
    if (!events.length) return null;
    const budget = await this.ensureBudget(owner, date);
    const digest: MonitorEvent = {
      id,
      ownerId: owner,
      ruleId: "digest",
      kind: "DIGEST",
      layer: "SYSTEM",
      level: "LATER",
      severity: "low",
      payload: {
        title: "今日打扰汇总",
        summary: `今天有 ${events.length} 条消息被合并到这里。`,
        eventIds: events.map((event) => event.id),
        count: events.length,
      },
      dedupeKey: `digest:${date}`,
      detectedAt: now.toISOString(),
      lastDetectedAt: now.toISOString(),
      marketDate: date,
      state: "delivered",
      downgraded: true,
      digestDate: date,
      occurrences: events.length,
    };
    const saved = await this.db.put(owner, EVENT_KIND, digest);
    for (const event of events)
      await this.db.put(owner, EVENT_KIND, { ...event, digestedAt: now.toISOString() });
    await this.db.put(owner, BUDGET_KIND, {
      ...budget,
      used: Math.min(budget.used + 1, budget.limit + 1),
      updatedAt: now.toISOString(),
    });
    await this.dispatch(owner, saved, now);
    return saved;
  }

  /** Today 聚合的基础数据；论点与审批由路由层补齐。 */
  async today(owner: string, now = this.now()) {
    const date = localDate(this.timeZone, now);
    const [events, rules, budget] = await Promise.all([
      this.listEvents(owner, { limit: 500 }),
      this.listRules(owner),
      this.budget(owner, now),
    ]);
    const today = events.filter((event) => event.marketDate === date || event.digestDate === date);
    const visible = today.filter((event) => event.state !== "dismissed");
    const digest = today.find((event) => event.kind === "DIGEST") ?? null;
    return {
      date,
      time_zone: this.timeZone,
      markets: {
        CN: {
          date: marketClock("CN", now).date,
          trading_day: isTradingDay("CN", marketClock("CN", now).date),
        },
        HK: {
          date: marketClock("HK", now).date,
          trading_day: isTradingDay("HK", marketClock("HK", now).date),
        },
        US: {
          date: marketClock("US", now).date,
          trading_day: isTradingDay("US", marketClock("US", now).date),
        },
      },
      budget: {
        date: budget.date,
        limit: budget.limit,
        used: budget.used,
        remaining: Math.max(budget.limit - budget.used, 0),
        downgraded_count: budget.downgradedCount,
      },
      rules,
      digest,
      events: {
        MUST_KNOW: visible.filter(
          (event) => event.kind !== "DIGEST" && event.level === "MUST_KNOW",
        ),
        LATER: visible.filter((event) => event.kind !== "DIGEST" && event.level === "LATER"),
        ARCHIVE: visible.filter((event) => event.kind !== "DIGEST" && event.level === "ARCHIVE"),
      },
      generated_at: now.toISOString(),
    };
  }
}
