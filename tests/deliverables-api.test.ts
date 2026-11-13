import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import {
  createDeliverableSchema,
  DEFAULT_DISCLAIMER,
  DeliverablesService,
  detectPii,
  redactPii,
} from "../apps/server/src/engine/deliverables.ts";
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
      citations: [{ match: "120 元", estimated: true }],
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

test("invalid transitions are rejected and approved edits roll back to draft", async () => {
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
  const edited = await put<Deliverable>(`/deliverables/${created.id}`, {
    content: "批准后修改会退回草稿。",
  });
  assert.equal(edited.status, "draft");
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

test("numeric tokens keep sign and unit, so mismatched citations cannot fake approval", async () => {
  const created = await post<Deliverable>(
    "/deliverables",
    {
      kind: "REPORT",
      title: "单位与符号",
      content: "营收 10 亿元，净利 -5%，同比 +5%。",
    },
    201,
  );
  await post(`/deliverables/${created.id}/submit`, { actor: "user" });

  const blocked = await server.app.request(`/api/deliverables/${created.id}/approve`, {
    method: "POST",
    headers: headers(),
    body: "{}",
  });
  assert.equal(blocked.status, 422, "没有来源的数字必须先处理");

  // 只补“10”，不能覆盖正文里的“10 亿元”。
  const wrong = await server.app.request(`/api/deliverables/${created.id}/numbers/resolve`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      resolution: "source",
      match: "10",
      url: "https://example.com/revenue",
      excerpt: "营收 10 亿元",
    }),
  });
  assert.equal(wrong.status, 404);

  await post<Deliverable>(`/deliverables/${created.id}/numbers/resolve`, {
    resolution: "source",
    match: "10 亿元",
    url: "https://example.com/revenue",
    excerpt: "营收 10 亿元",
  });

  const approvedTooEarly = await server.app.request(`/api/deliverables/${created.id}/approve`, {
    method: "POST",
    headers: headers(),
    body: "{}",
  });
  assert.equal(approvedTooEarly.status, 422, "-5% 与 +5% 不能被互相覆盖");
  const body = await approvedTooEarly.json();
  assert.match(body.error, /-5%|%2B5%|\+5%/);

  await post<Deliverable>(`/deliverables/${created.id}/numbers/resolve`, {
    resolution: "estimate",
    match: "-5%",
  });
  const removed = await post<Deliverable>(`/deliverables/${created.id}/numbers/resolve`, {
    resolution: "remove",
    match: "+5%",
  });
  assert.equal(removed.version, created.version + 1);
  assert.doesNotMatch(removed.content, /\+5%/);

  const approved = await post<Deliverable>(`/deliverables/${created.id}/approve`, {
    actor: "user",
  });
  assert.equal(approved.status, "approved");
});

test("PII is detected, redacted before sending, and the model review hook is reported honestly", async () => {
  assert.deepEqual(
    detectPii("客户：张三 电话 13800138000 邮箱 zhangsan@example.com").map((item) => item.code),
    ["phone", "email", "client_name"],
  );
  assert.doesNotMatch(
    redactPii("客户：张三 电话 13800138000 邮箱 zhangsan@example.com"),
    /13800138000|zhangsan@example\.com|张三/,
  );

  const created = await post<Deliverable>(
    "/deliverables",
    {
      kind: "REPORT",
      title: "客户信息脱敏",
      content: "客户：张三 电话 13800138000，邮箱 zhangsan@example.com。结论：增长稳定。",
    },
    201,
  );
  await post(`/deliverables/${created.id}/submit`, {});
  await post(`/deliverables/${created.id}/approve`, {});
  const compliance = await call<{ pii: { code: string }[]; modelReview: string }>(
    `/deliverables/${created.id}/compliance`,
  );
  assert.equal(compliance.pii.length, 3);
  assert.equal(compliance.modelReview, "not_configured");

  const sent = await post<Deliverable>(`/deliverables/${created.id}/send`, {
    recipients: ["reviewer@example.com"],
  });
  assert.equal(sent.status, "sent");
  assert.doesNotMatch(sent.content, /13800138000|zhangsan@example\.com|张三/);
  assert.match(sent.content, /客户：\[已脱敏\]/);
  assert.equal(sent.compliance?.modelReview, "not_configured");
  const audit = await call<{ audit: DeliverableAuditEntry[] }>(`/deliverables/${created.id}/audit`);
  assert.ok(audit.audit.some((entry) => entry.action === "pii_redacted"));

  const hooked = new DeliverablesService(db, {
    piiReview: async () => [
      { code: "client_name", label: "模型复核", excerpt: "张三", redacted: "张*" },
    ],
  });
  const note = await hooked.create(
    "hook-owner",
    createDeliverableSchema.parse({ title: "模型复核", content: "客户资料见附件。" }),
  );
  const report = await hooked.checkCompliance(note);
  assert.equal(report.modelReview, "flagged");
  assert.equal(report.pii[0]?.label, "模型复核");
});

