import assert from "node:assert/strict";
import test from "node:test";
import {
  isTradingDay,
  localDate,
  marketClock,
  marketForSymbol,
  nextTradingDay,
} from "../packages/domain/src/market-calendar.ts";

test("weekends are never trading days", () => {
  assert.equal(isTradingDay("US", "2026-11-14"), false);
  assert.equal(isTradingDay("CN", "2026-11-15"), false);
  assert.equal(isTradingDay("HK", "2026-11-14"), false);
});

test("each market follows its own holiday table", () => {
  // CN National Day, HK National Day, US Thanksgiving 2026.
  assert.equal(isTradingDay("CN", "2026-10-01"), false);
  assert.equal(isTradingDay("HK", "2026-10-01"), false);
  assert.equal(isTradingDay("US", "2026-10-01"), true);
  assert.equal(isTradingDay("US", "2026-11-26"), false);
  assert.equal(isTradingDay("CN", "2026-11-26"), true);
  assert.equal(isTradingDay("HK", "2026-11-26"), true);
});

test("next trading day skips weekends and holidays", () => {
  assert.equal(nextTradingDay("US", "2026-11-13"), "2026-11-16");
  assert.equal(nextTradingDay("US", "2026-11-25"), "2026-11-27");
  assert.equal(nextTradingDay("CN", "2026-05-01"), "2026-05-06");
});

test("local dates follow the market time zone", () => {
  const at = new Date("2026-11-14T02:00:00.000Z");
  assert.equal(localDate("Asia/Shanghai", at), "2026-11-14");
  assert.equal(localDate("America/New_York", at), "2026-11-13");
  assert.deepEqual(marketClock("CN", at), { date: "2026-11-14", hour: 10, minute: 0 });
  assert.deepEqual(marketClock("US", at), { date: "2026-11-13", hour: 21, minute: 0 });
});

test("symbols map to the market that owns their calendar", () => {
  assert.equal(marketForSymbol("600519.SS"), "CN");
  assert.equal(marketForSymbol("000001.SZ"), "CN");
  assert.equal(marketForSymbol("0700.HK"), "HK");
  assert.equal(marketForSymbol("AAPL"), "US");
});
