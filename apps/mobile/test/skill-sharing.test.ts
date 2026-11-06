import assert from "node:assert/strict";
import test from "node:test";
import type { AgentDefinition, AgentSkill } from "../src/agent-space-model.ts";
import {
  collectSharedSkills,
  findSkillCopy,
  skillTargetAgents,
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

test("添加目标排除技能来源 Agent", () => {
  const targets = skillTargetAgents([agent("source"), agent("other")], "source");
  assert.deepEqual(
    targets.map((item) => item.id),
    ["other"],
  );
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
