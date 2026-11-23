import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import {
  deriveTrackingPlan,
  TrackingPlanService,
} from "../apps/server/src/engine/tracking-plan.ts";
import type { InvestmentNote, ResearchReport } from "../packages/domain/src/agent.ts";

function report(patch: Partial<ResearchReport["sections"]> = {}): ResearchReport {
  return {
    id: "report-1",
    user_id: "owner",
    symbol_code: "300750.SZ",
    title: "宁德时代 深度研究",
    sections: {
      company_overview: "宁德时代（300750.SZ）在 A 股市场交易，属于电池行业。",
      financials: {
        price: 180,
        currency: "CNY",
        fiftyTwoWeekLow: 150,
        fiftyTwoWeekHigh: 260,
        unavailable: ["marketCap", "peRatio"],
      },
      news: [],
      peer_comparison: [],
      valuation: {
        method: "range_heuristic",
        current: 180,
        low: 150,
        mid: 205,
        high: 260,
        assumptions: ["区间取自 52 周最低/最高价，未使用 DCF。"],
      },
      risks: ["行情为延迟数据。"],
      ...patch,
    },
    generated_at: "2026-11-20T00:00:00.000Z",
  };
}

test("跟踪计划：从研报派生假设、指标、催化剂与价格上下沿", () => {
  const plan = deriveTrackingPlan(report(), { now: new Date("2026-11-23T00:00:00.000Z") });
  assert.equal(plan.status, "draft");
  assert.equal(plan.symbol, "300750.SZ");
  assert.ok(plan.items.some((item) => item.kind === "valuation" && item.text.includes("150")));
  assert.ok(plan.items.some((item) => item.kind === "assumption" && item.confidence === "derived"));
  assert.ok(plan.items.some((item) => item.kind === "metric" && item.text.includes("52 周区间")));
  // 财报日没有数据源，必须是占位，不能伪装成结论。
  assert.ok(
    plan.items.some((item) => item.kind === "catalyst" && item.confidence === "placeholder"),
  );
  assert.deepEqual(
    plan.suggestedMonitors.map((monitor) => [monitor.condition, monitor.value]),
    [
      ["price_below", "150"],
      ["price_above", "260"],
    ],
  );
  assert.ok(plan.thesisDraft.includes("估值区间"));
  assert.ok(plan.caveats.some((caveat) => caveat.includes("财报日")));
});

test("跟踪计划：缺估值区间时不派生价格提醒，并说明原因", () => {
  const plan = deriveTrackingPlan(report({ valuation: { method: "unknown" } }), {
    now: new Date("2026-11-23T00:00:00.000Z"),
  });
  assert.equal(plan.suggestedMonitors.length, 0);
  assert.ok(
    plan.items.some((item) => item.kind === "valuation" && item.confidence === "placeholder"),
  );
  assert.ok(plan.caveats.some((caveat) => caveat.includes("估值区间缺失")));
});

test("跟踪计划服务：落地创建价格提醒与论点，并给论点绑定跟踪信号", async () => {
  const db = await createStore();
  try {
    const owner = "owner-plan";
    const alerts: Array<{ threshold_type: string; threshold_value: number }> = [];
    const service = new TrackingPlanService({
      db,
      now: () => new Date("2026-11-23T00:00:00.000Z"),
      createAlert: async (_owner, input) => {
        alerts.push({
          threshold_type: input.threshold_type,
          threshold_value: input.threshold_value,
        });
        return { id: `alert-${alerts.length}` };
      },
      createThesis: async (o, input) => {
        const note: InvestmentNote = {
          id: "note-1",
          user_id: o,
          symbol_code: input.symbol_code,
          type: "THESIS",
          title: input.title,
          content: input.content,
          status: "ACTIVE",
          created_at: "2026-11-23T00:00:00.000Z",
          updated_at: "2026-11-23T00:00:00.000Z",
        };
        await db.put(o, "notes", note);
        return note;
      },
    });

    const plan = await service.derive(owner, report());
    assert.equal(plan.status, "draft");

    const active = await service.materialize(owner, plan.id);
    assert.equal(active.status, "active");
    assert.deepEqual(active.materialized?.alertIds, ["alert-1", "alert-2"]);
    assert.deepEqual(active.materialized?.noteIds, ["note-1"]);
    assert.deepEqual(
      alerts.map((alert) => alert.threshold_type),
      ["PRICE_BELOW", "PRICE_ABOVE"],
    );

    const note = await db.get<InvestmentNote>(owner, "notes", "note-1");
    assert.equal(note?.evidence?.length, 1);
    assert.equal(note?.evidence?.[0].kind, "price");
    if (note?.evidence?.[0].kind === "price") {
      assert.equal(note.evidence[0].value, 150);
      assert.equal(note.evidence[0].onBreach, "threat");
    }

    // 再次落地是幂等的，不会重复创建提醒。
    const again = await service.materialize(owner, plan.id);
    assert.equal(again.materialized?.alertIds.length, 2);
    assert.equal(alerts.length, 2);
  } finally {
    await db.close();
  }
});

