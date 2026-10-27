import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import {
  MarketDataError,
  type MarketDataProvider,
  MarketDataService,
  type Quote,
} from "../packages/integrations/src/market-data.ts";

let db: Store;
let server: Awaited<ReturnType<typeof createApp>>;
let directory: string;
let token: string;
let config: Config;

const provider: MarketDataProvider = {
  id: "yahoo",
  supports: () => true,
  getQuote: async (symbol) => {
    if (symbol === "HANG") return new Promise(() => {});
    if (symbol !== "AAPL" && symbol !== "600519.SS")
      throw new MarketDataError("not_found", `no quote ${symbol}`);
    const isCn = symbol.endsWith(".SS");
    const quote: Quote = {
      symbol,
      name: isCn ? "贵州茅台" : "Apple Inc.",
      market: isCn ? "CN" : "US",
      currency: isCn ? "CNY" : "USD",
      price: isCn ? 1800 : 190,
      previousClose: isCn ? 1750 : 180,
      change: isCn ? 50 : 10,
      changePercent: isCn ? (50 / 1750) * 100 : (10 / 180) * 100,
      volume: isCn ? 1_000_000 : 40_000_000,
      asOf: "2026-10-27T08:00:00.000Z",
      source: "yahoo",
      marketState: "regular",
    };
    return quote;
  },
  searchSymbols: async () => [],
  getIndexData: async () => [],
};

const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
async function call<T>(path: string, init: RequestInit = {}, status = 200): Promise<T> {
  const response = await server.app.request(`/api${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  assert.equal(response.status, status, await response.clone().text());
  return response.json() as Promise<T>;
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-market-quotes-"));
  db = await createStore({ dataDir: join(directory, "db") });
  config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    intelligenceApiKey: "test-project-key-never-sent",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  server = await createApp(db, config, {
    market: new MarketDataService({
      yahoo: provider,
      akshare: null,
      quoteTimeoutMs: 60,
      onError: () => undefined,
    }),
  });
  const session = await server.app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  token = (await session.json()).token;
});

beforeEach(async () => {
  await server.agent.stop();
  server = await createApp(db, config, {
    market: new MarketDataService({
      yahoo: provider,
      akshare: null,
      quoteTimeoutMs: 60,
      onError: () => undefined,
    }),
  });
  token = (
    await (
      await server.app.request("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).json()
  ).token;
});

after(async () => {
  await server?.agent?.stop();
  await db?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("batch quotes require a session", async () => {
  assert.equal((await server.app.request("/api/market/quotes")).status, 401);
});

test("batch quotes dedupe, preserve order and include display fields", async () => {
  const result = await call<{
    quotes: {
      symbol: string;
      price?: number;
      volume?: number;
      asOf?: string;
      stale?: boolean;
      error?: string;
      currency?: string;
      marketState?: string;
    }[];
  }>("/market/quotes", {
    method: "POST",
    body: JSON.stringify({ symbols: ["AAPL", "600519.SH", "AAPL", "BAD", "HANG"] }),
  });

  assert.deepEqual(
    result.quotes.map((quote) => quote.symbol),
    ["AAPL", "600519.SS", "BAD", "HANG"],
  );
  const aapl = result.quotes[0];
  assert.equal(aapl?.price, 190);
  assert.equal(aapl?.volume, 40_000_000);
  assert.equal(aapl?.asOf, "2026-10-27T08:00:00.000Z");
  assert.equal(aapl?.stale, false);
  assert.equal(aapl?.currency, "USD");
  assert.equal(aapl?.marketState, "regular");
  assert.equal(result.quotes[2]?.error, "not_found");
  assert.equal(result.quotes[3]?.error, "timeout");
});

test("batch quotes are bounded by the overall budget", async () => {
  const started = Date.now();
  const result = await call<{ quotes: { symbol: string; error?: string }[] }>("/market/quotes", {
    method: "POST",
    body: JSON.stringify({ symbols: ["A", "B", "C", "D", "HANG"] }),
  });
  assert.ok(Date.now() - started < 2000);
  assert.equal(result.quotes.find((quote) => quote.symbol === "HANG")?.error, "timeout");
  assert.ok(
    result.quotes.every((quote) => quote.error === "not_found" || quote.error === "timeout"),
  );
});

test("batch quotes reject more than 50 symbols and empty input", async () => {
  await call(
    "/market/quotes",
    {
      method: "POST",
      body: JSON.stringify({ symbols: Array.from({ length: 51 }, (_, i) => `S${i}`) }),
    },
    422,
  );
  await call("/market/quotes", { method: "POST", body: JSON.stringify({ symbols: [] }) }, 422);
});
