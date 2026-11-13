/**
 * OPT-03 前端单测：模板/匹配契约解析、质量分默认值与复用改动率。
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  editReduction,
  parseMatches,
  parseTemplate,
  parseTemplates,
  type TemplateMetrics,
} from "../src/templates.ts";

const TEMPLATE = {
  id: "t-1",
  name: "AAPL 季报速览",
  description: "先结论后数据",
  kind: "REPORT",
  version: 2,
  structure: [
    { id: "s-1", title: "结论", order: 0, required: true },
    { id: "s-2", title: "关键数据", order: 1, required: true },
  ],
  fields: [
    { id: "f-1", label: "营收增速", required: true, unit: "%" },
    { id: "f-2", label: "毛利率", required: false, unit: "%" },
  ],
  voice: { tone: "formal", language: "zh", units: ["%"], conventions: ["先给结论"] },
  counterexamples: [
    { id: "c-1", text: "涨疯了", reason: "removed" },
    { id: "c-2", text: "大概率上涨", reason: "rewritten", preferred: "需结合估值判断" },
  ],
  sample_content: "营收同比 30%。",
  metrics: {
    reuse_count: 3,
    first_edit_ratio: 0.5,
    latest_edit_ratio: 0.2,
    needs_clarification: false,
    match_total: 5,
    accepted: 3,
    rejections: 2,
    match_accuracy: 0.6,
  },
  shared: true,
  shared_at: "2026-11-13T08:00:00.000Z",
  created_at: "2026-11-01T08:00:00.000Z",
  updated_at: "2026-11-12T08:00:00.000Z",
};

test("parseTemplate maps snake_case payload and keeps built_in false", () => {
  const template = parseTemplate(TEMPLATE);
  assert.ok(template);
  assert.equal(template.kind, "REPORT");
  assert.equal(template.version, 2);
  assert.equal(template.structure.length, 2);
  assert.equal(template.fields[0].unit, "%");
  assert.equal(template.voice.tone, "formal");
  assert.equal(template.counterexamples[1].preferred, "需结合估值判断");
  assert.equal(template.sampleContent, "营收同比 30%。");
  assert.equal(template.metrics.reuseCount, 3);
  assert.equal(template.metrics.matchAccuracy, 0.6);
  assert.equal(template.shared, true);
  assert.equal(template.builtIn, false);
});

test("parseTemplate rejects payloads without id, name or a known kind", () => {
  assert.equal(parseTemplate({ ...TEMPLATE, id: "" }), undefined);
  assert.equal(parseTemplate({ ...TEMPLATE, name: undefined }), undefined);
  assert.equal(parseTemplate({ ...TEMPLATE, kind: "UNKNOWN" }), undefined);
  assert.equal(parseTemplate("nope"), undefined);
});

test("parseTemplates drops malformed entries but keeps the valid ones", () => {
  const parsed = parseTemplates({ templates: [TEMPLATE, { id: "broken" }, 42] });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, "t-1");
  assert.deepEqual(parseTemplates({ nope: [] }), []);
});

test("parseMatches requires reasons and defaults metrics safely", () => {
  const matches = parseMatches({
    matches: [
      {
        template_id: "t-1",
        name: "AAPL 季报速览",
        version: 2,
        score: 88,
        reasons: ["同类型", "标题相似"],
        sample_content: "营收同比 30%。",
      },
      { template_id: "", score: 10 },
    ],
  });
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].reasons, ["同类型", "标题相似"]);
  assert.equal(matches[0].metrics.reuseCount, 0);
  assert.equal(matches[0].metrics.matchAccuracy, 1);
  assert.equal(matches[0].metrics.needsClarification, false);
});

test("editReduction reports how much editing reuse saves", () => {
  const metrics = (first: number, latest: number): TemplateMetrics => ({
    reuseCount: 2,
    firstEditRatio: first,
    latestEditRatio: latest,
    needsClarification: latest > 0.3,
    matchTotal: 0,
    accepted: 0,
    rejections: 0,
    matchAccuracy: 1,
  });
  assert.equal(editReduction(metrics(0.5, 0.2)), 0.6);
  assert.equal(editReduction(metrics(1, 1)), 0);
  assert.equal(editReduction(metrics(0, 0)), undefined);
  assert.equal(
    editReduction({
      reuseCount: 0,
      needsClarification: false,
      matchTotal: 0,
      accepted: 0,
      rejections: 0,
      matchAccuracy: 1,
    }),
    undefined,
  );
  // 最近一次改动变大时保留负值，界面才能如实展示「更费劲了」。
  assert.equal(editReduction(metrics(0.2, 0.4)), -1);
});
