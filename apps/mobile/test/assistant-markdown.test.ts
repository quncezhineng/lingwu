import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assistantMarkdown,
  inlineHtmlDocuments,
  inlineHtmlFileName,
  isSafeAssistantUrl,
  scanInlineDocuments,
} from "../src/assistant-markdown.ts";
import { markFileMentions } from "../src/chat-content.ts";

test("assistant Markdown structures the reported response", () => {
  const html = assistantMarkdown.render(
    "**Short answer:** Use `SKILL.md`.\n\n- First check\n- Second check\n\n**Source URL:** https://docs.copilotkit.ai/learning",
  );
  assert.match(html, /<strong>Short answer:<\/strong>/);
  assert.match(html, /<code>SKILL\.md<\/code>/);
  assert.match(html, /<li>/);
  assert.match(html, /href="https:\/\/docs\.copilotkit\.ai\/learning"/);
  assert.doesNotMatch(html, /\*\*Short answer/);
});

test("incomplete Markdown and raw HTML stay harmless", () => {
  assert.doesNotThrow(() => assistantMarkdown.render("**Still streaming"));
  assert.match(assistantMarkdown.render("<script>alert(1)</script>"), /&lt;script&gt;/);
});

test("only absolute HTTP(S) links can open", () => {
  assert.equal(isSafeAssistantUrl("https://docs.copilotkit.ai/learning"), true);
  assert.equal(isSafeAssistantUrl("http://example.com"), true);
  for (const url of ["javascript:alert(1)", "file:///tmp/private", "//example.com", "not a URL"]) {
    assert.equal(isSafeAssistantUrl(url), false);
  }
});

test("bare file names survive Markdown formatting as inline file references", () => {
  const source = markFileMentions("把 **byd-stock-brief.html** 正文补完。", [
    { name: "byd-stock-brief.html" },
  ]);
  const html = assistantMarkdown.render(source);
  assert.match(html, /<strong><code>byd-stock-brief\.html<\/code><\/strong>/);
});

test("an inline HTML filename opens the fenced source that follows it", () => {
  const source = [
    "把下面内容存为 `reports/比亚迪月报.html`，双击打开即可。",
    "",
    "```html",
    "<!doctype html><html><body><h1>销量月报</h1></body></html>",
    "```",
    "",
    "完成后再打开 `later.html`。",
  ].join("\n");
  const scan = scanInlineDocuments(source);
  assert.equal(scan.documents.get("比亚迪月报.html")?.kind, "html");
  assert.match(scan.documents.get("比亚迪月报.html")?.source ?? "", /销量月报/);
  assert.equal(scan.documents.has("later.html"), false);
  assert.match(scan.markdown, /reports\/比亚迪月报\.html/);
  assert.doesNotMatch(scan.markdown, /<!doctype html>/);
});

test("an inline Markdown filename hides its source and keeps a rendered preview", () => {
  const source = [
    "把分析保存为 `analysis.md`。",
    "",
    "```markdown",
    "# 一季报结论",
    "",
    "- 收入增长",
    "- 关注现金流",
    "```",
  ].join("\n");
  const scan = scanInlineDocuments(source);
  assert.equal(scan.documents.get("analysis.md")?.kind, "markdown");
  assert.match(scan.documents.get("analysis.md")?.source ?? "", /# 一季报结论/);
  assert.match(scan.markdown, /analysis\.md/);
  assert.doesNotMatch(scan.markdown, /# 一季报结论/);
});

test("inline HTML matching ignores other code fences and normalizes paths", () => {
  const source = ["保存为 `./report.htm?version=1`。", "", "```js", "console.log('x')", "```"].join(
    "\n",
  );
  assert.equal(inlineHtmlFileName("./report.htm?version=1"), "report.htm");
  assert.equal(inlineHtmlDocuments(source).has("report.htm"), false);
  const scan = scanInlineDocuments(source);
  assert.equal(scan.documents.size, 0);
  assert.match(scan.markdown, /console\.log\('x'\)/);
});
