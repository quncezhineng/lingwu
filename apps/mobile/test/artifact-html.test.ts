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
