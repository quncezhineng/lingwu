/**
 * 智能体导入 → 自建技能复制进导入用户技能库 的行为单测。
 *
 * 缺陷背景：用户 A 公开了含自建技能 C 的智能体 B，用户 D 从广场导入 B 时，
 * C 只被当成 B 上的「孤儿副本」（customSkills），从未写入 D 账户级技能库，
 * D 在「我的技能」里看不到、也无法独立编辑管理。
 *
 * 修复行为：导入时把发布方公开的自建技能快照复制成导入用户技能库里的独立记录，
 * 新 Agent 通过 skillRefs 引用这些记录。覆盖：
 * - 跨用户导入：内容四项 + enabled 与发布方完全一致，id/时间戳全新（数据隔离）；
 * - 单次导入多技能：全部入账，引用顺序与发布方一致，id 两两不同；
 * - 内容去重：库里已有同内容记录时复用 id，重复导入同一智能体不会堆出重复记录；
 * - 导入用户独立编辑：改技能库原件，导入的智能体随之生效（引用语义）；
 * - 与发布链路（userMarketEntries）衔接：发布方快照 → 导入方技能库全链路数据一致；
 * - 技能库上限：接近上限时不新增也不会挂悬空引用。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { userMarketEntries } from "../src/agent-market.ts";
import {
  type AgentSkill,
  copySkillsIntoLibrary,
  createAgentFromTemplate,
  createCustomSkill,
  heldCustomSkills,
  nextThreadId,
  normalizeAgentSpace,
} from "../src/agent-space-model.ts";

const NOW = "2026-11-21T00:00:00.000Z";

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

/** 断言一条导入记录的内容与发布方快照完全一致（id/时间戳/version 除外）。 */
function assertContentSame(target: AgentSkill, source: AgentSkill) {
  assert.equal(target.name, source.name);
  assert.equal(target.purpose, source.purpose);
  assert.equal(target.instructions, source.instructions);
  assert.equal(target.outputFormat, source.outputFormat);
  assert.equal(target.enabled, source.enabled);
}

test("copySkillsIntoLibrary：跨用户导入时复制为技能库独立记录，内容与发布方完全一致", () => {
  // 用户 A 公开的自建技能 C（完整配置：用途/指令/输出格式/关闭状态）。
  const published = fakeSkill({
    id: "alice-skill-c",
    name: "财报三表拆解",
    purpose: "拆解利润表 / 资产负债表 / 现金流量表",
    instructions: "1. 先看利润表增速；2. 再对照资产负债表勾稽；3. 最后核对现金流归因。",
    outputFormat: "按「增速 → 勾稽 → 归因」三节输出，每节不超过 5 行。",
    enabled: false, // 发布方关闭了该技能；状态必须继承，而不是被当成开启
    version: 7,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  });
  // 用户 D 导入：技能库原本为空。
  const { skillLibrary, refs } = copySkillsIntoLibrary([published], [], NOW);
  assert.equal(skillLibrary.length, 1);
  assert.equal(refs.length, 1);
  assert.equal(refs[0], skillLibrary[0]?.id);
  const imported = skillLibrary[0];
  assert.ok(imported);
  // 内容四项 + enabled 与发布方完全一致（功能配置 / 参数定义 / 执行逻辑原样沿用）。
  assertContentSame(imported, published);
  // 数据隔离：id 全新、时间戳为导入时刻、version 从 1 重新起算，不与发布方共享任何字段。
  assert.notEqual(imported.id, published.id);
  assert.ok(imported.id.length > 0);
  assert.equal(imported.createdAt, NOW);
  assert.equal(imported.updatedAt, NOW);
  assert.equal(imported.version, 1);
  // 发布方原始对象一字未动。
  assert.equal(published.id, "alice-skill-c");
  assert.equal(published.version, 7);
  assert.equal(published.updatedAt, "2026-05-01T00:00:00.000Z");
});

test("copySkillsIntoLibrary：一次导入多技能全部入账，引用顺序与发布方一致", () => {
  const a = fakeSkill({ id: "s1", name: "技能一", purpose: "用途一" });
  const b = fakeSkill({ id: "s2", name: "技能二", purpose: "用途二" });
  const c = fakeSkill({ id: "s3", name: "技能三", purpose: "用途三" });
  const { skillLibrary, refs } = copySkillsIntoLibrary([a, b, c], [], NOW);
  assert.deepEqual(
    refs,
    skillLibrary.map((skill) => skill.id),
  );
  assert.equal(skillLibrary.length, 3);
  // 引用顺序与发布方快照顺序一致，导入的 Agent 技能排布不会乱序。
  assert.deepEqual(
    skillLibrary.map((skill) => skill.name),
    ["技能一", "技能二", "技能三"],
  );
  // 新记录 id 两两不同（各自独立，互不引用）。
  assert.equal(new Set(skillLibrary.map((skill) => skill.id)).size, 3);
  assert.equal(refs.length, 3);
});

