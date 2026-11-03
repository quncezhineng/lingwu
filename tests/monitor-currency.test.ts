import assert from "node:assert/strict";
import test from "node:test";
import { readMonitoredPrice } from "../apps/server/src/engine/monitor-price.ts";
import { monitorInputSchema } from "../packages/domain/src/agent.ts";
import {
  type MonitorCurrency,
  monitorPriceLabel,
  normalizeMonitorCurrency,
  resolveMonitorCurrency,
} from "../packages/domain/src/monitor-currency.ts";

for (const [currency, texts] of [
  [
    "CNY",
    [
      "CNY 14.99",
      "RMB14.99",
      "rmb 14.99",
      "人民币14.99",
      "人民幣 14.99",
      "¥14.99",
      "￥ 14.99",
      "14.99元",
      "14.99 CNY",
      "14.99 人民币",
      "人民币 ¥14.99",
      "CN¥14.99",
    ],
  ],
  [
    "HKD",
    [
      "HKD14.99",
      "hkd 14.99",
      "HK$14.99",
      "HK $ 14.99",
      "港币14.99",
      "港幣 14.99",
      "港元14.99",
      "14.99港元",
      "14.99 HKD",
      "币种：HKD\n最新价 $14.99",
      "港币报价 14.99元",
    ],
  ],
  [
    "USD",
    [
      "USD14.99",
      "usd 14.99",
      "US$14.99",
      "美元14.99",
      "美金 14.99",
      "$14.99",
      "$ 14.99",
      "$\t14.99",
      "$\u00a014.99",
      "$\n14.99",
      "14.99 USD",
      "14.99 美元",
      "USD $14.99",
    ],
  ],
] satisfies [MonitorCurrency, string[]][]) {
  for (const text of texts)
    test(`${currency} price recognizes ${JSON.stringify(text)}`, () => {
      assert.equal(readMonitoredPrice(text, currency), 14.99);
    });
}

test("currency markers, thousands, full-width digits and sub-cent precision survive formatting", () => {
  assert.equal(readMonitoredPrice("当前价：ＣＮＹ １，２３４．５６７８", "CNY"), 1234.5678);
  assert.equal(readMonitoredPrice("Price: HK$ 1,234.50", "HKD"), 1234.5);
  assert.equal(readMonitoredPrice("人民币1\u202f234.50", "CNY"), 1234.5);
});

test("a selected currency never consumes another currency's prices or a partial number", () => {
  for (const [text, currency] of [
    ["HK$1.00", "USD"],
    ["US$1.00", "HKD"],
    ["CNY1.00", "USD"],
    ["JPY ¥1.00", "CNY"],
    ["CAD $1.00", "USD"],
    ["USD 12,34", "USD"],
    ["12,34元", "CNY"],
    ["USD 1e3", "USD"],
    ["¥-1.00", "CNY"],
    ["价格 14.99%", "CNY"],
    ["No price yet", "HKD"],
  ] satisfies [string, MonitorCurrency][])
    assert.throws(() => readMonitoredPrice(text, currency), /No readable/);
  const mixed = "CNY 20.76 / HKD 2.50 / USD 1.20";
  assert.equal(readMonitoredPrice(mixed, "CNY"), 20.76);
  assert.equal(readMonitoredPrice(mixed, "HKD"), 2.5);
  assert.equal(readMonitoredPrice(mixed, "USD"), 1.2);
});

test("current quotes win over historical lows and page-wide currency mismatches", () => {
  assert.throws(() => readMonitoredPrice("最新价 --\n昨日 CNY 1.00", "CNY"), /No readable/);
  assert.throws(
    () => readMonitoredPrice("最新价 JPY 20\n其他人民币 CNY 1.00", "CNY"),
    /No readable/,
  );
  assert.equal(readMonitoredPrice("最新价 USD20.76\nCNY1.00", "USD"), 20.76);
  assert.equal(readMonitoredPrice("最新價 HK$14.99\nUSD1.00", "HKD"), 14.99);
  assert.equal(
    readMonitoredPrice("最新价：CNY 20.76\n今日最低 CNY 12.00\n昨收 CNY 18.87", "CNY"),
    20.76,
  );
  assert.equal(readMonitoredPrice("币种：港币\n现价：14.99\n52周最低 HKD 3.00", "HKD"), 14.99);
  assert.equal(readMonitoredPrice("Current price: USD 14.99\nPrior close USD 13.00", "USD"), 14.99);
  assert.throws(() => readMonitoredPrice("最新价 USD 20\n其他人民币 CNY 1", "CNY"), /No readable/);
  assert.throws(() => readMonitoredPrice("CNY20.76 与 CNY12.00", "CNY"), /multiple/);
  assert.throws(() => readMonitoredPrice("现价 CNY20.76\n现价 CNY12.00", "CNY"), /multiple/);
});

test("new price rules accept all three currencies and legacy rules resolve clear market clues", () => {
  for (const currency of ["CNY", "HKD", "USD"] as const) {
    const input = monitorInputSchema.parse({
      title: "Price",
      url: "https://example.com",
      condition: "price_below",
      value: "15",
      currency,
    });
    assert.equal(input.currency, currency);
    assert.equal(resolveMonitorCurrency(input), currency);
  }
  assert.equal(normalizeMonitorCurrency("rmb"), "CNY");
  assert.equal(normalizeMonitorCurrency("港币"), "HKD");
  assert.equal(
    resolveMonitorCurrency({
      title: "恒生电子 600570 跌破15元",
      url: "https://quote.eastmoney.com/sh600570.html",
    }),
    "CNY",
  );
  assert.equal(resolveMonitorCurrency({ title: "灵宝黄金 3330.HK 跌破15元" }), "HKD");
  assert.equal(resolveMonitorCurrency({ url: "https://finance.yahoo.com/quote/3330.HK" }), "HKD");
  assert.equal(resolveMonitorCurrency({ title: "AAPL below USD 100" }), "USD");
  assert.equal(resolveMonitorCurrency({ title: "Generic old price watch" }), "USD");
  assert.equal(resolveMonitorCurrency({ title: "CNY and HKD" }), undefined);
  assert.equal(resolveMonitorCurrency({ currency: "HKD", title: "CNY and HKD" }), "HKD");
  assert.equal(monitorPriceLabel({ currency: "CNY", value: "15.00" }), "CNY 15.00");
});
