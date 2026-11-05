/**
 * Client-side Agent workspace model.
 *
 * The existing server stores conversations and user-level resources. This model
 * supplies the missing multi-Agent layer without pretending that unsupported
 * Agent-scoped server data already exists: each Agent owns a stable thread id and
 * its presentation/skills, while user-level resources remain global.
 */

export type AgentTemplateId = "general" | "market" | "asset" | "custom";
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
  /** True once the server has created or already knows this thread. */
  threadExists: boolean;
  createdAt: string;
  skills: string[];
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
    persona: "关注手工组合的配置、风险与复盘。保留币种差异，不把模拟曲线当成账户实际收益。",
    avatar: "planet",
    skills: ["portfolio", "risk", "goals", "notes", "files", "memory", "finance", "reminder"],
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
  reminder: { zh: "盯盘与提醒", en: "Alerts" },
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
const TEMPLATES: readonly AgentTemplateId[] = ["general", "market", "asset", "custom"];

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
    customSkills: Array.isArray(value.customSkills)
      ? value.customSkills
          .map(normalizeSkill)
          .filter((skill): skill is AgentSkill => Boolean(skill))
      : [],
  };
  // 没有专属模型时不写字段：键不存在才等于「跟随默认模型」，也让持久化前后保持一致。
  const model = normalizeAgentModel(value.model);
  if (model) agent.model = model;
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
    now?: string;
  } = {},
): AgentDefinition {
  const preset = AGENT_TEMPLATES[template];
  const now = options.now ?? new Date().toISOString();
  return {
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
    skills: [...preset.skills],
    customSkills: [],
  };
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
