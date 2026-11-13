import assert from "node:assert/strict";
import test from "node:test";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { DeliveryService } from "../apps/server/src/delivery/index.ts";
import {
  BUDGET_KIND,
  EVENT_KIND,
  MonitorService,
  RULE_KIND,
} from "../apps/server/src/engine/monitor-engine.ts";
import { isTradingDay } from "../packages/domain/src/market-calendar.ts";
import {
  type MarketDataProvider,
  MarketDataService,
  type Quote,
  resolveMarket,
} from "../packages/integrations/src/market-data.ts";

const TRADING = new Date("2026-11-13T02:00:00.000Z");
const DIGEST = new Date("2026-11-13T11:00:00.000Z");
const LATE = new Date("2026-11-13T12:00:00.000Z");
const QUIET = new Date("2026-11-13T15:00:00.000Z");
const WEEKEND = new Date("2026-11-14T12:00:00.000Z");

const prices: Record<string, number> = { AAPL: 200, MSFT: 200, "600519.SS": 1800 };

function quoteFor(symbol: string): Quote {
  const price = prices[symbol] ?? 100;
  const previousClose = 100;
  return {
    symbol,
    market: resolveMarket(symbol),
    price,
    previousClose,
    change: price - previousClose,
    changePercent: ((price - previousClose) / previousClose) * 100,
    dayHigh: price,
    dayLow: previousClose,
    volume: 1_000_000,
    asOf: "2026-11-13T12:00:00.000Z",
    source: "yahoo",
  };
}

const provider: MarketDataProvider = {
  id: "yahoo",
  supports: () => true,
  getQuote: async (symbol) => quoteFor(symbol),
  searchSymbols: async () => [],
  getIndexData: async () => [],
};

function makeMarket(): MarketDataService {
  return new MarketDataService({ yahoo: provider, akshare: null, onError: () => undefined });
}

function unconfiguredDelivery(db: Store): DeliveryService {
  const adapter = (channel: "apns" | "fcm") => ({
    channel,
    providerId: "test",
    configured: () => false,
    send: async () => ({}),
  });
  return new DeliveryService(db, [adapter("apns"), adapter("fcm")]);
}

async function withService(
  run: (service: MonitorService, db: Store, notified: string[]) => Promise<void>,
  options: { holdings?: (owner: string, id: string) => Promise<{ symbol_code: string }[]> } = {},
) {
  const db = await createStore();
  const notified: string[] = [];
  const service = new MonitorService({
    db,
    market: makeMarket(),
    delivery: unconfiguredDelivery(db),
    ...(options.holdings ? { holdings: options.holdings } : {}),
    notify: async (_owner, title, _body, key) => void notified.push(`${key}:${title}`),
    now: () => TRADING,
  });
  try {
    await run(service, db, notified);
  } finally {
    await db.close();
  }
}

test("legacy rules without new fields keep working with defaults", async () => {
  await withService(async (service, db) => {
    await db.put("alice", RULE_KIND, {
      id: "legacy",
      ownerId: "alice",
      targetType: "symbol",
      targetId: "AAPL",
      eventKinds: ["PRICE_ABOVE"],
      thresholds: { priceAbove: 190 },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nextCheckAt: "2026-01-01T00:00:00.000Z",
    });
    const [rule] = await service.listRules("alice");
    assert.equal(rule?.market, "US");
    assert.equal(rule?.level, "ARCHIVE");
    assert.equal(rule?.cooldownMinutes, 240);
    assert.equal(rule?.intervalMinutes, 5);
    assert.deepEqual(rule?.quietHours, { startHour: 22, endHour: 7 });

    const result = await service.tick("alice", { now: TRADING, force: true });
    assert.equal(result.created, 1);
    assert.equal(result.events[0]?.state, "archived");
    assert.equal(result.events[0]?.level, "ARCHIVE");
    assert.equal(result.events[0]?.layer, "L1");
  });
});

