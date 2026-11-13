import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { humanEditRatio } from "../apps/server/src/engine/templates.ts";
import type {
  Deliverable,
  TemplateMatch,
  UserTemplate,
} from "../packages/domain/src/deliverable.ts";
import { MarketDataService } from "../packages/integrations/src/market-data.ts";

let db: Store;
let server: Awaited<ReturnType<typeof createApp>>;
let directory: string;
let token: string;
let config: Config;

const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
async function call<T>(path: string, init: RequestInit = {}, status = 200): Promise<T> {
  const response = await server.app.request(`/api/templates${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  assert.equal(response.status, status, await response.clone().text());
  return response.json() as Promise<T>;
}
const post = <T>(path: string, body: unknown, status = 200) =>
  call<T>(path, { method: "POST", body: JSON.stringify(body) }, status);

async function createDeliverable(content: string, title = "AAPL 季报速览"): Promise<Deliverable> {
  const response = await server.app.request("/api/deliverables", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ kind: "REPORT", title, content }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json() as Promise<Deliverable>;
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-templates-"));
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

test("templates API requires a session", async () => {
  assert.equal((await server.app.request("/api/templates")).status, 401);
});

test("extracts structure, fields, voice and counterexamples from a deliverable", async () => {
  const deliverable = await createDeliverable(
    [
      "# 结论",
      "AAPL 服务收入同比增长 30%，单位：亿美元。",
      "",
      "## 风险提示",
      "截至 2026Q3，数据来源为公司财报。",
      "",
      "客户：张三，账号：6222020202020202。",
      "本季度可能继续超预期。",
    ].join("\n"),
  );
  await server.app.request(`/api/deliverables/${deliverable.id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({
      content: [
        "# 结论",
        "AAPL 服务收入同比增长 30%，单位：亿美元。",
        "",
        "## 风险提示",
        "截至 2026Q3，数据来源为公司财报。",
        "",
        "客户：张三，账号：6222020202020202。",
      ].join("\n"),
      change_summary: "删除多余猜测",
    }),
  });
  const created = await post<UserTemplate>(
    "/from-deliverable",
    { deliverable_id: deliverable.id, name: "我的季报口径" },
    201,
  );
  assert.equal(created.name, "我的季报口径");
  assert.deepEqual(
    created.structure.map((item) => item.title),
    ["结论", "风险提示"],
  );
  assert.ok(created.fields.some((item) => item.label === "单位"));
  assert.ok(created.voice.units.includes("亿美元") || created.voice.units.includes("美元"));
  assert.ok(created.voice.conventions.some((line) => line.includes("数据来源")));
  assert.ok(created.counterexamples.some((item) => item.text.includes("超预期")));
  assert.equal(created.built_in, false);
  assert.equal(created.version, 1);

  const again = await post<UserTemplate>(
    "/from-deliverable",
    { deliverable_id: deliverable.id },
    201,
  );
  assert.equal(again.id, created.id);
});

test("matches with explainable reasons and records not-this corrections", async () => {
  const deliverable = await createDeliverable(
    "# 结论\nAAPL 服务收入 30%。\n\n## 风险提示\n截至 2026Q3。",
  );
  const template = await post<UserTemplate>(
    "/from-deliverable",
    { deliverable_id: deliverable.id, name: "AAPL 季报口径" },
    201,
  );
  const matched = await post<{ matches: TemplateMatch[] }>("/match", {
    kind: "REPORT",
    title: "AAPL 季报",
    prompt: "按风险提示和结论写一份季报",
  });
  assert.equal(matched.matches[0]?.template_id, template.id);
  assert.ok(matched.matches[0]?.score >= 40);
  assert.ok(matched.matches[0]?.reasons.some((reason) => reason.includes("类型匹配")));
  assert.ok(matched.matches[0]?.reasons.some((reason) => reason.includes("章节命中")));

  await post(`/${template.id}/reject`, { kind: "REPORT", title: "AAPL 季报" });
  const rejected = await call<UserTemplate>(`/${template.id}`);
  assert.equal(rejected.metrics.rejections, 1);
  assert.equal(rejected.metrics.match_accuracy, 0);
  await post(`/${template.id}/accept`, { kind: "REPORT", title: "AAPL 季报" });
  const accepted = await call<UserTemplate>(`/${template.id}`);
  assert.equal(accepted.metrics.match_accuracy, 0.5);
});

