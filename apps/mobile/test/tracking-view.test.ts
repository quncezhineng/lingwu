import assert from "node:assert/strict";
import test from "node:test";
import type {
  AgentTask,
  AgentWorkspace,
  Goal,
  Monitor,
} from "../../../packages/domain/src/agent.ts";
import { buildTrackingView } from "../src/tracking-view.ts";

const now = new Date("2026-11-06T06:00:00.000Z");

function goal(overrides: Partial<Goal> & Pick<Goal, "id" | "title">): Goal {
  return {
    description: "",
    category: "Finances",
    status: "active",
    milestones: [],
    createdAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function task(
  overrides: Partial<AgentTask> & Pick<AgentTask, "id" | "title" | "status">,
): AgentTask {
  return {
    prompt: "Private execution instructions",
    kind: "agent",
    plan: [],
    evidence: [],
    input: {},
    state: {},
    createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-05T00:00:00.000Z",
    attempts: 0,
    artifactIds: [],
    ...overrides,
  };
}

function monitor(overrides: Partial<Monitor> & Pick<Monitor, "id" | "title">): Monitor {
  return {
    taskId: `task-${overrides.id}`,
    url: "https://example.com",
    condition: "change",
    value: "",
    intervalMinutes: 15,
    status: "active",
    nextCheckAt: "2026-11-06T07:00:00.000Z",
    checks: 0,
    ...overrides,
  };
}

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

test("next up prioritizes user actions and excludes ordinary running work", () => {
  const research = goal({
    id: "goal-research",
    title: "Semiconductor research",
    milestones: [
      { id: "m1", title: "Review filings", done: false },
      { id: "m2", title: "Compare peers", done: false },
    ],
  });
  const data = workspace({
    goals: [research],
    tasks: [
      task({
        id: "input",
        title: "Define the target company",
        status: "waiting_input",
        goalId: research.id,
        updatedAt: "2026-11-06T05:40:00.000Z",
      }),
      task({
        id: "review",
        title: "Approve the filing summary",
        status: "waiting_approval",
        updatedAt: "2026-11-06T05:30:00.000Z",
      }),
      task({
        id: "running",
        title: "Ordinary background work",
        status: "running",
        updatedAt: "2026-11-06T05:50:00.000Z",
      }),
    ],
    monitors: [
      monitor({
        id: "due",
        title: "Watchlist filing alert",
        nextCheckAt: "2026-11-06T07:00:00.000Z",
      }),
    ],
  });

  const view = buildTrackingView(data, now);
  assert.deepEqual(
    view.nextUp.map((item) => item.reason),
    ["task_input", "task_review", "monitor_due"],
  );
  assert.equal(view.nextUp[0]?.taskId, "input");
  assert.equal(view.goalTracks[0]?.nextAction?.taskId, "input");
  assert.equal(view.counts.tasks, 3);
  assert.equal(view.counts.tracking, 2);
});

test("goals group linked reminders while legacy reminders stay standalone", () => {
  const research = goal({
    id: "goal-research",
    title: "Semiconductor research",
    milestones: [{ id: "m1", title: "Review filings", done: false }],
  });
  const linked = monitor({
    id: "linked",
    title: "Weekly filing review",
    goalId: research.id,
    milestoneId: "m1",
  });
  const standalone = monitor({ id: "legacy", title: "Legacy watch" });
  const completed = monitor({
    id: "completed",
    title: "Stopped watch",
    status: "stopped",
  });
  const view = buildTrackingView(
    workspace({ goals: [research], monitors: [linked, standalone, completed] }),
    now,
  );

  assert.deepEqual(
    view.goalTracks[0]?.reminders.map((item) => item.id),
    ["linked"],
  );
  assert.deepEqual(
    view.standaloneReminders.map((item) => item.id),
    ["legacy"],
  );
  assert.deepEqual(view.reminders.map((item) => item.id).sort(), ["legacy", "linked"]);
});

test("same-goal attention is capped and completed goals stay out of next up", () => {
  const active = goal({
    id: "active",
    title: "Active goal",
    milestones: [{ id: "a1", title: "Step", done: false }],
  });
  const completed = goal({
    id: "completed",
    title: "Completed goal",
    status: "completed",
    milestones: [{ id: "c1", title: "Done", done: true }],
  });
  const data = workspace({
    goals: [active, completed],
    tasks: [
      task({
        id: "a1",
        title: "First action",
        status: "waiting_input",
        goalId: active.id,
        updatedAt: "2026-11-06T05:00:00.000Z",
      }),
      task({
        id: "a2",
        title: "Second action",
        status: "waiting_approval",
        goalId: active.id,
        updatedAt: "2026-11-06T05:01:00.000Z",
      }),
      task({
        id: "a3",
        title: "Third action",
        status: "failed",
        goalId: active.id,
        updatedAt: "2026-11-06T05:02:00.000Z",
      }),
      task({
        id: "hidden",
        title: "Completed goal action",
        status: "waiting_input",
        goalId: completed.id,
        updatedAt: "2026-11-06T05:03:00.000Z",
      }),
    ],
    monitors: [
      monitor({
        id: "completed-watch",
        title: "Completed goal watch",
        goalId: completed.id,
        nextCheckAt: "2026-11-06T06:30:00.000Z",
      }),
    ],
  });

  const view = buildTrackingView(data, now);
  assert.equal(view.nextUp.length, 2);
  assert.ok(view.nextUp.every((item) => item.goalId === active.id));
  assert.ok(!view.nextUp.some((item) => item.taskId === "hidden"));
  assert.equal(
    view.goalTracks.find((track) => track.goal.id === completed.id)?.goal.status,
    "completed",
  );
});

test("recent activity uses timestamped receipts and milestones without exposing diagnostics", () => {
  const research = goal({
    id: "recent",
    title: "Recent goal",
    milestones: [
      {
        id: "m",
        title: "Review filings",
        done: true,
        completedAt: "2026-11-04T03:00:00.000Z",
      },
    ],
  });
  const data = workspace({
    goals: [research],
    tasks: [
      task({
        id: "result-task",
        title: "Compare peers",
        status: "failed",
        goalId: research.id,
        updatedAt: "2026-11-06T05:00:00.000Z",
        error: "Traceback /private/tmp/internal",
      }),
      task({
        id: "watch-task",
        title: "Filing watch",
        status: "scheduled",
        goalId: research.id,
        updatedAt: "2026-11-05T04:00:00.000Z",
      }),
    ],
    monitors: [
      monitor({
        id: "recent-watch",
        title: "Recent filing watch",
        taskId: "watch-task",
        goalId: research.id,
        lastCheckedAt: "2026-11-06T05:20:00.000Z",
      }),
    ],
    notifications: [
      {
        id: "task-result",
        taskId: "result-task",
        title: "Peer comparison needs attention",
        body: "Private diagnostics",
        createdAt: "2026-11-06T05:00:00.000Z",
        read: false,
      },
      {
        id: "watch-alert",
        taskId: "watch-task",
        title: "A filing changed",
        body: "Private page content",
        createdAt: "2026-11-05T04:00:00.000Z",
        read: false,
      },
    ],
  });
  const track = buildTrackingView(data, now).goalTracks[0];
  assert.deepEqual(
    track?.recentActivities.map((activity) => activity.source),
    ["task", "monitor", "milestone"],
  );
  assert.equal(track?.recentActivity?.title, "Peer comparison needs attention");
  assert.doesNotMatch(
    JSON.stringify(track?.recentActivities),
    /Traceback|private\/tmp|Private page/,
  );
  assert.deepEqual(
    track?.dailyActivities.map((activity) => activity.id),
    ["notification:task-result"],
  );
});

test("recent activity uses the Shanghai day and excludes events outside seven days", () => {
  const research = goal({
    id: "window",
    title: "Window goal",
    milestones: [{ id: "m", title: "Continue", done: false }],
  });
  const taskIds = ["today", "yesterday", "expired"];
  const data = workspace({
    goals: [research],
    tasks: taskIds.map((id) => task({ id, title: id, status: "succeeded", goalId: research.id })),
    notifications: [
      {
        id: "today",
        taskId: "today",
        title: "Today in Shanghai",
        body: "",
        createdAt: "2026-11-05T16:30:00.000Z",
        read: false,
      },
      {
        id: "yesterday",
        taskId: "yesterday",
        title: "Yesterday in Shanghai",
        body: "",
        createdAt: "2026-11-05T15:00:00.000Z",
        read: false,
      },
      {
        id: "expired",
        taskId: "expired",
        title: "Outside the window",
        body: "",
        createdAt: "2026-10-29T16:00:00.000Z",
        read: false,
      },
    ],
  });
  const track = buildTrackingView(data, new Date("2026-11-05T17:00:00.000Z")).goalTracks[0];
  assert.deepEqual(
    track?.recentActivities.map((activity) => activity.id),
    ["notification:today", "notification:yesterday"],
  );
  assert.deepEqual(
    track?.dailyActivities.map((activity) => activity.id),
    ["notification:today"],
  );
});

test("a goal without milestones or active work gets one deterministic next step", () => {
  const empty = goal({ id: "empty", title: "Plan a new sector" });
  const view = buildTrackingView(workspace({ goals: [empty] }), now);
  assert.equal(view.nextUp.length, 1);
  assert.equal(view.nextUp[0]?.reason, "goal_plan");
  assert.equal(view.nextUp[0]?.action, "plan_next");
  assert.equal(view.goalTracks[0]?.nextAction?.id, view.nextUp[0]?.id);
});

test("the next-up reminder window includes exactly 24 hours and excludes anything later", () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const view = buildTrackingView(
    workspace({
      monitors: [
        monitor({
          id: "edge",
          title: "Due at the boundary",
          nextCheckAt: new Date(now.getTime() + dayMs).toISOString(),
        }),
        monitor({
          id: "later",
          title: "Due after the boundary",
          nextCheckAt: new Date(now.getTime() + dayMs + 60_000).toISOString(),
        }),
      ],
    }),
    now,
  );

  assert.deepEqual(
    view.nextUp.map((item) => item.monitorId),
    ["edge"],
  );
  assert.deepEqual(view.standaloneReminders.map((item) => item.id).sort(), ["edge", "later"]);
});
