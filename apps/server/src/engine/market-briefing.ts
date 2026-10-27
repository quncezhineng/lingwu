import { randomUUID } from "node:crypto";
import type { MarketBriefing } from "../../../../packages/domain/src/agent.ts";
import {
  type MarketDataService,
  type Quote,
  resolveMarket,
} from "../../../../packages/integrations/src/market-data.ts";
import type { Store } from "../db.ts";

const BRIEFING_KIND = "market_briefings";
const WATCHLIST_KIND = "watchlists";
const MAX_WATCHLIST_SYMBOLS = 50;

interface WatchlistRecord {
  id: string;
  name: string;
  symbols: string[];
}

export interface BriefingDeps {
  db: Store;
  market: MarketDataService;
  /** Injectable clock for tests. */
  now?: () => Date;
}

function dateOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function percent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function indexSentence(quote: Quote): string {
  const name = quote.name ?? quote.symbol;
  return `${name} ${percent(quote.changePercent)}（${quote.price.toLocaleString("en-US")}）`;
}

function moverSentence(symbol: string, quote: Quote): string {
  return `${symbol} ${percent(quote.changePercent)}（${quote.price.toLocaleString("en-US")}）`;
}

async function collectWatchlistSymbols(db: Store, owner: string): Promise<string[]> {
  const watchlists = await db.list<WatchlistRecord>(owner, WATCHLIST_KIND);
  const symbols = new Set<string>();
  for (const watchlist of watchlists)
    for (const symbol of watchlist.symbols ?? []) {
      if (symbols.size >= MAX_WATCHLIST_SYMBOLS) break;
      symbols.add(symbol);
    }
  return [...symbols];
}

/** Build 3-5 Chinese bullet points from index moves, watchlist moves and data gaps. */
export function buildBriefingSummary(input: {
  indexes: Quote[];
  movers: { symbol: string; quote: Quote }[];
  watchlistCount: number;
  unavailable: string[];
}): string[] {
  const bullets: string[] = [];
  const { indexes, movers, watchlistCount, unavailable } = input;

  const sortedIndexes = [...indexes].sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent),
  );
  if (sortedIndexes.length > 0) {
    const top = sortedIndexes.slice(0, 2);
    const average = indexes.reduce((sum, quote) => sum + quote.changePercent, 0) / indexes.length;
    const tone = average >= 0.5 ? "整体走强" : average <= -0.5 ? "整体走弱" : "涨跌互现";
    bullets.push(
      `隔夜全球主要指数${tone}：${top.map(indexSentence).join("，")}${sortedIndexes.length > 2 ? ` 等 ${indexes.length} 个指数` : ""}。`,
    );
  } else {
    bullets.push("隔夜指数数据暂不可用，本简报仅包含观察列表信息。");
  }

  if (movers.length > 0) {
    const top = movers.slice(0, 3);
    bullets.push(
      `自选标的异动：${top.map(({ symbol, quote }) => moverSentence(symbol, quote)).join("，")}。`,
    );
  } else if (watchlistCount > 0) {
    bullets.push(`观察列表共 ${watchlistCount} 个标的，暂无明显异动（单日幅度均小于 2%）。`);
  } else {
    bullets.push("你还没有观察列表，添加标的后简报会包含自选股异动。");
  }

  if (unavailable.length > 0) {
    bullets.push(
      `有 ${unavailable.length} 个标的行情暂不可用（${unavailable.slice(0, 3).join("、")}），已跳过相关分析。`,
    );
  } else if (indexes.length > 0) {
    const best = sortedIndexes[0];
    if (best)
      bullets.push(
        `关注今日开盘后 ${best.name ?? best.symbol} 的延续性，以及自选标的的成交量变化。`,
      );
  }

  bullets.push(
    unavailable.length === 0 && indexes.length === 0
      ? "数据源恢复后将自动补齐指数与观察列表分析。"
      : "以上内容由行情数据自动汇总，不构成投资建议。",
  );

  return bullets.slice(0, 5);
}

