import assert from "node:assert/strict";
import { test } from "node:test";
import {
  daysUntilDate,
  firstLossEvents,
  generateEventCandidates,
  maturityEvents,
  policyDriftEvents,
} from "../apps/server/src/engine/event-sources.ts";
import { buildPart, driftStatus, sliceKey } from "../apps/server/src/engine/policy-drift.ts";
import type { Position } from "../apps/server/src/engine/portfolios.ts";
import type {
  InvestmentPolicy,
  PolicyBasis,
  PolicyDrift,
  PolicyTarget,
} from "../packages/domain/src/investor.ts";

function position(patch: {
  symbol_code: string;
  quantity: number;
  avg_cost: number;
  market_value?: number;
  currency?: "CNY" | "USD" | "HKD";
  maturity_date?: string;
  sector?: string;
  pnl_pct?: number;
  name?: string;
}): Position {
  const { currency, ...rest } = patch;
  return {
    id: `h-${patch.symbol_code}`,
    portfolio_id: "p1",
    market: "CN",
    currency: currency ?? "CNY",
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    cost: patch.quantity * patch.avg_cost,
    ...rest,
  };
}

function policy(basis: PolicyBasis, targets: PolicyTarget[]): InvestmentPolicy {
  return {
    id: "p1",
    owner: "o",
    portfolioId: "p1",
    basis,
    targets,
    note: "按原币市值占比，未做汇率折算",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

test("偏离（市值口径）：按分类算实际占比并对目标给带档位", () => {
  const positions = [
    position({ symbol_code: "600519.SS", quantity: 1, avg_cost: 1500, market_value: 600 }),
    position({
      symbol_code: "019547",
      quantity: 100,
      avg_cost: 1,
      market_value: 400,
      maturity_date: "2027-01-01",
    }),
  ];
  const part = buildPart(
    policy("asset_class", [
      { key: "equity", label: "权益", targetPercent: 50, bandPercent: 5 },
      { key: "bond", label: "固定收益", targetPercent: 50, bandPercent: 5 },
    ]),
    positions,
    "CNY",
    "market",
    "2026-11-23T00:00:00.000Z",
  );
  assert.equal(part.valueBasis, "market");
  assert.equal(part.currency, "CNY");
  const equity = part.rows.find((row) => row.key === "equity");
  const bond = part.rows.find((row) => row.key === "bond");
  assert.equal(equity?.actual, 60);
  assert.equal(equity?.drift, 10);
  assert.equal(equity?.status, "breach");
  assert.equal(bond?.actual, 40);
  assert.equal(bond?.drift, -10);
  // 行按 |偏离| 倒序。
  assert.equal(part.rows[0]?.key, "equity");
});

test("偏离（成本口径）：用成本而非市值，仅对比展示", () => {
  const positions = [
    position({ symbol_code: "A", quantity: 1, avg_cost: 100, market_value: 300 }),
    position({ symbol_code: "B", quantity: 1, avg_cost: 300, market_value: 100 }),
  ];
  const part = buildPart(
    policy("asset_class", [{ key: "equity", label: "权益", targetPercent: 50, bandPercent: 5 }]),
    positions,
    "CNY",
    "cost",
    "2026-11-23T00:00:00.000Z",
  );
  assert.equal(part.valueBasis, "cost");
  // 成本口径下 A、B 都是权益 → 实际 100%，偏离 +50。
  assert.equal(part.rows[0]?.actual, 100);
});

test("分类键：有到期日视为固定收益，否则权益", () => {
  assert.equal(
    sliceKey(position({ symbol_code: "A", quantity: 1, avg_cost: 1 }), "asset_class"),
    "equity",
  );
  assert.equal(
    sliceKey(
      position({ symbol_code: "B", quantity: 1, avg_cost: 1, maturity_date: "2027-01-01" }),
      "asset_class",
    ),
    "bond",
  );
});

test("偏离档位：带内 / 超带 1.5 倍内 / 超出 1.5 倍", () => {
  assert.equal(driftStatus(3, 5), "within");
  assert.equal(driftStatus(6, 5), "warning");
  assert.equal(driftStatus(9, 5), "breach");
  assert.equal(driftStatus(-6, 5), "warning");
});

test("到期事件：按阶段分桶，超窗口的不产出", () => {
  const now = new Date("2026-11-23T02:00:00.000Z");
  const holdings = [
    position({ symbol_code: "D1", quantity: 1, avg_cost: 1, maturity_date: "2026-11-24" }),
    position({ symbol_code: "D7", quantity: 1, avg_cost: 1, maturity_date: "2026-11-28" }),
    position({ symbol_code: "FAR", quantity: 1, avg_cost: 1, maturity_date: "2027-06-01" }),
    position({ symbol_code: "MAT", quantity: 1, avg_cost: 1, maturity_date: "2026-11-20" }),
  ];
  const events = maturityEvents(holdings, now);
  assert.equal(events.length, 3);
  const bySymbol = new Map(events.map((event) => [event.symbol, event]));
  assert.equal(bySymbol.get("D1")?.dedupeBucket, "2026-11-24:D1");
  assert.equal(bySymbol.get("D7")?.dedupeBucket, "2026-11-28:D7");
  assert.equal(bySymbol.get("MAT")?.dedupeBucket, "2026-11-20:matured");
  assert.ok(bySymbol.get("MAT")?.title.includes("已到期"));
});

test("首次亏损：按亏损带分桶，盈利持仓不产出", () => {
  const positions = [
    position({ symbol_code: "L0", quantity: 1, avg_cost: 100, pnl_pct: -3 }),
    position({ symbol_code: "L10", quantity: 1, avg_cost: 100, pnl_pct: -12 }),
    position({ symbol_code: "UP", quantity: 1, avg_cost: 100, pnl_pct: 8 }),
  ];
  const events = firstLossEvents(positions);
  assert.equal(events.length, 2);
  const bySymbol = new Map(events.map((event) => [event.symbol, event]));
  assert.equal(bySymbol.get("L0")?.dedupeBucket, "loss-0");
  assert.equal(bySymbol.get("L10")?.dedupeBucket, "loss-10");
  assert.equal(bySymbol.get("L10")?.magnitudePercent, 12);
});

test("配置偏离事件：只对市值口径的 breach 档产出", () => {
  const drift: PolicyDrift[] = [
    {
      portfolioId: "p1",
      basis: "asset_class",
      valueBasis: "market",
      currency: "CNY",
      note: "市值口径",
      computedAt: "2026-11-23T00:00:00.000Z",
      rows: [
        {
          key: "equity",
          label: "权益",
          target: 50,
          actual: 65,
          drift: 15,
          band: 5,
          status: "breach",
        },
        {
          key: "bond",
          label: "固定收益",
          target: 50,
          actual: 55,
          drift: 5,
          band: 5,
          status: "warning",
        },
      ],
    },
    {
      portfolioId: "p1",
      basis: "asset_class",
      valueBasis: "cost",
      currency: "CNY",
      note: "成本口径",
      computedAt: "2026-11-23T00:00:00.000Z",
      rows: [
        {
          key: "equity",
          label: "权益",
          target: 50,
          actual: 90,
          drift: 40,
          band: 5,
          status: "breach",
        },
      ],
    },
  ];
  const events = policyDriftEvents(policy("asset_class", []), drift);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "policy_drift");
  assert.equal(events[0]?.symbol, "^PORTFOLIO");
  assert.ok(events[0]?.dedupeBucket?.startsWith("CNY:asset_class:equity"));
});

test("generateEventCandidates：合并三类事件源", () => {
  const now = new Date("2026-11-23T02:00:00.000Z");
  const positions = [
    position({ symbol_code: "D1", quantity: 1, avg_cost: 1, maturity_date: "2026-11-24" }),
    position({ symbol_code: "L0", quantity: 1, avg_cost: 100, pnl_pct: -3 }),
  ];
  const events = generateEventCandidates({ now, holdings: positions, positions });
  assert.deepEqual(events.map((event) => event.type).sort(), ["first_loss", "maturity"]);
});

test("daysUntilDate：按 UTC 自然日算天数差", () => {
  const now = new Date("2026-11-23T23:00:00.000Z");
  assert.equal(daysUntilDate("2026-11-25", now), 2);
  assert.equal(daysUntilDate("2026-11-22", now), -1);
  assert.equal(daysUntilDate("not-a-date", now), Number.POSITIVE_INFINITY);
});
