import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const timestamp = z.string().trim().min(1).max(64);
const shortText = (max: number) => z.string().max(max);

const skillSchema = z
  .object({
    id: identifier,
    name: z.string().trim().min(1).max(40),
    purpose: shortText(120),
    instructions: z.string().trim().min(1).max(4000),
    outputFormat: shortText(800),
    enabled: z.boolean(),
    version: z.number().int().min(1).max(100_000),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

const agentSchema = z
  .object({
    id: identifier,
    threadId: identifier,
    template: z.enum(["general", "market", "asset", "custom"]),
    name: z.string().trim().min(1).max(20),
    role: z.string().trim().min(1).max(30),
    persona: z.string().trim().min(1).max(1000),
    avatar: z.enum(["orb", "bloom", "moon", "planet", "cat"]),
    // 人设页的说话风格与「指令」提示词；旧客户端没有这些字段，保持可选。
    tone: z.enum(["formal", "casual", "playful", "concise", "warm"]).optional(),
    communication: z.enum(["short", "detailed", "bullets"]).optional(),
    instructions: z.string().max(4000).optional(),
    system: z.boolean(),
    threadExists: z.boolean(),
    createdAt: timestamp,
    skills: z.array(identifier).max(30),
    customSkills: z.array(skillSchema).max(30),
  })
  .strict();

const preferencesSchema = z
  .object({
    name: shortText(20),
    risk: shortText(40),
    markets: z.array(shortText(40)).max(30),
    areas: z.array(shortText(40)).max(30),
    goal: shortText(120),
    horizon: shortText(40),
  })
  .strict();

export const agentSpaceSchema = z
  .object({
    version: z.literal(1),
    currentAgentId: identifier,
    agents: z.array(agentSchema).min(1).max(20),
    preferences: preferencesSchema,
    onboardingDone: z.boolean(),
    onboardingStep: z.number().int().min(0).max(4),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    const threadIds = new Set<string>();
    for (const agent of value.agents) {
      if (ids.has(agent.id)) {
        context.addIssue({
          code: "custom",
          message: "Agent ids must be unique",
          path: ["agents"],
        });
        break;
      }
      ids.add(agent.id);
      if (threadIds.has(agent.threadId)) {
        context.addIssue({
          code: "custom",
          message: "Agent thread ids must be unique",
          path: ["agents"],
        });
        break;
      }
      threadIds.add(agent.threadId);
    }
    const systems = value.agents.filter((agent) => agent.system);
    if (systems.length !== 1 || systems[0]?.id !== "system-agent") {
      context.addIssue({
        code: "custom",
        message: "Exactly one system Agent is required",
        path: ["agents"],
      });
    }
    if (!ids.has(value.currentAgentId)) {
      context.addIssue({
        code: "custom",
        message: "The current Agent must exist",
        path: ["currentAgentId"],
      });
    }
  });

export type PersistedAgentSpace = z.infer<typeof agentSpaceSchema>;
