/**
 * OPT-01 移动端单测：Today 聚合解析、分组、打扰预算、反馈与规则 CRUD。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { LingWuApi } from "../src/api.ts";
import {
  buildMonitorRuleInput,
  controlMonitorRule,
  createMonitorRule,
  deleteMonitorRule,
  dismissMonitorEvent,
  draftMonitorRule,
  eventDetail,
  eventTitle,
  loadMonitorRules,
  loadMonitors,
  monitorsSnapshot,
  parseMonitorEvent,
  parseMonitorRule,
  parseToday,
  removeMonitorEvent,
  resetMonitorsStore,
  setAttentionBudget,
  sortMonitorEvents,
  updateMonitorRule,
  upsertMonitorRule,
} from "../src/monitors.ts";

const here = dirname(fileURLToPath(import.meta.url));
const source = (name: string) => readFileSync(resolve(here, "../src", name), "utf8");

function fakeApi(handler: (path: string, body?: unknown, method?: string) => unknown): LingWuApi {
  return {
    token: "test-token",
    request: async (path: string, body?: unknown, method?: string) =>
      handler(path, body, method ?? (body === undefined ? "GET" : "POST")),
  } as unknown as LingWuApi;
}

const RULE = {
  id: "r-1",
  title: "AAPL breakout",
  targetType: "symbol",
  targetId: "AAPL",
  market: "US",
  eventKinds: ["PRICE_ABOVE"],
  level: "MUST_KNOW",
  cooldownMinutes: 240,
  enabled: true,
  quietHours: { startHour: 22, endHour: 7 },
  intervalMinutes: 5,
  thresholds: { priceAbove: 190 },
  channels: ["apns", "fcm"],
  createdAt: "2026-11-13T08:00:00.000Z",
  updatedAt: "2026-11-13T08:00:00.000Z",
};

const EVENT = {
  id: "e-1",
  ruleId: "r-1",
  kind: "PRICE_ABOVE",
  level: "MUST_KNOW",
  severity: "high",
  payload: { symbol: "AAPL", title: "AAPL above 190", price: 191.2, threshold: 190 },
  detectedAt: "2026-11-13T09:00:00.000Z",
  market: "US",
  marketDate: "2026-11-13",
  state: "delivered",
  occurrences: 2,
};

const TODAY_PAYLOAD = {
  date: "2026-11-13",
  time_zone: "Asia/Shanghai",
  budget: { date: "2026-11-13", limit: 5, used: 2, remaining: 3, downgraded_count: 1 },
  rules: [RULE],
  digest: {
    ...EVENT,
    id: "digest-1",
    kind: "DIGEST",
    level: "LATER",
    state: "archived",
  },
  events: {
    MUST_KNOW: [EVENT],
    LATER: [{ ...EVENT, id: "e-2", level: "LATER", severity: "low", state: "new" }],
    ARCHIVE: [{ ...EVENT, id: "e-3", level: "ARCHIVE", state: "archived" }],
  },
  generated_at: "2026-11-13T09:01:00.000Z",
};

test("parseToday 读取 owner 本地日期、预算与三档分组", () => {
  const today = parseToday(TODAY_PAYLOAD);
  assert.ok(today);
  assert.equal(today.date, "2026-11-13");
  assert.equal(today.timeZone, "Asia/Shanghai");
  assert.deepEqual(today.budget, {
    date: "2026-11-13",
    limit: 5,
    used: 2,
    remaining: 3,
    downgradedCount: 1,
  });
  assert.equal(today.rules.length, 1);
  assert.equal(today.rules[0]?.title, "AAPL breakout");
  assert.equal(today.groups.MUST_KNOW.length, 1);
  assert.equal(today.groups.LATER.length, 1);
  assert.equal(today.groups.ARCHIVE.length, 1);
  assert.equal(today.digest?.kind, "DIGEST");
  assert.equal(parseToday({ budget: {} }), undefined);
});

test("events 的分组不混入 DIGEST 或无效记录", () => {
  const today = parseToday({
    ...TODAY_PAYLOAD,
    events: {
      MUST_KNOW: [EVENT, { ...EVENT, id: "d", kind: "DIGEST" }, { nope: true }],
      LATER: null,
      ARCHIVE: [],
    },
  });
  assert.ok(today);
  assert.deepEqual(
    today.groups.MUST_KNOW.map((event) => event.id),
    ["e-1"],
  );
  assert.deepEqual(today.groups.LATER, []);
});

test("sortMonitorEvents 先按严重程度、再按最近触发时间", () => {
  const low = parseMonitorEvent({ ...EVENT, id: "low", severity: "low" });
  const highOld = parseMonitorEvent({ ...EVENT, id: "high-old", severity: "high" });
  const highNew = parseMonitorEvent({
    ...EVENT,
    id: "high-new",
    severity: "high",
    lastDetectedAt: "2026-11-13T10:00:00.000Z",
  });
  assert.ok(low && highOld && highNew);
  assert.deepEqual(
    sortMonitorEvents([low, highOld, highNew]).map((event) => event.id),
    ["high-new", "high-old", "low"],
  );
});

test("removeMonitorEvent 只移除目标事件", () => {
  const today = parseToday(TODAY_PAYLOAD);
  assert.ok(today);
  const next = removeMonitorEvent(today, "e-1");
  assert.equal(next.groups.MUST_KNOW.length, 0);
  assert.equal(next.groups.LATER.length, 1);
});

test("事件标题与详情来自 payload", () => {
  const event = parseMonitorEvent(EVENT);
  assert.ok(event);
  assert.equal(eventTitle(event), "AAPL above 190");
  assert.equal(eventDetail(event), "AAPL · $191.2 · ≥ 190 · ×2");
});

test("规则草稿转换：默认值、阈值校验与显式关闭静默期", () => {
  const draft = draftMonitorRule();
  assert.equal(draft.level, "ARCHIVE");
  assert.equal(draft.quietEnabled, true);
  assert.deepEqual(draft.channels, ["apns", "fcm"]);
  const missing = buildMonitorRuleInput({ ...draft, targetId: "AAPL" }, true);
  assert.ok("error" in missing);
  assert.equal(missing.error, "threshold");
  assert.equal(missing.kind, "PRICE_ABOVE");

  const built = buildMonitorRuleInput(
    {
      ...draft,
      targetId: "AAPL",
      thresholds: { ...draft.thresholds, priceAbove: "190" },
      quietEnabled: false,
      market: "US",
    },
    true,
  );
  assert.ok("input" in built);
  assert.equal(built.input.targetId, "AAPL");
  assert.equal(built.input.quietHours, null);
  assert.deepEqual(built.input.thresholds, { priceAbove: 190 });

  const update = buildMonitorRuleInput(
    { ...draft, targetId: "ignored", thresholds: { ...draft.thresholds, priceAbove: "1" } },
    false,
  );
  assert.ok("input" in update);
  assert.equal("targetId" in update.input, false);
});

test("loadMonitors 只读 /api/today，不调用 events?date=", async () => {
  resetMonitorsStore();
  const calls: string[] = [];
  const api = fakeApi((path) => {
    calls.push(path);
    return TODAY_PAYLOAD;
  });
  await loadMonitors(api);
  assert.deepEqual(calls, ["/api/today"]);
  assert.equal(monitorsSnapshot().status, "ready");
  assert.equal(monitorsSnapshot().today?.groups.MUST_KNOW.length, 1);
});

test("再次进入 Today 会强制刷新预算与事件", async () => {
  resetMonitorsStore();
  let calls = 0;
  const api = fakeApi(() => {
    calls += 1;
    return TODAY_PAYLOAD;
  });
  await loadMonitors(api);
  await loadMonitors(api);
  assert.equal(calls, 1, "未强制刷新时复用缓存");
  await loadMonitors(api, true);
  assert.equal(calls, 2, "强制刷新必须重新请求 /api/today");
});

test("「不必要」反馈调用 dismiss 接口并立即从 Today 移除", async () => {
  resetMonitorsStore();
  const calls: { path: string; body?: unknown; method?: string }[] = [];
  const api = fakeApi((path, body, method) => {
    calls.push({ path, body, method });
    if (path === "/api/today") return TODAY_PAYLOAD;
    return {
      event: { ...EVENT, state: "dismissed", dismissReason: "unnecessary" },
      rule: { ...RULE, cooldownMinutes: 480 },
      accelerated: true,
    };
  });
  await loadMonitors(api);
  const result = await dismissMonitorEvent(api, "e-1");
  assert.equal(result.accelerated, true);
  assert.deepEqual(calls[1], {
    path: "/api/monitors/events/e-1/dismiss",
    body: { reason: "unnecessary" },
    method: "POST",
  });
  assert.equal(monitorsSnapshot().today?.groups.MUST_KNOW.length, 0);
  assert.equal(monitorsSnapshot().rules[0]?.cooldownMinutes, 480);
});

test("规则 CRUD、暂停/恢复与预算更新命中约定接口", async () => {
  resetMonitorsStore();
  const calls: { path: string; body?: unknown; method?: string }[] = [];
  let enabled = true;
  const api = fakeApi((path, body, method) => {
    calls.push({ path, body, method });
    if (path === "/api/monitors/rules" && method === "POST")
      return { ...RULE, id: "r-new", targetId: "MSFT" };
    if (path === "/api/monitors/rules" && method === "GET") return { rules: [RULE] };
    if (path === "/api/monitors/rules/r-1" && method === "PUT") return { ...RULE, title: "Edited" };
    if (path === "/api/monitors/rules/r-1/control") {
      enabled = (body as { action: string }).action === "resume";
      return { ...RULE, enabled };
    }
    if (path === "/api/monitors/rules/r-1" && method === "DELETE") return undefined;
    if (path === "/api/monitors/budget") return { ...TODAY_PAYLOAD.budget, limit: 3 };
    return {};
  });

  await loadMonitorRules(api);
  assert.equal(monitorsSnapshot().rules.length, 1);

  const created = await createMonitorRule(api, {
    targetType: "symbol",
    targetId: "MSFT",
    eventKinds: ["PRICE_ABOVE"],
    thresholds: { priceAbove: 400 },
  });
  assert.equal(created.id, "r-new");
  assert.equal(monitorsSnapshot().rules[0]?.id, "r-new");

  const updated = await updateMonitorRule(api, "r-1", { title: "Edited" });
  assert.equal(updated.title, "Edited");

  await controlMonitorRule(api, "r-1", "pause");
  const resumed = await controlMonitorRule(api, "r-1", "resume");
  assert.equal(resumed?.enabled, true);

  await deleteMonitorRule(api, "r-1");
  assert.equal(
    monitorsSnapshot().rules.some((rule) => rule.id === "r-1"),
    false,
  );

  resetMonitorsStore();
  await loadMonitors(api);
  const budget = await setAttentionBudget(api, 3);
  assert.equal(budget.limit, 3);
  assert.deepEqual(calls.at(-1), {
    path: "/api/monitors/budget",
    body: { limit: 3 },
    method: "PUT",
  });
});

test("规则 upsert / remove 保持创建时间倒序", () => {
  const newer = parseMonitorRule({ ...RULE, id: "newer", createdAt: "2026-11-14T00:00:00.000Z" });
  assert.ok(newer);
  const rule = parseMonitorRule(RULE);
  assert.ok(rule);
  const rules = upsertMonitorRule([rule], newer);
  assert.deepEqual(
    rules.map((item) => item.id),
    ["newer", "r-1"],
  );
});

test("Today 与规则中心已挂载到真实 Shell 和 Today 页面", () => {
  const screens = source("screens.tsx");
  assert.match(screens, /MonitorTodayCard/);
  const today = source("monitor-today.tsx");
  assert.match(today, /loadMonitors/);
  assert.match(today, /loadMonitors\(api, true\)/);
  assert.match(today, /MUST_KNOW/);
  assert.match(today, /LATER/);
  assert.match(today, /ARCHIVE/);
  assert.match(today, /dismissMonitorEvent/);
  assert.doesNotMatch(today, /monitors\/events\?date=/);

  const shell = source("agent-product.tsx");
  assert.match(shell, /case "monitors"/);
  assert.match(shell, /MonitorRulesScreen/);
  assert.match(shell, /testID="agent-rail-monitors"/);

  const rules = source("monitor-rules-screen.tsx");
  assert.match(rules, /createMonitorRule/);
  assert.match(rules, /updateMonitorRule/);
  assert.match(rules, /deleteMonitorRule/);
  assert.match(rules, /controlMonitorRule/);
});
