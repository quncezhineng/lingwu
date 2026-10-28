import assert from "node:assert/strict";
import { test } from "node:test";
import {
  rankSearchDocuments,
  recentSearchDocuments,
  type SearchDocument,
} from "../src/global-search.ts";

const documents: SearchDocument[] = [
  {
    id: "task-1",
    kind: "task",
    title: "利率与政策跟踪",
    detail: "等待输入",
    keywords: "央行 汇率 流动性",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
  {
    id: "file-1",
    kind: "file",
    title: "2026 年利率展望.pdf",
    detail: "上传资料",
    updatedAt: "2026-10-26T10:00:00.000Z",
  },
  {
    id: "mail-1",
    kind: "mail",
    title: "Weekly policy note",
    detail: "research@example.com",
    keywords: "interest rate policy",
    updatedAt: "2026-10-28T10:00:00.000Z",
  },
];

test("search is case-insensitive and accepts text from metadata", () => {
  assert.deepEqual(
    rankSearchDocuments(documents, "POLICY").map((document) => document.id),
    ["mail-1"],
  );
  assert.deepEqual(
    rankSearchDocuments(documents, "政策").map((document) => document.id),
    ["task-1"],
  );
});

test("every whitespace-separated term must match", () => {
  assert.deepEqual(
    rankSearchDocuments(documents, "利率 2026").map((document) => document.id),
    ["file-1"],
  );
  assert.equal(rankSearchDocuments(documents, "利率 不存在").length, 0);
});

test("title matches rank ahead of metadata matches", () => {
  const documents: SearchDocument[] = [
    { id: "metadata", kind: "file", title: "研究资料", detail: "利率复盘" },
    { id: "title", kind: "task", title: "利率与政策跟踪", detail: "" },
  ];
  assert.deepEqual(
    rankSearchDocuments(documents, "利率").map((document) => document.id),
    ["title", "metadata"],
  );
});

test("recent records prefer valid timestamps and preserve input order for ties", () => {
  assert.deepEqual(
    recentSearchDocuments(documents).map((document) => document.id),
    ["mail-1", "task-1", "file-1"],
  );
  assert.equal(rankSearchDocuments(documents, "利率", 0).length, 0);
});
