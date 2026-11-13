import assert from "node:assert/strict";
import test from "node:test";
import type { LingWuApi } from "../src/api.ts";
import {
  consumeMonitorTab,
  loadMonitor,
  monitorSnapshot,
  parseMonitorEvent,
  parseMonitorRule,
  parseMonitorToday,
  requestMonitorTab,
} from "../src/monitor.ts";

const RULE_PAYLOAD = {
  id: "r-1",
  name: "宁德时代公告",
  target_type: "symbol",
  target_id: "300750.SZ",
  market: "CN",
  event_kinds: ["ANNOUNCEMENT", "EARNINGS"],
  level: "MUST_KNOW",
  cooldown_minutes: 240,
  interval_minutes: 5,
  enabled: true,
  channels: ["in_app"],
  price: { threshold_type: "PRICE_BELOW", threshold_value: 180 },
  created_at: "2026-11-13T02:00:00.000Z",
  updated_at: "2026-11-13T02:00:00.000Z",
};

const EVENT_PAYLOAD = {
  id: "e-1",
  rule_id: "r-1",
  rule_name: "宁德时代公告",
  kind: "ANNOUNCEMENT",
  original_level: "MUST_KNOW",
  level: "MUST_KNOW",
  title: "宁德时代发布公告",
  body: "拟回购股份",
  payload: { symbol: "300750.SZ" },
  dedupe_key: "r-1:ANNOUNCEMENT:300750.SZ",
  detected_at: "2026-11-13T02:10:00.000Z",
  market_date: "2026-11-13",
  state: "delivered",
  segment: "unknown",
  updated_at: "2026-11-13T02:10:00.000Z",
};

test("monitor rule parsing keeps levels, price conditions and channels", () => {
  const rule = parseMonitorRule(RULE_PAYLOAD);
  assert.ok(rule);
  assert.equal(rule?.targetType, "symbol");
  assert.deepEqual(rule?.eventKinds, ["ANNOUNCEMENT", "EARNINGS"]);
  assert.equal(rule?.level, "MUST_KNOW");
  assert.equal(rule?.price?.thresholdType, "PRICE_BELOW");
  assert.equal(rule?.price?.thresholdValue, 180);
  assert.deepEqual(rule?.channels, ["in_app"]);
});

test("monitor event parsing keeps the effective level and digest state", () => {
  const event = parseMonitorEvent(EVENT_PAYLOAD);
  assert.ok(event);
  assert.equal(event?.kind, "ANNOUNCEMENT");
  assert.equal(event?.level, "MUST_KNOW");
  assert.equal(event?.state, "delivered");
  assert.equal(event?.payload.symbol, "300750.SZ");
  const downgraded = parseMonitorEvent({
    ...EVENT_PAYLOAD,
    level: "LATER",
    state: "downgraded",
    digest_at: "2026-11-13T19:00:00",
  });
  assert.equal(downgraded?.state, "downgraded");
  assert.equal(downgraded?.digestAt, "2026-11-13T19:00:00");
});

test("today payload groups events and carries the attention budget", () => {
  const today = parseMonitorToday({
    date: "2026-11-13",
    budget: { date: "2026-11-13", limit: 5, used: 2, downgraded_count: 1 },
    must_know: [EVENT_PAYLOAD],
    later: [{ ...EVENT_PAYLOAD, id: "e-2", state: "new" }],
    archive: [],
    rules: [RULE_PAYLOAD],
  });
  assert.ok(today);
  assert.equal(today?.budget.used, 2);
  assert.equal(today?.budget.downgradedCount, 1);
  assert.equal(today?.mustKnow.length, 1);
  assert.equal(today?.later.length, 1);
  assert.equal(today?.rules.length, 1);
});

test("loadMonitor falls back to an empty ready state on an unexpected payload", async () => {
  const api = {
    token: "monitor-fallback",
    request: async () => ({ unexpected: true }),
  } as unknown as LingWuApi;
  await loadMonitor(api, true);
  assert.equal(monitorSnapshot().status, "ready");
  assert.equal(monitorSnapshot().source, "mock");
  assert.equal(monitorSnapshot().today, undefined);
});

test("monitor tab intent is consumed once", () => {
  requestMonitorTab();
  assert.equal(consumeMonitorTab(), true);
  assert.equal(consumeMonitorTab(), false);
});
