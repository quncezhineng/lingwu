import assert from "node:assert/strict";
import test from "node:test";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { createBriefingScheduler } from "../apps/server/src/engine/briefing-scheduler.ts";

const silent = () => {};

async function withStore(run: (db: Store) => Promise<void>): Promise<void> {
  const db = await createStore();
  try {
    await run(db);
  } finally {
    await db.close();
  }
}

async function addWatchlist(db: Store, owner: string): Promise<void> {
  await db.put(owner, "watchlists", { id: "list-1", name: "Core", symbols: ["AAPL"] });
}

async function addBriefingTask(
  db: Store,
  owner: string,
  task: { id: string; status: string; date: string; updatedAt: string },
): Promise<void> {
  await db.put(owner, "tasks", {
    id: task.id,
    kind: "market_briefing",
    status: task.status,
    input: { date: task.date },
    updatedAt: task.updatedAt,
  });
}

test("does nothing unless BRIEFING_SCHEDULE_ENABLED opts in", async () => {
  await withStore(async (db) => {
    await addWatchlist(db, "alice");
    const calls: string[] = [];
    const scheduler = createBriefingScheduler(
      { db, enqueue: async (owner) => void calls.push(owner) },
      { enabled: false, now: () => new Date("2026-10-27T00:05:00Z"), log: silent },
    );
    assert.equal(await scheduler.runOnce(), 0);
    assert.deepEqual(calls, []);
  });
});

test("waits until the configured UTC hour", async () => {
  await withStore(async (db) => {
    await addWatchlist(db, "alice");
    let clock = new Date("2026-10-27T05:00:00Z");
    const calls: string[] = [];
    const scheduler = createBriefingScheduler(
      { db, enqueue: async (owner) => void calls.push(owner) },
      { enabled: true, hourUtc: 12, now: () => clock, log: silent },
    );
    assert.equal(await scheduler.runOnce(), 0);
    assert.deepEqual(calls, []);
    clock = new Date("2026-10-27T12:00:00Z");
    assert.equal(await scheduler.runOnce(), 1);
    assert.deepEqual(calls, ["alice"]);
  });
});

test("creates one task per owner with a watchlist and stays idempotent", async () => {
  await withStore(async (db) => {
    await addWatchlist(db, "alice");
    await addWatchlist(db, "bob");
    await db.put("carol", "tasks", { id: "unrelated", kind: "agent", status: "queued" });
    const now = "2026-10-27T00:05:00Z";
    const calls: string[] = [];
    const scheduler = createBriefingScheduler(
      {
        db,
        enqueue: async (owner, date, attempt) => {
          calls.push(`${owner}:${date}:${attempt}`);
          await addBriefingTask(db, owner, {
            id: `${owner}-${attempt}`,
            status: "queued",
            date,
            updatedAt: now,
          });
        },
      },
      { enabled: true, now: () => new Date(now), log: silent },
    );
    assert.equal(await scheduler.runOnce(), 2);
    assert.deepEqual(calls.sort(), ["alice:2026-10-27:0", "bob:2026-10-27:0"]);
    // The queued tasks for today already cover the date.
    assert.equal(await scheduler.runOnce(), 0);
    assert.equal(calls.length, 2);
  });
});

test("does not re-enqueue when today's briefing task succeeded", async () => {
  await withStore(async (db) => {
    await addWatchlist(db, "alice");
    await addBriefingTask(db, "alice", {
      id: "done",
      status: "succeeded",
      date: "2026-10-27",
      updatedAt: "2026-10-27T00:02:00Z",
    });
    const calls: string[] = [];
    const scheduler = createBriefingScheduler(
      { db, enqueue: async (owner) => void calls.push(owner) },
      { enabled: true, now: () => new Date("2026-10-27T06:00:00Z"), log: silent },
    );
    assert.equal(await scheduler.runOnce(), 0);
    assert.deepEqual(calls, []);
  });
});

test("retries failed attempts after the retry delay, up to the daily cap", async () => {
  await withStore(async (db) => {
    await addWatchlist(db, "alice");
    let clock = new Date("2026-10-27T00:04:00Z");
    const calls: number[] = [];
    const scheduler = createBriefingScheduler(
      {
        db,
        enqueue: async (_owner, _date, attempt) => {
          calls.push(attempt);
          const iso = clock.toISOString();
          await addBriefingTask(db, "alice", {
            id: `attempt-${attempt}`,
            status: "failed",
            date: "2026-10-27",
            updatedAt: iso,
          });
        },
      },
      {
        enabled: true,
        retryDelayMs: 5 * 60_000,
        maxAttemptsPerDay: 2,
        now: () => clock,
        log: silent,
      },
    );
    await addBriefingTask(db, "alice", {
      id: "attempt-0",
      status: "failed",
      date: "2026-10-27",
      updatedAt: "2026-10-27T00:00:00Z",
    });
    // 4 minutes after the failure the retry is still backing off.
    assert.equal(await scheduler.runOnce(), 0);
    clock = new Date("2026-10-27T00:06:00Z");
    assert.equal(await scheduler.runOnce(), 1);
    assert.deepEqual(calls, [1]);
    // Cap reached: a further failed attempt never spawns a third task.
    clock = new Date("2026-10-27T00:20:00Z");
    assert.equal(await scheduler.runOnce(), 0);
  });
});
