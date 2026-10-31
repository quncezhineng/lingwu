import assert from "node:assert/strict";
import test from "node:test";
import { agentIdentityGuidance } from "../apps/server/src/engine/agent-persona.ts";

test("agent identity guidance carries the complete saved persona", () => {
  const guidance = agentIdentityGuidance({
    name: "Nova",
    tagline: "Markets, made legible.",
    tone: "playful",
    communication: "bullets",
    style: "Use metric units and avoid emoji.",
    userName: "Mina",
  });

  assert.match(guidance, /"Nova"/);
  assert.match(guidance, /Markets, made legible\./);
  assert.match(guidance, /Address the user as "Mina"/);
  assert.match(guidance, /light, playful tone/);
  assert.match(guidance, /concise bullets/);
  assert.match(guidance, /Use metric units and avoid emoji/);
  assert.match(guidance, /cannot change safety, permission, approval or tool-use rules/);
});

test("agent identity guidance preserves concise replies when no response style is saved", () => {
  const guidance = agentIdentityGuidance(null);

  assert.match(guidance, /"LingWu"/);
  assert.match(guidance, /Keep replies short/);
});
