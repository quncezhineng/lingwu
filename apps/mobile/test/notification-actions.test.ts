import assert from "node:assert/strict";
import test from "node:test";
import type { AgentNotification } from "../../../packages/domain/src/agent.ts";
import {
  actionableNotifications,
  markNotificationRead,
  notificationReadPath,
  unreadCount,
  unreadNotifications,
} from "../src/notification-actions.ts";

function notification(id: string, overrides: Partial<AgentNotification> = {}): AgentNotification {
  return {
    id,
    title: id,
    body: "",
    createdAt: "2026-11-01T00:00:00.000Z",
    read: false,
    ...overrides,
  };
}

const sample = [
  notification("read", { read: true, taskId: "task-1" }),
  notification("standalone"),
  notification("task", { taskId: "task-2" }),
];

test("unread selections keep the workspace snapshot order", () => {
  assert.deepEqual(
    unreadNotifications(sample).map((item) => item.id),
    ["standalone", "task"],
  );
  assert.deepEqual(unreadNotifications(undefined), []);
  assert.equal(unreadCount(sample), 2);
  assert.equal(unreadCount(undefined), 0);
});

test("actionable notifications need both unread status and a task link", () => {
  assert.deepEqual(
    actionableNotifications(sample).map((item) => item.id),
    ["task"],
  );
  assert.deepEqual(actionableNotifications(undefined), []);
});

test("the shared read path escapes notification ids", () => {
  assert.equal(notificationReadPath("task-done:1"), "/notifications/task-done%3A1/read");
  assert.equal(notificationReadPath("a/b"), "/notifications/a%2Fb/read");
});

test("markNotificationRead writes through the injected mutation", async () => {
  const calls: Array<[string, unknown]> = [];
  const mutate = async (path: string, body: unknown) => {
    calls.push([path, body]);
  };
  await markNotificationRead(mutate, "abc/123");
  assert.deepEqual(calls, [["/notifications/abc%2F123/read", {}]]);
});
