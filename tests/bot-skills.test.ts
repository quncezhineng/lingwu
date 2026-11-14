import assert from "node:assert/strict";
import test from "node:test";
import {
  installedSkillViews,
  loadBuiltinSkills,
  parseSkillMarkdown,
  readInstalledSkill,
  selectedSkillsFromRun,
  skillGuidanceForThread,
  skillPrompt,
} from "../apps/server/src/engine/bot-skills.ts";

test("a skill file splits into a short summary and the method", () => {
  const skill = parseSkillMarkdown(
    "earnings-analysis",
    "---\nname_zh: 财报分析\ndescription_zh: 看一季业绩。\n---\n\n# 步骤\n先看营收。\n",
  );
  assert.equal(skill.name, "财报分析");
  assert.equal(skill.description, "看一季业绩。");
  assert.match(skill.body, /先看营收/);
  assert.doesNotMatch(skill.body, /name_zh/);
});

test("installed skills are summarized, and use_skill returns only those bodies", async () => {
  const builtin = parseSkillMarkdown(
    "earnings-analysis",
    "---\nname_zh: 财报分析\ndescription_zh: 看业绩。\n---\n先看营收。",
  );
  const originals = loadBuiltinSkills();
  originals.set(builtin.id, builtin);
  const space = {
    skillLibrary: [
      {
        id: "lib-1",
        name: "现金流",
        purpose: "核对利润和现金",
        instructions: "先提取营业收入。",
        outputFormat: "结论先行。",
      },
    ],
    agents: [
      {
        threadId: "thread-a",
        installedSkills: ["earnings-analysis", "missing-skill"],
        skillRefs: ["lib-1"],
        customSkills: [
          {
            id: "old-copy",
            name: "旧副本",
            purpose: "还没迁走",
            instructions: "按旧步骤。",
            outputFormat: "",
          },
        ],
      },
    ],
  };
  const view = installedSkillViews(space, "thread-a");
  assert.deepEqual(
    view.summaries.map((skill) => skill.id),
    ["earnings-analysis", "lib-1", "old-copy"],
  );
  assert.match(skillPrompt(view.summaries), /use_skill/);
  assert.match(view.bodies.get("lib-1")?.body ?? "", /先提取营业收入/);
  const db = {
    get: async <T>() => space as T,
  };
  const found = await readInstalledSkill(db, "owner", "thread-a", "lib-1");
  assert.match("body" in found && found.body ? found.body : "", /营业收入/);
  const missing = await readInstalledSkill(db, "owner", "thread-a", "not-installed");
  assert.deepEqual(missing, { error: "That skill is not installed on this agent." });
  const byName = await readInstalledSkill(db, "owner", "thread-a", "财报分析");
  assert.equal("id" in byName && byName.id, "earnings-analysis");
});

test("a platform thread still sees the only agent's installed skills", () => {
  const builtin = parseSkillMarkdown(
    "earnings-analysis",
    "---\nname_zh: 财报分析\ndescription_zh: 看业绩。\n---\n先看营收。",
  );
  loadBuiltinSkills().set(builtin.id, builtin);
  const view = installedSkillViews(
    { agents: [{ threadId: "thread-a", installedSkills: ["earnings-analysis"] }] },
    "local",
  );
  assert.equal(view.bodies.has("earnings-analysis"), true);
});

test("an unknown thread on a multi-agent space uses the system agent only", () => {
  const earnings = parseSkillMarkdown(
    "earnings-analysis",
    "---\nname_zh: 财报分析\ndescription_zh: 看业绩。\n---\n先看营收。",
  );
  const notes = parseSkillMarkdown("notes-skill", "---\nname_zh: 笔记\n---\n记下来。");
  const builtins = loadBuiltinSkills();
  builtins.set(earnings.id, earnings);
  builtins.set(notes.id, notes);
  const view = installedSkillViews(
    {
      agents: [
        { id: "system-agent", threadId: "main", installedSkills: ["earnings-analysis"] },
        { id: "other", threadId: "side", installedSkills: ["notes-skill"] },
      ],
    },
    "platform-thread",
  );
  assert.deepEqual(
    view.summaries.map((skill) => skill.id),
    ["earnings-analysis"],
  );
});

test("a skill that is only selected in the browser is not installed", async () => {
  const builtin = parseSkillMarkdown(
    "earnings-analysis",
    "---\nname_zh: 财报分析\ndescription_zh: 看业绩。\n---\n先看营收。",
  );
  loadBuiltinSkills().set(builtin.id, builtin);
  const space = {
    skillLibrary: [
      {
        id: "lib-1",
        name: "现金流",
        purpose: "核对利润和现金",
        instructions: "先提取营业收入。",
        outputFormat: "",
      },
    ],
    agents: [
      {
        id: "system-agent",
        threadId: "main",
        installedSkills: [] as string[],
        skillRefs: [] as string[],
        customSkills: [],
      },
    ],
  };
  const db = { get: async <T>() => space as T };
  const selected = selectedSkillsFromRun({
    context: [
      { value: JSON.stringify({ skills: [{ id: "earnings-analysis", name: "财报分析" }] }) },
    ],
    messages: [
      {
        role: "user",
        content: "看一下\n\nSelected skills: 财报分析 (skill ID: earnings-analysis)",
      },
    ],
  });
  assert.deepEqual(selected, [{ id: "earnings-analysis", name: "财报分析" }]);
  assert.deepEqual(await readInstalledSkill(db, "owner", "main", "earnings-analysis"), {
    error: "That skill is not installed on this agent.",
  });
  assert.deepEqual(await readInstalledSkill(db, "owner", "main", "财报分析"), {
    error: "That skill is not installed on this agent.",
  });
  assert.equal(await skillGuidanceForThread(db, "owner", "main"), "");
});
