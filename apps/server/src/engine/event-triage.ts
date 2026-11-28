import { createHash } from "node:crypto";
import type { Holding, InvestmentNote } from "../../../../packages/domain/src/agent.ts";
import type {
  ConsentGate,
  EventCandidateInput,
  EventDecision,
  EventFeedItem,
  EventPrefilter,
  EventType,
  InvestorMutedTopic,
} from "../../../../packages/domain/src/investor.ts";
import { EVENT_TYPE_LABELS } from "../../../../packages/domain/src/investor.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

export const FEED_KIND = "event-feed";
/** 用户的降噪偏好单独存一条记录，和事件流分开：判级读它，反馈写它。 */
const MUTE_KIND = "event-mutes";
const MUTE_ID = "mutes";
/** 价格异动的第一级门槛：低于这个幅度连判级都不进，直接记日志。 */
export const PRICE_MOVE_FLOOR_PERCENT = 2;
/** 内容类事件（新闻/公告）的 24h 去重窗口。 */
const CONTENT_DEDUPE_MS = 24 * 60 * 60 * 1000;
/** 「这类少推点」的默认冷却天数。 */
export const DEFAULT_MUTE_DAYS = 14;

/** 二级判级的分档线：宁可进信息流，也不轻易打扰（PRD §9.1）。 */
export const PUSH_SCORE = 60;
export const FEED_SCORE = 35;

export interface UniverseEntry {
  symbol: string;
  name?: string;
  /** 是否持仓。 */
  holding: boolean;
  /** 持仓占组合市值比（0..1），非持仓为 0。 */
  weight: number;
  /** 是否有在跟踪的论点。 */
  thesis: boolean;
  watchlist: boolean;
  alert: boolean;
}

export interface TriageContext {
  now: Date;
  universe: Map<string, UniverseEntry>;
  /** 生效中的降噪分组（= muteTopicForEvent 的取值）。 */
  mutedTopics: string[];
  /** 休市 / 静默时段：行情类事件只进信息流。 */
  quiet?: boolean;
  /** A3：该时刻生效的授权结论，用于把 push 降级为 feed。 */
  consent?: ConsentGate;
}

export interface PrefilterResult {
  level1: EventPrefilter;
  reasons: string[];
}

export interface JudgeResult {
  decision: EventDecision;
  score: number;
  reasons: string[];
}

/** 判级结论的出处：规则、模型，或模型不可用时的规则兜底。 */
export type EventJudgeSource = "rules" | "model" | "rules_fallback";

/**
 * 二级判级的可替换实现。
 *
 * `judgeEvent`（规则版）永远会被算一次并作为入参传入：一是模型失败时可以直接
 * 降级，二是 model 模式要把规则结论一起留痕，供 A/B 对照推送接收率。
 * 返回 null 表示"这次不接管"，调用方继续用规则结论。
 */
export type EventJudgeHook = (
  owner: string,
  candidate: EventCandidateInput,
  context: TriageContext,
  rules: JudgeResult,
) => Promise<JudgeHookResult | null>;

export interface JudgeHookResult {
  result: JudgeResult;
  source: EventJudgeSource;
  /** 另一种判法的结论，只留痕、不改变本次决定。 */
  shadow?: { source: EventJudgeSource; decision: EventDecision; score: number };
  model?: string;
}

/**
 * 把分值翻译成决定，并套用两条硬策略：显式提醒优先、静默时段只进信息流。
 *
 * 规则判级与模型判级共用这一段：模型的产物同样是一个 0..100 的分，
 * 分档线与死规则保持一致，A/B 才可比。
 */
