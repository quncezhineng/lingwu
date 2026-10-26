import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownPreviewDocument, sandboxedDocument } from "../src/open-html-document.ts";

test("chat HTML is wrapped in an opaque, script-capable sandbox", () => {
  const source = "<!doctype html><html><head><title>Report</title></head><body>Page</body></html>";
  const document = sandboxedDocument(source);
  assert.match(
    document,
    /<head><meta http-equiv="Content-Security-Policy" content="[^"]*sandbox allow-scripts/,
  );
  assert.match(document, /style-src 'unsafe-inline'/);
  assert.doesNotMatch(document, /allow-same-origin/);
  assert.match(document, /<title>Report<\/title>/);
});

test("an HTML fragment receives a complete document shell", () => {
  const document = sandboxedDocument("<main>Report</main>");
  assert.match(document, /^<!doctype html><html><head>/);
  assert.match(document, /<body><main>Report<\/main><\/body><\/html>$/);
});

test("a Markdown file becomes a styled rendered preview", () => {
  const html = markdownPreviewDocument("# 结论\n\n**收入增长**\n\n- 现金流改善", "report.md");
  assert.match(html, /<title>report\.md<\/title>/);
  assert.match(html, /<h1>结论<\/h1>/);
  assert.match(html, /<strong>收入增长<\/strong>/);
  assert.match(html, /<li>现金流改善<\/li>/);
  assert.doesNotMatch(html, /# 结论/);
});
