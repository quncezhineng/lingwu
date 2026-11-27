import { type BaseEvent, EventType } from "@ag-ui/core";
import { type Observable, tap } from "rxjs";
import type { Store } from "./db.ts";
import { backgroundFailure } from "./log.ts";

/**
 * 单聊消息归档的 kind。
 *
 * 单聊正文由 CopilotKit 的 Rich Threads 托管，本服务本地只保留一个会滚动的回放
 * 窗口（见 `ConversationStream`，默认 2000 条 / 8MB），窗口外的历史在本地没有任何
 * 副本，用户提问的正文甚至从不落本地。为了「永久保存」，这里在消息经过本服务时
 * 把完整正文再落一份到自有库——复用 `records` 表，因此会自动进 Supabase。
 *
 * 只想长期保存 / 导出对话时读这张表即可，不依赖 CopilotKit 云是否还在。
 */
export const ARCHIVE_KIND = "conversation_messages";

/** 归档的一条消息：只记录「哪一轮、谁、说了什么、什么时候」，便于长期保存与导出。 */
export interface ArchivedMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  text: string;
  /**
   * 消息时间。实时归档一定有；从 CopilotKit 回填的历史消息本身不带时间戳，
   * 此时留空而不是拿「现在」冒充——宁可空着，也不制造错误的时间。
   */
  at?: string;
  /** 由一次性回填写入的标记，便于与实时归档区分。 */
  backfilled?: true;
}

/**
 * 把 AG-UI 消息的 content 抽成纯文本。
 *
 * content 既可能是字符串，也可能是 text part 数组；两种形态都要能落库，否则
 * 多模态入参下的提问正文会静默丢失。
 */
export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is Record<string, unknown> => Boolean(part) && typeof part === "object")
    .filter((part) => part.type === "text")
    .map((part) =>
      typeof part.text === "string"
        ? part.text
        : typeof part.content === "string"
          ? part.content
          : "",
    )
    .join("");
}

/**
 * 单聊对话的归档旁路。
 *
 * 只读不改：不动事件、顺序或错误语义，也不参与模型上下文装配。任何一次落库失败
 * 都只记日志——归档是补充副本，不能因为它让正在进行的对话失败。
 */
export class ConversationArchive {
  /** 正在累积的助手消息：messageId → 已拼起来的正文。 */
  private readonly drafting = new Map<string, string>();

  constructor(
    private readonly db: Store,
    private readonly now = () => new Date().toISOString(),
  ) {}

  /**
   * 归档一条用户提问。
   *
   * 用户消息只出现在请求的 `input.messages` 里、不走 AG-UI 事件流，所以必须在请求
   * 入口单独落库，否则提问正文在本地一份都没有。
   */
  async userMessage(
    owner: string,
    threadId: string,
    message: { id?: string; content?: unknown },
  ): Promise<void> {
    if (!owner || !threadId || !message.id) return;
    const text = messageText(message.content);
    if (!text) return;
    await this.persist(owner, threadId, message.id, "user", text);
  }

  /**
   * 包一层 AG-UI 事件流：边转发边把助手正文拼起来，消息结束时落库。
   *
   * 用 `tap` 而不是再次订阅：底层 observable 只被订阅一次（订阅两次会重跑模型），
   * 归档只是搭在既有管道上的旁路。
   */
  observe(owner: string, threadId: string, source: Observable<BaseEvent>): Observable<BaseEvent> {
    return source.pipe(tap((event) => this.consume(owner, threadId, event)));
  }

  private consume(owner: string, threadId: string, event: BaseEvent) {
    // `EventType` 是枚举，`event.type` 比较不会窄化联合类型；AG-UI 事件字段按项目
    // 惯例用可选断言取用（见 `ConversationStream.rememberTime`）。
    const messageId = (event as { messageId?: unknown }).messageId;
    if (typeof messageId !== "string" || !messageId) return;
    if (event.type === EventType.TEXT_MESSAGE_START) {
      this.drafting.set(messageId, "");
      return;
    }
    if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
      const delta = (event as { delta?: unknown }).delta;
      // 个别提供方会先发 CONTENT 再发 START，缺 START 时按空串起头，避免丢正文。
      this.drafting.set(
        messageId,
        (this.drafting.get(messageId) ?? "") + (typeof delta === "string" ? delta : ""),
      );
      return;
    }
    if (event.type === EventType.TEXT_MESSAGE_END) {
      const text = this.drafting.get(messageId);
      this.drafting.delete(messageId);
      if (text) void this.persist(owner, threadId, messageId, "assistant", text);
    }
  }

  /**
   * 回填一条历史消息（不经事件流）。
   *
   * 供一次性回填脚本使用：把 CopilotKit 里已存在的单聊历史直接写入归档。
   * 只收用户与助手的正文消息，工具消息等一律跳过；返回是否真的写入。
   * 同一 messageId 覆盖写，重复执行不会产生副本。
   */
  async backfill(
    owner: string,
    threadId: string,
    message: { id?: string; role?: string; content?: unknown },
  ): Promise<boolean> {
    if (!owner || !threadId || !message.id) return false;
    if (message.role !== "user" && message.role !== "assistant") return false;
    const text = messageText(message.content);
    if (!text) return false;
    return this.persist(owner, threadId, message.id, message.role, text, { backfilled: true });
  }

  /** 同一 messageId 覆盖写（records 是 upsert），重试不会产生重复副本。 */
  private async persist(
    owner: string,
    threadId: string,
    id: string,
    role: ArchivedMessage["role"],
    text: string,
    extra?: Pick<ArchivedMessage, "backfilled">,
  ): Promise<boolean> {
    try {
      // 回填的历史消息没有可靠时间，就不写 at（见 ArchivedMessage.at 的说明）。
      const record: ArchivedMessage = extra?.backfilled
        ? { id, threadId, role, text, backfilled: true }
        : { id, threadId, role, text, at: this.now() };
      await this.db.put<ArchivedMessage>(owner, ARCHIVE_KIND, record);
      return true;
    } catch (error) {
      backgroundFailure("conversation.archive", error);
      return false;
    }
  }
}
