import assert from "node:assert/strict";
import { test } from "node:test";
import type { Store } from "../apps/server/src/db.ts";
import { createStore } from "../apps/server/src/db.ts";
import { judgePrompt, parseJudgeReply } from "../apps/server/src/engine/event-judge-model.ts";
import {
  EventTriageService,
  type JudgeResult,
  PUSH_SCORE,
  type TriageContext,
  type UniverseEntry,
} from "../apps/server/src/engine/event-triage.ts";

/** 让 300750.SZ 成为唯一持仓（占组合 100%），事件才能通过一级过滤。 */
async function seedHolding(db: Store, owner: string, symbol = "300750.SZ") {
  await db.put(owner, "holdings", {
    id: "h1",
    portfolio_id: "p1",
    symbol_code: symbol,
    market: "CN",
    currency: "CNY",
    quantity: 10,
    avg_cost: 200,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  });
}

function entry(symbol: string, patch: Partial<UniverseEntry> = {}): UniverseEntry {
  return {
    symbol,
    holding: false,
    weight: 0,
    thesis: false,
    watchlist: false,
    alert: false,
    ...patch,
  };
}

function context(patch: Partial<TriageContext> = {}): TriageContext {
  const universe = new Map<string, UniverseEntry>();
  universe.set("300750.SZ", entry("300750.SZ", { holding: true, weight: 0.3, thesis: true }));
  universe.set("AAPL", entry("AAPL", { alert: true }));
  return { now: new Date("2026-11-23T02:00:00.000Z"), universe, mutedTopics: [], ...patch };
}

const rules: JudgeResult = {
  decision: "feed",
  score: 42,
  reasons: ["持仓标的（占组合 30%），权重加成 +25", "判级得分 42，进信息流等你来看。"],
};

const NOW = () => new Date("2026-11-23T02:00:00.000Z");

test("模型判级输出：能从 ```json 包裹和前后废话里抠出分数与理由", () => {
  const parsed = parseJudgeReply(
    '好的，这是结论：\n```json\n{"score": 72, "reasons": ["下调全年指引，直接影响你的论点", "财报前一周"]}\n```',
  );
  assert.ok(parsed);
  assert.equal(parsed.score, 72);
  assert.equal(parsed.reasons.length, 2);
});

test("模型判级输出：字符串分数也接受，理由去空白并截断", () => {
  const parsed = parseJudgeReply('{"score": "58", "reasons": ["  重复   表述  "]}');
  assert.ok(parsed);
  assert.equal(parsed.score, 58);
  assert.equal(parsed.reasons[0], "重复 表述");
});

test("模型判级输出：解析不出分数或理由就返回 null，由调用方降级", () => {
  assert.equal(parseJudgeReply("这条挺重要的，我建议推送。"), null);
  assert.equal(parseJudgeReply('{"score": 80, "reasons": []}'), null);
  assert.equal(parseJudgeReply('{"score": "很高", "reasons": ["x"]}'), null);
  assert.equal(parseJudgeReply("{不是 JSON}"), null);
});

test("判级提示词：把规则结论和用户关系一起交给模型", () => {
  const prompt = judgePrompt(
    { type: "news", symbol: "300750.SZ", title: "宁德时代下调全年指引", body: "指引下调 5%" },
    context(),
    rules,
  );
  assert.ok(prompt.includes("宁德时代下调全年指引"));
  assert.match(prompt, /持仓，占组合约 30%/);
  assert.match(prompt, /该标的有在跟踪的投资论点/);
  // 规则结论作为参照给进去，模型是补判而不是从零开始。
  assert.match(prompt, /分值 42，结论 feed/);
});