test("copySkillsIntoLibrary：库里已有同内容记录时复用 id，重复导入不产生重复记录", () => {
  const published = fakeSkill({ id: "alice-dup", name: "估值模型", purpose: "DCF 与可比公司" });
  // 第一次导入：没有同内容记录 → 新建。
  const first = copySkillsIntoLibrary([published], [], NOW);
  // 第二次导入同一智能体：技能库已有同内容记录 → 复用旧 id，不新增。
  const second = copySkillsIntoLibrary([published], first.skillLibrary, NOW);
  assert.equal(second.skillLibrary.length, 1);
  assert.equal(second.refs[0], first.refs[0]);
  assert.equal(first.skillLibrary[0]?.id, first.refs[0]);
});

test("copySkillsIntoLibrary：不同内容即使同名也各自成记录（内容指纹判重）", () => {
  const published = fakeSkill({ id: "alice-rename", name: "选股", purpose: "第一版逻辑" });
  const { skillLibrary, refs } = copySkillsIntoLibrary([published], [], NOW);
  // 库里已有同名但指令不同的技能 → 内容指纹不同，必须新建独立记录。
  const edited = fakeSkill({ id: "alice-rename-2", name: "选股", purpose: "第二版逻辑" });
  const again = copySkillsIntoLibrary([edited], skillLibrary, NOW);
  assert.equal(again.skillLibrary.length, 2);
  assert.equal(again.skillLibrary[0]?.id, refs[0]);
  assert.notEqual(again.skillLibrary[0]?.id, again.skillLibrary[1]?.id);
});

test("copySkillsIntoLibrary：导入记录可在导入方技能库独立编辑并让导入的智能体生效", () => {
  const published = fakeSkill({ id: "alice-edit", name: "风控规则", purpose: "初版集中度" });
  const { skillLibrary, refs } = copySkillsIntoLibrary([published], [], NOW);
  // 导入用户在「我的技能」里编辑这份记录（改内容，沿用同一 id）。
  const editedRecord = createCustomSkill(
    {
      name: "风控规则",
      purpose: "升级：加行业集中度与回撤红线",
      instructions: "集中度超过 30% 触发提示；单日回撤超 5% 同步告警。",
      outputFormat: "按「提示 / 告警」两类输出。",
    },
    skillLibrary[0],
    "2026-11-21T12:00:00.000Z",
  );
  assert.equal(editedRecord.id, skillLibrary[0]?.id); // 编辑不换 id，引用因此仍然有效
  assert.equal(editedRecord.version, 2);
  // 该记录 id 正是导入 Agent 的 skillRefs 指向的 id → 编辑原件，导入的智能体随之生效。
  assert.equal(refs[0], editedRecord.id);
});

test("copySkillsIntoLibrary：与发布链路 userMarketEntries 衔接，全链路快照一致", () => {
  // 发布侧：用户 A 的智能体持有技能库引用 + 一份残留历史副本。
  const libraryOfA = [
    createCustomSkill(
      {
        name: "主力资金监控",
        purpose: "监控北向与主力净流入",
        instructions: "按日线级别输出",
        outputFormat: "表格",
      },
      undefined,
      "2026-03-01T00:00:00.000Z",
    ),
  ];
  const agentOfA = createAgentFromTemplate("custom", {
    id: "alice-agent-b",
    threadId: "alice-thread-b",
    name: "资金猎手",
    role: "资金观察员",
    persona: "盯资金动向",
    avatar: "orb",
    now: "2026-03-01T00:00:00.000Z",
  });
  const publishedAgent = {
    ...agentOfA,
    public: true as const,
    skillRefs: [libraryOfA[0]!.id],
    customSkills: [
      createCustomSkill(
        { name: "历史旧技能", purpose: "老版本遗留", instructions: "旧逻辑", outputFormat: "段落" },
        undefined,
        "2026-02-01T00:00:00.000Z",
      ),
    ],
  };
  // 发布方公开到广场：userMarketEntries 给出快照（引用解析 + 残留副本）。
  const [entry] = userMarketEntries([publishedAgent], "@Alice", libraryOfA);
  assert.equal(entry.customSkills.length, 2);
  const snapshot = entry.customSkills!;
  // 导入侧：用户 D 从空技能库导入该智能体 → 快照全部复制为 D 自己的独立记录。
  const { skillLibrary, refs } = copySkillsIntoLibrary(snapshot, [], NOW);
  assert.equal(skillLibrary.length, 2);
  assert.equal(refs.length, 2);
  assertContentSame(skillLibrary[0]!, snapshot[0]!);
  assertContentSame(skillLibrary[1]!, snapshot[1]!);
  // 数据隔离：与发布方库里的记录 id 完全不同。
  assert.ok(!libraryOfA.some((skill) => skill.id === skillLibrary[0]?.id));
});

