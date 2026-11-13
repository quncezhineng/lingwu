/**
 * OPT-04 / OPT-05 移动端单测：契约解析、状态机、编辑器校验、store 与导出。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { LingWuApi } from "../src/api.ts";
import {
  canEditDeliverable,
  createDeliverable,
  deliverableExportText,
  deliverableNumberTokens,
  deliverablesSnapshot,
  draftDeliverable,
  loadDeliverable,
  loadDeliverableAudit,
  loadDeliverableCompliance,
  loadDeliverableDiff,
  loadDeliverableShares,
  loadDeliverables,
  loadDeliverableVersions,
  nextDeliverableTransition,
  parseDeliverable,
  parseDeliverableAudit,
  parseDeliverableDiff,
  parseDeliverableList,
  reopenDeliverable,
  resetDeliverablesStore,
  resolveDeliverableNumber,
  revokeDeliverableShare,
  sendDeliverable,
  shareDeliverable,
  transitionDeliverable,
  unsourcedDeliverableNumbers,
  updateDeliverable,
  validateDeliverableDraft,
} from "../src/deliverables.ts";

const here = dirname(fileURLToPath(import.meta.url));
const source = (name: string) => readFileSync(resolve(here, "../src", name), "utf8");

function fakeApi(
  handler: (path: string, body?: unknown, method?: string) => unknown,
  text?: (path: string) => string,
): LingWuApi {
  return {
    token: "test-token",
    request: async (path: string, body?: unknown, method?: string) =>
      handler(path, body, method ?? (body === undefined ? "GET" : "POST")),
    text: async (path: string) => (text ? text(path) : ""),
  } as unknown as LingWuApi;
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "d-1",
    kind: "REPORT",
    title: "AAPL 复盘",
    content: "收入增长 23%。",
    status: "draft",
    version: 2,
    versions: [
      {
        version: 1,
        title: "AAPL 复盘",
        content: "收入增长。",
        editor: "user",
        at: "2026-11-13T08:00:00.000Z",
        addedLines: 1,
        removedLines: 0,
      },
      {
        version: 2,
        title: "AAPL 复盘",
        content: "收入增长 23%。",
        editor: "agent",
        at: "2026-11-13T08:05:00.000Z",
        addedLines: 1,
        removedLines: 1,
      },
    ],
    sources: [{ type: "symbol", id: "AAPL", title: "Apple", url: "https://example.com/aapl" }],
    citations: [{ id: "c-1", match: "23%", occurrence: 1, url: "https://example.com/revenue" }],
    disclaimer: "仅供研究参考",
    review: { submittedAt: "2026-11-13T08:06:00.000Z" },
    send: {},
    createdAt: "2026-11-13T08:00:00.000Z",
    updatedAt: "2026-11-13T08:06:00.000Z",
    ...overrides,
  };
}

test("解析详情、列表、审计与 diff", () => {
  const note = parseDeliverable(detail());
  assert.ok(note);
  assert.equal(note.version, 2);
  assert.equal(note.submittedAt, "2026-11-13T08:06:00.000Z");
  assert.equal(note.sources[0]?.type, "symbol");
  assert.equal(note.citations[0]?.url, "https://example.com/revenue");

  const list = parseDeliverableList({
    deliverables: [
      {
        id: "d-1",
        kind: "REPORT",
        title: "AAPL 复盘",
        status: "in_review",
        version: 2,
        excerpt: "收入增长 23%。",
        sources: [],
        submitted_at: "2026-11-13T08:06:00.000Z",
        updated_at: "2026-11-13T08:06:00.000Z",
      },
    ],
  });
  assert.equal(list?.length, 1);
  assert.equal(list?.[0]?.status, "in_review");
  assert.equal(list?.[0]?.submittedAt, "2026-11-13T08:06:00.000Z");

  const audit = parseDeliverableAudit({
    audit: [
      {
        id: "a-1",
        action: "submitted",
        actor: "user",
        at: "2026-11-13T08:06:00.000Z",
        version: 2,
      },
    ],
  });
  assert.equal(audit?.[0]?.action, "submitted");

  const diff = parseDeliverableDiff({
    from: 1,
    to: 2,
    addedLines: 1,
    removedLines: 1,
    lines: [
      { type: "removed", text: "收入增长。" },
      { type: "added", text: "收入增长 23%。" },
    ],
  });
  assert.equal(diff?.lines.length, 2);
  assert.equal(diff?.lines[1]?.type, "added");

  assert.equal(parseDeliverable({ id: "bad" }), undefined);
  assert.equal(parseDeliverableList({}), undefined);
});

test("状态机只给出合法主操作，且发送/归档后不可编辑", () => {
  assert.equal(nextDeliverableTransition("draft"), "submit");
  assert.equal(nextDeliverableTransition("in_review"), "approve");
  assert.equal(nextDeliverableTransition("approved"), "send");
  assert.equal(nextDeliverableTransition("sent"), undefined);
  assert.equal(nextDeliverableTransition("archived"), undefined);

  assert.equal(canEditDeliverable("draft"), true);
  assert.equal(canEditDeliverable("in_review"), true);
  assert.equal(canEditDeliverable("approved"), true);
  assert.equal(canEditDeliverable("sent"), false);
  assert.equal(canEditDeliverable("archived"), false);
});

test("草稿校验：标题与正文必填，默认类型为 CUSTOM", () => {
  const draft = draftDeliverable();
  assert.equal(draft.kind, "CUSTOM");
  assert.equal(validateDeliverableDraft(draft), "title");
  assert.equal(validateDeliverableDraft({ ...draft, title: "标题" }), "content");
  assert.equal(validateDeliverableDraft({ ...draft, title: "标题", content: "正文" }), undefined);
  assert.equal(draftDeliverable(parseDeliverable(detail()))?.kind, "REPORT");
});

test("store：列表、详情、版本、审计、diff 与状态迁移", async () => {
  resetDeliverablesStore();
  const calls: Array<{ path: string; method: string; body?: unknown }> = [];
  const api = fakeApi((path, body, method) => {
    calls.push({ path, method: method ?? "GET", body });
    if (path === "/api/deliverables") {
      return {
        deliverables: [
          {
            id: "d-1",
            kind: "REPORT",
            title: "AAPL 复盘",
            status: "draft",
            version: 2,
            excerpt: "收入增长 23%。",
            sources: [],
            updated_at: "2026-11-13T08:06:00.000Z",
          },
        ],
      };
    }
    if (path === "/api/deliverables/d-1") return detail();
    if (path === "/api/deliverables/d-1/versions") {
      return { versions: detail().versions, contents: undefined };
    }
    if (path === "/api/deliverables/d-1/audit") {
      return { audit: [] };
    }
    if (path.startsWith("/api/deliverables/d-1/diff")) {
      return { from: 1, to: 2, addedLines: 1, removedLines: 0, lines: [] };
    }
    if (path === "/api/deliverables/d-1/submit") {
      return detail({ status: "in_review" });
    }
    return detail();
  });

  await loadDeliverables(api);
  assert.equal(deliverablesSnapshot().status, "ready");
  assert.equal(deliverablesSnapshot().items[0]?.id, "d-1");

  await loadDeliverable(api, "d-1");
  assert.equal(deliverablesSnapshot().detail?.version, 2);
  await loadDeliverableVersions(api, "d-1");
  assert.equal(deliverablesSnapshot().versions.length, 2);
  await loadDeliverableAudit(api, "d-1");
  assert.deepEqual(deliverablesSnapshot().audit, []);
  await loadDeliverableDiff(api, "d-1", 1, 2);
  assert.equal(deliverablesSnapshot().diff?.to, 2);

  await transitionDeliverable(api, "d-1", "submit");
  assert.equal(deliverablesSnapshot().detail?.status, "in_review");

  const submit = calls.find((call) => call.path === "/api/deliverables/d-1/submit");
  assert.equal(submit?.method, "POST");
  assert.equal((submit?.body as { actor?: string })?.actor, "user");
});

test("store：新建、更新与发送携带正确载荷", async () => {
  resetDeliverablesStore();
  const calls: Array<{ path: string; method: string; body?: unknown }> = [];
  const api = fakeApi((path, body, method) => {
    calls.push({ path, method: method ?? "GET", body });
    return detail({ status: path.endsWith("/send") ? "sent" : "draft" });
  });

  await createDeliverable(api, {
    kind: "CUSTOM",
    title: "草稿",
    content: "正文",
    sources: [],
  });
  assert.equal(calls[0]?.path, "/api/deliverables");
  assert.equal(calls[0]?.method, "POST");

  await updateDeliverable(api, "d-1", { title: "新标题", content: "新正文" });
  assert.equal(calls[1]?.method, "PUT");
  assert.equal((calls[1]?.body as { title?: string })?.title, "新标题");

  await sendDeliverable(api, "d-1", { recipients: ["a@example.com"], channel: "manual" });
  assert.equal(calls[2]?.path, "/api/deliverables/d-1/send");
  assert.deepEqual((calls[2]?.body as { recipients?: string[] })?.recipients, ["a@example.com"]);
});

test("导出走鉴权文本接口并区分 Markdown / HTML", async () => {
  const paths: string[] = [];
  const api = fakeApi(
    () => undefined,
    (path) => {
      paths.push(path);
      return "# 标题";
    },
  );
  assert.equal(await deliverableExportText(api, "d-1", "markdown"), "# 标题");
  assert.equal(await deliverableExportText(api, "d-1", "html"), "# 标题");
  assert.deepEqual(paths, [
    "/api/deliverables/d-1/export?format=markdown",
    "/api/deliverables/d-1/export?format=html",
  ]);
});

test("交付物页面没有绕过服务端合规门：UI 只调用受控状态迁移", () => {
  const ui = source("deliverables-screen.tsx");
  assert.match(ui, /transitionDeliverable/);
  assert.match(ui, /sendDeliverable/);
  assert.match(ui, /deliverableUnsourcedError/);
  assert.match(ui, /deliverableProhibitedError/);
  assert.match(ui, /resolveDeliverableNumber/);
  assert.match(ui, /deliverableMarkEstimate/);
  assert.match(ui, /deliverableRemoveNumber/);
  assert.match(ui, /shareDeliverable/);
  assert.match(ui, /revokeDeliverableShare/);
  assert.match(ui, /reopenDeliverable/);
});

test("数字 token 保留正负号与单位，未溯源数字按 token 精确定位", () => {
  const tokens = deliverableNumberTokens("营收 10 亿元，净利 -5%，同比 +5%，市值 1.2 亿美元。");
  assert.deepEqual(
    tokens.map((token) => token.text),
    ["10 亿元", "-5%", "+5%", "1.2 亿美元"],
  );
  const pending = unsourcedDeliverableNumbers("营收 10 亿元，净利 -5%，同比 +5%。", [
    { id: "c-1", match: "10亿元", occurrence: 1, url: "https://example.com", excerpt: "x" },
    { id: "c-2", match: "-5%", occurrence: 1, estimated: true },
  ]);
  assert.deepEqual(pending, [{ text: "+5%", occurrence: 1 }]);

  assert.deepEqual(
    deliverableNumberTokens("## 1. 摘要\n1. 营收增长\n2. 毛利提升\n- 3) 风险可控\n增长 23%。"),
    [{ text: "23%", occurrence: 1 }],
  );
});

test("手机端数字处理、合规、分享与退回都走服务端受控接口", async () => {
  resetDeliverablesStore();
  const calls: Array<{ path: string; method: string; body?: unknown }> = [];
  const api = fakeApi((path, body, method) => {
    calls.push({ path, method: method ?? "GET", body });
    if (path.endsWith("/numbers/resolve")) return detail({ status: "draft" });
    if (path.endsWith("/reopen")) return detail({ status: "draft" });
    if (path.endsWith("/compliance")) {
      return {
        checkedAt: "2026-11-13T08:10:00.000Z",
        passed: false,
        disclaimer: "仅供研究参考",
        disclaimerMissing: true,
        violations: [],
        pii: [
          {
            code: "phone",
            label: "手机号",
            excerpt: "138****8000",
            redacted: "138****8000",
          },
        ],
        unsourcedNumbers: ["23%"],
        ruleEngine: "ok",
        modelReview: "not_configured",
      };
    }
    if (path.endsWith("/shares")) {
      return {
        shares: [
          {
            id: "share-1",
            deliverableId: "d-1",
            createdAt: "2026-11-13T08:00:00.000Z",
            revoked: false,
            sentVersion: 2,
            disclaimer: "仅供研究参考",
            url: "https://example.com/d/share-1",
          },
        ],
      };
    }
    if (path.endsWith("/share")) {
      return {
        id: "share-1",
        deliverableId: "d-1",
        createdAt: "2026-11-13T08:00:00.000Z",
        revoked: false,
        sentVersion: 2,
        disclaimer: "仅供研究参考",
        url: "https://example.com/d/share-1",
      };
    }
    return detail({ status: "sent", send: { sentAt: "x", recipients: [], sentVersion: 2 } });
  });

  await resolveDeliverableNumber(api, "d-1", {
    resolution: "source",
    match: "23%",
    url: "https://example.com/revenue",
    excerpt: "收入增长 23%",
  });
  await resolveDeliverableNumber(api, "d-1", { resolution: "estimate", match: "-5%" });
  await resolveDeliverableNumber(api, "d-1", { resolution: "remove", match: "+5%" });
  assert.deepEqual(
    calls.slice(0, 3).map((item) => item.body),
    [
      {
        resolution: "source",
        match: "23%",
        occurrence: 1,
        url: "https://example.com/revenue",
        excerpt: "收入增长 23%",
      },
      { resolution: "estimate", match: "-5%", occurrence: 1 },
      { resolution: "remove", match: "+5%", occurrence: 1 },
    ],
  );

  await reopenDeliverable(api, "d-1", "补充风险提示");
  assert.equal(calls[3]?.path, "/api/deliverables/d-1/reopen");

  const report = await loadDeliverableCompliance(api, "d-1");
  assert.equal(report.modelReview, "not_configured");
  assert.equal(report.pii[0]?.label, "手机号");

  const shares = await loadDeliverableShares(api, "d-1");
  assert.equal(shares[0]?.sentVersion, 2);
  const createdShare = await shareDeliverable(api, "d-1");
  assert.equal(createdShare.url, "https://example.com/d/share-1");
  await revokeDeliverableShare(api, "share-1");
  assert.match(calls.at(-1)?.path ?? "", /\/shares\/share-1$/);
  assert.equal(calls.at(-1)?.method, "DELETE");
});
