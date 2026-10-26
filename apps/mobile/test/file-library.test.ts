import assert from "node:assert/strict";
import { test } from "node:test";
import type { Artifact } from "../../../packages/domain/src";
import type { AgentArtifact } from "../../../packages/domain/src/agent.ts";
import { buildFileLibrary, markdownExcerpt } from "../src/file-library.ts";

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
