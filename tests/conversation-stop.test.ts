import assert from "node:assert/strict";
import test from "node:test";
import { EventType, type RunAgentInput } from "@ag-ui/core";
import { createApp } from "../apps/server/src/app.ts";
import { ConversationAgent } from "../apps/server/src/engine/conversation.ts";
import type { AgentTask } from "../packages/domain/src/agent.ts";
import { browserFixture } from "./helpers/browser.ts";

function queuedTask(id: string, threadId: string): AgentTask {
  const now = new Date().toISOString();
  return {
    id,
    title: "Keep going",
    prompt: "Keep going",
    kind: "agent",
    status: "queued",
    threadId,
    plan: [],
    evidence: [],
    input: {},
    state: {},
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    leaseId: null,
    leaseUntil: null,
    artifactIds: [],
  };
}

function input(threadId: string): RunAgentInput {
  return {
    threadId,
    runId: "run-stop",
    messages: [{ id: "m1", role: "user", content: "please research this carefully" }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

test("stopping a conversation ends the run and cancels its open tasks", async (t) => {
  const f = await browserFixture(t, () => ({ data: {} }));
  const server = await createApp(f.db, { ...f.config, agentBackend: "sample" });
  t.after(() => server.agent.stop());
  const threadId = "thread-stop";
  await f.db.put("local-user", "tasks", queuedTask("task-open", threadId));
  await f.db.put("local-user", "tasks", queuedTask("task-other", "another-thread"));
  const conversation = new ConversationAgent(
    { ...f.config, agentBackend: "sample" },
    server.agent,
    "local-user",
  );
  const events: { type: string }[] = [];
  let completed = false;
  const subscription = conversation.run(input(threadId)).subscribe({
    next: (event) => events.push(event),
    complete: () => {
      completed = true;
    },
  });
  conversation.abortRun();
  await new Promise((resolve) => setTimeout(resolve, 50));
  subscription.unsubscribe();

  assert.equal(completed, true);
  assert.ok(events.some((event) => event.type === EventType.RUN_FINISHED));
  assert.ok(!events.some((event) => event.type === EventType.TEXT_MESSAGE_CONTENT));
  assert.equal(
    (await f.db.get<AgentTask>("local-user", "tasks", "task-open"))?.status,
    "cancelled",
  );
  assert.equal((await f.db.get<AgentTask>("local-user", "tasks", "task-other"))?.status, "queued");
});
