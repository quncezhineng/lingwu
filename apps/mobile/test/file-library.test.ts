import assert from "node:assert/strict";
import { test } from "node:test";
import type { Artifact } from "../../../packages/domain/src";
import type { AgentArtifact } from "../../../packages/domain/src/agent.ts";
import {
  buildFileLibrary,
  fileSourceBucket,
  filterFileLibrary,
  markdownExcerpt,
} from "../src/file-library.ts";

function file(id: string, createdAt: string): Artifact {
  return {
    id,
    name: `${id}.pdf`,
    mimeType: "application/pdf",
    size: 10,
    pageCount: 1,
    url: "",
    createdAt,
    source: "Test",
  };
}

function artifact(id: string, createdAt: string): AgentArtifact {
  return {
    id,
    taskId: `task-${id}`,
    kind: "report",
    title: id,
    summary: "",
    data: {},
    createdAt,
  };
}

test("the files library includes every generated research artifact without dropping files", () => {
  const library = buildFileLibrary(
    [file("older-file", "2026-10-24T08:00:00.000Z"), file("new-file", "2026-10-26T08:00:00.000Z")],
    [
      artifact("older-report", "2026-10-23T08:00:00.000Z"),
      artifact("new-report", "2026-10-25T08:00:00.000Z"),
    ],
  );

  assert.deepEqual(
    library.files.map((item) => item.id),
    ["new-file", "older-file"],
  );
  assert.deepEqual(
    library.artifacts.map((item) => item.id),
    ["new-report", "older-report"],
  );
});

test("research card excerpts remove Markdown syntax and stay bounded", () => {
  const excerpt = markdownExcerpt(
    "## 结论\n\n**已完成**，详见 [报告](https://example.com)。\n\n文件名 `report_2026_09.html`",
    60,
  );
  assert.equal(excerpt, "结论 已完成，详见 报告。 文件名 report_2026_09.html");
});

test("uploads are separated from analysis-generated files", () => {
  assert.equal(fileSourceBucket({ source: "Uploaded by you" }), "upload");
  assert.equal(fileSourceBucket({ source: " upload " }), "upload");
  assert.equal(fileSourceBucket({ source: "analysis" }), "analysis");
  assert.equal(fileSourceBucket({ source: "mail" }), "analysis");
});

test("file filters combine source, format and a case-insensitive name query", () => {
  const uploadedPdf = {
    ...file("annual-report", "2026-10-26T08:00:00.000Z"),
    name: "Annual Report.pdf",
    source: "Uploaded by you",
  };
  const generatedHtml = {
    ...file("market-notes", "2026-10-27T08:00:00.000Z"),
    name: "Market Notes.html",
    mimeType: "text/html",
    source: "analysis",
  };
  const generatedPdf = {
    ...file("earnings", "2026-10-28T08:00:00.000Z"),
    name: "Earnings.pdf",
    source: "analysis",
  };
  const uploadedMarkdown = {
    ...file("research-notes", "2026-10-28T09:00:00.000Z"),
    name: "Research Notes.md",
    mimeType: "text/markdown",
    source: "Uploaded by you",
  };
  const generatedWord = {
    ...file("board-pack", "2026-10-28T10:00:00.000Z"),
    name: "Board Pack.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    source: "analysis",
  };
  const files = [uploadedPdf, generatedHtml, generatedPdf, uploadedMarkdown, generatedWord];

  assert.deepEqual(
    filterFileLibrary(files, { source: "analysis", format: "all", query: "" }).map(
      (item) => item.id,
    ),
    ["market-notes", "earnings", "board-pack"],
  );
  assert.deepEqual(
    filterFileLibrary(files, { source: "all", format: "pdf", query: "REPORT" }).map(
      (item) => item.id,
    ),
    ["annual-report"],
  );
  assert.deepEqual(filterFileLibrary(files, { source: "upload", format: "html", query: "" }), []);
  assert.deepEqual(
    filterFileLibrary(files, { source: "upload", format: "markdown", query: "notes" }).map(
      (item) => item.id,
    ),
    ["research-notes"],
  );
  assert.deepEqual(
    filterFileLibrary(files, { source: "all", format: "word", query: "" }).map((item) => item.id),
    ["board-pack"],
  );
});
