/** P1-F3 行情卡片数据层单测。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  availabilityFromQuote,
  formatAsOf,
  formatDelayMinutes,
  formatVolume,
  parseBatchQuotes,
  parseToolQuotes,
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

test("sparkline：仅接受全部为有限数字且 ≥2 点的数组", () => {
  const parsed = parseBatchQuotes({
    quotes: [
      { symbol: "AAPL", price: 1, sparkline: [1, 2, 3] },
      { symbol: "MSFT", price: 2, points: [1, 2] },
      { symbol: "TSLA", price: 3, sparkline: [1] },
      { symbol: "NVDA", price: 4, sparkline: [1, "x", 3] },
      { symbol: "AMD", price: 5 },
    ],
  });
  assert.deepEqual(
    parsed.AAPL?.status === "ready" ? parsed.AAPL.quote.sparkline : undefined,
    [1, 2, 3],
  );
  assert.deepEqual(
    parsed.MSFT?.status === "ready" ? parsed.MSFT.quote.sparkline : undefined,
    [1, 2],
  );
  assert.equal(parsed.TSLA?.status === "ready" ? parsed.TSLA.quote.sparkline : "x", undefined);
  assert.equal(parsed.NVDA?.status === "ready" ? parsed.NVDA.quote.sparkline : "x", undefined);
  assert.equal(parsed.AMD?.status === "ready" ? parsed.AMD.quote.sparkline : "x", undefined);
});

test("market_state：只接受明确时段，unknown/缺省保持 undefined", () => {
  const parsed = parseBatchQuotes({
    quotes: [
      { symbol: "AAPL", price: 1, market_state: "regular" },
      { symbol: "MSFT", price: 2, market_state: "PRE" },
      { symbol: "TSLA", price: 3, marketState: "closed" },
      { symbol: "NVDA", price: 4, market_state: "unknown" },
      { symbol: "AMD", price: 5 },
    ],
  });
  assert.equal(parsed.AAPL?.status === "ready" ? parsed.AAPL.quote.marketState : "", "regular");
  assert.equal(parsed.MSFT?.status === "ready" ? parsed.MSFT.quote.marketState : "", "pre");
  assert.equal(parsed.TSLA?.status === "ready" ? parsed.TSLA.quote.marketState : "", "closed");
  assert.equal(parsed.NVDA?.status === "ready" ? parsed.NVDA.quote.marketState : "x", undefined);
  assert.equal(parsed.AMD?.status === "ready" ? parsed.AMD.quote.marketState : "x", undefined);

  const tool = parseToolQuotes({
    quote: { symbol: "AAPL", price: 1, market_state: "post" },
  });
  assert.equal(
    tool[0]?.availability.status === "ready" ? tool[0].availability.quote.marketState : "",
    "post",
  );
});

test("对话内联行情：单标的优先 quote，多标的取 quotes 并保留错误", () => {
  const single = parseToolQuotes({
    quote: {
      symbol: "AAPL",
      name: "Apple Inc.",
      market: "US",
      price: 343.91,
      changePercent: 1.2,
      asOf: "2026-10-27T13:00:00.000Z",
      stale: true,
    },
    quotes: [],
  });
  assert.equal(single.length, 1);
  assert.equal(single[0]?.symbol, "AAPL");
  assert.equal(single[0]?.availability.status, "ready");
  assert.equal(
    single[0]?.availability.status === "ready" ? single[0].availability.quote.stale : false,
    true,
  );

  const multi = parseToolQuotes(
    JSON.stringify({
      quotes: [
        { symbol: "AAPL", price: 343.91, currency: "USD" },
        { symbol: "ZZZZ", error: "not_found" },
        { symbol: "HANG", error: "timeout" },
      ],
    }),
  );
  assert.equal(multi.length, 3);
  assert.equal(multi[1]?.availability.status, "unavailable");
  assert.equal(
    multi[1]?.availability.status === "unavailable" ? multi[1].availability.reason : "",
    "not_found",
  );
  assert.equal(
    multi[0]?.availability.status === "ready" ? multi[0].availability.quote.asOf : "x",
    undefined,
  );
  assert.deepEqual(parseToolQuotes("not json"), []);
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
