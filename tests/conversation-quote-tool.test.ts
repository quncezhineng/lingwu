import assert from "node:assert/strict";
import test from "node:test";
import { formatQuoteToolResult } from "../apps/server/src/engine/conversation.ts";
import type { BatchQuoteItem } from "../packages/integrations/src/market-data.ts";

const quote: BatchQuoteItem = {
  symbol: "AAPL",
  name: "Apple Inc.",
  market: "US",
  currency: "USD",
  price: 190,
  previousClose: 180,
  change: 10,
  changePercent: 5.56,
  volume: 40_000_000,
  asOf: "2026-10-27T08:00:00.000Z",
  stale: false,
  source: "yahoo",
};

test("single-symbol quote results expose both quotes[] and quote", () => {
  const result = formatQuoteToolResult([quote]);
  assert.deepEqual(result.quotes, [quote]);
  assert.deepEqual(result.quote, quote);
});

test("multi-symbol quote results only expose quotes[]", () => {
  const failure: BatchQuoteItem = { symbol: "BAD", market: "US", error: "not_found" };
  const result = formatQuoteToolResult([quote, failure]);
  assert.equal(result.quotes.length, 2);
  assert.equal(result.quote, undefined);
  assert.equal(result.quotes[1]?.error, "not_found");
});

test("quote payload keeps card fields including asOf, volume and stale", () => {
  const result = formatQuoteToolResult([
    { ...quote, stale: true, asOf: "2026-10-27T07:50:00.000Z" },
  ]);
  const payload = result.quote;
  assert.equal(payload?.asOf, "2026-10-27T07:50:00.000Z");
  assert.equal(payload?.volume, 40_000_000);
  assert.equal(payload?.stale, true);
  assert.equal(payload?.change, 10);
  assert.equal(payload?.changePercent, 5.56);
});
