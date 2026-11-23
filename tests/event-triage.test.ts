import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import {
  EventTriageService,
  eventDedupeKey,
  judgeEvent,
  prefilterEvent,
  type TriageContext,
  type UniverseEntry,
} from "../apps/server/src/engine/event-triage.ts";

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
  universe.set("002594.SZ", entry("002594.SZ", { watchlist: true, thesis: true }));
  universe.set("600519.SS", entry("600519.SS", { watchlist: true }));
  universe.set("AAPL", entry("AAPL", { alert: true }));
  return { now: new Date("2026-11-23T02:00:00.000Z"), universe, mutedTopics: [], ...patch };
}

test("一级过滤：不在关注范围内的标的直接不打扰", () => {
  const result = prefilterEvent(
    { type: "news", symbol: "TSLA", title: "TSLA news", body: "" },
    context(),
  );
  assert.equal(result.level1, "not_relevant");
  assert.ok(result.reasons[0].includes("不在持仓 / 自选 / 论点 / 提醒范围"));
});

test("一级过滤：价格类低于 2% 门槛不进判级", () => {
  const result = prefilterEvent(
    { type: "price_move", symbol: "300750.SZ", title: "异动", body: "", magnitudePercent: 1.2 },
    context(),
  );
  assert.equal(result.level1, "below_floor");
});

test("一级过滤：用户降噪后同类事件只记日志", () => {
  // 「价格类少推点」把 price_move / price_level 一起压住。
  const result = prefilterEvent(
    { type: "price_move", symbol: "300750.SZ", title: "异动", body: "", magnitudePercent: 6 },
    context({ mutedTopics: ["price_level"] }),
  );
  assert.equal(result.level1, "muted");
});

test("二级判级：持仓 + 论点 + 大幅异动，判为推送", () => {
  const judged = judgeEvent(
    { type: "price_move", symbol: "300750.SZ", title: "异动", body: "", magnitudePercent: 5 },
    context(),
  );
  assert.equal(judged.decision, "push");
  assert.ok(judged.score >= 60);
  assert.ok(judged.reasons.some((reason) => reason.includes("关联在跟踪的论点")));
});

test("二级判级：只有自选的新闻进信息流，不推送", () => {
  const judged = judgeEvent(
    { type: "news", symbol: "600519.SS", title: "新闻", body: "" },
    context(),
  );
  assert.equal(judged.decision, "silent");
});

test("二级判级：论点标的的新闻够到信息流", () => {
  const judged = judgeEvent(
    { type: "news", symbol: "002594.SZ", title: "新闻", body: "" },
    context(),
  );
  assert.equal(judged.decision, "feed");
});

test("二级判级：显式设置的价格提醒优先推送", () => {
  const judged = judgeEvent(
    { type: "price_level", symbol: "AAPL", title: "价格提醒", body: "", thresholdValue: 200 },
    context(),
  );
  assert.equal(judged.decision, "push");
  assert.ok(judged.reasons.some((reason) => reason.includes("显式设置了价格提醒")));
});

test("二级判级：休市时段把推送降级为信息流", () => {
  const judged = judgeEvent(
    { type: "price_level", symbol: "300750.SZ", title: "价格提醒", body: "", thresholdValue: 200 },
    context({ quiet: true }),
  );
  assert.equal(judged.decision, "feed");
  assert.ok(judged.reasons.some((reason) => reason.includes("休市")));
});

test("去重键：价格类按天聚合，阈值不同的提醒互不吞掉", () => {
  const now = new Date("2026-11-23T02:00:00.000Z");
  const a = eventDedupeKey(
    { type: "price_level", symbol: "AAPL", title: "A", body: "", thresholdValue: 200 },
    now,
  );
  const b = eventDedupeKey(
    { type: "price_level", symbol: "AAPL", title: "A", body: "", thresholdValue: 210 },
    now,
  );
  assert.notEqual(a, b);
  assert.ok(a.includes("2026-11-23"));
});

test("服务：推送只发通知，信息流不发；重复接入幂等", async () => {
  const db = await createStore();
  try {
    const owner = "owner-triage";
    await db.put(owner, "watchlists", {
      id: "w1",
      user_id: owner,
      name: "自选",
      symbols: ["002594.SZ"],
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:00:00.000Z",
    });
    await db.put(owner, "notes", {
      id: "n1",
      user_id: owner,
      symbol_code: "002594.SZ",
      type: "THESIS",
      content: "长期看好新能源车份额提升",
      status: "ACTIVE",
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:00:00.000Z",
    });
    const notified: string[] = [];
    const service = new EventTriageService({
      db,
      now: () => new Date("2026-11-23T02:00:00.000Z"),
      notify: async (_owner, title) => {
        notified.push(title);
        return { id: `notice-${notified.length}` };
      },
    });

    const feedItem = await service.ingest(owner, {
      type: "news",
      symbol: "002594.SZ",
      title: "比亚迪发布新车",
      body: "",
    });
    assert.equal(feedItem.decision, "feed");
    assert.equal(feedItem.notificationId, undefined);
    assert.equal(notified.length, 0);

    const pushed = await service.ingest(owner, {
      type: "thesis_risk",
      symbol: "002594.SZ",
      title: "论点走弱",
      body: "",
    });
    assert.equal(pushed.decision, "push");
    assert.ok(pushed.notificationId);
    assert.deepEqual(notified, ["论点走弱"]);

    const again = await service.ingest(owner, {
      type: "thesis_risk",
      symbol: "002594.SZ",
      title: "论点走弱",
      body: "",
    });
    assert.equal(again.id, pushed.id);
    assert.equal(notified.length, 1, "同一事件重复接入不应重复通知");

    const counts = await service.counts(owner);
    assert.equal(counts.push, 1);
    assert.equal(counts.feed, 1);
    assert.equal(counts.unread, 2);

    await service.markRead(owner, pushed.id);
    assert.equal((await service.counts(owner)).unread, 1);
  } finally {
    await db.close();
  }
});

