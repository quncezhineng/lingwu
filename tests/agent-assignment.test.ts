import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAgentForAssignment } from "../apps/server/src/agent-space.ts";
import { createStore } from "../apps/server/src/db.ts";

/** 一个最小可用的 agent-space 落盘结构（字段对齐 PersistedAgentSpace 的 agents 数组）。 */
function space(
  agents: Array<{
    id: string;
    threadId: string;
    template: string;
    role: string;
    persona: string;
    instructions?: string;
  }>,
) {
  return {
    id: "space",
    version: 1,
    currentAgentId: agents[0]?.id ?? "",
    agents: agents.map((a) => ({
      ...a,
      name: a.role,
      avatar: "orb",
      system: false,
      threadExists: true,
      createdAt: new Date().toISOString(),
      skills: [],
      installedSkills: [],
      customSkills: [],
    })),
    preferences: { name: "", risk: "", markets: [], areas: [], goal: "", horizon: "" },
    onboardingDone: true,
    onboardingStep: 4,
  };
}

test("resolveAgentForAssignment matches by template, id, and threadId", async () => {
  const db = await createStore();
  try {
    await db.put("owner", "agent-settings", {
      ...space([
        {
          id: "researcher-1",
          threadId: "thread-researcher",
          template: "research",
          role: "研究员",
          persona: "严谨的数据研究者",
          instructions: "先核数据再下结论",
        },
        {
          id: "macro-1",
          threadId: "thread-macro",
          template: "macro",
          role: "宏观分析师",
          persona: "关注宏观周期",
        },
      ]),
    });

    // 按模板匹配（编排者产出泛化模板名时回退）。
    const byTemplate = await resolveAgentForAssignment(db, "owner", "research");
    assert.equal(byTemplate?.threadId, "thread-researcher");
    assert.equal(byTemplate?.role, "研究员");
    assert.equal(byTemplate?.persona, "严谨的数据研究者");
    assert.equal(byTemplate?.instructions, "先核数据再下结论");

    // 按具体 id 精确匹配（频道成员精确分配）。
    const byId = await resolveAgentForAssignment(db, "owner", "macro-1");
    assert.equal(byId?.threadId, "thread-macro");
    assert.equal(byId?.role, "宏观分析师");

    // 按 threadId 匹配。
    const byThreadId = await resolveAgentForAssignment(db, "owner", "thread-researcher");
    assert.equal("id" in (byThreadId ?? {}), false);
    assert.equal(byThreadId?.threadId, "thread-researcher");

    // 未命中返回 undefined。
    assert.equal(await resolveAgentForAssignment(db, "owner", "does-not-exist"), undefined);
    assert.equal(await resolveAgentForAssignment(db, "owner", undefined), undefined);
    assert.equal(await resolveAgentForAssignment(db, "owner", ""), undefined);
  } finally {
    await db.close();
  }
});

test("resolveAgentForAssignment returns undefined without a saved space", async () => {
  const db = await createStore();
  try {
    assert.equal(await resolveAgentForAssignment(db, "owner", "research"), undefined);
  } finally {
    await db.close();
  }
});
