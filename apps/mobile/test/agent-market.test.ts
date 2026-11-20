/**
 * 智能体市场数据层单测。
 *
 * 覆盖：内置智能体的必填字段与 id 唯一性、技能引用有效性，
 * 以及「详情弹窗 / 导入」会直接写入 Agent 的两个服务端上限
 * （instructions ≤ 4000、persona ≤ 1000）——超限会让整次 PUT 被 422 拒绝。
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILTIN_MARKET_AGENTS,
  builtinMarketEntries,
  type MarketAgentCategory,
  type RemoteMarketAgent,
  remoteMarketEntries,
  userMarketEntries,
} from "../src/agent-market.ts";
import { BUILTIN_AGENT_INSTRUCTIONS } from "../src/agent-market-instructions.ts";
import type { AgentDefinition, AgentSkill } from "../src/agent-space-model.ts";
import { skillCatalog } from "../src/skill-catalog.ts";

/** 服务端 `agentSchema` 的字段上限，超限会让 PUT 被 422 拒绝。 */
const PERSONA_MAX = 1000;
const INSTRUCTIONS_MAX = 4000;

const skillIds = new Set(skillCatalog.map((skill) => skill.id));
const categories = new Set<MarketAgentCategory>([
  "market-analysis",
  "valuation-modeling",
  "deals-ib",
  "ops-compliance",
  "research-debate",
  "decision",
  "partners",
]);

test("内置智能体：id 唯一且必填展示字段齐全", () => {
  assert.ok(BUILTIN_MARKET_AGENTS.length > 0);
  assert.equal(
    new Set(BUILTIN_MARKET_AGENTS.map((item) => item.id)).size,
    BUILTIN_MARKET_AGENTS.length,
    "内置智能体 id 存在重复",
  );
  for (const item of BUILTIN_MARKET_AGENTS) {
    assert.ok(item.id.trim(), "缺少 id");
    // 服务端 name ≤ 20、role ≤ 30，超限同样会让导入后的首次保存失败。
    assert.ok(item.name.trim() && item.name.length <= 20, `${item.id} 的 name 缺失或超过 20 字`);
    assert.ok(item.role.trim() && item.role.length <= 30, `${item.id} 的 role 缺失或超过 30 字`);
    assert.ok(item.detail.trim(), `${item.id} 缺少 detail（卡片简介）`);
    assert.ok(item.persona.trim(), `${item.id} 缺少 persona（人设）`);
    assert.ok(item.instructions.trim(), `${item.id} 缺少 instructions（系统指令）`);
    assert.ok(categories.has(item.category), `${item.id} 的分类非法：${item.category}`);
    assert.ok(item.tags.length > 0, `${item.id} 缺少能力标签`);
    assert.ok(item.skills.length > 0, `${item.id} 没有预置技能`);
  }
});

test("内置智能体：persona 与 instructions 不超过服务端上限", () => {
  for (const item of BUILTIN_MARKET_AGENTS) {
    assert.ok(
      item.persona.length <= PERSONA_MAX,
      `${item.id} 的 persona 超限（${item.persona.length} > ${PERSONA_MAX}）`,
    );
    assert.ok(
      item.instructions.length <= INSTRUCTIONS_MAX,
      `${item.id} 的 instructions 超限（${item.instructions.length} > ${INSTRUCTIONS_MAX}）`,
    );
  }
});

test("内置智能体：预置技能全部命中技能目录", () => {
  for (const item of BUILTIN_MARKET_AGENTS) {
    for (const skillId of item.skills) {
      assert.ok(skillIds.has(skillId), `${item.id} 引用了不存在的技能：${skillId}`);
    }
  }
});

test("内置智能体：每条指令都在 BUILTIN_AGENT_INSTRUCTIONS 里可查", () => {
  for (const item of BUILTIN_MARKET_AGENTS) {
    assert.ok(
      BUILTIN_AGENT_INSTRUCTIONS[item.id],
      `${item.id} 在 BUILTIN_AGENT_INSTRUCTIONS 中没有对应条目`,
    );
  }
  // 反向：指令表里不应残留没有对应智能体的孤儿条目。
  const agentIds = new Set(BUILTIN_MARKET_AGENTS.map((item) => item.id));
  for (const key of Object.keys(BUILTIN_AGENT_INSTRUCTIONS)) {
    assert.ok(agentIds.has(key), `BUILTIN_AGENT_INSTRUCTIONS 存在孤儿条目：${key}`);
  }
});

