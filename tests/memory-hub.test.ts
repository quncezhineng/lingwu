import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import { AgentService } from "../apps/server/src/engine/service.ts";
import type { AgentMemoryV2 } from "../packages/domain/src/agent.ts";

// 最小可用的 AgentService：继承原型拿到 memoryHub/agentMemories 方法，注入 db。
function makeService(db: Awaited<ReturnType<typeof createStore>>) {
  return Object.assign(Object.create(AgentService.prototype), {
    db,
    memory: { retain: async () => {} },
  }) as AgentService;
}

function memory(
  id: string,
  agentId: string,
  kind: AgentMemoryV2["kind"],
  text: string,
): AgentMemoryV2 {
  return {
    id,
    agentId,
    kind,
    text,
    source: "test",
    createdAt: `2026-01-0${id}T00:00:00.000Z`,
  };
}

test("memoryHub aggregates byAgent and byKind", async () => {
  const db = await createStore();
  try {
    const service = makeService(db);
    await db.put("owner", "memories", memory("1", "agent-a", "fact", "偏好 A"));
    await db.put("owner", "memories", memory("2", "agent-a", "thesis", "论点 A"));
    await db.put("owner", "memories", memory("3", "agent-b", "decision", "决策 B"));
    const hub = await service.memoryHub("owner");
    assert.equal(hub.total, 3);
    assert.deepEqual(hub.byAgent, { "agent-a": 2, "agent-b": 1 });
    assert.deepEqual(hub.byKind, { fact: 1, thesis: 1, decision: 1 });
  } finally {
    await db.close();
  }
});

test("agentMemories filters by agentId with default fallback", async () => {
  const db = await createStore();
  try {
    const service = makeService(db);
    await db.put("owner", "memories", memory("1", "agent-a", "fact", "A 的记忆"));
    await db.put("owner", "memories", memory("2", "agent-b", "fact", "B 的记忆"));
    // 旧数据无 agentId 字段（undefined），归 "default"。
    const legacy = { ...memory("3", "agent-a", "fact", "旧记忆") } as Partial<AgentMemoryV2>;
    delete legacy.agentId;
    await db.put("owner", "memories", legacy as AgentMemoryV2);
    const a = await service.agentMemories("owner", "agent-a");
    assert.equal(a.length, 1);
    assert.equal(a[0]?.text, "A 的记忆");
    const def = await service.agentMemories("owner", "default");
    assert.equal(def.length, 1);
    assert.equal(def[0]?.text, "旧记忆");
  } finally {
    await db.close();
  }
});
