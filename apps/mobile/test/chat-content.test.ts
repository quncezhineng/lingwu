import assert from "node:assert/strict";
import { test } from "node:test";
import { displayUserMessage, findReferencedFile, markFileMentions } from "../src/chat-content.ts";

test("attachment metadata is hidden from the user bubble and returned as chips", () => {
  const content =
    "Compare these filings\n\nAttached documents: Alpha, Inc. report.pdf (artifact ID: file-1), data.csv (artifact ID: file-2)";
  assert.deepEqual(displayUserMessage(content), {
    text: "Compare these filings",
    attachments: [
      { name: "Alpha, Inc. report.pdf", id: "file-1" },
      { name: "data.csv", id: "file-2" },
    ],
  });
});

test("ordinary user text is returned unchanged", () => {
  assert.deepEqual(displayUserMessage("What changed this quarter?"), {
    text: "What changed this quarter?",
    attachments: [],
  });
});

test("a malformed attachment tail never leaks transport metadata into the bubble", () => {
  assert.deepEqual(displayUserMessage("Read this\n\nAttached documents: not-an-artifact"), {
    text: "Read this",
    attachments: [],
  });
});

test("inline code and relative links resolve to thread files", () => {
  const files = [
    { id: "file-1", name: "catl_report.html" },
    { id: "file-2", name: "notes.md" },
  ];
  assert.equal(findReferencedFile("catl_report.html", files)?.id, "file-1");
  assert.equal(findReferencedFile("./catl_report.html", files)?.id, "file-1");
  assert.equal(findReferencedFile("reports/catl_report.html", files)?.id, "file-1");
  assert.equal(findReferencedFile("notes.md?download=1", files)?.id, "file-2");
  assert.equal(findReferencedFile("file-2", files)?.id, "file-2");
  assert.equal(findReferencedFile("catl%20report.html", files), undefined);
  assert.equal(findReferencedFile("https://example.com/report.pdf", files), undefined);
  assert.equal(
    findReferencedFile("report.html", [
      { id: "file-3", name: "report.html" },
      { id: "file-4", name: "report.html" },
    ]),
    undefined,
  );
});

test("bare file names in prose become tappable inline references", () => {
  const files = [
    { name: "byd-stock-brief.html" },
    { name: "monthly-sales.csv" },
    { name: "report (final).pdf" },
  ];
  assert.equal(
    markFileMentions("把 **byd-stock-brief.html** 正文补完，并附上 monthly-sales.csv。", files),
    "把 **`byd-stock-brief.html`** 正文补完，并附上 `monthly-sales.csv`。",
  );
  assert.equal(
    markFileMentions("打开 report (final).pdf 看一下", files),
    "打开 `report (final).pdf` 看一下",
  );
});

test("file mention markup leaves existing code, links and HTML alone", () => {
  const files = [{ name: "byd-stock-brief.html" }];
  const source = [
    "`byd-stock-brief.html`",
    "[已有链接](byd-stock-brief.html)",
    "```",
    "byd-stock-brief.html",
    "```",
    '<span title="byd-stock-brief.html">x</span>',
  ].join("\n");
  assert.equal(markFileMentions(source, files), source);
});

test("ambiguous or partial file names are not linked", () => {
  const files = [{ name: "report.html" }, { name: "report.html" }, { name: "notes.md" }];
  assert.equal(
    markFileMentions("report.html and myreport.html", files),
    "report.html and myreport.html",
  );
  assert.equal(markFileMentions("notes.md", files), "`notes.md`");
});
