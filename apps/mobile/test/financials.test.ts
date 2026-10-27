/** P1-F3 财报解析数据层单测。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  financialsState,
  isPdfUnsupported,
  missingMetricKeys,
  parseFinancialReport,
} from "../src/financials.ts";

const PAYLOAD = {
  id: "fr-1",
  symbol_code: "AAPL",
  parse_status: "partial",
  metrics: {
    revenue: { current: 391035, previous: 383285, unit: "USD", yoy: 2.02 },
    net_profit: { current: 93736, previous: 96995, unit: "USD", yoy: -3.36 },
    eps: { current: 6.08, previous: 6.13, unit: "per_share", yoy: -0.82 },
    gross_margin: { current: 46.2, previous: 45.6, unit: "percent", yoy: null, change_pp: 0.6 },
    operating_cash_flow: { current: null, previous: null, unit: "unknown", yoy: null },
  },
  unavailable: ["operating_cash_flow"],
  comparison_source: "same_pdf",
  expectations: "not_available",
  expectations_note: "未接入市场一致预期；对比对象为上一期。",
  parsed_at: "2026-10-27T08:00:00.000Z",
};

test("财报解析：5 指标、单位、同比/百分点与缺失字段", () => {
  const report = parseFinancialReport(PAYLOAD);
  assert.ok(report);
  assert.equal(report?.parseStatus, "partial");
  assert.equal(report?.metrics.revenue.current, 391035);
  assert.equal(report?.metrics.revenue.unit, "USD");
  assert.equal(report?.metrics.gross_margin.changePp, 0.6);
  assert.equal(report?.metrics.operating_cash_flow.current, null);
  assert.deepEqual(report?.unavailable, ["operating_cash_flow"]);
  assert.equal(report?.comparisonSource, "same_pdf");
  assert.equal(report?.expectations, "not_available");
});

test("财报横幅三态：全缺失/部分缺失/完整", () => {
  const report = parseFinancialReport(PAYLOAD);
  assert.ok(report);
  assert.equal(financialsState(report), "partial");
  assert.deepEqual(missingMetricKeys(report), ["operating_cash_flow"]);

  const none = parseFinancialReport({
    ...PAYLOAD,
    metrics: Object.fromEntries(
      Object.entries(PAYLOAD.metrics).map(([key, metric]) => [key, { ...metric, previous: null }]),
    ),
  });
  assert.equal(financialsState(none), "none");

  const complete = parseFinancialReport({
    ...PAYLOAD,
    metrics: {
      ...PAYLOAD.metrics,
      operating_cash_flow: { current: 110000, previous: 100000, unit: "USD", yoy: 10 },
    },
    unavailable: [],
  });
  assert.equal(financialsState(complete), "complete");
  assert.ok(complete);
  assert.deepEqual(missingMetricKeys(complete), []);
});

test("缺失字段按指标 key 去重，忽略原始后缀", () => {
  const report = parseFinancialReport({
    ...PAYLOAD,
    metrics: {
      ...PAYLOAD.metrics,
      operating_cash_flow: { current: 1, previous: 1, unit: "USD", yoy: 0 },
      eps: { current: 6.08, previous: 6.13, unit: "per_share", yoy: -0.82 },
    },
    unavailable: ["eps:current", "eps:previous", "revenue:previous", "unknown:current"],
  });
  assert.ok(report);
  assert.deepEqual(missingMetricKeys(report).sort(), ["eps", "revenue"]);
});

test("财报解析：report:null 与无效 payload", () => {
  assert.equal(parseFinancialReport({ report: null }), undefined);
  assert.equal(parseFinancialReport({ nope: true }), undefined);
  const none = parseFinancialReport({ ...PAYLOAD, comparison_source: "unknown" });
  assert.equal(none?.comparisonSource, "none");
});

test("PDF 422 错误识别", () => {
  const error = Object.assign(new Error("PDF parsing unavailable"), { status: 422 });
  assert.equal(isPdfUnsupported(error), true);
  assert.equal(isPdfUnsupported(new Error("network")), false);
});
