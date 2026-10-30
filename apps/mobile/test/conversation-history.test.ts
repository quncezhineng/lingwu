import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "@copilotkit/react-native/headless";
import {
  mergePersistedThreadMessages,
  normalizeThreadMessages,
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
      { id: "compact", name: "browse_web", args: '{"url":"https://example.com"}' },
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
    {
      id: "compact",
      type: "function",
      function: { name: "browse_web", arguments: '{"url":"https://example.com"}' },
    },
  ]);
});

test("persisted history is normalized before it is sent back to the runtime", () => {
  const history = [
    { id: "user-1", role: "user", content: "Read this page" },
    {
      id: "assistant-1",
      role: "assistant",
      toolCalls: [
        {
          id: "call-1",
          name: "browse_web",
          args: '{"url":"https://example.com"}',
        },
      ],
    },
    { id: "tool-1", role: "tool", toolCallId: "call-1", content: "Page text" },
  ] as unknown as Message[];

  assert.deepEqual(normalizeThreadMessages(history), [
    history[0],
    {
      id: "assistant-1",
      role: "assistant",
      toolCalls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "browse_web", arguments: '{"url":"https://example.com"}' },
        },
      ],
    },
    history[2],
  ]);
});

test("canonical history is returned unchanged", () => {
  const history = [
    {
      id: "assistant-1",
      role: "assistant",
      toolCalls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "delegate_task", arguments: "{}" },
        },
      ],
    },
  ] satisfies Message[];

  assert.equal(normalizeThreadMessages(history), history);
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
