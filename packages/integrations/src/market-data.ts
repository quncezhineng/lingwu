import { execFile } from "node:child_process";

/** Markets supported by the P0 investment research features. */
export type Market = "US" | "CN" | "HK";

export interface Quote {
  symbol: string;
  name?: string;
  market: Market;
  currency?: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh?: number;
  dayLow?: number;
  volume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  /** Time the upstream quote was produced. */
  asOf: string;
  source: "yahoo" | "akshare" | "cache";
  /** True when the data came from a stale cache after an upstream failure. */
  stale?: boolean;
}

export interface SymbolMatch {
  symbol: string;
  name: string;
  market: Market;
  exchange?: string;
  type?: string;
  sector?: string;
}

export type MarketDataErrorKind =
  | "network"
  | "timeout"
  | "http"
  | "parse"
  | "not_found"
  | "unsupported";

export class MarketDataError extends Error {
  constructor(
    readonly kind: MarketDataErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MarketDataError";
  }
}

export interface MarketDataProvider {
  readonly id: "yahoo" | "akshare";
  supports(market: Market): boolean;
  getQuote(symbol: string): Promise<Quote>;
  searchSymbols(query: string, limit: number): Promise<SymbolMatch[]>;
  getIndexData(): Promise<Quote[]>;
}

export type PythonRunner = (script: string, timeoutMs: number) => Promise<string>;

export interface MarketDataLogContext {
  phase: string;
  provider: string;
  kind: MarketDataErrorKind | "provider_error";
  symbol?: string;
  status?: number;
}

const YAHOO_BASE = "https://query1.finance.yahoo.com";
const REQUEST_TIMEOUT_MS = 5_000;
/** Deadline for one symbol across the whole provider chain (Yahoo + AKShare). */
export const DEFAULT_QUOTE_TIMEOUT_MS = 5_000;
export const DEFAULT_AKSHARE_TIMEOUT_MS = 5_000;

/**
 * Reject a promise once `ms` elapses, even when the underlying work ignores its abort signal.
 * Prevents a hanging provider from blocking a whole summary request.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = `Timed out after ${ms}ms`,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new MarketDataError("timeout", message));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Indexes shown in the daily market briefing. */
export const BRIEFING_INDEXES: { symbol: string; name: string; market: Market }[] = [
  { symbol: "^GSPC", name: "标普 500", market: "US" },
  { symbol: "^IXIC", name: "纳斯达克综合", market: "US" },
  { symbol: "^DJI", name: "道琼斯工业", market: "US" },
  { symbol: "000001.SS", name: "上证指数", market: "CN" },
  { symbol: "399001.SZ", name: "深证成指", market: "CN" },
];

const CODE_PATTERN = /^[A-Za-z0-9^=.-]{1,24}$/;
const SYMBOL_PATTERN = /^[A-Za-z0-9^=.-]{1,24}$/;

/** Map a symbol to its market based on the suffix Yahoo Finance uses. */
export function resolveMarket(symbol: string): Market {
  const upper = symbol.toUpperCase();
  if (upper.endsWith(".SS") || upper.endsWith(".SZ") || upper.endsWith(".SH")) return "CN";
  if (upper.endsWith(".HK")) return "HK";
  return "US";
}

/** Yahoo uses `.SS` for Shanghai; accept `.SH` from callers and normalize it. */
export function normalizeYahooSymbol(symbol: string): string {
  const trimmed = symbol.trim();
  if (/\.SH$/i.test(trimmed)) return `${trimmed.slice(0, -3).toUpperCase()}.SS`;
  return trimmed.toUpperCase();
}