test("服务：推送通道失败降级为信息流，事件不丢", async () => {
  const db = await createStore();
  try {
    const owner = "owner-notify-fail";
    await db.put(owner, "notes", {
      id: "n1",
      user_id: owner,
      symbol_code: "002594.SZ",
      type: "THESIS",
      content: "长期看好",
      status: "ACTIVE",
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:00:00.000Z",
    });
    const service = new EventTriageService({
      db,
      now: () => new Date("2026-11-23T02:00:00.000Z"),
      notify: async () => {
        throw new Error("push channel down");
      },
    });
    const item = await service.ingest(owner, {
      type: "thesis_risk",
      symbol: "002594.SZ",
      title: "论点走弱",
      body: "",
    });
    assert.equal(item.decision, "feed");
    assert.ok(item.reasons.some((reason) => reason.includes("推送通道失败")));
    assert.equal(item.notificationId, undefined);
  } finally {
    await db.close();
  }
});

test("服务：少推点写入降噪偏好，随后同类事件不再打扰", async () => {
  const db = await createStore();
  try {
    const owner = "owner-feedback";
    const service = new EventTriageService({
      db,
      now: () => new Date("2026-11-23T02:00:00.000Z"),
      notify: async () => ({ id: "notice" }),
    });
    await db.put(owner, "holdings", {
      id: "h1",
      portfolio_id: "p1",
      symbol_code: "300750.SZ",
      market: "CN",
      currency: "CNY",
      quantity: 10,
      avg_cost: 200,
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:00:00.000Z",
    });
    const first = await service.ingest(owner, {
      type: "price_move",
      symbol: "300750.SZ",
      title: "异动 5%",
      body: "",
      magnitudePercent: 5,
    });
    assert.equal(first.decision, "push");

    const feedback = await service.feedback(owner, first.id, "less");
    assert.equal(feedback.item.feedback, "less");
    assert.equal(feedback.mute?.topic, "price_level");
    const mutes = await service.activeMutes(owner);
    assert.deepEqual(
      mutes.map((mute) => mute.topic),
      ["price_level"],
    );

    // 冷却生效后，同类事件只记日志。
    const second = await service.ingest(owner, {
      type: "price_level",
      symbol: "300750.SZ",
      title: "价格提醒",
      body: "",
      thresholdValue: 250,
    });
    assert.equal(second.decision, "silent");
    assert.equal(second.level1, "muted");

    // 解除降噪后重新进入判级（不再是一级过滤就拦掉）。
    await service.unmute(owner, "price_level");
    assert.equal((await service.activeMutes(owner)).length, 0);
    const third = await service.ingest(owner, {
      type: "price_level",
      symbol: "300750.SZ",
      title: "价格提醒 2",
      body: "",
      thresholdValue: 260,
    });
    assert.equal(third.level1, "passed");
  } finally {
    await db.close();
  }
});

test("服务：降噪项到期后自动失效", async () => {
  const db = await createStore();
  try {
    const owner = "owner-mute-expiry";
    let clock = new Date("2026-11-23T02:00:00.000Z");
    const service = new EventTriageService({ db, now: () => clock });
    await service.mute(owner, "news", 7);
    assert.equal((await service.activeMutes(owner)).length, 1);
    clock = new Date("2026-12-05T02:00:00.000Z");
    assert.equal((await service.activeMutes(owner)).length, 0);
  } finally {
    await db.close();
  }
});

test("服务：同一标的下同标题内容事件 24h 内不重复打扰", async () => {
  const db = await createStore();
  try {
    const owner = "owner-dedup";
    await db.put(owner, "watchlists", {
      id: "w1",
      user_id: owner,
      name: "自选",
      symbols: ["002594.SZ"],
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:00:00.000Z",
    });
    const service = new EventTriageService({
      db,
      now: () => new Date("2026-11-23T02:00:00.000Z"),
    });
    const news = await service.ingest(owner, {
      type: "news",
      symbol: "002594.SZ",
      title: "比亚迪发布新车",
      body: "",
    });
    const announcement = await service.ingest(owner, {
      type: "announcement",
      symbol: "002594.SZ",
      title: "比亚迪发布新车",
      body: "",
    });
    assert.equal(announcement.id, news.id);
    assert.ok(announcement.reasons.some((reason) => reason.includes("24 小时内")));
    assert.equal((await service.list(owner, { includeSilent: true })).length, 1);
  } finally {
    await db.close();
  }
});
