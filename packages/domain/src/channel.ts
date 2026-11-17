import { z } from "zod";

/**
 * 多 Agent 群聊频道（M2）。
 *
 * 一个频道 = 一组选定的 Agent 成员 + 一个共享对话空间。用户在频道里发一条消息，
 * 每个成员 Agent 用自己的人设/模板独立回复，用户在同一界面看到多专家视角。
 * 频道本身只存元数据（成员、名称），消息承载复用 CopilotKit thread（每个 Agent
 * 成员各自一个 thread，频道聚合展示）。
 */

/**
 * 频道群组头像：多个图像交叠的「群组感」形象（频道 = 多位成员 Agent 的组合），
 * 与 Agent 的单符号头像（orb/bloom/moon/planet/cat）刻意区分。
 * 注意：旧数据可能存有 Agent 时代的 avatar 值，读取端需做兜底映射。
 */
export type ChannelAvatarId =
  | "stack-circles"
  | "stack-cards"
  | "stack-dots"
  | "stack-rings"
  | "stack-gems";
export const CHANNEL_AVATARS: readonly ChannelAvatarId[] = [
  "stack-circles",
  "stack-cards",
  "stack-dots",
  "stack-rings",
  "stack-gems",
];
/** 频道新头像的默认值（历史数据兜底也落到它）。 */
export const DEFAULT_CHANNEL_AVATAR: ChannelAvatarId = "stack-circles";

/** 校验某值是否为合法的频道头像 id（历史 Agent 时代旧值返回 false）。 */
export function isChannelAvatarId(value: unknown): value is ChannelAvatarId {
  return typeof value === "string" && (CHANNEL_AVATARS as readonly string[]).includes(value);
}

/** 频道头像读取兜底：缺失 / 非法 / 历史旧值统一落到默认叠加头像。 */
export function normalizeChannelAvatar(
  value: ChannelAvatarId | string | null | undefined,
): ChannelAvatarId {
  return isChannelAvatarId(value) ? value : DEFAULT_CHANNEL_AVATAR;
}

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
  /**
   * 频道自己的技能（内置目录 id）：与成员 Agent 各自的技能互相独立，
   * 频道里添加后对全体成员生效。
   */
  installedSkills?: string[];
  /** 频道自己的自建技能引用（账户技能库 id），同样成员共享。 */
  skillRefs?: string[];
  /** 是否置顶：只影响左侧栏展示顺序，置顶的频道排在前面。 */
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 创建频道入参。 */
export const channelInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  agentIds: z.array(z.string().min(1).max(128)).min(2).max(10),
  description: z.string().trim().max(500).optional(),
  avatar: z
    .enum(["stack-circles", "stack-cards", "stack-dots", "stack-rings", "stack-gems"])
    .optional(),
  instructions: z.string().trim().max(4000).optional(),
  installedSkills: z.array(z.string().min(1).max(128)).max(200).optional(),
  skillRefs: z.array(z.string().min(1).max(128)).max(200).optional(),
  pinned: z.boolean().optional(),
});
export type ChannelInput = z.infer<typeof channelInputSchema>;

/** 更新频道入参（部分字段）。 */
export const channelUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  agentIds: z.array(z.string().min(1).max(128)).min(2).max(10).optional(),
  description: z.string().trim().max(500).optional(),
  avatar: z
    .enum(["stack-circles", "stack-cards", "stack-dots", "stack-rings", "stack-gems"])
    .optional(),
  instructions: z.string().trim().max(4000).optional(),
  installedSkills: z.array(z.string().min(1).max(128)).max(200).optional(),
  skillRefs: z.array(z.string().min(1).max(128)).max(200).optional(),
  pinned: z.boolean().optional(),
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
  /** user 消息：本轮选定的频道技能 id（频道共享，成员 use_skill 可读到）。 */
  skillIds?: string[];
}

export const channelMessageInputSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  attachmentIds: z.array(z.string().min(1)).max(30).optional(),
  connectorSlugs: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  skillIds: z.array(z.string().trim().min(1).max(128)).max(60).optional(),
});
export type ChannelMessageInput = z.infer<typeof channelMessageInputSchema>;