function classifyStatus(status: number): MarketDataErrorKind {
  if (status === 404) return "not_found";
  if (status === 429) return "http";
  return "http";
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MarketDataError("parse", "Upstream returned malformed JSON", response.status);
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

interface YahooChartMeta {
  currency?: string;
  symbol?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketTime?: number;
}

function yahooQuoteFromMeta(meta: YahooChartMeta, symbol: string): Quote {
  const price = numberOrUndefined(meta.regularMarketPrice);
  if (price === undefined)
    throw new MarketDataError("parse", `Yahoo chart for ${symbol} has no market price`);
  const previousClose =
    numberOrUndefined(meta.chartPreviousClose) ?? numberOrUndefined(meta.previousClose) ?? price;
  const change = price - previousClose;
  const changePercent = previousClose === 0 ? 0 : (change / previousClose) * 100;
  return {
    symbol: meta.symbol ?? symbol,
    name: meta.longName ?? meta.shortName,
    market: resolveMarket(symbol),
    currency: meta.currency,
    price,
    previousClose,
    change,
    changePercent,
    dayHigh: numberOrUndefined(meta.regularMarketDayHigh),
    dayLow: numberOrUndefined(meta.regularMarketDayLow),
    volume: numberOrUndefined(meta.regularMarketVolume),
    fiftyTwoWeekHigh: numberOrUndefined(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: numberOrUndefined(meta.fiftyTwoWeekLow),
    asOf: new Date((meta.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    source: "yahoo",
  };
}

export interface YahooProviderOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

/** US/HK primary source and A-share fallback. Uses public chart/search endpoints. */
export class YahooFinanceProvider implements MarketDataProvider {
  readonly id = "yahoo" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: YahooProviderOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl ?? YAHOO_BASE;
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  supports(): boolean {
    return true;
  }

  private async request(url: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; LingWu/1.0)",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof MarketDataError) throw error;
      const detail = error instanceof Error ? error.message : "network request failed";
      throw new MarketDataError("network", `Yahoo Finance request failed: ${detail}`);
    }
    if (!response.ok)
      throw new MarketDataError(
        classifyStatus(response.status),
        `Yahoo Finance responded ${response.status}`,
        response.status,
      );
    return response;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const normalized = normalizeYahooSymbol(symbol);
    if (!SYMBOL_PATTERN.test(normalized))
      throw new MarketDataError("unsupported", `Invalid symbol: ${symbol}`);
    const url = `${this.baseUrl}/v8/finance/chart/${encodeURIComponent(normalized)}?range=1d&interval=1d&includePrePost=false`;
    const response = await this.request(url);
    const payload = (await readJson(response)) as {
      chart?: {
        result?: { meta?: YahooChartMeta }[];
        error?: { code?: string; description?: string } | null;
      };
    };
    const chartError = payload.chart?.error;
    if (chartError)
      throw new MarketDataError(
        chartError.code === "Not Found" ? "not_found" : "parse",
        chartError.description ?? "Yahoo Finance chart error",
      );
    const meta = payload.chart?.result?.[0]?.meta;
    if (!meta) throw new MarketDataError("not_found", `No quote found for ${symbol}`);
    return yahooQuoteFromMeta(meta, normalized);
  }

  async searchSymbols(query: string, limit = 10): Promise<SymbolMatch[]> {
    const term = query.trim();
    if (!term || term.length > 64) return [];
    const url = `${this.baseUrl}/v1/finance/search?q=${encodeURIComponent(term)}&quotesCount=${Math.min(Math.max(limit, 1), 50)}&newsCount=0`;
    const response = await this.request(url);
    const payload = (await readJson(response)) as {
      quotes?: {
        symbol?: string;
        shortname?: string;
        longname?: string;
        exchange?: string;
        exchDisp?: string;
        quoteType?: string;
        sector?: string;
      }[];
    };
    const matches: SymbolMatch[] = [];
    for (const quote of payload.quotes ?? []) {
      if (!quote.symbol || !SYMBOL_PATTERN.test(quote.symbol)) continue;
      if (
        !["EQUITY", "ETF", "INDEX", "MUTUALFUND", "CRYPTOCURRENCY"].includes(
          quote.quoteType ?? "EQUITY",
        )
      )
        continue;
      matches.push({
        symbol: quote.symbol,
        name: quote.longname ?? quote.shortname ?? quote.symbol,
        market: resolveMarket(quote.symbol),
        exchange: quote.exchDisp ?? quote.exchange,
        type: quote.quoteType,
        sector: quote.sector,
      });
      if (matches.length >= limit) break;
    }
    return matches;
  }

  async getIndexData(): Promise<Quote[]> {
    const quotes = await Promise.all(
      BRIEFING_INDEXES.map(async (index) => {
        const quote = await this.getQuote(index.symbol);
        return { ...quote, name: index.name };
      }),
    );
    return quotes;
  }
}

export interface AkshareProviderOptions {
  pythonRunner?: PythonRunner;
  timeoutMs?: number;
}

const AKSHARE_SCRIPT = (code: string) => `
import json
import akshare as ak
df = ak.stock_bid_ask_em(symbol="${code}")
data = {str(row["item"]): row["value"] for _, row in df.iterrows()}
print(json.dumps(data, ensure_ascii=False))
`;

const defaultPythonRunner: PythonRunner = (script, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(
      process.env.AKSHARE_PYTHON ?? "python3",
      ["-c", script],
      {
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024,
        env: process.env,
      },
      (error, stdout) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code;
          const timedOut = code === "ETIMEDOUT" || (error as { killed?: boolean }).killed;
          reject(
            new MarketDataError(
              timedOut ? "timeout" : "network",
              timedOut ? "AKShare helper timed out" : "AKShare helper failed to run",
            ),
          );
          return;
        }
        resolve(stdout);
      },
    );
  });