test("跟踪计划服务：落地后回写审计回调，带上真正的提醒与论点 id", async () => {
  const db = await createStore();
  try {
    const owner = "owner-plan-audit";
    const audited: Array<{ symbol: string; alertIds: string[]; noteIds: string[] }> = [];
    const service = new TrackingPlanService({
      db,
      now: () => new Date("2026-11-23T00:00:00.000Z"),
      createAlert: async () => ({ id: `alert-${audited.length}` }),
      createThesis: async (o, input) => {
        const note: InvestmentNote = {
          id: "note-1",
          user_id: o,
          symbol_code: input.symbol_code,
          type: "THESIS",
          title: input.title,
          content: input.content,
          status: "ACTIVE",
          created_at: "2026-11-23T00:00:00.000Z",
          updated_at: "2026-11-23T00:00:00.000Z",
        };
        await db.put(o, "notes", note);
        return note;
      },
      audit: (_owner, input) => {
        audited.push({
          symbol: input.plan.symbol,
          alertIds: input.alertIds,
          noteIds: input.noteIds,
        });
      },
    });

    const plan = await service.derive(owner, report());
    await service.materialize(owner, plan.id);
    assert.equal(audited.length, 1);
    assert.equal(audited[0].symbol, plan.symbol);
    assert.deepEqual(audited[0].alertIds, ["alert-0", "alert-0"]);
    assert.deepEqual(audited[0].noteIds, ["note-1"]);

    // 审计写失败不能把已经落地的计划弄坏。
    const broken = new TrackingPlanService({
      db,
      now: () => new Date("2026-11-23T00:00:00.000Z"),
      createAlert: async () => ({ id: "a1" }),
      createThesis: async (o, input) => {
        const note: InvestmentNote = {
          id: "note-2",
          user_id: o,
          symbol_code: input.symbol_code,
          type: "THESIS",
          title: input.title,
          content: input.content,
          status: "ACTIVE",
          created_at: "2026-11-23T00:00:00.000Z",
          updated_at: "2026-11-23T00:00:00.000Z",
        };
        await db.put(o, "notes", note);
        return note;
      },
      audit: () => {
        throw new Error("audit store down");
      },
    });
    const noValuation = report();
    const solo = await broken.derive(`${owner}-b`, {
      ...noValuation,
      id: "r2",
      title: "宁德时代 深度研究",
    });
    const done = await broken.materialize(`${owner}-b`, solo.id);
    assert.equal(done.status, "active");
  } finally {
    await db.close();
  }
});

test("跟踪计划服务：重新派生不覆盖已落地的计划", async () => {
  const db = await createStore();
  try {
    const owner = "owner-plan-2";
    const service = new TrackingPlanService({
      db,
      now: () => new Date("2026-11-23T00:00:00.000Z"),
      createAlert: async () => ({ id: "a1" }),
      createThesis: async (o, input) => {
        const note: InvestmentNote = {
          id: "note-1",
          user_id: o,
          symbol_code: input.symbol_code,
          type: "THESIS",
          content: input.content,
          status: "ACTIVE",
          created_at: "2026-11-23T00:00:00.000Z",
          updated_at: "2026-11-23T00:00:00.000Z",
        };
        await db.put(o, "notes", note);
        return note;
      },
    });
    const plan = await service.derive(owner, report());
    await service.materialize(owner, plan.id);
    const rederived = await service.derive(owner, report());
    assert.equal(rederived.status, "active");
    assert.ok(rederived.materialized);
  } finally {
    await db.close();
  }
});
