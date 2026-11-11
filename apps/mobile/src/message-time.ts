/**
 * 助手回复下面显示的时间。
 *
 * 消息正文由 Rich Threads 持久化，本身不带时间戳。服务端在转发会话流时记下每条
 * 消息第一次出现的时间，并随消息的 `metadata.at` 一起下发（见
 * `apps/server/src/engine/stream.ts` 的 `messageTimes`）。
 *
 * 拿不到这个字段就不显示时间：给一条几天前的消息补上「现在」只会误导人。
 */
import { activeLocaleTag, tr } from "./i18n/translate";

const DAY_MS = 86_400_000;

/** 读取 `metadata.at`（ISO 字符串或毫秒时间戳）；拿不到时返回 0。 */
export function messageTimeAt(message: unknown): number {
  if (!message || typeof message !== "object") return 0;
  const metadata = (message as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object") return 0;
  const at = (metadata as { at?: unknown }).at;
  if (typeof at === "number") return Number.isFinite(at) && at > 0 ? at : 0;
  if (typeof at !== "string" || !at) return 0;
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * 当天只显示时分；昨天、本周、更早逐级补上日期，和聊天软件的习惯一致。
 */
export function formatMessageTime(at: number, now = Date.now()): string {
  if (!Number.isFinite(at) || at <= 0) return "";
  const date = new Date(at);
  const stamp = date.getTime();
  if (!Number.isFinite(stamp)) return "";
  const tag = activeLocaleTag();
  const time = date.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });
  const days = dayDifference(new Date(now), date);
  if (days === 0) return time;
  if (days === 1) return tr("chat.timeYesterday", { time });
  if (days < 7 && days > 0) return `${date.toLocaleDateString(tag, { weekday: "short" })} ${time}`;
  const day = date.toLocaleDateString(tag, {
    ...(date.getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }),
    month: "short",
    day: "numeric",
  });
  return `${day} ${time}`;
}

/** 自然日之差：23:59 与次日 00:01 相差一天，而不是零天。 */
function dayDifference(reference: Date, date: Date): number {
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  return Math.round((startOfDay(reference) - startOfDay(date)) / DAY_MS);
}

/**
 * 老对话的近似时间。
 *
 * 这版之前产生的消息在会话流里没有留下时间记录，直接留白会让历史对话看起来像坏掉。
 * 所以只要还拿得到这个对话里的真实锚点，就按消息顺序在锚点之间线性插值：
 *
 * - `known`：真实时间（会话流记录的 `metadata.at`），是最可靠的锚点；
 * - `earlierAnchors`：这个对话里更早的真实记录（例如任务创建时间），只用来把范围
 *   往前扩，绝不会算出锚点范围之外的时间。
 *
 * 提问紧挨着它那条回复，所以直接取后一条回复的真实时间，比按间距平摊更准。
 *
 * 一条锚点都没有的对话返回空表——宁可不显示，也不编一个时间出来。
 */
export function interpolateMessageTimes(
  messages: readonly { id: string; role?: string }[],
  known: Readonly<Record<string, number>>,
  earlierAnchors: readonly number[] = [],
): Record<string, number> {
  const pins: { index: number; at: number }[] = [];
  messages.forEach((message, index) => {
    const at = known[message.id];
    if (!Number.isFinite(at) || at <= 0) return;
    // 分页拼接、重放都可能让时间轻微逆序，插值前先修成单调递增。
    const previous = pins[pins.length - 1]?.at ?? 0;
    pins.push({ index, at: Math.max(at, previous) });
  });
  if (!pins.length) return {};

  let start = pins[0].at;
  for (const at of earlierAnchors) {
    if (Number.isFinite(at) && at > 0 && at < start) start = at;
  }
  // 只有一个锚点、又没有更早的记录时没有时间跨度，插值只会得到同一个时间。
  if (start >= pins[pins.length - 1].at) return {};

  const nodes: { index: number; at: number; head: boolean }[] = pins.map((pin) => ({
    ...pin,
    head: false,
  }));
  // 只有真的存在「更早的真实记录」时，才把第 0 条消息也纳入插值；
  // 否则更早的那些消息保留空白，而不是被压到第一条已知消息的时间上。
  if (pins[0].index > 0 && start < pins[0].at) nodes.unshift({ index: 0, at: start, head: true });

  const filled: Record<string, number> = {};
  for (let k = 0; k < nodes.length - 1; k += 1) {
    const from = nodes[k];
    const to = nodes[k + 1];
    const span = to.index - from.index;
    if (span <= 0) continue;
    // 首条虚拟锚点直接就是第 0 条消息的时间，中间锚点则跳过它自己。
    for (let i = from.head ? from.index : from.index + 1; i < to.index; i += 1) {
      const message = messages[i];
      if (!message || known[message.id]) continue;
      // 提问就发生在它那条回复之前，用回复的真实时间比按消息间距平摊更准；
      // 首段（更早的提问）没有这样的参照，仍按跨度插值。
      const lean = message.role === "user" && !from.head;
      filled[message.id] = lean
        ? to.at
        : Math.round(from.at + ((to.at - from.at) * (i - from.index)) / span);
    }
  }
  return filled;
}
