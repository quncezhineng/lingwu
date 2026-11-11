import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assistantMarkdown,
  inlineHtmlDocuments,
  inlineHtmlFileName,
  isSafeAssistantUrl,
  presentAssistantMarkdown,
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

test("a finished message renders ##一 headings and a GFM table", () => {
  const source = [
    "##一、为什么现在特别难判断",
    "",
    "| 口径 | 价格 |",
    "| --- | --- |",
    "| 伦敦金 | 4036 |",
    "",
    "- 第一项",
  ].join("\n");
  const html = assistantMarkdown.render(presentAssistantMarkdown(source));
  assert.match(html, /<h2>一、为什么现在特别难判断<\/h2>/);
  assert.doesNotMatch(html, /##一/);
  assert.match(html, /<th>口径<\/th>/);
  assert.match(html, /<td>4036<\/td>/);
  assert.match(html, /<li>/);
});

test("a GFM table renders, including a divider glued on by a stream chunk", () => {
  const finished = presentAssistantMarkdown(
    [
      "先说结论。",
      "",
      "| 口径 | 价格 | 时间 |",
      "| --- | --- | --- |",
      "| 伦敦金 | 4036 | 2026-11-11 |",
    ].join("\n"),
  );
  assert.match(assistantMarkdown.render(finished), /<table>/);
  assert.match(assistantMarkdown.render(finished), /<th>口径<\/th>/);
  assert.match(assistantMarkdown.render(finished), /<td>4036<\/td>/);

  const glued = presentAssistantMarkdown("| 口径 | 价格 | 时间 |---|---|---|");
  const gluedHtml = assistantMarkdown.render(glued);
  assert.match(gluedHtml, /<th>口径<\/th>/);
  assert.match(gluedHtml, /<th>时间<\/th>/);
  assert.doesNotMatch(gluedHtml, /\|---\|/);
});

test("pipe rows without a divider still render as a table and no prices are invented", () => {
  const source = ["| 口径 | 价格 |", "| 伦敦金 | 4036 |"].join("\n");
  const html = assistantMarkdown.render(presentAssistantMarkdown(source));
  assert.match(html, /<th>口径<\/th>/);
  assert.match(html, /<td>伦敦金<\/td>/);
  assert.match(html, /<td>4036<\/td>/);
  assert.doesNotMatch(html, /<td>---<\/td>/);
});

test("a streaming chunk hides an unfinished pipe row and closes bold", () => {
  const partial = presentAssistantMarkdown(
    ["| 口径 | 价格 |", "| --- | --- |", "| 伦敦金 | 40"].join("\n"),
    true,
  );
  const html = assistantMarkdown.render(partial);
  assert.match(html, /<th>口径<\/th>/);
  assert.doesNotMatch(html, /伦敦金/);
  assert.doesNotMatch(html, /\| 口径/);

  const bold = assistantMarkdown.render(presentAssistantMarkdown("关键位置是 **4000 美元", true));
  assert.match(bold, /<strong>4000 美元<\/strong>/);
  assert.doesNotMatch(bold, /\*\*/);
});

test("bold that starts after a bullet is not left as a trailing **", () => {
  const paired = "- **买入时不会因为溢价多付钱**\n- **那时候买入是贵着买**";
  const pairedHtml = assistantMarkdown.render(presentAssistantMarkdown(paired));
  assert.match(pairedHtml, /<strong>买入时不会因为溢价多付钱<\/strong>/);
  assert.match(pairedHtml, /<strong>那时候买入是贵着买<\/strong>/);
  assert.doesNotMatch(pairedHtml, /\*\*/);

  const lostOpening = "- 买入时不会因为溢价多付钱**\n- 那时候买入是贵着买**";
  const lostHtml = assistantMarkdown.render(presentAssistantMarkdown(lostOpening));
  assert.match(lostHtml, /<li><strong>买入时不会因为溢价多付钱<\/strong><\/li>/);
  assert.match(lostHtml, /<li><strong>那时候买入是贵着买<\/strong><\/li>/);
  assert.doesNotMatch(lostHtml, /\*\*/);
});

test("a settled message does not leave a literal ** between words", () => {
  const html = assistantMarkdown.render(presentAssistantMarkdown("定价**不是降息"));
  assert.doesNotMatch(html, /\*\*/);
  assert.match(html, /定价不是降息/);
  const paired = assistantMarkdown.render(
    presentAssistantMarkdown("也没有明显的**抛压**，是个很中性的读数。"),
  );
  assert.match(paired, /<strong>抛压<\/strong>/);
  assert.doesNotMatch(paired, /\*\*/);
  const list = assistantMarkdown.render(presentAssistantMarkdown("- 第一项\n- 第二项"));
  assert.match(list, /<li>/);
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
