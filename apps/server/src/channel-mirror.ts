import { createHash, randomUUID } from "node:crypto";
import { AbstractAgent } from "@ag-ui/client";
import { type BaseEvent, EventType, type Message, type RunAgentInput } from "@ag-ui/core";
import { from, type Observable } from "rxjs";
import type { ChannelToolTrace } from "../../../packages/domain/src/channel.ts";
import { backgroundFailure } from "./log.ts";

/**
 * 频道镜像专用的 agentId。
 *
 * 单聊线程列表只按 `agentId=default` 过滤（见移动端 `useThreads`），所以镜像用一个独立
 * 的 agentId，就能复用运行时的 `agent/<agentId>/run` 路由把消息写进云端，又不会把频道
 * 的镜像线程混进用户的单聊列表里。
 */
export const CHANNEL_MIRROR_AGENT_ID = "channel-mirror";

/** 频道镜像线程 id 的命名空间：灵悟自有、固定不变，用来把 channelId 稳定映射成 UUID。 */
const MIRROR_THREAD_NAMESPACE = "8f9d3c52-6b41-4f7a-9d2e-1a0c5b7e3f84";

/**
 * 按 RFC 4122 版本 5（SHA-1）生成确定性 UUID：同一 `namespace` + `name` 永远得到同一个 id。
 *
 * 用确定性 UUID 而不是随机 UUID，是为了让「同一频道 = 同一线程」这条约束不依赖任何持久化
 * 映射表：channelId 相同，线程 id 就相同，历史自然连续。
 */
function uuidv5(namespace: string, name: string): string {
  const namespaceBytes = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const digest = createHash("sha1").update(namespaceBytes).update(name, "utf8").digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // 版本号固定为 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 变体位
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 该频道在 CopilotKit 里的线程 id：一个频道一条线程，历史保持连续。
 *
 * 云端（CopilotKit Intelligence）只接受标准 UUID 作 threadId —— 非 UUID 的自定义 id 会被
 * 云端以 400 VALIDATION_ERROR 拒绝（`Failed to get or create thread`），线程压根建不起来。
 * 因此这里把 channelId 经固定命名空间确定性地映射成 UUID：既满足云端的格式要求，又保持
 * 「同频道同线程」。
 */
export function channelMirrorThreadId(channelId: string): string {
  return uuidv5(MIRROR_THREAD_NAMESPACE, channelId);
}

/** 要镜像的一条成员回复：正文，外加这一轮里该成员调过的工具。 */
export interface ChannelMirrorReply {
  id: string;
  agentId: string;
  title: string;
  text: string;
  tools?: ChannelToolTrace[];
}

/** 要镜像的一轮频道对话：一条用户提问 + 本轮所有成员的回复。 */
export interface ChannelMirrorTurn {
  channelId: string;
  /** 继续分析（resume）时沿用原提问，其 id 早已在云端线程里，重复投递会被自动去重。 */
  question?: { id: string; text: string };
  replies: ChannelMirrorReply[];
}

/** 工具参数 / 结果可能是对象，统一落成字符串（AG-UI 工具事件的载荷是文本）。 */
function stringifyToolValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

/**
 * 把一条成员回复翻译成 AG-UI 事件：先工具过程，后正文。
 *
 * 形态与真实模型输出一致（真实回复也是「先调工具、后给结论」），因此云端会按正常的
 * 助手消息、工具消息保存，和单聊里看到的记录是同一种东西。
 */
function eventsForReply(reply: ChannelMirrorReply): BaseEvent[] {
  const events: BaseEvent[] = [];
  for (const tool of reply.tools ?? []) {
    events.push({
      type: EventType.TOOL_CALL_START,
      toolCallId: tool.id,
      toolCallName: tool.name,
      parentMessageId: reply.id,
    });
    events.push({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: tool.id,
      delta: stringifyToolValue(tool.args),
    });
    events.push({ type: EventType.TOOL_CALL_END, toolCallId: tool.id });
    events.push({
      type: EventType.TOOL_CALL_RESULT,
      messageId: randomUUID(),
      toolCallId: tool.id,
      content: stringifyToolValue(tool.result),
    });
  }
  if (reply.text) {
    events.push({ type: EventType.TEXT_MESSAGE_START, messageId: reply.id, role: "assistant" });
    events.push({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: reply.id, delta: reply.text });
    events.push({ type: EventType.TEXT_MESSAGE_END, messageId: reply.id });
  }
  return events;
}

/**
 * 只做「回放」的镜像代理：不调用任何模型，把本轮内容原样转成 AG-UI 事件。
 *
 * CopilotKit 没有写消息的 REST 接口 —— 消息只能靠「让某个 agent 经运行时跑一遍」投递落库。
 * 所以镜像复用的就是这条既有通道：这里把提问放在 `input.messages`（云端按用户消息保存），
 * 把成员回复与工具过程放在 `forwardedProps.replies`，再由本代理转成事件（云端按助手消息
 * 与工具消息保存）。零模型调用，事件通道与真实回复完全一致。
 */
export class ChannelMirrorAgent extends AbstractAgent {
  constructor() {
    super({ agentId: CHANNEL_MIRROR_AGENT_ID });
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    const replies = (input.forwardedProps as { replies?: ChannelMirrorReply[] } | undefined)
      ?.replies;
    // AG-UI 协议要求事件流以 RUN_STARTED 开头、以 RUN_FINISHED 收尾（@ag-ui/client 的 verify
    // 会校验），否则云端收到第一个事件就抛 "First event must be 'RUN_STARTED'"，助手回复整段
    // 被丢弃、无法落库。这两个是「运行级」事件，每轮跑一次，包住所有回复事件。
    const events: BaseEvent[] = [
      { type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId },
      ...(replies ?? []).flatMap((reply) => eventsForReply(reply)),
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
        outcome: { type: "success" },
      },
    ];
    return from(events);
  }
}