test("builtinMarketEntries：统一成卡片形态且字段透传", () => {
  const entries = builtinMarketEntries("@灵悟 · 官方");
  assert.equal(entries.length, BUILTIN_MARKET_AGENTS.length);
  for (const [index, entry] of entries.entries()) {
    const source = BUILTIN_MARKET_AGENTS[index];
    assert.equal(entry.builtin, true);
    assert.equal(entry.builtinId, source.id);
    assert.equal(entry.key, `builtin:${source.id}`);
    assert.equal(entry.name, source.name);
    assert.equal(entry.role, source.role);
    assert.equal(entry.persona, source.persona);
    assert.equal(entry.detail, source.detail);
    assert.equal(entry.category, source.category);
    assert.deepEqual(entry.skills, [...source.skills]);
    // 内置条目的技能本身就是技能目录 id，导入时作为 installedSkills 预置。
    assert.deepEqual(entry.installedSkills, [...source.skills]);
    assert.deepEqual(entry.customSkills, []);
    assert.equal(entry.instructions, source.instructions);
    assert.equal(entry.source, "@灵悟 · 官方");
  }
});

/** 造一个最小的用户 Agent，只填 `userMarketEntries` 关心的字段。 */
function fakeAgent(patch: Partial<AgentDefinition> & { id: string }): AgentDefinition {
  return {
    threadId: `thread-${patch.id}`,
    template: "custom",
    name: "我的智能体",
    role: "自建",
    persona: "一段人设",
    avatar: "orb",
    tone: "formal",
    communication: "short",
    instructions: "",
    system: false,
    threadExists: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    skills: ["quote"],
    installedSkills: [],
    skillRefs: [],
    customSkills: [],
    ...patch,
  };
}

