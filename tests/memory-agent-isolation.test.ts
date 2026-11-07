import assert from "node:assert/strict";
import { test } from "node:test";
import { agentIdForThread } from "../apps/server/src/agent-space.ts";
import { recallMemories } from "../apps/server/src/engine/memory-recall.ts";
import type { AgentMemory } from "../packages/domain/src/agent.ts";

test("agentIdForThread resolves threadId to agent id", async () => {
  const space = {
    id: "space",
    version: 1,
    currentAgentId: "agent-a",
    agents: [
      { id: "agent-a", threadId: "thread-1", name: "A" },
      { id: "agent-b", threadId: "thread-2", name: "B" },
    ],
  };
  const db: {
    get: <T>(owner: string, kind: string, id: string) => Promise<T | null>;
  } = {
    get: async <T>() => space as T,
  };
  assert.equal(await agentIdForThread(db, "owner", "thread-1"), "agent-a");
  assert.equal(await agentIdForThread(db, "owner", "thread-2"), "agent-b");
  assert.equal(await agentIdForThread(db, "owner", "missing"), undefined);
  assert.equal(await agentIdForThread(db, "owner", undefined), undefined);
});

test("recallMemories scores by keyword and recency", () => {
  const memories: AgentMemory[] = [
    { id: "1", text: "User prefers to buy in batches", source: "chat", createdAt: "2026-01-01" },
    { id: "2", text: "User focuses on AI chips", source: "chat", createdAt: "2026-06-01" },
    { id: "3", text: "Risk appetite is high", source: "chat", createdAt: "2026-03-01" },
  ];
  const hits = recallMemories(memories, "AI chips focus", 10);
  assert.equal(hits[0]?.id, "2");
});
