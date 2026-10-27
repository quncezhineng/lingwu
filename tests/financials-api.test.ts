import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { parseFinancialText } from "../apps/server/src/engine/financials.ts";
import { MarketDataService } from "../packages/integrations/src/market-data.ts";

let db: Store;
let server: Awaited<ReturnType<typeof createApp>>;
let directory: string;
let token: string;
let config: Config;

const completeText = [
  "贵州茅台 2025 年年度报告",
  "营业收入 1,234.56 亿元 上年同期 1,100.00 亿元",
  "归属于母公司股东的净利润 600.12 亿元 上年同期 550.00 亿元",
  "基本每股收益 42.80 元 上年同期 38.00 元",
  "毛利率 91.50% 上年同期 91.20%",
  "经营活动产生的现金流量净额 650.00 亿元 上年同期 600.00 亿元",
].join("\n");

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
  directory = await mkdtemp(join(tmpdir(), "lingwu-financials-"));
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
    market: new MarketDataService({ akshare: null, onError: () => undefined }),
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

test("parses all five metrics with same-PDF previous values", () => {
  const { metrics, unavailable } = parseFinancialText(completeText);
  assert.deepEqual(unavailable, []);
  assert.equal(metrics.revenue.current, 1234.56e8);
  assert.equal(metrics.revenue.previous, 1100e8);
  assert.ok(Math.abs((metrics.revenue.yoy ?? 0) - 12.2327) < 0.01);
  assert.equal(metrics.net_profit.current, 600.12e8);
  assert.equal(metrics.eps.current, 42.8);
  assert.equal(metrics.eps.previous, 38);
  assert.ok(Math.abs((metrics.eps.yoy ?? 0) - 12.6316) < 0.01);
  assert.equal(metrics.gross_margin.current, 91.5);
  assert.ok(Math.abs((metrics.gross_margin.change_pp ?? 0) - 0.3) < 1e-9);
  assert.equal(metrics.operating_cash_flow.current, 650e8);
});

test("missing previous values and fields are reported explicitly", () => {
  const text = "营业收入 100 亿元\n毛利率 50%";
  const { metrics, unavailable } = parseFinancialText(text);
  assert.equal(metrics.revenue.current, 100e8);
  assert.equal(metrics.revenue.previous, null);
  assert.equal(metrics.net_profit.current, null);
  assert.ok(unavailable.includes("revenue:previous"));
  assert.ok(unavailable.includes("net_profit:current"));
  assert.ok(unavailable.includes("operating_cash_flow:current"));
});

test("financial API requires a session", async () => {
  assert.equal((await server.app.request("/api/financials/AAPL")).status, 401);
});

test("parse stores a complete report and exposes latest/history", async () => {
  const report = await call<{
    id: string;
    symbol_code: string;
    parse_status: string;
    metrics: { revenue: { current: number } };
    unavailable: string[];
    comparison_source: string;
    expectations: string;
    source_url?: string;
  }>(
    "/financials/parse",
    {
      method: "POST",
      body: JSON.stringify({
        symbol_code: "600519.SH",
        text: completeText,
        source_file: "2025-annual.pdf",
        source_url: "https://example.com/report.pdf",
      }),
    },
    201,
  );
  assert.equal(report.symbol_code, "600519.SS");
  assert.equal(report.parse_status, "complete");
  assert.equal(report.metrics.revenue.current, 1234.56e8);
  assert.deepEqual(report.unavailable, []);
  assert.equal(report.comparison_source, "same_pdf");
  assert.equal(report.expectations, "not_available");
  assert.equal(report.source_url, "https://example.com/report.pdf");

  const latest = await call<{ report: { id: string } | null }>("/financials/600519.SS");
  assert.equal(latest.report?.id, report.id);

  const history = await call<{ reports: { id: string }[] }>("/financials/600519.SS/history");
  assert.equal(history.reports[0]?.id, report.id);
});

test("partial reports list the missing fields", async () => {
  const report = await call<{
    parse_status: string;
    unavailable: string[];
  }>(
    "/financials/parse",
    {
      method: "POST",
      body: JSON.stringify({ symbol_code: "AAPL", text: "Net income 10 billion" }),
    },
    201,
  );
  assert.equal(report.parse_status, "partial");
  assert.ok(report.unavailable.length > 0);
});

test("an unparsable text fails explicitly instead of inventing values", async () => {
  const report = await call<{
    parse_status: string;
    unavailable: string[];
    metrics: Record<string, { current: number | null }>;
  }>(
    "/financials/parse",
    {
      method: "POST",
      body: JSON.stringify({ text: "This document has no financial figures." }),
    },
    201,
  );
  assert.equal(report.parse_status, "failed");
  assert.equal(report.metrics.revenue?.current, null);
  assert.equal(report.unavailable.filter((item) => item.endsWith(":current")).length, 5);
});

test("rejects a request without text or PDF", async () => {
  await call("/financials/parse", { method: "POST", body: JSON.stringify({}) }, 422);
});
