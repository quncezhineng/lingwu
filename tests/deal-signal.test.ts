import assert from "node:assert/strict";
import { test } from "node:test";
import { detectDealSignals, isDealDecision } from "../apps/server/src/engine/deal-signal.ts";

test("detects negotiation stage from valuation keywords", () => {
  const hits = detectDealSignals("我们讨论了本轮融资的估值和 pre-money 定价");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.stage, "谈判");
});

test("detects decision stage from buy/sell keywords", () => {
  assert.equal(detectDealSignals("决定加仓 NVDA")[0]?.stage, "决策");
  assert.equal(detectDealSignals("计划减持 20% 仓位")[0]?.stage, "决策");
});

test("detects exit stage from IPO keywords", () => {
  assert.equal(detectDealSignals("公司计划明年港股 IPO 上市")[0]?.stage, "退出");
});

test("detects due diligence stage", () => {
  assert.equal(detectDealSignals("对方进入尽调阶段，安排下周进行 due diligence")[0]?.stage, "尽调");
});

test("returns empty for non-deal text", () => {
  assert.equal(detectDealSignals("今天天气不错，适合阅读财报").length, 0);
  assert.equal(isDealDecision("今天天气不错"), false);
});

test("isDealDecision true when any signal hits", () => {
  assert.equal(isDealDecision("决定清仓全部美股仓位"), true);
});

test("deduplicates stages across multiple keywords", () => {
  // 多个关键词命中同一「决策」阶段，只保留一条。
  const hits = detectDealSignals("决定加仓，同时卖出部分亏损标的");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.stage, "决策");
});
