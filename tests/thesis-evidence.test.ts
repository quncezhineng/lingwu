import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import {
  judgeSignal,
  judgeThesis,
  ThesisEvidenceService,
} from "../apps/server/src/engine/thesis-evidence.ts";
import type { InvestmentNote } from "../packages/domain/src/agent.ts";
import type { Quote } from "../packages/integrations/src/market-data.ts";

const quote = (price: number, changePercent = 0) =>
  ({ price, changePercent, change: 0, market: "CN", asOf: "", source: "test" }) as unknown as Quote;

function note(patch: Partial<InvestmentNote> = {}): InvestmentNote {
  return {
    id: "note-1",
    user_id: "owner",
    symbol_code: "300750.SZ",
    type: "THESIS",
    content: "储能出货超预期，长期持有",
    status: "ACTIVE",
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    ...patch,
  };
}

test("信号判定：价格在阈值之上分成立 / 受威胁 / 破坏三档", () => {
  const signal = { kind: "price", direction: "above", value: 100 } as const;
  assert.equal(judgeSignal(signal, { price: 120 }).state, "holds");
  assert.equal(judgeSignal(signal, { price: 102 }).state, "at_risk");
  assert.equal(judgeSignal(signal, { price: 90 }).state, "broken");
  assert.equal(judgeSignal(signal, { price: 102 }).state, "at_risk");
});

test("信号判定：threat 级破坏只算受威胁，不直接判死", () => {
  const result = judgeSignal(
    { kind: "price", direction: "above", value: 100, onBreach: "threat" },
    { price: 80 },
  );
  assert.equal(result.state, "at_risk");
  assert.ok(result.detail.includes("跟踪信号走弱"));
});

test("信号判定：缺数据一律 unknown，不猜结论", () => {
  assert.equal(judgeSignal({ kind: "price", direction: "above", value: 100 }, {}).state, "unknown");
  assert.equal(judgeSignal({ kind: "change_pct", direction: "up", value: 3 }, {}).state, "unknown");
  assert.equal(
    judgeSignal({ kind: "keyword", keywords: ["爆雷"], expect: "absent" }, {}).state,
    "unknown",
  );
  assert.equal(
    judgeSignal({ kind: "financial", field: "roe", operator: ">=", value: 15 }, {}).state,
    "unknown",
  );
});

test("信号判定：关键词出现与否按预期方向判定", () => {
  const headlines = ["宁德时代发布新产品", "行业景气度回升"];
  assert.equal(
    judgeSignal({ kind: "keyword", keywords: ["爆雷"], expect: "absent" }, { headlines }).state,
    "holds",
  );
  assert.equal(
    judgeSignal({ kind: "keyword", keywords: ["爆雷"], expect: "present" }, { headlines }).state,
    "broken",
  );
  assert.equal(
    judgeSignal({ kind: "keyword", keywords: ["新产品"], expect: "present" }, { headlines }).state,
    "holds",
  );
});

test("信号判定：财务字段按阈值与容差判定", () => {
  assert.equal(
    judgeSignal(
      { kind: "financial", field: "roe", operator: ">=", value: 15 },
      { financials: { roe: 18 } },
    ).state,
    "holds",
  );
  assert.equal(
    judgeSignal(
      { kind: "financial", field: "roe", operator: ">=", value: 15 },
      { financials: { roe: 14 } },
    ).state,
    "at_risk",
  );
  assert.equal(
    judgeSignal(
      { kind: "financial", field: "roe", operator: ">=", value: 15 },
      { financials: { roe: 9 } },
    ).state,
    "broken",
  );
});

test("聚合判定：全部成立为 valid，受威胁为 inconclusive，破坏为 invalid", () => {
  const signals = [
    { kind: "price", direction: "above", value: 100 },
    { kind: "change_pct", direction: "up", value: 2 },
  ] as const;
  assert.equal(judgeThesis(signals, { price: 130, changePercent: 4 }).outcome, "valid");
  assert.equal(judgeThesis(signals, { price: 101, changePercent: 4 }).outcome, "inconclusive");
  assert.equal(judgeThesis(signals, { price: 80, changePercent: 4 }).outcome, "invalid");
});

