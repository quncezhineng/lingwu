import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { AgentTask, Monitor } from "../packages/domain/src/agent.ts";

let db: Store, server: Awaited<ReturnType<typeof createApp>>, directory: string, token: string;
const owner = "local-user";
const request = (path: string, body?: unknown) =>
  server.app.request(`/api/agent${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
  });
async function createMonitor(title: string) {
  const response = await request("/monitors", {
    title,
    url: "sample://availability",
    condition: "change",
    intervalMinutes: 1,
  });
  assert.equal(response.status, 201);
  return response.json() as Promise<Monitor>;
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-monitor-setup-"));
  db = await createStore();
  server = await createApp(db, {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    intelligenceApiKey: "test-project-key-never-sent",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  });
  const response = await server.app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 200);
  token = (await response.json()).token;
});
after(async () => {
  await server?.agent?.stop();
  await db?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("properly configured reminders still pause and resume normally", async () => {
  const monitor = await createMonitor("A valid reminder");
  const paused = await request(`/tasks/${monitor.taskId}/control`, { action: "pause" });
  assert.equal(paused.status, 200);
  assert.equal((await paused.json()).status, "paused");
  const resumed = await request(`/tasks/${monitor.taskId}/control`, { action: "resume" });
  assert.equal(resumed.status, 200);
  assert.equal((await resumed.json()).status, "queued");
  assert.equal((await db.get<Monitor>(owner, "monitors", monitor.id))?.status, "active");
});

test("a monitor belonging to another owner cannot complete a legacy task's setup", async () => {
  const monitor = await server.agent.createMonitor("another-user", {
    title: "Private reminder",
    url: "sample://availability",
    condition: "change",
  });
  const seeded = await server.agent.createTask(owner, { kind: "agent", prompt: "Legacy watch" });
  await db.put(owner, "tasks", {
    ...seeded,
    kind: "monitor",
    status: "paused",
    input: { monitorId: monitor.id },
  });
  const response = await request(`/tasks/${seeded.id}/control`, { action: "resume" });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "TASK_SETUP_REQUIRED");
  assert.equal((await db.get<AgentTask>(owner, "tasks", seeded.id))?.status, "paused");
  assert.equal((await db.get<Monitor>("another-user", "monitors", monitor.id))?.status, "active");
});

test("direct delegation cannot create a monitor task without its monitoring rule", async () => {
  const beforeTasks = await db.list<AgentTask>(owner, "tasks");
  const response = await request("/tasks", {
    kind: "monitor",
    title: "Unconfigured watch",
    prompt: "Watch this price",
    input: {},
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "TASK_SETUP_REQUIRED");
  assert.equal((await db.list<AgentTask>(owner, "tasks")).length, beforeTasks.length);
});

test("legacy monitor tasks missing a valid rule stay paused and return a setup-required code", async () => {
  const seeded = await server.agent.createTask(owner, { kind: "agent", prompt: "Legacy watch" });
  for (const monitorId of [undefined, "", 42, "missing-monitor"]) {
    await db.put(owner, "tasks", {
      ...seeded,
      kind: "monitor",
      status: "paused",
      input: monitorId === undefined ? {} : { monitorId },
      error: "Monitor not found",
    });
    const response = await request(`/tasks/${seeded.id}/control`, { action: "resume" });
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.code, "TASK_SETUP_REQUIRED");
    assert.doesNotMatch(payload.error, /Monitor not found/);
    const saved = await db.get<AgentTask>(owner, "tasks", seeded.id);
    assert.equal(saved?.status, "paused");
    assert.equal(saved?.attempts, seeded.attempts);
  }
  await db.remove(owner, "tasks", seeded.id);
});

test("resuming a stale monitor link cannot resume another task's watch", async () => {
  const monitor = await createMonitor("Other task's watch");
  const seeded = await server.agent.createTask(owner, { kind: "agent", prompt: "Legacy link" });
  await db.put(owner, "tasks", {
    ...seeded,
    kind: "monitor",
    status: "paused",
    input: { monitorId: monitor.id },
  });
  const beforeTask = await db.get<AgentTask>(owner, "tasks", monitor.taskId);
  const beforeMonitor = await db.get<Monitor>(owner, "monitors", monitor.id);
  const response = await request(`/tasks/${seeded.id}/control`, { action: "resume" });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "TASK_SETUP_REQUIRED");
  assert.deepEqual(await db.get<AgentTask>(owner, "tasks", monitor.taskId), beforeTask);
  assert.deepEqual(await db.get<Monitor>(owner, "monitors", monitor.id), beforeMonitor);
  await db.remove(owner, "tasks", seeded.id);
  await db.remove(owner, "tasks", monitor.taskId);
  await db.remove(owner, "monitors", monitor.id);
});
