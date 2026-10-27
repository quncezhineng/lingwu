import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ResearchReport } from "../../../../packages/domain/src/agent.ts";
import {
  MarketDataError,
  type MarketDataService,
  normalizeYahooSymbol,
  type Quote,
} from "../../../../packages/integrations/src/market-data.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";
import type { SearchService } from "../search.ts";

const REPORT_KIND = "research_reports";

export const researchSymbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[A-Za-z0-9^=.-]+$/, "Invalid symbol");

/** Small P0 peer map; unknown symbols simply return an empty comparison. */
const PEER_GROUPS: Record<string, string[]> = {
  AAPL: ["MSFT", "GOOGL", "AMZN", "META"],
  MSFT: ["AAPL", "GOOGL", "AMZN"],
  GOOGL: ["META", "MSFT", "AMZN"],
  AMZN: ["MSFT", "GOOGL", "AAPL"],
  META: ["GOOGL", "SNAP", "PINS"],
  TSLA: ["GM", "F", "RIVN"],
  NVDA: ["AMD", "INTC", "AVGO"],
  "600519.SS": ["000858.SZ", "000568.SZ", "600809.SS"],
  "000858.SZ": ["600519.SS", "000568.SZ", "600809.SS"],
  "300750.SZ": ["002594.SZ", "601127.SS", "600104.SS"],
};

export interface ResearchNewsItem {
  title: string;
  url: string;
  excerpt?: string;
  publishedAt?: string;
}

export interface PeerQuote {
  symbol: string;
  name?: string;
  price?: number;
  changePercent?: number;
  error?: string;
}

export interface ResearchDeps {
  db: Store;
  market: MarketDataService;
  search?: Pick<SearchService, "search">;
  now?: () => Date;
}

export type ResearchProgress = (step: string, detail?: string) => Promise<void>;

function resolveProfile(
  deps: ResearchDeps,
  symbol: string,
): Promise<{ name?: string; sector?: string }> {
  return deps.market
    .searchSymbols(symbol, 10)
    .then((matches) => {
      const exact = matches.find((match) => match.symbol.toUpperCase() === symbol.toUpperCase());
      return { name: exact?.name, sector: exact?.sector };
    })
    .catch(() => ({}));
}

async function collectNews(
  deps: ResearchDeps,
  owner: string,
  symbol: string,
  name?: string,
): Promise<{ news: ResearchNewsItem[]; note?: string }> {
  if (!deps.search) return { news: [], note: "新闻检索未配置（缺少搜索服务）。" };
  try {
    const result = await deps.search.search(owner, `research:${symbol}`, {
      objective: `Collect recent news about ${name ?? symbol} (${symbol}) for an investment research report.`,
      search_queries: [`${name ?? symbol} 最新新闻`, `${symbol} 财报 业绩 公告`],
    });
    const news = result.results.slice(0, 5).map((item) => ({
      title: item.title ?? item.url,
      url: item.url,
      ...(item.excerpts[0] ? { excerpt: item.excerpts[0].slice(0, 400) } : {}),
      ...(item.publish_date ? { publishedAt: item.publish_date } : {}),
    }));
    return {
      news,
      ...(news.length === 0 ? { note: "新闻检索未返回结果。" } : {}),
    };
  } catch (error) {
    return {
      news: [],
      note: `新闻检索失败：${error instanceof Error ? error.message.slice(0, 200) : "未知错误"}`,
    };
  }
}

async function collectPeers(
  deps: ResearchDeps,
  symbol: string,
): Promise<{ peers: PeerQuote[]; note?: string }> {
  const peers = PEER_GROUPS[symbol.toUpperCase()] ?? [];
  if (peers.length === 0) return { peers: [], note: "P0 尚未配置该标的的同业对比组。" };
  const settled = await Promise.allSettled(
    peers.map(async (peer) => ({ symbol: peer, quote: await deps.market.getQuote(peer) })),
  );
  return {
    peers: settled.map((result, i) => {
      const peer = peers[i] ?? "";
      if (result.status === "fulfilled")
        return {
          symbol: peer,
          name: result.value.quote.name,
          price: result.value.quote.price,
          changePercent: result.value.quote.changePercent,
        };
      return {
        symbol: peer,
        error: result.reason instanceof MarketDataError ? result.reason.kind : "provider_error",
      };
    }),
  };
}

/** Heuristic price band from the 52-week range; explicitly not a DCF. */
function estimateValuation(quote: Quote): Record<string, unknown> {
  const low = quote.fiftyTwoWeekLow;
  const high = quote.fiftyTwoWeekHigh;
  if (typeof low === "number" && typeof high === "number" && low > 0 && high >= low) {
    return {
      method: "range_heuristic",
      current: quote.price,
      low,
      mid: Number(((low + high) / 2).toFixed(2)),
      high,
      assumptions: [
        "区间取自 52 周最低/最高价，未使用 DCF 或可比公司倍数。",
        `当前价位于区间的 ${(((quote.price - low) / (high - low)) * 100).toFixed(1)}%。`,
      ],
      caveat: "启发式估值区间，仅供研究参考，不构成投资建议。",
    };
  }
  const lowBand = Number((quote.price * 0.9).toFixed(2));
  const highBand = Number((quote.price * 1.1).toFixed(2));
  return {
    method: "price_band_heuristic",
    current: quote.price,
    low: lowBand,
    mid: quote.price,
    high: highBand,
    assumptions: ["缺少 52 周区间，使用当前价 ±10% 作为占位区间。"],
    caveat: "占位估值区间，数据补齐后需重新计算；不构成投资建议。",
  };
}