/** A-share fallback that shells out to an AKShare helper. Keep it opt-in via configuration. */
export class AkshareProvider implements MarketDataProvider {
  readonly id = "akshare" as const;
  private readonly pythonRunner: PythonRunner;
  private readonly timeoutMs: number;

  constructor(options: AkshareProviderOptions = {}) {
    this.pythonRunner = options.pythonRunner ?? defaultPythonRunner;
    this.timeoutMs =
      options.timeoutMs ??
      Number(process.env.MARKET_DATA_AKSHARE_TIMEOUT_MS ?? DEFAULT_AKSHARE_TIMEOUT_MS);
  }

  supports(market: Market): boolean {
    return market === "CN";
  }

  private static bareCode(symbol: string): string {
    return symbol
      .toUpperCase()
      .replace(/\.(SS|SZ|SH)$/i, "")
      .trim();
  }

  async getQuote(symbol: string): Promise<Quote> {
    const code = AkshareProvider.bareCode(symbol);
    if (!CODE_PATTERN.test(code))
      throw new MarketDataError("unsupported", `Invalid A-share code: ${symbol}`);
    let stdout: string;
    try {
      stdout = await this.pythonRunner(AKSHARE_SCRIPT(code), this.timeoutMs);
    } catch (error) {
      if (error instanceof MarketDataError) throw error;
      throw new MarketDataError("network", "AKShare helper failed");
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(stdout) as Record<string, unknown>;
    } catch {
      throw new MarketDataError("parse", "AKShare helper returned malformed JSON");
    }
    const price = Number(parsed["最新"]);
    const previousClose = Number(parsed["昨收"]);
    if (!Number.isFinite(price) || !Number.isFinite(previousClose))
      throw new MarketDataError("parse", `AKShare has no quote for ${symbol}`);
    const change = price - previousClose;
    return {
      symbol: symbol.toUpperCase(),
      name: typeof parsed["名称"] === "string" ? (parsed["名称"] as string) : undefined,
      market: "CN",
      currency: "CNY",
      price,
      previousClose,
      change,
      changePercent: previousClose === 0 ? 0 : (change / previousClose) * 100,
      dayHigh: Number.isFinite(Number(parsed["最高"])) ? Number(parsed["最高"]) : undefined,
      dayLow: Number.isFinite(Number(parsed["最低"])) ? Number(parsed["最低"]) : undefined,
      volume: Number.isFinite(Number(parsed["总手"])) ? Number(parsed["总手"]) : undefined,
      asOf: new Date().toISOString(),
      source: "akshare",
    };
  }

