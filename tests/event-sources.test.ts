import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import { EventSourcesService, maturityBucket } from "../apps/server/src/engine/event-sources.ts";
import type { Holding } from "../packages/domain/src/agent.ts";
import type { PolicyDrift } from "../packages/domain/src/investor.ts";

function holding(symbol: string, maturityDate?: string): Holding {
  return {
    id: `h-${symbol}`,
    portfolio_id: "p1",
    symbol_code: symbol,
    market: "CN",
    currency: "CNY",
    quantity: 10,
    avg_cost: 100,
    name: symbol,
    ...(maturityDate ? { maturity_date: maturityDate } : {}),
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  } as Holding;
}

test("到期档位：取最小的、仍 ≥ 剩余天数的档", () => {
  assert.equal(maturityBucket(0), 1);
  assert.equal(maturityBucket(2), 3);
  assert.equal(maturityBucket(5), 7);
  assert.equal(maturityBucket(20), 30);
  assert.equal(maturityBucket(31), undefined);
});

test("到期事件：30 天内按档产出，去重键含天数档", () => {
  const service = new EventSourcesService({} as never);
  const now = new Date("2026-11-23T00:00:00.000Z");

  const [seven] = service.maturityEvents("owner", [holding("019547.SH", "2026-11-30")], now);
  assert.ok(seven);
  assert.equal(seven.candidate.type, "maturity");
  assert.equal(seven.candidate.daysUntil, 7);
  assert.equal(seven.candidate.dedupeKey, "maturity:019547.SH:d7");
  assert.ok(seven.candidate.body.includes("不提供买卖建议"));

  // 时间推进到剩 3 天：档位变化 → 去重键变化，可再推一次。
  const later = new Date("2026-11-27T00:00:00.000Z");
  const [three] = service.maturityEvents("owner", [holding("019547.SH", "2026-11-30")], later);
  assert.equal(three?.candidate.daysUntil, 3);
  assert.equal(three?.candidate.dedupeKey, "maturity:019547.SH:d3");
});

test("到期事件：无到期日 / 已过期 / 超过 30 天都不产出", () => {
  const service = new EventSourcesService({} as never);
  const now = new Date("2026-11-23T00:00:00.000Z");
  assert.deepEqual(service.maturityEvents("owner", [holding("600519.SS")], now), []);
  assert.deepEqual(service.maturityEvents("owner", [holding("019547.SH", "2026-11-01")], now), []);
  assert.deepEqual(service.maturityEvents("owner", [holding("019547.SH", "2027-06-01")], now), []);
});

test("首次亏损：只在从未亏到首次亏的跃迁产出，回落后可再次触发", async () => {
  const db = await createStore();
  try {
    const owner = "owner-first-loss";
    const service = new EventSourcesService(db);
    const now = new Date("2026-11-23T00:00:00.000Z");

    const first = await service.firstLossEvents(
      owner,
      [{ symbol: "600519.SS", name: "贵州茅台", avgCost: 200, price: 150 }],
      now,
    );
    assert.equal(first.length, 1);
    assert.equal(first[0]?.candidate.dedupeKey, "first_loss:600519.SS:d1");
    assert.equal(first[0]?.candidate.magnitudePercent, 25);

    // 仍在成本下方：不再重复推。
    const repeated = await service.firstLossEvents(
      owner,
      [{ symbol: "600519.SS", avgCost: 200, price: 140 }],
      now,
    );
    assert.equal(repeated.length, 0);

    // 回到成本上方：重新武装但不产出。
    const recovered = await service.firstLossEvents(
      owner,
      [{ symbol: "600519.SS", avgCost: 200, price: 260 }],
      now,
    );
    assert.equal(recovered.length, 0);

    // 再次跌破：第二次首次亏损，去重键递增。
    const again = await service.firstLossEvents(
      owner,
      [{ symbol: "600519.SS", avgCost: 200, price: 150 }],
      now,
    );
    assert.equal(again.length, 1);
    assert.equal(again[0]?.candidate.dedupeKey, "first_loss:600519.SS:d2");
  } finally {
    await db.close();
  }
});

test("首次亏损：缺现价或成本时绝不产出（不用 0 假设）", async () => {
  const db = await createStore();
  try {
    const owner = "owner-first-loss-missing";
    const service = new EventSourcesService(db);
    assert.deepEqual(
      await service.firstLossEvents(owner, [{ symbol: "AAPL", avgCost: 0, price: 100 }]),
      [],
    );
    assert.deepEqual(
      await service.firstLossEvents(owner, [{ symbol: "AAPL", avgCost: 100, price: 0 }]),
      [],
    );
    assert.deepEqual(
      await service.firstLossEvents(owner, [{ symbol: "AAPL", avgCost: 100, price: Number.NaN }]),
      [],
    );
  } finally {
    await db.close();
  }
});

function drift(patch: Partial<PolicyDrift> = {}): PolicyDrift {
  return {
    portfolioId: "portfolio-1",
    basis: "sector",
    valueBasis: "market",
    rows: [
      { key: "白酒", label: "白酒", target: 50, actual: 80, drift: 30, status: "breach" },
      { key: "银行", label: "银行", target: 50, actual: 20, drift: -30, status: "breach" },
    ],
    computedAt: "2026-11-23T00:00:00.000Z",
    ...patch,
  };
}

test("配置偏离事件：只认市值口径的 breach，成本口径绝不触发", () => {
  const service = new EventSourcesService({} as never);
  const events = service.policyDriftEvents([drift()]);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.candidate.type, "policy_drift");
  assert.equal(events[0]?.candidate.symbol, "portfolio-1");
  assert.equal(events[0]?.candidate.dedupeKey, "policy_drift:portfolio-1:sector:ALL");

  // 成本口径只展示，不产生事件。
  assert.deepEqual(service.policyDriftEvents([drift({ valueBasis: "cost" })]), []);

  // 没有越界行不产生事件。
  assert.deepEqual(
    service.policyDriftEvents([
      drift({
        rows: [{ key: "白酒", label: "白酒", target: 50, actual: 52, drift: 2, status: "within" }],
      }),
    ]),
    [],
  );
});
