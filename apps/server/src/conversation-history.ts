import { z } from "zod";
import { AppError } from "./errors.ts";

/** Share cloud snapshots between pages; a local run invalidates them immediately. */
export class ConversationHistory<T extends { id: string; role: string }> {
  private readonly snapshots = new Map<string, { messages: T[]; version: number; at: number }>();
  private readonly pending = new Map<string, { version: number; request: Promise<T[]> }>();
  constructor(
    private readonly read: (owner: string, threadId: string) => Promise<T[]>,
    private readonly version: (owner: string, threadId: string) => Promise<number>,
    private readonly now = Date.now,
  ) {}
  async messages(owner: string, threadId: string): Promise<T[]> {
    const key = JSON.stringify([owner, threadId]);
    const version = await this.version(owner, threadId);
    const snapshot = this.snapshots.get(key);
    if (snapshot && snapshot.version === version && this.now() - snapshot.at < 30_000)
      return snapshot.messages;
    const running = this.pending.get(key);
    if (running?.version === version) return running.request;
    const request = this.read(owner, threadId)
      .then((messages) => {
        // A slower read started before a new run must not replace its newer snapshot.
        if ((this.snapshots.get(key)?.version ?? -1) > version) return messages;
        this.snapshots.delete(key);
        this.snapshots.set(key, { messages, version, at: this.now() });
        if (this.snapshots.size > 20) {
          const oldest = this.snapshots.keys().next().value;
          if (oldest !== undefined) this.snapshots.delete(oldest);
        }
        return messages;
      })
      .finally(() => {
        if (this.pending.get(key)?.request === request) this.pending.delete(key);
      });
    this.pending.set(key, { version, request });
    return request;
  }
}

export const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().min(1).max(500).optional(),
});

/**
 * 把会话流记录的消息时间挂到 `metadata.at` 上。
 *
 * Rich Threads 保存的消息体不带时间戳，而回复下面要显示的时间正好是流里
 * 这条消息第一次出现的时间。挂在 `metadata` 上是 AG-UI 消息模型允许的字段，
 * 回传给模型时会被忽略，不会影响上下文。
 */
export function withMessageTimes<
  T extends { id: string; role: string; metadata?: Record<string, unknown> },
>(messages: readonly T[], times: Readonly<Record<string, string>>): readonly T[] {
  if (!Object.keys(times).length) return messages;
  return messages.map((message) => {
    const at = times[message.id];
    // 已经有时间（例如未来某天由上游写入）就不覆盖。
    if (!at || message.metadata?.at) return message;
    return { ...message, metadata: { ...message.metadata, at } } as T;
  });
}

/** Page visible messages, keeping the tool results attached to their assistant. */
export function conversationHistoryPage<T extends { id: string; role: string }>(
  messages: readonly T[],
  { limit, before }: z.infer<typeof historyQuery>,
) {
  const end = before === undefined ? messages.length : messages.findIndex((m) => m.id === before);
  if (end < 0)
    throw new AppError(
      "The history position is no longer available. Reload the conversation.",
      409,
    );
  let start = end;
  let count = 0;
  while (start > 0) {
    const message = messages[--start];
    if (message.role === "user" || message.role === "assistant") count += 1;
    if (count === limit) break;
  }
  return {
    messages: messages.slice(start, end),
    hasMore: start > 0,
    before: start > 0 ? messages[start].id : null,
  };
}
