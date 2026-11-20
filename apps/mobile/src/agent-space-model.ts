/**
 * Client-side Agent workspace model.
 *
 * The existing server stores conversations and user-level resources. This model
 * supplies the missing multi-Agent layer without pretending that unsupported
 * Agent-scoped server data already exists: each Agent owns a stable thread id and
 * its presentation/skills, while user-level resources remain global.
 */

export type AgentTemplateId =
  | "general"
  | "market"
  | "asset"
  | "research"
  | "earnings"
  | "macro"
  | "risk"
  | "review"
  | "custom";
export type AgentAvatarId = "orb" | "bloom" | "moon" | "planet" | "cat";
/** 说话语气（人设页「语气」）。取值与 i18n `status.*` 一一对应。 */
export type AgentTone = "formal" | "casual" | "playful" | "concise" | "warm";
/** 回答详略（人设页「话说多少」）。取值与 i18n `status.*` 一一对应。 */
export type AgentCommunication = "short" | "detailed" | "bullets";
export type SelectionLike = { id: string; existing: boolean };

export const AGENT_TONES: readonly AgentTone[] = ["formal", "casual", "playful", "concise", "warm"];
export const AGENT_COMMUNICATIONS: readonly AgentCommunication[] = ["short", "detailed", "bullets"];
export const DEFAULT_AGENT_TONE: AgentTone = "warm";
export const DEFAULT_AGENT_COMMUNICATION: AgentCommunication = "detailed";

