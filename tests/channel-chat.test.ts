import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, type TestContext, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import {
  channelLeader,
  channelMemberTools,
  circledMembers,
  parseLeaderChange,
  parseMentionIntent,
  parseRelevance,
} from "../apps/server/src/engine/channel-chat.ts";
import type { Channel, ChannelMessage } from "../packages/domain/src/channel.ts";
import { appointedLeaderId, channelHistoryPage } from "../packages/domain/src/channel.ts";

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
    const leaderChange = body.includes("LEADER_ONLY");
    const mentionTurn = body.includes("MENTION_TURN");
    const relevance = body.includes("RELEVANCE_ONLY");
    const isJia = body.includes("You are 甲");
    const replyText = leaderChange
      ? body.includes("FORCE_LEAD")
        ? "LEAD"
        : "NO"
      : mentionTurn
        ? body.includes("FORCE_MENTION_ASSIGN")
          ? "ASSIGN"
          : "ANSWER"
        : relevance
          ? body.includes("FORCE_NONE")
            ? "NO"
            : body.includes("FORCE_ASSIGN")
              ? isJia
                ? "ASSIGN"
                : "NO"
              : body.includes("FORCE_BOTH")
                ? "ANSWER"
                : body.includes("FORCE_SPECIALIST")
                  ? isJia
                    ? "NO"
                    : "ANSWER"
                  : isJia
                    ? "ANSWER"
                    : "NO"
          : body.includes("SUMMARIZE_ONLY")
            ? "两边都看完了。"
            : body.includes("WORK_PART")
              ? "@甲 这一份做完了。"
              : body.includes("ASSIGN_ONLY")
                ? "@乙 看港股。"
                : "先看需求，再给结论。";
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
    for (const delta of replyText === "先看需求，再给结论。"
      ? ["先看需求，", "再给结论。"]
      : [replyText]) {
      emit("response.output_text.delta", {
        item_id: "msg-fixture",
        output_index: 0,
        delta,
      });
    }
    emit("response.output_item.done", {
      output_index: 0,
      item: {
        id: "msg-fixture",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: replyText }],
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
            content: [{ type: "output_text", text: replyText }],
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

test("channel chat replies with one member, keeps history, and a mention selects who speaks", async (t) => {
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
      name: "双成员",
      agentIds: ["agent-a", "agent-b"],
      description: "测试频道",
      installedSkills: ["earnings-analysis"],
    }),
  });
  assert.equal(created.status, 201);
  const channel = (await created.json()) as Channel;
  assert.equal(channel.leaderId, "agent-a", "没指定时组长是成员列表的第一位");

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
    ["agent-a"],
    "没点名时，只有模型判断有关的成员回复",
  );
  assert.ok(events.some((e) => e.event === "delta"));
  assert.equal(events.at(-1)?.event, "done");
  assert.ok(prompts[0]?.includes("RELEVANCE_ONLY"), "每个成员先做一次是否有关的判断");
  assert.ok(prompts[0]?.includes("You are 甲"));
  assert.ok(prompts[1]?.includes("RELEVANCE_ONLY"));
  assert.ok(prompts[1]?.includes("You are 乙"));
  const answer = prompts[2] ?? "";
  assert.ok(answer.includes("earnings-analysis"), "频道技能只以清单进入提示词");
  assert.equal(answer.includes("# Equity Research"), false);
  assert.ok(answer.includes("use_connection"), "提示词列出账号已连接的连接");
  assert.ok(answer.includes("get_quote"), "频道成员和单聊一样能要行情");
  assert.equal(answer.includes("这条频道现在没有行情工具"), false);
  assert.equal(
    events.some((e) => e.data && JSON.stringify(e.data).includes("RELEVANCE_ONLY")),
    false,
    "是否有关的判断不推给界面",
  );

  const historyRes = await server.app.request(`/api/channels/${channel.id}/messages`, {
    headers: headers(),
  });
  const history = (await historyRes.json()) as ChannelMessage[];
  assert.equal(history.length, 2);
  assert.equal(history[0].role, "user");
  assert.equal(history[1].agentId, "agent-a");
  const latestPage = (await (
    await server.app.request(`/api/channels/${channel.id}/messages?limit=1`, { headers: headers() })
  ).json()) as { messages: ChannelMessage[]; hasMore: boolean; before: string | null };
  assert.equal(latestPage.messages.length, 1);
  assert.equal(latestPage.messages[0]?.id, history[1]?.id, "打开时只取最新一条，不从最早开始");
  assert.equal(latestPage.hasMore, true);
  const earlierPage = (await (
    await server.app.request(
      `/api/channels/${channel.id}/messages?limit=1&before=${encodeURIComponent(latestPage.before ?? "")}`,
      { headers: headers() },
    )
  ).json()) as { messages: ChannelMessage[]; hasMore: boolean };
  assert.equal(earlierPage.messages[0]?.id, history[0]?.id);
  assert.equal(earlierPage.hasMore, false);

  const named = await server.app.request(`/api/channels/${channel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "@乙 接着说需求" }),
  });
  assert.equal(named.status, 200);
  const namedEvents = await readSse(named);
  assert.deepEqual(
    namedEvents.filter((e) => e.event === "member_start").map((e) => e.data.agentId),
    ["agent-b"],
  );
  const afterMention = (await (
    await server.app.request("/api/channels", { headers: headers() })
  ).json()) as Channel[];
  assert.equal(
    afterMention.find((item) => item.id === channel.id)?.leaderId,
    "agent-a",
    "只 @ 一个人问话，组长不变",
  );
  assert.equal(
    namedEvents.some((event) => event.event === "leader"),
    false,
  );
  const pcb = await server.app.request(`/api/channels/${channel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "@乙 分析一下 PCB板块还能延续吗" }),
  });
  assert.equal(pcb.status, 200);
  const pcbEvents = await readSse(pcb);
  assert.deepEqual(
    pcbEvents.filter((event) => event.event === "member_start").map((event) => event.data.agentId),
    ["agent-b"],
  );
  assert.equal(
    pcbEvents.some((event) => event.event === "leader"),
    false,
  );
  assert.ok(prompts.some((prompt) => prompt.includes("LEADER_ONLY") && prompt.includes("PCB")));
  assert.equal(
    pcbEvents.some((event) => JSON.stringify(event.data).includes("LEADER_ONLY")),
    false,
  );
  const afterPcb = (await (
    await server.app.request("/api/channels", { headers: headers() })
  ).json()) as Channel[];
  assert.equal(afterPcb.find((item) => item.id === channel.id)?.leaderId, "agent-a");
  const keyword = await server.app.request(`/api/channels/${channel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "@乙 你来当组长，分析一下" }),
  });
  assert.equal(keyword.status, 200);
  await readSse(keyword);
  const afterKeyword = (await (
    await server.app.request("/api/channels", { headers: headers() })
  ).json()) as Channel[];
  assert.equal(
    afterKeyword.find((item) => item.id === channel.id)?.leaderId,
    "agent-a",
    "句子里写了当组长，模型没确认就不换",
  );
  const promote = await server.app.request(`/api/channels/${channel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "@乙 FORCE_LEAD 继续看" }),
  });
  assert.equal(promote.status, 200);
  const promoteEvents = await readSse(promote);
  assert.equal(
    promoteEvents.some((event) => event.event === "leader" && event.data.leaderId === "agent-b"),
    true,
  );
  const afterPromote = (await (
    await server.app.request("/api/channels", { headers: headers() })
  ).json()) as Channel[];
  assert.equal(
    afterPromote.find((item) => item.id === channel.id)?.leaderId,
    "agent-b",
    "模型确认要换组长时才换",
  );
  const followUp = prompts.at(-1) ?? "";
  assert.ok(followUp.includes("分析一下 AI 芯片需求"), "追问要带上这个频道最近的消息");
  assert.ok(followUp.includes("先看需求，再给结论。"));

  const remembered = await server.app.request(`/api/channels/${channel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "记住：茅台按消费股来看" }),
  });
  assert.equal(remembered.status, 200);
  await readSse(remembered);
  const memories = await db.list<{ agentId?: string; text: string }>("alice", "memories");
  assert.ok(
    memories.some((memory) => memory.agentId === channel.id && memory.text.includes("茅台")),
  );
  const forgotten = await server.app.request(`/api/channels/${channel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "不要记住：这句不该留下" }),
  });
  assert.equal(forgotten.status, 200);
  await readSse(forgotten);
  const afterForget = await db.list<{ text: string }>("alice", "memories");
  assert.equal(
    afterForget.some((memory) => memory.text.includes("这句不该留下")),
    false,
  );

  const form = new FormData();
  form.set("file", new File(["营收同比增长百分之十二"], "note.txt", { type: "text/plain" }));
  const uploaded = await server.app.request("/api/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  assert.equal(uploaded.status, 201);
  const file = (await uploaded.json()) as { id: string };
  const attached = await server.app.request(`/api/channels/${channel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "@甲 看这份资料", attachmentIds: [file.id] }),
  });
  assert.equal(attached.status, 200);
  await readSse(attached);
  assert.ok(prompts.at(-1)?.includes("营收同比增长百分之十二"), "附件要带上正文");

  const together = await server.app.request(`/api/channels/${channel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "你们几个一起分析需求" }),
  });
  assert.equal(together.status, 200);
  const togetherEvents = await readSse(together);
  assert.deepEqual(
    togetherEvents.filter((e) => e.event === "member_start").map((e) => e.data.agentId),
    ["agent-a"],
    "「你们几个一起」本身不让所有人发言",
  );
  const both = await server.app.request(`/api/channels/${channel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "今天看两眼 FORCE_BOTH" }),
  });
  assert.equal(both.status, 200);
  const bothEvents = await readSse(both);
  assert.deepEqual(
    bothEvents.filter((e) => e.event === "member_start").map((e) => e.data.agentId),
    ["agent-a", "agent-b"],
    "模型判断两边都有关时，两边都回复",
  );
  const silent = await server.app.request(`/api/channels/${channel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "你们几个一起 FORCE_NONE" }),
  });
  assert.equal(silent.status, 200);
  const silentEvents = await readSse(silent);
  assert.deepEqual(
    silentEvents.filter((e) => e.event === "member_start").map((e) => e.data.agentId),
    [],
    "模型判断都无关时，即使写了你们几个，也没有人发言",
  );
  const namedGroup = await server.app.request(`/api/channels/${channel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "@乙 你们几个一起看" }),
  });
  assert.equal(namedGroup.status, 200);
  const namedGroupEvents = await readSse(namedGroup);
  assert.deepEqual(
    namedGroupEvents.filter((e) => e.event === "member_start").map((e) => e.data.agentId),
    ["agent-b"],
    "点名某一个时，即使带着一起说，也只让那一个回复",
  );

  const led = await server.app.request("/api/channels", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: "乙来圈",
      agentIds: ["agent-a", "agent-b"],
      leaderId: "agent-b",
    }),
  });
  assert.equal(led.status, 201);
  const ledChannel = (await led.json()) as Channel;
  assert.equal(ledChannel.leaderId, "agent-b");
  const ledChat = await server.app.request(`/api/channels/${ledChannel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "看一下现金" }),
  });
  assert.equal(ledChat.status, 200);
  const ledEvents = await readSse(ledChat);
  assert.deepEqual(
    ledEvents.filter((e) => e.event === "member_start").map((e) => e.data.agentId),
    ["agent-a"],
    "模型判断有关的成员回复，组长不会因为身份自动发言",
  );
  const ledJudgments = prompts.filter(
    (prompt) => prompt.includes("看一下现金") && prompt.includes("RELEVANCE_ONLY"),
  );
  assert.equal(ledJudgments.length, 2);
  assert.ok(ledJudgments.some((prompt) => prompt.includes("You are 乙")));
  assert.ok(ledJudgments.some((prompt) => prompt.includes("The lead is 乙")));

  const splitting = await server.app.request("/api/channels", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name: "分工", agentIds: ["agent-a", "agent-b"] }),
  });
  assert.equal(splitting.status, 201);
  const splitChannel = (await splitting.json()) as Channel;
  const beforeSplit = prompts.length;
  const splitChat = await server.app.request(`/api/channels/${splitChannel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "今天看看盘面 FORCE_ASSIGN" }),
  });
  assert.equal(splitChat.status, 200);
  const splitEvents = await readSse(splitChat);
  assert.deepEqual(
    splitEvents.filter((e) => e.event === "member_start").map((e) => e.data.agentId),
    ["agent-a", "agent-b", "agent-a"],
    "模型让组长安排时，即使句子里没有安排、分工，也先安排再做再总结",
  );
  const splitDone = splitEvents.filter((e) => e.event === "member_done");
  assert.ok(String(splitDone[0]?.data.text).includes("@乙"));
  assert.ok(String(splitDone[1]?.data.text).includes("@甲"), "成员做完要 @ 回组长");
  assert.ok(String(splitDone[2]?.data.text).includes("两边都看完了"));
  const splitPrompts = prompts.slice(beforeSplit);
  assert.ok(splitPrompts.some((prompt) => prompt.includes("RELEVANCE_ONLY")));
  const assignPrompt = splitPrompts.find((prompt) => prompt.includes("ASSIGN_ONLY")) ?? "";
  assert.ok(assignPrompt.includes("no tools"));
  assert.ok(splitPrompts.some((prompt) => prompt.includes("WORK_PART")));
  assert.ok(splitPrompts.at(-1)?.includes("SUMMARIZE_ONLY"));
  const namedAssign = await server.app.request(`/api/channels/${splitChannel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "@乙 组长分配下任务" }),
  });
  assert.equal(namedAssign.status, 200);
  const namedAssignEvents = await readSse(namedAssign);
  assert.deepEqual(
    namedAssignEvents.filter((e) => e.event === "member_start").map((e) => e.data.agentId),
    ["agent-b"],
    "点名后模型判断自己回答时，不走四拍",
  );
  const beforeMentionAssign = prompts.length;
  const mentionAssign = await server.app.request(`/api/channels/${splitChannel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "@甲 FORCE_MENTION_ASSIGN 全面看一下" }),
  });
  assert.equal(mentionAssign.status, 200);
  const mentionAssignEvents = await readSse(mentionAssign);
  assert.deepEqual(
    mentionAssignEvents.filter((event) => event.event === "member_start").map((event) => event.data.agentId),
    ["agent-a", "agent-b", "agent-a"],
    "圈了甲且模型返回 ASSIGN 时走四拍",
  );
  assert.equal(mentionAssignEvents.some((event) => event.event === "leader"), false);
  const mentionAssignPrompts = prompts.slice(beforeMentionAssign);
  assert.ok(mentionAssignPrompts.some((prompt) => prompt.includes("MENTION_TURN")));
  const mentionAssignOnly = mentionAssignPrompts.find((prompt) => prompt.includes("ASSIGN_ONLY")) ?? "";
  assert.ok(mentionAssignOnly.includes("no tools"));
  const afterMentionAssign = (await (
    await server.app.request("/api/channels", { headers: headers() })
  ).json()) as Channel[];
  assert.equal(afterMentionAssign.find((item) => item.id === splitChannel.id)?.leaderId, "agent-a");
  const beforeMentionAnswer = prompts.length;
  const mentionAnswer = await server.app.request(`/api/channels/${splitChannel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "@乙 只分析黄金" }),
  });
  assert.equal(mentionAnswer.status, 200);
  const mentionAnswerEvents = await readSse(mentionAnswer);
  assert.deepEqual(
    mentionAnswerEvents.filter((event) => event.event === "member_start").map((event) => event.data.agentId),
    ["agent-b"],
    "圈了乙且模型返回 ANSWER 时只有乙说话",
  );
  assert.equal(mentionAnswerEvents.some((event) => event.event === "leader"), false);
  const mentionAnswerPrompts = prompts.slice(beforeMentionAnswer);
  assert.ok(mentionAnswerPrompts.some((prompt) => prompt.includes("MENTION_TURN")));
  assert.equal(mentionAnswerPrompts.some((prompt) => prompt.includes("ASSIGN_ONLY")), false);
  const afterMentionAnswer = (await (
    await server.app.request("/api/channels", { headers: headers() })
  ).json()) as Channel[];
  assert.equal(
    afterMentionAnswer.find((item) => item.id === splitChannel.id)?.leaderId,
    "agent-a",
    "只让被圈的人分析时，组长不变",
  );

  const arranged = await server.app.request("/api/channels", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name: "安排", agentIds: ["agent-a", "agent-b"] }),
  });
  assert.equal(arranged.status, 201);
  const arrangedChannel = (await arranged.json()) as Channel;
  const beforeArrange = prompts.length;
  const arrangeChat = await server.app.request(`/api/channels/${arrangedChannel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      text: "腾讯出财报了，组长安排下做个详细分析。 FORCE_SPECIALIST",
    }),
  });
  assert.equal(arrangeChat.status, 200);
  const arrangeEvents = await readSse(arrangeChat);
  assert.deepEqual(
    arrangeEvents.filter((e) => e.event === "member_start").map((e) => e.data.agentId),
    ["agent-b"],
    "句子里有安排，模型说只有组员有关时，不走四拍",
  );
  const arrangePrompts = prompts.slice(beforeArrange);
  assert.equal(
    arrangePrompts.some((prompt) => prompt.includes("ASSIGN_ONLY")),
    false,
  );

  const slow = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(
      `data: ${JSON.stringify({
        type: "response.output_text.delta",
        item_id: "msg-slow",
        output_index: 0,
        delta: "已经说到这里",
      })}\n\n`,
    );
    const timer = setTimeout(() => {
      if (!response.writableEnded) response.end();
    }, 8_000);
    request.on("close", () => clearTimeout(timer));
  });
  slow.listen(0, "127.0.0.1");
  await once(slow, "listening");
  const slowAddress = slow.address();
  assert.ok(slowAddress && typeof slowAddress !== "string");
  const fixtureUrl = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${slowAddress.port}/v1`;
  t.after(async () => {
    process.env.OPENAI_BASE_URL = fixtureUrl;
    slow.closeAllConnections();
    await new Promise<void>((resolve) => slow.close(() => resolve()));
  });
  const controller = new AbortController();
  const interrupted = await server.app.request(`/api/channels/${channel.id}/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "@甲 说到一半" }),
    signal: controller.signal,
  });
  assert.equal(interrupted.status, 200);
  const reader = interrupted.body?.getReader();
  assert.ok(reader);
  const decoder = new TextDecoder();
  let seen = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    seen += decoder.decode(chunk.value, { stream: true });
    if (seen.includes("已经说到这里")) {
      controller.abort();
      break;
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  const kept = (await (
    await server.app.request(`/api/channels/${channel.id}/messages`, { headers: headers() })
  ).json()) as ChannelMessage[];
  assert.ok(
    kept.some((message) => message.role === "member" && message.text.includes("已经说到这里")),
    "断开后已经说出的内容要留下",
  );
});

test("channel members can call the quote tool instead of a connector", async () => {
  const tools = channelMemberTools(
    {
      config: { webSearchEnabled: true, jevMode: "off" },
      computer: { provider: "docker" },
      market: {
        async getBatchQuotes(symbols: string[]) {
          return symbols.map((symbol) => ({ symbol, price: 1402.5, currency: "CNY" }));
        },
      },
      search: {
        async search() {
          return { results: [] };
        },
      },
      files: {
        async list() {
          return [{ id: "f1", name: "note.txt", mimeType: "text/plain" }];
        },
        async bytes() {
          return Buffer.from("营收");
        },
      },
      browser: {
        async observeForThread() {
          return { url: "https://example.com", title: "", text: "" };
        },
      },
    } as never,
    "alice",
    "thread",
    new AbortController().signal,
  );
  const names = tools.map((tool) => tool.name);
  assert.ok(names.includes("get_quote"));
  assert.ok(names.includes("search_web"));
  assert.ok(names.includes("list_files"));
  assert.ok(names.includes("read_file"));
  for (const name of [
    "read_calendar",
    "search_mail",
    "read_mail_thread",
    "delegate_task",
    "research_stock",
    "agent_status",
    "remember_fact",
    "write_memory",
    "recall_memory",
    "computer_status",
  ])
    assert.ok(names.includes(name), name);
  assert.equal(names.includes("list_reminders"), false);
  assert.equal(names.includes("watch_page"), false);
  assert.equal(names.includes("create_goal"), false);
  assert.equal(
    tools.find((tool) => tool.name === "delegate_task")?.description?.includes("watch_page"),
    false,
  );
  const quote = tools.find((tool) => tool.name === "get_quote");
  assert.ok(quote);
  const executed = quote as { execute?: (args: { symbols: string[] }) => Promise<unknown> };
  assert.equal(typeof executed.execute, "function");
  const result = (await executed.execute?.({ symbols: ["600519.SS"] })) as {
    quotes?: { price?: number }[];
  };
  assert.equal(result.quotes?.[0]?.price, 1402.5);
});

test("channel leader and circled ids stay inside the roster", () => {
  const members = [
    { id: "a", name: "甲", role: "甲" },
    { id: "b", name: "乙", role: "乙" },
  ];
  assert.equal(parseRelevance("ASSIGN"), "assign");
  assert.equal(parseRelevance("ANSWER"), "answer");
  assert.equal(parseRelevance("NO"), "no");
  assert.equal(parseRelevance("腾讯出财报了，组长安排下做个详细分析。"), "no");
  assert.equal(parseRelevance("你们几个一起分析需求"), "no");
  assert.equal(parseRelevance("组长分工、分配、布置一下"), "no");
  assert.equal(parseLeaderChange("LEAD"), true);
  assert.equal(parseLeaderChange("NO"), false);
  assert.equal(parseLeaderChange("@乙 分析一下 PCB板块还能延续吗"), false);
  assert.equal(parseLeaderChange("@乙 你来当组长"), false);
  assert.equal(parseMentionIntent("ASSIGN"), "assign");
  assert.equal(parseMentionIntent("ANSWER"), "answer");
  assert.equal(parseMentionIntent("请安排组员进行一轮详细分析"), "answer");
  assert.equal(parseMentionIntent("LEAD"), "answer");
  const many = Array.from({ length: 45 }, (_, index) => ({
    id: `m${index}`,
    channelId: "c",
    role: "user" as const,
    text: String(index),
    createdAt: new Date(index).toISOString(),
  }));
  const latest = channelHistoryPage(many, { limit: 30 });
  assert.equal("missing" in latest, false);
  if ("missing" in latest) return;
  assert.equal(latest.messages[0]?.id, "m15");
  assert.equal(latest.messages.at(-1)?.id, "m44");
  assert.equal(latest.hasMore, true);
  assert.equal(
    latest.messages.some((message) => message.id === "m0"),
    false,
  );
  const older = channelHistoryPage(many, { limit: 30, before: latest.before ?? "" });
  assert.equal("missing" in older, false);
  if ("missing" in older) return;
  assert.equal(older.messages[0]?.id, "m0");
  assert.equal(older.messages.at(-1)?.id, "m14");
  assert.equal(older.hasMore, false);
  assert.equal("missing" in channelHistoryPage(many, { before: "gone" }), true);
  const source = readFileSync(
    new URL("../apps/server/src/engine/channel-chat.ts", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("asksLeaderToAssign"), false);
  assert.equal(source.includes("asksEveryone"), false);
  assert.equal(source.includes("chooseSpeakers"), false);
  assert.equal(source.includes("CIRCLE_ONLY"), false);
  assert.equal(appointedLeaderId(members, "@乙 你们几个一起"), "b");
  assert.equal(
    appointedLeaderId([{ id: "mkt-1", name: "观市" }], "@观市（市场观察员） 看指数"),
    "mkt-1",
  );
  assert.equal(appointedLeaderId(members, "@甲 @乙 一起看"), undefined);
  assert.equal(channelLeader(members, "missing")?.id, "a");
  assert.equal(channelLeader(members, "b")?.id, "b");
  assert.deepEqual(
    circledMembers(members, '先这样 ["b","没有这个人"]').map((member) => member.id),
    ["b"],
  );
  assert.deepEqual(circledMembers(members, "没有名单"), []);
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
