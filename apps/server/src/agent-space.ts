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
    // role ≤ 50：内置智能体导入时把面向市场的简介（detail，最长约 39 字）写进 role，
    // 上限要比简介更长，否则导入后的首次保存会被 422 拒绝。
    role: z.string().trim().min(1).max(50),
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
    // 是否已公开到智能体市场；旧客户端不带该字段，保持可选以兼容。
    public: z.boolean().optional(),
    threadExists: z.boolean(),
    createdAt: timestamp,
    skills: z.array(identifier).max(30),
    // 从技能目录安装到该 Agent 的技能 id；旧客户端不带该字段，保持可选以兼容。
    installedSkills: z.array(identifier).max(60).optional(),
    // 自建技能按技能库 id 引用，不再复制。旧客户端不带该字段。
    skillRefs: z.array(identifier).max(60).optional(),
    // 从「技能与连接库」分配给该智能体的连接 id。连接本身仍是账户级资产。
    // 旧客户端不带该字段；agentSchema 是 .strict()，缺了它新版客户端的整次 PUT 会被 422 拒绝。
    installedConnectors: z.array(identifier).max(20).optional(),
    // 从市场导入的自建技能快照（≤60，与市场记录 customSkills 的上限一致）；
    // 导入后才能与发布方保持完整一致的技能配置。
    customSkills: z.array(skillSchema).max(60),
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
 * 智能体市场里的一条公开记录（跨用户共享）。
 *
 * 服务端在每次保存 agent-space 时，把 `public === true` 的自建智能体同步
 * 一份快照到这里；`id` 用 `${owner}:${agentId}` 保证全局唯一，读取端用 `scan`
 * 跨 owner 拉全量，从而让「A 公开的智能体，B 也能在市场看到」。
 */
export const marketAgentRecordSchema = z
  .object({
    id: z.string().trim().min(1).max(300),
    owner: identifier,
    // 发布者昵称（来自 user_profiles）；读不到时省略，前端回退到通用文案。
    ownerName: shortText(80).optional(),
    agentId: identifier,
    name: z.string().trim().min(1).max(20),
    // 与 agentSchema.role 同步放宽到 50，否则用长简介当 role 的智能体无法被公开。
    role: z.string().trim().min(1).max(50),
    persona: z.string().trim().min(1).max(1000),
    avatar: z.enum(["orb", "bloom", "moon", "planet", "cat"]),
    // 模板预置的内部能力键，不再写入新公开快照（技能由 installedSkills/customSkills 承载）；
    // 字段保留为可选，用于兼容历史公开记录。
    skills: z.array(identifier).max(30).optional(),
    // 公开时同步的技能目录技能 id（skillCatalog 里的 id）。导入方能按 id 在本地
    // 技能目录中解析出标题与简介；跨用户时技能本身仍是项目方目录，无需复制内容。
    installedSkills: z.array(identifier).max(60).optional(),
    // 公开时同步的自建技能完整快照（skillRefs 解析自账户级技能库 + 残留副本）。
    // 自建技能是账户级资产，导入方拿不到发布方的技能库，必须复制元数据才能展示。
    customSkills: z.array(skillSchema).max(60).optional(),
    // 公开时同步的连接器引用 id（账户级资产，导入方拿到的是 id 引用而非连接本体）。
    connectors: z.array(identifier).max(20).optional(),
    instructions: z.string().max(4000).optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export type MarketAgentRecord = z.infer<typeof marketAgentRecordSchema>;

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

/**
 * 按「执行方标识」解析出一个具体 Agent（多 Agent 编排用）。
 *
 * `assignedAgent` 语义兼容两种来源：
 *   - 模板枚举值（market/asset/research/...）：优先匹配第一个使用该模板的非系统 Agent；
 *   - 具体 Agent 的 id 或 threadId（频道成员精确分配）：精确匹配。
 *
 * 返回该 Agent 的 threadId（决定子任务用哪个模型）与人设字段（role/persona/instructions），
 * 供调用方把子任务真正路由到该成员 Agent。
 */
export async function resolveAgentForAssignment(
  db: { get: <T>(owner: string, kind: string, id: string) => Promise<T | null> },
  owner: string,
  assignedAgent?: string | null,
): Promise<
  | {
      threadId: string;
      role?: string;
      persona?: string;
      instructions?: string;
    }
  | undefined
> {
  const target = assignedAgent?.trim();
  if (!target) return undefined;
  const saved = await db.get<PersistedAgentSpace & { id: string }>(
    owner,
    "agent-settings",
    "space",
  );
  if (!saved) return undefined;
  const byId = saved.agents.find(
    (agent) => agent.id === target || agent.threadId === target || agent.template === target,
  );
  if (!byId) return undefined;
  return {
    threadId: byId.threadId,
    role: byId.role,
    persona: byId.persona,
    instructions: byId.instructions,
  };
}
