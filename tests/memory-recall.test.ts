import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { EventSchemas, EventType, type RunAgentInput } from "@ag-ui/core";
import { lastValueFrom, toArray } from "rxjs";
import { createApp } from "../apps/server/src/app.ts";
import { ConversationAgent } from "../apps/server/src/engine/conversation.ts";
import { recallMemories } from "../apps/server/src/engine/memory-recall.ts";
import type { AgentMemory } from "../packages/domain/src/agent.ts";
import { browserFixture } from "./helpers/browser.ts";
import { modelFixture } from "./helpers/model.ts";

function memory(id: string, text: string, createdAt: string): AgentMemory {
  return { id, text, source: "User confirmed in chat", createdAt };
}

test("memory recall ranks phrase and word matches before recency", () => {
  const result = recallMemories(
    [
      memory("new", "The office is in Shanghai.", "2026-10-25T04:00:00.000Z"),
      memory("landlord", "The landlord is Bob Li.", "2026-10-25T03:00:00.000Z"),
      memory("bob", "Bob prefers email.", "2026-10-25T05:00:00.000Z"),
    ],
    "landlord Bob",
  );
  assert.deepEqual(
    result.map((item) => item.id),
    ["landlord", "bob"],
  );
});

test("memory recall is bounded and returns nothing without matching terms", () => {
  const memories = Array.from({ length: 25 }, (_, index) =>
    memory(String(index), `Project note ${index}`, `2026-10-25T00:00:${index}.000Z`),
  );
  assert.equal(recallMemories(memories, "project", 50).length, 20);
  assert.deepEqual(recallMemories(memories, "unrelated"), []);
  assert.deepEqual(recallMemories(memories, "   "), []);
});

test("the conversation recalls only its owner's matching memories", async (t) => {
  const { requests } = await modelFixture(t, (index) =>
    index === 0
      ? { name: "recall_memory", arguments: { query: "landlord", limit: 10 } }
      : undefined,
  );
  const f = await browserFixture(t, () => {
    throw new Error("Recalling memory must not use the browser");
  });
  const config = { ...f.config, agentBackend: "model" as const, model: "openai/fixture" };
  const server = await createApp(f.db, config);
  t.after(() => server.agent.stop());

  await f.db.put(
    "local-user",
    "memories",
    memory("local", "The landlord is Bob Li.", "2026-10-25T03:00:00.000Z"),
  );
  await f.db.put(
    "another-owner",
    "memories",
    memory("foreign", "The landlord is a secret.", "2026-10-25T04:00:00.000Z"),
  );

  const conversation = new ConversationAgent(config, server.agent, "local-user");
  const input: RunAgentInput = {
    threadId: "memory-chat",
    runId: randomUUID(),
    messages: [{ id: randomUUID(), role: "user", content: "Who is my landlord?" }],
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
    query: "landlord",
    memories: [
      {
        id: "local",
        text: "The landlord is Bob Li.",
        source: "User confirmed in chat",
        createdAt: "2026-10-25T03:00:00.000Z",
      },
    ],
  });
  assert.match(requests[0]?.body ?? "", /recall_memory/);
});

test("Hindsight semantic recall surfaces a memory keywords alone would miss", async (t) => {
  // 假 Hindsight：记录请求，recall 固定回「房东」那条语义命中。
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  const hindsight = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ path: request.url ?? "", body: body ? JSON.parse(body) : {} });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      request.url?.includes("/memories/recall")
        ? JSON.stringify({ memories: [{ id: "landlord", text: "The landlord is Bob Li." }] })
        : "{}",
    );
  });
  hindsight.listen(0, "127.0.0.1");
  await once(hindsight, "listening");
  const address = hindsight.address();
  assert.ok(address && typeof address !== "string");
  t.after(async () => {
    hindsight.closeAllConnections();
    await new Promise<void>((resolve) => hindsight.close(() => resolve()));
  });

  // 查询词与记忆没有任何共同关键词：关键词召回会返回空，只有语义召回能命中。
  await modelFixture(t, (index) =>
    index === 0
      ? { name: "recall_memory", arguments: { query: "who collects my payment", limit: 10 } }
      : undefined,
  );
  const f = await browserFixture(t, () => ({ data: {} }));
  const config = {
    ...f.config,
    agentBackend: "model" as const,
    model: "openai/fixture",
    hindsightBaseUrl: `http://127.0.0.1:${address.port}`,
  };
  const server = await createApp(f.db, config);
  t.after(() => server.agent.stop());

  await f.db.put(
    "local-user",
    "memories",
    memory("landlord", "The landlord is Bob Li.", "2026-10-25T03:00:00.000Z"),
  );

  const conversation = new ConversationAgent(config, server.agent, "local-user");
  const events = (
    await lastValueFrom(
      conversation
        .run({
          threadId: "semantic-recall",
          runId: randomUUID(),
          messages: [{ id: randomUUID(), role: "user", content: "Who do I pay rent to?" }],
          tools: [],
          context: [],
          state: {},
        })
        .pipe(toArray()),
    )
  ).map((event) => EventSchemas.parse(event));
  const result = events.find((event) => event.type === EventType.TOOL_CALL_RESULT);
  assert.ok(result && result.type === EventType.TOOL_CALL_RESULT);
  assert.deepEqual(JSON.parse(result.content), {
    query: "who collects my payment",
    memories: [
      {
        id: "landlord",
        text: "The landlord is Bob Li.",
        source: "User confirmed in chat",
        createdAt: "2026-10-25T03:00:00.000Z",
      },
    ],
  });
  assert.ok(
    requests.some((item) => item.path === "/v1/default/banks/local-user:default/memories/recall"),
    "召回要真的打到 Hindsight 的 default bank",
  );
});