test("L1 price events deliver once and consume the daily budget", async () => {
  await withService(async (service, _db, notified) => {
    await service.createRule("alice", {
      targetType: "symbol",
      targetId: "AAPL",
      eventKinds: ["PRICE_ABOVE"],
      thresholds: { priceAbove: 190 },
      level: "MUST_KNOW",
      quietHours: null,
    });
    const result = await service.tick("alice", { now: TRADING, force: true });
    assert.equal(result.created, 1);
    assert.equal(result.events[0]?.state, "delivered");
    assert.equal(result.events[0]?.kind, "PRICE_ABOVE");
    const budget = await service.budget("alice", TRADING);
    assert.equal(budget.used, 1);
    assert.ok(notified.some((entry) => entry.startsWith("monitor-event:")));
  });
});

test("same rule, kind and symbol coalesce inside the cooldown window", async () => {
  await withService(async (service, _db, notified) => {
    await service.createRule("alice", {
      targetType: "symbol",
      targetId: "AAPL",
      eventKinds: ["PRICE_ABOVE"],
      thresholds: { priceAbove: 190 },
      level: "MUST_KNOW",
      quietHours: null,
    });
    await service.tick("alice", { now: TRADING, force: true });
    const later = new Date(TRADING.getTime() + 30 * 60_000);
    await service.tick("alice", { now: later, force: true });
    const events = await service.listEvents("alice");
    assert.equal(events.length, 1);
    assert.equal(events[0]?.occurrences, 2);
    assert.equal(notified.filter((entry) => entry.startsWith("monitor-event:")).length, 1);
    assert.equal((await service.budget("alice", TRADING)).used, 1);
  });
});

test("quiet hours defer L1 events but MUST_KNOW L2 can penetrate", async () => {
  await withService(async (service, _db, notified) => {
    await service.createRule("alice", {
      targetType: "symbol",
      targetId: "AAPL",
      eventKinds: ["PRICE_ABOVE"],
      thresholds: { priceAbove: 190 },
    });
    const quietResult = await service.tick("alice", { now: QUIET, force: true });
    assert.equal(quietResult.events[0]?.state, "archived");
    assert.equal(quietResult.events[0]?.downgradedReason, "quiet_hours");
    assert.equal(notified.length, 0);

    const rule = await service.createRule("alice", {
      targetType: "symbol",
      targetId: "AAPL",
      eventKinds: ["ANNOUNCEMENT"],
      level: "MUST_KNOW",
    });
    const ingested = await service.ingestEvent(
      "alice",
      { ruleId: rule.id, kind: "ANNOUNCEMENT", severity: "high", payload: { title: "回购公告" } },
      QUIET,
    );
    assert.equal(ingested.action, "delivered");
    assert.equal(ingested.event.state, "delivered");
  });
});

test("ARCHIVE and LATER stay in Today without notifications or delivery", async () => {
  await withService(async (service, db, notified) => {
    await service.createRule("alice", {
      targetType: "symbol",
      targetId: "AAPL",
      eventKinds: ["PRICE_ABOVE"],
      thresholds: { priceAbove: 190 },
      quietHours: null,
    });
    await service.createRule("alice", {
      targetType: "symbol",
      targetId: "MSFT",
      eventKinds: ["PRICE_ABOVE"],
      thresholds: { priceAbove: 190 },
      level: "LATER",
      quietHours: null,
    });
    const result = await service.tick("alice", { now: TRADING, force: true });
    const archive = result.events.find((event) => event.payload.symbol === "AAPL");
    const later = result.events.find((event) => event.payload.symbol === "MSFT");
    assert.equal(archive?.level, "ARCHIVE");
    assert.equal(archive?.state, "archived");
    assert.equal(later?.level, "LATER");
    assert.equal(later?.state, "new");
    assert.equal(notified.length, 0);
    assert.equal((await db.list("alice", "delivery_logs")).length, 0);
    assert.equal((await service.budget("alice", TRADING)).used, 0);
    const today = await service.today("alice", TRADING);
    assert.equal(today.events.ARCHIVE.length, 1);
    assert.equal(today.events.LATER.length, 1);
  });
});

