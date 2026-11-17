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

/**
 * 只取「回复」的预览：从后往前找一条指定角色的消息。
 *
 * 左侧栏的小字要展示「最近回复」，所以不把用户自己发的话算进去：
 * 智能体对话的回复是 `assistant`，频道群聊的回复是 `member`。
 * 没有回复时返回 null，由调用方显示「还没有消息」。
 */
export function latestReplyPreview(
  messages: readonly { role: string; content?: unknown; text?: string; createdAt?: string }[],
  replyRoles: readonly string[] = ["assistant"],
): BotPreview | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || !replyRoles.includes(message.role)) continue;
    const text = replyPreviewText(messagePreviewText(message.text ?? message.content));
    if (!text) continue;
    return message.createdAt ? { text, at: message.createdAt } : { text };
  }
  return null;
}

/**
 * 回复正文是 Markdown，一行小字放不下它的记号：`##`、`**`、列表点只会先占掉宽度，
 * 让真正的内容被挤出屏幕，所以先剥掉再截断。
 */
export function replyPreviewText(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-\s]+/, "");
}

/**
 * 把 Markdown 标记从预览文本里剥掉，只留可读文字。
 * 模型回复常带标题（#）、强调（**）、表格（|）、列表（- / 1.）、代码（`）等，
 * 左侧栏预览直接展示时不应把这些符号原样带出来。
 */
function stripMarkdownFlags(text: string): string {
  return (
    text
      .replace(/\\n/g, " ")
      // 链接只保留展示文字
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      // 行首标记：标题 / 引用 / 无序列表 / 有序列表
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/^[-*+]\s+/gm, "")
      .replace(/^\d+[.)]\s+/gm, "")
      // 表格：分隔线（|---|...）整行删除，普通表格行把竖线换成空格
      .replace(/^\s*\|[\s:\-|]+\|\s*$/gm, "")
      .replace(/^\s*\|.*\|\s*$/gm, (line) => line.replace(/\|/g, " ").trim())
      // 横线分隔
      .replace(/^-{3,}\s*$/gm, "")
      // 行内强调 / 代码 / 删除线 / 残留井号与竖线
      .replace(/[*_`~#|]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
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
  return stripMarkdownFlags(raw);
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
