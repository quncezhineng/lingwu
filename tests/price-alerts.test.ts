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

const prices: Record<string, { price: number; previousClose: number }> = {
  AAPL: { price: 190, previousClose: 180 },
};

const provider: MarketDataProvider = {
  id: "yahoo",
  supports: () => true,
  getQuote: async (symbol) => {
    const entry = prices[symbol];
    if (!entry) throw new MarketDataError("not_found", `no quote ${symbol}`);
    const change = entry.price - entry.previousClose;
    const quote: Quote = {
      symbol,
      market: "US",
      price: entry.price,
      previousClose: entry.previousClose,
      change,
      changePercent: (change / entry.previousClose) * 100,
      asOf: "2026-10-27T00:00:00.000Z",
      source: "yahoo",
    };
    return quote;
  },
  searchSymbols: async () => [],
  getIndexData: async () => [],
};

const market = () =>
  new MarketDataService({
    yahoo: provider,
    akshare: null,
    quoteTimeoutMs: 200,
    onError: () => undefined,
  });

const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
async function call<T>(path: string, init: RequestInit = {}, status = 200): Promise<T> {
  const response = await server.app.request(`/api${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  assert.equal(response.status, status, await response.clone().text());
  return response.json() as Promise<T>;
}

const createAlert = (body: Record<string, unknown>) =>
  call<{ id: string; enabled: boolean; symbol_code: string }>(
    "/price-alerts",
    { method: "POST", body: JSON.stringify(body) },
    201,
  );

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-price-alerts-"));
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

test("price alert API requires a session", async () => {
  assert.equal((await server.app.request("/api/price-alerts")).status, 401);
});

test("creates a normalized alert and lists it", async () => {
  const alert = await createAlert({
    symbol_code: "aapl",
    threshold_type: "PRICE_ABOVE",
    threshold_value: 200,
  });
  assert.equal(alert.symbol_code, "AAPL");
  assert.equal(alert.enabled, true);

  const { alerts } = await call<{ alerts: { id: string }[] }>("/price-alerts");
  assert.ok(alerts.some((item) => item.id === alert.id));
});

test("rejects non-positive thresholds and unknown threshold types", async () => {
  await call(
    "/price-alerts",
    {
      method: "POST",
      body: JSON.stringify({
        symbol_code: "AAPL",
        threshold_type: "PRICE_ABOVE",
        threshold_value: 0,
      }),
    },
    422,
  );
  await call(
    "/price-alerts",
    {
      method: "POST",
      body: JSON.stringify({ symbol_code: "AAPL", threshold_type: "VOLUME", threshold_value: 10 }),
    },
    422,
  );
});

test("triggered alerts notify once and deduplicate for 24h", async () => {
  const alert = await createAlert({
    symbol_code: "AAPL",
    threshold_type: "PRICE_ABOVE",
    threshold_value: 100,
  });

  const first = await call<{
    triggered: boolean;
    notified: boolean;
    notification_id?: string;
    quote?: { price: number };
  }>(`/price-alerts/${alert.id}/check`, { method: "POST", body: "{}" });
  assert.equal(first.triggered, true);
  assert.equal(first.notified, true);
  assert.ok(first.notification_id);
  assert.equal(first.quote?.price, 190);

  const second = await call<{ triggered: boolean; notified: boolean; reason?: string }>(
    `/price-alerts/${alert.id}/check`,
    { method: "POST", body: "{}" },
  );
  assert.equal(second.triggered, true);
  assert.equal(second.notified, false);
  assert.equal(second.reason, "deduplicated");

  const notifications = await call<{ title: string; body: string }[]>("/agent/notifications");
  const matches = notifications.filter((item) => item.body.includes("AAPL"));
  assert.equal(matches.length, 1);
});

test("the off switch stops notifications", async () => {
  const alert = await createAlert({
    symbol_code: "AAPL",
    threshold_type: "PRICE_ABOVE",
    threshold_value: 100,
  });
  const updated = await call<{ enabled: boolean }>(`/price-alerts/${alert.id}`, {
    method: "PUT",
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(updated.enabled, false);

  const result = await call<{ triggered: boolean; notified: boolean; reason?: string }>(
    `/price-alerts/${alert.id}/check`,
    { method: "POST", body: "{}" },
  );
  assert.equal(result.triggered, false);
  assert.equal(result.notified, false);
  assert.equal(result.reason, "disabled");
});

test("change-percent alerts use absolute daily change", async () => {
  const alert = await createAlert({
    symbol_code: "AAPL",
    threshold_type: "CHANGE_PCT",
    threshold_value: 3,
  });
  const result = await call<{ triggered: boolean }>(`/price-alerts/${alert.id}/check`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(result.triggered, true);
});

test("below-threshold alerts stay quiet when the price is above the line", async () => {
  const alert = await createAlert({
    symbol_code: "AAPL",
    threshold_type: "PRICE_BELOW",
    threshold_value: 100,
  });
  const result = await call<{ triggered: boolean; notified: boolean; reason?: string }>(
    `/price-alerts/${alert.id}/check`,
    { method: "POST", body: "{}" },
  );
  assert.equal(result.triggered, false);
  assert.equal(result.notified, false);
  assert.equal(result.reason, "not_triggered");
});

test("missing quotes surface as quote_unavailable", async () => {
  const alert = await createAlert({
    symbol_code: "ZZZZ",
    threshold_type: "PRICE_ABOVE",
    threshold_value: 10,
  });
  const result = await call<{ triggered: boolean; notified: boolean; reason?: string }>(
    `/price-alerts/${alert.id}/check`,
    { method: "POST", body: "{}" },
  );
  assert.equal(result.triggered, false);
  assert.equal(result.reason, "quote_unavailable");
});

test("deletes an alert and returns 404 afterwards", async () => {
  const alert = await createAlert({
    symbol_code: "AAPL",
    threshold_type: "PRICE_ABOVE",
    threshold_value: 100,
  });
  const deleted = await server.app.request(`/api/price-alerts/${alert.id}`, {
    method: "DELETE",
    headers: headers(),
  });
  assert.equal(deleted.status, 204);
  await call(`/price-alerts/${alert.id}/check`, { method: "POST", body: "{}" }, 404);
});
