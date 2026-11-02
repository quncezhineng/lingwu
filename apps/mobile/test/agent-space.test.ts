import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_SPACE_STORAGE_KEY,
  createAgentFromTemplate,
  createCustomSkill,
  createSystemAgent,
  normalizeAgentSpace,
  onboardingSummary,
  SYSTEM_AGENT_ID,
} from "../src/agent-space-model.ts";

const MAIN_THREAD = "main-thread";

test("an empty Agent space gets exactly one system default Agent", () => {
  const state = normalizeAgentSpace(undefined, MAIN_THREAD);
  assert.equal(state.agents.length, 1);
  assert.equal(state.currentAgentId, SYSTEM_AGENT_ID);
  assert.equal(state.agents[0]?.system, true);
  assert.equal(state.agents[0]?.threadId, MAIN_THREAD);
  assert.equal(AGENT_SPACE_STORAGE_KEY, "lingwu.agent.space.v1");
});

test("a forged system flag cannot create a second system Agent", () => {
  const forged = {
    ...createAgentFromTemplate("custom", {
      id: "forged-agent",
      threadId: "forged-thread",
    }),
    system: true,
  };
  const state = normalizeAgentSpace(
    {
      currentAgentId: forged.id,
      agents: [forged],
      onboardingDone: true,
    },
    MAIN_THREAD,
  );
  assert.equal(state.agents.filter((agent) => agent.system).length, 1);
  assert.equal(state.agents.find((agent) => agent.id === forged.id)?.system, false);
  assert.equal(state.agents.find((agent) => agent.id === SYSTEM_AGENT_ID)?.threadId, MAIN_THREAD);
});

test("normalization is idempotent across repeated persisted loads", () => {
  const first = normalizeAgentSpace(
    {
      currentAgentId: "research-agent",
      agents: [
        createAgentFromTemplate("market", {
          id: "research-agent",
          threadId: "research-thread",
          now: "2026-01-01T00:00:00.000Z",
        }),
      ],
      preferences: { markets: ["A股", "A股"], areas: ["科技"] },
      onboardingDone: true,
      onboardingStep: 99,
    },
    MAIN_THREAD,
  );
  const second = normalizeAgentSpace(JSON.parse(JSON.stringify(first)), MAIN_THREAD);
  assert.deepEqual(second, first);
  assert.equal(second.onboardingStep, 4);
  assert.deepEqual(second.preferences.markets, ["A股"]);
});

test("new Agents own an independent stable thread and cannot replace the system thread", () => {
  const agent = createAgentFromTemplate("asset", {
    id: "asset-agent",
    threadId: "asset-thread",
    now: "2026-01-01T00:00:00.000Z",
  });
  assert.notEqual(agent.threadId, MAIN_THREAD);
  assert.equal(agent.system, false);
  assert.equal(agent.threadExists, false);

  const state = normalizeAgentSpace(
    { currentAgentId: agent.id, agents: [createSystemAgent("old-main"), agent] },
    MAIN_THREAD,
  );
  assert.equal(state.agents.find((item) => item.id === SYSTEM_AGENT_ID)?.threadId, MAIN_THREAD);
  assert.equal(state.agents.find((item) => item.id === agent.id)?.threadId, "asset-thread");
});

test("a custom Agent cannot reuse the system or another Agent thread", () => {
  const systemCollision = createAgentFromTemplate("custom", {
    id: "system-collision",
    threadId: MAIN_THREAD,
    now: "2026-01-01T00:00:00.000Z",
  });
  const duplicate = createAgentFromTemplate("custom", {
    id: "duplicate-thread",
    threadId: "shared-thread",
    now: "2026-01-01T00:00:00.000Z",
  });
  const first = createAgentFromTemplate("market", {
    id: "first-thread",
    threadId: "shared-thread",
    now: "2026-01-01T00:00:00.000Z",
  });
  const state = normalizeAgentSpace(
    { agents: [systemCollision, duplicate, first], onboardingDone: true },
    MAIN_THREAD,
  );
  const threadIds = state.agents.map((agent) => agent.threadId);
  assert.equal(new Set(threadIds).size, threadIds.length);
  assert.notEqual(
    state.agents.find((agent) => agent.id === "system-collision")?.threadId,
    MAIN_THREAD,
  );
  assert.notEqual(
    state.agents.find((agent) => agent.id === "duplicate-thread")?.threadId,
    state.agents.find((agent) => agent.id === "first-thread")?.threadId,
  );
});

test("custom skills version forward while preserving identity and enabled state", () => {
  const input = {
    name: "现金流检查",
    purpose: "核对利润与现金流",
    instructions: "读取财报并比较利润与经营现金流。",
    outputFormat: "结论、数据、疑点",
  };
  const first = createCustomSkill(input, undefined, "2026-01-01T00:00:00.000Z");
  const second = createCustomSkill(
    { ...input, instructions: "更新后再比较应收账款。" },
    { ...first, enabled: false },
    "2026-01-02T00:00:00.000Z",
  );
  assert.equal(second.id, first.id);
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.updatedAt, "2026-01-02T00:00:00.000Z");
  assert.equal(second.version, 2);
  assert.equal(second.enabled, false);
});

test("onboarding summary keeps global preferences readable in either locale", () => {
  assert.deepEqual(
    onboardingSummary({
      name: "",
      risk: "",
      markets: [],
      areas: [],
      goal: "",
      horizon: "",
    }),
    {
      name: "朋友",
      risk: "还不确定",
      focus: "不限市场",
      goal: "先学习，再做判断",
      horizon: "",
    },
  );
  assert.equal(
    onboardingSummary({
      name: "Ada",
      risk: "Balanced",
      markets: ["A股"],
      areas: ["科技"],
      goal: "Build a habit",
      horizon: "3 years",
    }).focus,
    "A股、科技",
  );
});