export function applyDecisionPolicy(input: {
  score: number;
  reasons: string[];
  explicitAlert: boolean;
  quiet?: boolean;
  consent?: ConsentGate;
  pushScore?: number;
  feedScore?: number;
}): JudgeResult {
  const pushScore = input.pushScore ?? PUSH_SCORE;
  const feedScore = input.feedScore ?? FEED_SCORE;
  const score = Math.max(0, Math.min(100, Math.round(input.score)));
  const reasons = [...input.reasons];

  let decision: EventDecision =
    score >= pushScore ? "push" : score >= feedScore ? "feed" : "silent";
  if (input.explicitAlert && decision !== "push") {
    decision = "push";
    reasons.push("显式提醒优先于打分：这条按推送处理。");
  }
  if (decision === "push" && input.quiet) {
    decision = "feed";
    reasons.push("当前处于休市 / 静默时段，只进信息流，不推送。");
  }
  // A3 授权策略闸：不改判定算法，只在你没授权提醒 / 免打扰 / 超上限时把 push 降级为 feed。
  if (decision === "push" && input.consent) {
    const gate = input.consent;
    if (!gate.canRemind) {
      decision = "feed";
      reasons.push("你尚未授权「主动提醒」，这条只进信息流，等你主动来看。");
    } else if (gate.pushCapReached) {
      decision = "feed";
      reasons.push("今日推送已达你设置的上限，这条合并进信息流。");
    } else if (gate.quietHours) {
      decision = "feed";
      reasons.push("当前处于你设置的免打扰时段，这条只进信息流。");
    }
  }
  if (decision === "push") reasons.push(`判级得分 ${score} ≥ ${pushScore}，值得打扰。`);
  else if (decision === "feed")
    reasons.push(`判级得分 ${score}，进信息流等你来看（未达 ${pushScore} 推送线）。`);
  else reasons.push(`判级得分 ${score} 低于信息流线 ${feedScore}，只记日志。`);

  return { decision, score, reasons };
}

/** 用户是否为该标的显式挂了价格提醒（只对价格类事件生效）。 */
export function hasExplicitAlert(candidate: EventCandidateInput, context: TriageContext): boolean {
  return context.universe.get(candidate.symbol)?.alert === true && PRICE_TYPES.has(candidate.type);
}

/**
 * 事件类型 → 降噪分组：用户说「价格类少推点」应同时压住异动与阈值两类。
 */
export function muteTopicForEvent(type: EventType): string {
  return type === "price_move" || type === "price_level" ? "price_level" : type;
}

/** 事件类型的基准分：越接近"直接影响论点或资金"的类型越高。 */
const BASE_SCORE: Record<EventType, number> = {
  thesis_risk: 50,
  price_level: 45,
  first_loss: 44,
  earnings: 42,
  maturity: 40,
  policy_drift: 38,
  announcement: 34,
  price_move: 26,
  valuation: 26,
  news: 20,
};

/** 价格类事件：按「类型 + 标的 + 自然日」聚合去重。 */
const PRICE_TYPES = new Set<EventType>(["price_move", "price_level"]);
/**
 * 分桶类事件：按「类型 + 标的 + dedupeBucket」聚合，用「首次/持续」语义。
 * 分桶不变视为同一事件不重复打扰；分桶变化（如回到成本上方再度跌破）才重新提醒。
 */
const BUCKETED_TYPES = new Set<EventType>(["maturity", "first_loss", "policy_drift"]);

/**
 * 是否处于休市 / 静默时段。
 *
 * P0 只做"周末静默"这一条硬规则：A 股、港股、美股周末都休市，价格类事件
 * 周末没有推送价值。真正的交易日历（节假日、各市场盘中时段）留给 P1，
 * 这里刻意保持可预期，不做跨时区的复杂推断。
 */
export function isMarketClosed(now: Date): boolean {
  const day = now.getUTCDay();
  return day === 0 || day === 6;
}

/** 内容去重：同一标的下相同标题（忽略大小写与空白）视为同一事件。 */
function titleKey(title: string): string {
  return title.toLocaleLowerCase().replace(/\s+/g, "");
}

