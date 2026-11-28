import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { AgentNotification, InvestmentNote } from "../packages/domain/src/agent.ts";
import type {
  Consent,
  ConsentGate,
  EventFeedItem,
  InvestmentPolicy,
  InvestorMutedTopic,
  InvestorProfileView,
  PolicyDrift,
} from "../packages/domain/src/investor.ts";
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
  assert.equal(pushed.decision, "push");
  assert.ok(pushed.notificationId);
  assert.ok(pushed.reasons.length > 0);

  const notifications = await call<AgentNotification[]>("/agent/notifications");
  assert.ok(notifications.some((item) => item.title === "宁德时代 论点受威胁"));

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
  assert.ok(counts.push >= 1);
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

test("A1 投资档案：空档可读，强制确认字段需 confirm=true 才落库", async () => {
  const view = await call<InvestorProfileView>("/investor/profile");
  assert.equal(view.profile.owner.length > 0, true);
  assert.deepEqual(view.profile.goals, []);
  assert.ok(view.missingConfirmation.includes("risk.appetite"));

  // 不带 confirm 写风险偏好 → 422 confirm_required（模型不得静默改写）。
  const rejected = await server.app.request("/api/investor/profile", {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ risk: { appetite: "balanced" } }),
  });
  assert.equal(rejected.status, 422);
  assert.equal(((await rejected.json()) as { code?: string }).code, "confirm_required");

  const saved = await call<InvestorProfileView>("/investor/profile", {
    method: "PUT",
    body: JSON.stringify({
      confirm: true,
      risk: { appetite: "balanced", excludedSectors: ["烟草"] },
      goals: [{ kind: "growth", label: "增值", horizonMonths: 60 }],
    }),
  });
  assert.equal(saved.profile.risk.appetite, "balanced");
  assert.equal(saved.profile.risk.source, "user");
  assert.deepEqual(saved.missingConfirmation, []);
});

test("A1 提议：模型提议需用户 accept 后才落库", async () => {
  const proposal = await post<{ id: string; status: string }>(
    "/investor/profile/proposals",
    {
      field: "risk.appetite",
      label: "风险偏好",
      currentValue: "balanced",
      proposedValue: "aggressive",
      rationale: "近一年回撤承受度上升",
    },
    201,
  );
  assert.equal(proposal.status, "pending");
  assert.equal((await call<unknown[]>("/investor/profile/proposals")).length, 1);

  const reviewed = await post<{
    proposal: { status: string };
    profile: { risk: { appetite?: string } };
  }>(`/investor/profile/proposals/${proposal.id}/review`, { action: "accept" });
  assert.equal(reviewed.proposal.status, "accepted");
  assert.equal(reviewed.profile.risk.appetite, "aggressive");
});

test("A3 授权中心：创建 / 门槛 / 设备覆盖 / 撤回 / 删除", async () => {
  assert.deepEqual(await call<Consent[]>("/investor/consents"), []);

  const created = await post<Consent>(
    "/investor/consents",
    {
      dataScope: ["holdings", "market_data"],
      purposes: ["research", "remind"],
      channels: ["in_app"],
      frequency: "daily",
      quietHours: { start: "22:00", end: "07:00", timeZone: "Asia/Shanghai" },
      dailyPushCap: 3,
    },
    201,
  );
  assert.ok(created.id);

  const gate = await call<ConsentGate>("/investor/consents/gate");
  assert.equal(gate.configured, true);
  assert.equal(gate.remind, true);
  assert.equal(gate.dailyPushCap, 3);

  const patched = await call<Consent>(`/investor/consents/${created.id}`, {
    method: "PATCH",
    body: JSON.stringify({ dailyPushCap: 2, validTo: null }),
  });
  assert.equal(patched.dailyPushCap, 2);

  const withDevice = await call<Consent>(`/investor/consents/${created.id}/devices/phone-1`, {
    method: "PUT",
    body: JSON.stringify({
      quietHours: { start: "00:00", end: "08:00", timeZone: "Asia/Shanghai" },
    }),
  });
  assert.equal(withDevice.deviceQuietOverrides?.length, 1);
  const deviceGate = await call<ConsentGate>("/investor/consents/gate?deviceId=phone-1");
  assert.equal(deviceGate.dailyPushCap, 2);

  const revoked = await post<Consent>(`/investor/consents/${created.id}/revoke`, {});
  assert.ok(revoked.revokedAt);
  assert.equal((await call<ConsentGate>("/investor/consents/gate")).remind, false);

  await call<{ ok: boolean }>(`/investor/consents/${created.id}`, { method: "DELETE" });
  assert.deepEqual(await call<Consent[]>("/investor/consents"), []);
});

test("A2 目标配置与偏离：无政策不产出，越界按市值口径判定", async () => {
  const portfolio = await post<{ id: string }>("/portfolios", { name: "目标盘" }, 201);
  await post(
    `/portfolios/${portfolio.id}/holdings`,
    { symbol_code: "600519.SS", quantity: 10, avg_cost: 100, sector: "白酒" },
    201,
  );
  await post(
    `/portfolios/${portfolio.id}/holdings`,
    { symbol_code: "000001.SZ", quantity: 10, avg_cost: 100, sector: "银行" },
    201,
  );
  // maturity_date 透传：A4 到期事件源依赖它。
  const bond = await post<{ maturity_date?: string }>(
    `/portfolios/${portfolio.id}/holdings`,
    { symbol_code: "019547.SH", quantity: 5, avg_cost: 100, maturity_date: "2026-12-05" },
    201,
  );
  assert.equal(bond.maturity_date, "2026-12-05");

  assert.equal(await call<InvestmentPolicy | null>(`/portfolios/${portfolio.id}/policy`), null);
  assert.deepEqual(
    (await call<{ parts: PolicyDrift[] }>(`/portfolios/${portfolio.id}/drift`)).parts,
    [],
  );

  await call<InvestmentPolicy>(`/portfolios/${portfolio.id}/policy`, {
    method: "PUT",
    body: JSON.stringify({
      basis: "sector",
      targets: [
        { key: "白酒", label: "白酒", targetPercent: 90 },
        { key: "银行", label: "银行", targetPercent: 10 },
      ],
    }),
  });

  const drift = await call<{ parts: PolicyDrift[] }>(`/portfolios/${portfolio.id}/drift`);
  assert.equal(drift.parts.length, 1);
  assert.equal(drift.parts[0]?.valueBasis, "market");
  assert.ok(drift.parts[0]?.rows.some((row) => row.status === "breach"));

  const removed = await server.app.request(`/api/portfolios/${portfolio.id}/policy`, {
    method: "DELETE",
    headers: headers(),
  });
  assert.equal(removed.status, 204);
  assert.equal(await call<InvestmentPolicy | null>(`/portfolios/${portfolio.id}/policy`), null);
});