test("聚合判定：没有绑定信号时明确要求先绑定，不伪造结论", () => {
  const verdict = judgeThesis([], { price: 100 });
  assert.equal(verdict.outcome, "pending_confirmation");
  assert.ok(verdict.summary.includes("尚未绑定可观测信号"));
});

test("聚合判定：部分信号缺数据时给出 pending 并列出缺什么", () => {
  const verdict = judgeThesis(
    [
      { kind: "price", direction: "above", value: 100 },
      { kind: "financial", field: "roe", operator: ">=", value: 15 },
    ],
    { price: 130 },
  );
  assert.equal(verdict.outcome, "pending_confirmation");
  assert.equal(verdict.missing.length, 1);
  assert.ok(verdict.missing[0].includes("roe"));
});

test("证据服务：自动判定破坏后写回不成立，并留判定依据", async () => {
  const db = await createStore();
  try {
    const owner = "owner-thesis";
    const stored = note({
      evidence: [{ kind: "price", direction: "above", value: 200 }],
    });
    await db.put(owner, "notes", stored);
    const service = new ThesisEvidenceService({
      db,
      market: { getQuote: async () => quote(150, -3) } as never,
    });
    const check = await service.check(owner, stored, new Date("2026-11-23T00:00:00.000Z"));
    assert.ok(check);
    assert.equal(check?.outcome, "invalid");
    const updated = await db.get<InvestmentNote>(owner, "notes", stored.id);
    assert.equal(updated?.status, "INVALIDATED");
    assert.equal(updated?.check?.source, "automated");
    assert.ok(updated?.check?.reasons?.length);
  } finally {
    await db.close();
  }
});

test("证据服务：受威胁时不改状态，只标记待复核", async () => {
  const db = await createStore();
  try {
    const owner = "owner-thesis-2";
    const stored = note({
      evidence: [{ kind: "price", direction: "above", value: 200, onBreach: "threat" }],
    });
    await db.put(owner, "notes", stored);
    const service = new ThesisEvidenceService({
      db,
      market: { getQuote: async () => quote(180) } as never,
    });
    const check = await service.check(owner, stored);
    assert.equal(check?.outcome, "inconclusive");
    const updated = await db.get<InvestmentNote>(owner, "notes", stored.id);
    assert.equal(updated?.status, "ACTIVE");
  } finally {
    await db.close();
  }
});

test("证据服务：用户手动确认的论点不被自动判定覆盖", async () => {
  const db = await createStore();
  try {
    const owner = "owner-thesis-3";
    const stored = note({
      status: "VALIDATED",
      check: { outcome: "valid", source: "manual", checked_at: "2026-11-20T00:00:00.000Z" },
      evidence: [{ kind: "price", direction: "above", value: 200 }],
    });
    await db.put(owner, "notes", stored);
    const service = new ThesisEvidenceService({
      db,
      market: { getQuote: async () => quote(100) } as never,
    });
    assert.equal(await service.check(owner, stored), null);
    const updated = await db.get<InvestmentNote>(owner, "notes", stored.id);
    assert.equal(updated?.status, "VALIDATED");
    assert.equal(updated?.check?.source, "manual");
  } finally {
    await db.close();
  }
});

test("证据服务：行情不可用时判为待确认，而不是判死论点", async () => {
  const db = await createStore();
  try {
    const owner = "owner-thesis-4";
    const stored = note({ evidence: [{ kind: "price", direction: "above", value: 200 }] });
    await db.put(owner, "notes", stored);
    const service = new ThesisEvidenceService({
      db,
      market: {
        getQuote: async () => {
          throw new Error("provider down");
        },
      } as never,
    });
    const check = await service.check(owner, stored);
    assert.equal(check?.outcome, "pending_confirmation");
    const updated = await db.get<InvestmentNote>(owner, "notes", stored.id);
    assert.equal(updated?.status, "ACTIVE");
  } finally {
    await db.close();
  }
});
