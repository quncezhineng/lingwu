import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterMemoriesForScope,
  memoryAgentKey,
  memoryScopeForTask,
  memoryScopeKeys,
} from "../apps/server/src/engine/memory-scope.ts";

const space = {
  id: "space",
  version: 1,
  currentAgentId: "agent-a",
  agents: [
    { id: "agent-a", threadId: "thread-a", name: "A" },
    { id: "agent-b", threadId: "thread-b", name: "B" },
  ],
};
const db = {
  get: async <T>() => space as T,
};

test("memoryAgentKey 把缺省与空白归属统一成 default", () => {
  assert.equal(memoryAgentKey({ agentId: "agent-a" }), "agent-a");
  assert.equal(memoryAgentKey({ agentId: "  agent-a  " }), "agent-a");
  assert.equal(memoryAgentKey({ agentId: "" }), "default");
  assert.equal(memoryAgentKey({ agentId: undefined }), "default");
  assert.equal(memoryAgentKey({}), "default");
});

test("memoryScopeKeys：账户级始终可读，Agent 与频道各自追加且去重", () => {
  assert.deepEqual(memoryScopeKeys({}), ["default"]);
  assert.deepEqual(memoryScopeKeys({ agentId: "agent-a" }), ["default", "agent-a"]);
  assert.deepEqual(memoryScopeKeys({ agentId: "agent-a", channelId: "channel-c" }), [
    "default",
    "agent-a",
    "channel-c",
  ]);
  assert.deepEqual(memoryScopeKeys({ agentId: "agent-a", channelId: "agent-a" }), [
    "default",
    "agent-a",
  ]);
  // 空白值不算有效作用域。
  assert.deepEqual(memoryScopeKeys({ agentId: "  ", channelId: "" }), ["default"]);
});

test("filterMemoriesForScope：只放行账户级 / 本 Agent / 本频道记忆", () => {
  const memories = [
    { id: "shared", agentId: "default", text: "全局偏好" },
    { id: "legacy", text: "旧数据无归属" },
    { id: "mine", agentId: "agent-a", text: "A 的私有记忆" },
    { id: "other", agentId: "agent-b", text: "B 的私有记忆" },
    { id: "channel", agentId: "channel-c", text: "频道共享记忆" },
    { id: "channel2", agentId: "channel-d", text: "别的频道记忆" },
  ];
  const visible = filterMemoriesForScope(memories, { agentId: "agent-a", channelId: "channel-c" });
  assert.deepEqual(
    visible.map((m) => m.id),
    ["shared", "legacy", "mine", "channel"],
  );
  // 普通 Agent 任务（无频道）读不到任何频道记忆。
  assert.deepEqual(
    filterMemoriesForScope(memories, { agentId: "agent-a" }).map((m) => m.id),
    ["shared", "legacy", "mine"],
  );
  // 无归属任务只能读到账户级记忆。
  assert.deepEqual(
    filterMemoriesForScope(memories, {}).map((m) => m.id),
    ["shared", "legacy"],
  );
});

test("memoryScopeForTask：从 threadId 反查 Agent，从 input.channelId 取频道", async () => {
  assert.deepEqual(await memoryScopeForTask(db, "owner", { threadId: "thread-a", input: {} }), {
    agentId: "agent-a",
  });
  assert.deepEqual(
    await memoryScopeForTask(db, "owner", {
      threadId: "thread-a",
      input: { channelId: "channel-c" },
    }),
    { agentId: "agent-a", channelId: "channel-c" },
  );
  // 线程未映射到 Agent（独立入口任务）时仍应按频道作用域读取。
  assert.deepEqual(
    await memoryScopeForTask(db, "owner", {
      threadId: "thread-unknown",
      input: { channelId: " channel-c " },
    }),
    { channelId: "channel-c" },
  );
  assert.deepEqual(await memoryScopeForTask(db, "owner", { input: { channelId: 42 } }), {});
});
