import { z } from "zod";

/**
 * 多 Agent 群聊频道（M2）。
 *
 * 一个频道 = 一组选定的 Agent 成员 + 一个共享对话空间。用户在频道里发一条消息，
 * 每个成员 Agent 用自己的人设/模板独立回复，用户在同一界面看到多专家视角。
 * 频道本身只存元数据（成员、名称），消息承载复用 CopilotKit thread（每个 Agent
 * 成员各自一个 thread，频道聚合展示）。
 */

/** 频道群组头像：与 Agent 头像同一套 orb 配色，给频道一个视觉身份。 */
export type ChannelAvatarId = "orb" | "bloom" | "moon" | "planet" | "cat";
export const CHANNEL_AVATARS: readonly ChannelAvatarId[] = [
  "orb",
  "bloom",
  "moon",
  "planet",
  "cat",
];

export interface Channel {
  id: string;
  name: string;
  /** 频道成员 Agent 的 id（= agent-space 的 agents[].id）。 */
  agentIds: string[];
  /** 频道创建时可选的目标说明，供成员 Agent 作为共享上下文。 */
  description?: string;
  /** 频道群组头像，默认 orb。 */
  avatar?: ChannelAvatarId;
  /** 频道级共享指令：每次编排投研时注入到所有成员 Agent 的上下文。 */
  instructions?: string;
  createdAt: string;
  updatedAt: string;
}

/** 创建频道入参。 */
export const channelInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  agentIds: z.array(z.string().min(1).max(128)).min(2).max(10),
  description: z.string().trim().max(500).optional(),
  avatar: z.enum(["orb", "bloom", "moon", "planet", "cat"]).optional(),
  instructions: z.string().trim().max(4000).optional(),
});
export type ChannelInput = z.infer<typeof channelInputSchema>;

/** 更新频道入参（部分字段）。 */
export const channelUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  agentIds: z.array(z.string().min(1).max(128)).min(2).max(10).optional(),
  description: z.string().trim().max(500).optional(),
  avatar: z.enum(["orb", "bloom", "moon", "planet", "cat"]).optional(),
  instructions: z.string().trim().max(4000).optional(),
});
export type ChannelUpdate = z.infer<typeof channelUpdateSchema>;

/**
 * 频道群聊消息。与「编排任务结果」解耦：一条用户提问 + 每个成员各自一条对话回复，
 * 逐条落库，刷新后能回看。成员回复用各自的 threadId/人设/模型生成，文本是真对话而非子任务汇总。
 */
export interface ChannelMessage {
  id: string;
  channelId: string;
  role: "user" | "member";
  text: string;
  createdAt: string;
  /** member 消息：发言成员的 Agent id（= agent-space agents[].id）。 */
  agentId?: string;
  /** member 消息：发言时带的话术标题（如角色名），仅用于展示。 */
  title?: string;
  /** user 消息：本轮附加的文件 / 产物 id，回看时可复原上下文。 */
  attachmentIds?: string[];
  /** user 消息：本轮选定的应用连接器 slug。 */
  connectorSlugs?: string[];
}

export const channelMessageInputSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  attachmentIds: z.array(z.string().min(1)).max(30).optional(),
  connectorSlugs: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});
export type ChannelMessageInput = z.infer<typeof channelMessageInputSchema>;
