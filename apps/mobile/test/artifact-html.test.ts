import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentArtifact } from "../../../packages/domain/src/agent.ts";
import { artifactHasHtmlPreview, renderArtifactHtml } from "../src/artifact-html.ts";
import { tr } from "../src/i18n/translate.ts";

function artifact(data: Record<string, unknown>, summary = ""): AgentArtifact {
  return {
    id: "artifact-1",
    taskId: "task-1",
    kind: "report",
    title: "Test report",
    summary,
    data,
    createdAt: "2026-10-26T08:00:00.000Z",
  };
}

test("artifact summaries render Markdown instead of literal source", () => {
  const html = renderArtifactHtml(
    artifact({}, "## 结论\n\n**已完成**，详见 `report.html`。\n\n- 第一项\n- 第二项"),
  );
  assert.match(html, /<section class="summary markdown">/);
  assert.match(html, /<h2>结论<\/h2>/);
  assert.match(html, /<strong>已完成<\/strong>/);
  assert.match(html, /<code>report\.html<\/code>/);
  assert.doesNotMatch(html, /## 结论/);
});

test("complete HTML fields render in an isolated live preview", () => {
  const source = "<!DOCTYPE html><html><body><h1>Rendered</h1></body></html>";
  const value = artifact({ html: source });
  const html = renderArtifactHtml(value);
  assert.equal(artifactHasHtmlPreview(value), true);
  assert.match(html, /class="html-preview-frame"/);
  assert.match(html, /sandbox="allow-scripts allow-forms allow-modals allow-popups"/);
  assert.match(html, /srcdoc="&lt;!DOCTYPE html&gt;/);
  assert.match(html, /Content-Security-Policy/);
  assert.ok(html.includes(`<summary>${tr("agent.artifactViewSource")}</summary>`));
});

test("non-HTML artifacts do not enable executable previews", () => {
  const value = artifact({ notes: "# Markdown is handled as content, not an HTML preview" });
  assert.equal(artifactHasHtmlPreview(value), false);
  assert.doesNotMatch(renderArtifactHtml(value), /<iframe/);
});

test("markdown 字段按正文排版渲染，而不是塞进深色代码块", () => {
  const content = [
    "# 每日市场简报",
    "",
    "1. **隔夜指数**数据暂不可用。",
    "2. 自选标的异动：600519.SS -2.27%。",
    "",
    "> 数据不完整：部分指数暂不可用。",
  ].join("\n");
  const html = renderArtifactHtml(artifact({ content }));
  assert.match(html, /<div class="markdown">/);
  assert.match(html, /<h1>每日市场简报<\/h1>/);
  assert.match(html, /<strong>隔夜指数<\/strong>/);
  assert.match(html, /<blockquote>/);
  assert.doesNotMatch(html, /<pre class="code"># 每日市场简报/);
});

test("非 Markdown 的多行文本仍用深色代码块展示", () => {
  const html = renderArtifactHtml(artifact({ raw: "line one\nline two" }));
  assert.match(html, /<pre class="code">line one/);
  assert.doesNotMatch(html, /<div class="markdown">/);
});

test("报告头不重复弹层标题，但保留读屏语义", () => {
  const html = renderArtifactHtml(artifact({}));
  assert.match(html, /<h1 class="sr-only">Test report<\/h1>/);
  assert.doesNotMatch(html, /<h1>Test report<\/h1>/);
});

test("无结构的长摘要拆成可读段落，并给出要点速览", () => {
  const summary = [
    "截至2026-11-11，以7.02元计，总市值251.90亿元，PE(TTM)211.5倍、PB1.16倍。",
    "收购后归母净利润计算无影响，权益比例静态增厚为0；真实增厚来自降费，年化降费1.07-1.12亿元。",
    "跌破理论预警价区间，建议关注质押压力与复核进度。",
    "不给目标价、不给买卖建议。",
  ].join("");
  const html = renderArtifactHtml(artifact({ pb: 1.16 }, summary));
  assert.match(html, /<section class="summary markdown">/);
  assert.match(html, /class="takeaways"/);
  assert.ok(html.includes(tr("agent.artifactHighlights")));
  assert.ok((html.match(/<p>/g) ?? []).length >= 2, "长摘要应拆成多个段落");
});

test("顶层标量收敛为关键指标卡，明细键值形成规范列表", () => {
  const html = renderArtifactHtml(
    artifact({
      pb: 1.16,
      itc: {
        "1441 final": "2026-08-06 violation",
        "Tgv mass production": "2028-2029",
      },
    }),
  );
  assert.match(html, /class="metrics"/);
  assert.match(html, /<div class="metric-value numeric">1\.16<\/div>/);
  assert.match(html, /class="kv"/);
  assert.doesNotMatch(html, /<h2>Pb<\/h2>/);
  assert.ok(html.includes(tr("agent.artifactDetailsHeading")));
  assert.match(html, /class="disclaimer"/);
});

test("对象数组渲染为带表头、数值列右对齐的规范表格", () => {
  const html = renderArtifactHtml(
    artifact({
      peers: [
        { name: "东旭光电", pe: 12 },
        { name: "TCL科技", pe: 15 },
      ],
    }),
  );
  assert.match(html, /class="typeset-scroll"/);
  assert.match(html, /<th>Name<\/th>/);
  assert.match(html, /<th class="numeric">Pe<\/th>/);
});
