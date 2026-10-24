import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { EventSchemas, EventType, type RunAgentInput } from "@ag-ui/core";
import { lastValueFrom, toArray } from "rxjs";
import { createApp } from "../apps/server/src/app.ts";
import { ConversationAgent } from "../apps/server/src/engine/conversation.ts";
import { reminderList } from "../apps/server/src/engine/reminder-list.ts";
import type { AgentNotification, Monitor } from "../packages/domain/src/agent.ts";
import { browserFixture } from "./helpers/browser.ts";
import { modelFixture } from "./helpers/model.ts";

function monitor(id: string, status: Monitor["status"], nextCheckAt: string): Monitor {
  return {
    id,
    taskId: `task-${id}`,
    title: `Reminder ${id}`,
    url: "https://example.com",
    condition: "change",
    value: "",
    intervalMinutes: 15,
    status,
    nextCheckAt,
    checks: 0,
  };
}

function notification(id: string, read: boolean, createdAt: string): AgentNotification {
  return {
    id,
    title: `Alert ${id}`,
    body: `Body ${id}`,
    read,
    createdAt,
  };
}

test("reminder list returns active checks in next-check order", () => {
  const result = reminderList(
    [
      monitor("later", "active", "2026-10-25T05:00:00.000Z"),
      monitor("stopped", "stopped", "2026-10-25T01:00:00.000Z"),
      monitor("sooner", "active", "2026-10-25T03:00:00.000Z"),
    ],
    [],
  );
  assert.deepEqual(
    result.reminders.map((item) => item.id),
    ["sooner", "later"],
  );
});

test("reminder list returns only the eight newest unread alerts", () => {
  const notifications = Array.from({ length: 10 }, (_, index) =>
    notification(`alert-${index}`, false, `2026-10-25T0${index}:00:00.000Z`),
  );
  notifications.push(notification("read", true, "2026-10-27T00:00:00.000Z"));
  notifications.push(notification("newest", false, "2026-10-26T00:00:00.000Z"));
  const result = reminderList([], notifications);
  assert.equal(result.alerts.length, 8);
  assert.equal(result.alerts[0]?.id, "newest");
  assert.ok(result.alerts.some((alert) => alert.id === "alert-9"));
  assert.ok(!result.alerts.some((alert) => alert.id === "alert-2"));
  assert.ok(!result.alerts.some((alert) => alert.id === "read"));
});

test("the conversation lists only its owner's active reminders and unread alerts", async (t) => {
  const { requests } = await modelFixture(t, (index) =>
    index === 0 ? { name: "list_reminders", arguments: {} } : undefined,
  );
  const f = await browserFixture(t, () => {
    throw new Error("Listing reminders must not use the browser");
  });
  const config = { ...f.config, agentBackend: "model" as const, model: "openai/fixture" };
  const server = await createApp(f.db, config);
  t.after(() => server.agent.stop());

  await f.db.put("local-user", "monitors", monitor("active", "active", "2026-10-25T03:00:00.000Z"));
  await f.db.put(
    "local-user",
    "monitors",
    monitor("stopped", "stopped", "2026-10-25T01:00:00.000Z"),
  );
  await f.db.put(
    "another-owner",
    "monitors",
    monitor("foreign", "active", "2026-10-25T02:00:00.000Z"),
  );
  await f.db.put(
    "local-user",
    "notifications",
    notification("unread", false, "2026-10-25T02:30:00.000Z"),
  );
  await f.db.put(
    "local-user",
    "notifications",
    notification("read", true, "2026-10-25T04:00:00.000Z"),
  );

  const conversation = new ConversationAgent(config, server.agent, "local-user");
  const input: RunAgentInput = {
    threadId: "reminder-chat",
    runId: randomUUID(),
    messages: [{ id: randomUUID(), role: "user", content: "What reminders do I have?" }],
    tools: [],
    context: [],
    state: {},
  };
  const events = (await lastValueFrom(conversation.run(input).pipe(toArray()))).map((event) =>
    EventSchemas.parse(event),
  );
  const result = events.find((event) => event.type === EventType.TOOL_CALL_RESULT);
  assert.ok(result && result.type === EventType.TOOL_CALL_RESULT);
  assert.deepEqual(JSON.parse(result.content), {
    reminders: [
      {
        id: "active",
        title: "Reminder active",
        condition: "change",
        value: "",
        intervalMinutes: 15,
        nextCheckAt: "2026-10-25T03:00:00.000Z",
        lastCheckedAt: null,
      },
    ],
    alerts: [
      {
        id: "unread",
        title: "Alert unread",
        body: "Body unread",
        createdAt: "2026-10-25T02:30:00.000Z",
      },
    ],
  });
  assert.match(requests[0]?.body ?? "", /list_reminders/);
});