export interface AgentSkill {
  id: string;
  name: string;
  purpose: string;
  instructions: string;
  outputFormat: string;
  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentDefinition {
  id: string;
  threadId: string;
  template: AgentTemplateId;
  name: string;
  role: string;
  persona: string;
  avatar: AgentAvatarId;
  /** 说话语气，参与对话上下文。 */
  tone: AgentTone;
  /** 回答详略，参与对话上下文。 */
  communication: AgentCommunication;
  /** 系统提示词（人设页「指令」）：每次对话前作为指令注入。 */
  instructions: string;
  /** 这个 Agent 专用的模型（`provider/model-id`，含版本号）；留空表示跟随工作区默认模型。 */
  model?: string;
  /** The system-created default Agent cannot be deleted. */
  system: boolean;
  /** 置顶：在左侧 Agent 列表中排在未置顶的 Agent 之前（不改动 agents 的实际存储顺序）。 */
  pinned?: boolean;
  /** 是否已公开到智能体市场（点击详情页「公开」后置为 true）。 */
  public?: boolean;
  /** True once the server has created or already knows this thread. */
  threadExists: boolean;
  createdAt: string;
  skills: string[];
  /** 从技能目录安装到该 Agent 的技能 id；详情页据此区分「已安装」。 */
  installedSkills: string[];
  /** 账户级技能库里的自建技能 id。编辑原件后，引用它的 Agent 立即看到新内容。 */
  skillRefs: string[];
  /** 分配给这个智能体的连接 id。连接本身仍是账户级的。 */
  installedConnectors?: string[];
  customSkills: AgentSkill[];
}

export interface AgentUserPreferences {
  name: string;
  risk: string;
  markets: string[];
  areas: string[];
  goal: string;
  horizon: string;
}

export interface AgentSpaceState {
  version: 1;
  currentAgentId: string;
  agents: AgentDefinition[];
  /** 账户级自建技能库：创建技能只入库，是否挂到某个 Agent 由「添加到智能体」决定。 */
  skillLibrary: AgentSkill[];
  preferences: AgentUserPreferences;
  onboardingDone: boolean;
  onboardingStep: number;
}

export interface AgentSpaceRemoteLoad {
  storageKey: string;
  request: number;
  /** Writes are allowed only after this exact request returned the server copy. */
  writable: boolean;
}

export const SYSTEM_AGENT_ID = "system-agent";
export const AGENT_SPACE_STORAGE_KEY = ["lingwu", "agent", "space", "v1"].join(".");

function accountStorageHash(accountIdentity: string) {
  let hash = 2166136261;
  for (let index = 0; index < accountIdentity.length; index += 1) {
    hash ^= accountIdentity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Keep offline Agent data scoped to the signed-in account. The hash avoids
 * writing the account email itself into browser storage keys.
 */
export function agentSpaceStorageKey(accountIdentity?: string | null) {
  const identity = accountIdentity?.trim().toLowerCase();
  return identity ? `${AGENT_SPACE_STORAGE_KEY}.${accountStorageHash(identity)}` : null;
}

export const AGENT_TEMPLATES: Record<
  Exclude<AgentTemplateId, "general">,
  Pick<AgentDefinition, "name" | "role" | "persona" | "avatar" | "skills">
> = {
  market: {
    name: "行情 Agent",
    role: "市场观察员",
    persona: "专注行情和重要变化。先说发生了什么，再说明和自选的关系，不把噪声当机会。",
    avatar: "bloom",
    skills: ["quote", "brief", "research", "reminder", "search", "files", "notes", "memory"],
  },
  asset: {
    name: "资产 Agent",
    role: "组合观察员",
    persona:
      "盯住持仓结构与风险敞口，讲清每笔盈亏怎么来的。资产分开算，模拟组合不当成真实账户收益。",
    avatar: "planet",
    skills: ["portfolio", "risk", "goals", "notes", "files", "memory", "finance", "reminder"],
  },
  research: {
    name: "研究 Agent",
    role: "个股研究员",
    persona: "从商业模式、竞争格局和估值三件事回答。不确定的地方直接说不知道，不为了完整而编数据。",
    avatar: "orb",
    skills: ["research", "financials", "search", "brief", "files", "notes", "memory"],
  },
  earnings: {
    name: "财报 Agent",
    role: "财报解读者",
    persona: "读财报和业绩会，先看这一季有没有兑现上一季的指引，再判断变化是结构性还是季节性。",
    avatar: "cat",
    skills: ["financials", "research", "calendar", "files", "notes", "memory"],
  },
  macro: {
    name: "宏观 Agent",
    role: "宏观观察员",
    persona: "关注利率、汇率和大宗商品的传导，先讲机制再讲结论，不用宏观叙事替代对具体标的的判断。",
    avatar: "bloom",
    skills: ["brief", "search", "research", "reminder", "notes", "memory"],
  },
  risk: {
    name: "风控 Agent",
    role: "风险官",
    persona: "先想下跌时会发生什么。盯集中度、回撤和相关性，宁可保守也不给虚假的安全感。",
    avatar: "moon",
    skills: ["risk", "portfolio", "goals", "files", "notes", "memory"],
  },
  review: {
    name: "复盘 Agent",
    role: "复盘教练",
    persona: "陪用户复盘已经发生的交易，区分运气和能力，指出能重复执行的纪律问题，不事后诸葛亮。",
    avatar: "moon",
    skills: ["portfolio", "notes", "ideas", "goals", "files", "memory"],
  },
  custom: {
    name: "我的 Agent",
    role: "自定义研究助理",
    persona: "按你明确提供的目标工作，先理解问题，给出简短且可验证的回答。",
    avatar: "moon",
    skills: ["files", "notes", "memory", "search", "research"],
  },
};

export const DEFAULT_PREFERENCES: AgentUserPreferences = {
  name: "",
  risk: "",
  markets: [],
  areas: [],
  goal: "",
  horizon: "",
};

const PREFERENCE_MARKETS = new Set(["A股", "港股", "美股", "基金"]);

export function parsePreferenceFocus(
  value: string,
): Pick<AgentUserPreferences, "markets" | "areas"> {
  const items = [
    ...new Set(
      value
        .split(/[、,，;；|\n]+/)
        .map((item) => item.trim().slice(0, 40))
        .filter(Boolean),
    ),
  ];
  return {
    markets: items.filter((item) => PREFERENCE_MARKETS.has(item)).slice(0, 30),
    areas: items.filter((item) => !PREFERENCE_MARKETS.has(item)).slice(0, 30),
  };
}

export const SYSTEM_AGENT_CAPABILITIES = [
  "quote",
  "brief",
  "research",
  "financials",
  "notes",
  "files",
  "memory",
  "goals",
  "ideas",
  "search",
  "reminder",
] as const;

export const AGENT_CAPABILITY_LABELS: Record<string, { zh: string; en: string }> = {
  quote: { zh: "行情与自选", en: "Quotes & watchlist" },
  brief: { zh: "市场简报", en: "Market brief" },
  research: { zh: "标的研究", en: "Research" },
  financials: { zh: "财报解析", en: "Earnings" },
  portfolio: { zh: "组合观察", en: "Portfolio" },
  risk: { zh: "风险与对照", en: "Risk & comparison" },
  notes: { zh: "笔记与领悟卡", en: "Notes & insights" },
  reminder: { zh: "自动化", en: "Automation" },
  goals: { zh: "目标与跟进", en: "Goals" },
  ideas: { zh: "主动建议", en: "Ideas" },
  files: { zh: "资料与成果", en: "Files & results" },
  memory: { zh: "偏好与记忆", en: "Memory" },
  search: { zh: "搜索与网页", en: "Search & web" },
  browser: { zh: "浏览器", en: "Browser" },
  computer: { zh: "智能体电脑", en: "Agent computer" },
  mail: { zh: "邮件", en: "Mail" },
  calendar: { zh: "日历", en: "Calendar" },
  finance: { zh: "收支 CSV", en: "Finance CSV" },
};

const AVATARS: readonly AgentAvatarId[] = ["orb", "bloom", "moon", "planet", "cat"];
const TEMPLATES: readonly AgentTemplateId[] = [
  "general",
  "market",
  "asset",
  "research",
  "earnings",
  "macro",
  "risk",
  "review",
  "custom",
];

export function createSystemAgent(
  threadId: string,
  now = new Date().toISOString(),
): AgentDefinition {
  return {
    id: SYSTEM_AGENT_ID,
    threadId,
    template: "general",
    name: "小悟",
    role: "投研助理",
    persona: "清晰、耐心，先给结论，再说依据；不确定的地方明确说明。",
    avatar: "orb",
    tone: DEFAULT_AGENT_TONE,
    communication: DEFAULT_AGENT_COMMUNICATION,
    instructions: "",
    system: true,
    threadExists: true,
    createdAt: now,
    skills: [...SYSTEM_AGENT_CAPABILITIES],
    installedSkills: [],
    skillRefs: [],
    customSkills: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeSkill(value: unknown): AgentSkill | undefined {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const instructions = stringValue(value.instructions);
  if (!id || !name || !instructions) return undefined;
  const createdAt = stringValue(value.createdAt, new Date(0).toISOString());
  return {
    id,
    name: name.slice(0, 40),
    purpose: stringValue(value.purpose).slice(0, 120),
    instructions: instructions.slice(0, 4000),
    outputFormat: stringValue(value.outputFormat).slice(0, 800),
    enabled: value.enabled !== false,
    version: Math.max(1, Math.trunc(Number(value.version) || 1)),
    createdAt,
    updatedAt: stringValue(value.updatedAt, createdAt),
  };
}

/** 模型标识：`provider/model-id`，与服务端模型目录的取值范围一致。 */
const MODEL_SPEC = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,149}$/;

function normalizeAgentModel(value: unknown) {
  const spec = stringValue(value).trim();
  return MODEL_SPEC.test(spec) ? spec : undefined;
}

function normalizeAgent(value: unknown, mainThreadId: string): AgentDefinition | undefined {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  if (!id) return undefined;
  const system = id === SYSTEM_AGENT_ID;
  const template = TEMPLATES.includes(value.template as AgentTemplateId)
    ? (value.template as AgentTemplateId)
    : system
      ? "general"
      : "custom";
  const defaults = system
    ? createSystemAgent(mainThreadId)
    : {
        ...createSystemAgent(mainThreadId),
        template,
        name: "我的 Agent",
        role: "自定义研究助理",
        persona: AGENT_TEMPLATES.custom.persona,
        avatar: AGENT_TEMPLATES.custom.avatar,
        system: false,
        threadExists: false,
        skills: [...AGENT_TEMPLATES.custom.skills],
      };
  const skills = stringArray(value.skills).filter((skill) => skill in AGENT_CAPABILITY_LABELS);
  const agent: AgentDefinition = {
    ...defaults,
    id,
    // A system Agent always uses the server's canonical main thread.
    threadId: system ? mainThreadId : stringValue(value.threadId) || id,
    template,
    name: stringValue(value.name, defaults.name).slice(0, 20) || defaults.name,
    role: stringValue(value.role, defaults.role).slice(0, 30) || defaults.role,
    persona: stringValue(value.persona, defaults.persona).slice(0, 1000) || defaults.persona,
    avatar: AVATARS.includes(value.avatar as AgentAvatarId)
      ? (value.avatar as AgentAvatarId)
      : defaults.avatar,
    tone: AGENT_TONES.includes(value.tone as AgentTone) ? (value.tone as AgentTone) : defaults.tone,
    communication: AGENT_COMMUNICATIONS.includes(value.communication as AgentCommunication)
      ? (value.communication as AgentCommunication)
      : defaults.communication,
    instructions: stringValue(value.instructions).slice(0, 4000),
    system,
    threadExists: system || value.threadExists === true,
    createdAt: stringValue(value.createdAt, defaults.createdAt),
    skills: skills.length ? skills : defaults.skills,
    installedSkills: [...new Set(stringArray(value.installedSkills))].slice(0, 60),
    skillRefs: [...new Set(stringArray(value.skillRefs))].slice(0, 60),
    customSkills: Array.isArray(value.customSkills)
      ? value.customSkills
          .map(normalizeSkill)
          .filter((skill): skill is AgentSkill => Boolean(skill))
      : [],
  };
  // 没有专属模型时不写字段：键不存在才等于「跟随默认模型」，也让持久化前后保持一致。
  const model = normalizeAgentModel(value.model);
  if (model) agent.model = model;
  // 置顶同理：只在置顶时写入标记，未置顶的 Agent 不产出多余字段（幂等归一化不会多出 key）。
  if (value.pinned === true) agent.pinned = true;
  // 公开同理：只在公开时写入标记，未公开的 Agent 不产出多余字段。
  if (value.public === true) agent.public = true;
  // 连接同理：只在有挂载记录时写入，空的 Agent 不产出多余字段（幂等归一化不会多出 key）。
  const installedConnectors = [...new Set(stringArray(value.installedConnectors))].slice(0, 20);
  if (installedConnectors.length) agent.installedConnectors = installedConnectors;
  return agent;
}

function normalizePreferences(value: unknown): AgentUserPreferences {
  if (!isRecord(value)) return { ...DEFAULT_PREFERENCES };
  return {
    name: stringValue(value.name).slice(0, 20),
    risk: stringValue(value.risk).slice(0, 40),
    markets: [...new Set(stringArray(value.markets).map((item) => item.slice(0, 40)))].slice(0, 30),
    areas: [...new Set(stringArray(value.areas).map((item) => item.slice(0, 40)))].slice(0, 30),
    goal: stringValue(value.goal).slice(0, 120),
    horizon: stringValue(value.horizon).slice(0, 40),
  };
}

/** 与 skill-sharing 的 skillFingerprint 同口径：按内容去重，保留最近更新的一份。 */
function skillContentKey(skill: AgentSkill) {
  return [skill.name, skill.purpose, skill.instructions, skill.outputFormat].join("\u0000");
}

/**
 * 账户级技能库 normalize：老版本没有该字段，从各 Agent 的自建技能按内容去重迁移，
 * 保证升级后已有技能仍出现在「我的技能」里；已带字段时按同样口径清洗并去重。
 */
function normalizeSkillLibrary(value: unknown, agents: AgentDefinition[]): AgentSkill[] {
  const source: unknown[] = Array.isArray(value)
    ? value
    : agents.flatMap((agent) => agent.customSkills);
  const byContent = new Map<string, AgentSkill>();
  for (const item of source) {
    const skill = normalizeSkill(item);
    if (!skill) continue;
    const key = skillContentKey(skill);
    const seen = byContent.get(key);
    if (!seen || skill.updatedAt > seen.updatedAt) byContent.set(key, skill);
  }
  return [...byContent.values()];
}

/** 把和技能库内容相同的旧副本收成引用，之后改库里的原件就会作用到这个 Agent。 */
export function linkCopiedSkills(
  agent: AgentDefinition,
  library: readonly AgentSkill[],
): AgentDefinition {
  const refs = new Set(agent.skillRefs);
  const copies: AgentSkill[] = [];
  for (const copy of agent.customSkills) {
    const match = library.find((skill) => skillContentKey(skill) === skillContentKey(copy));
    if (match) refs.add(match.id);
    else if (!refs.has(copy.id)) copies.push(copy);
  }
  return { ...agent, skillRefs: [...refs].slice(0, 60), customSkills: copies };
}

/** 这个 Agent 实际持有的自建技能：技能库引用优先，对不上指纹的旧副本仍保留。 */
export function heldCustomSkills(
  agent: AgentDefinition,
  library: readonly AgentSkill[],
): AgentSkill[] {
  const byId = new Map(library.map((skill) => [skill.id, skill]));
  const referenced = agent.skillRefs
    .map((id) => byId.get(id))
    .filter((skill): skill is AgentSkill => Boolean(skill));
  const referencedKeys = new Set(referenced.map(skillContentKey));
  const leftovers = agent.customSkills.filter(
    (skill) => !agent.skillRefs.includes(skill.id) && !referencedKeys.has(skillContentKey(skill)),
  );
  return [...referenced, ...leftovers];
}

/** Parses persisted state and always guarantees exactly one system Agent. */
export function normalizeAgentSpace(value: unknown, mainThreadId: string): AgentSpaceState {
  const record = isRecord(value) ? value : {};
  const seen = new Set<string>();
  const threadIds = new Set<string>([mainThreadId]);
  const agents: AgentDefinition[] = [];
  for (const item of Array.isArray(record.agents) ? record.agents : []) {
    let agent = normalizeAgent(item, mainThreadId);
    if (!agent || seen.has(agent.id)) continue;
    seen.add(agent.id);
    if (!agent.system && threadIds.has(agent.threadId)) {
      agent = { ...agent, threadId: nextThreadId() };
    }
    threadIds.add(agent.threadId);
    agents.push(agent);
  }
  const skillLibrary = normalizeSkillLibrary(record.skillLibrary, agents);
  for (let index = 0; index < agents.length; index += 1) {
    agents[index] = linkCopiedSkills(agents[index], skillLibrary);
  }
  const systemIndex = agents.findIndex((agent) => agent.id === SYSTEM_AGENT_ID);
  if (systemIndex === -1) agents.unshift(createSystemAgent(mainThreadId));
  else agents[systemIndex] = { ...agents[systemIndex], system: true, threadId: mainThreadId };
  const requestedCurrent = stringValue(record.currentAgentId);
  const currentAgentId = agents.some((agent) => agent.id === requestedCurrent)
    ? requestedCurrent
    : SYSTEM_AGENT_ID;
  return {
    version: 1,
    currentAgentId,
    agents,
    skillLibrary,
    preferences: normalizePreferences(record.preferences),
    onboardingDone: record.onboardingDone === true,
    onboardingStep: Math.max(0, Math.min(4, Math.trunc(Number(record.onboardingStep) || 0))),
  };
}

/**
 * The server response is authoritative. In particular, `null` means this is a
 * first-time account and must not inherit Agent data cached by anyone else.
 */
export function resolveRemoteAgentSpace(remote: unknown, mainThreadId: string): AgentSpaceState {
  return remote
    ? normalizeAgentSpace(remote, mainThreadId)
    : normalizeAgentSpace(undefined, mainThreadId);
}

export function agentSpaceRemoteSettled(
  remote: AgentSpaceRemoteLoad | undefined,
  storageKey: string,
  request: number,
) {
  return remote?.storageKey === storageKey && remote.request === request;
}

export function agentSpaceCanPersist(
  remote: AgentSpaceRemoteLoad | undefined,
  storageKey: string,
  request: number,
) {
  return remote?.writable === true && agentSpaceRemoteSettled(remote, storageKey, request);
}

export function nextThreadId() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createAgentFromTemplate(
  template: Exclude<AgentTemplateId, "general">,
  options: {
    id?: string;
    threadId?: string;
    name?: string;
    role?: string;
    persona?: string;
    avatar?: AgentAvatarId;
    tone?: AgentTone;
    communication?: AgentCommunication;
    instructions?: string;
    /** 内部能力键，与模板预置合并（如从市场导入时复制发布方的技能）。 */
    skills?: string[];
    /** 从技能目录安装到该 Agent 的技能 id（如从市场导入时预置目录技能）。 */
    installedSkills?: string[];
    /** 自建技能完整快照（如从市场导入时复制发布方的自建技能内容）。 */
    customSkills?: AgentSkill[];
    /** 预置分配给该智能体的连接器引用 id（账户级资产，仅存 id 引用）。 */
    installedConnectors?: string[];
    now?: string;
  } = {},
): AgentDefinition {
  const preset = AGENT_TEMPLATES[template];
  const now = options.now ?? new Date().toISOString();
  const agent: AgentDefinition = {
    id: options.id ?? nextThreadId(),
    threadId: options.threadId ?? nextThreadId(),
    template,
    name: (options.name ?? preset.name).trim().slice(0, 20) || preset.name,
    role: (options.role ?? preset.role).trim().slice(0, 30) || preset.role,
    persona: (options.persona ?? preset.persona).trim().slice(0, 1000) || preset.persona,
    avatar: options.avatar ?? preset.avatar,
    tone: options.tone ?? DEFAULT_AGENT_TONE,
    communication: options.communication ?? DEFAULT_AGENT_COMMUNICATION,
    instructions: options.instructions?.slice(0, 4000) ?? "",
    system: false,
    threadExists: false,
    createdAt: now,
    // 导入的技能键与模板预置去重合并，上限与服务端 skills（≤30）一致。
    skills: [...new Set([...preset.skills, ...(options.skills ?? [])])].slice(0, 30),
    // 从技能目录安装的技能 id（导入时预置），上限与服务端 installedSkills（≤60）一致。
    installedSkills: [...new Set(options.installedSkills ?? [])].slice(0, 60),
    skillRefs: [],
    // 自建技能快照（导入时复制发布方内容）；服务端 agentSchema 上限 60，与市场记录对齐。
    customSkills: [...(options.customSkills ?? [])].slice(0, 60),
  };
  // 连接器引用在导入时才会有值；空时不产出多余字段（幂等归一化不会多出 key）。
  const installedConnectors = [...new Set(options.installedConnectors ?? [])].slice(0, 20);
  if (installedConnectors.length) agent.installedConnectors = installedConnectors;
  return agent;
}

export function createCustomSkill(
  input: Pick<AgentSkill, "name" | "purpose" | "instructions" | "outputFormat">,
  existing?: AgentSkill,
  now = new Date().toISOString(),
): AgentSkill {
  return {
    id: existing?.id ?? nextThreadId(),
    name: input.name.trim().slice(0, 40),
    purpose: input.purpose.trim().slice(0, 120),
    instructions: input.instructions.trim().slice(0, 4000),
    outputFormat: input.outputFormat.trim().slice(0, 800),
    enabled: existing?.enabled ?? true,
    version: existing ? existing.version + 1 : 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/** 账户级技能库的记录上限，与服务端 `agentSpaceSchema.skillLibrary`（≤200）保持一致。 */
const SKILL_LIBRARY_MAX = 200;

/**
 * 从智能体市场导入时，把发布方公开的自建技能快照复制成导入用户技能库里的独立记录。
 *
 * - 内容四项（名称/用途/工作提示词/输出格式）与 `enabled` 和发布方快照完全一致，
 *   保证功能配置、参数定义、执行逻辑原样沿用；
 * - 记录使用**全新 id 与当前时间戳**（version 从 1 重新起算），与创建者的技能彻底隔离，
 *   导入后在「我的技能」里是一条独立的记录，可独立编辑 / 删除 / 管理；
 * - 技能库里已有同内容记录时复用其 id（与 linkCopiedSkills / normalizeSkillLibrary 的
 *   内容指纹去重口径一致），重复导入同一智能体不会在技能库里堆出重复记录；
 * - 技能库已满（≥200，与服务端上限一致）时不再新增记录，避免整次保存被 422 拒绝；
 *   未新增的记录不进入 refs，绝不挂悬空的引用。
 *
 * @param copies 发布方公开的自建技能快照（market 记录 customSkills，服务端已限 ≤60）
 * @param library 导入用户当前的账户级技能库
 * @returns 复制后（或复用后）的技能库，以及应按原顺序挂到导入 Agent 上的 `skillRefs`
 */
export function copySkillsIntoLibrary(
  copies: readonly AgentSkill[],
  library: readonly AgentSkill[],
  now = new Date().toISOString(),
): { skillLibrary: AgentSkill[]; refs: string[] } {
  const next = [...library];
  const refs: string[] = [];
  for (const copy of copies) {
    const key = skillContentKey(copy);
    const match = next.find((skill) => skillContentKey(skill) === key);
    if (match) {
      refs.push(match.id);
      continue;
    }
    if (next.length >= SKILL_LIBRARY_MAX) continue;
    const record: AgentSkill = {
      id: nextThreadId(),
      name: copy.name.slice(0, 40),
      purpose: copy.purpose.slice(0, 120),
      instructions: copy.instructions.slice(0, 4000),
      outputFormat: copy.outputFormat.slice(0, 800),
      enabled: copy.enabled !== false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    next.push(record);
    refs.push(record.id);
  }
  return { skillLibrary: next, refs };
}

/**
 * Installation lives on the server. A browser cache may draft the rest of the
 * agent, but it must not present catalog skills or library references as installed.
 */
export function draftAgentSpace(state: AgentSpaceState): AgentSpaceState {
  return {
    ...state,
    agents: state.agents.map((agent) => ({
      ...agent,
      installedSkills: [],
      skillRefs: [],
      customSkills: [],
    })),
  };
}

/** Install or remove a catalog skill on one agent. The id is stored, not a copy of the file. */
export function setCatalogSkillInstalled(
  state: AgentSpaceState,
  agentId: string,
  skillId: string,
  installed: boolean,
): AgentSpaceState {
  const id = skillId.trim();
  if (!id) return state;
  const target = state.agents.find((agent) => agent.id === agentId);
  if (!target || target.installedSkills.includes(id) === installed) return state;
  return {
    ...state,
    agents: state.agents.map((agent) => {
      if (agent.id !== agentId) return agent;
      const installedSkills = installed
        ? [...agent.installedSkills, id].slice(0, 60)
        : agent.installedSkills.filter((candidate) => candidate !== id);
      return { ...agent, installedSkills };
    }),
  };
}

/** Link or unlink a library skill by id. Matching leftover copies are removed, not kept as the install. */
export function setLibrarySkillRef(
  state: AgentSpaceState,
  agentId: string,
  skillId: string,
  linked: boolean,
): AgentSpaceState {
  const id = skillId.trim();
  if (!id) return state;
  const target = state.agents.find((agent) => agent.id === agentId);
  if (!target) return state;
  const librarySkill = state.skillLibrary.find((skill) => skill.id === id);
  const refs = new Set(target.skillRefs);
  if (linked) refs.add(id);
  else refs.delete(id);
  const customSkills = librarySkill
    ? target.customSkills.filter(
        (skill) =>
          skill.id !== id &&
          [skill.name, skill.purpose, skill.instructions, skill.outputFormat].join("\u0000") !==
            [
              librarySkill.name,
              librarySkill.purpose,
              librarySkill.instructions,
              librarySkill.outputFormat,
            ].join("\u0000"),
      )
    : target.customSkills.filter((skill) => skill.id !== id);
  if (
    refs.size === target.skillRefs.length &&
    [...refs].every((item) => target.skillRefs.includes(item)) &&
    customSkills.length === target.customSkills.length
  ) {
    return state;
  }
  return {
    ...state,
    agents: state.agents.map((agent) =>
      agent.id === agentId ? { ...agent, skillRefs: [...refs].slice(0, 60), customSkills } : agent,
    ),
  };
}

export type SkillEdit =
  | { kind: "catalog"; agentId: string; skillId: string; installed: boolean }
  | { kind: "ref"; agentId: string; skillId: string; linked: boolean };

/** The latest edit for each agent and skill wins. */
export function collapseSkillEdits(edits: readonly SkillEdit[]): SkillEdit[] {
  const kept: SkillEdit[] = [];
  for (const edit of edits) {
    const index = kept.findIndex(
      (item) =>
        item.kind === edit.kind && item.agentId === edit.agentId && item.skillId === edit.skillId,
    );
    if (index >= 0) kept.splice(index, 1);
    kept.push(edit);
  }
  return kept;
}

export function applySkillEdits(
  state: AgentSpaceState,
  edits: readonly SkillEdit[],
): AgentSpaceState {
  return edits.reduce((current, edit) => {
    if (edit.kind === "catalog") {
      return setCatalogSkillInstalled(current, edit.agentId, edit.skillId, edit.installed);
    }
    return setLibrarySkillRef(current, edit.agentId, edit.skillId, edit.linked);
  }, state);
}

/**
 * 把某个 Agent 上的自建技能副本摘掉，**完全不碰账户级技能库**。
 *
 * 语义就是 Agent 详情技能卡片的「移除」：这个 Agent 不再具备该能力，
 * 但「应用与能力 → 我的技能」里的原件仍然在，随时可以再「添加到智能体」。
 * 目标 Agent 没有这份副本时原样返回，避免无意义的状态更新与重渲染。
 */
export function detachSkillFromAgent(
  state: AgentSpaceState,
  agentId: string,
  skillId: string,
): AgentSpaceState {
  const target = state.agents.find((agent) => agent.id === agentId);
  const hasCopy = target?.customSkills.some((skill) => skill.id === skillId) ?? false;
  const hasRef = target?.skillRefs.includes(skillId) ?? false;
  if (!target || (!hasCopy && !hasRef)) return state;
  return {
    ...state,
    agents: state.agents.map((agent) =>
      agent.id === agentId
        ? {
            ...agent,
            customSkills: agent.customSkills.filter((skill) => skill.id !== skillId),
            skillRefs: agent.skillRefs.filter((id) => id !== skillId),
          }
        : agent,
    ),
  };
}

export function onboardingSummary(preferences: AgentUserPreferences) {
  const focus = [...preferences.markets, ...preferences.areas].filter(Boolean).join("、");
  return {
    name: preferences.name || "朋友",
    risk: preferences.risk || "还不确定",
    focus: focus || "不限市场",
    goal: preferences.goal || "先学习，再做判断",
    horizon: preferences.horizon,
  };
}

/**
 * Converts only the answers explicitly supplied during onboarding into model
 * context. Empty optional answers stay empty instead of becoming inferred facts.
 */
export function onboardingPreferenceContext(preferences: AgentUserPreferences) {
  const facts = [
    `preferred name: ${preferences.name || "Friend"}`,
    `self-described investment style: ${preferences.risk || "not provided"}`,
    `markets and focus areas: ${
      [...preferences.markets, ...preferences.areas].filter(Boolean).join(", ") || "not restricted"
    }`,
    `stated goal: ${preferences.goal || "not provided"}`,
  ];
  if (preferences.horizon) facts.push(`stated time horizon: ${preferences.horizon}`);
  return facts.join("; ");
}
