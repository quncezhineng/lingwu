import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { DEFAULT_DISCLAIMER, DeliverablesService } from "../apps/server/src/engine/deliverables.ts";
import type {
  Deliverable,
  DeliverableAuditEntry,
  DeliverableStatus,
} from "../packages/domain/src/deliverable.ts";

let db: Store;
let server: Awaited<ReturnType<typeof createApp>>;
let directory: string;
let token: string;
let config: Config;

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

const put = <T>(path: string, body: unknown, status = 200) =>
  call<T>(path, { method: "PUT", body: JSON.stringify(body) }, status);

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
    intelligenceApiKey: "test-intelligence-key",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  server = await createApp(db, config);
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

test("deliverables require a session", async () => {
  assert.equal((await server.app.request("/api/deliverables")).status, 401);
});

test("deliverable state machine blocks unsourced numbers before approval and injects a disclaimer", async () => {
  const created = await post<Deliverable>(
    "/deliverables",
    {
      kind: "REPORT",
      title: "AAPL 服务业务复盘",
      content: "服务收入同比 14%。",
      sources: [
        { type: "symbol", id: "AAPL", title: "Apple", url: "https://example.com/aapl" },
        { type: "task", id: "task-1", title: "季度复盘" },
      ],
    },
    201,
  );
  assert.equal(created.status, "draft");
  assert.equal(created.version, 1);
  assert.equal(created.versions.length, 1);

  const updated = await put<Deliverable>(`/deliverables/${created.id}`, {
    content: "服务收入同比 14%，毛利率 42%。",
    editor: "agent",
  });
  assert.equal(updated.version, 2);
  assert.equal(updated.versions[1]?.editor, "agent");

  const diff = await call<{
    from: number;
    to: number;
    addedLines: number;
    removedLines: number;
    lines: { type: string; text: string }[];
  }>(`/deliverables/${created.id}/diff?from=1&to=2`);
  assert.equal(diff.from, 1);
  assert.equal(diff.to, 2);
  assert.ok(diff.lines.some((line) => line.type === "added" && line.text.includes("42%")));
  assert.ok(diff.lines.some((line) => line.type === "removed"));

  const submitted = await post<Deliverable>(`/deliverables/${created.id}/submit`, {
    actor: "user",
  });
  assert.equal(submitted.status, "in_review");

  const blockedResponse = await server.app.request(`/api/deliverables/${created.id}/approve`, {
    method: "POST",
    headers: headers(),
    body: "{}",
  });
  assert.equal(blockedResponse.status, 422);
  const blocked = await blockedResponse.json();
  assert.equal(blocked.code, "unsourced_numbers");
  assert.match(blocked.error, /14%/);
  assert.match(blocked.error, /42%/);

  const cited = await put<Deliverable>(`/deliverables/${created.id}`, {
    citations: [
      {
        match: "14%",
        url: "https://example.com/aapl-q3",
        fetchedAt: "2026-11-13T08:00:00.000Z",
        excerpt: "服务收入同比 +14%",
        sourceId: "AAPL",
      },
      { match: "42%", estimated: true },
    ],
  });
  assert.equal(cited.citations.length, 2);

  const approved = await post<Deliverable>(`/deliverables/${created.id}/approve`, {
    actor: "user",
  });
  assert.equal(approved.status, "approved");

  const sent = await post<Deliverable>(`/deliverables/${created.id}/send`, {
    recipients: ["reviewer@example.com"],
    channel: "email",
    actor: "user",
  });
  assert.equal(sent.status, "sent");
  assert.match(sent.content, new RegExp(DEFAULT_DISCLAIMER));
  assert.equal(sent.version, 3, "injected disclaimer creates a system version");
  assert.equal(sent.versions[2]?.editor, "system");
  assert.deepEqual(sent.send?.recipients, ["reviewer@example.com"]);

  const audit = await call<{ audit: DeliverableAuditEntry[] }>(`/deliverables/${created.id}/audit`);
  const actions = audit.audit.map((entry) => entry.action);
  assert.ok(actions.includes("created"));
  assert.ok(actions.includes("updated"));
  assert.ok(actions.includes("submitted"));
  assert.ok(actions.includes("compliance_blocked"));
  assert.ok(actions.includes("approved"));
  assert.ok(actions.includes("sent"));
});

