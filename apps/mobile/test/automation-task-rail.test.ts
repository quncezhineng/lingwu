import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentTask, Monitor } from "../../../packages/domain/src/agent";
import { groupRailWork, railWorkItems } from "../src/automation-task-rail.ts";

function task(partial: Partial<AgentTask> & Pick<AgentTask, "id" | "status" | "kind">): AgentTask {
  return {
    title: partial.id,
    prompt: "",
    plan: [],
    evidence: [],
    input: {},
    state: {},
    createdAt: "2026-11-12T01:00:00.000Z",
    updatedAt: "2026-11-12T01:00:00.000Z",
    attempts: 0,
    artifactIds: [],
    ...partial,
  };
}

function monitor(partial: Partial<Monitor> & Pick<Monitor, "id" | "status">): Monitor {
  return {
    taskId: `task-${partial.id}`,
    title: partial.id,
    url: "https://example.com",
    condition: "change",
    value: "",
    intervalMinutes: 15,
    nextCheckAt: "2026-11-12T02:00:00.000Z",
    checks: 0,
    ...partial,
  };
}

test("the rail keeps active automations and only the four task statuses", () => {
  const items = railWorkItems(
    [
      task({
        id: "queued",
        status: "queued",
        kind: "agent",
        createdAt: "2026-11-12T03:00:00.000Z",
      }),
      task({
        id: "running",
        status: "running",
        kind: "research",
        createdAt: "2026-11-12T02:00:00.000Z",
      }),
      task({
        id: "done",
        status: "succeeded",
        kind: "document",
        createdAt: "2026-11-12T01:30:00.000Z",
      }),
      task({
        id: "failed",
        status: "failed",
        kind: "plan",
        createdAt: "2026-11-12T01:00:00.000Z",
      }),
      task({ id: "paused", status: "paused", kind: "agent" }),
      task({ id: "waiting", status: "waiting_input", kind: "agent" }),
      task({ id: "shell", status: "scheduled", kind: "monitor", title: "hidden monitor task" }),
    ],
    [
      monitor({
        id: "live",
        status: "active",
        title: "价格自动化",
        lastCheckedAt: "2026-11-12T04:00:00.000Z",
      }),
      monitor({ id: "paused", status: "paused", title: "暂停的自动化" }),
      monitor({ id: "stopped", status: "stopped", title: "已停止" }),
    ],
  );
  assert.deepEqual(
    items.map((item) => item.title),
    ["价格自动化", "queued", "running", "done", "failed"],
  );
  assert.equal(items[0]?.kind, "automation");
  assert.equal(items[0]?.taskId, "task-live");
});

test("preview grouping keeps the newest four and labels the local day", () => {
  const items = railWorkItems(
    [0, 1, 2, 3, 4].map((index) =>
      task({
        id: `t${index}`,
        status: "succeeded",
        kind: "agent",
        title: `任务 ${index}`,
        createdAt: new Date(Date.UTC(2026, 10, 10 + index, 8)).toISOString(),
      }),
    ),
    [],
  );
  const groups = groupRailWork(items, {
    limit: 4,
    locale: "zh-CN",
    timeZone: "UTC",
    now: new Date("2026-11-14T12:00:00.000Z"),
  });
  assert.equal(groups.flatMap((group) => group.items).length, 4);
  assert.equal(groups[0]?.label, "today");
  assert.equal(groups[1]?.label, "yesterday");
  assert.equal(groups[0]?.items[0]?.title, "任务 4");
});
