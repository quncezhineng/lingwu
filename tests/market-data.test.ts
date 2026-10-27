import assert from "node:assert/strict";
import test from "node:test";
import {
  BRIEFING_INDEXES,
  MarketDataError,
  type MarketDataProvider,
  MarketDataService,
  normalizeYahooSymbol,
  resolveMarket,
  YahooFinanceProvider,
} from "../packages/integrations/src/market-data.ts";

const chartPayload = (overrides: Record<string, unknown> = {}) => ({
  chart: {
    result: [
      {
        meta: {
          currency: "USD",
          symbol: "AAPL",
          longName: "Apple Inc.",
          regularMarketPrice: 190,
          chartPreviousClose: 200,
          regularMarketDayHigh: 192,
          regularMarketDayLow: 188,
          regularMarketVolume: 1_000_000,
          fiftyTwoWeekHigh: 220,
          fiftyTwoWeekLow: 150,
          regularMarketTime: 1_700_000_000,
          ...overrides,
        },
      },
    ],
    error: null,
  },
});

function fakeFetch(
  handler: (url: string) => Response | Promise<Response>,
): typeof fetch & { calls: string[] } {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return handler(url);
  }) as typeof fetch & { calls: string[] };
  impl.calls = calls;
  return impl;
}

const json = (data: unknown, status = 200) => Response.json(data, { status });

function quoteOf(price: number, previousClose: number) {
  return {
    symbol: "AAPL",
    market: "US" as const,
    price,
    previousClose,
    change: price - previousClose,
    changePercent: previousClose === 0 ? 0 : ((price - previousClose) / previousClose) * 100,
    asOf: "2026-10-26T00:00:00.000Z",
    source: "yahoo" as const,
  };
}

/** Returns quotes in call order so cache behavior is observable. */
function stubProvider(id: "yahoo" | "akshare", prices: number[]) {
  let index = 0;
  const calls: string[] = [];
  const provider: MarketDataProvider = {
    id,
    supports: () => true,
    getQuote: async (symbol) => {
      calls.push(symbol);
      const price = prices[Math.min(index, prices.length - 1)] ?? 100;
      index += 1;
      return { ...quoteOf(price, 100), symbol, source: id };
    },
    searchSymbols: async () => [],
    getIndexData: async () => [],
  };
  return { provider, calls };
}

test("yahoo quote parses meta into price change and percent", async () => {
  const provider = new YahooFinanceProvider({
    fetch: fakeFetch(() => json(chartPayload())),
  });
  const quote = await provider.getQuote("AAPL");
  assert.equal(quote.price, 190);
  assert.equal(quote.previousClose, 200);
  assert.equal(quote.change, -10);
  assert.equal(quote.changePercent, -5);
  assert.equal(quote.name, "Apple Inc.");
  assert.equal(quote.market, "US");
  assert.equal(quote.source, "yahoo");
});

test("yahoo normalizes Shanghai .SH suffix to .SS", async () => {
  const fetchImpl = fakeFetch(() => json(chartPayload({ symbol: "600519.SS", currency: "CNY" })));
  const provider = new YahooFinanceProvider({ fetch: fetchImpl });
  await provider.getQuote("600519.SH");
  assert.match(fetchImpl.calls[0] ?? "", /600519\.SS/);
  assert.equal(normalizeYahooSymbol("600519.sh"), "600519.SS");
  assert.equal(resolveMarket("600519.SS"), "CN");
  assert.equal(resolveMarket("0700.HK"), "HK");
  assert.equal(resolveMarket("AAPL"), "US");
});

test("yahoo reports not_found when the chart returns an error", async () => {
  const provider = new YahooFinanceProvider({
    fetch: fakeFetch(() => json({ chart: { result: null, error: { code: "Not Found" } } })),
  });
  await assert.rejects(
    () => provider.getQuote("NOPE"),
    (error: unknown) => error instanceof MarketDataError && error.kind === "not_found",
  );
});

test("yahoo rejects malformed symbols without calling upstream", async () => {
  const fetchImpl = fakeFetch(() => json(chartPayload()));
  const provider = new YahooFinanceProvider({ fetch: fetchImpl });
  await assert.rejects(
    () => provider.getQuote("../../../etc/passwd"),
    (error: unknown) => error instanceof MarketDataError && error.kind === "unsupported",
  );
  assert.equal(fetchImpl.calls.length, 0);
});

