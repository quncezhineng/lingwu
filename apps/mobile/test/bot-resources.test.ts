import assert from "node:assert/strict";
import test from "node:test";
import type { AgentArtifact, AgentTask, Monitor } from "../../../packages/domain/src/agent.ts";
import type { Artifact } from "../../../packages/domain/src/index.ts";
import { selectBotResources } from "../src/bot-resources.ts";

const createdAt = "2026-11-02T10:00:00.000Z";
function task(id: string, threadId?: string, artifactIds: string[] = []): AgentTask {
  return {
    id,
    threadId,
    artifactIds,
    title: id,
    prompt: "",
    kind: "agent",
    status: "succeeded",
    plan: [],
    evidence: [],
    input: {},
    state: {},
    createdAt,
    updatedAt: createdAt,
    attempts: 1,
  };
}
function artifact(id: string, taskId: string): AgentArtifact {
  return { id, taskId, title: id, summary: "", kind: "report", data: {}, createdAt };
}
function monitor(id: string, taskId: string, status: Monitor["status"] = "active"): Monitor {
  return {
    id,
    taskId,
    title: id,
    url: "https://example.com",
    condition: "change",
    value: "",
    intervalMinutes: 15,
    status,
    nextCheckAt: createdAt,
    checks: 0,
  };
}
function file(id: string): Artifact {
  return {
    id,
    name: id,
    mimeType: "text/plain",
    size: 1,
    pageCount: 0,
    url: `/api/files/${id}`,
    createdAt,
    source: "agent",
  };
}

test("Bot resource pages exclude other Bots and share the same counts as management", () => {
  const data = {
    tasks: [
      task("own", "own-thread", ["own-file"]),
      task("other", "other-thread", ["other-file"]),
      task("legacy"),
    ],
    artifacts: [
      artifact("own-report", "own"),
      artifact("other-report", "other"),
      artifact("orphan-report", "missing"),
    ],
    monitors: [
      monitor("own-watch", "own"),
      monitor("paused-watch", "own", "paused"),
      monitor("stopped-watch", "own", "stopped"),
      monitor("other-watch", "other"),
    ],
  };
  const resources = selectBotResources({ threadId: "own-thread", system: false }, data, [
    file("own-file"),
    file("other-file"),
    file("unlinked-file"),
  ]);
  assert.deepEqual(
    resources.tasks.map((item) => item.id),
    ["own"],
  );
  assert.deepEqual(
    resources.artifacts.map((item) => item.id),
    ["own-report"],
  );
  assert.deepEqual(
    resources.files.map((item) => item.id),
    ["own-file"],
  );
  assert.deepEqual(
    resources.monitors.map((item) => item.id),
    ["own-watch", "paused-watch"],
  );
});

test("the system Bot keeps legacy resources without claiming another Bot's tasks", () => {
  const resources = selectBotResources(
    { threadId: "main-thread", system: true },
    {
      tasks: [
        task("main", "main-thread"),
        task("legacy", undefined, ["legacy-file"]),
        task("custom", "custom-thread"),
      ],
      artifacts: [artifact("legacy-report", "legacy"), artifact("custom-report", "custom")],
      monitors: [monitor("legacy-watch", "legacy"), monitor("custom-watch", "custom")],
    },
    [file("legacy-file")],
  );
  assert.deepEqual(
    resources.tasks.map((item) => item.id),
    ["main", "legacy"],
  );
  assert.deepEqual(
    resources.artifacts.map((item) => item.id),
    ["legacy-report"],
  );
  assert.deepEqual(
    resources.files.map((item) => item.id),
    ["legacy-file"],
  );
  assert.deepEqual(
    resources.monitors.map((item) => item.id),
    ["legacy-watch"],
  );
});

test("resource pages can render before the workspace data arrives", () => {
  assert.deepEqual(selectBotResources({ threadId: "pending", system: false }), {
    tasks: [],
    artifacts: [],
    monitors: [],
    files: [],
  });
});
