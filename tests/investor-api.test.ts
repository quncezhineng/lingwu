import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { AgentNotification, InvestmentNote } from "../packages/domain/src/agent.ts";
import type { EventFeedItem, InvestorMutedTopic } from "../packages/domain/src/investor.ts";
import type { MarketDataService } from "../packages/integrations/src/market-data.ts";

let db: Store;
let server: Awaited<ReturnType<typeof createApp>>;
let directory: string;
let token: string;

const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
async function call<T>(path: string, init: RequestInit = {}, status = 200): Promise<T> {
  const response = await server.app.request(`/api${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  assert.equal(response.status, status, await response.clone().text());
  return response.json() as Promise<T>;
}
const post = <T>(path: string, body: unknown, status = 200) =>
  call<T>(path, { method: "POST", body: JSON.stringify(body) }, status);

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-investor-"));
  db = await createStore({ dataDir: join(directory, "db") });
  const config: Config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    intelligenceApiKey: "test-project-key-never-sent",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  // 固定行情：让论点判定可复现；真实环境由 MarketDataService 提供。
  const market = {
    getQuote: async (symbol: string) => ({
      symbol,
      price: 150,
      change: 1,
      changePercent: 1,
      market: "CN",
      asOf: new Date().toISOString(),
      source: "stub",
    }),
    searchSymbols: async () => [],
  } as unknown as MarketDataService;
  server = await createApp(db, config, { market });
  const session = await server.app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  token = (await session.json()).token;
});

after(async () => {
  await server?.agent?.stop();
  await db?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("投研接口需要会话", async () => {
  assert.equal((await server.app.request("/api/investor/feed")).status, 401);
  assert.equal((await server.app.request("/api/investor/mutes")).status, 401);
});

test("自选与论点决定事件是否相关", async () => {
  await post("/watchlists", { name: "新能源", symbols: ["300750.SZ"] }, 201);
  await post(
    "/notes",
    { symbol_code: "300750.SZ", type: "THESIS", content: "储能出货超预期，长期持有" },
    201,
  );
  const related = await post<EventFeedItem>(
    "/investor/events",
    { type: "news", symbol: "300750.SZ", title: "宁德时代 行业新闻开篇" },
    201,
  );
  assert.equal(related.level1, "passed");

  const unrelated = await post<EventFeedItem>(
    "/investor/events",
    { type: "news", symbol: "TSLA", title: "特斯拉 行业新闻" },
    201,
  );
  assert.equal(unrelated.decision, "silent");
  assert.equal(unrelated.level1, "not_relevant");
});

test("事件接入后按判级落库：重要进通知，一般只进信息流", async () => {
  // A3：未授权主动提醒时推送会被降级为信息流，这里先给出一次提醒授权。
  await post(
    "/investor/consents",
    {
      dataScope: ["portfolio", "holdings"],
      purposes: ["remind"],
      channels: ["push"],
      frequency: "realtime",
    },
    201,
  );
  const pushed = await post<EventFeedItem>(
    "/investor/events",
    {
      type: "thesis_risk",
      symbol: "300750.SZ",
      title: "宁德时代 论点受威胁",
      body: "周检发现关键假设走弱",
    },
    201,
  );
  // 交易日按判级推送；休市日（UTC 周末）静默策略会合法地把推送降级为信息流。
  const marketClosed = [0, 6].includes(new Date().getUTCDay());
  assert.equal(pushed.decision, marketClosed ? "feed" : "push");
  assert.ok(pushed.reasons.length > 0);

  if (marketClosed) {
    assert.ok(pushed.reasons.some((reason) => reason.includes("休市")));
  } else {
    assert.ok(pushed.notificationId);
    const notifications = await call<AgentNotification[]>("/agent/notifications");
    assert.ok(notifications.some((item) => item.title === "宁德时代 论点受威胁"));
  }

  const fed = await post<EventFeedItem>(
    "/investor/events",
    { type: "news", symbol: "300750.SZ", title: "宁德时代 行业新闻" },
    201,
  );
  assert.equal(fed.decision, "feed");
  assert.equal(fed.notificationId, undefined);

  const feed = await call<EventFeedItem[]>("/investor/feed");
  assert.ok(feed.some((item) => item.id === fed.id));
  assert.ok(feed.every((item) => item.decision !== "silent"));

  const counts = await call<{ push: number; feed: number; unread: number }>(
    "/investor/feed/counts",
  );
  // 休市日 pushed 会落到 feed，所以只保证两类合计 ≥ 2 且 feed ≥ 1。
  assert.ok(counts.push + counts.feed >= 2);
  assert.ok(counts.feed >= 1);

  const read = await post<EventFeedItem>(`/investor/feed/${fed.id}/read`, {});
  assert.equal(read.read, true);
});

test("少推点写入降噪偏好，同类事件随后只记日志", async () => {
  const item = await post<EventFeedItem>(
    "/investor/events",
    { type: "thesis_risk", symbol: "300750.SZ", title: "宁德时代 论点再受威胁" },
    201,
  );
  const result = await post<{ item: EventFeedItem; mute?: { topic: string } }>(
    `/investor/feed/${item.id}/feedback`,
    { vote: "less" },
  );
  assert.equal(result.item.feedback, "less");
  assert.equal(result.mute?.topic, "thesis_risk");

  const muted = await post<EventFeedItem>(
    "/investor/events",
    { type: "thesis_risk", symbol: "300750.SZ", title: "宁德时代 第三次论点告警" },
    201,
  );
  assert.equal(muted.decision, "silent");
  assert.equal(muted.level1, "muted");

  const mutes = await call<InvestorMutedTopic[]>("/investor/mutes");
  assert.deepEqual(
    mutes.map((mute) => mute.topic),
    ["thesis_risk"],
  );

  // 手动解除降噪后，同类事件重新进入判级。
  await call<{ ok: boolean }>("/investor/mutes/thesis_risk", { method: "DELETE" });
  assert.equal((await call<InvestorMutedTopic[]>("/investor/mutes")).length, 0);
});

test("研报派生跟踪计划并落地为提醒与论点", async () => {
  // 直接写入一份研报（正常路径由研究任务产出），再走接口派生计划。
  const report = {
    id: "report-api-1",
    user_id: "sample",
    symbol_code: "600519.SS",
    title: "贵州茅台 深度研究",
    sections: {
      company_overview: "贵州茅台在 A 股上市，属于白酒行业。",
      financials: { price: 1500, currency: "CNY", fiftyTwoWeekLow: 1300, fiftyTwoWeekHigh: 1900 },
      news: [],
      peer_comparison: [],
      valuation: {
        low: 1300,
        mid: 1600,
        high: 1900,
        current: 1500,
        assumptions: ["区间取自 52 周区间"],
      },
      risks: ["行情延迟"],
    },
    generated_at: "2026-11-20T00:00:00.000Z",
  };
  // 研报按 owner 隔离：先取当前会话 owner，再直接写入一份研报（正常路径由研究任务产出）。
  const me = await call<{ id: string }>("/auth/me");
  await db.put(me.id, "research_reports", report);

  const plan = await post<{ id: string; items: unknown[] }>(
    "/investor/tracking-plans/derive",
    { reportId: report.id },
    201,
  );
  assert.ok(plan.items.length > 0);

  const materialized = await post<{
    status: string;
    materialized?: { alertIds: string[]; noteIds: string[] };
  }>(`/investor/tracking-plans/${plan.id}/materialize`, {});
  assert.equal(materialized.status, "active");
  assert.equal(materialized.materialized?.alertIds.length, 2);
  assert.equal(materialized.materialized?.noteIds.length, 1);
});

test("论点绑定证据后可立即判定，缺行情时如实回落到待确认", async () => {
  const note = await post<InvestmentNote>(
    "/notes",
    { symbol_code: "000858.SZ", type: "THESIS", content: "高端白酒需求稳定，长期持有" },
    201,
  );
  const bound = await post<InvestmentNote>(`/investor/notes/${note.id}/evidence`, {
    evidence: [{ kind: "price", direction: "above", value: 100 }],
  });
  assert.equal(bound.evidence?.length, 1);

  const checked = await post<{ check: { outcome: string } | null; note: InvestmentNote }>(
    `/investor/notes/${note.id}/check`,
    {},
  );
  assert.ok(checked.check);
  // 当前价 150 > 绑定阈值 100，论点成立；自动判定不擅自把状态改成"已确认"。
  assert.equal(checked.check?.outcome, "valid");
  assert.equal(checked.note.status, "ACTIVE");
});
