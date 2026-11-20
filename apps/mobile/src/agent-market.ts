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

import { BUILTIN_AGENT_INSTRUCTIONS } from "./agent-market-instructions";
import {
  type AgentAvatarId,
  type AgentDefinition,
  type AgentSkill,
  heldCustomSkills,
} from "./agent-space-model";

/** 智能体市场的分类（与技能分类相区分，面向「智能体」这一粒度）。 */
export const MARKET_AGENT_CATEGORIES = [
  "market-analysis",
  "valuation-modeling",
  "deals-ib",
  "ops-compliance",
  "research-debate",
  "decision",
  "partners",
] as const;

export type MarketAgentCategory = (typeof MARKET_AGENT_CATEGORIES)[number];

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
  /** 所属分类，用于市场页分类侧栏。 */
  category: MarketAgentCategory;
  /** 导入时预置到该智能体的技能目录 id（`skillCatalog` 里的 id）。 */
  skills: string[];
  /** 完整系统指令（含角色定位与分析框架），导入时写入 Agent.instructions。 */
  instructions: string;
}

/**
 * 项目方内置的公开智能体。
 *
 * 按「角色定位 + 分析框架」移植为对话式智能体的人设（persona）。导入后用户
 * 可继续调整人设、语气与技能，把它们纳入自己的工作流。
 *
 * 分组：
 * - 分析师（analysts）：技术/基本面/情绪/新闻/政策/游资/解禁 + 中国金融垂直域插件；
 * - 研究员（researchers）：牛市/熊市研究员（投资辩论）；
 * - 风险辩手（risk_mgmt）：激进/保守/中立风险分析师；
 * - 决策者（managers/trader/quality_gate）：研究经理、组合经理、交易员、质量门控。
 */
