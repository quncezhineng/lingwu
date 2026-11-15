import { z } from "zod";

/**
 * 多 Agent 群聊频道（M2）。
 *
 * 一个频道 = 一组选定的 Agent 成员 + 一个共享对话空间。用户在频道里发一条消息，
 * 每个成员 Agent 用自己的人设/模板独立回复，用户在同一界面看到多专家视角。
 * 频道本身只存元数据（成员、名称），消息承载复用 CopilotKit thread（每个 Agent
 * 成员各自一个 thread，频道聚合展示）。
 */

export interface Channel {
  id: string;
  name: string;
  /** 频道成员 Agent 的 id（= agent-space 的 agents[].id）。 */
  agentIds: string[];
  /** 频道创建时可选的目标说明，供成员 Agent 作为共享上下文。 */
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/** 创建频道入参。 */
export const channelInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  agentIds: z.array(z.string().min(1).max(128)).min(2).max(10),
  description: z.string().trim().max(500).optional(),
});
export type ChannelInput = z.infer<typeof channelInputSchema>;

/** 更新频道入参（部分字段）。 */
export const channelUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  agentIds: z.array(z.string().min(1).max(128)).min(2).max(10).optional(),
  description: z.string().trim().max(500).optional(),
});
export type ChannelUpdate = z.infer<typeof channelUpdateSchema>;