function dayBucket(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * 事件去重键。
 *
 * 价格类按「类型 + 标的 + 自然日」聚合：一天内同一标的同类异动只提醒一次。
 * 内容类按「类型 + 标的 + 标题哈希」聚合，并在服务层叠加 24h 窗口，避免同一
 * 条新闻隔天再推一遍。
 */
export function eventDedupeKey(candidate: EventCandidateInput, now = new Date()): string {
  const day = dayBucket(now);
  if (PRICE_TYPES.has(candidate.type)) {
    // 阈值也进 key：同一标的上挂了多条不同阈值的提醒时，各自提醒、不互相吞掉。
    const threshold = candidate.thresholdValue === undefined ? "" : `:${candidate.thresholdValue}`;
    return `${candidate.type}:${candidate.symbol}${threshold}:${day}`;
  }
  if (BUCKETED_TYPES.has(candidate.type)) {
    // 分桶即去重键：同桶视为同一事件，换桶（状态变化）才重新提醒。
    return `${candidate.type}:${candidate.symbol}:${candidate.dedupeBucket ?? "default"}`;
  }
  return `${candidate.type}:${candidate.symbol}:${titleKey(candidate.title)}`;
}

export function eventFeedId(dedupeKey: string): string {
  return createHash("sha256").update(dedupeKey).digest("hex");
}

/**
 * 一级：低成本规则过滤。只做加减法和集合判断，用来挡掉绝大多数噪音，
 * 让二级判级（可能带模型调用）只处理"有可能值得打扰"的事件。
 */
export function prefilterEvent(
  candidate: EventCandidateInput,
  context: TriageContext,
): PrefilterResult {
  const entry = context.universe.get(candidate.symbol);
  if (!entry) {
    return {
      level1: "not_relevant",
      reasons: [`${candidate.symbol} 不在持仓 / 自选 / 论点 / 提醒范围内，按不打扰处理。`],
    };
  }
  const topic = muteTopicForEvent(candidate.type);
  if (context.mutedTopics.includes(topic) || context.mutedTopics.includes(candidate.type)) {
    return {
      level1: "muted",
      reasons: [`你要求少推${EVENT_TYPE_LABELS[candidate.type]}，本次只记日志。`],
    };
  }
  if (candidate.type === "price_move") {
    const magnitude = candidate.magnitudePercent ?? 0;
    if (magnitude < PRICE_MOVE_FLOOR_PERCENT) {
      return {
        level1: "below_floor",
        reasons: [
          `异动 ${magnitude.toFixed(2)}% 低于 ${PRICE_MOVE_FLOOR_PERCENT}% 门槛，按不打扰处理。`,
        ],
      };
    }
  }
  return { level1: "passed", reasons: [] };
}

/**
 * 二级：判级。这里用可解释的加权打分替代不可审计的"模型说了算"，
 * 默认行为保守（够不到 PUSH_SCORE 就进信息流）。后续要接轻量模型时，
 * 只需替换本函数的实现并保留 reasons，判级依据仍可追溯。
 */
export function judgeEvent(
  candidate: EventCandidateInput,
  context: TriageContext,
  options: { pushScore?: number; feedScore?: number } = {},
): JudgeResult {
  const pushScore = options.pushScore ?? PUSH_SCORE;
  const feedScore = options.feedScore ?? FEED_SCORE;
  const entry = context.universe.get(candidate.symbol);
  const reasons: string[] = [];
  let score = BASE_SCORE[candidate.type];

  if (entry?.holding) {
    const bonus = Math.round(25 * Math.min(1, entry.weight / 0.3));
    score += bonus;
    reasons.push(
      `持仓标的（占组合 ${(entry.weight * 100).toFixed(0)}%）${bonus > 0 ? `，权重加成 +${bonus}` : ""}`,
    );
  } else if (entry?.watchlist) {
    score += 6;
    reasons.push("在自选列表内，加成 +6");
  }
  if (entry?.thesis) {
    score += 20;
    reasons.push("关联在跟踪的论点，加成 +20");
  }
  if (candidate.type === "price_move") {
    const magnitude = candidate.magnitudePercent ?? 0;
    const bonus = Math.min(18, Math.round(magnitude * 2));
    score += bonus;
    reasons.push(`异动幅度 ${magnitude.toFixed(2)}%，加成 +${bonus}`);
  }
  if (candidate.type === "price_level") {
    score += 12;
    reasons.push(
      candidate.thresholdValue === undefined
        ? "触发价格阈值，加成 +12"
        : `触发价格阈值 ${candidate.thresholdValue}，加成 +12`,
    );
  }
  if (candidate.daysUntil !== undefined && candidate.daysUntil >= 0) {
    if (candidate.daysUntil <= 3) {
      score += 12;
      reasons.push(`${candidate.daysUntil} 天内到期，时效性加成 +12`);
    } else if (candidate.daysUntil <= 7) {
      score += 6;
      reasons.push(`${candidate.daysUntil} 天后到期，时效性加成 +6`);
    }
  }
  // 显式意图优先：用户亲自为该标的挂了价格提醒，说明他就是要被通知到。
  // 只对价格类事件生效，避免"挂了提醒"顺带把新闻也推上来。
  const explicitAlert = hasExplicitAlert(candidate, context);
  if (explicitAlert) {
    score += 10;
    reasons.push("你为该标的显式设置了价格提醒，加成 +10");
  }

  return applyDecisionPolicy({
    score,
    reasons,
    explicitAlert,
    quiet: context.quiet,
    consent: context.consent,
    pushScore,
    feedScore,
  });
}

export interface EventFeedCounts {
  push: number;
  feed: number;
  silent: number;
  unread: number;
}

/** 一组判级出处（规则 / 模型 / 降级）的效果统计，用于 A/B 对比推送接收率。 */
export interface JudgeStats {
  judgedBy: EventJudgeSource;
  total: number;
  push: number;
  feed: number;
  silent: number;
  /** 推过的条目里被用户点开过的数量。 */
  pushRead: number;
  /** 推过的条目里用户点了「这类少推点」的数量。 */
  pushNegative: number;
  /** 推过的条目里用户点了「多推点」的数量。 */
  pushPositive: number;
  /** 推送接收率（0..1）：(已读 + 多推点 - 少推点) / 推送数，下限截到 0。 */
  pushAcceptRate: number;
  /** 有对照结论的条目数（shadow）。 */
  shadowCompared: number;
  /** 与对照结论不一致的条目数。 */
  shadowDisagree: number;
  shadowDisagreeRate: number;
}

function round2(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}

export interface HarvestedEvent {
  candidate: EventCandidateInput;
  /** 触发渠道：price_alert / monitor / thesis_check / manual。 */
  source: string;
}

export interface TriageDeps {
  db: Store;
  /** 只在 push 时调用；返回通知 id。 */
  notify?: (owner: string, title: string, body: string, key: string) => Promise<{ id: string }>;
  /** 当前是否休市 / 静默（按用户时区与交易日历），缺省视为非静默。 */
  quiet?: (owner: string, now: Date) => Promise<boolean> | boolean;
  /** A3：解析该时刻的授权结论（是否授权提醒 / 免打扰 / 超上限）；缺省视为不设闸。 */
  consent?: (owner: string, now: Date) => Promise<ConsentGate | undefined>;
  /** 可替换的二级判级（轻量模型）；缺省或返回 null 时用规则结论。 */
  judge?: EventJudgeHook;
  now?: () => Date;
  pushScore?: number;
  feedScore?: number;
  muteDays?: number;
}

/**
 * 事件判级与信息流服务。
 *
 * 一次 ingest 的路径（与 PRD R2 对齐）：
 *   事件 → 一级规则过滤 → 二级判级 → push 写通知收件箱 / feed 写信息流 / silent 只留日志
 * 判级结论与依据全部落库，任何时候都能回答"这条为什么推了 / 为什么没推"。
 */
export class EventTriageService {
  constructor(private readonly deps: TriageDeps) {}

  private get db() {
    return this.deps.db;
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** 从账户已有数据组装"值得关注"的标的集合。 */
  async universe(owner: string): Promise<Map<string, UniverseEntry>> {
    const [holdings, watchlists, notes, alerts] = await Promise.all([
      this.db.list<Holding>(owner, "holdings"),
      this.db.list<{ symbols?: string[] }>(owner, "watchlists"),
      this.db.list<InvestmentNote>(owner, "notes"),
      this.db.list<{ symbol_code?: string; enabled?: boolean }>(owner, "price_alerts"),
    ]);

    const map = new Map<string, UniverseEntry>();
    const ensure = (symbol: string): UniverseEntry => {
      const existing = map.get(symbol);
      if (existing) return existing;
      const entry: UniverseEntry = {
        symbol,
        holding: false,
        weight: 0,
        thesis: false,
        watchlist: false,
        alert: false,
      };
      map.set(symbol, entry);
      return entry;
    };

    const totalValue = holdings.reduce(
      (sum, holding) => sum + Math.max(0, holding.quantity * holding.avg_cost),
      0,
    );
    for (const holding of holdings) {
      const entry = ensure(holding.symbol_code);
      entry.holding = true;
      if (totalValue > 0) {
        entry.weight = Math.max(0, holding.quantity * holding.avg_cost) / totalValue;
      }
      if (holding.name && !entry.name) entry.name = holding.name;
    }
    for (const list of watchlists)
      for (const symbol of list.symbols ?? []) ensure(symbol).watchlist = true;
    for (const note of notes) {
      if (note.type !== "THESIS") continue;
      if (note.status === "INVALIDATED" || note.status === "EXPIRED") continue;
      ensure(note.symbol_code).thesis = true;
    }
    for (const alert of alerts) {
      if (alert.enabled === false || !alert.symbol_code) continue;
      ensure(alert.symbol_code).alert = true;
    }
    return map;
  }

  /** 事件接入入口：幂等（同一 dedupeKey 只落一条）。 */
  async ingest(owner: string, candidate: EventCandidateInput): Promise<EventFeedItem> {
    const now = this.now();
    const dedupeKey = eventDedupeKey(candidate, now);
    const id = eventFeedId(dedupeKey);
    const existing = await this.db.get<EventFeedItem>(owner, FEED_KIND, id);
    if (existing) return existing;

    const [universe, mutes] = await Promise.all([this.universe(owner), this.activeMutes(owner)]);

    // 内容类 24h 去重：同一标的下同一标题（哪怕换了类型）只保留第一次。
    // 价格类与分桶类不打这条路——前者的 key 已含自然日，后者的 key 已含分桶。
    if (!PRICE_TYPES.has(candidate.type) && !BUCKETED_TYPES.has(candidate.type)) {
      const recent = await this.recent(owner, CONTENT_DEDUPE_MS, now);
      const clash = recent.find(
        (item) =>
          item.symbol === candidate.symbol && titleKey(item.title) === titleKey(candidate.title),
      );
      if (clash) {
        const duplicate: EventFeedItem = {
          ...clash,
          reasons: [...clash.reasons, "24 小时内已推送过同标题事件，本次不重复打扰。"],
        };
        await this.db.put(owner, FEED_KIND, duplicate);
        return duplicate;
      }
    }

    const quiet = this.deps.quiet ? await this.deps.quiet(owner, now) : false;
    const consent = this.deps.consent ? await this.deps.consent(owner, now) : undefined;
    const context: TriageContext = {
      now,
      universe,
      mutedTopics: mutes.map((mute) => muteTopicForEvent(mute.topic as EventType)),
      quiet,
      ...(consent ? { consent } : {}),
    };

    const prefilter = prefilterEvent(candidate, context);
    let decision: EventDecision = "silent";
    let score = 0;
    let reasons = [...prefilter.reasons];
    let judgedBy: EventJudgeSource = "rules";
    let shadow: EventFeedItem["shadow"];
    let judgeModel: string | undefined;

    if (prefilter.level1 === "passed") {
      const options = { pushScore: this.deps.pushScore, feedScore: this.deps.feedScore };
      const rules = judgeEvent(candidate, context, options);
      let judged: JudgeHookResult = { result: rules, source: "rules" };
      if (this.deps.judge) {
        try {
          const hooked = await this.deps.judge(owner, candidate, context, rules);
          if (hooked) judged = hooked;
        } catch {
          // 模型判级失败不能丢事件：降级规则，并把降级留痕（PRD §7.2）。
          judged = {
            result: { ...rules, reasons: [...rules.reasons, "模型判级不可用，本次按规则判级。"] },
            source: "rules_fallback",
          };
        }
      }
      // 契约：hook 返回的 JudgeResult 与 judgeEvent 同形（decision/score/reasons 都齐），
      // 分档与死策略由 hook 内部调 applyDecisionPolicy 落地，这里不再二次套用。
      decision = judged.result.decision;
      score = judged.result.score;
      reasons = [...reasons, ...judged.result.reasons];
      judgedBy = judged.source;
      shadow = judged.shadow;
      judgeModel = judged.model;
    }

    let notificationId: string | undefined;
    if (decision === "push" && this.deps.notify) {
      try {
        const notification = await this.deps.notify(
          owner,
          candidate.title,
          candidate.body || EVENT_TYPE_LABELS[candidate.type],
          `event:${dedupeKey}`,
        );
        notificationId = notification.id;
      } catch {
        // 推送通道失败不能丢事件：降级为信息流，保证不遗漏（PRD §7.2）。
        decision = "feed";
        reasons.push("推送通道失败，已降级到信息流，事件未丢失。");
      }
    }

    const item: EventFeedItem = {
      id,
      type: candidate.type,
      symbol: candidate.symbol,
      title: candidate.title,
      body: candidate.body,
      decision,
      score,
      level1: prefilter.level1,
      reasons,
      dedupeKey,
      judgedBy,
      ...(judgeModel ? { judgeModel } : {}),
      ...(shadow ? { shadow } : {}),
      ...(candidate.source ? { source: candidate.source } : {}),
      ...(candidate.url ? { url: candidate.url } : {}),
      occurredAt: candidate.occurredAt ?? now.toISOString(),
      createdAt: now.toISOString(),
      read: false,
      ...(notificationId ? { notificationId } : {}),
      ...(consent?.consentId ? { consentId: consent.consentId } : {}),
    };
    return this.db.put(owner, FEED_KIND, item);
  }

  private async recent(
    owner: string,
    windowMs: number,
    now = this.now(),
  ): Promise<EventFeedItem[]> {
    const items = await this.db.list<EventFeedItem>(owner, FEED_KIND);
    return items.filter((item) => now.getTime() - Date.parse(item.createdAt) <= windowMs);
  }

  async list(
    owner: string,
    filters: {
      decision?: EventDecision;
      symbol?: string;
      limit?: number;
      includeSilent?: boolean;
    } = {},
  ): Promise<EventFeedItem[]> {
    const items = await this.db.list<EventFeedItem>(owner, FEED_KIND);
    const limit = Math.max(1, Math.min(200, filters.limit ?? 50));
    return items
      .filter((item) => (filters.includeSilent ? true : item.decision !== "silent"))
      .filter((item) => (filters.decision ? item.decision === filters.decision : true))
      .filter((item) => (filters.symbol ? item.symbol === filters.symbol : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async counts(owner: string): Promise<EventFeedCounts> {
    const items = await this.db.list<EventFeedItem>(owner, FEED_KIND);
    const counts: EventFeedCounts = { push: 0, feed: 0, silent: 0, unread: 0 };
    for (const item of items) {
      counts[item.decision]++;
      if (!item.read && item.decision !== "silent") counts.unread++;
    }
    return counts;
  }

  /**
   * 按判级出处分组统计，用来直接对比「规则 vs 模型」的推送接收率。
   *
   * 这是把 judgeEvent 换成轻量模型后唯一需要的验收口径：同样的分档线、同样的
   * 事件集合，谁推的条目用户点开得多、抱怨得少，就留谁。
   */
  async stats(owner: string): Promise<JudgeStats[]> {
    const items = await this.db.list<EventFeedItem>(owner, FEED_KIND);
    const groups = new Map<EventJudgeSource, JudgeStats>();
    const ensure = (source: EventJudgeSource): JudgeStats => {
      const existing = groups.get(source);
      if (existing) return existing;
      const created: JudgeStats = {
        judgedBy: source,
        total: 0,
        push: 0,
        feed: 0,
        silent: 0,
        pushRead: 0,
        pushNegative: 0,
        pushPositive: 0,
        pushAcceptRate: 0,
        shadowCompared: 0,
        shadowDisagree: 0,
        shadowDisagreeRate: 0,
      };
      groups.set(source, created);
      return created;
    };

    for (const item of items) {
      const stats = ensure(item.judgedBy ?? "rules");
      stats.total++;
      stats[item.decision]++;
      if (item.decision === "push") {
        // 只统计"没有表态但点开了"的条目：投过票的以票为准，
        // 否则「少推点」也会顺手把 read 置真，把负面反馈算成接收。
        if (item.read && !item.feedback) stats.pushRead++;
        if (item.feedback === "less") stats.pushNegative++;
        if (item.feedback === "more") stats.pushPositive++;
      }
      if (item.shadow) {
        stats.shadowCompared++;
        if (item.shadow.decision !== item.decision) stats.shadowDisagree++;
      }
    }
    for (const stats of groups.values()) {
      // 接收率：推过的条目里被点开或明确说「多推点」的比例；明确抱怨的直接不算接收。
      const accepted = stats.pushRead + stats.pushPositive - stats.pushNegative;
      stats.pushAcceptRate = stats.push > 0 ? round2(accepted / stats.push) : 0;
      stats.shadowDisagreeRate =
        stats.shadowCompared > 0 ? round2(stats.shadowDisagree / stats.shadowCompared) : 0;
    }
    return [...groups.values()].sort((a, b) => b.total - a.total);
  }

  async markRead(owner: string, id: string): Promise<EventFeedItem> {
    const item = await this.db.get<EventFeedItem>(owner, FEED_KIND, id);
    if (!item) throw new AppError("Event not found", 404);
    if (item.read) return item;
    return (await this.db.put(owner, FEED_KIND, { ...item, read: true })) as EventFeedItem;
  }

  /**
   * 负反馈闭环：
   *   less → 该类型进入冷却池（默认 14 天），同时把当前这类事件标记出来；
   *   more → 解除冷却，后续同类事件恢复判级。
   */
  async feedback(
    owner: string,
    id: string,
    vote: "less" | "more",
    scope?: EventType,
  ): Promise<{ item: EventFeedItem; mute?: InvestorMutedTopic }> {
    const item = await this.db.get<EventFeedItem>(owner, FEED_KIND, id);
    if (!item) throw new AppError("Event not found", 404);
    const topic = muteTopicForEvent(scope ?? item.type);
    const updated = await this.db.put(owner, FEED_KIND, { ...item, feedback: vote, read: true });

    if (vote === "more") {
      await this.unmute(owner, topic);
      return { item: updated as EventFeedItem };
    }
    const mute = await this.mute(owner, topic, this.deps.muteDays ?? DEFAULT_MUTE_DAYS);
    return { item: updated as EventFeedItem, mute };
  }

  /** 当前生效的降噪项；到期的自动失效，不需要清理任务。 */
  async activeMutes(owner: string, now = this.now()): Promise<InvestorMutedTopic[]> {
    const stored = await this.deps.db.get<{ id: string; mutes: InvestorMutedTopic[] }>(
      owner,
      MUTE_KIND,
      MUTE_ID,
    );
    return (stored?.mutes ?? []).filter((mute) => {
      const until = Date.parse(mute.until);
      return Number.isFinite(until) && until > now.getTime();
    });
  }

  /** 「这类少推点」：把事件分组放进冷却池，到期自动失效。 */
  async mute(
    owner: string,
    topic: string,
    days = this.deps.muteDays ?? DEFAULT_MUTE_DAYS,
    reason: InvestorMutedTopic["reason"] = "user_feedback",
  ): Promise<InvestorMutedTopic> {
    const current = await this.activeMutes(owner);
    const until = new Date(this.now().getTime() + Math.max(1, days) * 86400000).toISOString();
    const mute: InvestorMutedTopic = {
      topic,
      label:
        topic === "price_level" ? "价格类提醒" : (EVENT_TYPE_LABELS[topic as EventType] ?? topic),
      until,
      reason,
    };
    await this.deps.db.put(owner, MUTE_KIND, {
      id: MUTE_ID,
      mutes: [...current.filter((item) => item.topic !== topic), mute],
      updatedAt: this.now().toISOString(),
    });
    return mute;
  }

  /** 解除冷区（用户点"多推点"时调用）。 */
  async unmute(owner: string, topic: string): Promise<void> {
    const current = await this.activeMutes(owner);
    await this.deps.db.put(owner, MUTE_KIND, {
      id: MUTE_ID,
      mutes: current.filter((item) => item.topic !== topic),
      updatedAt: this.now().toISOString(),
    });
  }

  /**
   * 把一批候选事件喂进判级流水线（供维护循环使用）。
   * 单条失败不影响其他事件，返回值只包含成功落库的条目。
   */
  async ingestMany(owner: string, candidates: EventCandidateInput[]): Promise<EventFeedItem[]> {
    const items: EventFeedItem[] = [];
    for (const candidate of candidates) {
      try {
        items.push(await this.ingest(owner, candidate));
      } catch {
        // 单条事件解析/落库失败不影响整批。
      }
    }
    return items;
  }
}
