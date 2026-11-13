import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { MonitorEvent, MonitorRule } from "../packages/domain/src/agent.ts";
import { MarketDataService } from "../packages/integrations/src/market-data.ts";

let db: Store;
let server: Awaited<ReturnType<typeof createApp>>;
let directory: string;
let token: string;
let config: Config;

const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
async function call<T>(path: string, init: RequestInit = {}, status = 200): Promise<T> {
  const response = await server.app.request(`/api/monitor${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  assert.equal(response.status, status, await response.clone().text());
  return response.json() as Promise<T>;
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-monitor-api-"));
  db = await createStore({ dataDir: join(directory, "db") });
  config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    intelligenceApiKey: "test-key",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  server = await createApp(db, config, {
    market: new MarketDataService({ akshare: null, onError: () => undefined }),
  });
});

beforeEach(async () => {
  await server.agent.stop();
  server = await createApp(db, config, {
    market: new MarketDataService({ akshare: null, onError: () => undefined }),
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

test("monitor API requires a session", async () => {
  assert.equal((await server.app.request("/api/monitor/rules")).status, 401);
});

test("creates rules, ingests an event, and reports it in today's feed", async () => {
  const rule = await call<MonitorRule>(
    "/rules",
    {
      method: "POST",
      body: JSON.stringify({
        name: "AAPL 财报",
        target_type: "symbol",
        target_id: "AAPL",
        market: "US",
        event_kinds: ["EARNINGS"],
        level: "MUST_KNOW",
        cooldown_minutes: 240,
        interval_minutes: 5,
        channels: ["in_app"],
      }),
    },
    201,
  );
  assert.equal(rule.level, "MUST_KNOW");

  const ingested = await call<{ events: MonitorEvent[] }>(
    "/events",
    {
      method: "POST",
      body: JSON.stringify({
        rule_id: rule.id,
        kind: "EARNINGS",
        title: "AAPL 发布财报",
        body: "EPS 超预期",
      }),
    },
    201,
  );
  assert.equal(ingested.events.length, 1);
  assert.equal(ingested.events[0]?.state, "delivered");

  const today = await call<{ must_know: MonitorEvent[]; budget: { used: number } }>("/today");
  assert.equal(today.must_know[0]?.title, "AAPL 发布财报");
  assert.ok(today.budget.used >= 1);
});

test("validates price rules and lets the user tune the attention budget", async () => {
  const response = await server.app.request("/api/monitor/rules", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      target_type: "symbol",
      target_id: "MSFT",
      market: "US",
      event_kinds: ["PRICE_MOVE"],
      level: "ARCHIVE",
      cooldown_minutes: 60,
      interval_minutes: 5,
      channels: ["in_app"],
    }),
  });
  assert.equal(response.status, 422);
  const budget = await call<{ limit: number }>("/budget", {
    method: "PUT",
    body: JSON.stringify({ limit: 3 }),
  });
  assert.equal(budget.limit, 3);
});

test("a thesis falsification condition can be registered as an L4 watching rule", async () => {
  const noteResponse = await server.app.request("/api/notes", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      symbol_code: "AAPL",
      type: "THESIS",
      content: "服务收入增长将支撑估值",
      evidence: [{ url: "https://example.com/aapl", published_at: "2026-10-30" }],
      falsify_condition: { kind: "PRICE_BELOW", expression: "跌破 180 美元" },
      horizon: { from: "2026-10-01", to: "2027-03-31" },
      confidence: 0.6,
    }),
  });
  assert.equal(noteResponse.status, 201);
  const note = await noteResponse.json();
  const rule = await call<{
    target_type: string;
    target_id: string;
    level: string;
    event_kinds: string[];
    price?: { threshold_value: number };
  }>(`/rules/from-thesis/${note.id}`, { method: "POST" }, 201);
  assert.equal(rule.target_type, "thesis");
  assert.equal(rule.target_id, note.id);
  assert.equal(rule.level, "MUST_KNOW");
  assert.ok(rule.event_kinds.includes("THESIS_SIGNAL"));
  assert.equal(rule.price?.threshold_value, 180);
});
