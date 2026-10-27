import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { buildBriefingSummary } from "../apps/server/src/engine/market-briefing.ts";
import {
  BRIEFING_INDEXES,
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

const indexPrices: Record<string, number> = {
  "^GSPC": 4000,
  "^IXIC": 12000,
  "^DJI": 30000,
  "000001.SS": 3000,
  "399001.SZ": 10000,
};
const watchlistQuotes: Record<string, number> = { AAPL: 190 };

function quoteFor(symbol: string): Quote {
  const price = watchlistQuotes[symbol] ?? indexPrices[symbol];
  if (price === undefined) throw new MarketDataError("not_found", `no quote ${symbol}`);
  const previousClose = symbol === "AAPL" ? 180 : price / 1.01;
  const change = price - previousClose;
  return {
    symbol,
    name: BRIEFING_INDEXES.find((index) => index.symbol === symbol)?.name,
    market: symbol.endsWith(".SS") || symbol.endsWith(".SZ") ? "CN" : "US",
    price,
    previousClose,
    change,
    changePercent: (change / previousClose) * 100,
    asOf: "2026-10-27T00:00:00.000Z",
    source: "yahoo",
  };
}

const provider: MarketDataProvider = {
  id: "yahoo",
  supports: () => true,
  getQuote: async (symbol) => quoteFor(symbol),
  searchSymbols: async () => [],
  getIndexData: async () =>
    BRIEFING_INDEXES.map((index) => ({ ...quoteFor(index.symbol), name: index.name })),
};

const market = () =>
  new MarketDataService({ yahoo: provider, akshare: null, onError: () => undefined });

const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
async function call<T>(path: string, init: RequestInit = {}, status = 200): Promise<T> {
  const response = await server.app.request(`/api${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  assert.equal(response.status, status, await response.clone().text());
  return response.json() as Promise<T>;
}

const today = () => new Date().toISOString().slice(0, 10);

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-briefing-"));
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
  server = await createApp(db, config, { market: market() });
  const session = await server.app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  token = (await session.json()).token;
});

beforeEach(async () => {
  await server.agent.stop();
  server = await createApp(db, config, { market: market() });
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

test("summary builder produces 3-5 bullets covering indexes and movers", () => {
  const summary = buildBriefingSummary({
    indexes: [quoteFor("^GSPC"), quoteFor("^IXIC")],
    movers: [{ symbol: "AAPL", quote: quoteFor("AAPL") }],
    watchlistCount: 1,
    unavailable: [],
  });
  assert.ok(summary.length >= 3 && summary.length <= 5);
  assert.match(summary[0] ?? "", /标普 500|纳斯达克/);
  assert.match(summary[1] ?? "", /AAPL \+5\.56%/);
  assert.match(summary.at(-1) ?? "", /不构成投资建议/);
});

test("summary builder handles an empty watchlist and missing indexes", () => {
  const summary = buildBriefingSummary({
    indexes: [],
    movers: [],
    watchlistCount: 0,
    unavailable: [],
  });
  assert.ok(summary.length >= 3 && summary.length <= 5);
  assert.match(summary[0] ?? "", /指数数据暂不可用/);
  assert.match(summary[1] ?? "", /还没有观察列表/);
});

test("briefing routes require a session", async () => {
  assert.equal((await server.app.request("/api/briefings/today")).status, 401);
  assert.equal((await server.app.request("/api/briefings/latest")).status, 401);
});

test("today returns 404 before a briefing is generated", async () => {
  await call("/briefings/today", {}, 404);
  const latest = await call<{ briefing: unknown; is_today: boolean }>("/briefings/latest");
  assert.equal(latest.briefing, null);
  assert.equal(latest.is_today, false);
});

test("generate persists today's briefing with indexes and watchlist updates", async () => {
  await call(
    "/watchlists",
    {
      method: "POST",
      body: JSON.stringify({ name: "核心持仓", symbols: ["AAPL"] }),
    },
    201,
  );
  const briefing = await call<{
    id: string;
    date: string;
    summary: string[];
    content: string;
    market_data: { indexes: unknown[] };
    symbol_updates: Record<string, { price: number }>;
    events_status: string;
    events_note?: string;
  }>("/briefings/generate", { method: "POST", body: JSON.stringify({}) });

  assert.equal(briefing.date, today());
  assert.ok(briefing.summary.length >= 3 && briefing.summary.length <= 5);
  assert.equal(briefing.market_data.indexes.length, BRIEFING_INDEXES.length);
  assert.equal(briefing.symbol_updates.AAPL?.price, 190);
  assert.equal(briefing.events_status, "not_implemented");
  assert.match(briefing.events_note ?? "", /P0 暂未接入/);
  assert.match(briefing.content, /每日市场简报/);

  const todayBriefing = await call<{ id: string }>("/briefings/today");
  assert.equal(todayBriefing.id, briefing.id);
});

test("generate is idempotent per date unless forced", async () => {
  const first = await call<{ id: string }>("/briefings/generate", {
    method: "POST",
    body: JSON.stringify({}),
  });
  const second = await call<{ id: string }>("/briefings/generate", {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert.equal(second.id, first.id);

  const forced = await call<{ id: string }>("/briefings/generate", {
    method: "POST",
    body: JSON.stringify({ force: true }),
  });
  assert.notEqual(forced.id, first.id);

  const latest = await call<{ briefing: { id: string }; is_today: boolean }>("/briefings/latest");
  assert.equal(latest.is_today, true);
  assert.equal(latest.briefing.id, forced.id);
});

test("market_briefing task kind runs through the worker and stores an artifact", async () => {
  const task = await call<{ id: string; kind: string; plan: { title: string }[] }>(
    "/agent/tasks",
    {
      method: "POST",
      body: JSON.stringify({ prompt: "生成今日市场简报", kind: "market_briefing" }),
    },
    201,
  );
  assert.equal(task.kind, "market_briefing");
  assert.equal(task.plan.length, 3);

  await server.agent.worker.tick();

  const detail = await call<{
    task: { status: string; result?: string; artifactIds: string[] };
  }>(`/agent/tasks/${task.id}`);
  assert.equal(detail.task.status, "succeeded");
  assert.ok(detail.task.artifactIds.length >= 1);
  assert.match(detail.task.result ?? "", /不构成投资建议/);
});
