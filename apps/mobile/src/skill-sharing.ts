/**
 * 自建技能的「添加到智能体」共享逻辑。
 *
 * 「我的技能」现在是账户级技能库：创建技能只入库，不自动挂到任何 Agent；
 * 复制到目标 Agent 时是同内容的新副本（id 不同），因此按内容指纹判断
 * 目标 Agent 是否已经持有这份技能。
 *
 * `guard` / `skillLockedAgentIds` 是库化之前「来源 Agent / 最后一份副本只读」的兼容逻辑：
 * 库里始终保留原件，当前 UI 不再传入，保留供旧数据与单测使用。
 */
import type { AgentDefinition, AgentSkill } from "./agent-space-model";

/** 技能的可复制内容：名称 / 用途 / 工作提示词 / 输出格式。 */
type SkillContent = Pick<AgentSkill, "name" | "purpose" | "instructions" | "outputFormat">;

/** 需要的最小存储能力，便于两个页面直接传入自己的 agent-space 方法。 */
type SkillStore = {
  setSkillRef: (agentId: string, skillId: string, linked: boolean) => void;
  deleteSkill: (agentId: string, skillId: string) => void;
};

/** 内容指纹：四项全等即视为同一份技能（副本 id 不同，不能按 id 判重）。 */
export function skillFingerprint(skill: SkillContent) {
  return [skill.name, skill.purpose, skill.instructions, skill.outputFormat].join("\u0000");
}

/** 目标 Agent 里已有的同名同内容技能副本，没有则返回 undefined。 */
export function findSkillCopy(
  target: AgentDefinition,
  skill: SkillContent,
): AgentSkill | undefined {
  const fingerprint = skillFingerprint(skill);
  return target.customSkills.find((candidate) => skillFingerprint(candidate) === fingerprint);
}

/**
 * 已持有该技能的 Agent id（按内容指纹判定，含创建该技能的来源 Agent）。
 * 「添加到智能体」面板据此标记「已添加」与底部计数，面板本身展示全部 Agent。
 */
function holdsSkill(agent: AgentDefinition, skill: AgentSkill) {
  return (agent.skillRefs ?? []).includes(skill.id) || Boolean(findSkillCopy(agent, skill));
}

export function skillHolderAgentIds(agents: AgentDefinition[], skill: AgentSkill): string[] {
  return agents.filter((agent) => holdsSkill(agent, skill)).map((agent) => agent.id);
}

/**
 * 「添加到智能体」里不可移除的 Agent id（只锁定已持有的行）：
 * - 来源 Agent 的那份副本只读，始终保留；
 * - 只剩一个持有者时禁止移除最后一份，避免技能彻底消失。
 *
 * 「来源」由调用方给出：「我的技能」用汇总条目的 agentId，Agent 详情用当前 Agent。
 * 数据模型没有记录技能最初创建于哪个 Agent，因此锁定的是详情页上下文里的那份原始副本。
 *
 * 库化后的兼容逻辑：技能库始终保留原件，当前 UI 不再传 `guard`，此函数与相关文案
 * 只服务于旧数据与单测，不要再在账户级技能库的新界面里启用。
 */
export function skillLockedAgentIds(
  agents: AgentDefinition[],
  skill: AgentSkill,
  sourceAgentId?: string,
): string[] {
  const holders = skillHolderAgentIds(agents, skill);
  const locked = new Set<string>();
  if (sourceAgentId && holders.includes(sourceAgentId)) locked.add(sourceAgentId);
  if (holders.length === 1) locked.add(holders[0]);
  return holders.filter((id) => locked.has(id));
}

/** 库化前的「我的技能」条目：技能本身 + 来源 Agent；现仅供旧数据与单测使用。 */
export type SharedSkillEntry = {
  skill: AgentSkill;
  agentId: string;
};

/**
 * 库化前跨 Agent 汇总自建技能：同内容的副本只保留最近更新的一条，避免列表重复成行。
 * 现在「我的技能」直接读账户级 `AgentSpaceState.skillLibrary`，此函数仅保留给旧数据与单测。
 */
export function collectSharedSkills(agents: AgentDefinition[]): SharedSkillEntry[] {
  const entries: SharedSkillEntry[] = [];
  const indexByContent = new Map<string, number>();
  for (const agent of agents) {
    for (const skill of agent.customSkills) {
      const fingerprint = skillFingerprint(skill);
      const seen = indexByContent.get(fingerprint);
      if (seen === undefined) {
        indexByContent.set(fingerprint, entries.length);
        entries.push({ skill, agentId: agent.id });
      } else if (skill.updatedAt > entries[seen].skill.updatedAt) {
        entries[seen] = { skill, agentId: agent.id };
      }
    }
  }
  return entries;
}

/**
 * 在目标 Agent 上切换该技能的持有状态：没有副本就复制一份，已有副本就删掉。
 *
 * 传入 `guard` 时启用只读保护：命中 `skillLockedAgentIds` 的副本不删除，返回 `blocked`，
 * 防止来源 Agent 或最后一份副本被移除。返回本次动作，调用方据此给出提示文案。
 * 账户级技能库下无需传 `guard`：原件始终在库里，任何一个 Agent 副本都可以自由移除。
 */
export function toggleSkillShare(
  store: SkillStore,
  target: AgentDefinition,
  skill: AgentSkill,
  guard?: { agents: AgentDefinition[]; sourceAgentId?: string },
): "added" | "removed" | "blocked" {
  const existing = findSkillCopy(target, skill);
  if (holdsSkill(target, skill)) {
    if (
      guard &&
      skillLockedAgentIds(guard.agents, skill, guard.sourceAgentId).includes(target.id)
    ) {
      return "blocked";
    }
    store.setSkillRef(target.id, skill.id, false);
    if (existing) store.deleteSkill(target.id, existing.id);
    return "removed";
  }
  store.setSkillRef(target.id, skill.id, true);
  return "added";
}

/**
 * 删除一份自建技能及其在所有 Agent 下的副本。
 *
 * 「我的技能」按内容指纹去重汇总，只删列表里那一条会让其它 Agent 的副本
 * 立刻重新出现在列表里，因此删除操作按内容清掉全部副本。
 * 返回实际删除的副本数量。
 */
export function deleteSkillEverywhere(
  store: SkillStore,
  agents: AgentDefinition[],
  skill: AgentSkill,
): number {
  const fingerprint = skillFingerprint(skill);
  let removed = 0;
  for (const agent of agents) {
    const copies = agent.customSkills.filter((copy) => skillFingerprint(copy) === fingerprint);
    const linked = (agent.skillRefs ?? []).includes(skill.id);
    if (!linked && copies.length === 0) continue;
    if (linked) store.setSkillRef(agent.id, skill.id, false);
    for (const copy of copies) store.deleteSkill(agent.id, copy.id);
    removed += 1;
  }
  return removed;
}