test("send enforces prohibited wording and records the block", async () => {
  const created = await post<Deliverable>(
    "/deliverables",
    {
      kind: "ONE_PAGER",
      title: "收益承诺测试",
      content: "这只股票稳赚，目标价 120 元。",
      citations: [{ match: "120", estimated: true }],
    },
    201,
  );
  await post(`/deliverables/${created.id}/submit`, {});
  await post(`/deliverables/${created.id}/approve`, {});
  const response = await server.app.request(`/api/deliverables/${created.id}/send`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ recipients: ["client@example.com"], actor: "user" }),
  });
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.code, "prohibited_language");
  assert.match(body.error, /稳赚/);
  const audit = await call<{ audit: DeliverableAuditEntry[] }>(`/deliverables/${created.id}/audit`);
  assert.ok(audit.audit.some((entry) => entry.action === "compliance_blocked"));
  const stored = await call<Deliverable>(`/deliverables/${created.id}`);
  assert.equal(stored.status, "approved");
});

test("invalid transitions and edits after approval are rejected", async () => {
  const created = await post<Deliverable>(
    "/deliverables",
    { kind: "CUSTOM", title: "状态机", content: "内容 1 条。" },
    201,
  );
  await call(
    `/deliverables/${created.id}/send`,
    {
      method: "POST",
      body: JSON.stringify({ recipients: ["a@example.com"], actor: "user" }),
    },
    409,
  );
  await post(`/deliverables/${created.id}/submit`, {});
  await put(`/deliverables/${created.id}`, { citations: [{ match: "1", estimated: true }] });
  await post(`/deliverables/${created.id}/approve`, {});
  await call(
    `/deliverables/${created.id}`,
    { method: "PUT", body: JSON.stringify({ content: "批准后不能改" }) },
    409,
  );
  const archived = await post<Deliverable>(`/deliverables/${created.id}/archive`, {});
  assert.equal(archived.status, "archived");
});

test("deliverables list by source and stay private to their owner", async () => {
  const created = await post<Deliverable>(
    "/deliverables",
    {
      kind: "MINUTES",
      title: "来源回链",
      content: "会议纪要。",
      sources: [{ type: "thesis", id: "thesis-9", title: "服务收入论点" }],
    },
    201,
  );
  const list = await call<{ deliverables: { id: string; status: DeliverableStatus }[] }>(
    "/deliverables?sourceType=thesis&sourceId=thesis-9",
  );
  assert.ok(list.deliverables.some((item) => item.id === created.id));

  const service = new DeliverablesService(db);
  await assert.rejects(() => service.get("another-owner", created.id), /not found/);
});

test("Markdown and HTML exports include citations, sources and the disclaimer", async () => {
  const created = await post<Deliverable>(
    "/deliverables",
    {
      kind: "REPORT",
      title: "导出测试",
      content: "营收 10 亿元。",
      sources: [{ type: "artifact", id: "file-1", title: "财报" }],
      citations: [
        {
          match: "10",
          url: "https://example.com/report",
          fetchedAt: "2026-11-13T08:00:00.000Z",
          excerpt: "营收 10 亿元",
        },
      ],
    },
    201,
  );
  const markdown = await server.app.request(
    `/api/deliverables/${created.id}/export?format=markdown`,
    { headers: headers() },
  );
  assert.equal(markdown.status, 200);
  assert.match(markdown.headers.get("content-type") ?? "", /text\/markdown/);
  const md = await markdown.text();
  assert.match(md, /# 导出测试/);
  assert.match(md, /数字来源/);
  assert.match(md, /来源回链/);
  assert.match(md, new RegExp(DEFAULT_DISCLAIMER));

  const html = await server.app.request(`/api/deliverables/${created.id}/export?format=html`, {
    headers: headers(),
  });
  assert.match(html.headers.get("content-type") ?? "", /text\/html/);
  const page = await html.text();
  assert.match(page, /<h1>导出测试<\/h1>/);
  assert.match(page, /https:\/\/example.com\/report/);
  assert.match(page, new RegExp(DEFAULT_DISCLAIMER));
});
