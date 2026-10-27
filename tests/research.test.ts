import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { SearchService } from "../apps/server/src/search.ts";
import type { ResearchReport } from "../packages/domain/src/agent.ts";
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
let searchFails = false;

const prices: Record<string, number> = {
  AAPL: 190,
  MSFT: 400,
  GOOGL: 140,
  AMZN: 180,
  META: 500,
  "600519.SS": 1800,
};

function quoteFor(symbol: string): Quote {
  const price = prices[symbol];
  if (price === undefined) throw new MarketDataError("not_found", `no quote ${symbol}`);
  const previousClose = price / 1.05;
  const change = price - previousClose;
  const isCn = symbol.endsWith(".SS") || symbol.endsWith(".SZ");
  return {
    symbol,
    name: symbol === "AAPL" ? "Apple Inc." : symbol,
    market: isCn ? "CN" : "US",
    currency: isCn ? "CNY" : "USD",
    price,
    previousClose,
    change,
    changePercent: (change / previousClose) * 100,
    dayHigh: price + 2,
    dayLow: price - 2,
    volume: 1_000_000,
    fiftyTwoWeekHigh: price * 1.4,
    fiftyTwoWeekLow: price * 0.7,
    asOf: "2026-10-27T00:00:00.000Z",
    source: "yahoo",
  };
}

const provider: MarketDataProvider = {
  id: "yahoo",
  supports: () => true,
  getQuote: async (symbol) => quoteFor(symbol),
  searchSymbols: async (query) =>
    query.toUpperCase() === "AAPL"
      ? [{ symbol: "AAPL", name: "Apple Inc.", market: "US", sector: "Technology" }]
      : [],
  getIndexData: async () => [],
};

const fakeSearch = {
  search: async () => {
    if (searchFails) throw new Error("search provider offline");
    return {
      provider: "parallel" as const,
      results: [
        {
          url: "https://example.com/apple",
          title: "Apple announces results",
          excerpts: ["Apple reported quarterly results."],
          publish_date: "2026-10-26",
        },
      ],
      warnings: [],
      truncated: false,
    };
  },
} as unknown as SearchService;

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

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-research-"));
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
  server = await createApp(db, config, { market: market(), search: fakeSearch });
  const session = await server.app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  token = (await session.json()).token;
});

beforeEach(async () => {
  await server.agent.stop();
  searchFails = false;
  server = await createApp(db, config, { market: market(), search: fakeSearch });
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

test("research API requires a session", async () => {
  assert.equal((await server.app.request("/api/research/AAPL")).status, 401);
});

test("rejects an invalid research symbol", async () => {
  await call(
    "/research",
    { method: "POST", body: JSON.stringify({ symbol: "../../etc/passwd" }) },
    422,
  );
});

test("creates a research task and produces a research_report", async () => {
  const task = await call<{ id: string; kind: string; plan: { title: string }[]; status: string }>(
    "/research",
    { method: "POST", body: JSON.stringify({ symbol: "AAPL" }) },
    201,
  );
  assert.equal(task.kind, "research");
  assert.equal(task.plan.length, 4);
  assert.equal(task.status, "queued");

  await server.agent.worker.tick();

  const detail = await call<{
    task: { status: string; artifactIds: string[]; result?: string };
  }>(`/agent/tasks/${task.id}`);
  assert.equal(detail.task.status, "succeeded");
  assert.equal(detail.task.artifactIds.length, 1);

  const { report } = await call<{ report: ResearchReport }>("/research/AAPL");
  assert.equal(report.symbol_code, "AAPL");
  assert.match(report.title, /Apple/);
  assert.match(report.sections.company_overview, /Technology/);
  assert.equal(report.sections.financials.price, 190);
  assert.equal(report.sections.news.length, 1);
  assert.equal(report.sections.news[0]?.url, "https://example.com/apple");
  assert.equal(report.sections.peer_comparison.length, 4);
  assert.ok(report.sections.peer_comparison.some((peer) => peer.symbol === "MSFT"));
  const valuation = report.sections.valuation as { method: string; low: number; high: number };
  assert.equal(valuation.method, "range_heuristic");
  assert.ok(valuation.low < valuation.high);
  assert.ok(report.sections.risks.some((risk) => /不构成投资建议/.test(risk)));
});

test("normalizes .SH to .SS for stored reports", async () => {
  await call("/research", { method: "POST", body: JSON.stringify({ symbol: "600519.SH" }) }, 201);
  await server.agent.worker.tick();
  const { report } = await call<{ report: ResearchReport | null }>("/research/600519.SS");
  assert.equal(report?.symbol_code, "600519.SS");
});

test("degrades when search fails but still writes the report", async () => {
  searchFails = true;
  await call("/research", { method: "POST", body: JSON.stringify({ symbol: "AAPL" }) }, 201);
  await server.agent.worker.tick();
  const { report } = await call<{ report: ResearchReport }>("/research/AAPL");
  assert.equal(report.sections.news.length, 0);
  assert.ok(report.sections.risks.some((risk) => /新闻检索失败/.test(risk)));
});

test("history lists reports newest first", async () => {
  const first = await call<{ report: ResearchReport }>("/research/AAPL");
  const { reports } = await call<{ reports: ResearchReport[] }>("/research/AAPL/history?limit=5");
  assert.ok(reports.length >= 1);
  assert.equal(reports[0]?.id, first.report.id);
});

test("a missing quote fails the task with a bounded error", async () => {
  const task = await call<{ id: string }>(
    "/research",
    { method: "POST", body: JSON.stringify({ symbol: "BAD" }) },
    201,
  );
  await server.agent.worker.tick();
  const detail = await call<{ task: { status: string; error?: string } }>(
    `/agent/tasks/${task.id}`,
  );
  assert.equal(detail.task.status, "failed");
  assert.match(detail.task.error ?? "", /Unable to load a quote|not_found/);
});

test("unknown symbol returns a null report", async () => {
  const result = await call<{ report: ResearchReport | null }>("/research/ZZZZ");
  assert.equal(result.report, null);
});