  async searchSymbols(): Promise<SymbolMatch[]> {
    throw new MarketDataError("unsupported", "AKShare symbol search is not implemented");
  }

  async getIndexData(): Promise<Quote[]> {
    throw new MarketDataError("unsupported", "AKShare index data is not implemented");
  }
}

interface CacheEntry {
  value: Quote;
  expiresAt: number;
  staleUntil: number;
}

export interface MarketDataServiceOptions {
  fetch?: typeof fetch;
  yahoo?: MarketDataProvider;
  akshare?: MarketDataProvider | null;
  cacheTtlMs?: number;
  staleTtlMs?: number;
  maxCacheEntries?: number;
  /** Deadline for one symbol across the whole provider chain. */
  quoteTimeoutMs?: number;
  /** Deadline for one symbol search (product threshold: 5s). */
  searchTimeoutMs?: number;
  /** Set false to skip the AKShare fallback entirely. */
  akshareEnabled?: boolean;
  /** Set false to skip returning an expired cache when providers fail. */
  staleFallbackEnabled?: boolean;
  now?: () => number;
  onError?: (context: MarketDataLogContext, error: unknown) => void;
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultErrorLogger(context: MarketDataLogContext, error: unknown) {
  console.error({
    timestamp: new Date().toISOString(),
    context,
    error: error instanceof Error ? error.name : "Market data request failed",
  });
}

/**
 * Cached facade over market data providers.
 * Order: fresh cache → Yahoo → AKShare (A-shares only) → stale cache → error.
 * Every symbol is bounded by `quoteTimeoutMs`, so a hanging provider cannot stall a summary.
 */
export class MarketDataService {
  private readonly yahoo: MarketDataProvider;
  private readonly akshare: MarketDataProvider | null;
  private readonly cacheTtlMs: number;
  private readonly staleTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly quoteTimeoutMs: number;
  private readonly searchTimeoutMs: number;
  private readonly staleFallbackEnabled: boolean;
  private readonly now: () => number;
  private readonly onError: (context: MarketDataLogContext, error: unknown) => void;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: MarketDataServiceOptions = {}) {
    this.yahoo = options.yahoo ?? new YahooFinanceProvider({ fetch: options.fetch });
    const akshareEnabled =
      options.akshareEnabled ?? process.env.MARKET_DATA_AKSHARE_ENABLED !== "false";
    this.akshare =
      options.akshare === null
        ? null
        : akshareEnabled
          ? (options.akshare ?? new AkshareProvider())
          : null;
    this.cacheTtlMs = options.cacheTtlMs ?? envNumber("MARKET_DATA_CACHE_TTL_MS", 60_000);
    this.staleTtlMs = options.staleTtlMs ?? envNumber("MARKET_DATA_STALE_CACHE_TTL_MS", 300_000);
    this.maxCacheEntries =
      options.maxCacheEntries ?? envNumber("MARKET_DATA_CACHE_MAX_SIZE", 10_000);
    this.quoteTimeoutMs =
      options.quoteTimeoutMs ?? envNumber("MARKET_DATA_QUOTE_TIMEOUT_MS", DEFAULT_QUOTE_TIMEOUT_MS);
    this.searchTimeoutMs =
      options.searchTimeoutMs ?? envNumber("MARKET_DATA_SEARCH_TIMEOUT_MS", REQUEST_TIMEOUT_MS);
    this.staleFallbackEnabled =
      options.staleFallbackEnabled ?? process.env.MARKET_DATA_STALE_CACHE_ENABLED !== "false";
    this.now = options.now ?? Date.now;
    this.onError = options.onError ?? defaultErrorLogger;
  }

