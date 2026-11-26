import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ActionService } from "../apps/server/src/actions.ts";
import { createStore } from "../apps/server/src/db.ts";
import { AgentService } from "../apps/server/src/engine/service.ts";
import { LostLeaseError, TaskWorker } from "../apps/server/src/engine/worker.ts";
import type { AgentTask } from "../packages/domain/src/agent.ts";

const owner = "owner-1";

/** 与 tests/engine.test.ts 同构的任务构造；enqueuedAt 可选以便单独测 FIFO 回退。 */
function task(id: string, enqueuedAt?: string, status: AgentTask["status"] = "queued"): AgentTask {
  return {
    id,
    title: "Check a source",
    prompt: "Check a source",
    kind: "agent",
    status,
    plan: [],
    evidence: [],
    input: {},
    state: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...(enqueuedAt ? { enqueuedAt } : {}),
    attempts: 0,
    leaseId: null,
    leaseUntil: null,
    artifactIds: [],
  };
}

/** 读回某个任务的事件流（stream_kind="task"）。 */
async function taskEvents(db: Awaited<ReturnType<typeof createStore>>, id: string) {
  return db.readEvents<Record<string, unknown>>("task", id);
}

test("FIFO: tasks run in enqueue order regardless of put order", async () => {
  const db = await createStore();
  try {
    await db.put(owner, "tasks", task("late", "2026-02-02T00:00:00.000Z"));
    await db.put(owner, "tasks", task("early", "2026-01-01T00:00:00.000Z"));
    const order: string[] = [];
    await new TaskWorker(db, async (_, value) => {
      order.push(value.id);
      return { status: "succeeded" };
    }).tick();
    assert.deepEqual(order, ["early", "late"]);
  } finally {
    await db.close();
  }
});

test("FIFO: resuming a paused task keeps its original queue position", async () => {
  const db = await createStore();
  try {
    // 任务 A 先入队但被暂停；B 后入队。恢复 A 后它仍应先于 B 执行。
    await db.put(owner, "tasks", task("a", "2026-01-01T00:00:00.000Z", "paused"));
    await db.put(owner, "tasks", task("b", "2026-02-02T00:00:00.000Z"));
    const order: string[] = [];
    const worker = new TaskWorker(db, async (_, value, ctx) => {
      order.push(value.id);
      await ctx.checkpoint({ state: { done: value.id } });
      return { status: "succeeded" };
    });
    await worker.tick();
    assert.deepEqual(order, ["b"], "only the queued task runs while A is paused");
    // 用户恢复 A：状态转 queued，enqueuedAt 保持原值（等价于 service.control("resume") 的效果）。
    await db.compareAndSwap(owner, "tasks", "a", { status: "paused" }, { status: "queued" });
    await worker.tick();
    assert.deepEqual(order, ["b", "a"], "A resumes ahead of B because it was enqueued first");
  } finally {
    await db.close();
  }
});

test("events: a successful run appends claimed/checkpointed/completed with contiguous versions", async () => {
  const db = await createStore();
  try {
    const taskId = "t1";
    await db.put(owner, "tasks", task(taskId, "2026-01-01T00:00:00.000Z"));
    await new TaskWorker(db, async (_, __, ctx) => {
      await ctx.checkpoint({ state: { step: "halfway" } });
      await ctx.event("step", "Halfway there");
      return { status: "succeeded", result: "done" };
    }).tick();
    const events = await taskEvents(db, taskId);
    assert.deepEqual(
      events.map((e) => e.eventType),
      ["task_claimed", "task_checkpointed", "task_checkpointed", "task_completed"],
      // 两条 checkpointed：handler 显式 checkpoint 一次 + 终态收尾 checkpoint 一次。
      "lifecycle events arrive in order",
    );
    const versions = events.map((e) => e.version);
    assert.deepEqual(
      versions,
      versions.map((_, i) => i + 1),
      "versions are contiguous starting from 1",
    );
    const completed = events.at(-1);
    assert.equal(completed?.payload.status, "succeeded");
    assert.equal(completed?.payload.result, "done");
  } finally {
    await db.close();
  }
});

test("events: a failing run appends task_failed", async () => {
  const db = await createStore();
  try {
    const taskId = "t2";
    await db.put(owner, "tasks", task(taskId, "2026-01-01T00:00:00.000Z"));
    await new TaskWorker(db, async () => {
      throw new Error("provider unavailable");
    })
      .tick()
      .catch(() => {});
    const events = await taskEvents(db, taskId);
    assert.equal(events.at(-1)?.eventType, "task_failed");
    assert.equal(events.at(-1)?.payload.error, "provider unavailable");
    assert.equal((await db.get<AgentTask>(owner, "tasks", taskId))?.status, "failed");
  } finally {
    await db.close();
  }
});

