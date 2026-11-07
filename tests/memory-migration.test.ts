import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import { AgentService } from "../apps/server/src/engine/service.ts";
import type { AgentMemoryV2 } from "../packages/domain/src/agent.ts";

function memory(id: string, agentId: string, text: string): AgentMemoryV2 {
  return {
    id,
    agentId,
    kind: "fact",
    text,
    source: "test",
    createdAt: `2026-01-01T00:00:00.000Z`,
  };
}

/** 可记录 retain 调用、可注入失败的内存引擎 mock。 */
function makeMemoryMock(opts?: { failOn?: Set<string> }) {
  const retained: { owner: string; agentId: string; content: string }[] = [];
  const failOn = opts?.failOn ?? new Set<string>();
  return {
    enabled: true,
    retained,
    failOn,
    retain: async (owner: string, agentId: string, content: string) => {
      if (failOn.has(content)) throw new Error(`retain failed: ${content}`);
      retained.push({ owner, agentId, content });
    },
  };
}

function makeService(
  db: Awaited<ReturnType<typeof createStore>>,
  memory: ReturnType<typeof makeMemoryMock>,
) {
  return Object.assign(Object.create(AgentService.prototype), { db, memory }) as AgentService;
}

test("migrateMemories retains in batches and advances cursor", async () => {
  const db = await createStore();
  try {
    const mock = makeMemoryMock();
    const service = makeService(db, mock);
    // 300 条 > 每批 200，验证分批推进游标。
    for (let i = 0; i < 300; i++) {
      await db.put(
        "owner",
        "memories",
        memory(`m${String(i).padStart(3, "0")}`, "agent-a", `text-${i}`),
      );
    }
    const first = await (
      service as unknown as {
        migrateMemories: (o: string) => Promise<{ migrated: number; done: boolean }>;
      }
    ).migrateMemories("owner");
    assert.equal(first.migrated, 200);
    assert.equal(first.done, false);
    assert.equal(mock.retained.length, 200);
    const second = await (
      service as unknown as {
        migrateMemories: (o: string) => Promise<{ migrated: number; done: boolean }>;
      }
    ).migrateMemories("owner");
    assert.equal(second.migrated, 100);
    assert.equal(second.done, true);
    assert.equal(mock.retained.length, 300);
    // 第三批无新数据。
    const third = await (
      service as unknown as {
        migrateMemories: (o: string) => Promise<{ migrated: number; done: boolean }>;
      }
    ).migrateMemories("owner");
    assert.equal(third.migrated, 0);
    assert.equal(third.done, true);
    // 校验 agentId 归一化后写入正确的 bank。
    assert.equal(mock.retained[0]?.agentId, "agent-a");
  } finally {
    await db.close();
  }
});

test("migrateMemories tolerates per-item failures without stalling", async () => {
  const db = await createStore();
  try {
    const mock = makeMemoryMock({ failOn: new Set(["text-1"]) });
    const service = makeService(db, mock);
    await db.put("owner", "memories", memory("m001", "agent-a", "text-0"));
    await db.put("owner", "memories", memory("m002", "agent-a", "text-1"));
    await db.put("owner", "memories", memory("m003", "agent-a", "text-2"));
    const result = await (
      service as unknown as {
        migrateMemories: (o: string) => Promise<{ migrated: number; done: boolean }>;
      }
    ).migrateMemories("owner");
    // 2 条成功，1 条失败，但整批完成（done=true），游标已推进。
    assert.equal(result.migrated, 2);
    assert.equal(result.done, true);
    assert.equal(mock.retained.length, 2);
    // 进度记录里累计了失败数。
    const progress = await db.get<{ failed?: number }>("owner", "memory-migration", "cursor");
    assert.equal(progress?.failed, 1);
  } finally {
    await db.close();
  }
});

test("migrateMemories is a no-op when Hindsight is disabled", async () => {
  const db = await createStore();
  try {
    const service = Object.assign(Object.create(AgentService.prototype), {
      db,
      memory: { enabled: false, retain: async () => {} },
    }) as AgentService;
    await db.put("owner", "memories", memory("m001", "agent-a", "text-0"));
    const result = await (
      service as unknown as {
        migrateMemories: (o: string) => Promise<{ migrated: number; done: boolean }>;
      }
    ).migrateMemories("owner");
    assert.equal(result.migrated, 0);
    assert.equal(result.done, true);
  } finally {
    await db.close();
  }
});