/** 组装投递给运行时的那次 run。 */
function buildMirrorInput(turn: ChannelMirrorTurn): RunAgentInput {
  const messages: Message[] = turn.question?.text
    ? [{ id: turn.question.id, role: "user", content: turn.question.text }]
    : [];
  return {
    threadId: channelMirrorThreadId(turn.channelId),
    runId: randomUUID(),
    messages,
    tools: [],
    context: [],
    state: {},
    forwardedProps: { replies: turn.replies },
  };
}

/**
 * 频道 → CopilotKit 云的旁路镜像。
 *
 * 频道仍然照旧在本地跑模型、按原样子回复（Supabase 里的 `channel_messages` 继续全量留档、
 * 作为读取源）；这里只是把同一轮的提问、成员回复和工具过程额外复制一份送进 CopilotKit 云
 * 落库，让云端成为消息正文的主副本。
 *
 * 纯旁路：异步投递、不 await；任何失败只记日志，绝不阻塞或影响正在进行的频道对话。
 */
export class ChannelMirror {
  /** 每个频道一条串行链：同一线程不并发跑，避免云端拒绝「Thread already running」。 */
  private readonly tails = new Map<string, Promise<void>>();

  constructor(
    private readonly deliver: (input: RunAgentInput, authorization: string) => Promise<void>,
  ) {}

  /**
   * 把一轮对话镜像进 CopilotKit（即发即忘）。
   *
   * `authorization` 沿用发起这一轮频道对话的登录凭证：云端按它识别用户，镜像消息才会落进
   * 同一个账号下。这里只是透传，不落库、不新建会话。
   */
  turn(turn: ChannelMirrorTurn, authorization: string): void {
    if (!turn.question && !turn.replies.length) return;
    const input = buildMirrorInput(turn);
    const previous = this.tails.get(input.threadId) ?? Promise.resolve();
    const next = previous
      .then(() => this.deliver(input, authorization))
      .catch((error) => backgroundFailure("channel.mirror", error));
    this.tails.set(input.threadId, next);
  }
}
