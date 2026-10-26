import assert from "node:assert/strict";
import test from "node:test";
import { filterArchivedThreads } from "../src/archived-threads.ts";

const threads = [
  { id: "active", name: "Active research", archived: false },
  { id: "archived-1", name: "BYD September report", archived: true },
  { id: "archived-2", name: "Gold ETF notes", archived: true },
  { id: "archived-1", name: "BYD September report duplicate", archived: true },
];

test("archived threads exclude active conversations and duplicate ids", () => {
  assert.deepEqual(
    filterArchivedThreads(threads, "").map((thread) => thread.id),
    ["archived-1", "archived-2"],
  );
});

test("archived thread search is trimmed and case-insensitive", () => {
  assert.deepEqual(
    filterArchivedThreads(threads, "  gold  ").map((thread) => thread.name),
    ["Gold ETF notes"],
  );
  assert.deepEqual(
    filterArchivedThreads(threads, "BYD").map((thread) => thread.name),
    ["BYD September report"],
  );
});

test("unmatched searches return an empty list", () => {
  assert.deepEqual(filterArchivedThreads(threads, "semiconductor"), []);
});
