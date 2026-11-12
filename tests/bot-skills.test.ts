import assert from "node:assert/strict";
import test from "node:test";
import {
  installedSkillViews,
  loadBuiltinSkills,
  parseSkillMarkdown,
  readInstalledSkill,
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
});
