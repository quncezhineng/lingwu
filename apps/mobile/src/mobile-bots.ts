/** 手机 bots 首页用的纯函数：最近一条消息、未读点和搜索过滤。 */

export interface BotPreviewMessage {
  role: string;
  content?: unknown;
  createdAt?: string;
}

export interface BotPreview {
  text: string;
  at?: string;
}

export function messagePreviewText(content: unknown): string {
  const raw = Array.isArray(content)
    ? content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object" && "text" in part) {
            const text = (part as { text?: unknown }).text;
            return typeof text === "string" ? text : "";
          }
          return "";
        })
        .join(" ")
    : typeof content === "string"
      ? content
      : "";
  return raw.replace(/\s+/g, " ").trim();
}

/** 取最后一条用户或助手正文。没有时间戳就不编一个。 */
export function latestBotPreview(messages: readonly BotPreviewMessage[]): BotPreview | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || (message.role !== "user" && message.role !== "assistant")) continue;
    const text = messagePreviewText(message.content);
    if (!text) continue;
    return message.createdAt ? { text, at: message.createdAt } : { text };
  }
  return null;
}

/**
 * 对话本身没有已读游标。未读点只表示：这个 bot 的任务上挂着一条未读应用内通知。
 */
export function botHasUnread(
  threadId: string,
  system: boolean,
  tasks: readonly { id: string; threadId?: string }[],
  notifications: readonly { read: boolean; taskId?: string }[],
): boolean {
  const taskIds = new Set(
    tasks
      .filter((task) => task.threadId === threadId || (!task.threadId && system))
      .map((task) => task.id),
  );
  return notifications.some((item) => !item.read && !!item.taskId && taskIds.has(item.taskId));
}

export function botMatchesQuery(
  bot: { name: string; role: string },
  preview: string,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [bot.name, bot.role, preview].some((value) => value.toLowerCase().includes(needle));
}

/** 拖出边界时的阻力：位移越大，跟手越少。 */
export function rubberBandOffset(distance: number, size: number): number {
  if (!Number.isFinite(distance) || !Number.isFinite(size) || size <= 0) return 0;
  const tension = 0.55;
  const sign = Math.sign(distance);
  const span = Math.abs(distance);
  return (sign * (span * size * tension)) / (size + tension * span);
}

/** 有最近消息的排在前面；没有消息的保持原顺序接在后面。 */
export function orderBotsByActivity<T extends { id: string }>(
  bots: readonly T[],
  activityAt: Readonly<Record<string, string | undefined>>,
): T[] {
  const ranked = bots.map((bot, index) => ({ bot, index, at: activityAt[bot.id] }));
  ranked.sort((left, right) => {
    if (left.at && right.at && left.at !== right.at) return right.at.localeCompare(left.at);
    if (left.at !== right.at) return left.at ? -1 : 1;
    return left.index - right.index;
  });
  return ranked.map((item) => item.bot);
}
