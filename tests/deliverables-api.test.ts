import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { Deliverable, DeliverableDiff } from "../packages/domain/src/agent.ts";
import { MarketDataService } from "../packages/integrations/src/market-data.ts";

let db: Store;
let server: Awaited<ReturnType<typeof createApp>>;
let directory: string;
let token: string;
let config: Config;

const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
async function call<T>(path: string, init: RequestInit = {}, status = 200): Promise<T> {
  const response = await server.app.request(`/api/deliverables${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  assert.equal(response.status, status, await response.clone().text());
  return response.json() as Promise<T>;
}
const post = <T>(path: string, body: unknown, status = 200) =>
  call<T>(path, { method: "POST", body: JSON.stringify(body) }, status);

async function createDeliverable(content: string, citations: unknown[] = []): Promise<Deliverable> {
  return call<Deliverable>(
    "",
    {
      method: "POST",
      body: JSON.stringify({
        kind: "REPORT",
        title: "AAPL 季报速览",
        content,
        citations,
      }),
    },
    201,
  );
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-deliverables-"));
  db = await createStore({ dataDir: join(directory, "db") });
  config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    intelligenceApiKey: "test",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  server = await createApp(db, config, {
    market: new MarketDataService({ akshare: null, onError: () => undefined }),
  });
});

beforeEach(async () => {
  await server.agent.stop();
  server = await createApp(db, config, {
    market: new MarketDataService({ akshare: null, onError: () => undefined }),
  });
  token = (
    await (
      await server.app.request("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).json()
  ).token;
});

after(async () => {
  await server?.agent?.stop();
  await db?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("deliverables API requires a session", async () => {
  assert.equal((await server.app.request("/api/deliverables")).status, 401);
});

test("creates a draft and flags every number without a source", async () => {
  const deliverable = await createDeliverable("营收同比增长 30%，毛利率 45%。", [
    {
      number_text: "30%",
      source_url: "https://example.com/aapl-q3",
      excerpt: "Revenue grew 30% year over year.",
    },
  ]);
  assert.equal(deliverable.status, "draft");
  assert.equal(deliverable.version, 1);
  assert.equal(deliverable.numbers.length, 2);
  assert.deepEqual(
    deliverable.numbers.map((item) => [item.text, item.status]),
    [
      ["30%", "sourced"],
      ["45%", "unsourced"],
    ],
  );
  assert.equal(deliverable.audit[0]?.action, "created");
});

test("blocks approval on unsourced numbers, then allows estimate or removal", async () => {
  const deliverable = await createDeliverable("营收同比增长 30%，毛利率 45%。");
  await post(`/${deliverable.id}/submit`, {});
  const blocked = await server.app.request(`/api/deliverables/${deliverable.id}/approve`, {
    method: "POST",
    headers: headers(),
  });
  assert.equal(blocked.status, 409);
  assert.match(await blocked.text(), /unsourced number/);

  const first = deliverable.numbers[0];
  assert.ok(first);
  const estimated = await post<Deliverable>(`/${deliverable.id}/numbers/${first.id}/resolve`, {
    resolution: "estimate",
  });
  assert.equal(estimated.numbers[0]?.status, "estimate");
  const removed = await post<Deliverable>(
    `/${deliverable.id}/numbers/${deliverable.numbers[1]?.id}/resolve`,
    { resolution: "remove" },
  );
  assert.equal(removed.version, 2);
  assert.ok(!removed.content.includes("45%"));
  const approved = await post<Deliverable>(`/${deliverable.id}/approve`, {});
  assert.equal(approved.status, "approved");
  assert.equal(approved.approved_by, "user");
});

test("version update produces a reviewable diff", async () => {
  const deliverable = await createDeliverable("第一段。\n营收 10%。");
  const updated = await call<Deliverable>(`/${deliverable.id}`, {
    method: "PUT",
    body: JSON.stringify({
      content: "第一段。\n营收 10%，毛利率 20%。",
      change_summary: "补充毛利率",
    }),
  });
  assert.equal(updated.version, 2);
  const diff = await call<DeliverableDiff>(`/${deliverable.id}/diff?from=1&to=2`);
  assert.equal(diff.changed, true);
  assert.ok(diff.added.some((line) => line.includes("毛利率")));
  assert.ok(updated.versions[1]?.summary.includes("毛利率"));
});

test("compliance gate blocks prohibited return promises", async () => {
  const deliverable = await createDeliverable("这只股票稳赚不赔。");
  await post(`/${deliverable.id}/submit`, {});
  await post(`/${deliverable.id}/approve`, {});
  const response = await server.app.request(`/api/deliverables/${deliverable.id}/send`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ recipient: "client@example.com" }),
  });
  assert.equal(response.status, 409);
  assert.match(await response.text(), /合规|Compliance/);
  const report = await call<{ violations: { code: string }[] }>(`/${deliverable.id}/compliance`);
  assert.equal(report.violations[0]?.code, "return_promise");
});

test("send redacts PII, injects the disclaimer and keeps an audit trail", async () => {
  const deliverable = await createDeliverable("客户：张三\n手机 13800138000，预期收益 5%。", [
    {
      number_text: "5%",
      source_url: "https://example.com/report",
      excerpt: "Expected return 5%.",
    },
  ]);
  await post(`/${deliverable.id}/submit`, {});
  await post(`/${deliverable.id}/approve`, {});
  const sent = await post<Deliverable>(`/${deliverable.id}/send`, {
    recipient: "client@example.com",
  });
  assert.equal(sent.status, "sent");
  assert.equal(sent.recipient, "client@example.com");
  assert.ok(sent.content.includes("本内容由灵悟 AI 辅助生成"));
  assert.ok(sent.content.includes("138****8000"));
  assert.ok(sent.content.includes("客户：[已脱敏]"));
  assert.ok(sent.audit.some((entry) => entry.action === "pii_redacted"));
  assert.ok(sent.audit.some((entry) => entry.action === "disclaimer_injected"));
  assert.equal(sent.last_compliance?.disclaimer_missing, false);

  const csvResponse = await server.app.request(
    `/api/deliverables/audit/export?deliverable_id=${deliverable.id}`,
    { headers: headers() },
  );
  assert.equal(csvResponse.status, 200);
  const csv = await csvResponse.text();
  assert.match(csv, /deliverable_id,title,at,actor,action/);
  assert.match(csv, /disclaimer_injected/);
});

test("share links are read-only, disclaimer-bearing and revocable", async () => {
  const deliverable = await createDeliverable("营收 10%。", [
    {
      number_text: "10%",
      source_url: "https://example.com/report",
      excerpt: "Revenue 10%.",
    },
  ]);
  await post(`/${deliverable.id}/submit`, {});
  await post(`/${deliverable.id}/approve`, {});
  const share = await post<{ id: string; url: string }>(`/${deliverable.id}/share`, {}, 201);
  assert.match(share.url, /\/d\//);
  const page = await server.app.request(`/d/${share.id}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /只读分享/);
  assert.match(html, /本内容由灵悟 AI 辅助生成/);
  assert.match(html, /noindex/);

  const revoke = await server.app.request(`/api/deliverables/shares/${share.id}`, {
    method: "DELETE",
    headers: headers(),
  });
  assert.equal(revoke.status, 204);
  assert.equal((await server.app.request(`/d/${share.id}`)).status, 404);
});

test("task capture is idempotent and links back to its source task", async () => {
  const task = { id: "11111111-1111-4111-8111-111111111111", title: "每日市场简报 · 2026-11-13" };
  const first = await server.agent.deliverables.captureFromTask("task-owner", task, {
    kind: "BRIEFING",
    content: "指数上涨 1%。",
  });
  const second = await server.agent.deliverables.captureFromTask("task-owner", task, {
    kind: "BRIEFING",
    content: "重复触发。",
  });
  assert.equal(first.id, second.id);
  assert.equal(first.created_from?.type, "task");
  assert.equal(first.created_from?.id, task.id);
  assert.equal(first.status, "draft");
});
