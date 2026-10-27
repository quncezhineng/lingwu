/**
 * F3/F4 数据层单测：研报解析、报价格式化、价格提醒契约与 PDF 文档生成。
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { LingWuApi } from "../src/api.ts";
import { directionOf, formatPercent, formatPrice } from "../src/market-format.ts";
import {
  checkPriceAlert,
  createPriceAlert,
  listPriceAlerts,
  updatePriceAlert,
} from "../src/price-alerts.ts";
import { parseResearchReport, type ReportLabels, researchReportDocument } from "../src/research.ts";

function fakeApi(handler: (path: string, body?: unknown, method?: string) => unknown): LingWuApi {
  return {
    token: "test-token",
    // 与 LingWuApi 一致：有 body 且未显式传 method 时默认 POST。
    request: async (path: string, body?: unknown, method?: string) =>
      handler(path, body, method ?? (body === undefined ? "GET" : "POST")),
  } as unknown as LingWuApi;
}

const REPORT_PAYLOAD = {
  report: {
    id: "r-1",
    symbol_code: "AAPL",
    title: "Apple Inc. (AAPL) research report",
    sections: {
      company_overview: "Apple trades on NASDAQ.",
      financials: {
        price: 343.91,
        previousClose: 347.7,
        changePercent: -1.1,
        volume: null,
        unavailable: ["volume", "marketCap"],
      },
      news: [
        { title: "Apple ships new chips", url: "https://example.com/a", publishedAt: "2026-10-26" },
      ],
      peer_comparison: [
        { symbol: "MSFT", name: "Microsoft", price: 431.2, changePercent: 0.51 },
        { symbol: "GOOGL", error: "timeout" },
      ],
      valuation: {
        method: "range_heuristic",
        current: 343.91,
        low: 220,
        mid: 300,
        high: 380,
        assumptions: ["区间取自 52 周最低/最高价，未使用 DCF 或可比公司倍数。"],
        caveat: "启发式估值区间，仅供研究参考，不构成投资建议。",
      },
      risks: ["行情为延迟数据（约 15 分钟）。"],
    },
    generated_at: "2026-10-27T06:00:00.000Z",
  },
};

const LABELS: ReportLabels = {
  disclaimer: "不构成投资建议",
  sources: "数据来源",
  overview: "公司概况",
  financials: "财务概览",
  news: "近期新闻",
  peers: "同业对比",
  valuation: "估值区间",
  risks: "风险提示",
  unavailable: "不可用字段",
  heuristic: "启发式区间估算，非 DCF 模型",
  current: "当前价",
  low: "区间下沿",
  mid: "区间中值",
  high: "区间上沿",
  generatedAt: "生成时间",
  noNews: "暂无新闻",
  noPeers: "暂无同业对比",
  noValuation: "暂无估值区间",
};

test("研报解析：B5 契约字段（snake_case）映射与降级字段", () => {
  const report = parseResearchReport(REPORT_PAYLOAD);
  assert.ok(report);
  assert.equal(report?.symbolCode, "AAPL");
  assert.equal(report?.companyOverview, "Apple trades on NASDAQ.");
  assert.deepEqual(report?.unavailable, ["volume", "marketCap"]);
  assert.equal(report?.news[0]?.url, "https://example.com/a");
  assert.equal(report?.peers.length, 2);
  assert.equal(report?.peers[1]?.error, "timeout");
  assert.equal(report?.valuation?.method, "range_heuristic");
  assert.equal(report?.valuation?.high, 380);
  assert.equal(report?.risks.length, 1);
});

test("研报解析：report 为 null 或缺少 sections 时返回 undefined", () => {
  assert.equal(parseResearchReport({ report: null }), undefined);
  assert.equal(parseResearchReport({ report: { id: "r" } }), undefined);
  assert.equal(parseResearchReport("nope"), undefined);
});

test("研报解析：估值字段缺失时不误建对象", () => {
  const report = parseResearchReport({
    report: { symbol_code: "AAPL", sections: { company_overview: "", valuation: {} } },
  });
  assert.equal(report?.valuation, undefined);
});

test("研报 PDF 文档：包含免责声明、来源链接、启发式标注与缺失字段", () => {
  const report = parseResearchReport(REPORT_PAYLOAD);
  assert.ok(report);
  const html = researchReportDocument(report, LABELS);
  assert.ok(html.includes("不构成投资建议"));
  assert.ok(html.includes("启发式区间估算，非 DCF 模型"));
  assert.ok(html.includes("https://example.com/a"));
  assert.ok(html.includes("不可用字段"));
  assert.ok(html.includes("volume"));
  assert.ok(html.includes("380"));
});

test("报价格式化：红涨绿跌配色与百分号", () => {
  assert.equal(formatPercent(2.345), "+2.35%");
  assert.equal(formatPercent(-1.2), "-1.20%");
  assert.equal(formatPrice(1856, "CNY"), "¥1,856.00");
  assert.equal(directionOf(0), "flat");
  assert.equal(directionOf(1.2), "up");
});

test("价格提醒：列表解析、创建/更新请求体与检查结果映射", async () => {
  const calls: Array<{ path: string; body?: unknown; method?: string }> = [];
  const api = fakeApi((path, body, method) => {
    calls.push({ path, body, method });
    if (path === "/api/price-alerts" && (method ?? "GET") === "GET") {
      return {
        alerts: [
          {
            id: "a-1",
            symbol_code: "AAPL",
            threshold_type: "PRICE_ABOVE",
            threshold_value: 400,
            enabled: true,
            interval_minutes: 15,
          },
          { id: "bad" },
        ],
      };
    }
    if (path === "/api/price-alerts" && method === "POST") {
      return {
        id: "a-2",
        symbol_code: "AAPL",
        threshold_type: "CHANGE_PCT",
        threshold_value: 5,
        enabled: true,
        interval_minutes: 30,
      };
    }
    if (path === "/api/price-alerts/a-1" && method === "PUT") {
      return {
        id: "a-1",
        symbol_code: "AAPL",
        threshold_type: "PRICE_ABOVE",
        threshold_value: 400,
        enabled: false,
        interval_minutes: 15,
      };
    }
    if (path === "/api/price-alerts/a-1/check") {
      return {
        triggered: true,
        notified: true,
        notification_id: "db-primary-key",
        notification_key: "price-alert:a-1:20753",
        quote: { price: 420, changePercent: 2.1 },
      };
    }
    return {};
  });

  const alerts = await listPriceAlerts(api);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.threshold_type, "PRICE_ABOVE");

  const created = await createPriceAlert(api, {
    symbol_code: "AAPL",
    threshold_type: "CHANGE_PCT",
    threshold_value: 5,
    interval_minutes: 30,
  });
  assert.equal(created.id, "a-2");
  assert.deepEqual(calls.at(-1)?.body, {
    symbol_code: "AAPL",
    threshold_type: "CHANGE_PCT",
    threshold_value: 5,
    interval_minutes: 30,
  });

  const updated = await updatePriceAlert(api, "a-1", { enabled: false });
  assert.equal(updated.enabled, false);
  assert.equal(calls.at(-1)?.method, "PUT");

  const check = await checkPriceAlert(api, "a-1");
  assert.equal(check.triggered, true);
  assert.equal(check.notificationId, "db-primary-key");
  assert.equal(check.notificationKey, "price-alert:a-1:20753");
});
