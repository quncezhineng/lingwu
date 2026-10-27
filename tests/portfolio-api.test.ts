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
  "600519.SS": { price: 1800, previousClose: 1750 },
};

const provider: MarketDataProvider = {
  id: "yahoo",
  supports: () => true,
  getQuote: async (symbol) => {
    if (symbol === "HANG") return new Promise(() => {});
    const entry = prices[symbol];
    if (!entry) throw new MarketDataError("not_found", `no quote ${symbol}`);
    const change = entry.price - entry.previousClose;
    const isCn = symbol.endsWith(".SS") || symbol.endsWith(".SZ");
    const quote: Quote = {
      symbol,
      market: isCn ? "CN" : "US",
      currency: isCn ? "CNY" : "USD",
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
    quoteTimeoutMs: 300,
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

const post = <T>(path: string, body: unknown, status = 201) =>
  call<T>(path, { method: "POST", body: JSON.stringify(body) }, status);
const put = <T>(path: string, body: unknown) =>
  call<T>(path, { method: "PUT", body: JSON.stringify(body) });

async function createPortfolio(name = "长期价值") {
  return post<{ id: string; name: string; base_currency: string }>("/portfolios", { name });
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-portfolio-"));
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

test("portfolio API requires a session", async () => {
  assert.equal((await server.app.request("/api/portfolios")).status, 401);
});

test("creates, lists, updates and deletes a portfolio with holdings", async () => {
  const created = await createPortfolio();
  assert.equal(created.base_currency, "CNY");

  const listed = await call<{ portfolios: { id: string }[] }>("/portfolios");
  assert.ok(listed.portfolios.some((item) => item.id === created.id));

  const updated = await put<{ name: string; benchmark: string }>(`/portfolios/${created.id}`, {
    name: "短线",
    benchmark: "SPX",
  });
  assert.equal(updated.name, "短线");
  assert.equal(updated.benchmark, "SPX");

  const holding = await post<{ id: string; symbol_code: string; currency: string }>(
    `/portfolios/${created.id}/holdings`,
    { symbol_code: "aapl", quantity: 10, avg_cost: 100 },
  );
  assert.equal(holding.symbol_code, "AAPL");
  assert.equal(holding.currency, "USD");

  const removed = await server.app.request(`/api/portfolios/${created.id}`, {
    method: "DELETE",
    headers: headers(),
  });
  assert.equal(removed.status, 204);
  await call(`/portfolios/${created.id}`, {}, 404);
});

test("adding the same symbol merges quantity with a weighted average cost", async () => {
  const portfolio = await createPortfolio();
  await post(`/portfolios/${portfolio.id}/holdings`, {
    symbol_code: "AAPL",
    quantity: 10,
    avg_cost: 100,
  });
  const merged = await post<{ quantity: number; avg_cost: number }>(
    `/portfolios/${portfolio.id}/holdings`,
    { symbol_code: "AAPL", quantity: 10, avg_cost: 200 },
  );
  assert.equal(merged.quantity, 20);
  assert.equal(merged.avg_cost, 150);
});

test("normalizes .SH to .SS and infers CNY currency", async () => {
  const portfolio = await createPortfolio();
  const holding = await post<{ symbol_code: string; market: string; currency: string }>(
    `/portfolios/${portfolio.id}/holdings`,
    { symbol_code: "600519.SH", quantity: 100, avg_cost: 1500 },
  );
  assert.equal(holding.symbol_code, "600519.SS");
  assert.equal(holding.market, "CN");
  assert.equal(holding.currency, "CNY");
});

test("updates and removes a holding", async () => {
  const portfolio = await createPortfolio();
  const holding = await post<{ id: string }>(`/portfolios/${portfolio.id}/holdings`, {
    symbol_code: "AAPL",
    quantity: 10,
    avg_cost: 100,
  });
  const updated = await put<{ quantity: number; avg_cost: number }>(
    `/portfolios/${portfolio.id}/holdings/${holding.id}`,
    { quantity: 12, avg_cost: 110 },
  );
  assert.equal(updated.quantity, 12);
  assert.equal(updated.avg_cost, 110);

  const removed = await server.app.request(
    `/api/portfolios/${portfolio.id}/holdings/${holding.id}`,
    { method: "DELETE", headers: headers() },
  );
  assert.equal(removed.status, 204);
  const detail = await call<{ holdings: unknown[] }>(`/portfolios/${portfolio.id}`);
  assert.equal(detail.holdings.length, 0);
});

test("CSV preview reports per-row field errors and keeps valid rows", async () => {
  const csv = [
    "symbol,quantity,cost_price,buy_date,name,sector,currency",
    "AAPL,10,100,2026-01-02,Apple,Technology,USD",
    "AAPL,5,120,2026-02-03,Apple,Technology,USD",
    "600519.SH,oops,1500,2026-01-02,Moutai,Consumer,CNY",
    "BAD!SYMBOL,1,10,2026-01-02,bad,,USD",
    'MSFT,3,400,2026-03-04,"Microsoft, Inc.",Technology,',
  ].join("\n");
  const preview = await post<{
    total: number;
    valid: number;
    invalid: number;
    rows: {
      row: number;
      status: string;
      errors: { field: string; reason: string }[];
      parsed?: { name?: string };
    }[];
  }>("/portfolios/import/preview", { csv }, 200);

  assert.equal(preview.total, 5);
  assert.equal(preview.valid, 3);
  assert.equal(preview.invalid, 2);
  // Duplicate symbols are merged on import, not rejected.
  assert.equal(preview.rows.find((row) => row.row === 3)?.status, "ok");
  const badQuantity = preview.rows.find((row) => row.row === 4);
  assert.equal(badQuantity?.errors[0]?.field, "quantity");
  const badSymbol = preview.rows.find((row) => row.row === 5);
  assert.equal(badSymbol?.errors[0]?.field, "symbol");
  const quoted = preview.rows.find((row) => row.parsed?.name === "Microsoft, Inc.");
  assert.equal(quoted?.row, 6);
});

test("CSV preview validates buy_date and rejects a header without required columns", async () => {
  await post("/portfolios/import/preview", { csv: "symbol,quantity\nAAPL,1" }, 422);
  const preview = await post<{
    rows: { row: number; errors: { field: string; reason: string }[] }[];
  }>(
    "/portfolios/import/preview",
    { csv: "symbol,quantity,cost_price,buy_date\nAAPL,1,10,01/02/2026" },
    200,
  );
  assert.equal(preview.rows[0]?.errors[0]?.field, "buy_date");
});

test("CSV import partially imports valid rows, merges duplicates and reports errors", async () => {
  const csv = [
    "symbol,quantity,cost_price,buy_date",
    "AAPL,10,100,2026-01-02",
    "AAPL,10,200,2026-02-03",
    "BAD!SYMBOL,1,10,2026-01-02",
    "600519.SH,100,1500,2026-01-02",
  ].join("\n");
  const result = await post<{
    portfolio: { id: string };
    imported_count: number;
    merged_count: number;
    errors: { row: number; field: string; reason: string }[];
  }>("/portfolios/import", { csv, name: "导入组合" }, 201);

  assert.equal(result.imported_count, 2);
  assert.equal(result.merged_count, 1);
  assert.deepEqual(result.errors, [{ row: 4, field: "symbol", reason: "invalid: BAD!SYMBOL" }]);

  const detail = await call<{
    holdings: { symbol_code: string; currency: string; quantity: number; avg_cost: number }[];
  }>(`/portfolios/${result.portfolio.id}`);
  assert.deepEqual(detail.holdings.map((holding) => holding.symbol_code).sort(), [
    "600519.SS",
    "AAPL",
  ]);
  const aapl = detail.holdings.find((holding) => holding.symbol_code === "AAPL");
  assert.equal(aapl?.quantity, 20);
  assert.equal(aapl?.avg_cost, 150);
  assert.equal(
    detail.holdings.find((holding) => holding.symbol_code === "600519.SS")?.currency,
    "CNY",
  );

  const again = await post<{ imported_count: number; merged_count: number }>("/portfolios/import", {
    csv: "symbol,quantity,cost_price,buy_date\nAAPL,10,200,2026-03-04",
    portfolio_id: result.portfolio.id,
  });
  assert.equal(again.imported_count, 0);
  assert.equal(again.merged_count, 1);
});

test("summary aggregates per currency without FX conversion", async () => {
  const csv = [
    "symbol,quantity,cost_price,buy_date,name,sector",
    "AAPL,10,150,2026-01-02,Apple,Technology",
    "600519.SH,100,1500,2026-01-02,Moutai,Consumer",
    "HANG,1,10,2026-01-02,Hang,Technology",
  ].join("\n");
  const imported = await post<{ portfolio: { id: string } }>("/portfolios/import", { csv });

  const summary = await call<{
    fx_note: string;
    totals: { currency: string; cost: number; market_value: number; pnl: number }[];
    positions: { symbol_code: string; market_value?: number; error?: string; currency: string }[];
    allocation: {
      currency: string;
      total_market_value: number;
      by_symbol: { key: string; weight: number }[];
    }[];
    top_holdings: { currency: string; items: { key: string }[] }[];
    unavailable: string[];
  }>(`/portfolios/${imported.portfolio.id}/summary`);

  assert.match(summary.fx_note, /未折算/);
  assert.deepEqual(summary.totals.map((total) => total.currency).sort(), ["CNY", "USD"]);
  const usd = summary.totals.find((total) => total.currency === "USD");
  assert.equal(usd?.cost, 1510);
  // HANG has no quote, so its market value falls back to cost (10).
  assert.equal(usd?.market_value, 1910);
  assert.equal(usd?.pnl, 400);
  const cny = summary.totals.find((total) => total.currency === "CNY");
  assert.equal(cny?.market_value, 180000);

  assert.deepEqual(summary.unavailable, ["HANG"]);
  const hang = summary.positions.find((position) => position.symbol_code === "HANG");
  assert.equal(hang?.error, "timeout");

  const usdAllocation = summary.allocation.find((entry) => entry.currency === "USD");
  assert.equal(usdAllocation?.by_symbol[0]?.key, "AAPL");
  assert.ok((usdAllocation?.by_symbol[0]?.weight ?? 0) > 99);
  assert.equal(
    summary.top_holdings.find((entry) => entry.currency === "USD")?.items[0]?.key,
    "AAPL",
  );
});
