import type { AgentTask } from "../../../../packages/domain/src/agent.ts";
import { agentIdForThread } from "../agent-space.ts";

/**
 * 账户级记忆的归属键。
 *
 * 写入侧的回退约定：没有 agentId 的记忆（旧数据、全局记忆页新增、对话里未映射到
 * Agent 的线程）统一落到 "default"。它语义上是「账户级共享记忆」，而不是某个 Agent 私有。
 */
export const SHARED_MEMORY_KEY = "default";

/** 记忆归属键：缺省 / 空白统一回 "default"，与写入、召回、界面筛选保持同一口径。 */
export function memoryAgentKey(memory: { agentId?: string | null }): string {
  return (memory.agentId ?? "").trim() || SHARED_MEMORY_KEY;
}

/**
 * 一次执行可读的记忆作用域。
 *   - agentId：执行该任务的 Agent（= agentSpaceSchema.agents[].id）
 *   - channelId：任务所属频道（频道投研时作为成员共享记忆）
 */
export interface MemoryScope {
  agentId?: string;
  channelId?: string;
}

/**
 * 作用域 → 可读的归属键集合。
 *
 * 三档语义：
 *   1. 账户级（"default"）：始终可读 —— 全局记忆页写入的偏好对任何 Agent 都生效。
 *   2. Agent 私有：只有该 Agent 执行的任务可读，跨 Agent 不串味。
 *   3. 频道共享：只有该频道的任务可读，成员 Agent 共享频道上下文，别的频道读不到。
 */
export function memoryScopeKeys(scope: MemoryScope): string[] {
  const keys = new Set<string>([SHARED_MEMORY_KEY]);
  const agentId = scope.agentId?.trim();
  const channelId = scope.channelId?.trim();
  if (agentId) keys.add(agentId);
  if (channelId) keys.add(channelId);
  return [...keys];
}

/** 按作用域过滤记忆（纯函数，便于测试）。 */
export function filterMemoriesForScope<T extends { agentId?: string | null }>(
  memories: readonly T[],
  scope: MemoryScope,
): T[] {
  const keys = new Set(memoryScopeKeys(scope));
  return memories.filter((memory) => keys.has(memoryAgentKey(memory)));
}

/**
 * 从任务解析记忆作用域。
 *
 * 子任务由 `createSubtask` 把父任务的 `input.channelId` 下传，因此成员子任务也能拿到
 * 频道共享记忆；成员自身的私有记忆则由其 threadId 反查出的 agentId 覆盖。
 */
export async function memoryScopeForTask(
  db: { get: <T>(owner: string, kind: string, id: string) => Promise<T | null> },
  owner: string,
  task: Pick<AgentTask, "threadId" | "input">,
): Promise<MemoryScope> {
  const channelId = typeof task.input?.channelId === "string" ? task.input.channelId.trim() : "";
  const agentId = (await agentIdForThread(db, owner, task.threadId))?.trim();
  return {
    ...(agentId ? { agentId } : {}),
    ...(channelId ? { channelId } : {}),
  };
}
