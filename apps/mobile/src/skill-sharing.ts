/**
 * 自建技能的「添加到智能体」共享逻辑。
 *
 * 「应用与能力 → 我的技能」与 Agent 详情的技能页共用同一套判定：
 * 自建技能属于某个 Agent，复制到其他 Agent 时是同内容的新副本（id 不同），
 * 因此按内容指纹判断目标 Agent 是否已经持有这份技能。
 */
import type { AgentDefinition, AgentSkill } from "./agent-space-model";

/** 技能的可复制内容：名称 / 用途 / 工作提示词 / 输出格式。 */
type SkillContent = Pick<AgentSkill, "name" | "purpose" | "instructions" | "outputFormat">;

/** 需要的最小存储能力，便于两个页面直接传入自己的 agent-space 方法。 */
type SkillStore = {
  saveSkill: (agentId: string, input: SkillContent, skillId?: string) => void;
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

/** 可作为添加目标的 Agent：排除技能来源 Agent（它本来就持有这份技能）。 */
export function skillTargetAgents(agents: AgentDefinition[], sourceAgentId: string) {
  return agents.filter((agent) => agent.id !== sourceAgentId);
}

/** 「我的技能」条目：技能本身 + 它所在的 Agent（添加 / 移除副本时需要）。 */
export type SharedSkillEntry = {
  skill: AgentSkill;
  agentId: string;
};

/**
 * 跨 Agent 汇总自建技能：技能不以 Agent 为类别，同内容的副本只保留最近更新的一条，
 * 避免同一技能被复制到多个 Agent 后在列表里重复成行。
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
 * 返回本次动作，调用方据此给出提示文案。
 */
export function toggleSkillShare(
  store: SkillStore,
  target: AgentDefinition,
  skill: SkillContent,
): "added" | "removed" {
  const existing = findSkillCopy(target, skill);
  if (existing) {
    store.deleteSkill(target.id, existing.id);
    return "removed";
  }
  store.saveSkill(target.id, {
    name: skill.name,
    purpose: skill.purpose,
    instructions: skill.instructions,
    outputFormat: skill.outputFormat,
  });
  return "added";
}