test("事件接入：模型判级结论覆盖规则结论，并留痕规则对照（可 A/B）", async () => {
  const db = await createStore();
  try {
    const owner = "model-judge";
    let sawRules: JudgeResult | null = null;
    const service = new EventTriageService({
      db,
      now: NOW,
      notify: async () => ({ id: "notice" }),
      judge: async (_owner, _candidate, ctx, ruleResult) => {
        sawRules = ruleResult;
        assert.ok(ctx.universe.size > 0);
        return {
          // 模型认为这条不值得打扰，比规则更保守。
          result: {
            decision: "silent",
            score: 20,
            reasons: [
              "模型判级：只是例行公告，没有改变指引",
              "判级得分 20 低于信息流线 35，只记日志。",
            ],
          } satisfies JudgeResult,
          source: "model" as const,
          shadow: {
            source: "rules" as const,
            decision: ruleResult.decision,
            score: ruleResult.score,
          },
          model: "test/light",
        };
      },
    });
    await seedHolding(db, owner);

    const item = await service.ingest(owner, {
      type: "news",
      symbol: "300750.SZ",
      title: "宁德时代例行公告",
      body: "",
    });

    assert.equal(item.judgedBy, "model");
    assert.equal(item.judgeModel, "test/light");
    assert.equal(item.decision, "silent");
    assert.equal(item.score, 20);
    // reasons 契约不变：仍然是"一级理由 + 判级理由"的字符串数组。
    assert.ok(Array.isArray(item.reasons));
    assert.ok(item.reasons.every((reason) => typeof reason === "string" && reason.length > 0));
    assert.ok(item.reasons.some((reason) => reason.startsWith("模型判级：")));
    // 规则结论留在 shadow 里，用于对比推送接收率。
    assert.equal(item.shadow?.source, "rules");
    assert.equal(item.shadow?.decision, "feed");
    assert.ok(sawRules);
    assert.equal((sawRules as JudgeResult).decision, "feed");
  } finally {
    await db.close();
  }
});

test("事件接入：模型判级抛错时降级到规则，事件不丢", async () => {
  const db = await createStore();
  try {
    const owner = "model-judge-fallback";
    const service = new EventTriageService({
      db,
      now: NOW,
      notify: async () => ({ id: "notice" }),
      judge: async () => {
        throw new Error("model timed out");
      },
    });
    await seedHolding(db, owner);

    const item = await service.ingest(owner, {
      type: "price_move",
      symbol: "300750.SZ",
      title: "宁德时代异动 7%",
      body: "",
      magnitudePercent: 7,
    });

    assert.equal(item.judgedBy, "rules_fallback");
    assert.equal(item.decision, "push");
    assert.ok(item.score >= PUSH_SCORE);
    assert.ok(item.reasons.some((reason) => reason.includes("模型判级不可用")));
    assert.equal(item.shadow, undefined);
  } finally {
    await db.close();
  }
});

test("事件接入：钩子返回 null 表示不接管，规则结论照常生效", async () => {
  const db = await createStore();
  try {
    const owner = "model-judge-skip";
    const service = new EventTriageService({
      db,
      now: NOW,
      notify: async () => ({ id: "notice" }),
      judge: async () => null,
    });
    await seedHolding(db, owner);

    const item = await service.ingest(owner, {
      type: "price_move",
      symbol: "300750.SZ",
      title: "宁德时代异动 7%",
      body: "",
      magnitudePercent: 7,
    });
    assert.equal(item.judgedBy, "rules");
    assert.equal(item.decision, "push");
  } finally {
    await db.close();
  }
});

test("判级统计：按出处分组给出推送接收率与规则/模型分歧率", async () => {
  const db = await createStore();
  try {
    const owner = "judge-stats";
    const service = new EventTriageService({
      db,
      now: NOW,
      notify: async () => ({ id: "notice" }),
    });
    await seedHolding(db, owner);

    const read = await service.ingest(owner, {
      type: "price_move",
      symbol: "300750.SZ",
      title: "宁德时代异动 8%",
      body: "",
      magnitudePercent: 8,
    });
    assert.equal(read.decision, "push");
    // 点开 = 接收。
    await service.markRead(owner, read.id);

    const more = await service.ingest(owner, {
      type: "thesis_risk",
      symbol: "300750.SZ",
      title: "论点受威胁",
      body: "",
    });
    assert.equal(more.decision, "push");
    await service.feedback(owner, more.id, "more");

    const less = await service.ingest(owner, {
      type: "earnings",
      symbol: "300750.SZ",
      title: "财报预告",
      body: "",
    });
    assert.equal(less.decision, "push");
    await service.feedback(owner, less.id, "less");

    const stats = await service.stats(owner);
    const rulesStats = stats.find((row) => row.judgedBy === "rules");
    assert.ok(rulesStats);
    assert.equal(rulesStats.total, 3);
    assert.equal(rulesStats.push, 3);
    assert.equal(rulesStats.pushRead, 1);
    assert.equal(rulesStats.pushPositive, 1);
    assert.equal(rulesStats.pushNegative, 1);
    // (已读 1 + 多推点 1 - 少推点 1) / 推送 3
    assert.equal(rulesStats.pushAcceptRate, 0.33);
    assert.equal(rulesStats.shadowCompared, 0);
  } finally {
    await db.close();
  }
});
