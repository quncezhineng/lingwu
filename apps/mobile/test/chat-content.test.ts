import assert from "node:assert/strict";
import { test } from "node:test";
import {
  displayUserMessage,
  findReferencedFile,
  markFileMentions,
  promptWithAttachments,
  promptWithSkills,
} from "../src/chat-content.ts";

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

test("a selected skill line stays out of the bubble and survives beside attachments", () => {
  const content = promptWithSkills(
    promptWithAttachments("Compare these filings", [{ id: "file-2", name: "data.csv" }]),
    [{ id: "earnings-analysis", name: "财报分析" }],
  );
  assert.match(content, /Selected skills: 财报分析 \(skill ID: earnings-analysis\)/);
  assert.deepEqual(displayUserMessage(content), {
    text: "Compare these filings",
    attachments: [{ name: "data.csv", id: "file-2" }],
  });
  assert.equal(promptWithSkills("Question", []), "Question");
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

test("selected files are appended as stable artifact references", () => {
  assert.equal(
    promptWithAttachments("Compare the filing", [
      { id: "file-1", name: "annual-report.pdf" },
      { id: "file-2", name: "notes.html" },
    ]),
    "Compare the filing\n\nAttached documents: annual-report.pdf (artifact ID: file-1), notes.html (artifact ID: file-2)",
  );
  assert.equal(promptWithAttachments("No files", []), "No files");
});

test("analysis artifacts are appended with references plus a bounded summary excerpt", () => {
  const content = promptWithAttachments(
    "结合市场简报",
    [],
    [
      {
        id: "artifact-1",
        taskId: "task-1",
        kind: "market_briefing",
        title: "今日市场简报",
        summary: "```markdown\n沪指收涨 0.8%，北向资金净流入 45 亿元。\n``` 半导体板块领涨。",
        data: {},
        createdAt: "2026-11-14T09:00:00.000Z",
      },
    ],
  );
  // 引用列表以尾逗号收尾，摘要块跟在后面供模型阅读。
  assert.match(content, /Attached documents: 今日市场简报 \(artifact ID: artifact-1\),\n/);
  assert.match(content, /Attached analysis documents:\n- 今日市场简报: 半导体板块领涨/);
  // 摘要里的 markdown 代码围栏与控制字符被抹平，不会把内部标记泄露成附件。
  assert.doesNotMatch(content, /```/);
  // 气泡只渲染标题胶囊：摘要块不进入用户可见正文，也不产生多余附件。
  assert.deepEqual(displayUserMessage(content), {
    text: "结合市场简报",
    attachments: [{ name: "今日市场简报", id: "artifact-1" }],
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