test("explicit quietHours null disables quiet hours while omission keeps the default", async () => {
  await withService(async (service, _db, notified) => {
    await service.createRule("alice", {
      targetType: "symbol",
      targetId: "AAPL",
      eventKinds: ["PRICE_ABOVE"],
      thresholds: { priceAbove: 190 },
      level: "MUST_KNOW",
      quietHours: null,
    });
    await service.createRule("alice", {
      targetType: "symbol",
      targetId: "MSFT",
      eventKinds: ["PRICE_ABOVE"],
      thresholds: { priceAbove: 190 },
      level: "MUST_KNOW",
    });
    const result = await service.tick("alice", { now: QUIET, force: true });
    const open = result.events.find((event) => event.payload.symbol === "AAPL");
    const quiet = result.events.find((event) => event.payload.symbol === "MSFT");
    assert.equal(open?.state, "delivered");
    assert.equal(quiet?.state, "archived");
    assert.equal(quiet?.downgradedReason, "quiet_hours");
    assert.equal(notified.filter((entry) => entry.startsWith("monitor-event:")).length, 1);
  });
});

test("portfolio rules follow each holding's own trading calendar", async () => {
  const holdings = async () => [{ symbol_code: "600519.SS" }];
  await withService(
    async (service) => {
      await service.createRule("alice", {
        targetType: "portfolio",
        targetId: "p1",
        eventKinds: ["PRICE_ABOVE"],
        thresholds: { priceAbove: 1000 },
        level: "MUST_KNOW",
        quietHours: null,
      });
      const now = new Date("2026-11-26T15:00:00.000Z");
      assert.equal(isTradingDay("CN", "2026-11-26"), true);
      assert.equal(isTradingDay("US", "2026-11-26"), false);
      const result = await service.tick("alice", { now, force: true });
      assert.equal(result.created, 1);
      assert.equal(result.events[0]?.market, "CN");
      assert.equal(result.events[0]?.marketDate, "2026-11-26");
      assert.equal(result.events[0]?.state, "delivered");
    },
    { holdings },
  );
});

test("non-trading days produce no L1/L2 deliveries", async () => {
  await withService(async (service, _db, notified) => {
    await service.createRule("alice", {
      targetType: "symbol",
      targetId: "AAPL",
      eventKinds: ["PRICE_ABOVE"],
      thresholds: { priceAbove: 190 },
      level: "MUST_KNOW",
      quietHours: null,
    });
    const l2 = await service.createRule("alice", {
      targetType: "symbol",
      targetId: "AAPL",
      eventKinds: ["ANNOUNCEMENT"],
      level: "MUST_KNOW",
    });
    const result = await service.tick("alice", { now: WEEKEND, force: true });
    assert.equal(result.created, 0);
    const ingested = await service.ingestEvent(
      "alice",
      { ruleId: l2.id, kind: "ANNOUNCEMENT", severity: "medium", payload: {} },
      WEEKEND,
    );
    assert.equal(ingested.event.state, "archived");
    assert.equal(ingested.event.downgradedReason, "non_trading_day");
    assert.equal(notified.length, 0);
  });
});

test("budget overflow downgrades to one 19:00 digest that counts as one delivery", async () => {
  await withService(async (service, db) => {
    await service.setBudgetLimit("alice", 1, TRADING);
    for (const symbol of ["AAPL", "MSFT"]) {
      prices[symbol] = 200;
      await service.createRule("alice", {
        targetType: "symbol",
        targetId: symbol,
        eventKinds: ["PRICE_ABOVE"],
        thresholds: { priceAbove: 190 },
        level: "MUST_KNOW",
        quietHours: null,
      });
    }
    const result = await service.tick("alice", { now: TRADING, force: true });
    assert.equal(result.events.filter((event) => event.state === "delivered").length, 1);
    const downgraded = result.events.find((event) => event.state === "archived");
    assert.equal(downgraded?.downgradedReason, "budget");

    const digest = await service.runDigest("alice", DIGEST);
    assert.ok(digest);
    assert.equal(digest?.kind, "DIGEST");
    assert.equal(digest?.state, "delivered");
    const budget = await service.budget("alice", TRADING);
    assert.equal(budget.limit, 1);
    assert.equal(budget.downgradedCount, 1);
    assert.equal(budget.used, 2);

    const logs = await db.list<{ channel: string; result: string; reason?: string }>(
      "alice",
      "delivery_logs",
    );
    const digestLogs = logs.filter(
      (log) => log.result === "skipped" && log.reason === "not_configured",
    );
    assert.equal(digestLogs.length, 4);
    assert.deepEqual(await service.runDigest("alice", DIGEST), digest);
  });
});

