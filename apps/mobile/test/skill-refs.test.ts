import assert from "node:assert/strict";
import test from "node:test";
import {
  type AgentDefinition,
  type AgentSkill,
  heldCustomSkills,
  linkCopiedSkills,
} from "../src/agent-space-model.ts";

function skill(id: string, instructions = "先提取营业收入。"): AgentSkill {
  return {
    id,
    name: "现金流",
    purpose: "核对利润和现金",
    instructions,
    outputFormat: "结论先行。",
    enabled: true,
    version: 1,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
  };
}

function agent(customSkills: AgentSkill[], skillRefs: string[] = []): AgentDefinition {
  return { customSkills, skillRefs } as AgentDefinition;
}

test("a copied skill becomes a reference to the library original", () => {
  const library = skill("lib-1", "库里的新步骤。");
  const copy = skill("copy-1", "库里的新步骤。");
  const linked = linkCopiedSkills(agent([copy]), [library]);
  assert.deepEqual(linked.skillRefs, ["lib-1"]);
  assert.deepEqual(linked.customSkills, []);
  assert.equal(heldCustomSkills(linked, [library])[0]?.instructions, "库里的新步骤。");
});

test("a library reference stays attached after the original text changes", () => {
  const original = skill("lib-1", "库里的新步骤。");
  const linked = linkCopiedSkills(agent([], ["lib-1"]), [original]);
  const edited = { ...original, instructions: "改过的步骤。" };
  assert.equal(heldCustomSkills(linked, [edited])[0]?.instructions, "改过的步骤。");
});

test("a copy that does not match the library stays on the agent", () => {
  const copy = skill("copy-1", "另一套步骤。");
  const linked = linkCopiedSkills(agent([copy]), [skill("lib-1")]);
  assert.deepEqual(linked.skillRefs, []);
  assert.equal(linked.customSkills[0]?.id, "copy-1");
});
