import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import { ActionLogService } from "../apps/server/src/engine/action-log.ts";
import type { AgentActionLogEntry } from "../packages/domain/src/audit.ts";

const NOW = () => new Date("2026-11-23T02:00:00.000Z");

test("审计：同 key 重复记录只留一条，且保留第一次的时间", async () => {
  const db = await createStore();
  try {
    let clock = new Date("2026-11-23T02:00:00.000Z");
    const log = new ActionLogService({ db, now: () => clock });
    const first = await log.record("owner", {
      kind: "task",
      action: "派发个股研究：研究 NVDA",
      key: "task:t1",
      refs: { taskId: "t1" },
    });
    clock = new Date("2026-11-23T03:00:00.000Z");
    const second = await log.record("owner", {
      kind: "task",
      action: "派发个股研究：研究 NVDA",
      key: "task:t1",
      refs: { taskId: "t1" },
    });
    assert.equal(second.id, first.id);
    assert.equal(second.at, "2026-11-23T02:00:00.000Z");
    assert.equal((await log.list("owner")).length, 1);
  } finally {
    await db.close();
  }
});

test("审计：列表支持按类型、标的、是否含已撤销筛选", async () => {
  const db = await createStore();
  try {
    const log = new ActionLogService({ db, now: NOW });
    await log.record("owner", {
      kind: "task",
      action: "派发个股研究：研究 NVDA",
      target: { symbol: "NVDA" },
      refs: { taskId: "t1" },
    });
    await log.record("owner", {
      kind: "alert",
      action: "为 NVDA 建价格提醒",
      target: { symbol: "NVDA" },
      refs: { alertId: "a1" },
    });
    await log.record("owner", {
      kind: "plan",
      action: "跟踪计划落地：宁德时代",
      target: { symbol: "300750.SZ" },
    });

    assert.equal((await log.list("owner")).length, 3);
    assert.equal((await log.list("owner", { kind: "alert" })).length, 1);
    assert.equal((await log.list("owner", { symbol: "NVDA" })).length, 2);
    assert.equal((await log.list("owner", { symbol: "300750.SZ" })).length, 1);
    assert.equal((await log.list("owner", { limit: 1 })).length, 1);
  } finally {
    await db.close();
  }
});

test("审计：可撤销的动作撤销后标记 revoked，默认不再出现在列表里", async () => {
  const db = await createStore();
  try {
    const undone: string[] = [];
    const log = new ActionLogService({
      db,
      now: NOW,
      undo: async (_owner, entry) => {
        undone.push(entry.id);
        return { undone: true, note: "任务已取消" };
      },
    });
    const entry = await log.record("owner", {
      kind: "task",
      action: "派发个股研究：研究 NVDA",
      refs: { taskId: "t1" },
    });
    assert.equal(entry.revocable, true);

    const result = await log.revoke("owner", entry.id);
    assert.equal(result.undone, true);
    assert.equal(result.note, "任务已取消");
    assert.equal(result.entry.outcome, "revoked");
    assert.ok(result.entry.revokedAt);
    assert.deepEqual(undone, [entry.id]);

    assert.equal((await log.list("owner")).length, 0);
    assert.equal((await log.list("owner", { includeRevoked: true })).length, 1);

    // 幂等：再撤一次不重复执行，也不报错。
    const again = await log.revoke("owner", entry.id);
    assert.equal(again.undone, true);
    assert.match(again.note, /已经撤销过/);
    assert.equal(undone.length, 1);
  } finally {
    await db.close();
  }
});

test("审计：不可撤销的动作给出原因，不假装成功", async () => {
  const db = await createStore();
  try {
    const log = new ActionLogService({ db, now: NOW });
    const entry = await log.record("owner", {
      kind: "thesis",
      action: "论点被证据判定为失效：宁德时代",
      target: { symbol: "300750.SZ" },
      refs: { noteId: "n1" },
    });
    assert.equal(entry.revocable, false);
    const result = await log.revoke("owner", entry.id);
    assert.equal(result.undone, false);
    assert.match(result.note, /不支持撤销/);
    assert.equal(result.entry.outcome, "ok");
  } finally {
    await db.close();
  }
});

test("审计：撤销执行失败被包成 409，让人看到失败原因", async () => {
  const db = await createStore();
  try {
    const log = new ActionLogService({
      db,
      now: NOW,
      undo: async () => {
        throw new Error("This task is already complete");
      },
    });
    const entry = await log.record("owner", {
      kind: "task",
      action: "派发任务",
      refs: { taskId: "t1" },
    });
    await assert.rejects(
      () => log.revoke("owner", entry.id),
      (error: { status?: number; message?: string }) =>
        error.status === 409 && /already complete/.test(error.message ?? ""),
    );
  } finally {
    await db.close();
  }
});

test("审计：查不存在的动作返回 404", async () => {
  const db = await createStore();
  try {
    const log = new ActionLogService({ db, now: NOW });
    await assert.rejects(
      () => log.get("owner", "missing"),
      (error: { status?: number }) => error.status === 404,
    );
  } finally {
    await db.close();
  }
});

test("审计条目形状：字段扁平、可直接展示", async () => {
  const db = await createStore();
  try {
    const log = new ActionLogService({ db, now: NOW });
    const entry = await log.record("owner", {
      kind: "plan",
      action: "跟踪计划落地：宁德时代",
      actor: "assistant",
      target: { symbol: "300750.SZ", resource: "宁德时代" },
      refs: { planId: "p1", alertId: "a1", noteId: "n1" },
      detail: "建了 2 条价格提醒和 1 条跟踪论点",
      threadId: "thread-1",
    });
    const stored =
      (await db.get<AgentActionLogEntry>("owner", "agent_action_log", entry.id)) ?? entry;
    assert.equal(stored.kind, "plan");
    assert.equal(stored.outcome, "ok");
    assert.equal(stored.actor, "assistant");
    assert.equal(stored.target?.symbol, "300750.SZ");
    assert.equal(stored.refs?.noteId, "n1");
    assert.equal(stored.threadId, "thread-1");
  } finally {
    await db.close();
  }
});
