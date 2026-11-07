import assert from "node:assert/strict";
import test from "node:test";
import type { AgentDefinition, AgentSkill } from "../src/agent-space-model.ts";
import {
  collectSharedSkills,
  deleteSkillEverywhere,
  findSkillCopy,
  skillHolderAgentIds,
  skillLockedAgentIds,
  toggleSkillShare,
} from "../src/skill-sharing.ts";

function skill(overrides: Partial<AgentSkill> = {}): AgentSkill {
  return {
    id: "skill-a",
    name: "现金流质量检查",
    purpose: "核对利润与现金流的同步性",
    instructions: "先提取营业收入，再比较变化方向。",
    outputFormat: "结论先行。",
    enabled: true,
    version: 1,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

/** 只用到 id / name / customSkills，其余字段与本次判定无关。 */
function agent(id: string, customSkills: AgentSkill[] = []): AgentDefinition {
  return { id, name: id, customSkills } as AgentDefinition;
}

test("副本按内容判定：id 不同但内容相同仍视为已持有", () => {
  const copy = skill({ id: "skill-b" });
  assert.equal(findSkillCopy(agent("agent-1", [copy]), skill())?.id, "skill-b");
});

test("内容不同则不视为同一份技能", () => {
  const other = skill({ id: "skill-c", instructions: "换一套流程。" });
  assert.equal(findSkillCopy(agent("agent-1", [other]), skill()), undefined);
  assert.equal(findSkillCopy(agent("agent-1"), skill()), undefined);
});

test("已添加列表包含创建该技能的来源 Agent", () => {
  const source = agent("source", [skill()]);
  const copy = agent("copy", [skill({ id: "skill-copy" })]);
  const other = agent("other", [skill({ id: "skill-other", instructions: "另一套流程。" })]);
  assert.deepEqual(skillHolderAgentIds([source, copy, other], skill()), ["source", "copy"]);
});

test("未持有该技能的智能体不计入已添加", () => {
  assert.deepEqual(skillHolderAgentIds([agent("source"), agent("other")], skill()), []);
});

test("来源 Agent 与最后一份副本只读", () => {
  const source = agent("source", [skill()]);
  const other = agent("other");
  assert.deepEqual(skillLockedAgentIds([source, other], skill(), "source"), ["source"]);
  // 即便不传来源，唯一持有者也不能被移除，否则技能会彻底消失。
  assert.deepEqual(skillLockedAgentIds([source, other], skill()), ["source"]);
  assert.deepEqual(skillLockedAgentIds([other], skill(), "other"), []);
});

test("多副本时只锁定来源 Agent", () => {
  const source = agent("source", [skill()]);
  const copy = agent("copy", [skill({ id: "skill-copy" })]);
  const other = agent("other");
  assert.deepEqual(skillLockedAgentIds([source, copy, other], skill(), "source"), ["source"]);
});

test("跨 Agent 汇总同内容技能只保留最近更新的一条", () => {
  const older = skill({ id: "skill-a", updatedAt: "2026-11-01T00:00:00.000Z" });
  const newer = skill({ id: "skill-b", updatedAt: "2026-11-05T00:00:00.000Z" });
  const distinct = skill({
    id: "skill-c",
    name: "估值复核",
    purpose: "复核 DCF 关键假设",
    updatedAt: "2026-11-02T00:00:00.000Z",
  });

  const entries = collectSharedSkills([
    agent("agent-1", [older]),
    agent("agent-2", [newer, distinct]),
  ]);

  assert.deepEqual(
    entries.map((entry) => [entry.skill.id, entry.agentId]),
    [
      ["skill-b", "agent-2"],
      ["skill-c", "agent-2"],
    ],
  );
});

test("toggleSkillShare 无副本时复制，有副本时删除", () => {
  const calls: string[] = [];
  const store = {
    saveSkill: (agentId: string, input: { name: string }) => {
      calls.push(`save:${agentId}:${input.name}`);
    },
    deleteSkill: (agentId: string, skillId: string) => {
      calls.push(`delete:${agentId}:${skillId}`);
    },
  };

  assert.equal(toggleSkillShare(store, agent("other"), skill()), "added");
  assert.deepEqual(calls, ["save:other:现金流质量检查"]);

  calls.length = 0;
  const holder = agent("other", [skill({ id: "skill-copy" })]);
  assert.equal(toggleSkillShare(store, holder, skill()), "removed");
  assert.deepEqual(calls, ["delete:other:skill-copy"]);
});

test("带 guard 时只读副本拒绝移除，其它副本不受影响", () => {
  const calls: string[] = [];
  const store = {
    saveSkill: (agentId: string, input: { name: string }) => {
      calls.push(`save:${agentId}:${input.name}`);
    },
    deleteSkill: (agentId: string, skillId: string) => {
      calls.push(`delete:${agentId}:${skillId}`);
    },
  };
  const source = agent("source", [skill()]);
  const copy = agent("copy", [skill({ id: "skill-copy" })]);
  const guard = { agents: [source, copy], sourceAgentId: "source" };

  assert.equal(toggleSkillShare(store, source, skill(), guard), "blocked");
  assert.deepEqual(calls, []);

  assert.equal(toggleSkillShare(store, copy, skill(), guard), "removed");
  assert.deepEqual(calls, ["delete:copy:skill-copy"]);

  // 只剩一份副本时，即使没有来源参数也拒绝移除。
  const only = agent("only", [skill()]);
  assert.equal(toggleSkillShare(store, only, skill(), { agents: [only] }), "blocked");
  assert.deepEqual(calls, ["delete:copy:skill-copy"]);
});

test("删除我的技能时清掉所有 Agent 上的同内容副本", () => {
  const calls: string[] = [];
  const store = {
    deleteSkill: (agentId: string, skillId: string) => {
      calls.push(`delete:${agentId}:${skillId}`);
    },
  };
  const source = agent("source", [skill()]);
  const copy = agent("copy", [skill({ id: "skill-copy" })]);
  const other = agent("other", [skill({ id: "skill-other", instructions: "另一套流程。" })]);

  assert.equal(deleteSkillEverywhere(store, [source, copy, other], skill()), 2);
  assert.deepEqual(calls, ["delete:source:skill-a", "delete:copy:skill-copy"]);
});

test("删除我的技能不会误删内容不同的技能", () => {
  const calls: string[] = [];
  const store = {
    deleteSkill: (agentId: string, skillId: string) => {
      calls.push(`delete:${agentId}:${skillId}`);
    },
  };
  const otherInstructions = skill({ instructions: "换一套流程。" });

  assert.equal(deleteSkillEverywhere(store, [agent("source", [skill()])], otherInstructions), 0);
  assert.deepEqual(calls, []);
});