function companyOverview(input: {
  symbol: string;
  name?: string;
  sector?: string;
  quote: Quote;
}): string {
  const { symbol, name, sector, quote } = input;
  const direction = quote.change >= 0 ? "上涨" : "下跌";
  return [
    `${name ?? symbol}（${symbol}）在 ${quote.market === "CN" ? "A 股" : quote.market === "HK" ? "港股" : "美股"}市场交易${sector ? `，属于 ${sector} 行业` : ""}。`,
    `最新价 ${quote.price}${quote.currency ? ` ${quote.currency}` : ""}，较前收${direction} ${Math.abs(quote.changePercent).toFixed(2)}%。`,
    quote.dayHigh !== undefined && quote.dayLow !== undefined
      ? `日内区间 ${quote.dayLow}–${quote.dayHigh}，成交量 ${quote.volume ?? "未知"}。`
      : "日内高低点与成交量数据暂不可用。",
  ].join("");
}

function buildRisks(quote: Quote, newsNote?: string, peerNote?: string): string[] {
  const risks = [
    "行情为延迟数据（约 15 分钟），盘中波动可能与本报告不一致。",
    "P0 未接入完整财报与公告源，财务指标与估值区间为启发式结果。",
    "本报告由自动流程生成，不构成投资建议。",
  ];
  if (newsNote) risks.push(newsNote);
  if (peerNote) risks.push(peerNote);
  if (quote.stale) risks.push("本次行情来自过期缓存，数据可能不是最新。");
  return risks;
}

/**
 * Build a structured research report from quotes, search results and heuristic valuation.
 * Each data source degrades independently: one failure never blocks the whole report.
 */
export async function generateResearchReport(
  owner: string,
  rawSymbol: string,
  deps: ResearchDeps,
  progress: ResearchProgress = async () => {},
): Promise<ResearchReport> {
  const symbol = normalizeYahooSymbol(researchSymbolSchema.parse(rawSymbol));
  const now = deps.now?.() ?? new Date();

  await progress("get_quote", `Loading the latest quote for ${symbol}`);
  let quote: Quote;
  try {
    quote = await deps.market.getQuote(symbol);
  } catch (error) {
    throw new AppError(
      `Unable to load a quote for ${symbol}: ${error instanceof MarketDataError ? error.kind : "provider error"}`,
      502,
    );
  }
  const profile = await resolveProfile(deps, symbol);

  await progress("search_news", `Searching recent news for ${profile.name ?? symbol}`);
  const { news, note: newsNote } = await collectNews(deps, owner, symbol, profile.name);

  await progress("get_financials", "Deriving available financial fields");
  const financials: Record<string, unknown> = {
    price: quote.price,
    previousClose: quote.previousClose,
    change: quote.change,
    changePercent: quote.changePercent,
    dayHigh: quote.dayHigh ?? null,
    dayLow: quote.dayLow ?? null,
    volume: quote.volume ?? null,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
    currency: quote.currency ?? null,
    asOf: quote.asOf,
    source: quote.source,
    unavailable: [
      quote.dayHigh === undefined ? "dayHigh" : null,
      quote.dayLow === undefined ? "dayLow" : null,
      quote.volume === undefined ? "volume" : null,
      "marketCap",
      "peRatio",
      "revenue",
      "netIncome",
    ].filter((field): field is string => field !== null),
  };

  await progress("compare_peers", "Comparing peers");
  const { peers, note: peerNote } = await collectPeers(deps, symbol);

  await progress("estimate_valuation", "Estimating a valuation range");
  const valuation = estimateValuation(quote);

  const report: ResearchReport = {
    id: randomUUID(),
    user_id: owner,
    symbol_code: symbol,
    title: `${profile.name ?? symbol} 深度研究`,
    sections: {
      company_overview: companyOverview({ symbol, ...profile, quote }),
      financials,
      news,
      peer_comparison: peers,
      valuation,
      risks: buildRisks(quote, newsNote, peerNote),
    },
    generated_at: now.toISOString(),
  };
  await deps.db.put(owner, REPORT_KIND, report);
  return report;
}

function sortReports(reports: ResearchReport[]): ResearchReport[] {
  return [...reports].sort((a, b) => b.generated_at.localeCompare(a.generated_at));
}

export async function listResearchReports(
  db: Store,
  owner: string,
  symbol: string,
  limit = 10,
): Promise<ResearchReport[]> {
  const normalized = normalizeYahooSymbol(researchSymbolSchema.parse(symbol));
  const reports = await db.listByField<ResearchReport>(
    owner,
    REPORT_KIND,
    "symbol_code",
    normalized,
  );
  return sortReports(reports).slice(0, limit);
}

export async function findLatestResearchReport(
  db: Store,
  owner: string,
  symbol: string,
): Promise<ResearchReport | null> {
  const reports = await listResearchReports(db, owner, symbol, 1);
  return reports[0] ?? null;
}
