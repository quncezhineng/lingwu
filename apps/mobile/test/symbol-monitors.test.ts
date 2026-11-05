import assert from "node:assert/strict";
import { test } from "node:test";
import type { Monitor } from "../../../packages/domain/src/agent.ts";
import { monitorsForSymbol } from "../src/symbol-monitors.ts";

function monitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: "m1",
    taskId: "t1",
    title: "贵州茅台 价格提醒",
    description: "关注 600519.SS 的价格变化。",
    url: "https://finance.yahoo.com/quote/600519.SS",
    condition: "price_below",
    value: "1800",
    intervalMinutes: 15,
    status: "active",
    nextCheckAt: "2026-11-05T08:00:00.000Z",
    checks: 0,
    ...overrides,
  };
}

test("按报价页 url 匹配该标的的提醒", () => {
  const result = monitorsForSymbol([monitor()], { code: "600519.SS" });
  assert.equal(result.length, 1);
});

test("url 里带 .SS 后缀时，用裸代码也能匹配", () => {
  const result = monitorsForSymbol([monitor()], { code: "600519" });
  assert.equal(result.length, 1);
});

test("url 不匹配时回退到描述里的代码", () => {
  const result = monitorsForSymbol(
    [monitor({ url: "https://example.com/quote-page", description: "关注 600519.SS 的新闻" })],
    { code: "600519.SS" },
  );
  assert.equal(result.length, 1);
});

test("其它标的与已停止的提醒不列出", () => {
  const others = [
    monitor({ id: "m2", url: "https://finance.yahoo.com/quote/AAPL", description: "关注 AAPL" }),
    monitor({ id: "m3", status: "stopped" }),
  ];
  assert.deepEqual(monitorsForSymbol(others, { code: "600519.SS" }), []);
});
