import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "@copilotkit/react-native/headless";
import {
  mergePersistedThreadMessages,
  readableToolCalls,
  threadHistoryPath,
} from "../src/conversation-history.ts";

test("thread history uses the authenticated Rich Threads endpoint", () => {
  assert.equal(
    threadHistoryPath("thread/with space"),
    "/api/copilotkit/threads/thread%2Fwith%20space/messages",
  );
});

test("persisted history restores old turns and wins over partial replay duplicates", () => {
  const persisted = [
    { id: "user-1", role: "user", content: "Analyze AAPL" },
    { id: "assistant-1", role: "assistant", content: "Full saved answer" },
  ] satisfies Message[];
  const live = [
    { id: "assistant-1", role: "assistant", content: "Partial" },
    { id: "assistant-2", role: "assistant", content: "Live-only follow-up" },
  ] satisfies Message[];

  assert.deepEqual(mergePersistedThreadMessages(persisted, live), [
    { id: "user-1", role: "user", content: "Analyze AAPL" },
    { id: "assistant-1", role: "assistant", content: "Full saved answer" },
    { id: "assistant-2", role: "assistant", content: "Live-only follow-up" },
  ]);
});

test("persisted tool calls support nested and legacy top-level shapes", () => {
  const message = {
    role: "assistant",
    toolCalls: [
      { id: "nested", function: { name: "delegate_task", arguments: '{"title":"研究"}' } },
      { id: "legacy", name: "use_desktop", arguments: { action: "screenshot" } },
    ],
  };

  assert.deepEqual(readableToolCalls(message), [
    {
      id: "nested",
      type: "function",
      function: { name: "delegate_task", arguments: '{"title":"研究"}' },
    },
    {
      id: "legacy",
      type: "function",
      function: { name: "use_desktop", arguments: '{"action":"screenshot"}' },
    },
  ]);
});

test("incomplete persisted tool calls are skipped instead of crashing the transcript", () => {
  assert.deepEqual(
    readableToolCalls({
      role: "assistant",
      toolCalls: [null, {}, { id: "missing-function" }, { function: { name: "missing-id" } }],
    }),
    [],
  );
});
