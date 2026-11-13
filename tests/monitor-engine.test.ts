import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createStore, type Store } from "../apps/server/src/db.ts";
import {
  inQuietHours,
  isTradingDay,
  MonitorEngine,
  marketDate,
} from "../apps/server/src/engine/monitor-engine.ts";
import type { MonitorEvent, MonitorRule } from "../packages/domain/src/agent.ts";
import { MarketDataService } from "../packages/integrations/src/market-data.ts";

let db: Store;
const owner = "monitor-owner";
const notified: { title: string; body: string; key: string }[] = [];
let now = new Date("2026-11-12T02:00:00.000Z"); // 周四 10:00 Asia/Shanghai

function engine() {
  return new MonitorEngine(db, new MarketDataService({ akshare: null, onError: () => undefined }), {
    now: () => now,
    notify: async (_owner, title, body, key) => {
      notified.push({ title, body, key });
      return { id: `n-${notified.length}` };
    },
  });
}

before(async () => {
  db = await createStore();
});
after(async () => {
  await db.close();
});

test("trading calendar skips weekends and known holidays", () => {
  assert.equal(isTradingDay("CN", "2026-11-13"), true);
  assert.equal(isTradingDay("CN", "2026-11-14"), false);
  assert.equal(isTradingDay("US", "2026-11-26"), false);
  assert.equal(isTradingDay("HK", "2026-10-19"), false);
  assert.equal(marketDate("US", new Date("2026-11-12T23:30:00.000Z")), "2026-11-12");
});

test("quiet hours handle windows that cross midnight", () => {
  const quiet = { start: "22:00", end: "07:00", time_zone: "Asia/Shanghai" };
  assert.equal(inQuietHours(quiet, new Date("2026-11-12T15:00:00.000Z")), true);
  assert.equal(inQuietHours(quiet, new Date("2026-11-12T02:00:00.000Z")), false);
  assert.equal(inQuietHours(quiet, new Date("2026-11-12T23:00:00.000Z")), false);
});

test("a must-know event consumes budget and produces one in-app delivery", async () => {
  const monitor = engine();
  const rule = await monitor.createRule(owner, {
    name: "宁德时代公告",
    target_type: "symbol",
    target_id: "300750.SZ",
    market: "CN",
    event_kinds: ["ANNOUNCEMENT"],
    level: "MUST_KNOW",
    cooldown_minutes: 240,
    interval_minutes: 5,
    enabled: true,
    channels: ["in_app"],
  });
  const result = await monitor.ingest(owner, {
    rule_id: rule.id,
    kind: "ANNOUNCEMENT",
    title: "宁德时代发布三季度业绩",
    body: "营收同比 +12%",
  });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.state, "delivered");
  assert.equal(result.events[0]?.level, "MUST_KNOW");
  assert.equal(notified.length, 1);
  const budget = await monitor.budget(owner, "2026-11-12");
  assert.equal(budget.used, 1);
});

test("non-trading days archive L2 events without notifying", async () => {
  now = new Date("2026-11-14T02:00:00.000Z"); // 周六
  const monitor = engine();
  const rule = await monitor.createRule(owner, {
    target_type: "symbol",
    target_id: "600519.SH",
    market: "CN",
    event_kinds: ["EARNINGS"],
    level: "MUST_KNOW",
    cooldown_minutes: 0,
    interval_minutes: 5,
    enabled: true,
    channels: ["in_app"],
  });
  const before = notified.length;
  const result = await monitor.ingest(owner, {
    rule_id: rule.id,
    kind: "EARNINGS",
    title: "贵州茅台财报",
  });
  assert.equal(result.events[0]?.state, "archived");
  assert.equal(result.events[0]?.reason, "non_trading_day");
  assert.equal(notified.length, before);
});

test("attention budget downgrades excess must-know events to a 19:00 digest", async () => {
  now = new Date("2026-11-13T06:00:00.000Z");
  const monitor = engine();
  const rule = await monitor.createRule(owner, {
    target_type: "symbol",
    target_id: "AAPL",
    market: "US",
    event_kinds: ["NEWS"],
    level: "MUST_KNOW",
    cooldown_minutes: 0,
    interval_minutes: 5,
    enabled: true,
    channels: ["in_app"],
  });
  await monitor.setBudgetLimit(owner, 1, "2026-11-13");
  const first = await monitor.ingest(owner, {
    rule_id: rule.id,
    kind: "NEWS",
    title: "First",
    dedupe_key: "first",
  });
  const second = await monitor.ingest(owner, {
    rule_id: rule.id,
    kind: "NEWS",
    title: "Second",
    dedupe_key: "second",
  });
  assert.equal(first.events[0]?.state, "delivered");
  assert.equal(second.events[0]?.state, "downgraded");
  assert.equal(second.events[0]?.level, "LATER");
  assert.equal(second.events[0]?.digest_at, "2026-11-13T19:00:00");
  const budget = await monitor.budget(owner, "2026-11-13");
  assert.equal(budget.used, 1);
  assert.equal(budget.downgraded_count, 1);
});

test("cooldown dedupes repeated events and disabled rules stop immediately", async () => {
  now = new Date("2026-11-12T08:00:00.000Z");
  const monitor = engine();
  const rule = await monitor.createRule(owner, {
    target_type: "page",
    target_id: "https://example.com/filing",
    market: "CN",
    event_kinds: ["PAGE_CHANGE"],
    level: "LATER",
    cooldown_minutes: 240,
    interval_minutes: 5,
    enabled: true,
    channels: ["in_app"],
  });
  const input = {
    rule_id: rule.id,
    kind: "PAGE_CHANGE" as const,
    title: "公告页更新",
    dedupe_key: "page-update",
  };
  assert.equal((await monitor.ingest(owner, input)).events.length, 1);
  const repeated = await monitor.ingest(owner, input);
  assert.equal(repeated.events.length, 0);
  assert.deepEqual(repeated.skipped, ["cooldown"]);
  await monitor.updateRule(owner, rule.id, { enabled: false });
  const disabled = await monitor.ingest(owner, { ...input, dedupe_key: "page-update-2" });
  assert.equal(disabled.events.length, 0);
  assert.deepEqual(disabled.skipped, ["disabled"]);
});

test("three consecutive unnecessary dismissals disable the rule", async () => {
  now = new Date("2026-11-16T02:00:00.000Z");
  const monitor = engine();
  const rule = await monitor.createRule(owner, {
    target_type: "symbol",
    target_id: "MSFT",
    market: "US",
    event_kinds: ["RATING_CHANGE"],
    level: "LATER",
    cooldown_minutes: 0,
    interval_minutes: 5,
    enabled: true,
    channels: ["in_app"],
  });
  const events: MonitorEvent[] = [];
  for (let index = 0; index < 3; index++) {
    now = new Date(`2026-11-16T0${index + 2}:00:00.000Z`);
    const result = await monitor.ingest(owner, {
      rule_id: rule.id,
      kind: "RATING_CHANGE",
      title: `评级调整 ${index}`,
      dedupe_key: `rating-${index}`,
    });
    const event = result.events[0];
    if (event) events.push(event);
  }
  let latestRule: MonitorRule | undefined;
  for (const event of events) latestRule = (await monitor.dismiss(owner, event.id)).rule;
  assert.equal(latestRule?.enabled, false);
  assert.equal(latestRule?.disabled_reason, "repeated_unnecessary");
  const today = await monitor.today(owner);
  assert.equal(today.must_know.length, 0);
});
