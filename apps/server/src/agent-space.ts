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
    // 模板枚举必须与移动端 `AgentTemplateId` 同步：这里是 .strict() 的对象，
    // 客户端新增模板而服务端没加，整次 PUT 会被 422 拒绝且被前端静默吞掉。
    template: z.enum([
      "general",
      "market",
      "asset",
      "research",
      "earnings",
      "macro",
      "risk",
      "review",
      "custom",
    ]),
    name: z.string().trim().min(1).max(20),
    role: z.string().trim().min(1).max(30),
    persona: z.string().trim().min(1).max(1000),
    avatar: z.enum(["orb", "bloom", "moon", "planet", "cat"]),
    // 人设页的说话风格与「指令」提示词；旧客户端没有这些字段，保持可选。
    tone: z.enum(["formal", "casual", "playful", "concise", "warm"]).optional(),
    communication: z.enum(["short", "detailed", "bullets"]).optional(),
    instructions: z.string().max(4000).optional(),
    // 每个 Agent 可以选择不同模型（含版本号）；缺省时跟随用户当前的默认模型。
    model: z
      .string()
      .trim()
      .min(1)
      .max(150)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)
      .optional(),
    system: z.boolean(),
    // 列表置顶标记；旧客户端不带该字段，保持可选以兼容。
    pinned: z.boolean().optional(),
    threadExists: z.boolean(),
    createdAt: timestamp,
    skills: z.array(identifier).max(30),
    // 从技能目录安装到该 Agent 的技能 id；旧客户端不带该字段，保持可选以兼容。
    installedSkills: z.array(identifier).max(60).optional(),
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
    // 账户级自建技能库：创建技能只入库，不自动挂到 Agent。旧客户端不带该字段，
    // 保持可选以兼容；顶层是 .strict()，缺了它新版客户端的整个 PUT 都会被拒绝。
    skillLibrary: z.array(skillSchema).max(200).optional(),
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

/**
 * 线程所属 Agent 的专属模型。
 *
 * Agent 的模型选择随 Agent 空间一起保存，所以对话与任务只按 threadId 就能拿到；
 * 未设置（或还没有保存过 Agent 空间）时返回 undefined，由调用方回落到默认模型。
 */
export async function agentModelForThread(
  db: { get: <T>(owner: string, kind: string, id: string) => Promise<T | null> },
  owner: string,
  threadId?: string | null,
): Promise<string | undefined> {
  const id = threadId?.trim();
  if (!id) return undefined;
  const saved = await db.get<PersistedAgentSpace & { id: string }>(
    owner,
    "agent-settings",
    "space",
  );
  return saved?.agents.find((agent) => agent.threadId === id)?.model;
}

/**
 * 线程所属 Agent 的 id（= agentSpaceSchema.agents[].id）。
 *
 * 多 Agent 记忆系统的隔离维度：记忆写入 / 召回时用它反查当前 Agent，
 * 旧数据（无对应线程映射）由调用方回退到 "default"。
 */
export async function agentIdForThread(
  db: { get: <T>(owner: string, kind: string, id: string) => Promise<T | null> },
  owner: string,
  threadId?: string | null,
): Promise<string | undefined> {
  const id = threadId?.trim();
  if (!id) return undefined;
  const saved = await db.get<PersistedAgentSpace & { id: string }>(
    owner,
    "agent-settings",
    "space",
  );
  return saved?.agents.find((agent) => agent.threadId === id)?.id;
}