  private cacheKey(symbol: string): string {
    return `quote:${normalizeYahooSymbol(symbol)}`;
  }

  private store(key: string, value: Quote) {
    const at = this.now();
    this.cache.delete(key);
    this.cache.set(key, {
      value,
      expiresAt: at + this.cacheTtlMs,
      staleUntil: at + this.staleTtlMs,
    });
    while (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private readFresh(key: string): Quote | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) return null;
    return entry.value;
  }

  private readStale(key: string): Quote | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.staleUntil <= this.now()) return null;
    return entry.value;
  }

  private report(context: MarketDataLogContext, error: unknown) {
    this.onError(context, error);
  }

  async getQuote(symbol: string, options: { forceRefresh?: boolean } = {}): Promise<Quote> {
    const key = this.cacheKey(symbol);
    if (!options.forceRefresh) {
      const fresh = this.readFresh(key);
      if (fresh) return fresh;
    }

    // Bound the whole provider chain so one hanging source cannot stall callers.
    const work = (async () => {
      let lastError: unknown;
      try {
        return await this.yahoo.getQuote(symbol);
      } catch (error) {
        lastError = error;
        this.report(
          { phase: "getQuote", provider: "yahoo", kind: "provider_error", symbol },
          error,
        );
      }
      const market = resolveMarket(symbol);
      if (market === "CN" && this.akshare?.supports(market)) {
        try {
          return await this.akshare.getQuote(symbol);
        } catch (error) {
          lastError = error;
          this.report(
            { phase: "getQuote", provider: "akshare", kind: "provider_error", symbol },
            error,
          );
        }
      }
      throw lastError instanceof MarketDataError
        ? lastError
        : new MarketDataError("network", `Unable to load a quote for ${symbol}`);
    })();

    try {
      const quote = await withTimeout(
        work,
        this.quoteTimeoutMs,
        `Timed out loading a quote for ${symbol}`,
      );
      this.store(key, quote);
      return quote;
    } catch (error) {
      if (error instanceof MarketDataError && error.kind === "timeout")
        this.report({ phase: "getQuote", provider: "chain", kind: "timeout", symbol }, error);
      if (this.staleFallbackEnabled) {
        const stale = this.readStale(key);
        if (stale) return { ...stale, source: "cache", stale: true };
      }
      throw error instanceof MarketDataError
        ? error
        : new MarketDataError("network", `Unable to load a quote for ${symbol}`);
    }
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const unique = [...new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean))];
    return Promise.all(unique.map((symbol) => this.getQuote(symbol)));
  }

  async searchSymbols(query: string, limit = 10): Promise<SymbolMatch[]> {
    if (!query.trim()) return [];
    try {
      const matches = await withTimeout(
        this.yahoo.searchSymbols(query, limit),
        this.searchTimeoutMs,
        "Timed out searching symbols",
      );
      return matches;
    } catch (error) {
      this.report({ phase: "searchSymbols", provider: "yahoo", kind: "provider_error" }, error);
      throw error instanceof MarketDataError
        ? error
        : new MarketDataError("network", "Symbol search failed");
    }
  }

  async getIndexData(): Promise<Quote[]> {
    const settled = await Promise.allSettled(
      BRIEFING_INDEXES.map((index) =>
        this.getQuote(index.symbol).then((quote) => ({ ...quote, name: index.name })),
      ),
    );
    const quotes: Quote[] = [];
    settled.forEach((result, i) => {
      if (result.status === "fulfilled") quotes.push(result.value);
      else
        this.report(
          {
            phase: "getIndexData",
            provider: "yahoo",
            kind: "provider_error",
            symbol: BRIEFING_INDEXES[i]?.symbol,
          },
          result.reason,
        );
    });
    return quotes;
  }

  /** Drop a cached quote, e.g. after a manual refresh signal. */
  invalidate(symbol: string) {
    this.cache.delete(this.cacheKey(symbol));
  }
}