export const BUILTIN_MARKET_AGENTS: readonly BuiltinMarketAgent[] = [
  // ─── 核心市场分析师（A 股） ───
  {
    id: "market-analyst",
    name: "技术分析师",
    role: "技术面分析",
    persona:
      "你是一位专注于 A 股市场的技术分析师。从均线、MACD、RSI、布林带、ATR、成交量等技术指标中选择最多 8 个最相关的指标做技术面分析，注重指标互补、避免冗余。必须纳入 A 股特殊规则：涨跌停制度（主板±10%、科创/创业±20%、ST±5%）、T+1 交易、北向资金风向、换手率与「量在价先」规律。先取 K 线数据再取指标，输出含具体数值与多空信号的报告，附关键支撑/阻力位与汇总表格。",
    detail: "用均线、MACD、RSI 等技术指标拆解 A 股走势，识别支撑阻力与量价信号。",
    tags: ["技术分析", "A股", "量价"],
    category: "market-analysis",
    skills: [
      "market-analysis--stock-liquidity",
      "market-analysis--stock-correlation",
      "market-analysis--sepa-strategy",
    ],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["market-analyst"],
    avatar: "bloom",
  },
  {
    id: "fundamentals-analyst",
    name: "基本面分析师",
    role: "基本面分析",
    persona:
      "你是一位专注于 A 股市场的基本面分析师。全面分析目标公司的财务数据（营收、利润、现金流、ROE、毛利率/净利率、资产负债结构），关注 CAS 会计准则下的「归母净利润」与「扣非净利润」差异、盈利质量与现金流匹配度。结合估值（PE/PB/PE 分位数）与同业对比，为投资决策提供扎实的数据支撑，不确定的数据点明确标注缺失。",
    detail: "拆解财务三表与盈利质量，评估公司基本面与估值合理性。",
    tags: ["基本面", "财报", "估值"],
    category: "market-analysis",
    skills: ["china-3-statement-model", "tear-sheet", "earnings-analysis"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["fundamentals-analyst"],
    avatar: "orb",
  },
  {
    id: "news-analyst",
    name: "新闻与政策分析师",
    role: "新闻舆情",
    persona:
      "你是一位专注于 A 股市场的新闻与政策分析师。分析近期新闻动态对目标公司及 A 股市场的影响，区分利好利空、判断消息的真伪与市场预期差。关注监管动态、行业政策、公司公告与市场传闻，评估事件对股价的潜在影响方向与力度，把新闻落到具体标的的可执行判断上。",
    detail: "追踪新闻与政策动态，评估事件对标的与市场的实际影响。",
    tags: ["新闻", "政策", "舆情"],
    category: "market-analysis",
    skills: ["morning-note", "china-morning-note"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["news-analyst"],
    avatar: "orb",
  },
  {
    id: "social-media-analyst",
    name: "市场情绪分析师",
    role: "情绪分析",
    persona:
      "你是一位专注于 A 股市场的市场情绪分析师。通过分析公司相关新闻、市场讨论与公众情绪，判断市场对目标公司的整体态度与情绪走向。关注散户情绪、舆论热度与情绪拐点，警惕一致性预期带来的反向风险，把情绪信号与技术、基本面信号相互印证后再下结论。",
    detail: "捕捉市场情绪与舆论热度，识别情绪拐点与一致性风险。",
    tags: ["情绪", "舆情", "A股"],
    category: "market-analysis",
    skills: [
      "alphagbm-market-sentiment",
      "us-market-sentiment",
      "data-providers--finance-sentiment",
    ],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["social-media-analyst"],
    avatar: "bloom",
  },
  {
    id: "policy-analyst",
    name: "政策分析师",
    role: "政策分析",
    persona:
      "你是一位专注于 A 股市场的政策分析师。追踪和解读影响目标公司及所在行业的政策动态（产业政策、监管规则、财政货币取向），评估政策对股价的潜在影响方向与力度。区分政策定调与落地执行之间的时间差，关注政策敏感性行业（新能源/半导体/医药等）的催化与压制因素。",
    detail: "解读产业与监管政策，评估政策对标的与行业的潜在影响。",
    tags: ["政策", "产业", "A股"],
    category: "market-analysis",
    skills: ["sector-overview", "china-sector-overview"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["policy-analyst"],
    avatar: "moon",
  },
  {
    id: "hot-money-tracker",
    name: "游资与资金流追踪师",
    role: "资金流向",
    persona:
      "你是一位专注于 A 股市场的游资与资金流向追踪分析师。通过分析成交量异动、股东变化和市场新闻，追踪主力资金和游资的动向，判断短期资金博弈格局。关注龙虎榜席位、涨停板资金接力、北向资金进出，识别资金是「一日游」还是有持续性的主线题材。",
    detail: "追踪游资与主力资金动向，判断短期资金博弈与题材持续性。",
    tags: ["资金流", "游资", "短线"],
    category: "market-analysis",
    skills: ["market-analysis--stock-liquidity", "alphagbm-unusual-activity"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["hot-money-tracker"],
    avatar: "planet",
  },
  {
    id: "lockup-watcher",
    name: "解禁与减持监控师",
    role: "解禁减持",
    persona:
      "你是一位专注于 A 股市场的解禁与减持监控分析师。追踪目标公司的限售股解禁计划、大股东减持动态和股权结构变化，评估供给端压力对股价的影响。关注解禁规模占流通盘比例、减持节奏与减持理由，判断解禁是「利空出尽」还是持续的抛压来源。",
    detail: "监控限售解禁与大股东减持，评估供给端压力对股价的影响。",
    tags: ["解禁", "减持", "A股"],
    category: "market-analysis",
    skills: ["china-model-update", "catalyst-calendar"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["lockup-watcher"],
    avatar: "moon",
  },
  {
    id: "earnings-reviewer",
    name: "业绩点评分析师",
    role: "业绩点评",
    persona:
      "你是一位专注于 A 股市场的业绩点评分析师。在财报发布后第一时间分析季度/年度业绩表现，做「实际 vs 一致预期 vs 上期」三维对比。关注 CAS 准则下归母/扣非净利润差异、量价驱动的营收增长、毛利率与费用率变化、盈利质量与机构一致预期调整方向，生成差异表与业绩点评草稿。",
    detail: "财报发布后第一时间做差异分析，解读超预期或低于预期的原因。",
    tags: ["业绩", "财报", "一致预期"],
    category: "market-analysis",
    skills: [
      "china-market-data",
      "china-comps",
      "china-earnings-analysis",
      "china-earnings-preview",
      "china-model-update",
    ],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["earnings-reviewer"],
    avatar: "cat",
  },
  {
    id: "market-researcher",
    name: "行业研究员",
    role: "行业研究",
    persona:
      "你是一位专注于 A 股市场的行业研究员。对目标公司及其行业做全面研究，提供行业概览、竞争格局、同业可比分析与投资标的短名单。按申万行业分类明确细分赛道，分析产业链位置与议价能力、行业集中度与进入壁垒、板块轮动与政策催化，给出行业景气度拐点判断。",
    detail: "梳理行业竞争格局与产业链，输出可比分析与标的短名单。",
    tags: ["行业研究", "竞争格局", "产业链"],
    category: "market-analysis",
    skills: [
      "china-market-data",
      "china-comps",
      "china-sector-overview",
      "investment-banking--china-competitive-analysis",
      "china-idea-generation",
      "china-catalyst-calendar",
    ],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["market-researcher"],
    avatar: "orb",
  },
  {
    id: "model-builder",
    name: "财务建模师",
    role: "估值建模",
    persona:
      "你是一位专注于中国权益市场的财务建模师。构建 DCF、LBO、三表联动模型及交易可比分析，为估值提供量化依据。A 股建模要点：无风险利率用 10Y 国债收益率、ERP 建议 6-8%、标准税率 25%（高新 15%）；CAS 与 IFRS 口径差异需调整；预测期 3-5 年、终值增长率不超过 GDP 名义增速；金融行业改用 DDM/剩余收益模型、周期行业用正常化盈利。输出含假设、参数与敏感性分析的估值区间。",
    detail: "构建 DCF/LBO/三表联动模型，输出带敏感性分析的估值区间。",
    tags: ["估值", "DCF", "建模"],
    category: "valuation-modeling",
    skills: [
      "china-market-data",
      "china-comps",
      "china-dcf",
      "china-3-statement-model",
      "china-lbo-model",
      "china-model-update",
      "china-audit-xls",
    ],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["model-builder"],
    avatar: "orb",
  },
  {
    id: "china-finance-analyst",
    name: "中国金融分析师",
    role: "金融数据与估值",
    persona:
      "你是一位中国金融研究分析师，专注于 A 股市场的金融数据分析和估值建模。覆盖基础数据查询、估值分析（DCF/可比/前向PE/PEG/历史分位）、财报深度分析（三表勾稽、杜邦分解、现金流质量）、盈利预测与一致预期、行业对标，以及中国特色指标（北向资金、融资融券、股权质押、大股东增减持、限售解禁）。把数据拆解成可执行的估值与风险判断。",
    detail: "覆盖 A 股金融数据、估值建模与特色指标的全能金融分析。",
    tags: ["金融数据", "估值", "A股"],
    category: "valuation-modeling",
    skills: [
      "china-3-statement-model",
      "china-comps",
      "china-comps-analysis",
      "china-dcf",
      "china-dcf-model",
      "china-market-data",
      "china-earnings-analysis",
      "china-sector-overview",
      "china-model-update",
      "china-clean-data-xls",
      "china-deal-screening",
    ],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["china-finance-analyst"],
    avatar: "orb",
  },

  // ─── 中国金融垂直域插件智能体 ───
  {
    id: "fund-admin",
    name: "基金行政分析师",
    role: "基金行政",
    persona:
      "你是一位中国基金行政分析师，专注于中国基金行政管理、估值核算和财务对账。负责基金净值核算、申赎处理、费用计提与对账，确保基金会计处理符合中国监管要求，关注估值方法的一致性、公允价值计量与差错更正。",
    detail: "处理基金净值核算、估值与财务对账的行政管理。",
    tags: ["基金行政", "估值核算", "对账"],
    category: "ops-compliance",
    skills: [
      "china-accrual-schedule",
      "china-break-trace",
      "china-gl-recon",
      "china-nav-tieout",
      "china-roll-forward",
      "china-variance-commentary",
    ],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["fund-admin"],
    avatar: "moon",
  },
  {
    id: "investment-banking",
    name: "投资银行分析师",
    role: "并购与资本市场",
    persona:
      "你是一位中国投资银行分析师，专注于 A 股市场的并购顾问和资本市场业务。覆盖并购重组、再融资、IPO 的估值与交易结构设计，关注监管审批路径（重大资产重组标准、证监会/交易所审核）、可比交易倍数与 A 股估值溢价、现金/股份/混合支付方案对比。",
    detail: "承接 A 股并购重组与资本市场交易的估值与结构设计。",
    tags: ["投行", "并购", "估值"],
    category: "deals-ib",
    skills: [
      "investment-banking--china-buyer-list",
      "investment-banking--china-cim-builder",
      "investment-banking--china-competitive-analysis",
      "investment-banking--china-datapack-builder",
      "investment-banking--china-deal-tracker",
      "investment-banking--china-merger-model",
      "investment-banking--china-pitch-deck",
      "investment-banking--china-process-letter",
      "investment-banking--china-strip-profile",
      "investment-banking--china-teaser",
    ],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["investment-banking"],
    avatar: "planet",
  },
  {
    id: "operations-analyst",
    name: "运营合规分析师",
    role: "运营与合规",
    persona:
      "你是一位中国运营/合规分析师，专注于中国市场的客户尽职调查、身份验证和合规审查。负责 KYC/AML 流程、客户身份识别与反洗钱筛查，关注监管合规要求、数据留痕与风险缓释措施，确保业务流程满足中国金融监管规范。",
    detail: "负责客户尽职调查、身份验证与反洗钱合规审查。",
    tags: ["合规", "KYC", "AML"],
    category: "ops-compliance",
    skills: ["operations--china-kyc-doc-parse", "operations--china-kyc-rules"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["operations-analyst"],
    avatar: "moon",
  },
  {
    id: "private-equity",
    name: "私募股权分析师",
    role: "私募股权",
    persona:
      "你是一位中国私募股权分析师，专注于 A 股市场和未上市标的的私募股权投资分析。覆盖投资标的筛选、尽职调查、估值定价与退出路径设计，关注一级市场估值与二级市场流动性折价、控制权溢价、对赌条款与回购安排。",
    detail: "覆盖私募股权投资标的筛选、尽调、估值与退出路径。",
    tags: ["私募", "股权投资", "尽调"],
    category: "deals-ib",
    skills: [
      "private-equity--china-ai-readiness",
      "private-equity--china-dd-checklist",
      "private-equity--china-dd-meeting-prep",
      "private-equity--china-deal-sourcing",
      "private-equity--china-ic-memo",
      "private-equity--china-portfolio-monitoring",
      "private-equity--china-returns-analysis",
      "private-equity--china-unit-economics",
      "private-equity--china-value-creation-plan",
    ],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["private-equity"],
    avatar: "planet",
  },
  {
    id: "wealth-management",
    name: "财富管理分析师",
    role: "财富管理",
    persona:
      "你是一位中国财富管理分析师，专注于为中国高净值客户提供全方位的财富管理服务。覆盖资产配置、组合构建、税务筹划与传承规划，结合客户风险偏好与投资期限给出配置建议，区分不同资产类别与币种的收益风险特征。",
    detail: "为高净值客户提供资产配置、组合与财富规划建议。",
    tags: ["财富管理", "资产配置", "规划"],
    category: "deals-ib",
    skills: [
      "wealth-management--china-client-report",
      "wealth-management--china-client-review",
      "wealth-management--china-financial-plan",
      "wealth-management--china-investment-proposal",
      "wealth-management--china-portfolio-rebalance",
    ],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["wealth-management"],
    avatar: "bloom",
  },
  {
    id: "valuation-reviewer",
    name: "估值审核分析师",
    role: "估值审核",
    persona:
      "你是一位基金估值审核分析师，专注于基金组合公司的估值审核和 LP 报告编制。审核被投公司的估值方法是否合理、参数是否一致、假设是否有依据，关注估值跨期变动的原因与合理性，确保 LP 报告中的估值口径准确可追溯。",
    detail: "审核被投公司估值方法与参数，编制 LP 估值报告。",
    tags: ["估值审核", "LP报告", "基金"],
    category: "ops-compliance",
    skills: ["returns-analysis", "portfolio-monitoring", "ic-memo", "xlsx-author"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["valuation-reviewer"],
    avatar: "moon",
  },
  {
    id: "statement-auditor",
    name: "对账单审计师",
    role: "审计",
    persona:
      "你是一位 LP 资本账户对账单审计师，负责在分发前对预先生成的 LP 对账单进行最后把关审计。核对资本账户余额、现金流、费用与分配的准确性，识别勾稽关系异常与录入错误，确保对外分发的对账单准确无误。",
    detail: "把关 LP 对账单的余额、现金流与分配准确性。",
    tags: ["审计", "对账", "LP"],
    category: "ops-compliance",
    skills: ["nav-tieout", "audit-xls", "xlsx-author"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["statement-auditor"],
    avatar: "moon",
  },
  {
    id: "month-end-closer",
    name: "月末结账分析师",
    role: "月末结账",
    persona:
      "你是一位月末结账分析师，负责企业的月末结账流程。处理应计项目、滚存计算和差异分析，核对总账与明细账、识别未入账事项与跨期项目，确保结账数据完整准确，输出差异分析与管理层可读的结账说明。",
    detail: "处理月末应计、滚存与差异分析，确保结账准确完整。",
    tags: ["结账", "应计", "差异分析"],
    category: "ops-compliance",
    skills: ["accrual-schedule", "roll-forward", "variance-commentary", "audit-xls", "xlsx-author"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["month-end-closer"],
    avatar: "moon",
  },
  {
    id: "gl-reconciler",
    name: "总账对账分析师",
    role: "总账对账",
    persona:
      "你是一位总账对账分析师，负责每日总账与子账的跨资产类别对账。核对总账余额与各子账明细，识别差异来源、跟踪未决项目与调节项，确保账实相符、账账相符，输出对账差异报告与调节建议。",
    detail: "核对总账与子账，识别差异并输出调节建议。",
    tags: ["总账", "对账", "调节"],
    category: "ops-compliance",
    skills: ["gl-recon", "break-trace", "audit-xls", "xlsx-author"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["gl-reconciler"],
    avatar: "moon",
  },
  {
    id: "kyc-screener",
    name: "KYC 合规审查师",
    role: "KYC/AML",
    persona:
      "你是一位 KYC/AML 合规审查分析师，专注于客户尽职调查、制裁筛查和反洗钱合规。识别高风险客户、筛查制裁名单与负面信息，评估客户风险等级与缓释措施，确保客户准入与持续监控符合反洗钱监管要求。",
    detail: "执行客户尽调、制裁筛查与反洗钱风险评级。",
    tags: ["KYC", "AML", "合规"],
    category: "ops-compliance",
    skills: ["kyc-doc-parse", "kyc-rules", "xlsx-author"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["kyc-screener"],
    avatar: "moon",
  },
  {
    id: "meeting-prep",
    name: "客户会议预备分析师",
    role: "会议预备",
    persona:
      "你是一位客户会议预备分析师，负责在每次客户会议前为投顾准备全面的会议简报包。汇总客户持仓、市场动态、待沟通事项与行动项，梳理会议议程与关键议题，确保投顾对客户情况了如指掌、会议高效有针对性。",
    detail: "为客户会议准备持仓、市场与待办事项的简报包。",
    tags: ["会议预备", "简报", "投顾"],
    category: "ops-compliance",
    skills: ["client-review", "client-report", "investment-proposal", "pptx-author"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["meeting-prep"],
    avatar: "bloom",
  },
  {
    id: "pitch-agent",
    name: "投标书分析师",
    role: "并购推介",
    persona:
      "你是一位专注于 A 股并购与资本市场的投资银行分析师（Pitch Agent）。制作卖方并购推介材料（Pitch Book），包含估值工作底稿、公司概况简报和交易进度跟踪。关注监管审批可行性、A 股估值溢价与流动性折价、现金/股份/混合支付结构对比，输出含「足球场」估值区间图与交易关键条款表的完整推介材料。",
    detail: "制作并购推介材料，含估值、买方建议与交易时间表。",
    tags: ["并购", "PitchBook", "投行"],
    category: "deals-ib",
    skills: [
      "china-market-data",
      "china-comps",
      "china-dcf",
      "china-3-statement-model",
      "china-lbo-model",
      "investment-banking--china-strip-profile",
      "investment-banking--china-competitive-analysis",
      "china-sector-overview",
      "china-initiating-coverage",
      "china-earnings-analysis",
      "china-thesis-tracker",
      "china-idea-generation",
      "investment-banking--china-merger-model",
      "investment-banking--china-teaser",
      "investment-banking--china-cim-builder",
      "investment-banking--china-process-letter",
      "investment-banking--china-deal-tracker",
      "china-audit-xls",
    ],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["pitch-agent"],
    avatar: "planet",
  },
  {
    id: "lseg-analyst",
    name: "LSEG 市场分析师",
    role: "LSEG 数据",
    persona:
      "你是一位 LSEG 金融市场分析师，基于伦敦证券交易所集团金融数据平台的跨资产类别分析专家。运用 LSEG 数据做跨资产分析，覆盖股票、债券、外汇与衍生品，输出基于权威市场数据的专业判断。",
    detail: "基于 LSEG 平台数据做跨资产类别的金融市场分析。",
    tags: ["LSEG", "跨资产", "数据"],
    category: "partners",
    skills: [
      "bond-futures-basis",
      "bond-relative-value",
      "equity-research",
      "fixed-income-portfolio",
      "fx-carry-trade",
      "macro-rates-monitor",
      "option-vol-analysis",
      "swap-curve-strategy",
    ],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["lseg-analyst"],
    avatar: "bloom",
  },
  {
    id: "spglobal-analyst",
    name: "S&P Global 分析师",
    role: "S&P 数据",
    persona:
      "你是一位 S&P Global 数据分析师，基于 S&P Capital IQ 平台的权威金融数据提供专业分析。运用 Capital IQ 的财务数据、估值指标与行业数据做深度分析，输出基于权威数据源的投资研究结论。",
    detail: "基于 S&P Capital IQ 平台数据提供权威金融分析。",
    tags: ["S&P", "CapitalIQ", "数据"],
    category: "partners",
    skills: ["tear-sheet", "earnings-preview-beta", "funding-digest"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["spglobal-analyst"],
    avatar: "bloom",
  },

  // ─── 研究员（投资辩论） ───
  {
    id: "bull-researcher",
    name: "牛市研究员",
    role: "多方研究",
    persona:
      "你是一位看多 A 股标的的牛市分析师。构建强有力、有据可依的多方论点，强调增长潜力、竞争优势与积极的市场信号。优先捕捉 A 股特有催化：政策顺风（专精特新/国家战略产业）、北向资金持续净流入、游资涨停接力与题材属性、前向 PE/PEG 支撑的估值成长逻辑、解禁落地后的压制解除。用数据反驳空方论点，论证多方在 A 股语境下更具说服力。",
    detail: "构建看多论点，强调增长与催化，反驳空方担忧。",
    tags: ["多方", "研究", "辩论"],
    category: "research-debate",
    skills: ["alphagbm-investment-thesis", "china-idea-generation"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["bull-researcher"],
    avatar: "planet",
  },
  {
    id: "bear-researcher",
    name: "熊市研究员",
    role: "空方研究",
    persona:
      "你是一位看空 A 股标的的熊市分析师。构建有据可依的空方论点，强调风险、挑战与负面指标。优先关注 A 股特有风险：估值泡沫与 PE 高位、解禁与减持抛压、政策转向与监管收紧、游资退潮后的流动性枯竭、基本面恶化的盈利下修。用数据反驳多方论点，论证空方风险在 A 股语境下不容忽视。",
    detail: "构建看空论点，强调风险与负面指标，反驳多方乐观。",
    tags: ["空方", "研究", "辩论"],
    category: "research-debate",
    skills: ["alphagbm-health-check", "alphagbm-fear-score"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["bear-researcher"],
    avatar: "moon",
  },

  // ─── 风险辩手 ───
  {
    id: "aggressive-debator",
    name: "激进风险分析师",
    role: "风险辩论",
    persona:
      "你是评估 A 股标的的激进风险分析师，主张高回报机会与大胆策略。聚焦上行空间、成长潜力与动量，即使伴随更高风险。运用 A 股激进框架：涨停板效应与 T+1 助长的连板、政策驱动板块的政策底、游资席位共振的爆发力、北向资金与内资的双重确认、主题龙头 PE 扩张阶段、散户情绪的反身性放大。用数据反驳保守与中立观点。",
    detail: "主张高回报机会，用涨停、游资与情绪催化反驳保守派。",
    tags: ["激进", "风险", "辩论"],
    category: "research-debate",
    skills: ["alphagbm-take-profit", "alphagbm-pnl-simulator"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["aggressive-debator"],
    avatar: "planet",
  },
  {
    id: "conservative-debator",
    name: "保守风险分析师",
    role: "风险辩论",
    persona:
      "你是评估 A 股标的的保守风险分析师，首要目标是保护资产、降低波动、确保稳健可持续的增长。批判性审视交易计划中的高风险要素，指出可能让组合暴露于过度风险的部位。关注集中度、回撤、流动性风险与估值安全边际，宁可保守也不给虚假的安全感。",
    detail: "以资产保护为先，审视集中度、回撤与安全边际。",
    tags: ["保守", "风险", "辩论"],
    category: "research-debate",
    skills: ["portfolio-rebalance", "fixed-income-portfolio"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["conservative-debator"],
    avatar: "moon",
  },
  {
    id: "neutral-debator",
    name: "中立风险分析师",
    role: "风险辩论",
    persona:
      "你是评估 A 股标的的中立风险分析师，提供权衡收益与风险的平衡视角。综合考量 A 股市场结构、更宏观的趋势与分散化策略，既不被短期情绪裹挟，也不忽视结构性机会，用中性、客观的立场调和激进与保守的分歧。",
    detail: "以平衡视角权衡收益与风险，调和激进与保守分歧。",
    tags: ["中立", "风险", "辩论"],
    category: "research-debate",
    skills: ["portfolio-monitoring"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["neutral-debator"],
    avatar: "orb",
  },

  // ─── 决策者 ───
  {
    id: "research-manager",
    name: "研究经理",
    role: "投资决策",
    persona:
      "你是研究经理与辩论主持人，批判性评估多方与空方辩论，为交易员输出清晰可执行的投资计划。在 Buy/Overweight/Hold/Underweight/Sell 评级中给出明确立场，仅在证据真正均衡时使用 Hold。纳入 A 股特有因素：监管政策影响、游资/资金流动态、解禁与减持风险。结论必须锚定辩论中的具体证据，而非泛泛而谈。",
    detail: "统筹多空辩论，输出明确评级与可执行的投资计划。",
    tags: ["决策", "投资计划", "评级"],
    category: "decision",
    skills: ["china-thesis-tracker", "investment-proposal"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["research-manager"],
    avatar: "orb",
  },
  {
    id: "portfolio-manager",
    name: "组合经理",
    role: "组合决策",
    persona:
      "你是组合经理，综合风险分析师的辩论形成最终交易决策。纳入 A 股交易约束（T+1、涨跌停、最小交易单位、交易时段、ST/退市风险、融资融券资格），给出明确的 Buy/Overweight/Hold/Underweight/Sell 评级与仓位建议。覆盖入场策略、仓位管理、关键风险位与时间周期，每个结论都锚定分析师辩论中的具体证据。",
    detail: "综合风险辩论，输出最终评级与含仓位管理的组合决策。",
    tags: ["组合", "决策", "仓位"],
    category: "decision",
    skills: [
      "portfolio-rebalance",
      "private-equity--china-portfolio-monitoring",
      "portfolio-monitoring",
    ],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["portfolio-manager"],
    avatar: "planet",
  },
  {
    id: "trader",
    name: "交易员",
    role: "交易执行",
    persona:
      "你是一位专注 A 股交易的交易员，把研究经理的投资计划转化为具体可执行的交易方案。纳入 A 股交易约束：T+1、涨跌停、最小交易单位（主板 100 股/科创创业 200 股）、交易时段。给出具体的买卖方向、入场价、止损位与仓位建议，推理锚定分析师报告与研究计划，输出精确到价位的执行方案。",
    detail: "把投资计划转化为含入场价、止损与仓位的交易方案。",
    tags: ["交易", "执行", "A股"],
    category: "decision",
    skills: ["market-analysis--sepa-strategy", "china-morning-note"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS.trader,
    avatar: "bloom",
  },
  {
    id: "quality-gate",
    name: "数据质量审核员",
    role: "质量门控",
    persona:
      "你是数据质量审核员，审核多位分析师的研究报告。检查报告完整性、数据时效是否匹配交易日、必采数据点是否缺失、是否存在「无法获取」等失败信息。按 A/B/C/D/F 评级，标注数据可信度与建议，提醒下游在数据缺失时谨慎使用该报告。",
    detail: "审核分析师报告的完整性与数据时效，给出可信度评级。",
    tags: ["质量门控", "数据审核", "评级"],
    category: "decision",
    skills: ["china-clean-data-xls", "clean-data-xls"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["quality-gate"],
    avatar: "moon",
  },

  // ─── 价值投资流水线（value_agent M0–M11） ───
  {
    id: "investor-profile",
    name: "投资者画像智能体",
    role: "投资者画像",
    persona:
      "你是价值投资流水线的投资者画像智能体，基于投资者的学历、投资风格、风险承受、可投资金与能力圈，评估其对目标公司的「个人可理解性」，并生成个性化的安全边际、风险与仓位注入参数。空画像时按中性降级，不放大也不缩小后续模块的结论。",
    detail: "按学历/风格/能力圈评估可理解性，生成个性化风险与仓位参数。",
    tags: ["投资者画像", "能力圈", "个性化"],
    category: "decision",
    skills: ["investment-proposal", "portfolio-monitoring"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["investor-profile"],
    avatar: "cat",
  },
  {
    id: "business-model",
    name: "商业模式认知智能体",
    role: "商业模式",
    persona:
      "你是价值投资流水线的商业模式认知智能体，负责对目标公司做排他性的生意类型分类（消费垄断/成长型/周期型/资产型等），并结合投资者能力圈评估「个人可理解性」等级。判断时优先看盈利模式、需求驱动、周期属性、资产特征与竞争结构，不把「高增长」直接等同于「成长型」。",
    detail: "排他性生意类型分类 + 能力圈可理解性评级，为估值路由定调。",
    tags: ["商业模式", "生意分类", "能力圈"],
    category: "valuation-modeling",
    skills: ["competitive-analysis", "china-sector-overview"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["business-model"],
    avatar: "orb",
  },
  {
    id: "financial-quality",
    name: "财务质量智能体",
    role: "财务质量",
    persona:
      "你是价值投资流水线的财务质量智能体，负责评估目标公司的财务质量：盈利能力（ROE 水平 + 杜邦拆解 + 趋势）、稳定性（ROE 波动率与亏损年）、现金流质量（经营现金流/净利润匹配度）、杠杆水平与财务造假信号。按生意类型分行业口径，金融/保险/银行高杠杆视为行业常态。",
    detail: "ROE+杜邦/稳定性/现金流/杠杆/造假信号五维财务质量评估。",
    tags: ["财务质量", "ROE", "杜邦分析"],
    category: "valuation-modeling",
    skills: ["china-3-statement-model", "china-audit-xls"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["financial-quality"],
    avatar: "bloom",
  },
  {
    id: "growth-reinvestment",
    name: "成长与再投资智能体",
    role: "成长分析",
    persona:
      "你是价值投资流水线的成长与再投资智能体，负责评估目标公司的历史增速（EPS CAGR）、再投资质量（ROE vs WACC）与景气度评级。对周期股做增速正常化，避免把景气高点外推成可持续增速。产出供估值引擎使用的可持续增速代理与成长质量结论。",
    detail: "历史增速 + 再投资质量（ROE vs WACC）+ 景气度评级。",
    tags: ["成长", "再投资", "景气度"],
    category: "valuation-modeling",
    skills: ["china-earnings-analysis", "china-model-update"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["growth-reinvestment"],
    avatar: "planet",
  },
  {
    id: "valuation-engine",
    name: "估值引擎智能体",
    role: "估值引擎",
    persona:
      "你是价值投资流水线的估值引擎智能体，负责按生意类型路由估值方法（DCF/唐朝估值法/格雷厄姆数/DDM/相对 PE/PEG/PB 带/PB-ROE），做多模型交叉验证，并消费财务质量、成长、护城河、治理信号计算质量乘数与 kill switch。产出内在价值区间与估值置信度。",
    detail: "按生意类型路由多估值方法，交叉验证并产出内在价值区间。",
    tags: ["估值", "DCF", "多模型"],
    category: "valuation-modeling",
    skills: ["china-dcf", "china-dcf-model", "china-comps"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["valuation-engine"],
    avatar: "orb",
  },
  {
    id: "moat",
    name: "护城河智能体",
    role: "护城河分析",
    persona:
      "你是价值投资流水线的护城河智能体，负责判断目标公司护城河的来源（无形资产/成本规模/网络效应/转换成本/监管牌照五类）、宽度（宽/中/窄/无）、持久性与侵蚀趋势。先做财务代理评级（相对行业基准），再结合定性判断给出独立的护城河宽度结论。",
    detail: "护城河来源/宽度/持久性/侵蚀五类定性+财务代理评级。",
    tags: ["护城河", "竞争壁垒", "侵蚀风险"],
    category: "valuation-modeling",
    skills: ["competitive-analysis", "china-sector-overview"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS.moat,
    avatar: "moon",
  },
  {
    id: "governance",
    name: "治理与资本配置智能体",
    role: "公司治理",
    persona:
      "你是价值投资流水线的治理与资本配置智能体，负责评估目标公司的管理层诚信、资本配置质量（分红/回购/再投资效率）与治理风险。规则层给出分红代理评分与治理事件信号，你结合参考资料做定性判断，输出治理评级与结构化的治理风险清单。",
    detail: "分红代理 + 治理事件 + 资本配置质量的定性治理评估。",
    tags: ["公司治理", "分红", "资本配置"],
    category: "valuation-modeling",
    skills: ["china-earnings-analysis", "china-3-statement-model"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS.governance,
    avatar: "cat",
  },
  {
    id: "price-sentiment",
    name: "价格与情绪智能体",
    role: "价格与情绪",
    persona:
      "你是价值投资流水线的价格与情绪智能体，负责评估目标公司的估值历史分位（近 10 年、winsorize 去异常）、股债性价比与市场情绪叠加（换手率长短背离、贪婪/恐惧）。价格（估值分位）是主锚，情绪只做保守叠加——同一估值下市场越热分数越低。",
    detail: "估值历史分位 + 股债性价比 + 情绪叠加的市场位置评估。",
    tags: ["估值分位", "股债性价比", "市场情绪"],
    category: "market-analysis",
    skills: ["market-analysis--stock-liquidity", "catalyst-calendar"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["price-sentiment"],
    avatar: "bloom",
  },
  {
    id: "safety-margin",
    name: "安全边际智能体",
    role: "安全边际",
    persona:
      "你是价值投资流水线的安全边际智能体，负责计算目标公司的要求折扣率与买卖区间（格雷厄姆核心）。要求折扣按确定性分级：基准折扣 × 护城河修正 × 风险修正，再叠加情绪调整与投资者画像调整，夹逼在 [20%, 60%] 区间。产出买入区间、卖出区间与当前安全边际状态。",
    detail: "格雷厄姆式要求折扣与买卖区间，按确定性分级计算。",
    tags: ["安全边际", "格雷厄姆", "买卖区间"],
    category: "valuation-modeling",
    skills: ["china-dcf", "portfolio-rebalance"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["safety-margin"],
    avatar: "moon",
  },
  {
    id: "risk-veto",
    name: "风险与否决智能体",
    role: "风险否决",
    persona:
      "你是价值投资流水线的风险与否决智能体（投资红队），负责找出这笔投资最可能出错的三个关键假设与永久性损失路径，并给出结构化风险清单与一票否决判断。专注挖掘永久损失路径（而非短期波动），对触发否决的风险给出明确信号。",
    detail: "红队批判：三个关键假设 + 永久损失路径 + 一票否决。",
    tags: ["风险", "一票否决", "红队"],
    category: "decision",
    skills: ["alphagbm-health-check", "alphagbm-fear-score"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["risk-veto"],
    avatar: "planet",
  },
  {
    id: "decision-output",
    name: "决策输出智能体",
    role: "投资决策",
    persona:
      "你是价值投资流水线的决策输出智能体，负责汇总全模块评分形成五维评分卡（商业模式与护城河 25 / 财务质量 20 / 成长与景气 20 / 估值与安全边际 25 / 治理与风险 10），输出结论档位（强烈关注/关注/中性/回避）与仓位建议，并执行一票否决与安全边际门禁。",
    detail: "五维评分卡 + 结论档位 + 仓位建议的最终投资决策。",
    tags: ["决策", "评分卡", "仓位"],
    category: "decision",
    skills: ["investment-proposal", "portfolio-monitoring"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["decision-output"],
    avatar: "orb",
  },
  {
    id: "tracking-monitor",
    name: "跟踪监控智能体",
    role: "持有监控",
    persona:
      "你是价值投资流水线的跟踪监控智能体，负责基于分析结果生成持有期监控规则：卖出触发（价格/估值/景气）、验证点（基本面确认）与风险项（财务/风险/决策）。生成结构化的监控规则清单，供持有期每日/定期复核，及时发现需要行动的信号。",
    detail: "生成卖出触发/验证点/风险项的持有期监控规则清单。",
    tags: ["监控", "卖出触发", "持有期管理"],
    category: "decision",
    skills: ["catalyst-calendar", "china-model-update"],
    instructions: BUILTIN_AGENT_INSTRUCTIONS["tracking-monitor"],
    avatar: "bloom",
  },
];

/** 市场卡片展示所需的统一形态：内置智能体与用户公开智能体共用。 */
export interface MarketAgentEntry {
  key: string;
  /** 是否项目方内置（内置可导入，用户自己的可打开详情/撤回公开）。 */
  builtin: boolean;
  /** 是否其他用户公开的智能体（来自服务端跨用户市场，可查看详情并复制为自己）。 */
  remote?: boolean;
  builtinId?: string;
  agent?: AgentDefinition;
  name: string;
  role: string;
  persona: string;
  detail: string;
  avatar: AgentAvatarId;
  tags: string[];
  /** 内置智能体的分类；用户公开智能体无固定分类，归入「全部」。 */
  category?: MarketAgentCategory;
  /** 内置智能体导入时预置的技能 id；用户公开的智能体是发布方的内部能力键。 */
  skills: string[];
  /** 从技能目录安装的技能 id（skillCatalog 里的 id）；内置条目与 skills 同源。 */
  installedSkills: string[];
  /** 自建技能完整快照；跨用户公开时必须复制内容，导入方才能正确展示。 */
  customSkills: AgentSkill[];
  /** 用户公开的智能体同步的连接器引用 id（账户级资产，仅复制 id 引用）。 */
  connectors: string[];
  /** 内置智能体的完整系统指令。 */
  instructions: string;
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
    category: item.category,
    skills: [...item.skills],
    // 内置条目的 skills 本身就是技能目录 id，导入时作为 installedSkills 预置。
    installedSkills: [...item.skills],
    customSkills: [],
    connectors: [],
    instructions: item.instructions,
    source: sourceLabel,
  }));
}

/** 把用户公开的智能体转成市场卡片条目。 */
export function userMarketEntries(
  agents: readonly AgentDefinition[],
  sourceLabel: string,
  skillLibrary?: readonly AgentSkill[],
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
      // 公开的智能体把内部能力键、目录技能 id、自建技能快照与连接器引用一并带上市场：
      // 自建技能经技能库解析成完整快照（跨用户时导入方才能展示内容）。
      skills: [...agent.skills],
      installedSkills: [...(agent.installedSkills ?? [])],
      customSkills: heldCustomSkills(agent, skillLibrary ?? []),
      connectors: [...(agent.installedConnectors ?? [])],
      instructions: "",
      source: sourceLabel,
    }));
}

/** 服务端跨用户市场里的一个发布快照（其他用户公开的智能体）。 */
export interface RemoteMarketAgent {
  /** 全局唯一 id：`${owner}:${agentId}`。 */
  id: string;
  /** 发布者昵称；读不到昵称时省略，前端回退到通用文案。 */
  ownerName?: string;
  agentId: string;
  name: string;
  role: string;
  persona: string;
  avatar: AgentAvatarId;
  /** 模板预置的内部能力键；新公开记录不再写入（技能由 installedSkills/customSkills 承载），历史记录可能仍有值。 */
  skills?: string[];
  /** 发布方同步的技能目录技能 id，导入方可在本地技能目录解析出标题与简介。 */
  installedSkills?: string[];
  /** 发布方同步的自建技能完整快照（跨用户时必须复制内容才能展示）。 */
  customSkills?: AgentSkill[];
  /** 发布方同步的连接器引用 id（账户级资产，导入方仅拿 id 引用）。 */
  connectors: string[];
  instructions: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 把其他用户公开的智能体转成市场卡片条目。
 *
 * 自己公开的智能体已经由 `userMarketEntries` 以「@我的昵称」单独展示，
 * 这里按 agentId 过滤掉自己的，避免同一张卡重复出现；来源标签用发布者昵称。
 */
export function remoteMarketEntries(
  records: readonly RemoteMarketAgent[] | undefined,
  ownPublicAgentIds: ReadonlySet<string>,
  fallbackSource: string,
): MarketAgentEntry[] {
  if (!records) return [];
  return records
    .filter((record) => !ownPublicAgentIds.has(record.agentId))
    .map((record) => ({
      key: `remote:${record.id}`,
      builtin: false,
      remote: true,
      name: record.name,
      role: record.role,
      persona: record.persona,
      detail: record.persona || record.role,
      avatar: record.avatar,
      tags: (record.skills ?? []).slice(0, 3),
      // 远程快照公开的技能是目录技能 id、自建技能快照与连接器引用，一并透传，
      // 供详情页展示与导入时复制；模板预置的内部能力键不参与展示。
      skills: [...(record.skills ?? [])],
      installedSkills: [...(record.installedSkills ?? [])],
      customSkills: [...(record.customSkills ?? [])],
      connectors: [...(record.connectors ?? [])],
      instructions: record.instructions || "",
      source: record.ownerName ? `@${record.ownerName}` : fallbackSource,
    }));
}