function renderContent(summary: string[], marketData: Record<string, unknown>): string {
  const lines = ["# 每日市场简报", ""];
  for (let i = 0; i < summary.length; i++) lines.push(`${i + 1}. ${summary[i]}`);
  const indexes = marketData.indexes as
    | { name?: string; symbol: string; price: number; changePercent: number }[]
    | undefined;
  if (indexes && indexes.length > 0) {
    lines.push("", "## 指数行情", "", "| 指数 | 点位 | 涨跌幅 |", "| --- | --- | --- |");
    for (const index of indexes)
      lines.push(
        `| ${index.name ?? index.symbol} | ${index.price.toLocaleString("en-US")} | ${percent(index.changePercent)} |`,
      );
  }
  lines.push("", "> 数据来源：Yahoo Finance / AKShare，延迟约 15 分钟。不构成投资建议。");
  return lines.join("\n");
}

/** Return today's briefing for an owner, or null when it has not been generated yet. */
export async function findBriefing(
  db: Store,
  owner: string,
  date: string,
): Promise<MarketBriefing | null> {
  const today = await db.listByField<MarketBriefing>(owner, BRIEFING_KIND, "date", date);
  return today[0] ?? null;
}

export async function findLatestBriefing(db: Store, owner: string): Promise<MarketBriefing | null> {
  const all = await db.list<MarketBriefing>(owner, BRIEFING_KIND);
  return all[0] ?? null;
}

/**
 * Generate (or reuse) the daily briefing for an owner.
 * Idempotent per calendar date: an existing briefing is returned unchanged.
 */
export async function generateMarketBriefing(
  owner: string,
  deps: BriefingDeps,
  options: { date?: string; force?: boolean } = {},
): Promise<MarketBriefing> {
  const now = deps.now?.() ?? new Date();
  const date = options.date ?? dateOf(now);
  if (!options.force) {
    const existing = await findBriefing(deps.db, owner, date);
    if (existing) return existing;
  }

  const symbols = await collectWatchlistSymbols(deps.db, owner);
  const [indexes, watchlistQuotes] = await Promise.all([
    deps.market.getIndexData().catch(() => [] as Quote[]),
    Promise.allSettled(
      symbols.map(async (symbol) => ({ symbol, quote: await deps.market.getQuote(symbol) })),
    ),
  ]);

  const quotes: { symbol: string; quote: Quote }[] = [];
  for (const result of watchlistQuotes) {
    if (result.status === "fulfilled") quotes.push(result.value);
  }
  const unavailableSymbols = symbols.filter((_, i) => watchlistQuotes[i]?.status === "rejected");

  const movers = quotes
    .filter(({ quote }) => Math.abs(quote.changePercent) >= 2)
    .sort((a, b) => Math.abs(b.quote.changePercent) - Math.abs(a.quote.changePercent));

  const summary = buildBriefingSummary({
    indexes,
    movers,
    watchlistCount: symbols.length,
    unavailable: unavailableSymbols,
  });

  const marketData = {
    indexes: indexes.map((quote) => ({
      symbol: quote.symbol,
      name: quote.name,
      market: quote.market,
      price: quote.price,
      previousClose: quote.previousClose,
      change: quote.change,
      changePercent: quote.changePercent,
      asOf: quote.asOf,
      stale: quote.stale ?? false,
    })),
  };
  const symbolUpdates: Record<string, unknown> = {};
  for (const { symbol, quote } of quotes)
    symbolUpdates[symbol] = {
      name: quote.name,
      market: quote.market ?? resolveMarket(symbol),
      price: quote.price,
      previousClose: quote.previousClose,
      change: quote.change,
      changePercent: quote.changePercent,
      asOf: quote.asOf,
      stale: quote.stale ?? false,
    };

  const briefing: MarketBriefing = {
    id: randomUUID(),
    user_id: owner,
    date,
    summary,
    content: renderContent(summary, marketData),
    market_data: marketData,
    symbol_updates: symbolUpdates,
    events: [],
    generated_at: now.toISOString(),
  };
  await deps.db.put(owner, BRIEFING_KIND, briefing);
  return briefing;
}