test("template edits create versions and keep the previous snapshot", async () => {
  const deliverable = await createDeliverable("# 结论\nAAPL 服务收入 30%。");
  const template = await post<UserTemplate>(
    "/from-deliverable",
    { deliverable_id: deliverable.id },
    201,
  );
  const updated = await call<UserTemplate>(`/${template.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: "AAPL 季报 · v2",
      structure: [
        { title: "一句话结论", required: true },
        { title: "风险提示", required: false },
      ],
      fields: [{ label: "营收增速", required: true, unit: "%" }],
      voice: { tone: "concise", units: ["%"], conventions: ["金额单位统一用亿美元"] },
      summary: "收紧章节与字段",
    }),
  });
  assert.equal(updated.version, 2);
  assert.equal(updated.structure.length, 2);
  assert.equal(updated.versions[0]?.structure.length, 1);
  assert.equal(updated.versions[1]?.summary, "收紧章节与字段");
});

test("deliverable reuse records edit ratio and flags unclear conventions", async () => {
  const source = await createDeliverable(
    "# 结论\nAAPL 服务收入 30%。\n\n## 风险提示\n截至 2026Q3。",
  );
  const template = await post<UserTemplate>(
    "/from-deliverable",
    { deliverable_id: source.id, name: "AAPL 口径" },
    201,
  );
  const createdResponse = await server.app.request("/api/deliverables", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      kind: "REPORT",
      title: "AAPL 复用",
      content: "# 结论\nAAPL 服务收入 30%。\n\n## 风险提示\n截至 2026Q3。",
      template_id: template.id,
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as Deliverable;
  assert.ok(created.template_version?.startsWith(`${template.id}@v1`));
  const afterFirst = await call<UserTemplate>(`/${template.id}`);
  assert.equal(afterFirst.metrics.reuse_count, 1);
  assert.equal(afterFirst.metrics.first_edit_ratio, 0);

  await server.app.request(`/api/deliverables/${created.id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({
      content: "# 另一套结构\n完全换掉的正文，没有保留原来的口径与章节。",
      change_summary: "重写",
    }),
  });
  const afterEdit = await call<UserTemplate>(`/${template.id}`);
  assert.equal(afterEdit.metrics.reuse_count, 1);
  assert.ok((afterEdit.metrics.latest_edit_ratio ?? 0) > 0.3);
  assert.equal(afterEdit.metrics.needs_clarification, true);
});

test("human edit ratio compares real content and clamps to 1", () => {
  assert.deepEqual(humanEditRatio("同一段", "同一段"), { ratio: 0, edited: 0, total: 3 });
  const changed = humanEditRatio("第一段\n第二段", "第一段\n完全不同的内容");
  assert.ok(changed.ratio > 0 && changed.ratio <= 1);
  assert.equal(humanEditRatio("", "任意").ratio, 1);
});

test("shared templates are visible to other owners only after opt-in", async () => {
  const otherDeliverable = await server.agent.deliverables.create("other-owner", {
    kind: "REPORT",
    title: "他人研报",
    content: "# 结论\n另一套口径。",
    sources: [],
    citations: [],
  });
  const other = await server.agent.templates.createFromDeliverable(
    "other-owner",
    otherDeliverable,
    { name: "团队共享口径" },
  );
  const before = await call<{ templates: UserTemplate[] }>("/shared");
  assert.equal(before.templates.length, 0);
  await server.agent.templates.setShared("other-owner", other.id, true);
  const after = await call<{ templates: UserTemplate[] }>("/shared");
  assert.equal(after.templates[0]?.name, "团队共享口径");
});

