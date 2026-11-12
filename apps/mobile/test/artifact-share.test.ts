import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentArtifact } from "../../../packages/domain/src/agent.ts";
import { artifactExportText, artifactFileName } from "../src/artifact-export.ts";
import { renderArtifactMarkdown } from "../src/artifact-html.ts";
import { tr } from "../src/i18n/translate.ts";

function artifact(
  data: Record<string, unknown>,
  overrides: Partial<AgentArtifact> = {},
): AgentArtifact {
  return {
    id: "artifact-1",
    taskId: "task-1",
    kind: "report",
    title: "宁德时代三季报速评",
    summary: "",
    data,
    createdAt: "2026-10-26T08:00:00.000Z",
    ...overrides,
  };
}

test("导出的 Markdown 保留标题、元信息与摘要正文", () => {
  const markdown = renderArtifactMarkdown(
    artifact({}, { summary: "## 结论\n\n毛利率环比改善，**现金流仍是短板**。" }),
  );
  assert.match(markdown, /^# 宁德时代三季报速评/);
  assert.match(markdown, /> .*2026/);
  assert.match(markdown, /## 结论/);
  assert.match(markdown, /\*\*现金流仍是短板\*\*/);
  // 报告类产物要带上合规声明。
  assert.ok(markdown.includes(tr("ui.disclaimer")));
});

test("标量进「关键指标」，记录数组渲染成 GFM 表格", () => {
  const markdown = renderArtifactMarkdown(
    artifact({
      rating: "增持",
      targetPrice: 268,
      segments: [
        { segment: "动力电池", revenue: 1200 },
        { segment: "储能", revenue: 380 },
      ],
    }),
  );
  assert.match(markdown, new RegExp(`## ${tr("agent.artifactKeyMetrics")}`));
  assert.match(markdown, /- \*\*Rating\*\*: 增持/);
  assert.match(markdown, /\| Segment \| Revenue \|/);
  assert.match(markdown, /\| 动力电池 \| 1,200 \|/);
});

test("表格单元格里的换行与竖线不会截断 Markdown 表格", () => {
  const markdown = renderArtifactMarkdown(
    artifact({ rows: [{ note: "第一行\n第二行 | 带竖线" }] }),
  );
  const row = markdown.split("\n").find((line) => line.startsWith("| 第一行"));
  assert.ok(row, markdown);
  assert.ok(!row.includes("\n"));
  assert.ok(row.includes("\\|"));
});

test("完整 HTML 字段不会把整页源码塞进 Markdown 导出", () => {
  const markdown = renderArtifactMarkdown(
    artifact({ report: "<!DOCTYPE html><html><body><h1>报告</h1></body></html>" }),
  );
  assert.ok(markdown.includes(tr("agent.artifactHtmlAttachment")));
  assert.doesNotMatch(markdown, /<!DOCTYPE html>/);
});

test("财务产物导出收入、支出、结余与分类占比", () => {
  const markdown = renderArtifactMarkdown(
    artifact(
      {
        income: 20000,
        spending: 8200,
        saved: 11800,
        categories: [{ name: "餐饮", amount: 2400 }],
        transactions: [{ date: "2026-10-01", merchant: "便利店", amount: 32 }],
      },
      { kind: "finance", title: "十月账单" },
    ),
  );
  assert.match(markdown, new RegExp(`\\*\\*${tr("agent.financeIncome")}\\*\\*: 20,000`));
  assert.match(markdown, new RegExp(`## ${tr("agent.whereMoneyWent")}`));
  assert.match(markdown, /\| 餐饮 \| 2,400 \|/);
  assert.match(markdown, /便利店/);
});

test("导出文件名清洗非法字符并补上日期后缀", () => {
  assert.equal(artifactFileName(artifact({}), "markdown"), "宁德时代三季报速评-2026-10-26.md");
  assert.equal(
    artifactFileName(artifact({}, { title: "宁德/三季报: 速评" }), "html"),
    "宁德 三季报 速评-2026-10-26.html",
  );
});

test("标题为空或日期不可解析时回退到默认文件名", () => {
  assert.equal(
    artifactFileName(artifact({}, { title: "   ", createdAt: "not-a-date" }), "html"),
    "lingwu-report.html",
  );
});

test("HTML 导出是自包含文档，Markdown 导出不是", () => {
  const value = artifact({ rating: "增持" });
  assert.match(artifactExportText(value, "html"), /^<!DOCTYPE html>/);
  assert.doesNotMatch(artifactExportText(value, "markdown"), /<html/);
});
