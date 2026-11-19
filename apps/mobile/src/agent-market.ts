/**
 * 智能体市场数据源。
 *
 * 市场归集两类智能体：
 * - 项目方内置的公开智能体（`BUILTIN_MARKET_AGENTS`，官方示例）；
 * - 用户自己公开的智能体（即 `AgentDefinition.public === true` 的用户自建 Agent）。
 *
 * 内置智能体以「可导入卡片」的形式展示，导入时按内容克隆成用户自己的 Agent
 * （复用 `createAgentFromTemplate` 的 custom 模板 + 复制 persona/role/name）。
 */
import type { AgentAvatarId, AgentDefinition } from "./agent-space-model";

/** 市场里一个内置公开智能体的静态描述。 */
export interface BuiltinMarketAgent {
  id: string;
  name: string;
  role: string;
  persona: string;
  avatar: AgentAvatarId;
  /** 面向市场的简介，展示在卡片上。 */
  detail: string;
  /** 能力标签（与 Agent 的 skills 语义一致，仅用于卡片展示）。 */
  tags: string[];
}

/**
 * 项目方内置的公开智能体示例。
 * 语义上与 `AGENT_TEMPLATES` 保持呼应（行情 / 研究 / 财报 / 宏观 / 风控），
 * 但作为「官方市场智能体」独立存在，导入时不会创建出与模板相同的预设 Agent。
 */
export const BUILTIN_MARKET_AGENTS: readonly BuiltinMarketAgent[] = [
  {
    id: "market:research",
    name: "深度研究员",
    role: "研究分析",
    persona:
      "从商业模式、竞争格局与估值三个维度拆解标的，结论必须带来源与可核验的数据，不确定的地方直接说明。",
    detail: "拆解商业模式与竞争格局，输出带来源的标的研究结论。",
    tags: ["研究", "财报", "搜索"],
    avatar: "orb",
  },
  {
    id: "market:macro",
    name: "宏观研判师",
    role: "宏观分析",
    persona:
      "关注利率、汇率与大宗商品的传导机制，先讲机制再讲结论，不用宏观叙事替代对具体标的的判断。",
    detail: "跟踪利率、汇率与大宗商品，把宏观变化落到具体标的上。",
    tags: ["宏观", "简报", "研究"],
    avatar: "bloom",
  },
  {
    id: "market:earnings",
    name: "财报解读者",
    role: "财报分析",
    persona: "读财报和业绩会，先看这一季有没有兑现上一季的指引，再判断变化是结构性还是季节性。",
    detail: "提取关键指标与同比变化，标记值得追问的异常项。",
    tags: ["财报", "研究"],
    avatar: "cat",
  },
  {
    id: "market:risk",
    name: "风控官",
    role: "风险管理",
    persona: "先想下跌时会发生什么。盯集中度、回撤和相关性，宁可保守也不给虚假的安全感。",
    detail: "盯集中度、回撤与相关性，给出保守且可执行的风控建议。",
    tags: ["风控", "组合"],
    avatar: "moon",
  },
  {
    id: "market:portfolio",
    name: "组合观察员",
    role: "组合配置",
    persona: "关注手工组合的配置、风险与复盘，保留币种差异，不把模拟曲线当成账户实际收益。",
    detail: "检查持仓集中度、盈亏变化与配置风险，做组合诊断。",
    tags: ["组合", "风控", "复盘"],
    avatar: "planet",
  },
];

/** 市场卡片展示所需的统一形态：内置智能体与用户公开智能体共用。 */
export interface MarketAgentEntry {
  key: string;
  /** 是否项目方内置（内置可导入，用户自己的可打开详情/撤回公开）。 */
  builtin: boolean;
  builtinId?: string;
  agent?: AgentDefinition;
  name: string;
  role: string;
  persona: string;
  detail: string;
  avatar: AgentAvatarId;
  tags: string[];
  /** 来源标签：@灵悟（内置）或 @用户公开。 */
  source: string;
}

/** 把内置智能体转成市场卡片条目。 */
export function builtinMarketEntries(sourceLabel: string): MarketAgentEntry[] {
  return BUILTIN_MARKET_AGENTS.map((item) => ({
    key: `builtin:${item.id}`,
    builtin: true,
    builtinId: item.id,
    name: item.name,
    role: item.role,
    persona: item.persona,
    detail: item.detail,
    avatar: item.avatar,
    tags: [...item.tags],
    source: sourceLabel,
  }));
}

/** 把用户公开的智能体转成市场卡片条目。 */
export function userMarketEntries(
  agents: readonly AgentDefinition[],
  sourceLabel: string,
): MarketAgentEntry[] {
  return agents
    .filter((agent) => !agent.system && agent.public === true)
    .map((agent) => ({
      key: `user:${agent.id}`,
      builtin: false,
      agent,
      name: agent.name,
      role: agent.role,
      persona: agent.persona,
      detail: agent.persona || agent.role,
      avatar: agent.avatar,
      tags: [...agent.skills].slice(0, 3),
      source: sourceLabel,
    }));
}