test("shared templates expose only a redacted skeleton across owners", async () => {
  const source = await server.agent.deliverables.create("privacy-owner", {
    kind: "REPORT",
    title: "客户研报",
    content:
      "# 结论\n客户：张三，手机 13800138000。\n数据来源：客户张三 13800138000。\n\n## 风险提示\n仅供参考。",
    sources: [],
    citations: [],
  });
  // 第二版删掉敏感行，让反例与版本快照里都带上原始 PII。
  await server.agent.deliverables.update("privacy-owner", source.id, {
    content: "# 结论\n收入同比增长 30%。\n\n## 风险提示\n仅供参考。",
    change_summary: "移除客户信息",
    editor: "user",
  });
  const updatedSource = await server.agent.deliverables.get("privacy-owner", source.id);
  const template = await server.agent.templates.createFromDeliverable(
    "privacy-owner",
    updatedSource,
    { name: "客户敏感口径" },
  );
  assert.ok(template.counterexamples.some((item) => item.text.includes("13800138000")));
  assert.ok(updatedSource.versions.length === 2);
  await server.agent.templates.setShared("privacy-owner", template.id, true);
  const shared = await call<{ templates: UserTemplate[] }>("/shared");
  const entry = shared.templates.find((item) => item.id === template.id);
  assert.ok(entry);
  const serialized = JSON.stringify(entry);
  assert.doesNotMatch(serialized, /张三|13800138000/);
  assert.doesNotMatch(entry.sample_content, /收入同比增长|仅供参考/);
  assert.match(entry.sample_content, /## 结论/);
  assert.deepEqual(entry.counterexamples, []);
  assert.deepEqual(entry.versions, []);
  assert.deepEqual(entry.voice.conventions, []);
  assert.equal(entry.usage.length, 0);
});

test("template_version without template_id is rejected", async () => {
  const response = await server.app.request("/api/deliverables", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      kind: "REPORT",
      title: "伪造版本",
      content: "无数字结论。",
      template_version: "tpl-x@v99",
    }),
  });
  assert.equal(response.status, 422);
  const created = await createDeliverable("无数字结论。");
  const update = await server.app.request(`/api/deliverables/${created.id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ template_version: "tpl-x@v99" }),
  });
  assert.equal(update.status, 422);
});

test("a shared template can be reused and records usage on its owner", async () => {
  const otherDeliverable = await server.agent.deliverables.create("other-owner", {
    kind: "REPORT",
    title: "共享口径来源",
    content: "# 结论\n共享口径正文。",
    sources: [],
    citations: [],
  });
  const shared = await server.agent.templates.createFromDeliverable(
    "other-owner",
    otherDeliverable,
    { name: "可复用共享口径" },
  );
  await server.agent.templates.setShared("other-owner", shared.id, true);

  const createdResponse = await server.app.request("/api/deliverables", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      kind: "REPORT",
      title: "复用共享模板",
      content: "# 结论\n共享口径正文。",
      template_id: shared.id,
    }),
  });
  assert.equal(createdResponse.status, 201, await createdResponse.clone().text());
  const created = (await createdResponse.json()) as Deliverable;
  assert.equal(created.template_version, `${shared.id}@v1`);

  const updated = await server.agent.templates.require("other-owner", shared.id);
  assert.equal(updated.metrics.reuse_count, 1);
  assert.equal(updated.usage[0]?.deliverable_id, created.id);
});

test("a private template of another owner cannot be reused", async () => {
  const otherDeliverable = await server.agent.deliverables.create("private-owner", {
    kind: "REPORT",
    title: "私有来源",
    content: "# 结论\n私有正文。",
    sources: [],
    citations: [],
  });
  const privateTemplate = await server.agent.templates.createFromDeliverable(
    "private-owner",
    otherDeliverable,
    { name: "私有口径" },
  );
  const response = await server.app.request("/api/deliverables", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      kind: "REPORT",
      title: "越权复用",
      content: "# 结论\n私有正文。",
      template_id: privateTemplate.id,
    }),
  });
  assert.equal(response.status, 404);
});
