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
  detachSkillFromAgent,
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

test("pinning survives persistence and stays off the wire when unset", () => {
  const state = normalizeAgentSpace(
    {
      currentAgentId: "pinned-agent",
      agents: [
        {
          ...createAgentFromTemplate("market", { id: "pinned-agent", threadId: "pinned-thread" }),
          pinned: true,
        },
        createAgentFromTemplate("custom", { id: "plain-agent", threadId: "plain-thread" }),
      ],
      onboardingDone: true,
    },
    MAIN_THREAD,
  );
  const pinned = state.agents.find((agent) => agent.id === "pinned-agent");
  const plain = state.agents.find((agent) => agent.id === "plain-agent");
  assert.equal(pinned?.pinned, true);
  // 未置顶不写字段：归一化前后一致，也不会给服务端多送一个键。
  assert.equal(plain && "pinned" in plain, false);
  assert.deepEqual(normalizeAgentSpace(JSON.parse(JSON.stringify(state)), MAIN_THREAD), state);
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

test("installed catalog skills are per Agent, deduped and idempotent on reload", () => {
  const marketAgent = {
    ...createAgentFromTemplate("market", { id: "market-agent", threadId: "market-thread" }),
    installedSkills: ["china-dcf", "china-dcf", "3-statement-model"],
  };
  const assetAgent = createAgentFromTemplate("asset", {
    id: "asset-agent",
    threadId: "asset-thread",
  });
  const state = normalizeAgentSpace(
    {
      currentAgentId: marketAgent.id,
      agents: [marketAgent, assetAgent],
      onboardingDone: true,
    },
    MAIN_THREAD,
  );
  assert.deepEqual(state.agents.find((agent) => agent.id === "market-agent")?.installedSkills, [
    "china-dcf",
    "3-statement-model",
  ]);
  assert.deepEqual(state.agents.find((agent) => agent.id === "asset-agent")?.installedSkills, []);
  // 安装关系随 Agent 空间一起持久化，重复读取后保持完全一致。
  assert.deepEqual(normalizeAgentSpace(JSON.parse(JSON.stringify(state)), MAIN_THREAD), state);
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

const librarySkillInput = {
  name: "现金流质量检查",
  purpose: "核对利润与现金流的同步性",
  instructions: "先提取营业收入，再比较变化方向。",
  outputFormat: "结论先行。",
};

test("old state without a skill library migrates custom skills from Agents", () => {
  const older = createCustomSkill(librarySkillInput, undefined, "2026-01-01T00:00:00.000Z");
  const newer = createCustomSkill(
    librarySkillInput,
    { ...older, id: "copy" },
    "2026-02-01T00:00:00.000Z",
  );
  const other = createCustomSkill({ ...librarySkillInput, name: "另一份技能" });
  const state = normalizeAgentSpace(
    {
      agents: [
        { id: "agent-a", customSkills: [older] },
        { id: "agent-b", customSkills: [newer, other] },
      ],
    },
    MAIN_THREAD,
  );
  // 同内容副本只保留最近更新的一份，不同内容的技能也一起进入库里。
  assert.equal(state.skillLibrary.length, 2);
  assert.equal(state.skillLibrary.find((skill) => skill.name === "现金流质量检查")?.id, "copy");
  assert.ok(state.skillLibrary.some((skill) => skill.name === "另一份技能"));
});

test("a skill library survives normalization without being attached to any Agent", () => {
  const librarySkill = createCustomSkill(librarySkillInput);
  const state = normalizeAgentSpace({ agents: [], skillLibrary: [librarySkill] }, MAIN_THREAD);
  assert.deepEqual(
    state.skillLibrary.map((skill) => skill.id),
    [librarySkill.id],
  );
  // 创建技能只入库，不会自动挂到智能体。
  assert.ok(state.agents.every((agent) => agent.customSkills.length === 0));
  assert.deepEqual(normalizeAgentSpace(state, MAIN_THREAD).skillLibrary, state.skillLibrary);
});

test("an existing skill library is preserved instead of re-migrating Agent copies", () => {
  const librarySkill = createCustomSkill(librarySkillInput, undefined, "2026-03-01T00:00:00.000Z");
  const agentCopy = createCustomSkill(librarySkillInput, undefined, "2026-01-01T00:00:00.000Z");
  const state = normalizeAgentSpace(
    { agents: [{ id: "agent-a", customSkills: [agentCopy] }], skillLibrary: [librarySkill] },
    MAIN_THREAD,
  );
  assert.deepEqual(
    state.skillLibrary.map((skill) => skill.id),
    [librarySkill.id],
  );
});

test("removing a skill from an Agent only detaches that Agent's copy", () => {
  const librarySkill = createCustomSkill(librarySkillInput);
  const copy = createCustomSkill(librarySkillInput, { ...librarySkill, id: "copy" });
  const otherCopy = createCustomSkill(librarySkillInput, { ...librarySkill, id: "other-copy" });
  const state = normalizeAgentSpace(
    {
      agents: [
        { id: "agent-a", customSkills: [copy] },
        { id: "agent-b", customSkills: [otherCopy] },
      ],
      skillLibrary: [librarySkill],
    },
    MAIN_THREAD,
  );

  // 内容相同的旧副本在 normalize 时收成技能库引用，摘除时按库 id 去掉这一处引用。
  const next = detachSkillFromAgent(state, "agent-a", librarySkill.id);
  assert.deepEqual(
    next.agents.find((agent) => agent.id === "agent-a")?.skillRefs,
    [],
  );
  assert.deepEqual(next.agents.find((agent) => agent.id === "agent-a")?.customSkills, []);
  // 「我的技能」原件和另一个 Agent 的引用都还在。
  assert.deepEqual(
    next.skillLibrary.map((skill) => skill.id),
    [librarySkill.id],
  );
  assert.deepEqual(next.agents.find((agent) => agent.id === "agent-b")?.skillRefs, [
    librarySkill.id,
  ]);
});

test("detaching a skill the Agent does not hold leaves the state untouched", () => {
  const state = normalizeAgentSpace({ agents: [], skillLibrary: [] }, MAIN_THREAD);
  assert.equal(detachSkillFromAgent(state, SYSTEM_AGENT_ID, "missing-skill"), state);
  assert.equal(detachSkillFromAgent(state, "missing-agent", "missing-skill"), state);
});
