import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { MonitorEvent, MonitorRule } from "../packages/domain/src/monitor.ts";
import {
  type MarketDataProvider,
  MarketDataService,
  type Quote,
  resolveMarket,
} from "../packages/integrations/src/market-data.ts";

let db: Store;
let server: Awaited<ReturnType<typeof createApp>>;
let directory: string;
let token: string;
let config: Config;

const prices: Record<string, number> = { AAPL: 200 };

const provider: MarketDataProvider = {
  id: "yahoo",
  supports: () => true,
  getQuote: async (symbol): Promise<Quote> => {
    const price = prices[symbol];
    if (price === undefined) throw new Error(`no quote for ${symbol}`);
    const previousClose = 100;
    return {
      symbol,
      market: resolveMarket(symbol),
      price,
      previousClose,
      change: price - previousClose,
      changePercent: ((price - previousClose) / previousClose) * 100,
      dayHigh: price,
      dayLow: previousClose,
      volume: 1_000_000,
      asOf: "2026-11-13T12:00:00.000Z",
      source: "yahoo",
    };
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

const post = <T>(path: string, body: unknown, status = 200) =>
  call<T>(path, { method: "POST", body: JSON.stringify(body) }, status);

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-monitors-"));
  db = await createStore({ dataDir: join(directory, "db") });
  config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    intelligenceApiKey: "test-intelligence-key",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  server = await createApp(db, config, {
    market: new MarketDataService({ yahoo: provider, akshare: null, onError: () => undefined }),
  });
  const session = await server.app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  token = (await session.json()).token;
});

after(async () => {
  await server?.agent?.stop();
  await db?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("monitor routes require a session", async () => {
  assert.equal((await server.app.request("/api/monitors/rules")).status, 401);
  assert.equal((await server.app.request("/api/today")).status, 401);
});

test("rule validation rejects a price rule without its threshold", async () => {
  await post(
    "/monitors/rules",
    { targetType: "symbol", targetId: "AAPL", eventKinds: ["PRICE_ABOVE"] },
    422,
  );
  await post(
    "/monitors/rules",
    { targetType: "symbol", targetId: "AAPL", eventKinds: ["NOT_A_KIND"] },
    422,
  );
});

test("creating a rule, ticking it and reading Today matches the accepted contract", async () => {
  const rule = await post<MonitorRule>(
    "/monitors/rules",
    {
      targetType: "symbol",
      targetId: "aapl",
      eventKinds: ["PRICE_ABOVE"],
      thresholds: { priceAbove: 190 },
      level: "MUST_KNOW",
      quietHours: null,
    },
    201,
  );
  assert.equal(rule.targetId, "AAPL");
  assert.equal(rule.market, "US");
  assert.equal(rule.cooldownMinutes, 240);
  assert.equal(rule.quietHours, null);

  const tick = await post<{ created: number; events: MonitorEvent[] }>("/monitors/tick", {
    force: true,
    at: "2026-11-13T12:00:00.000Z",
  });
  assert.equal(tick.created, 1);
  assert.equal(tick.events[0]?.state, "delivered");

  const events = await call<{ events: MonitorEvent[] }>("/monitors/events");
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0]?.ruleId, rule.id);
  assert.equal(events.events[0]?.marketDate, "2026-11-13");

  const today = await call<{
    date: string;
    time_zone: string;
    markets: Record<string, { trading_day: boolean }>;
    budget: {
      date: string;
      limit: number;
      used: number;
      remaining: number;
      downgraded_count: number;
    };
    events: { MUST_KNOW: MonitorEvent[] };
    theses: { active: unknown[]; review: unknown[] };
    approvals: unknown[];
  }>("/today");
  assert.equal(today.budget.date, today.date);
  assert.equal(today.time_zone, "Asia/Shanghai");
  assert.ok(today.markets.US);
  assert.equal(today.budget.limit, 5);
  assert.equal(today.budget.used, 1);
  assert.equal(today.budget.remaining, 4);
  assert.ok(today.events.MUST_KNOW.length >= 1);
  assert.ok(Array.isArray(today.theses.active));
  assert.ok(Array.isArray(today.theses.review));
  assert.ok(Array.isArray(today.approvals));

  const budget = await call<{ limit: number; used: number }>("/monitors/budget");
  assert.equal(budget.used, 1);
});

test("budget limit is clamped to 1-10", async () => {
  await call("/monitors/budget", { method: "PUT", body: JSON.stringify({ limit: 0 }) }, 422);
  await call("/monitors/budget", { method: "PUT", body: JSON.stringify({ limit: 11 }) }, 422);
  const updated = await call<{ limit: number; used: number }>("/monitors/budget", {
    method: "PUT",
    body: JSON.stringify({ limit: 2 }),
  });
  assert.equal(updated.limit, 2);
  assert.equal(updated.used, 1);
});

test("L2 events are ingested through a rule and deduplicate by rule/kind/symbol", async () => {
  const rule = await post<MonitorRule>(
    "/monitors/rules",
    {
      targetType: "symbol",
      targetId: "AAPL",
      eventKinds: ["ANNOUNCEMENT", "EARNINGS"],
      level: "MUST_KNOW",
      cooldownMinutes: 240,
    },
    201,
  );
  const first = await post<{ event: MonitorEvent; action: string }>(
    "/monitors/events",
    { ruleId: rule.id, kind: "ANNOUNCEMENT", severity: "high", payload: { title: "回购" } },
    201,
  );
  assert.equal(first.action, "delivered");
  const second = await post<{ event: MonitorEvent; action: string }>(
    "/monitors/events",
    { ruleId: rule.id, kind: "ANNOUNCEMENT", severity: "low", payload: {} },
    201,
  );
  assert.equal(second.action, "coalesced");
  assert.equal(second.event.occurrences, 2);

  await post(
    "/monitors/events",
    { ruleId: rule.id, kind: "DIVIDEND", severity: "low", payload: {} },
    422,
  );
});

test("pausing a rule and deleting a rule take effect immediately", async () => {
  const rules = await call<{ rules: MonitorRule[] }>("/monitors/rules");
  const target = rules.rules.find((rule) => rule.eventKinds.includes("PRICE_ABOVE"));
  assert.ok(target);
  const paused = await post<MonitorRule>(`/monitors/rules/${target.id}/control`, {
    action: "pause",
  });
  assert.equal(paused.enabled, false);
  const tick = await post<{ created: number }>("/monitors/tick", {
    force: true,
    at: "2026-11-13T12:30:00.000Z",
  });
  assert.equal(tick.created, 0);

  const deleted = await server.app.request(`/api/monitors/rules/${target.id}`, {
    method: "DELETE",
    headers: headers(),
  });
  assert.equal(deleted.status, 204);
  const afterDelete = await call<{ rules: MonitorRule[] }>("/monitors/rules");
  assert.equal(
    afterDelete.rules.some((rule) => rule.id === target.id),
    false,
  );
});
