import type { ChannelMessage } from "../../../packages/domain/src/channel.ts";

/** 增量写回这个人自己还在说的气泡，不贴到最后一条别人的消息上。 */
export function appendMemberDelta(
  current: readonly ChannelMessage[],
  channelId: string,
  agentId: string,
  delta: string,
  title = "",
): ChannelMessage[] {
  const next = current.slice();
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const message = next[index];
    if (
      message &&
      message.role === "member" &&
      message.agentId === agentId &&
      message.id.startsWith("live:")
    ) {
      next[index] = { ...message, text: message.text + delta };
      return next;
    }
  }
  next.push({
    id: `live:${agentId}:${Date.now()}`,
    channelId,
    role: "member",
    agentId,
    title,
    text: delta,
    createdAt: new Date().toISOString(),
  });
  return next;
}
