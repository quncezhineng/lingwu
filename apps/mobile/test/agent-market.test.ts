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
  userMarketEntries,
} from "../src/agent-market.ts";
import { BUILTIN_AGENT_INSTRUCTIONS } from "../src/agent-market-instructions.ts";
import type { AgentDefinition } from "../src/agent-space-model.ts";
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
