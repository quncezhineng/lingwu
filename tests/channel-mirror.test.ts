import assert from "node:assert/strict";
import { test } from "node:test";
import { type BaseEvent, EventType, type RunAgentInput } from "@ag-ui/core";
import {
  CHANNEL_MIRROR_AGENT_ID,
  ChannelMirror,
  ChannelMirrorAgent,
  type ChannelMirrorTurn,
  channelMirrorThreadId,
} from "../apps/server/src/channel-mirror.ts";

/** 收集只做回放的镜像代理在给定输入下产出的全部事件。 */
async function collect(agent: ChannelMirrorAgent, input: RunAgentInput): Promise<BaseEvent[]> {
  const events: BaseEvent[] = [];
  await new Promise<void>((resolve, reject) => {
    agent
      .run(input)
      .subscribe({ next: (event) => events.push(event), error: reject, complete: resolve });
  });
  return events;
}

/** 组装一次镜像 run 的输入（提问进 messages，回复进 forwardedProps.replies）。 */
function mirrorInput(turn: ChannelMirrorTurn): RunAgentInput {
  return {
    threadId: channelMirrorThreadId(turn.channelId),
    runId: "run-1",
    messages: turn.question?.text
      ? [{ id: turn.question.id, role: "user", content: turn.question.text }]
      : [],
    tools: [],
    context: [],
    state: {},
    forwardedProps: { replies: turn.replies },
  };
}

/** 轮询等待条件成立，用于等待即发即忘的投递真正发生。 */
async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitFor 超时");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("channel-mirror 代理不调模型，按「先工具、后正文」回放成员回复", async () => {
  const events = await collect(
    new ChannelMirrorAgent(),
    mirrorInput({
      channelId: "c1",
      replies: [
        {
          id: "m1",
          agentId: "bot-a",
          title: "研究员",
          text: "结论：看多",
          tools: [{ id: "t1", name: "search_news", args: { q: "AI 芯片" }, result: ["r1"] }],
        },
      ],
    }),
  );

  assert.deepEqual(
    events.map((event) => event.type),
    [
      // 云端（@ag-ui/client 的 verify）要求事件流以 RUN_STARTED 开头、RUN_FINISHED 收尾。
      EventType.RUN_STARTED,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.TOOL_CALL_RESULT,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ],
  );

  // 首事件必须是 RUN_STARTED，并带上与本次 run 一致的 threadId / runId。
  const runStarted = events[0] as unknown as { threadId: string; runId: string };
  assert.equal(runStarted.threadId, channelMirrorThreadId("c1"));
  assert.equal(runStarted.runId, "run-1");

  const start = events[1] as unknown as {
    toolCallId: string;
    toolCallName: string;
    parentMessageId?: string;
  };
  assert.equal(start.toolCallId, "t1");
  assert.equal(start.toolCallName, "search_news");
  assert.equal(start.parentMessageId, "m1");
  // 工具参数对象落成字符串，正文用回复自身的 id，云端据此按助手消息保存。
  const args = events[2] as unknown as { delta: string };
  assert.equal(args.delta, JSON.stringify({ q: "AI 芯片" }));
  const content = events[6] as unknown as { messageId: string; delta: string };
  assert.equal(content.messageId, "m1");
  assert.equal(content.delta, "结论：看多");
});

test("channel-mirror 只回放不带正文的成员回复时不产生空文本事件", async () => {
  const events = await collect(
    new ChannelMirrorAgent(),
    mirrorInput({
      channelId: "c1",
      replies: [{ id: "m1", agentId: "bot-a", title: "A", text: "" }],
    }),
  );
  // 没有正文就不产生 TEXT_MESSAGE_*，只剩运行级的一头一尾。
  assert.deepEqual(
    events.map((event) => event.type),
    [EventType.RUN_STARTED, EventType.RUN_FINISHED],
  );
});

test("channel-mirror 同一频道按序串行投递，并透传提问、回复与登录凭证", async () => {
  const delivered: Array<{ input: RunAgentInput; authorization: string }> = [];
  const releases: Array<() => void> = [];
  const mirror = new ChannelMirror(async (input, authorization) => {
    delivered.push({ input, authorization });
    // 挂住不返回，直到测试显式放行，用来验证「上一轮没结束就不开下一轮」。
    await new Promise<void>((resolve) => releases.push(resolve));
  });

  mirror.turn(
    {
      channelId: "c1",
      question: { id: "q1", text: "问题一" },
      replies: [{ id: "m1", agentId: "bot-a", title: "A", text: "回答一" }],
    },
    "Bearer token-1",
  );
  mirror.turn(
    {
      channelId: "c1",
      question: { id: "q2", text: "问题二" },
      replies: [{ id: "m2", agentId: "bot-a", title: "A", text: "回答二" }],
    },
    "Bearer token-2",
  );

  await waitFor(() => delivered.length === 1);
  // 第一轮还挂着时，第二轮绝不能开始。
  assert.equal(delivered.length, 1);
  releases.shift()?.();

  await waitFor(() => delivered.length === 2);

  // 同一频道固定落同一条线程，且必须是云端接受的标准 UUID。
  const expectedThreadId = channelMirrorThreadId("c1");
  assert.match(
    expectedThreadId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.deepEqual(
    delivered.map((entry) => entry.input.threadId),
    [expectedThreadId, expectedThreadId],
  );
  assert.deepEqual(
    delivered.map((entry) => entry.authorization),
    ["Bearer token-1", "Bearer token-2"],
  );
  // 提问进 messages、回复进 forwardedProps，与 ChannelMirrorAgent 的读取口径一致。
  assert.deepEqual(delivered[0].input.messages, [{ id: "q1", role: "user", content: "问题一" }]);
  const replies = (delivered[0].input.forwardedProps as { replies: unknown[] }).replies;
  assert.equal(replies.length, 1);
  releases.shift()?.();
});

test("channel-mirror 空轮次（无提问也无回复）不投递", async () => {
  let calls = 0;
  const mirror = new ChannelMirror(async () => {
    calls += 1;
  });

  mirror.turn({ channelId: "c1", replies: [] }, "Bearer token");
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(calls, 0);
  assert.equal(CHANNEL_MIRROR_AGENT_ID, "channel-mirror");
});