test("events: a lease-lost run appends task_re_enqueued when the worker notices", async () => {
  const db = await createStore();
  try {
    const taskId = "t3";
    await db.put(owner, "tasks", task(taskId, "2026-01-01T00:00:00.000Z"));
    await new TaskWorker(db, async (o, value, ctx) => {
      // 模拟用户取消：CAS 把状态改成 cancelled，接下来的 guard 抛 LostLeaseError。
      await db.compareAndSwap(
        o,
        "tasks",
        value.id,
        { status: "running" },
        { status: "cancelled", leaseId: null, leaseUntil: null },
      );
      await ctx.guard();
      return { status: "succeeded" };
    })
      .tick()
      .catch(() => {});
    const events = await taskEvents(db, taskId);
    assert.equal(events.at(-1)?.eventType, "task_re_enqueued");
    // 回退 CAS 期望“仍持有原租约且 running”，但取消方已改状态，回退自然落空，
    // 任务停在取消方写下的终态 —— 与 engine.test「取消使陈旧 worker 失效」语义一致。
    assert.equal((await db.get<AgentTask>(owner, "tasks", taskId))?.status, "cancelled");
  } finally {
    await db.close();
  }
});

test("projection: rebuildTask replays the event log into the current task state", async () => {
  const db = await createStore();
  try {
    const taskId = "t4";
    // 模拟一份崩溃前的任务事件流：创建 → 被 worker 抢占 → 落了一次 checkpoint，然后进程挂了。
    await db.appendEvent(owner, "task", taskId, "task_created", {
      id: taskId,
      title: "t",
      kind: "agent",
      status: "queued",
      plan: [],
      evidence: [],
      input: {},
      state: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      enqueuedAt: "2026-01-01T00:00:00.000Z",
      attempts: 0,
    });
    await db.appendEvent(owner, "task", taskId, "task_claimed", {
      leaseId: "dead-lease",
      leaseUntil: "2026-01-01T00:10:00.000Z",
      attempts: 1,
    });
    await db.appendEvent(owner, "task", taskId, "task_checkpointed", {
      state: { completedStep: "imported", fileId: "persisted-file" },
    });
    const rebuilt = await db.rebuildTask(owner, taskId);
    assert.equal(rebuilt?.id, taskId);
    assert.equal(rebuilt?.status, "running", "replay of claimed events yields running");
    assert.equal(rebuilt?.leaseId, "dead-lease");
    assert.equal(rebuilt?.attempts, 1);
    assert.deepEqual(rebuilt?.state, { completedStep: "imported", fileId: "persisted-file" });
    // 追加完成事件后，重放得到终态。
    await db.appendEvent(owner, "task", taskId, "task_completed", {
      status: "succeeded",
      result: "done",
    });
    const done = await db.rebuildTask(owner, taskId);
    assert.equal(done?.status, "succeeded");
    assert.equal(done?.result, "done");
    assert.equal(done?.leaseId, null, "terminal event clears the lease");
  } finally {
    await db.close();
  }
});

test("service: createTask appends task_created and control appends pause/resume events", async () => {
  const root = await mkdtemp(join(tmpdir(), "lingwu-fifo-events-"));
  const db = await createStore({ dataDir: join(root, "pg") });
  try {
    const actions = new ActionService(db, {
      execute: async () => "sent",
      connected: async () => true,
    });
    const service = new AgentService(
      db,
      { hindsightBaseUrl: "", hindsightApiKey: "" } as never,
      { connection: async () => ({ id: "conn-1" }) } as never,
      {} as never,
      actions,
      {} as never,
    );
    const created = await service.createTask(owner, {
      kind: "agent",
      title: "FIFO test",
      prompt: "Produce a result",
    });
    assert.ok(created.id);
    assert.ok(created.enqueuedAt, "createTask stamps the FIFO enqueue time");
    let events = await taskEvents(db, created.id);
    assert.deepEqual(
      events.map((e) => e.eventType),
      ["task_created"],
    );
    const createdPayload = events[0]?.payload;
    assert.equal(createdPayload?.enqueuedAt, created.enqueuedAt);
    assert.equal(createdPayload?.status, "queued");

    await service.control(owner, created.id, "pause");
    events = await taskEvents(db, created.id);
    assert.equal(events.at(-1)?.eventType, "task_paused");
    assert.equal((await db.get<AgentTask>(owner, "tasks", created.id))?.status, "paused");

    await service.control(owner, created.id, "resume");
    events = await taskEvents(db, created.id);
    assert.equal(events.at(-1)?.eventType, "task_resumed");
    const resumed = await db.get<AgentTask>(owner, "tasks", created.id);
    assert.equal(resumed?.status, "queued");
    assert.equal(
      resumed?.enqueuedAt,
      created.enqueuedAt,
      "resume keeps the original enqueue time, so the task stays in its FIFO slot",
    );

    await service.control(owner, created.id, "cancel");
    events = await taskEvents(db, created.id);
    assert.equal(events.at(-1)?.eventType, "task_cancelled");
  } finally {
    await db.close();
    await rm(root, { recursive: true, force: true });
  }
});