test("semantic recall degrades to keyword search when Hindsight fails", async (t) => {
  const hindsight = createServer((_request, response) => {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end("{}");
  });
  hindsight.listen(0, "127.0.0.1");
  await once(hindsight, "listening");
  const address = hindsight.address();
  assert.ok(address && typeof address !== "string");
  t.after(async () => {
    hindsight.closeAllConnections();
    await new Promise<void>((resolve) => hindsight.close(() => resolve()));
  });

  await modelFixture(t, (index) =>
    index === 0
      ? { name: "recall_memory", arguments: { query: "landlord", limit: 10 } }
      : undefined,
  );
  const f = await browserFixture(t, () => ({ data: {} }));
  const config = {
    ...f.config,
    agentBackend: "model" as const,
    model: "openai/fixture",
    hindsightBaseUrl: `http://127.0.0.1:${address.port}`,
  };
  const server = await createApp(f.db, config);
  t.after(() => server.agent.stop());

  await f.db.put(
    "local-user",
    "memories",
    memory("landlord", "The landlord is Bob Li.", "2026-10-25T03:00:00.000Z"),
  );

  const conversation = new ConversationAgent(config, server.agent, "local-user");
  const events = (
    await lastValueFrom(
      conversation
        .run({
          threadId: "degraded-recall",
          runId: randomUUID(),
          messages: [{ id: randomUUID(), role: "user", content: "Who is my landlord?" }],
          tools: [],
          context: [],
          state: {},
        })
        .pipe(toArray()),
    )
  ).map((event) => EventSchemas.parse(event));
  const result = events.find((event) => event.type === EventType.TOOL_CALL_RESULT);
  assert.ok(result && result.type === EventType.TOOL_CALL_RESULT);
  assert.deepEqual(JSON.parse(result.content), {
    query: "landlord",
    memories: [
      {
        id: "landlord",
        text: "The landlord is Bob Li.",
        source: "User confirmed in chat",
        createdAt: "2026-10-25T03:00:00.000Z",
      },
    ],
  });
});

test("preferences confirmed in chat persist with a category", async (t) => {
  await modelFixture(t, (index) =>
    index === 0
      ? {
          name: "remember_fact",
          arguments: { text: "Prefers low-volatility funds", category: "风险偏好" },
        }
      : undefined,
  );
  const f = await browserFixture(t, () => {
    throw new Error("Remembering a preference must not use the browser");
  });
  const config = { ...f.config, agentBackend: "model" as const, model: "openai/fixture" };
  const server = await createApp(f.db, config);
  t.after(() => server.agent.stop());

  const conversation = new ConversationAgent(config, server.agent, "local-user");
  const input: RunAgentInput = {
    threadId: "remember-preference-chat",
    runId: randomUUID(),
    messages: [
      { id: randomUUID(), role: "user", content: "Remember that I prefer low volatility." },
    ],
    tools: [],
    context: [],
    state: {},
  };
  await lastValueFrom(conversation.run(input).pipe(toArray()));

  const [saved] = await f.db.list<AgentMemory>("local-user", "memories");
  assert.equal(saved?.text, "Prefers low-volatility funds");
  assert.equal(saved?.category, "风险偏好");
  assert.equal(saved?.source, "User confirmed in chat");
});
