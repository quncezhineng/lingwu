import assert from "node:assert/strict";
import test from "node:test";
import { parseMemoryRecallResult } from "../src/memory-recall-result.ts";

const result = {
  query: "landlord",
  memories: [
    {
      id: "memory-1",
      text: "The landlord is Bob Li.",
      source: "User confirmed in chat",
      createdAt: "2026-10-25T02:00:00.000Z",
    },
  ],
};

test("parses recall result objects and replay JSON", () => {
  assert.deepEqual(parseMemoryRecallResult(result), result);
  assert.deepEqual(parseMemoryRecallResult(JSON.stringify(result)), result);
});

test("empty or malformed recall results are handled explicitly", () => {
  assert.deepEqual(parseMemoryRecallResult(""), { query: "", memories: [] });
  assert.deepEqual(parseMemoryRecallResult({}), { query: "", memories: [] });
  assert.equal(parseMemoryRecallResult("{not json"), undefined);
  assert.equal(parseMemoryRecallResult({ memories: [{ id: "missing" }] }), undefined);
});