test("budget downgrades after 19:00 roll into the next day's digest", async () => {
  await withService(async (service) => {
    await service.setBudgetLimit("alice", 1, LATE);
    for (const symbol of ["AAPL", "MSFT"]) {
      await service.createRule("alice", {
        targetType: "symbol",
        targetId: symbol,
        eventKinds: ["PRICE_ABOVE"],
        thresholds: { priceAbove: 190 },
        level: "MUST_KNOW",
        quietHours: null,
      });
    }
    const result = await service.tick("alice", { now: LATE, force: true });
    const downgraded = result.events.find((event) => event.downgradedReason === "budget");
    assert.equal(downgraded?.digestDate, "2026-11-14");
    assert.equal(await service.runDigest("alice", LATE), null);

    const next = await service.runDigest("alice", new Date("2026-11-14T11:00:00.000Z"));
    assert.ok(next);
    assert.equal(next?.kind, "DIGEST");
    assert.equal(next?.occurrences, 1);
  });
});

test("three consecutive unnecessary dismissals slow the rule down", async () => {
  await withService(async (service, _db, notified) => {
    const rule = await service.createRule("alice", {
      targetType: "symbol",
      targetId: "AAPL",
      eventKinds: ["ANNOUNCEMENT", "EARNINGS", "DIVIDEND"],
      level: "MUST_KNOW",
      quietHours: null,
    });
    const kinds = ["ANNOUNCEMENT", "EARNINGS", "DIVIDEND"] as const;
    for (const kind of kinds) {
      const result = await service.ingestEvent(
        "alice",
        { ruleId: rule.id, kind, severity: "low", payload: {} },
        TRADING,
      );
      await service.dismissEvent("alice", result.event.id, "unnecessary", TRADING);
    }
    const [updated] = await service.listRules("alice");
    assert.equal(updated?.cooldownMinutes, 480);
    assert.ok(notified.some((entry) => entry.startsWith("monitor-rule-downrank:")));
  });
});

test("pausing a rule takes effect on the next tick", async () => {
  await withService(async (service) => {
    const rule = await service.createRule("alice", {
      targetType: "symbol",
      targetId: "AAPL",
      eventKinds: ["PRICE_ABOVE"],
      thresholds: { priceAbove: 190 },
      level: "MUST_KNOW",
      quietHours: null,
    });
    await service.pauseRule("alice", rule.id);
    const result = await service.tick("alice", { now: TRADING, force: true });
    assert.equal(result.created, 0);
    assert.equal(result.checked, 0);
    assert.equal((await service.listEvents("alice")).length, 0);
  });
});

test("budget records are per owner and per local date", async () => {
  await withService(async (service, db) => {
    await service.setBudgetLimit("alice", 2, TRADING);
    const budget = await service.budget("alice", TRADING);
    assert.equal(budget.id, "alice:2026-11-13");
    assert.equal(budget.limit, 2);
    await db.put("alice", BUDGET_KIND, { ...budget, used: 2 });
    assert.equal((await service.budget("alice", new Date("2026-11-14T12:00:00Z"))).used, 0);
    assert.equal((await service.listEvents("alice", { date: "2026-11-14" })).length, 0);
    assert.equal(EVENT_KIND, "monitor_events");
  });
});
