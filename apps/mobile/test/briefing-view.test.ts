import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentArtifact } from "../../../packages/domain/src/agent.ts";
import {
  briefingIndices,
  briefingInsightView,
  briefingLead,
  briefingRelationStats,
  latestBriefingInsights,
} from "../src/briefing-view.ts";

function artifact(
  id: string,
  createdAt: string,
  data: Record<string, unknown> = {},
  summary = "",
): AgentArtifact {
  return {
    id,
    taskId: `task-${id}`,
    kind: "report",
    title: `Report ${id}`,
    summary,
    data,
    createdAt,
  };
}

test("briefing reading clues use the three newest artifacts", () => {
  const selected = latestBriefingInsights([
    artifact("old", "2026-10-24T08:00:00.000Z"),
    artifact("new", "2026-10-27T08:00:00.000Z"),
    artifact("middle", "2026-10-26T08:00:00.000Z"),
    artifact("latest", "2026-10-28T08:00:00.000Z"),
  ]);

  assert.deepEqual(
    selected.map((item) => item.id),
    ["latest", "new", "middle"],
  );
});

test("briefing lead skips blank summary entries and index blocks stay bounded", () => {
  assert.equal(briefingLead(["  ", "主要指数表现分化。"]), "主要指数表现分化。");
  assert.equal(briefingLead([" ", ""]), "");
  assert.deepEqual(
    briefingIndices([
      { name: "A", value: 1, changePercent: 0.1 },
      { name: "B", value: 2, changePercent: 0.2 },
      { name: "C", value: 3, changePercent: -0.3 },
      { name: "D", value: 4, changePercent: 0.4 },
    ]).map((item) => item.name),
    ["A", "B", "C"],
  );
});

test("briefing insight view reads real artifact fields and strips Markdown", () => {
  const view = briefingInsightView(
    artifact(
      "insight",
      "2026-10-28T08:00:00.000Z",
      { category: "财报理解", symbolName: "贵州茅台", code: "600519.SS" },
      "## 利润增长\n\n**还要看看现金有没有跟上。**",
    ),
  );

  assert.deepEqual(view, {
    title: "利润增长 还要看看现金有没有跟上。",
    category: "财报理解",
    symbolName: "贵州茅台",
    code: "600519.SS",
  });
});

test("briefing relation counts only rows backed by a real alert", () => {
  assert.deepEqual(
    briefingRelationStats([
      { code: "AAPL", name: "Apple", price: 1, changePercent: 2, alert: "news" },
      { code: "MSFT", name: "Microsoft", price: 1, changePercent: 0.4 },
      { code: "TSLA", name: "Tesla", price: 1, changePercent: -3, alert: "change_threshold" },
    ]),
    { total: 3, moved: 2 },
  );
});
