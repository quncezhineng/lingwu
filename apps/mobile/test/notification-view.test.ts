import assert from "node:assert/strict";
import test from "node:test";
import type {
  AgentNotification,
  AgentTask,
  AgentWorkspace,
  Goal,
} from "../../../packages/domain/src/agent.ts";
import { buildNotificationGroups } from "../src/notification-view.ts";

function notification(
  id: string,
  createdAt: string,
  overrides: Partial<AgentNotification> = {},
): AgentNotification {
  return { id, title: id, body: "", createdAt, read: false, ...overrides };
}

function task(id: string, goalId?: string): AgentTask {
  return {
    id,
    title: id,
    prompt: "",
    kind: "agent",
    status: "succeeded",
    ...(goalId ? { goalId } : {}),
    plan: [],
    evidence: [],
    input: {},
    state: {},
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    attempts: 0,
    artifactIds: [],
  };
}

const goal: Goal = {
  id: "goal-1",
  title: "Semiconductor research",
  description: "",
  category: "Research",
  status: "active",
  milestones: [],
  createdAt: "2026-11-01T00:00:00.000Z",
};

function workspace(partial: Partial<AgentWorkspace>): AgentWorkspace {
  return {
    tasks: [],
    goals: [],
    monitors: [],
    ideas: [],
    memories: [],
    artifacts: [],
    notifications: [],
    identity: { name: "Xiao Wu", tone: "warm" },
    worker: { running: true },
    ...partial,
  };
}

test("notifications from different tasks in one goal share a group", () => {
  const groups = buildNotificationGroups(
    workspace({
      goals: [goal],
      tasks: [task("task-a", goal.id), task("task-b", goal.id)],
      notifications: [
        notification("older", "2026-11-06T01:00:00.000Z", { taskId: "task-a" }),
        notification("newer", "2026-11-06T02:00:00.000Z", {
          taskId: "task-b",
          read: true,
        }),
      ],
    }),
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.goalId, goal.id);
  assert.equal(groups[0]?.unread, 1);
  assert.deepEqual(
    groups[0]?.notifications.map((item) => item.id),
    ["newer", "older"],
  );
});

test("missing tasks, deleted goals and taskless notifications stay visible as standalone", () => {
  const data = workspace({
    goals: [goal],
    tasks: [task("orphan", "deleted-goal")],
    notifications: [
      notification("missing-task", "2026-11-06T03:00:00.000Z", { taskId: "missing" }),
      notification("deleted-goal", "2026-11-06T02:00:00.000Z", { taskId: "orphan" }),
      notification("no-task", "2026-11-06T01:00:00.000Z"),
    ],
  });
  const groups = buildNotificationGroups(data);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.id, "standalone");
  assert.equal(groups[0]?.goal, undefined);
  assert.deepEqual(
    groups[0]?.notifications.map((item) => item.id),
    ["missing-task", "deleted-goal", "no-task"],
  );
});

test("goal groups sort by unread then recency and never mutate input", () => {
  const secondGoal = { ...goal, id: "goal-2", title: "Second goal" };
  const notifications = [
    notification("old-goal-1", "2026-11-06T01:00:00.000Z", { taskId: "task-1" }),
    notification("new-goal-2", "2026-11-06T04:00:00.000Z", {
      taskId: "task-2",
      read: true,
    }),
  ];
  const data = workspace({
    goals: [goal, secondGoal],
    tasks: [task("task-1", goal.id), task("task-2", secondGoal.id)],
    notifications,
  });
  const before = JSON.stringify(data);
  const groups = buildNotificationGroups(data);

  assert.deepEqual(
    groups.map((item) => item.goalId),
    [goal.id, secondGoal.id],
  );
  assert.equal(JSON.stringify(data), before);
  assert.equal(data.notifications[0], notifications[0]);
});
