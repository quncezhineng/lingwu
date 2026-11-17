import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, type TestContext, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { Channel, ChannelMessage } from "../packages/domain/src/channel.ts";

/** 最小 OpenAI Responses 协议 fixture：每个请求回一段逐字文本，验证流式链路。 */
async function textModelFixture(t: TestContext) {
  const prompts: string[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    // 记录发给模型的指令 / 消息，验证成员人设与「接话」注入。
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      // 递归收集请求里所有文本（Responses API 的 input 是嵌套 content 数组）。
      const collect = (value: unknown): string => {
        if (typeof value === "string") return value;
        if (Array.isArray(value)) return value.map(collect).join("\n");
        if (value && typeof value === "object") {
          const record = value as Record<string, unknown>;
          if (typeof record.text === "string") return record.text;
          return Object.values(record).map(collect).join("\n");
        }
        return "";
      };
      prompts.push(collect(parsed));
    } catch {
      // ignore non-JSON bodies
    }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const emit = (type: string, value: object) =>
      response.write(`data: ${JSON.stringify({ type, ...value })}\n\n`);
    const base = { id: "response-fixture", created_at: 1000, model: "fixture" };
    emit("response.created", { response: { ...base, status: "in_progress" } });
    emit("response.output_item.added", {
      output_index: 0,
      item: {
        id: "msg-fixture",
        type: "message",
        role: "assistant",
        status: "in_progress",
        content: [],
      },
    });
    emit("response.output_text.delta", {
      item_id: "msg-fixture",
      output_index: 0,
      delta: "先看需求，",
    });
    emit("response.output_text.delta", {
      item_id: "msg-fixture",
      output_index: 0,
      delta: "再给结论。",
    });
    emit("response.output_item.done", {
      output_index: 0,
      item: {
        id: "msg-fixture",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "先看需求，再给结论。" }],
      },
    });
    emit("response.completed", {
      response: {
        ...base,
        status: "completed",
        output: [
          {
            id: "msg-fixture",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: "先看需求，再给结论。" }],
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 8,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      },
    });
    response.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const previous = {
    base: process.env.OPENAI_BASE_URL,
    key: process.env.OPENAI_API_KEY,
    chat: process.env.OPENAI_CHAT_COMPLETIONS,
  };
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.OPENAI_API_KEY = "local-test-fixture";
  delete process.env.OPENAI_CHAT_COMPLETIONS;
  t.after(async () => {
    if (previous.base === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previous.base;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.key;
    if (previous.chat === undefined) delete process.env.OPENAI_CHAT_COMPLETIONS;
    else process.env.OPENAI_CHAT_COMPLETIONS = previous.chat;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return prompts;
}

type App = Awaited<ReturnType<typeof createApp>>;

let directory: string;
let db: Store;
let server: App;
let token: string;

function config(dataDir: string): Config {
  return {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir,
    agentBackend: "model",
    model: "openai/fixture",
    intelligenceApiKey: "test-project-key-never-sent",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: [],
  };
}
function headers() {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-channel-chat-"));
  db = await createStore({ dataDir: join(directory, "db") });
  server = await createApp(db, config(directory));
  token = (await server.auth.issue("alice")).token;
});
after(async () => {
  await server.agent.stop();
  await db.close();
  await rm(directory, { recursive: true, force: true });
});

/** 读完整 SSE 响应，返回 (event, data) 序列。 */
async function readSse(response: Response) {
  const text = await response.text();
  const events: { event: string; data: Record<string, unknown> }[] = [];
  for (const frame of text.split("\n\n")) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length)
      events.push({ event, data: JSON.parse(dataLines.join("\n")) as Record<string, unknown> });
  }
  return events;
}

test("channel chat streams each member in order, passes prior replies, and persists history", async (t) => {
  // 两个成员各回一轮文本。
  const prompts = await textModelFixture(t);
  // 先写入 agent-space，否则成员 threadId 无法解析（members 为空）。
  const agent = (id: string, name: string, system: boolean) => ({
    id,
    threadId: `${id}-thread`,
    template: system ? "general" : "custom",
    name,
    role: name,
    persona: "给出可核验的分析。",
    avatar: "orb",
    system,
    threadExists: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    skills: [],
    customSkills: [],
  });
  const space = {
    version: 1,
    currentAgentId: "system-agent",
    agents: [
      agent("system-agent", "系统", true),
      agent("agent-a", "甲", false),
      agent("agent-b", "乙", false),
    ],
    preferences: { name: "", risk: "", markets: [], areas: [], goal: "", horizon: "" },
    onboardingDone: true,
    onboardingStep: 4,
  };
  assert.equal(
    (
      await server.app.request("/api/agent-space", {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify(space),
      })
    ).status,
    200,
  );
  const created = await server.app.request("/api/channels", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: "双专家",
      agentIds: ["agent-a", "agent-b"],
      description: "测试频道",
    }),
  });
  assert.equal(created.status, 201);
  const channel = (await created.json()) as Channel;

  // 空历史
  const empty = await server.app.request(`/api/channels/${channel.id}/messages`, {
    headers: headers(),
  });
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), []);

  const streamed = await server.app.request(`/api/channels/${channel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "分析一下 AI 芯片需求" }),
  });
  assert.equal(streamed.status, 200);
  const events = await readSse(streamed);
  const starts = events.filter((e) => e.event === "member_start");
  assert.deepEqual(
    starts.map((e) => e.data.agentId),
    ["agent-a", "agent-b"],
  );
  assert.ok(events.some((e) => e.event === "delta"));
  assert.equal(events.at(-1)?.event, "done");

  // 落库：1 条用户 + 2 条成员回复
  const historyRes = await server.app.request(`/api/channels/${channel.id}/messages`, {
    headers: headers(),
  });
  const history = (await historyRes.json()) as ChannelMessage[];
  assert.equal(history.length, 3);
  assert.equal(history[0].role, "user");
  assert.equal(history[0].text, "分析一下 AI 芯片需求");
  assert.deepEqual(
    history.slice(1).map((m) => m.agentId),
    ["agent-a", "agent-b"],
  );
  // 后一个成员（第二次模型请求）看到了前一个成员的回复文本 → 真正的接话讨论。
  assert.ok(prompts.length >= 2, `expected two model calls, got ${prompts.length}`);
  assert.ok(
    prompts[1].includes("先看需求，再给结论。"),
    "second member should see the first member's reply as context",
  );
  assert.ok(prompts[0].includes("甲"), "first member should receive its own persona/name");
});

test("channel chat requires auth and rejects unknown channels", async () => {
  assert.equal((await server.app.request("/api/channels/nope/messages")).status, 401);
  assert.equal(
    (
      await server.app.request("/api/channels/nope/chat", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ text: "hi" }),
      })
    ).status,
    404,
  );
});