test("share links lock the sent snapshot and stop working after revocation or archive", async () => {
  const created = await post<Deliverable>(
    "/deliverables",
    {
      kind: "REPORT",
      title: "分享快照",
      content: "营收 10 亿元。",
      citations: [
        {
          match: "10 亿元",
          url: "https://example.com/revenue",
          fetchedAt: "2026-11-13T08:00:00.000Z",
          excerpt: "营收 10 亿元",
        },
      ],
    },
    201,
  );
  await post(`/deliverables/${created.id}/submit`, {});
  await post(`/deliverables/${created.id}/approve`, {});
  await post(`/deliverables/${created.id}/send`, { recipients: ["reader@example.com"] });

  const share = await post<{ id: string; url: string; sentVersion: number }>(
    `/deliverables/${created.id}/share`,
    {},
    201,
  );
  assert.ok(share.id);
  assert.match(share.url, /\/d\//);

  const page = await server.app.request(`/d/${share.id}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /分享快照/);
  assert.match(html, /noindex/);
  assert.match(html, new RegExp(DEFAULT_DISCLAIMER));

  const revoke = await server.app.request(`/api/deliverables/shares/${share.id}`, {
    method: "DELETE",
    headers: headers(),
  });
  assert.equal(revoke.status, 204);
  const revoked = await server.app.request(`/d/${share.id}`);
  assert.equal(revoked.status, 404);

  const second = await post<{ id: string }>(`/deliverables/${created.id}/share`, {}, 201);
  await post(`/deliverables/${created.id}/archive`, {});
  const archived = await server.app.request(`/d/${second.id}`);
  assert.equal(archived.status, 404);
  const shares = await call<{ shares: unknown[] }>(`/deliverables/${created.id}/shares`);
  assert.equal(shares.shares.length, 0, "归档后分享列表应立即为空");
});

test("in_review can be returned, approved edits roll back to draft, and templates carry their contract", async () => {
  const source = await post<Deliverable>(
    "/deliverables",
    {
      kind: "BRIEFING",
      title: "模板来源",
      content: "# 结论\n无数字结论。",
    },
    201,
  );
  const template = await post<{ id: string; version: number }>(
    "/templates/from-deliverable",
    {
      deliverable_id: source.id,
      name: "服务周报模板",
    },
    201,
  );
  const created = await post<Deliverable>(
    "/deliverables",
    {
      kind: "BRIEFING",
      title: "退回修改",
      content: "无数字结论。",
      template_id: template.id,
    },
    201,
  );
  assert.equal(created.template_id, template.id);
  assert.equal(created.template_version, `${template.id}@v${template.version}`);

  await post(`/deliverables/${created.id}/submit`, {});
  const reopened = await post<Deliverable>(`/deliverables/${created.id}/reopen`, {
    actor: "user",
    note: "补充风险提示",
  });
  assert.equal(reopened.status, "draft");

  await post(`/deliverables/${created.id}/submit`, {});
  const approved = await post<Deliverable>(`/deliverables/${created.id}/approve`, {});
  assert.equal(approved.status, "approved");

  const edited = await put<Deliverable>(`/deliverables/${created.id}`, {
    content: "无数字结论，补充风险提示。",
  });
  assert.equal(edited.status, "draft");
  assert.equal(edited.version, approved.version + 1);
  assert.equal(edited.review.approvedAt, undefined);

  const approvedAgenda = await post<Deliverable>(`/deliverables/${created.id}/submit`, {});
  assert.equal(approvedAgenda.status, "in_review");
  const reopenedApproved = await post<Deliverable>(`/deliverables/${created.id}/reopen`, {});
  assert.equal(reopenedApproved.status, "draft");
});

test("scheduled task outputs are captured idempotently and appear in /api/today", async () => {
  const service = new DeliverablesService(db);
  const first = await service.captureFromTask("local-user", {
    id: "scheduled-task-1",
    title: "盘前晨报",
    kind: "market_briefing",
    result: "隔夜美股收涨。",
  });
  const second = await service.captureFromTask("local-user", {
    id: "scheduled-task-1",
    title: "盘前晨报",
    kind: "market_briefing",
    result: "隔夜美股收涨。",
  });
  assert.equal(first.id, second.id);
  assert.equal(first.status, "draft");
  assert.equal(first.kind, "BRIEFING");
  assert.deepEqual(
    first.sources.map((source) => source.type),
    ["task"],
  );

  await post(`/deliverables/${first.id}/submit`, {});
  const today = await call<{
    deliverables: { pending_review_count: number; pending_review: { id: string }[] };
  }>("/today");
  assert.ok(today.deliverables.pending_review_count >= 1);
  assert.ok(today.deliverables.pending_review.some((item) => item.id === first.id));
});

test("ordered list markers and heading ordinals are not treated as unsourced numbers", async () => {
  const created = await post<Deliverable>(
    "/deliverables",
    {
      kind: "REPORT",
      title: "编号研报",
      content:
        "## 1. 摘要\n1. 营收增长\n2. 毛利提升\n1、渠道改善\n2、库存健康\n（1）风险可控\n（2）估值合理\n- 3) 结论：维持买入。",
    },
    201,
  );
  await post(`/deliverables/${created.id}/submit`, {});
  const approved = await post<Deliverable>(`/deliverables/${created.id}/approve`, {});
  assert.equal(approved.status, "approved");
});

test("model PII findings are actually redacted, and unredactable findings block sending", async () => {
  const hooked = new DeliverablesService(db, {
    piiReview: async (content) =>
      content.includes("王先生")
        ? [{ code: "client_name", label: "客户姓名", excerpt: "王先生", redacted: "王**" }]
        : [{ code: "client_name", label: "客户姓名", excerpt: "李女士", redacted: "李女士" }],
  });

  const ok = await hooked.create(
    "model-owner-a",
    createDeliverableSchema.parse({ title: "模型脱敏", content: "王先生同意该方案。" }),
  );
  await hooked.submit("model-owner-a", ok.id);
  await hooked.approve("model-owner-a", ok.id);
  const sent = await hooked.send("model-owner-a", ok.id, {
    recipients: ["reader@example.com"],
    channel: "manual",
    actor: "user",
  });
  assert.equal(sent.status, "sent");
  assert.doesNotMatch(sent.content, /王先生/);
  assert.match(sent.content, /王\*\*/);
  assert.equal(sent.compliance?.modelReview, "flagged");
  const audit = await hooked.audits("model-owner-a", ok.id);
  assert.ok(audit.some((entry) => entry.action === "pii_redacted"));

  const blocked = await hooked.create(
    "model-owner-b",
    createDeliverableSchema.parse({ title: "无法脱敏", content: "李女士同意该方案。" }),
  );
  await hooked.submit("model-owner-b", blocked.id);
  await hooked.approve("model-owner-b", blocked.id);
  await assert.rejects(
    () =>
      hooked.send("model-owner-b", blocked.id, {
        recipients: ["reader@example.com"],
        channel: "manual",
        actor: "user",
      }),
    (error: { code?: string }) => error.code === "pii_unredacted",
  );
  const stored = await hooked.get("model-owner-b", blocked.id);
  assert.equal(stored.status, "approved");
  assert.match(stored.content, /李女士/);
  const blockedAudit = await hooked.audits("model-owner-b", blocked.id);
  assert.ok(blockedAudit.some((entry) => entry.detail === "pii_unredacted"));
  assert.equal(
    blockedAudit.some((entry) => entry.action === "pii_redacted"),
    false,
  );
});

test("model PII findings that overlap rule hits are treated as already handled", async () => {
  const hooked = new DeliverablesService(db, {
    piiReview: async () => [
      {
        code: "phone",
        label: "手机号",
        excerpt: "13800138000",
        redacted: "138****8000",
      },
    ],
  });
  const note = await hooked.create(
    "model-owner-overlap",
    createDeliverableSchema.parse({
      title: "规则重叠",
      content: "客户电话 13800138000。",
    }),
  );
  await hooked.submit("model-owner-overlap", note.id);
  await hooked.approve("model-owner-overlap", note.id);
  const sent = await hooked.send("model-owner-overlap", note.id, {
    recipients: ["reader@example.com"],
    channel: "manual",
    actor: "user",
  });
  assert.equal(sent.status, "sent");
  assert.doesNotMatch(sent.content, /13800138000/);
  const audit = await hooked.audits("model-owner-overlap", note.id);
  assert.ok(audit.some((entry) => entry.action === "pii_redacted"));
  assert.equal(
    audit.some((entry) => entry.detail === "pii_unredacted"),
    false,
  );
});
