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
  type SymbolMatch,
} from "../packages/integrations/src/market-data.ts";

let db: Store;
let server: Awaited<ReturnType<typeof createApp>>;
let directory: string;
let token: string;
let config: Config;

const quotes: Record<string, { price: number; previousClose: number; fail?: boolean }> = {
  AAPL: { price: 190, previousClose: 180 },
  "600519.SS": { price: 1800, previousClose: 1750 },
  BAD: { price: 0, previousClose: 0, fail: true },
};
const matches: SymbolMatch[] = [
  { symbol: "AAPL", name: "Apple Inc.", market: "US", type: "EQUITY" },
];

const provider: MarketDataProvider = {
  id: "yahoo",
  supports: () => true,
  getQuote: async (symbol) => {
    const entry = quotes[symbol];
    if (!entry || entry.fail) throw new MarketDataError("not_found", `no quote ${symbol}`);
    const change = entry.price - entry.previousClose;
    const quote: Quote = {
      symbol,
      market: symbol.endsWith(".SS") ? "CN" : "US",
      price: entry.price,
      previousClose: entry.previousClose,
      change,
      changePercent: (change / entry.previousClose) * 100,
      asOf: "2026-10-26T00:00:00.000Z",
      source: "yahoo",
    };
    return quote;
  },
  searchSymbols: async (query) =>
    matches.filter((match) => match.symbol.toLowerCase().includes(query.toLowerCase())),
  getIndexData: async () => [],
};

const market = () =>
  new MarketDataService({ yahoo: provider, akshare: null, onError: () => undefined });

const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
const request = (path: string, init: RequestInit = {}) =>
  server.app.request(`/api${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });

async function read<T>(path: string, init?: RequestInit, status = 200): Promise<T> {
  const response = await request(path, init);
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}

const post = (path: string, body: unknown) =>
  read<Record<string, unknown>>(path, { method: "POST", body: JSON.stringify(body) }, 201);
const postOk = (path: string, body: unknown) =>
  read<Record<string, unknown>>(path, { method: "POST", body: JSON.stringify(body) });
const put = (path: string, body: unknown) =>
  read<Record<string, unknown>>(path, { method: "PUT", body: JSON.stringify(body) });

async function createWatchlist(name = "核心持仓", symbols: string[] = []) {
  return post("/watchlists", { name, symbols });
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-watchlist-"));
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
  assert.equal(session.status, 200);
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

test("watchlist API requires a session", async () => {
  assert.equal((await server.app.request("/api/watchlists")).status, 401);
});

test("creates and lists watchlists with normalized symbols", async () => {
  const created = await createWatchlist("核心持仓", ["aapl", "600519.SH"]);
  assert.equal(created.name, "核心持仓");
  assert.deepEqual(created.symbols, ["AAPL", "600519.SS"]);
  assert.match(String(created.id), /^[0-9a-f-]{36}$/);

  const listed = await read<{ watchlists: Record<string, unknown>[] }>("/watchlists");
  assert.equal(listed.watchlists.length, 1);
  assert.equal(listed.watchlists[0]?.name, "核心持仓");
});

test("updates name and replaces symbols", async () => {
  const created = await createWatchlist("旧名", ["AAPL"]);
  const updated = await put(`/watchlists/${created.id}`, {
    name: "新名",
    symbols: ["600519.SH", "AAPL"],
  });
  assert.equal(updated.name, "新名");
  assert.deepEqual(updated.symbols, ["600519.SS", "AAPL"]);
});

test("rejects an empty name and an invalid symbol code", async () => {
  const emptyName = await request("/watchlists", {
    method: "POST",
    body: JSON.stringify({ name: "", symbols: [] }),
  });
  assert.equal(emptyName.status, 422);

  const created = await createWatchlist();
  const invalid = await request(`/watchlists/${created.id}/symbols`, {
    method: "POST",
    body: JSON.stringify({ code: "AAPL; DROP" }),
  });
  assert.equal(invalid.status, 422);
});

test("adds a symbol once and can remove it by encoded code", async () => {
  const created = await createWatchlist();
  const added = await postOk(`/watchlists/${created.id}/symbols`, {
    code: "600519.SH",
    name: "贵州茅台",
  });
  assert.deepEqual(added.symbols, ["600519.SS"]);

  const duplicate = await postOk(`/watchlists/${created.id}/symbols`, { code: "600519.SS" });
  assert.deepEqual(duplicate.symbols, ["600519.SS"]);

  const removed = await read<Record<string, unknown>>(
    `/watchlists/${created.id}/symbols/${encodeURIComponent("600519.SS")}`,
    { method: "DELETE" },
  );
  assert.deepEqual(removed.symbols, []);
});

test("deletes a watchlist and returns 404 afterwards", async () => {
  const created = await createWatchlist();
  const deleted = await request(`/watchlists/${created.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 204);
  assert.equal((await request(`/watchlists/${created.id}/summary`)).status, 404);
});

test("summary reports quotes, movers and unavailable symbols", async () => {
  const created = await createWatchlist("汇总", ["AAPL", "600519.SS", "BAD"]);
  const summary = await read<{
    quotes: { symbol: string; error?: string }[];
    movers: { symbol: string; direction: string; changePercent: number }[];
    unavailable: string[];
  }>(`/watchlists/${created.id}/summary`);

  assert.equal(summary.quotes.length, 3);
  assert.deepEqual(summary.unavailable, ["BAD"]);
  assert.equal(summary.movers[0]?.symbol, "AAPL");
  assert.equal(summary.movers[0]?.direction, "up");
  assert.ok(Math.abs((summary.movers[0]?.changePercent ?? 0) - (10 / 180) * 100) < 1e-9);
});

test("symbol search returns provider matches", async () => {
  const result = await read<{ matches: SymbolMatch[] }>("/symbols/search?q=aapl");
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.symbol, "AAPL");
});

test("symbol search rejects a missing query", async () => {
  assert.equal((await request("/symbols/search")).status, 422);
});
