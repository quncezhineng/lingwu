import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentArtifact } from "../../../packages/domain/src/agent.ts";
import {
  latestWorkbenchInsights,
  moveInsightIndex,
  workbenchInsightView,
} from "../src/insight-view.ts";

function artifact(
  id: string,
  createdAt: string,
  data: Record<string, unknown> = {},
  summary = "",
): AgentArtifact {
  return {
    id,
    taskId: `task-${id}`,
    kind: "research_report",
    title: `Report ${id}`,
    summary,
    data,
    createdAt,
  };
}

test("today insights use only the three newest real artifacts", () => {
  const selected = latestWorkbenchInsights([
    artifact("old", "2026-10-24T08:00:00.000Z"),
    artifact("new", "2026-10-28T08:00:00.000Z"),
    artifact("middle", "2026-10-26T08:00:00.000Z"),
    artifact("latest", "2026-10-29T08:00:00.000Z"),
  ]);

  assert.deepEqual(
    selected.map((item) => item.id),
    ["latest", "new", "middle"],
  );
});

test("insight view reads real fields and ignores malformed values", () => {
  const view = workbenchInsightView(
    artifact(
      "insight",
      "2026-10-29T08:00:00.000Z",
      {
        category: "基金理解",
        takeaway: "除了费率，也要一起看跟踪误差与流动性。",
        symbolName: "沪深300ETF",
        code: "510300",
        basis: "跟踪误差与费率来自同一报告期。",
        limits: 42,
        revisit: "下一份定期报告发布后",
        plain: "同一指数也可能有不同的持有体验。",
      },
      "## 跟踪同一个指数\n\n**持有体验也可能不同。**",
    ),
  );

  assert.deepEqual(view, {
    title: "跟踪同一个指数 持有体验也可能不同。",
    takeaway: "除了费率，也要一起看跟踪误差与流动性。",
    category: "基金理解",
    symbolName: "沪深300ETF",
    code: "510300",
    basis: "跟踪误差与费率来自同一报告期。",
    limits: undefined,
    revisit: "下一份定期报告发布后",
    plain: "同一指数也可能有不同的持有体验。",
  });
});

test("insight paging stops at both ends", () => {
  assert.equal(moveInsightIndex(0, -1, 3), 0);
  assert.equal(moveInsightIndex(1, -1, 3), 0);
  assert.equal(moveInsightIndex(1, 1, 3), 2);
  assert.equal(moveInsightIndex(2, 1, 3), 2);
  assert.equal(moveInsightIndex(0, 1, 0), 0);
});