test("导入组装：新 Agent 以 skillRefs 持有技能，不再带孤儿副本，可被 heldCustomSkills 解析", () => {
  const published = fakeSkill({ id: "alice-wiring", name: "行业轮动", purpose: "跟踪板块强度" });
  // 复刻 createAgent 的组装逻辑（模板建底稿 → 写库拿引用 → 挂引用并清空快照副本）。
  const base = createAgentFromTemplate("custom", {
    id: "importer-agent",
    threadId: "importer-thread",
    name: "轮动大师",
    role: "板块观察员",
    persona: "盯行业强度",
    avatar: "moon",
    customSkills: [published],
    now: NOW,
  });
  const { skillLibrary, refs } = copySkillsIntoLibrary(base.customSkills, [], NOW);
  const importedAgent = {
    ...base,
    skillRefs: refs.slice(0, 60),
    customSkills: [],
  };
  // 技能库里有记录、Agent 指向它 → heldCustomSkills 能解析出这份技能（可正常使用）。
  const held = heldCustomSkills(importedAgent, skillLibrary);
  assert.equal(held.length, 1);
  assert.equal(held[0]?.id, skillLibrary[0]?.id);
  assertContentSame(held[0]!, published);
  // 持久化归一化后：skillRefs / skillLibrary 结构保持，技能仍可解析。
  const normalized = normalizeAgentSpace(
    {
      currentAgentId: importedAgent.id,
      agents: [importedAgent],
      skillLibrary,
      onboardingDone: true,
    },
    "main-thread",
  );
  const stored = normalized.agents.find((agent) => agent.id === importedAgent.id);
  assert.ok(stored);
  assert.deepEqual(stored.skillRefs, refs);
  assert.deepEqual(stored.customSkills, []);
  assert.equal(heldCustomSkills(stored, normalized.skillLibrary).length, 1);
});

test("copySkillsIntoLibrary：技能库接近上限时不新增记录，也不挂悬空引用", () => {
  // 造一个已到上限（200）的技能库：前 199 条占位 + 1 条可复用记录。
  const library = Array.from({ length: 199 }, (_, index) =>
    createCustomSkill(
      {
        name: `占位技能${index}`,
        purpose: "占位",
        instructions: "占位指令",
        outputFormat: "占位格式",
      },
      undefined,
      NOW,
    ),
  );
  library.push(
    createCustomSkill(
      { name: "可复用技能", purpose: "已存在", instructions: "同内容", outputFormat: "复用" },
      undefined,
      NOW,
    ),
  );
  const reuseable = library[199];
  assert.equal(library.length, 200);
  const pending = fakeSkill({
    id: "brand-new",
    name: "新技能",
    purpose: "待新增",
    instructions: "新指令",
    outputFormat: "新格式",
  });
  // 同内容的记录仍可复用（不新增、不超限）；全新的记录因为库满被跳过。
  const { skillLibrary, refs } = copySkillsIntoLibrary([pending, reuseable], library, NOW);
  assert.equal(skillLibrary.length, 200);
  assert.deepEqual(refs, [reuseable!.id]);
  // 被跳过的技能不会出现在 refs 里 → 导入的 Agent 不会挂指向不存在记录的引用。
  assert.ok(!refs.includes(pending.id));
  assert.ok(skillLibrary.every((skill) => skill.id !== pending.id));
});

test("copySkillsIntoLibrary：空快照导入不改变技能库，refs 为空数组", () => {
  const library = [fakeSkill({ id: "existing", name: "已有技能" })];
  const { skillLibrary, refs } = copySkillsIntoLibrary([], library, NOW);
  assert.deepEqual(refs, []);
  assert.equal(skillLibrary.length, 1);
  assert.deepEqual(
    skillLibrary.map((skill) => skill.id),
    ["existing"],
  );
});
