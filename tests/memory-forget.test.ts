import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import { AgentService } from "../apps/server/src/engine/service.ts";
import type { AgentMemoryV2 } from "../packages/domain/src/agent.ts";

function makeMemoryMock() {
  const deleted: { owner: string; agentId: string; documentId: string }[] = [];
  return {
    enabled: true,
    deleted,
    retain: async () => {},
    deleteDocument: async (owner: string, agentId: string, documentId: string) => {
      deleted.push({ owner, agentId, documentId });
    },
  };
}

function makeService(
  db: Awaited<ReturnType<typeof createStore>>,
  memory: ReturnType<typeof makeMemoryMock>,
) {
  return Object.assign(Object.create(AgentService.prototype), { db, memory }) as AgentService;
}

test("forgetMemory removes the record and deletes the Hindsight document", async () => {
  const db = await createStore();
  try {
    const mock = makeMemoryMock();
    const service = makeService(db, mock);
    const value: AgentMemoryV2 = {
      id: "mem-1",
      agentId: "agent-a",
      kind: "fact",
      text: "偏好",
      source: "test",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    await db.put("owner", "memories", value);
    const ok = await service.forgetMemory("owner", "mem-1");
    assert.equal(ok, true);
    // records 已删除。
    assert.equal(await db.get("owner", "memories", "mem-1"), null);
    // Hindsight 侧同步删除，agentId 正确。
    assert.equal(mock.deleted.length, 1);
    assert.equal(mock.deleted[0]?.agentId, "agent-a");
    assert.equal(mock.deleted[0]?.documentId, "mem-1");
  } finally {
    await db.close();
  }
});

test("forgetMemory returns false and skips Hindsight when missing", async () => {
  const db = await createStore();
  try {
    const mock = makeMemoryMock();
    const service = makeService(db, mock);
    const ok = await service.forgetMemory("owner", "nope");
    assert.equal(ok, false);
    assert.equal(mock.deleted.length, 0);
  } finally {
    await db.close();
  }
});