/** 造一个最小的自建技能（AgentSkill 的必填字段）。 */
function fakeSkill(patch: Partial<AgentSkill> & { id: string }): AgentSkill {
  return {
    name: patch.name ?? "自建技能",
    purpose: patch.purpose ?? "一段用途",
    instructions: patch.instructions ?? "一段指令",
    outputFormat: patch.outputFormat ?? "一段输出格式",
    enabled: patch.enabled ?? true,
    version: patch.version ?? 1,
    createdAt: patch.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: patch.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

test("userMarketEntries：只收非系统且已公开的智能体", () => {
  const agents = [
    fakeAgent({ id: "public", public: true }),
    fakeAgent({ id: "private" }),
    fakeAgent({ id: "system", system: true, public: true }),
  ];
  const entries = userMarketEntries(agents, "@我");
  assert.deepEqual(
    entries.map((entry) => entry.agent?.id),
    ["public"],
  );
  assert.equal(entries[0].builtin, false);
  assert.equal(entries[0].key, "user:public");
});

test("userMarketEntries：公开后「核心职责 / 人设描述」原样映射到广场字段", () => {
  const agent = fakeAgent({
    id: "published",
    public: true,
    // 带前后空白与换行缩进：验证映射是逐字透传，不做 trim 或折行处理。
    role: "  核心职责：投研分析  ",
    persona: "人设描述第一行\n第二行\n  第三行带缩进",
  });
  const [entry] = userMarketEntries([agent], "@我");
  // 广场「核心职责」取自 Agent 详情页「职责与人设」下的 role。
  assert.equal(entry.role, agent.role);
  // 广场「人设描述」取自 Agent 详情页「职责与人设」下的 persona，换行与缩进均保留。
  assert.equal(entry.persona, agent.persona);
  // 卡片正文：用户公开智能体以人设描述为正文，与详情弹窗「人设描述」同源。
  assert.equal(entry.detail, agent.persona);
});

test("userMarketEntries：人设描述为空时卡片正文回退到核心职责", () => {
  const agent = fakeAgent({ id: "fallback", public: true, role: "只有核心职责", persona: "" });
  const [entry] = userMarketEntries([agent], "@我");
  assert.equal(entry.role, "只有核心职责");
  assert.equal(entry.persona, "");
  assert.equal(entry.detail, "只有核心职责");
});

test("userMarketEntries：公开时同步技能与连接器引用到广场", () => {
  const agent = fakeAgent({
    id: "published-with-stuff",
    public: true,
    skills: ["portfolio", "risk"],
    installedConnectors: ["browser", "gmail"],
  });
  const [entry] = userMarketEntries([agent], "@我");
  // 内部能力键与连接器 id 引用逐字透传，供其他用户查看/导入；不做来源侧筛选。
  assert.deepEqual(entry.skills, ["portfolio", "risk"]);
  assert.deepEqual(entry.connectors, ["browser", "gmail"]);
  // 未安装目录技能 / 没有自建技能时，对应字段为空数组（保证广场卡片不误报技能）。
  assert.deepEqual(entry.installedSkills, []);
  assert.deepEqual(entry.customSkills, []);
});

test("userMarketEntries：未挂连接器的公开智能体连接器为空数组", () => {
  const agent = fakeAgent({ id: "no-connectors", public: true });
  const [entry] = userMarketEntries([agent], "@我");
  assert.deepEqual(entry.connectors, []);
});

test("remoteMarketEntries：透传发布方公开的技能与连接器引用，并过滤自己的", () => {
  const records: RemoteMarketAgent[] = [
    {
      id: "alice:remote-a",
      ownerName: "Alice",
      agentId: "remote-a",
      name: "远方的智能体",
      role: "观察员",
      persona: "一段人设",
      avatar: "bloom",
      skills: ["brief", "search"],
      connectors: ["calendar"],
      instructions: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "bob:my-agent",
      ownerName: "Bob",
      agentId: "my-agent",
      name: "自己的智能体",
      role: "自建",
      persona: "人设",
      avatar: "orb",
      skills: ["quote"],
      connectors: [],
      instructions: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  const entries = remoteMarketEntries(records, new Set(["my-agent"]), "@某用户");
  assert.deepEqual(
    entries.map((entry) => entry.key),
    ["remote:alice:remote-a"],
  );
  const [entry] = entries;
  assert.deepEqual(entry.skills, ["brief", "search"]);
  assert.deepEqual(entry.connectors, ["calendar"]);
  assert.equal(entry.source, "@Alice");
});

test("userMarketEntries：公开时同步目录技能与自建技能（引用解析 + 残留去重）", () => {
  const library = [fakeSkill({ id: "lib-1", name: "财报拆解", purpose: "拆解三张表" })];
  const agent = fakeAgent({
    id: "skills-synced",
    public: true,
    installedSkills: ["external-skill-a", "external-skill-b"],
    skillRefs: ["lib-1"],
    // 残留副本：内容与技能库引用不重复的保留；与引用同内容的副本丢弃（内容去重）。
    customSkills: [
      fakeSkill({ id: "legacy-copy", name: "历史副本" }),
      fakeSkill({
        id: "dup-of-lib-1",
        name: "财报拆解",
        purpose: "拆解三张表",
        instructions: library[0].instructions,
        outputFormat: library[0].outputFormat,
      }),
    ],
  });
  const [entry] = userMarketEntries([agent], "@我", library);
  // 目录技能 id 逐字透传，广场卡片/详情页据此在本地技能目录解析标题。
  assert.deepEqual(entry.installedSkills, ["external-skill-a", "external-skill-b"]);
  // 自建技能 = 技能库引用解析（保持引用顺序）+ 未重复的残留副本；同内容副本被去重。
  assert.deepEqual(
    entry.customSkills.map((skill) => skill.id),
    ["lib-1", "legacy-copy"],
  );
});

test("userMarketEntries：未传技能库时自建技能只透传 Agent 上的副本", () => {
  const agent = fakeAgent({
    id: "no-library",
    public: true,
    skillRefs: ["lib-1"],
    customSkills: [fakeSkill({ id: "legacy-only" })],
  });
  const [entry] = userMarketEntries([agent], "@我");
  // 没有技能库可解析引用，只透传 Agent 上实际携带的自建技能副本。
  assert.deepEqual(
    entry.customSkills.map((skill) => skill.id),
    ["legacy-only"],
  );
});

test("remoteMarketEntries：透传发布方的目录技能与自建技能快照", () => {
  const custom = fakeSkill({ id: "remote-cs", name: "远方自建", purpose: "远方用途" });
  const records: RemoteMarketAgent[] = [
    {
      id: "alice:remote-b",
      ownerName: "Alice",
      agentId: "remote-b",
      name: "远方的智能体",
      role: "观察员",
      persona: "一段人设",
      avatar: "bloom",
      skills: ["brief", "search"],
      installedSkills: ["external-skill-x"],
      customSkills: [custom],
      connectors: ["calendar"],
      instructions: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  const [entry] = remoteMarketEntries(records, new Set(), "@某用户");
  // 其他用户公开的智能体：目录技能 id 与自建技能快照必须随卡片透传，供展示与导入。
  assert.deepEqual(entry.installedSkills, ["external-skill-x"]);
  assert.deepEqual(entry.customSkills, [custom]);
});
