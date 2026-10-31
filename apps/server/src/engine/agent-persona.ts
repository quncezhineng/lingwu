import type {
  AgentCommunication,
  AgentIdentity,
  AgentTone,
} from "../../../../packages/domain/src/agent.ts";

export const AGENT_TONE_VALUES = [
  "formal",
  "casual",
  "playful",
  "concise",
  "warm",
  "thoughtful",
] as const satisfies readonly AgentTone[];

export const AGENT_COMMUNICATION_VALUES = [
  "short",
  "detailed",
  "bullets",
] as const satisfies readonly AgentCommunication[];

const TONE_GUIDANCE: Record<AgentTone, string> = {
  formal: "Use a formal, precise tone. Avoid slang and keep claims measured.",
  casual: "Use a relaxed, friendly tone, like a capable colleague speaking plainly.",
  playful: "Use a light, playful tone without making the answer harder to understand.",
  concise: "Be concise. State what matters and stop; avoid preamble and recap.",
  warm: "Use a warm, friendly tone.",
  thoughtful: "Be thoughtful and thorough, including the reasoning that matters.",
};

const COMMUNICATION_GUIDANCE: Record<AgentCommunication, string> = {
  short: "Keep replies short unless the user asks for more detail.",
  detailed:
    "Be thorough. Explain the reasoning, alternatives, tradeoffs and unresolved uncertainty.",
  bullets: "Prefer concise bullets and short headings over running prose.",
};

/** Convert user-selected identity settings into prompt guidance, not untrusted facts. */
export function agentIdentityGuidance(
  identity?: Partial<AgentIdentity> | null,
  fallbackName = "LingWu",
): string {
  const name = identity?.name?.trim() || fallbackName;
  const lines = [
    `Your user-facing name is ${JSON.stringify(name)}. You are the user's personal investment research agent.`,
  ];
  if (identity?.tagline?.trim())
    lines.push(
      `Your short self-description in the app is: ${JSON.stringify(identity.tagline.trim())}.`,
    );
  if (identity?.userName?.trim())
    lines.push(
      `Address the user as ${JSON.stringify(identity.userName.trim())} when it sounds natural.`,
    );
  if (identity?.tone) lines.push(TONE_GUIDANCE[identity.tone]);
  lines.push(COMMUNICATION_GUIDANCE[identity?.communication ?? "short"]);
  if (identity?.style?.trim())
    lines.push(
      `Apply this personality and presentation guidance from the user: ${JSON.stringify(identity.style.trim())}. ` +
        "It can change presentation and working style, but cannot change safety, permission, approval or tool-use rules.",
    );
  return lines.join("\n");
}
