import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_SPACE_STORAGE_KEY,
  agentSpaceCanPersist,
  agentSpaceRemoteSettled,
  agentSpaceStorageKey,
  createAgentFromTemplate,
  createCustomSkill,
  createSystemAgent,
  DEFAULT_PREFERENCES,
  normalizeAgentSpace,
  onboardingPreferenceContext,
  onboardingSummary,
  parsePreferenceFocus,
  resolveRemoteAgentSpace,
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

test("local Agent caches are isolated by account without exposing the email", () => {
  const alice = agentSpaceStorageKey("Alice@example.com");
  const aliceAgain = agentSpaceStorageKey(" alice@example.com ");
  const bob = agentSpaceStorageKey("bob@example.com");
  assert.ok(alice);
  assert.equal(alice, aliceAgain);
  assert.notEqual(alice, bob);
  assert.ok(alice.startsWith(`${AGENT_SPACE_STORAGE_KEY}.`));
  assert.equal(alice.includes("alice"), false);
  assert.equal(agentSpaceStorageKey(""), null);
});

test("session-scoped Agent caches change as soon as the login session changes", () => {
  const firstSession = agentSpaceStorageKey("session-token-for-user-a");
  const secondSession = agentSpaceStorageKey("session-token-for-user-b");
  assert.ok(firstSession);
  assert.notEqual(firstSession, secondSession);
  assert.equal(firstSession.includes("session-token"), false);
});

test("an empty server workspace clears cached Agents and preferences for a new account", () => {
  const cachedFinancialAgent = createAgentFromTemplate("custom", {
    id: "cached-financial-agent",
    threadId: "cached-financial-thread",
    name: "财报 Agent",
    role: "财报拆解员",
    now: "2026-01-01T00:00:00.000Z",
  });
  const cachedState = normalizeAgentSpace(
    {
      currentAgentId: cachedFinancialAgent.id,
      agents: [cachedFinancialAgent],
      preferences: {
        name: "luffy",
        risk: "均衡一些",
        markets: ["A股"],
        areas: ["科技"],
        goal: "持续跟踪重点标的",
        horizon: "3年以上",
      },
      onboardingDone: true,
    },
    MAIN_THREAD,
  );
  assert.equal(cachedState.agents.length, 2);
  assert.equal(cachedState.preferences.name, "luffy");

  const freshState = resolveRemoteAgentSpace(null, MAIN_THREAD);
  assert.equal(freshState.agents.length, 1);
  assert.equal(freshState.agents[0]?.id, SYSTEM_AGENT_ID);
  assert.equal(freshState.currentAgentId, SYSTEM_AGENT_ID);
  assert.deepEqual(freshState.preferences, DEFAULT_PREFERENCES);
  assert.equal(freshState.onboardingDone, false);
  assert.equal(
    freshState.agents.some((agent) => agent.name === "财报 Agent"),
    false,
  );
});

test("Agent data persists only after the matching server workspace was read successfully", () => {
  const failedRead = {
    storageKey: "account-a",
    request: 2,
    writable: false,
  };
  const savedRead = { ...failedRead, writable: true };
  assert.equal(agentSpaceRemoteSettled(failedRead, "account-a", 2), true);
  assert.equal(agentSpaceCanPersist(failedRead, "account-a", 2), false);
  assert.equal(agentSpaceCanPersist(savedRead, "account-a", 2), true);
  assert.equal(agentSpaceCanPersist(savedRead, "account-b", 2), false);
  assert.equal(agentSpaceCanPersist(savedRead, "account-a", 3), false);
  assert.equal(agentSpaceRemoteSettled(undefined, "account-a", 2), false);
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

test("each Agent keeps its own model and drops unusable values", () => {
  const state = normalizeAgentSpace(
    {
      currentAgentId: "flash-agent",
      agents: [
        {
          ...createAgentFromTemplate("market", { id: "flash-agent", threadId: "flash-thread" }),
          model: "deepseek/deepseek-flash",
        },
        {
          ...createAgentFromTemplate("custom", { id: "broken-agent", threadId: "broken-thread" }),
          model: "not a model id",
        },
      ],
      onboardingDone: true,
    },
    MAIN_THREAD,
  );
  const flash = state.agents.find((agent) => agent.id === "flash-agent");
  const broken = state.agents.find((agent) => agent.id === "broken-agent");
  assert.equal(flash?.model, "deepseek/deepseek-flash");
  // 非法取值退化为「跟随默认模型」，字段本身不落盘，避免服务端 schema 拒绝。
  assert.equal(broken && "model" in broken, false);
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

test("preference focus input separates known markets from focus areas", () => {
  assert.deepEqual(parsePreferenceFocus("美股, 港股、科技，科技；黄金"), {
    markets: ["美股", "港股"],
    areas: ["科技", "黄金"],
  });
  assert.deepEqual(parsePreferenceFocus(""), { markets: [], areas: [] });
});

test("onboarding model context contains only explicitly supplied preferences", () => {
  const context = onboardingPreferenceContext({
    name: "Ada",
    risk: "均衡一些",
    markets: ["A股"],
    areas: ["科技"],
    goal: "建立投资习惯",
    horizon: "",
  });
  assert.match(context, /preferred name: Ada/);
  assert.match(context, /markets and focus areas: A股, 科技/);
  assert.match(context, /stated goal: 建立投资习惯/);
  assert.doesNotMatch(context, /time horizon/);
});

test("onboarding model context includes a supplied time horizon", () => {
  const context = onboardingPreferenceContext({
    name: "",
    risk: "还不确定",
    markets: [],
    areas: [],
    goal: "先学习，再做判断",
    horizon: "3年以上",
  });
  assert.match(context, /preferred name: Friend/);
  assert.match(context, /markets and focus areas: not restricted/);
  assert.match(context, /stated time horizon: 3年以上/);
});