test("symbol search maps markets and skips unsupported quote types", async () => {
  const provider = new YahooFinanceProvider({
    fetch: fakeFetch(() =>
      json({
        quotes: [
          {
            symbol: "AAPL",
            longname: "Apple Inc.",
            quoteType: "EQUITY",
            exchDisp: "NASDAQ",
            sector: "Technology",
          },
          { symbol: "0700.HK", shortname: "TENCENT", quoteType: "EQUITY", exchDisp: "HKSE" },
          { symbol: "AAPL260116C00200000", shortname: "Option", quoteType: "OPTION" },
        ],
      }),
    ),
  });
  const matches = await provider.searchSymbols("apple", 10);
  assert.deepEqual(
    matches.map((match) => match.symbol),
    ["AAPL", "0700.HK"],
  );
  assert.equal(matches[0]?.sector, "Technology");
  assert.equal(matches[1]?.market, "HK");
});

test("service caches quotes within the TTL window", async () => {
  let now = 0;
  const { provider, calls } = stubProvider("yahoo", [101, 202]);
  const service = new MarketDataService({ yahoo: provider, akshare: null, now: () => now });

  const first = await service.getQuote("AAPL");
  now = 30_000;
  const second = await service.getQuote("AAPL");
  assert.equal(first.price, 101);
  assert.equal(second.price, 101);
  assert.equal(calls.length, 1);
});

test("forceRefresh bypasses the fresh cache", async () => {
  const now = 0;
  const { provider, calls } = stubProvider("yahoo", [101, 202]);
  const service = new MarketDataService({ yahoo: provider, akshare: null, now: () => now });

  await service.getQuote("AAPL");
  const refreshed = await service.getQuote("AAPL", { forceRefresh: true });
  assert.equal(refreshed.price, 202);
  assert.equal(calls.length, 2);
  assert.equal(now, 0);
});

test("service degrades to stale cache when the upstream fails", async () => {
  let now = 0;
  let fail = false;
  let price = 150;
  const provider: MarketDataProvider = {
    id: "yahoo",
    supports: () => true,
    getQuote: async (symbol) => {
      if (fail) throw new MarketDataError("network", "offline");
      return { ...quoteOf(price, 100), symbol };
    },
    searchSymbols: async () => [],
    getIndexData: async () => [],
  };
  const logs: string[] = [];
  const service = new MarketDataService({
    yahoo: provider,
    akshare: null,
    now: () => now,
    onError: (context) => logs.push(`${context.provider}:${context.kind}`),
  });

  await service.getQuote("AAPL");
  now = 90_000; // past the 60s TTL, inside the 300s stale window
  fail = true;
  price = 999;
  const stale = await service.getQuote("AAPL");
  assert.equal(stale.price, 150);
  assert.equal(stale.stale, true);
  assert.equal(stale.source, "cache");
  assert.deepEqual(logs, ["yahoo:provider_error"]);
});

test("service surfaces the last error when no cache exists", async () => {
  const provider: MarketDataProvider = {
    id: "yahoo",
    supports: () => true,
    getQuote: async () => {
      throw new MarketDataError("http", "rate limited", 429);
    },
    searchSymbols: async () => [],
    getIndexData: async () => [],
  };
  const service = new MarketDataService({
    yahoo: provider,
    akshare: null,
    onError: () => undefined,
  });
  await assert.rejects(
    () => service.getQuote("AAPL"),
    (error: unknown) => error instanceof MarketDataError && error.status === 429,
  );
});

test("A-share quotes fall back to AKShare when Yahoo fails", async () => {
  const yahoo: MarketDataProvider = {
    id: "yahoo",
    supports: () => true,
    getQuote: async () => {
      throw new MarketDataError("not_found", "missing");
    },
    searchSymbols: async () => [],
    getIndexData: async () => [],
  };
  const akshare: MarketDataProvider = {
    id: "akshare",
    supports: (market) => market === "CN",
    getQuote: async (symbol) => ({
      ...quoteOf(1800, 1750),
      symbol,
      market: "CN",
      source: "akshare",
    }),
    searchSymbols: async () => [],
    getIndexData: async () => [],
  };
  const service = new MarketDataService({ yahoo, akshare, onError: () => undefined });
  const quote = await service.getQuote("600519.SS");
  assert.equal(quote.source, "akshare");
  assert.equal(quote.market, "CN");
});

test("index data keeps the indexes that succeed", async () => {
  const yahoo: MarketDataProvider = {
    id: "yahoo",
    supports: () => true,
    getQuote: async (symbol) => {
      if (symbol === BRIEFING_INDEXES[1]?.symbol) throw new MarketDataError("network", "offline");
      return { ...quoteOf(100, 99), symbol };
    },
    searchSymbols: async () => [],
    getIndexData: async () => [],
  };
  const service = new MarketDataService({ yahoo, akshare: null, onError: () => undefined });
  const indexes = await service.getIndexData();
  assert.equal(indexes.length, BRIEFING_INDEXES.length - 1);
  assert.ok(indexes.every((index) => typeof index.name === "string" && index.name.length > 0));
});
