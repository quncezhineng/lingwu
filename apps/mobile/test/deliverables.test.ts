/**
 * OPT-04 / OPT-05 前端单测：契约解析、无源数字拦截、状态门槛与 diff 解析。
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  canApprove,
  type Deliverable,
  numberSummary,
  parseDeliverable,
  parseDeliverables,
  parseDiff,
  stripInjectedDisclaimer,
  unresolvedNumbers,
} from "../src/deliverables.ts";

test("stripInjectedDisclaimer removes only the trailing injected block", () => {
  const disclaimer = "本内容由灵悟 AI 辅助生成，仅供投资参考。";
  assert.equal(
    stripInjectedDisclaimer(`营收 10%。\n\n---\n\n${disclaimer}`, disclaimer),
    "营收 10%。",
  );
  assert.equal(stripInjectedDisclaimer("营收 10%。", disclaimer), "营收 10%。");
  assert.equal(
    stripInjectedDisclaimer("正文提到本内容由灵悟 AI 辅助生成。", disclaimer),
    "正文提到本内容由灵悟 AI 辅助生成。",
  );
});

const PAYLOAD = {
  id: "d-1",
  kind: "REPORT",
  title: "AAPL 季报速览",
  content: "营收 30%，毛利率 45%。",
  status: "in_review",
  version: 2,
  citations: [
    {
      id: "c-1",
      number_text: "30%",
      source_url: "https://example.com/report",
      excerpt: "Revenue 30%.",
      fetched_at: "2026-11-13T08:00:00.000Z",
    },
  ],
  numbers: [
    {
      id: "n-1",
      text: "30%",
      start: 3,
      end: 6,
      status: "sourced",
      citation_id: "c-1",
      present: true,
    },
    {
      id: "n-2",
      text: "45%",
      start: 11,
      end: 14,
      status: "unsourced",
      present: true,
    },
  ],
  versions: [
    {
      id: "v-1",
      version: 1,
      title: "AAPL 季报速览",
      content: "营收 30%。",
      author: "agent",
      summary: "创建草稿",
      created_at: "2026-11-12T08:00:00.000Z",
    },
    {
      id: "v-2",
      version: 2,
      title: "AAPL 季报速览",
      content: "营收 30%，毛利率 45%。",
      author: "user",
      summary: "补充毛利率",
      created_at: "2026-11-13T08:00:00.000Z",
    },
  ],
  source_links: [{ type: "task", id: "t-1", label: "每日市场简报" }],
  disclaimer: "仅供研究参考。",
  audit: [
    {
      id: "a-1",
      at: "2026-11-13T08:00:00.000Z",
      actor: "user",
      action: "submitted",
      version: 2,
    },
  ],
  created_at: "2026-11-12T08:00:00.000Z",
  updated_at: "2026-11-13T08:00:00.000Z",
};

test("解析交付物契约：camelCase 字段、版本与回链", () => {
  const deliverable = parseDeliverable(PAYLOAD);
  assert.ok(deliverable);
  assert.equal(deliverable?.kind, "REPORT");
  assert.equal(deliverable?.status, "in_review");
  assert.equal(deliverable?.version, 2);
  assert.equal(deliverable?.numbers[0]?.citationId, "c-1");
  assert.equal(deliverable?.versions[1]?.author, "user");
  assert.equal(deliverable?.sourceLinks[0]?.type, "task");
  assert.equal(deliverable?.createdFrom, undefined);
  assert.equal(parseDeliverable({ id: "x", kind: "NOPE" }), undefined);
});

test("无源数字拦截审批，估算与删除后放行", () => {
  const deliverable = parseDeliverable(PAYLOAD) as Deliverable;
  assert.equal(unresolvedNumbers(deliverable).length, 1);
  assert.equal(canApprove(deliverable), false);
  assert.deepEqual(numberSummary(deliverable), { sourced: 1, estimate: 0, unsourced: 1 });

  const resolved = parseDeliverable({
    ...PAYLOAD,
    numbers: [PAYLOAD.numbers[0], { ...PAYLOAD.numbers[1], status: "estimate" }],
  }) as Deliverable;
  assert.equal(unresolvedNumbers(resolved).length, 0);
  assert.equal(canApprove(resolved), true);
});

test("列表解析只保留合法交付物", () => {
  const list = parseDeliverables({
    deliverables: [PAYLOAD, { id: "bad" }, null],
  });
  assert.equal(list.length, 1);
  assert.deepEqual(parseDeliverables({}), []);
});

test("diff 解析兼容 snake_case 并保留增删行", () => {
  const diff = parseDiff({
    from_version: 1,
    to_version: 2,
    added: ["营收 30%，毛利率 45%。"],
    removed: ["营收 30%。"],
    changed: true,
  });
  assert.ok(diff);
  assert.equal(diff?.fromVersion, 1);
  assert.equal(diff?.toVersion, 2);
  assert.deepEqual(diff?.added, ["营收 30%，毛利率 45%。"]);
  assert.equal(diff?.changed, true);
  assert.equal(parseDiff({ from_version: 1 }), undefined);
});
