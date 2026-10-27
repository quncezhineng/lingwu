/** P1-F3 行情卡片数据层单测。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  availabilityFromQuote,
  formatAsOf,
  formatDelayMinutes,
  formatVolume,
  parseBatchQuotes,
} from "../src/quotes.ts";

test("批量报价解析：逐项 ready / unavailable 与错误映射", () => {
  const parsed = parseBatchQuotes({
    quotes: [
      {
        symbol: "AAPL",
        price: 343.91,
        change: -3.81,
        changePercent: -1.1,
        volume: 42_263_954,
        currency: "USD",
        asOf: "2026-10-27T13:00:00.000Z",
        stale: false,
      },
      { symbol: "ZZZZ", error: "not_found" },
      { symbol: "HANG", error: "timeout" },
    ],
  });
  const apple = parsed.AAPL;
  assert.equal(apple?.status, "ready");
  assert.equal(apple?.status === "ready" ? apple.quote.price : 0, 343.91);
  assert.equal(apple?.status === "ready" ? apple.quote.volume : 0, 42_263_954);
  assert.equal(parsed.ZZZZ?.status, "unavailable");
  assert.equal(parsed.ZZZZ?.status === "unavailable" ? parsed.ZZZZ.reason : "", "not_found");
  assert.equal(parsed.HANG?.status === "unavailable" ? parsed.HANG.reason : "", "timeout");
});

test("summary 报价 → 卡片可用性：缺失报价且标记不可用", () => {
  assert.equal(availabilityFromQuote(undefined).status, "loading");
  assert.equal(availabilityFromQuote(undefined, true).status, "unavailable");
  const ready = availabilityFromQuote({
    price: 198.5,
    change: 4.52,
    changePercent: 2.34,
    weekChangePercent: 5.12,
    currency: "USD",
  });
  assert.equal(ready.status, "ready");
});

test("成交量与时间格式化：中英紧凑单位、跨日加日期", () => {
  assert.equal(formatVolume(42_263_954, "en"), "42.3M");
  assert.equal(formatVolume(42_263_954, "zh-Hans"), "4226万");
  assert.equal(formatVolume(9_999, "en"), "9,999");
  const today = new Date();
  today.setHours(10, 5, 0, 0);
  const same = formatAsOf(today.toISOString(), "en");
  assert.ok(same?.label.includes("10:05"));
  const past = new Date(today.getTime() - 36 * 3600 * 1000);
  const cross = formatAsOf(past.toISOString(), "en");
  assert.ok(cross?.label !== same?.label && (cross?.label.includes("/") ?? false));
  assert.ok((formatDelayMinutes(new Date(Date.now() - 15 * 60000).toISOString()) ?? 0) >= 14);
});
