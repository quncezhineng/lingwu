/**
 * LingWu 技能目录。
 *
 * 由迁移至 `skills` 的 184 个 SKILL.md frontmatter 生成。
 * 技能文件随项目保存；运行时不执行第三方技能脚本。
 * 中英文名称与简介均来自各技能的本地元数据。
 */
export const skillCategories = [
  "market-macro",
  "company-fundamentals",
  "valuation-modeling",
  "portfolio-trading",
  "deals-private-capital",
  "wealth-risk",
  "research-tools",
] as const;

export type SkillCategory = (typeof skillCategories)[number];

export type SkillCatalogEntry = {
  id: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  categories: readonly SkillCategory[];
  sourceFolder: string;
};

export const skillCatalog: readonly SkillCatalogEntry[] = [
  {
    id: "3-statement-model",
    titleZh: "三表财务模型",
    titleEn: "3 Statement Model",
    descriptionZh:
      "完成并填充三表财务模型模板（利润表、资产负债表、现金流量表）。当需要填充模型模板、完善现有模型框架、将数据填入财务模型、完成部分填写的IS/BS/CF框架，或在现有模板结构中链接集成财务报表时使用。触发词包括填充、完善三表模型模板。",
    descriptionEn:
      "Complete, populate and fill out 3-statement financial model templates (Income Statement, Balance Sheet, Cash Flow Statement) . Use when asked to fill out model templates, complete existing model frameworks, populate financial models with data, complete a partially filled IS/BS/CF framework, or link integrated financial statements within an existing template structure. Triggers include requests to fill in, complete, or populate a 3-statement model template",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/3-statement-model",
  },
  {
    id: "accrual-schedule",
    titleZh: "应计费用日程表",
    titleEn: "Accrual Schedule",
    descriptionZh:
      "构建期末应计费用日程表——为每项应计费用计算金额、引用支撑文件并起草日记账分录。用于月末结账；日记账分录为待财务主管审批的草稿，非正式过账。",
    descriptionEn:
      "Build the period-end accrual schedule — for each accrual, compute the entry, cite the support, and draft the JE. Use during month-end close; the JE is a draft for controller approval, not a posting.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/accrual-schedule",
  },
  {
    id: "ai-readiness",
    titleZh: "AI就绪度扫描",
    titleEn: "AI Readiness",
    descriptionZh:
      "扫描投资组合中最高杠杆的AI机会，并对部署运营合伙人时间进行优先级排序。接收多家被投公司的季度更新和财务数据，识别每家公司中的快速获胜机会，并将其汇总为单一排序的行动清单。用于季度投资组合审查、年度规划或决定哪些公司优先获得AI投资时。",
    descriptionEn:
      'Scan the portfolio for the highest-leverage AI opportunities and rank where to deploy operating-partner time. Ingests quarterly updates and financials across multiple portfolio companies, identifies quick wins at each, and stacks them into a single ranked action list. Use during quarterly portfolio reviews, annual planning, or when deciding which companies get AI investment first. Triggers on "AI readiness", "AI opportunity scan", "where should we deploy AI", "AI across the portfolio", "AI quick wins", or "which portcos are ready for AI".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/ai-readiness",
  },
  {
    id: "alphagbm-alert",
    titleZh: "AlphaGBM 警报",
    titleEn: "AlphaGBM Alert",
    descriptionZh:
      '设置基于价格、IV 或活动的智能预警并附带上下文通知。预警类型包括 IV 排名阈值穿越、价格支撑/阻力突破、异常活动检测、财报临近提醒以及 VRP 信号变化。支持一次性（触发后自动删除）和循环预警。\n触发词："当 AAPL IV 排名超过 80 时提醒我"、"NVDA 跌破 850 时通知我"、"TSLA 财报预警"、"VRP 预警"、"设置价格预警"、"IV 飙升时预警"、"异常活动通知"、"我的预警"、"删除预警"',
    descriptionEn:
      'Set price, IV, or activity-based alerts with contextual notifications.\nAlert types include IV rank threshold crossing, price support/resistance breaks,\nunusual activity detection, earnings approaching, and VRP signal changes.\nTriggers: "alert me when AAPL IV rank above 80", "notify if NVDA drops below 850",\n"earnings alert for TSLA", "VRP alert", "set price alert",\n"alert when IV spikes", "notify on unusual activity", "my alerts", "delete alert"',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-alert",
  },
  {
    id: "alphagbm-bps-backtest",
    titleZh: "AlphaGBM BPS回测",
    titleEn: "AlphaGBM BPS Backtest",
    descriptionZh:
      "对约 8 年的日线历史数据完成完整的向前滚动牛市看跌期权价差回测。同一请求下同时运行带信号（恐慌分数≥60入场）版本与无信号对照组，方便你量化评估在你设定的参数下，该恐慌入场规则是否能为此标的带来超额收益。输出内容包含权益曲线、四项关键绩效指标（年化收益率/胜率/最大回撤/夏普比率）、交易台账，以及通俗易懂的分析结论。",
    descriptionEn:
      "Full walk-forward Bull Put Spread backtest over ~8 years of daily history. Runs both the signal (FearScore ≥ 60 entry) version AND a no-signal control in the same request, so you can quantify whether the fear-entry rule actually delivers alpha for this ticker under your parameters. Returns equity curve, 4 KPIs (annualized return / win rate / max drawdown / Sharpe), trade ledger, and a plain-language takeaway.",
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-bps-backtest",
  },
  {
    id: "alphagbm-buffett-analysis",
    titleZh: "AlphaGBM 巴菲特式分析",
    titleEn: "AlphaGBM Buffett Analysis",
    descriptionZh:
      "基于沃伦·巴菲特视角的任意股票代码评分表。从4个维度打分，每个维度分值区间0‑100分（业务/能力圈、护城河/持久竞争优势、管理层/资本配置、估值/合理价格对比10年期国债），并输出加权综合判定结果：可持有、可观察、规避。这并非通用基本面筛选工具，而是机械套用巴菲特专属分析框架：行业简易度、毛利率+净资产收益率+利润率阈值、自由现金流收益率对比国债、以分红持续性作为管理层的代理评判指标。\n触发指令：“Buffett analysis AAPL”、“score KO with Buffett lens”、“would Buffett buy MSFT”、“JNJ Buffett scorecard”、“AAPL moat analysis”、“fair price vs bonds”、“Buffett‑style verdict on NVDA”、“long‑term hold analysis”",
    descriptionEn:
      'Warren Buffett-lens scorecard for any ticker. Scores 4 dimensions 0-100 each\n(business / circle of competence, moat / durable advantage, management / capital\nallocation, valuation / fair price vs 10Y treasury) and returns a weighted\noverall HOLDABLE / WATCHABLE / AVOID verdict. This is NOT a generic fundamental\nscreener — it\'s Buffett\'s specific framework mechanically applied: sector\nsimplicity, gross margin + ROE + profit margin thresholds, FCF yield vs treasury,\nand dividend-continuity as management proxy.\nTriggers: "Buffett analysis AAPL", "score KO with Buffett lens", "would Buffett\nbuy MSFT", "JNJ Buffett scorecard", "AAPL moat analysis", "fair price vs bonds",\n"Buffett-style verdict on NVDA", "long-term hold analysis"',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/alphagbm-buffett-analysis",
  },
  {
    id: "alphagbm-chokepoint",
    titleZh: "AlphaGBM 瓶颈识别",
    titleEn: "AlphaGBM Chokepoint",
    descriptionZh:
      'Serenity 风格的"瓶颈理论"应用于 AI 供应链。识别物理上不可替代的瓶颈供应商——埋藏在 4-7 层深处的小市值近乎垄断型公司——当需求超过供给时，其产能瓶颈会引发剧烈的价格重估。使用五因子评分模型（集中度、不可替代性、准入壁垒、发现滞后、需求紧张度）来筛选和排名候选标的。这是 AlphaGBM 对 Serenity (@aleabitoreddit) 公开分享方法论的独立解读——与 Serenity 不相关也不受其认可。\n触发词："瓶颈分析"、"AI 供应链瓶颈"、"找到紫苏叶"、"Serenity 风格筛选"、"哪些小市值公司掌控了瓶颈"、"InP 衬底机会"、"共封装光学瓶颈"、"AI 建设中不可替代的供应商"、"供应链集中度风险"',
    descriptionEn:
      'Serenity-style "Chokepoint Theory" applied to AI supply chains. Identifies\nphysically irreplaceable bottleneck suppliers — small-cap near-monopolies\nburied 4–7 layers deep — whose capacity constraints force violent repricing\nwhen demand outgrows supply. Uses a 5-factor scoring model (Concentration,\nIrreplaceability, Qualification Gate, Discovery Gap, Demand Tension) to\nscreen and rank candidates. This is AlphaGBM\'s independent reading of\nSerenity (@aleabitoreddit)\'s publicly shared methodology — NOT affiliated\nwith or endorsed by Serenity.\nTriggers: "chokepoint analysis", "AI supply chain bottleneck", "find the\nshiso leaf", "Serenity-style screen", "which small-caps own the bottleneck",\n"InP substrate play", "co-packaged optics chokepoint", "irreplaceable\nsupplier in AI buildout", "supply chain concentration risk"',
    categories: ["market-macro"],
    sourceFolder: "skills/alphagbm-chokepoint",
  },
  {
    id: "alphagbm-company-profile",
    titleZh: "AlphaGBM 公司概况",
    titleEn: "AlphaGBM Company Profile",
    descriptionZh:
      '在 AlphaGBM 上创建和维护公司研究档案——基于基本面、PE/PB 区间历史、财务红旗和事件雷达自动生成。每个档案是一个用户+标的记录，系统会定期自动刷新。使用场景：创建需要跟踪的公司列表、调取已保存的研究文件、刷新档案中的市场数据、或查看 PE/PB 区间。 触发词："添加 AAPL 到我的知识库"、"显示我的 NVDA 档案"、"刷新我的 TSLA 档案"、"列出我跟踪的公司"、"META PE 区间"、"我的投研库里有什么"、"创建公司档案"、"我的投研档案"',
    descriptionEn:
      'Build and maintain company research profiles on AlphaGBM — auto-generated from fundamentals, PE/PB Band history, financial red flags, and event radar. Each profile is one user+ticker record that the system refreshes on schedule. Use when: creating a watchlist of companies to track, pulling up a saved research file, refreshing a profile\'s market data, or checking PE/PB bands. Triggers on: "add AAPL to my knowledge base", "show my profile for NVDA", "refresh my TSLA profile", "list my tracked companies", "PE band for META", "what\'s in my research brain", "创建公司档案", "我的投研档案".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/alphagbm-company-profile",
  },
  {
    id: "alphagbm-compare",
    titleZh: "AlphaGBM 多标对比",
    titleEn: "AlphaGBM Compare",
    descriptionZh:
      '对 2-5 只股票或期权进行逐项并排对比，覆盖 GBM 五大支柱评分、期权指标、技术面和估值。按类别标识胜出者。\n触发词："对比 AAPL vs MSFT"、"NVDA 还是 AMD"、"TSLA 和 META 哪个期权更便宜"、"科技股对比"、"并排对比"、"vs"、"哪个更好"、"对比期权"、"最低 IV"、"最佳价值股"',
    descriptionEn:
      'Side-by-side comparison of 2-5 stocks or options across GBM Five Pillars scores,\noptions metrics, technicals, and valuations. Identifies the winner by category.\nTriggers: "compare AAPL vs MSFT", "NVDA or AMD", "which is cheaper TSLA or META options",\n"tech stock comparison", "side by side", "versus", "which is better",\n"compare options", "cheapest IV", "best value stock"',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/alphagbm-compare",
  },
  {
    id: "alphagbm-duan-analysis",
    titleZh: "AlphaGBM 段氏分析",
    titleEn: "AlphaGBM Duan Analysis",
    descriptionZh:
      '为任意标的生成的段永平风格卖方操作手册：在你"愿意买入"的价位 Sell Put、Covered Call 增强收益、以及基于当前 VIX 的恐慌买入背景判断。响应是三张聚焦的分析卡片——而非通用的期权筛选器——源自段永平在中国散户投资圈中著名的专属框架（仅做卖方、收租逻辑、永不做期权买方）。\n触发词："段永平风格 AAPL"、"sell put NVDA 愿意在 120 买入"、"covered call 收益 TSLA"、"我应该在这里 sell AAPL put 吗"、"卖方策略 MSFT"、"段氏分析"、"收权利金策略"、"段氏卖方操作手册"',
    descriptionEn:
      'Duan-Yongping-style seller playbook for any ticker: Sell Put at your "willing buy"\nprice, Covered Call for yield enhancement, and a Panic-Buy context read off\ncurrent VIX. The response is three tightly-scoped analysis cards — not a generic\noptions screener — derived from the specific framework that made Duan Yongping\nfamous in Chinese retail investing (seller-only, rent-collection logic, never\na buyer of options).\nTriggers: "Duan Yongping style AAPL", "sell put NVDA willing to buy at 120",\n"covered call yield TSLA", "should I sell AAPL put here", "seller strategy MSFT",\n"Duan-style analysis", "premium collection setup", "nationalist seller playbook"',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-duan-analysis",
  },
  {
    id: "alphagbm-earnings-crush",
    titleZh: "AlphaGBM 财报碾压",
    titleEn: "AlphaGBM Earnings Crush",
    descriptionZh:
      '全面的财报季 IV 分析：历史 IV crush 数据、隐含波动预测、IV 排名策略标签，以及一张已定价可直接交易的 Iron Condor 报价。\n触发词："earnings crush AAPL"、"NVDA 财报前 IV"、"MSFT 隐含波动"、"META Iron Condor"、"AAPL 财报 IV 排名"、"TSLA 财报策略"、"AMZN 财报前是否应该卖期权"、"财报后 IV 下跌"、"财报前跨式策略"、"财报前策略"',
    descriptionEn:
      'Full earnings-season IV analysis: historical crush, implied move forecast, IV Rank\nstrategy tag, and a priced Iron Condor quote ready to trade. Triggers: "earnings\ncrush AAPL", "NVDA IV before earnings", "implied move MSFT", "iron condor for META",\n"IV rank AAPL earnings", "earnings play TSLA", "should I short premium before AMZN\nearnings", "post-earnings IV drop", "straddle before earnings", "pre-earnings strategy"',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-earnings-crush",
  },
  {
    id: "alphagbm-fear-score",
    titleZh: "AlphaGBM 恐惧评分",
    titleEn: "AlphaGBM Fear Score",
    descriptionZh:
      '为每个标的计算恐慌指数（0-100），权重来自六个真实信号：VIX、IV 排名、RSI-14、期权成交量异常、Put/Call 比率和连续下跌天数。评分 ≥ 60 触发 Bull Put Spread 入场信号。基于 FearDesk 方法论设计；在信号触发时做 BPS 回测年化收益率约 10.8%，对比无条件入场约 3.5%。\n触发词："恐惧评分 QQQ"、"NVDA 是否超卖"、"恐慌指数 SPY"、"BPS 信号 TSLA"、"现在是恐惧时间吗"、"BPS 入场时机"、"什么时候卖 put"、"AAPL 是否恐慌"、"逆向入场信号"、"超卖读数"、"VIX 加 RSI"',
    descriptionEn:
      'Per-ticker panic index (0-100) that weights six real signals: VIX, IV Rank, RSI-14,\noptions volume anomaly, Put/Call ratio, and consecutive-down days. Scores ≥ 60\ntrigger a Bull Put Spread entry signal. Based on the FearDesk methodology; tested\nat ~10.8% annualized ROC for BPS entries on signal vs ~3.5% unconditional.\nTriggers: "fear score QQQ", "is NVDA oversold", "panic index SPY", "BPS signal\nTSLA", "is it fear time", "BPS entry timing", "when to sell put", "is AAPL panic",\n"contrarian entry signal", "oversold reading", "VIX plus RSI"',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-fear-score",
  },
  {
    id: "alphagbm-greeks",
    titleZh: "AlphaGBM 希腊值分析",
    titleEn: "AlphaGBM Greeks",
    descriptionZh:
      '为任意期权合约或多腿组合提供希腊值仪表板。涵盖一阶希腊值（Delta、Gamma、Theta、Vega、Rho）和二阶希腊值（Charm、Vanna、Volga）。返回单个合约和组合级别的希腊值，附带情景热力图。使用场景：检查期权敏感度、管理持仓风险、理解 Theta 衰减、分析 Gamma 敞口、对冲投资组合。 触发词："AAPL 220 call 希腊值"、"组合希腊值"、"Theta 衰减分析"、"NVDA Gamma 敞口"、"我持仓的 Delta"、"SPY 跨式 Vega 风险"',
    descriptionEn:
      'Greeks dashboard for any option contract or multi-leg position. Covers first-order Greeks (Delta, Gamma, Theta, Vega, Rho) and second-order Greeks (Charm, Vanna, Volga). Returns individual and position-level Greeks with scenario heatmaps. Use when: checking option sensitivities, managing position risk, understanding theta decay, analyzing gamma exposure, hedging a portfolio. Triggers on: "Greeks for AAPL 220 call", "position Greeks", "theta decay analysis", "gamma exposure NVDA", "delta of my position", "vega risk SPY straddle".',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-greeks",
  },
  {
    id: "alphagbm-health-check",
    titleZh: "AlphaGBM 持仓体检",
    titleEn: "AlphaGBM Health Check",
    descriptionZh:
      '针对用户研究知识库的每周诊断报告——标记过期档案（数周未更新）、论据偏离（AI 检测到原始前提已不再成立）以及孤立页面（有档案无论据、有主题但缺少档案）。返回总体 0-100 健康评分及具体行动建议。使用场景：审计知识库状态、触发新报告、查看需要关注的内容。 触发词："运行一次健康检查"、"我的研究报告需要刷新吗"、"知识库审计"、"生成知识库报告"、"发现过期内容"、"论据偏离检测"、"研究库体检"、"过期档案"、"论据偏离"、"孤立主题"',
    descriptionEn:
      'Weekly diagnostic report on a user\'s research knowledge base — flags stale profiles (not updated in weeks), thesis drift (AI detects original premise no longer holds), and orphan pages (profiles with no thesis, themes with missing profiles). Returns an overall 0-100 health score with specific action recommendations. Use when: auditing knowledge base state, triggering a fresh report, reviewing what needs attention. Triggers on: "health check my research", "what\'s stale", "any drift", "generate a report", "研究库体检", "过期档案", "论据偏离", "孤立主题".',
    categories: ["research-tools"],
    sourceFolder: "skills/alphagbm-health-check",
  },
  {
    id: "alphagbm-hedge-advisor",
    titleZh: "AlphaGBM 对冲顾问",
    titleEn: "AlphaGBM Hedge Advisor",
    descriptionZh:
      '为单一标的或一组持仓提供完整对冲情报。一次调用返回四个面板："对冲扫描"（平价看跌、尾部对冲、阶梯对冲、等权重看跌、VXX）、"对冲监控"智能代理表（精确解释哪种工具对冲哪种风险）、"市场状态"风险矩阵（标签 + VIX + 对冲成本），以及"什么都不做"合理性检查（防止过度对冲）。\n触发词："对冲 NVDA"、"如何对冲我的 SPY 持仓"、"最便宜的下行保护方式"、"尾部对冲 AAPL"、"保护性看跌成本 MSFT"、"市场崩盘保险"、"现在看跌期权贵吗"、"组合对冲策略"、"我应该花多少买保护"、"持仓保险"',
    descriptionEn:
      'Full hedging intelligence for a single ticker or a position set. Returns a\n"Hedge Sweep" (atm_put, tail_hedge, laddered_hedge, ewp, vxx), a "Hedge\nMonitor" smart-proxy table that explains exactly which instrument hedges\nwhich risk, a "Market State" risk-matrix (tag + VIX + cost-of-hedge), and a\n"Do-Nothing" sanity check to prevent over-hedging. All four panels in one\ncall, no subscription.\nTriggers: "hedge NVDA", "how to hedge my SPY position", "cheapest way to\nprotect downside", "tail hedge AAPL", "protective put cost MSFT", "market\ncrash insurance", "are puts expensive now", "portfolio hedging strategy",\n"how much should I spend on protection", "insurance for position"',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-hedge-advisor",
  },
  {
    id: "alphagbm-investment-thesis",
    titleZh: "AlphaGBM 投资论文",
    titleEn: "AlphaGBM Investment Thesis",
    descriptionZh:
      '创建与公司档案关联的投资论据。每个论据跟踪持仓背后的"为什么"：买入逻辑、信念驱动因素和退出触发条件。每次更新都会记录论据状态变化并附带 AI 生成的推理——"论据没有变，但证据变弱了"。使用场景：撰写买入论据、设定目标价、定义什么情况会让你卖出、跟踪论据偏离。 触发词："写一份 NVDA 的论据"、"我当初买 AAPL 的理由是什么"、"更新我的 TSLA 论据"、"什么会让我卖出 MSFT"、"投资逻辑"、"论据"、"止损理由"、"论据被打破"',
    descriptionEn:
      'Create investment theses linked to a company profile. Each thesis tracks the "why" behind a position: buy logic, conviction drivers, and exit triggers. Every update logs the thesis state change with AI-generated reasoning — "the thesis didn\'t change, but the evidence got weaker." Use when: writing a buy thesis, setting a price target, defining what would make you sell, tracking thesis drift. Triggers on: "write a thesis on NVDA", "what was my buy case for AAPL", "update my TSLA thesis", "what would make me sell MSFT", "投资逻辑", "论据", "止损理由", "论据被打破".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/alphagbm-investment-thesis",
  },
  {
    id: "alphagbm-iv-rank",
    titleZh: "AlphaGBM IV排名",
    titleEn: "AlphaGBM IV Rank",
    descriptionZh:
      'IV 排名和 IV 百分位分析，展示当前隐含波动率在其 252 天历史中的相对位置。返回 IV 排名（0-100）、IV 百分位（0-100）、IV 历史数据以及基于 IV 区间的交易信号。使用场景：决定买入还是卖出期权溢价、检查 IV 是否偏高或偏低、择时波动率交易、筛选 IV 极端值。 触发词："IV 排名 AAPL"、"NVDA IV 高吗"、"IV 百分位 SPY"、"历史 IV TSLA"、"META 波动率便宜吗"、"IV 排名扫描"、"我应该卖期权溢价吗"',
    descriptionEn:
      'IV Rank and IV Percentile analysis showing where current implied volatility stands relative to its 252-day history. Returns IV rank (0-100), IV percentile (0-100), IV history data, and trading signals based on IV zone. Use when: deciding whether to buy or sell premium, checking if IV is high or low, timing volatility trades, screening for IV extremes. Triggers on: "IV rank AAPL", "is NVDA IV high", "IV percentile SPY", "historical IV TSLA", "is volatility cheap for META", "IV rank scan", "should I sell premium".',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-iv-rank",
  },
  {
    id: "alphagbm-macro-view",
    titleZh: "AlphaGBM 宏观视图",
    titleEn: "AlphaGBM Macro View",
    descriptionZh:
      '跟踪真正影响你投资组合的宏观变量——VIX、美国10年期国债、美元指数、黄金、石油等——并自动计算对用户持仓的影响。每个跟踪指标返回当前值、变动幅度以及 AI 生成的影响分析（关联到用户的公司档案）。使用场景：添加宏观指标、调取当前宏观仪表板、询问 VIX 如何影响投资组合。 触发词："跟踪 VIX"、"当前十年期国债收益率"、"美元怎么样了"、"添加黄金到我的宏观监控"、"移除 US10Y"、"宏观指标"、"美债利率"、"美元指数"、"VIX恐慌指数"',
    descriptionEn:
      'Track the macro variables that actually move your portfolio — VIX, US10Y, DXY, gold, oil, etc. — with auto-computed impact on user\'s holdings. Each tracked indicator returns current value, change, and AI-generated impact analysis linked to the user\'s profiles. Use when: adding a macro indicator, pulling current macro dashboard, asking how VIX affects the portfolio. Triggers on: "track VIX", "current 10-year yield", "how\'s the dollar doing", "add gold to my macro watch", "remove US10Y", "宏观指标", "美债利率", "美元指数", "VIX恐慌指数".',
    categories: ["market-macro"],
    sourceFolder: "skills/alphagbm-macro-view",
  },
  {
    id: "alphagbm-market-sentiment",
    titleZh: "AlphaGBM 市场情绪",
    titleEn: "AlphaGBM Market Sentiment",
    descriptionZh:
      '全市场情绪仪表板，包含 VIX、Put/Call 比率、恐惧与贪婪指数、市场宽度和板块轮动分析。将当前市场状态分类为风险偏好（risk-on）、避险（risk-off）或中性。\n触发词："市场情绪"、"市场是否恐惧"、"VIX 分析"、"put call 比率"、"市场宽度"、"恐惧与贪婪"、"risk on or risk off"、"上涨/下跌家数"、"新高/新低"、"板块轮动"、"市场状态"',
    descriptionEn:
      'Market-wide sentiment dashboard with VIX, Put/Call ratio, Fear & Greed Index, market breadth,\nand sector rotation analysis. Classifies current regime as risk-on, risk-off, or neutral.\nTriggers: "market sentiment", "is the market fearful", "VIX analysis", "put call ratio",\n"market breadth", "fear and greed", "risk on or risk off", "advance decline",\n"new highs new lows", "sector rotation", "market regime"',
    categories: ["market-macro"],
    sourceFolder: "skills/alphagbm-market-sentiment",
  },
  {
    id: "alphagbm-marks-cycle",
    titleZh: "AlphaGBM 马克斯周期",
    titleEn: "AlphaGBM Marks Cycle",
    descriptionZh:
      '霍华德·马克斯风格的市场周期位置评分 0-100，其中 0 = 恐慌底部（全力进攻），100 = 狂热顶部（全力防守）。将 VIX（40%）+ SPY IV 排名（25%）+ Put/Call 比率（20%）+ 估值百分位（15%）整合为单一数值，并映射为进攻 vs 防守姿态。免费端点，无需认证，5分钟缓存——目标是将"我们处于周期什么位置"变成一次调用即可获取的答案。\n触发词："市场在周期中的什么位置"、"霍华德·马克斯风格周期解读"、"我应该进攻还是防守"、"这是买入周期吗"、"当前周期位置"、"马克斯周期评分"、"SPY 情绪解读"',
    descriptionEn:
      'Howard Marks-style market cycle position 0-100, with 0 = panic bottom (hard\noffense) and 100 = euphoric top (hard defense). Blends VIX (40%) + SPY IV Rank\n(25%) + Put/Call ratio (20%) + valuation percentile (15%) into a single number\nand maps to an offense-vs-defense posture. Free endpoint, no auth, 5-min cache\n— the goal is to make "where are we in the cycle" a one-call lookup.\nTriggers: "where is the market in the cycle", "Howard Marks style cycle read",\n"am I supposed to be offensive or defensive", "is this a buying cycle", "cycle\nposition right now", "Marks cycle score", "sentiment read for SPY"',
    categories: ["market-macro"],
    sourceFolder: "skills/alphagbm-marks-cycle",
  },
  {
    id: "alphagbm-options-score",
    titleZh: "AlphaGBM 期权评分",
    titleEn: "AlphaGBM Options Score",
    descriptionZh:
      '使用 AlphaGBM 多因子评分模型（流动性、IV 吸引力、希腊值平衡、风险/回报）为任意标的的期权合约进行评分和排名。返回已评分的期权链，并高亮最优合约。使用场景：评估交易哪个期权、找到最佳行权价/到期日、按质量排名期权。 触发词："评分 AAPL 期权"、"NVDA 最佳期权"、"我该买哪个 TSLA call"、"SPY 期权链"、"排名 META puts"',
    descriptionEn:
      'Score and rank options contracts for any ticker using AlphaGBM\'s multi-factor scoring model (liquidity, IV attractiveness, Greeks balance, risk/reward). Returns scored option chains with the best contracts highlighted. Use when: evaluating which option to trade, finding the best strike/expiry, ranking options by quality. Triggers on: "score AAPL options", "best options for NVDA", "which TSLA call should I buy", "option chain for SPY", "rank META puts".',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-options-score",
  },
  {
    id: "alphagbm-options-strategy",
    titleZh: "AlphaGBM 期权策略",
    titleEn: "AlphaGBM Options Strategy",
    descriptionZh:
      '基于你的市场观点（看涨、看跌、中性、波动）推荐最优多腿期权策略。支持 15+ 种策略模板，包括价差、蝶式、跨式、铁秃鹰和收租策略。返回完整的盈亏曲线、盈亏平衡点和盈利概率。使用场景：选择期权策略、围绕财报规划交易、构建多腿仓位、比较策略替代方案。 触发词："AAPL 期权策略"、"NVDA 看涨策略"、"TSLA 财报最佳策略"、"SPY Iron Condor"、"META 熊市看跌价差"、"GOOGL 收租策略"、"QQQ 中性策略"',
    descriptionEn:
      'Recommends optimal multi-leg option strategies based on your market view (bullish, bearish, neutral, volatile). Supports 15+ strategy templates including spreads, condors, straddles, and income plays. Returns full P&L profile, breakevens, and probability of profit. Use when: choosing an options strategy, planning a trade around earnings, building a multi-leg position, comparing strategy alternatives. Triggers on: "options strategy for AAPL", "bullish strategy NVDA", "what\'s the best play on TSLA earnings", "iron condor SPY", "bear put spread META", "income strategy for GOOGL", "neutral play on QQQ".',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-options-strategy",
  },
  {
    id: "alphagbm-pnl-simulator",
    titleZh: "AlphaGBM 盈亏模拟器",
    titleEn: "AlphaGBM P&L Simulator",
    descriptionZh:
      '为任意单腿或多腿期权仓位提供盈亏模拟引擎。生成到期损益图、随时间变化的 P&L、情景分析（价格、IV、时间）、盈亏平衡分析和概率分布。使用场景：测试交易构想、可视化风险/回报、运行情景分析、检查盈亏平衡点、压力测试仓位。 触发词："模拟 AAPL 牛市看涨价差 P&L"、"如果 NVDA 跌 10% 会怎样"、"P&L 图表"、"测试我的 Iron Condor"、"盈亏平衡分析"、"压力测试我的仓位"、"到期时会发生什么"',
    descriptionEn:
      'P&L simulation engine for any single-leg or multi-leg option position. Generates profit/loss diagrams at expiry, P&L over time, what-if scenarios (price, IV, time), breakeven analysis, and probability distributions. Use when: testing a trade idea, visualizing risk/reward, running what-if scenarios, checking breakeven points, stress-testing a position. Triggers on: "simulate PnL for AAPL bull call spread", "what if NVDA drops 10%", "P&L diagram", "test my iron condor", "breakeven analysis", "stress test my position", "what happens at expiry".',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-pnl-simulator",
  },
  {
    id: "alphagbm-polymarket",
    titleZh: "AlphaGBM PolyMarket信号",
    titleEn: "AlphaGBM Polymarket",
    descriptionZh:
      '将预测市场数据（Polymarket）与期权分析集成，揭示事件概率与期权隐含概率之间的错误定价信号。\n触发词："polymarket 信号"、"预测市场 vs 期权"、"事件概率"、"降息概率"、"选举概率 vs 期权"、"polymarket 套利"、"隐含概率不匹配"、"预测市场数据"、"事件驱动型期权"',
    descriptionEn:
      'Integrates prediction market data (Polymarket) with options analysis to surface mispricing\nsignals between event probabilities and options-implied probabilities.\nTriggers: "polymarket signals", "prediction market vs options", "event probability",\n"rate cut odds", "election odds vs options", "polymarket arbitrage",\n"implied probability mismatch", "prediction market data", "event-driven options"',
    categories: ["market-macro"],
    sourceFolder: "skills/alphagbm-polymarket",
  },
  {
    id: "alphagbm-stock-analysis",
    titleZh: "AlphaGBM 股票分析",
    titleEn: "AlphaGBM Stock Analysis",
    descriptionZh:
      '使用 AlphaGBM 五大支柱框架（基本面、技术面、情绪、资金流、估值）进行的 AI 驱动股票分析，采用真实市场数据。返回 1-10 综合评分及可操作信号。使用场景：分析任意股票、评估买卖决策、比较股票基本面、评估风险水平。 触发词："分析 AAPL"、"你觉得 NVDA 怎么样"、"我该买 TSLA 吗"、"META 股票分析"、"SPY 是否被高估"、"GOOGL 风险评估"',
    descriptionEn:
      'AI-powered stock analysis using AlphaGBM\'s Five Pillars framework (Fundamental, Technical, Sentiment, Flow, Valuation) with real market data. Returns a 1-10 composite score with actionable signals. Use when: analyzing any stock ticker, evaluating buy/sell decisions, comparing stock fundamentals, assessing risk levels. Triggers on: "analyze AAPL", "what do you think about NVDA", "should I buy TSLA", "stock analysis for META", "is SPY overvalued", "risk assessment for GOOGL".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/alphagbm-stock-analysis",
  },
  {
    id: "alphagbm-take-profit",
    titleZh: "AlphaGBM 止盈顾问",
    titleEn: "AlphaGBM Take Profit",
    descriptionZh:
      '量化一只股票适合长期持有还是需要分阶段止盈——采用创新的"过山车率"指标（入场后浮盈达到 +50% 又在退出前从峰值回落超过 50% 的概率）。对每只标的使用约 10 年日线历史数据运行 15 种退出策略，返回各策略的中位数。首次查询新标的约需 30 秒，全局缓存后后续查询即时返回。\n触发词："我应该长期持有 TQQQ 吗"、"NVDA 止盈策略"、"AAPL 适合持有吗"、"TSLA 过山车率"、"卖出策略 COIN"、"什么时候卖 NVDA"、"QQQ 止盈计划"、"我的股票退出策略"、"杠杆 ETF 持有分析"',
    descriptionEn:
      'Quantifies whether a stock is suitable for long-term holding or requires tiered\nprofit-taking — using a novel "rollercoaster rate" metric (probability that an\nentry\'s paper profit reaches +50% then falls back >50% from peak before exit).\nRuns 15 exit strategies over ~10 years of daily history per ticker and returns\nmedians for each. First query for a new ticker takes ~30s and gets cached\nglobally; subsequent queries are instant.\nTriggers: "should I hold TQQQ long-term", "take-profit strategy for NVDA",\n"is AAPL holdable", "rollercoaster rate for TSLA", "sell strategy COIN",\n"when to sell NVDA", "profit-taking plan for QQQ", "exit strategy for my stock",\n"leveraged ETF hold analysis"',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-take-profit",
  },
  {
    id: "alphagbm-tepper-signal",
    titleZh: "AlphaGBM Tepper信号",
    titleEn: "AlphaGBM Tepper Signal",
    descriptionZh:
      'David Tepper 2009 年（+132%）和 2020 年（+82%）恐慌买入策略的量化版本。检测当前条件是否匹配 Tepper 信号：VIX ≥ 35 AND 恐惧评分 ≥ 80 AND 质量过滤（大盘股、正利润率）。仅在真正的市场恐慌时触发——其余时间返回"等待"状态，按 Tepper 自身框架约覆盖 80% 的交易日。该 API 复用我们现有的 FearScore 模块，因此信号可直接与多指标恐慌指数进行对比。\n触发词："这是 Tepper 买入信号吗"、"恐慌买入检测器 SPY"、"我该抄底恐慌吗"、"Tepper 风格入场检查"、"我们处于恐慌底部吗"、"VIX 35+ 且恐惧 80+ 了吗"、"今天的历史底部信号"',
    descriptionEn:
      'Quantified version of David Tepper\'s 2009 (+132%) and 2020 (+82%) panic-buy\nplaybook. Detects whether current conditions match Tepper\'s signal: VIX ≥ 35\nAND FearScore ≥ 80 AND quality filter (large-cap, positive margin). Only fires\nduring genuine market panics — the rest of the time it returns the "waiting"\nstate, which is ~80% of all days per Tepper\'s own framework. The API reuses\nour existing FearScore module, so the signal is directly comparable to the\nmulti-indicator panic index.\nTriggers: "is this a Tepper buy signal", "panic-buy detector SPY", "should I\nbuy the panic", "Tepper style entry check", "are we at a panic bottom", "is\nVIX 35+ and fear 80+", "historical bottom signal today"',
    categories: ["market-macro"],
    sourceFolder: "skills/alphagbm-tepper-signal",
  },
  {
    id: "alphagbm-theme-research",
    titleZh: "AlphaGBM 主题研究",
    titleEn: "AlphaGBM Theme Research",
    descriptionZh:
      '将相关标的归类为投资主题——AI 基建、港股高息、电动车供应链、生物科技催化剂——并附带主题级别的 AI 摘要和新闻关键词监控。每个主题是一个命名标的集合加上系统为你监控的关键词。使用场景：创建主题篮子、调取主题聚合视图、添加/移除标的、监控某主题相关新闻。 触发词："创建 AI 基建主题"、"显示我的主题"、"添加 MSFT 到 AI 主题"、"港股高息有什么新动态"、"主题研究"、"AI基建"、"港股高息"、"投资主题"',
    descriptionEn:
      'Group related tickers into investment themes — AI infra, HK dividend, EV supply chain, biotech catalysts — with theme-level AI summary and news keyword monitoring. Each theme is a named bag of tickers plus keywords the system watches for you. Use when: creating a themed basket, pulling up a theme\'s aggregated view, adding/removing tickers, monitoring news around a topic. Triggers on: "create an AI infra theme", "show my themes", "add MSFT to AI theme", "what\'s happening in HK dividend", "主题研究", "AI基建", "港股高息", "投资主题".',
    categories: ["market-macro"],
    sourceFolder: "skills/alphagbm-theme-research",
  },
  {
    id: "alphagbm-unusual-activity",
    titleZh: "AlphaGBM 异常活动",
    titleEn: "AlphaGBM Unusual Activity",
    descriptionZh:
      '检测期权异常活动和聪明钱信号。监控成交量/持仓量比率飙升、大宗交易、异常行权价/到期日组合以及期权金净流入。\n触发词："异常期权活动"、"聪明钱 AAPL"、"大宗交易 NVDA"、"谁在买 TSLA 看跌"、"期权流"、"大宗交易"、"扫单"、"异常成交量"、"暗池活动"、"鲸鱼交易"',
    descriptionEn:
      'Detects unusual options activity and smart money signals. Monitors volume/OI ratio spikes,\nlarge block trades, unusual strike/expiry combinations, and net premium flow.\nTriggers: "unusual options activity", "smart money AAPL", "large trades NVDA",\n"who\'s buying TSLA puts", "options flow", "block trades", "sweep orders",\n"unusual volume", "dark pool activity", "whale trades"',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-unusual-activity",
  },
  {
    id: "alphagbm-vix-status",
    titleZh: "AlphaGBM VIX状态",
    titleEn: "AlphaGBM VIX Status",
    descriptionZh:
      '当前 VIX 水平 + 五级恐惧温度计分类 + 期权卖方策略提示。将单一的 VIX 数字转化为可操作的交易指导（平静/正常/卖方最佳区间/谨慎/极度恐惧）。包含相对过去一年历史的当前百分位以及市场在各级别停留的天数。\n触发词："VIX 多少"、"VIX 水平"、"市场平静吗"、"市场恐惧指数"、"我现在应该卖期权吗"、"VIX 级别"、"VIX 策略"、"波动率环境"、"恐惧指数"、"我该买保护吗"、"现在是做 BPS 的好时机吗"',
    descriptionEn:
      'Current VIX level + 5-tier fear-thermometer classification + option-seller strategy\nhint. Translates the single VIX number into actionable trading guidance (calm /\nnormal / seller sweet spot / caution / extreme fear). Includes current percentile\nvs 1-year history and how many days the market spent in each tier.\nTriggers: "what\'s VIX", "VIX level", "is market calm", "market fear gauge",\n"should I sell premium now", "VIX tier", "VIX strategy", "volatility environment",\n"fear index", "should I buy protection", "is this a good time for BPS".',
    categories: ["market-macro"],
    sourceFolder: "skills/alphagbm-vix-status",
  },
  {
    id: "alphagbm-vol-smile",
    titleZh: "AlphaGBM 波动率微笑",
    titleEn: "AlphaGBM Vol Smile",
    descriptionZh:
      '针对单一到期日的二维波动率微笑和偏斜分析。横跨各执行价映射 IV 以揭示看跌偏斜、看涨偏斜和微笑形态。返回微笑曲线数据、偏斜指标（25-delta 偏斜、风险逆转）和形态分类。使用场景：分析看跌/看涨偏斜、检查看跌期权是否昂贵、理解期权定价中的方向性恐惧、寻找偏斜交易机会。 触发词："vol smile AAPL"、"NVDA 偏斜分析"、"TSLA 看跌偏斜"、"SPY 微笑曲线陡峭吗"、"META 波动率偏斜"、"GOOGL 微笑形态"',
    descriptionEn:
      '2D volatility smile and skew analysis for a single expiration date. Maps IV across strikes to reveal put skew, call skew, and smile shape. Returns smile curve data, skew metrics (25-delta skew, risk reversal), and shape classification. Use when: analyzing put/call skew, checking if puts are expensive, understanding directional fear in options pricing, finding skew trades. Triggers on: "vol smile AAPL", "skew analysis NVDA", "put skew for TSLA", "is the smile steep for SPY", "volatility skew META", "smile shape for GOOGL".',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-vol-smile",
  },
  {
    id: "alphagbm-vol-surface",
    titleZh: "AlphaGBM 波动率曲面",
    titleEn: "AlphaGBM Vol Surface",
    descriptionZh:
      '三维波动率曲面分析，横跨执行价（虚实值程度）和到期日映射隐含波动率。展示曲面每个点上的期权是便宜还是昂贵。返回曲面网格数据、平值期限结构、各到期日偏斜以及曲面异常。使用场景：检查 IV 是否昂贵、分析期限结构、发现定价错误的期权、理解波动率动态。 触发词："vol surface AAPL"、"NVDA IV 贵吗"、"SPY 波动率期限结构"、"TSLA 曲面分析"、"META IV 曲面"、"显示 vol surface"',
    descriptionEn:
      '3D volatility surface analysis mapping implied volatility across strikes (moneyness) and expirations. Shows whether options are cheap or expensive at every point on the surface. Returns surface grid data, ATM term structure, skew by expiry, and surface anomalies. Use when: checking if IV is expensive, analyzing term structure, finding mispriced options, understanding volatility dynamics. Triggers on: "vol surface AAPL", "is NVDA IV expensive", "volatility term structure SPY", "surface analysis TSLA", "IV surface META", "show me the vol surface".',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-vol-surface",
  },
  {
    id: "alphagbm-watchlist",
    titleZh: "AlphaGBM 监控列表",
    titleEn: "AlphaGBM Watchlist",
    descriptionZh:
      '监控标的列表的价格、IV 排名、异常活动、财报日期和评分变化。支持自定义监控列表和默认"热门期权"列表。\n触发词："添加 AAPL 到监控列表"、"我的监控列表"、"监控 NVDA TSLA META"、"监控列表预警"、"从监控列表移除 SPY"、"热门期权"、"我的监控列表里有什么"、"监控列表摘要"、"每日监控列表"',
    descriptionEn:
      'Monitor a list of tickers for key changes in price, IV rank, unusual activity, earnings dates,\nand score changes. Supports custom watchlists and a default "hot options" list.\nTriggers: "add AAPL to watchlist", "my watchlist", "watch NVDA TSLA META",\n"watchlist alerts", "remove SPY from watchlist", "hot options",\n"what\'s on my watchlist", "watchlist summary", "daily watchlist"',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/alphagbm-watchlist",
  },
  {
    id: "audit-xls",
    titleZh: "审核电子表格",
    titleEn: "Audit XLS",
    descriptionZh:
      "审核电子表格中的公式、数据和常见错误。范围可选，包括当前选中的范围、当前活动工作表或整个模型（包括财务模型完整性检查，如资产负债表平衡、现金流量表和逻辑 sanity）。触发词包括“审核此工作表”、“检查我的公式”、“查找公式错误”、“QA此电子表格”、“检查此”、“调试模型”、“模型检查”、“模型无法平衡”、“模型有错误”、“模型审核”。",
    descriptionEn:
      'Audit a spreadsheet for formula accuracy, errors, and common mistakes. Scopes to a selected range, a single sheet, or the entire model (including financial-model integrity checks like BS balance, cash tie-out, and logic sanity). Triggers on "audit this sheet", "check my formulas", "find formula errors", "QA this spreadsheet", "sanity check this", "debug model", "model check", "model won\'t balance", "something\'s off in my model", "model review".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/audit-xls",
  },
  {
    id: "bond-futures-basis",
    titleZh: "国债期货基差分析",
    titleEn: "Bond Futures Basis",
    descriptionZh:
      "分析国债期货基差，通过定价期货、识别最便宜可交割券，并与收益率曲线比较来评估交割期权价值和基差交易机会。用于分析国债期货、计算基差、识别CTD券、计算隐含回购利率或评估基差交易时使用。",
    descriptionEn:
      "Analyze the bond futures basis by pricing futures, identifying the cheapest-to-deliver, and comparing with yield curves to assess delivery option value and basis trading opportunities. Use when analyzing bond futures, computing the basis, identifying CTD bonds, calculating implied repo rates, or evaluating basis trades.",
    categories: ["portfolio-trading"],
    sourceFolder: "skills/bond-futures-basis",
  },
  {
    id: "bond-relative-value",
    titleZh: "债券相对价值分析",
    titleEn: "Bond Relative Value",
    descriptionZh:
      "跨债券进行相对价值分析，比较收益率、利差、久期和凸性，以识别错误定价和相对价值交易机会。用于比较债券、分析信用利差、评估债券互换或在固定收益中寻找相对价值时使用。",
    descriptionEn:
      "Perform relative value analysis on bonds by combining pricing, yield curve context, credit spreads, and scenario stress testing. Use when analyzing bond richness/cheapness, computing spread decomposition, comparing bonds, assessing bond value vs curves, or running rate shock scenarios.",
    categories: ["portfolio-trading"],
    sourceFolder: "skills/bond-relative-value",
  },
  {
    id: "break-trace",
    titleZh: "差异追溯",
    titleEn: "Break Trace",
    descriptionZh:
      "追溯两期之间的差异——找出什么变化了、变化了多少以及为什么变化。用于分析期间变动、盈亏驱动因素分析或解释预算与实际差异时使用。",
    descriptionEn:
      "Root-cause a reconciliation break to its source transaction or posting — follow the audit trail from the break row back to the originating entry on each side and state what differs and why. Use after gl-recon has classified a break.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/break-trace",
  },
  {
    id: "btc-bottom-model",
    titleZh: "比特币周期择时模型",
    titleEn: "BTC Bottom Model",
    descriptionZh:
      "比特币市场热力评分系统，通过13个链上、情绪和市场指标加权评分，输出0-100市场热力指数及买卖建议。覆盖ETF资金流、资金费率、多空比、恐惧贪婪指数、LTH-MVRV、NUPL、SOPR、LTH持仓比例、移动平均倍数、周线RSI和成交量趋势。",
    descriptionEn:
      "Bitcoin cycle timing model with weighted scoring system. Tracks 13 indicators across 2 categories — Daily Pulse (4 indicators, 32 points) and Weekly Structure (9 indicators, 68 points) — producing a composite 0-100 Market Heat Score. Provides both buy AND sell recommendations across the full market cycle.",
    categories: ["market-macro"],
    sourceFolder: "skills/btc-bottom-model",
  },
  {
    id: "buyer-list",
    titleZh: "买方清单",
    titleEn: "Buyer List",
    descriptionZh:
      "为并购交易构建潜在买方清单。筛选战略买方和财务买方，按契合度和收购能力排序。用于并购流程、买方识别或交易筛选时使用。",
    descriptionEn:
      'Build and organize a universe of potential acquirers for sell-side M&A processes. Identifies strategic and financial buyers, assesses fit, and prioritizes outreach. Use when preparing for a sell-side mandate, building a buyer universe, or evaluating potential partners. Triggers on "buyer list", "buyer universe", "potential acquirers", "who would buy this", "strategic buyers", or "financial sponsors".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/buyer-list",
  },
  {
    id: "catalyst-calendar",
    titleZh: "催化剂日历",
    titleEn: "Catalyst Calendar",
    descriptionZh:
      "构建并维护股票催化事件日历——盈利发布、FDA决策、监管裁决、产品发布等。用于追踪事件驱动策略的催化剂、监控即将到来的公司事件或管理投资组合事件风险时使用。",
    descriptionEn:
      'Build and maintain a calendar of upcoming catalysts across a coverage universe — earnings dates, conferences, product launches, regulatory decisions, and macro events. Helps prioritize attention and position ahead of events. Triggers on "catalyst calendar", "upcoming events", "what\'s coming up", "earnings calendar", "event calendar", or "catalyst tracker".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/catalyst-calendar",
  },
  {
    id: "china-3-statement-model",
    titleZh: "中国三表财务模型",
    titleEn: "China 3 Statement Model",
    descriptionZh:
      "A股三表财务模型。将标准三表模型方法适配中国会计准则（CAS）、中国GAAP差异和AkShare数据源。为中国上市公司构建集成的IS/BS/CF模型时，替代原3-statement-model技能使用。",
    descriptionEn:
      "Three-statement financial model for A-share stocks. Adapts the standard 3-statement-model methodology for Chinese accounting standards (CAS), Chinese GAAP differences, and AkShare-sourced financials. Use instead of the original 3-statement-model skill when building integrated IS/BS/CF models for Chinese listed companies.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-3-statement-model",
  },
  {
    id: "china-accrual-schedule",
    titleZh: "中国应计费用日程表",
    titleEn: "China Accrual Schedule",
    descriptionZh:
      "为中国基金构建期末应计费用日程表。适配中国企业会计准则下的应计费用处理方式和中国基金运营模式。用于中国基金的月末结账流程。",
    descriptionEn:
      'Build accrual schedules for A-share fund administration. Tracks revenue recognition, expense accruals, and working capital timing for fund accounting. Adapted from the original accrual-schedule skill for fund accounting standards. Triggers on "基金应计项目", "应计计提基金", "accrual schedule fund", "NAV accruals", or "accruals [fund]".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-accrual-schedule",
  },
  {
    id: "china-audit-xls",
    titleZh: "中国电子表格审核",
    titleEn: "China Audit XLS",
    descriptionZh:
      "审计A股分析的财务模型和Excel工作簿。将原audit-xls技能适配中国财务建模标准、CAS惯例和A股特定检查。",
    descriptionEn:
      'Audit financial models and Excel workbooks for A-share analysis. Adapts the original audit-xls skill for Chinese financial modeling standards, CAS conventions, and A-share-specific checks. Triggers on "A股模型审计", "财务模型核查", "audit model China", "audit xlsx", "模型QC", or "check model [company]".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-audit-xls",
  },
  {
    id: "china-break-trace",
    titleZh: "中国差异追溯",
    titleEn: "China Break Trace",
    descriptionZh:
      "追溯中国基金/公司两期之间的差异。适配中国企业会计准则下的科目分类和披露格式。用于中国市场的期间变动分析、盈亏驱动因素分析或预算与实际差异解释。",
    descriptionEn:
      'Forensic financial analysis for A-share fund holdings and portfolio companies. Adapts the original break-trace skill for fund administration context and Chinese market standards. Triggers on "基金持仓核查", "持仓异常", "forensic fund analysis China", "持仓质量分析", or "investigate [fund] holdings".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-break-trace",
  },
  {
    id: "china-catalyst-calendar",
    titleZh: "中国催化剂日历",
    titleEn: "China Catalyst Calendar",
    descriptionZh:
      "为中国A股构建并维护催化事件日历——包括财报发布、监管审批、政策变动、产品发布等中国特有催化事件。用于追踪A股事件驱动策略的催化剂和监控中国市场公司事件。",
    descriptionEn:
      'Track upcoming catalysts for A-share coverage universe — earnings dates, regulatory announcements, sector conferences, product launches, and policy events relevant to Chinese equities. Adapted from the original catalyst-calendar skill for A-share market conventions. Triggers on "A股催化剂日历", "事件日历", "财报日历", "earnings calendar A-share", "upcoming catalysts China", or "what\'s coming up for [company]".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/china-catalyst-calendar",
  },
  {
    id: "china-clean-data-xls",
    titleZh: "中国数据清洗",
    titleEn: "China Clean Data XLS",
    descriptionZh:
      "清洗中国电子表格中的混乱数据——去除空格、修复大小写不一致、转换文本型数字、标准化日期、删除重复项并标记混合类型列。适配中国市场数据格式和中文编码问题。",
    descriptionEn:
      'Clean and normalize A-share financial data for modeling. Adapts the original clean-data-xls skill for Chinese financial statements, CAS conventions, and A-share data formats. Triggers on "A股数据清洗", "财务数据清洗", "clean financial data China", "数据清洗", or "normalize financial statements".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-clean-data-xls",
  },
  {
    id: "china-comps",
    titleZh: "中国可比公司分析",
    titleEn: "China Comps",
    descriptionZh:
      "A股可比公司分析。使用AkShare MCP构建同业组、提取财务数据、计算估值倍数（市盈率、市净率、市销率），并评估中国行业板块内的相对价值。",
    descriptionEn:
      "Comparable company analysis for A-share stocks. Uses AkShare MCP to build peer groups, pull financial data, compute valuation multiples (PE, PB, PS), and assess relative value within a Chinese industry sector.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-comps",
  },
  {
    id: "china-comps-analysis",
    titleZh: "中国可比公司深度分析",
    titleEn: "China Comps Analysis",
    descriptionZh:
      "A股深度可比公司分析。构建同业组、提取财务数据、计算估值倍数并评估相对价值。为中国上市公司生成完整的估值比较报告。",
    descriptionEn:
      'Comparable company analysis for A-share equities. Adapts the original comps-analysis skill for Chinese market data sources, A-share trading multiples, and domestic peer selection. Triggers on "A股可比公司", "可比分析", "comps China", "peer comparison A-share", "可比公司分析", or "trading comps [industry]".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-comps-analysis",
  },
  {
    id: "china-dcf",
    titleZh: "中国DCF估值",
    titleEn: "China DCF",
    descriptionZh:
      "使用中国金融数据对A股进行DCF估值。使用AkShare MCP获取财务报表、WACC输入（中国国债收益率为无风险利率）和增长预测。为中国股票估值时代替原dcf-model技能使用。",
    descriptionEn:
      "DCF valuation model for A-share stocks using Chinese financial data. Uses AkShare MCP for financial statements, WACC inputs (risk-free rate from China government bond yields), and growth projections. Use instead of the original dcf-model skill for Chinese equities.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-dcf",
  },
  {
    id: "china-dcf-model",
    titleZh: "中国DCF模型",
    titleEn: "China DCF Model",
    descriptionZh:
      "为中国A股构建机构级DCF估值模型。适配中国市场数据源（万得Wind、AkShare等），包含中国国债基准的无风险利率、中国市场风险溢价和中国特色增长假设。",
    descriptionEn:
      'Discounted cash flow (DCF) valuation model for A-share equities. This alias skill redirects to china-dcf, which provides comprehensive DCF modeling adapted for Chinese market conventions. Triggers on "A股DCF模型", "DCF估值", "DCF model China", "现金流折现", "discounted cash flow A-share", or "DCF [company]".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-dcf-model",
  },
  {
    id: "china-deal-screening",
    titleZh: "中国交易筛选",
    titleEn: "China Deal Screening",
    descriptionZh:
      "筛选中国市场的并购和投资机会。按行业、规模、增长和估值评估标的，适配中国市场特征和监管环境。",
    descriptionEn:
      'Screen and evaluate A-share investment opportunities. Adapts the original deal-screening skill for Chinese market data sources, A-share screening criteria, and domestic deal origination. Triggers on "A股标的筛选", "标的筛选", "screening China", "deal screening A-share", "筛选投资标的", or "screen for [criteria]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/china-deal-screening",
  },
  {
    id: "china-deck-refresh",
    titleZh: "中国演示文稿刷新",
    titleEn: "China Deck Refresh",
    descriptionZh:
      "用最新中国市场数据刷新现有演示文稿。更新财务数据、市场指标和估值，适配中国投资者关系和路演场景。",
    descriptionEn:
      'Refresh and update existing A-share investment presentation decks with latest data. Adapts the original deck-refresh skill for Chinese presentations, A-share data updates, and domestic market conventions. Triggers on "更新PPT", "刷新演示", "refresh deck China", "update presentation", "更新演示文稿", or "refresh slides [company]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/china-deck-refresh",
  },
  {
    id: "china-earnings-analysis",
    titleZh: "中国财报分析",
    titleEn: "China Earnings Analysis",
    descriptionZh:
      "分析A股公司财报——实际业绩vs一致预期、关键驱动因素、管理层指引变化。用于中国公司盈利发布后的深度分析。",
    descriptionEn:
      'Post-earnings quarterly update reports for A-share companies under coverage. Analyzes 业绩快报/正式财报, generates variance tables (actual vs 一致预期 vs prior), flags key drivers, and drafts structured earnings notes in Chinese sell-side format. Use instead of the original earnings-analysis skill for Chinese equities. Triggers on "A股财报分析", "季度业绩点评", "年报/中报点评", "earnings review", or "[company] earnings".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/china-earnings-analysis",
  },
  {
    id: "china-earnings-preview",
    titleZh: "中国财报预览",
    titleEn: "China Earnings Preview",
    descriptionZh:
      "为中国A股公司即将发布的财报生成预览报告。包含一致预期、关键关注指标、历史业绩和敏感性分析。",
    descriptionEn:
      'Pre-earnings analysis for A-share stocks. Builds scenario frameworks (actual vs consensus, beat/miss cases), identifies key metrics to watch, and prepares positioning notes before Chinese companies report quarterly results. Use instead of the original earnings-preview skill for A-share coverage. Triggers on "A股财报前瞻", "季报前瞻", "业绩前瞻", "earnings preview", "what to watch for [company] earnings", or "pre-earnings setup".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/china-earnings-preview",
  },
  {
    id: "china-gl-recon",
    titleZh: "中国总账对账",
    titleEn: "China GL Recon",
    descriptionZh:
      "为中国基金执行总账对账。适配中国企业会计准则下的科目体系和对账流程。用于中国基金的月度财务关账。",
    descriptionEn:
      'General ledger reconciliation for A-share fund administration. Tracks fund accounting reconciliations including securities, cash, income, and expense accruals. Adapted from the original gl-recon skill for fund accounting standards. Triggers on "基金总账核对", "基金科目核对", "GL reconciliation fund", "fund accounting recon", or "reconcile [fund] books".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-gl-recon",
  },
  {
    id: "china-ib-check-deck",
    titleZh: "中国投行检查清单",
    titleEn: "China Ib Check Deck",
    descriptionZh:
      "为中国投行交易执行生成检查清单和工作流程。覆盖中国并购和IPO交易中的监管合规、尽职调查和交割要求。",
    descriptionEn:
      'Quality check investment banking pitch decks for A-share M&A and capital raising transactions. Adapts the original ib-check-deck skill for Chinese market standards, CAS financials, and domestic IB conventions. Triggers on "投行deck检查", "IB deck QC", "check pitch deck China", "deck quality check", "材料质量检查", or "review deck [company/transaction]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/china-ib-check-deck",
  },
  {
    id: "china-idea-generation",
    titleZh: "中国投资想法生成",
    titleEn: "China Idea Generation",
    descriptionZh: "为中国A股生成投资想法。利用中国本土数据源、政策分析和行业趋势来识别投资机会。",
    descriptionEn:
      'Systematic stock screening and investment idea sourcing for A-share markets. Combines quantitative screens, thematic research, and pattern recognition to surface new long and short ideas. Adapted from the original idea-generation skill for Chinese market conventions and data sources. Triggers on "A股选股", "股票筛选", "寻找机会", "stock screen China", "A-share ideas", "find ideas for Chinese stocks", or "screen for A-share opportunities".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/china-idea-generation",
  },
  {
    id: "china-initiating-coverage",
    titleZh: "中国首次覆盖报告",
    titleEn: "China Initiating Coverage",
    descriptionZh:
      "为中国上市公司撰写首次覆盖研究报告。包括公司概况、行业分析、财务模型、估值和目标价格。适配中国企业会计准则和A股市场惯例。",
    descriptionEn:
      'Institutional-quality equity research initiation reports for A-share companies. Covers company analysis, financial modeling, valuation, chart preparation, and final report assembly. Adapted from the original initiating-coverage skill for Chinese market conventions, CAS accounting, and AkShare data sources. Triggers on "A股首次覆盖", "首次评级", "initiate coverage China", "initiate on [company]", "A股研究报告", or "start research on [company]".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/china-initiating-coverage",
  },
  {
    id: "china-lbo-model",
    titleZh: "中国LBO模型",
    titleEn: "China LBO Model",
    descriptionZh:
      "为中国市场构建杠杆收购（LBO）模型。适配中国债务市场结构、融资惯例和监管环境。用于评估中国私募股权交易。",
    descriptionEn:
      "Leveraged buyout model for A-share and China-market LBO scenarios. Adapts the standard LBO-model methodology for Chinese debt markets, CAS accounting, and AkShare data. Use instead of the original lbo-model skill when analyzing leveraged buyouts involving Chinese targets or China-based sponsors.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-lbo-model",
  },
  {
    id: "china-market-data",
    titleZh: "中国市场数据",
    titleEn: "China Market Data",
    descriptionZh:
      "获取和处理中国市场金融数据。覆盖A股行情、财务数据、资金流向和宏观经济指标。整合多个中国本土数据源。",
    descriptionEn:
      "Query A-share and Chinese financial market data via multiple data sources. Tier-1 paid source is iFind (同花顺, covers stocks/funds/macro/bonds/HK-US/ESG/index-sectors). Tier-2 free source is AkShare (行情/财报/行业/指数). Use whenever the agent needs Chinese financial data — compatible with 沪深 A 股, 科创板, 创业板, 北交所, and 港股通 stocks.",
    categories: ["research-tools"],
    sourceFolder: "skills/china-market-data",
  },
  {
    id: "china-model-update",
    titleZh: "中国模型更新",
    titleEn: "China Model Update",
    descriptionZh:
      "用最新数据更新中国A股财务模型。滚动前推预测期、引入最新实际数据、刷新假设条件。用于季度模型维护。",
    descriptionEn:
      'Update A-share financial models with new quarterly data, management guidance, or macro changes. Reflects actuals, rolls estimates forward, flags material changes, and updates valuation. Adapted from the original model-update skill for Chinese market conventions and AkShare data. Triggers on "A股模型更新", "模型更新", "plug earnings into model", "update model for [company]", "刷新预测", or "更新财务模型".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-model-update",
  },
  {
    id: "china-morning-note",
    titleZh: "中国晨报",
    titleEn: "China Morning Note",
    descriptionZh:
      "为中国市场生成每日晨报。包含隔夜市场回顾、今日重点关注、新闻摘要和投资组合点评。适配中国A股和港股市场。",
    descriptionEn:
      'Daily morning research note for A-share markets. Summarizes overnight developments, pre-market sentiment, trade ideas, and key events for the trading day. Adapted from the original morning-note skill for Chinese market conventions. Triggers on "早报", "晨会纪要", "今日策略", "morning note", "morning meeting", or "daily A-share preview".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/china-morning-note",
  },
  {
    id: "china-nav-tieout",
    titleZh: "中国净值核对",
    titleEn: "China NAV Tieout",
    descriptionZh:
      "核对中国基金净值（NAV）——将基金管理的资产估值核对到托管银行记录。用于中国基金的净值计算和投资者报告。",
    descriptionEn:
      'Net asset value (NAV) reconciliation and tie-out for Chinese funds and investment portfolios. Adapts the original nav-tieout skill for A-share holdings, Chinese fund accounting standards, and domestic custody arrangements. Triggers on "A股净值核对", "NAV计算", "NAV tie-out China", "基金净值", "net asset value [fund]", or "portfolio valuation [date]".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-nav-tieout",
  },
  {
    id: "china-ppt-template-creator",
    titleZh: "中国PPT模板创建器",
    titleEn: "China PPT Template Creator",
    descriptionZh:
      "为中国金融机构创建符合行业标准的PPT模板。适配中国投行、研究和基金的报告格式和设计惯例。",
    descriptionEn:
      'Create PowerPoint templates for A-share investment presentations. Adapts the original ppt-template-creator skill for Chinese business presentation standards and firm branding. Triggers on "A股PPT模板", "投资PPT模板", "create ppt template China", "presentation template", "制作PPT模板", or "build template for [purpose]".',
    categories: ["research-tools"],
    sourceFolder: "skills/china-ppt-template-creator",
  },
  {
    id: "china-pptx-author",
    titleZh: "中国PPT生成器",
    titleEn: "China PPTX Author",
    descriptionZh:
      "以无界面方式生成中国风格的.pptx演示文稿文件——用于无Office应用运行的自动化代理会话中。适配中国商业演示的排版和配色惯例。",
    descriptionEn:
      "Generate professional A-share investment analysis PowerPoint decks for any listed company, with live company, valuation, and market data.",
    categories: ["research-tools"],
    sourceFolder: "skills/china-pptx-author",
  },
  {
    id: "china-roll-forward",
    titleZh: "中国滚动前推",
    titleEn: "China Roll Forward",
    descriptionZh:
      "为中国基金的财务报表执行滚动前推。将会计科目从上一期间滚动到当前期间，核实期末余额。适配中国企业会计准则下的科目结转规则。",
    descriptionEn:
      'Roll forward fund accounting records for new reporting periods. Adapts the original roll-forward skill for Chinese fund administration and reporting requirements. Triggers on "基金账务滚动", "账务更新", "roll forward fund", "update fund books", "基金新期间", or "roll forward [fund] [period]".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-roll-forward",
  },
  {
    id: "china-sector-overview",
    titleZh: "中国行业概览",
    titleEn: "China Sector Overview",
    descriptionZh:
      "生成中国A股行业板块的深度概览报告。包含市场规模、竞争格局、监管环境、增长驱动因素和主要上市公司分析。",
    descriptionEn:
      'Comprehensive A-share sector and industry landscape reports — market size, competitive positioning, policy environment, key A-share players, trading multiples, and thematic trends. Adapted from the original sector-overview skill for Chinese market structure and terminology. Triggers on "A股行业分析", "行业研究", "板块分析", "sector overview China", "A-share sector deep dive", "白酒/半导体/新能源 行业分析", or "[industry] landscape China".',
    categories: ["market-macro"],
    sourceFolder: "skills/china-sector-overview",
  },
  {
    id: "china-skill-creator",
    titleZh: "中国技能创建器",
    titleEn: "China Skill Creator",
    descriptionZh:
      "为中国金融市场场景创建和打包自定义Agent技能。适配中国市场数据源、监管环境和业务惯例。",
    descriptionEn:
      'Create new China-specific financial skills following the established patterns and conventions. Use this meta-skill to scaffold new china-* skills that integrate with iFind MCP (Tier-1) and AkShare MCP (Tier-2 fallback), follow CAS accounting standards, and adapt workflows for the Chinese market. Triggers on "创建中国skill", "新建A股skill", "create china skill", "new china-skill", "制作skill", or when creating any new china-* skill.',
    categories: ["research-tools"],
    sourceFolder: "skills/china-skill-creator",
  },
  {
    id: "china-tax-loss-harvesting",
    titleZh: "中国税务亏损收割",
    titleEn: "China Tax Loss Harvesting",
    descriptionZh:
      "分析中国投资组合中的税务亏损收割机会。考虑中国资本利得税规则、交易成本和替代策略。用于中国税务优化。",
    descriptionEn:
      'Tax-loss harvesting strategies for A-share portfolios. Adapts the original tax-loss-harvesting skill for Chinese tax rules, A-share market conventions, and domestic tax treatment. Triggers on "A股税务亏损抵扣", "亏损抵扣", "tax loss harvesting China", "税务优化", "亏损抵扣策略", or "harvest tax losses [portfolio]".',
    categories: ["wealth-risk"],
    sourceFolder: "skills/china-tax-loss-harvesting",
  },
  {
    id: "china-thesis-tracker",
    titleZh: "中国投资论点追踪器",
    titleEn: "China Thesis Tracker",
    descriptionZh:
      "追踪A股投资论点——记录入场逻辑、监控关键假设、标记论点变化、评估退出条件。用于中国股票投资的投后管理。",
    descriptionEn:
      'Maintain and update investment theses for A-share portfolio positions and watchlist names. Track key data points, catalysts, milestones, and thesis validity over time. Adapted from the original thesis-tracker skill for Chinese market conventions. Triggers on "A股持仓逻辑跟踪", "投资逻辑更新", "thesis check China", "update thesis for [company]", "is my thesis still intact", or "A股持仓复盘".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/china-thesis-tracker",
  },
  {
    id: "china-variance-commentary",
    titleZh: "中国差异分析评论",
    titleEn: "China Variance Commentary",
    descriptionZh:
      "为中国基金的业绩差异生成分析评论。解释实际与预期之间的差异，适配中国企业会计准则下的科目分类和披露格式。",
    descriptionEn:
      'Write variance commentary for A-share fund performance and portfolio changes. Adapts the original variance-commentary skill for fund accounting and Chinese fund reporting conventions. Triggers on "基金业绩点评", "组合表现分析", "variance commentary fund", "基金表现分析", "业绩归因", or "commentary on [fund] performance".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/china-variance-commentary",
  },
  {
    id: "china-xlsx-author",
    titleZh: "中国Excel生成器",
    titleEn: "China XLSX Author",
    descriptionZh:
      "以无界面方式生成中国风格的.xlsx文件——用于无Excel应用的自动化代理会话中。适配中国财务表格的排版和单位惯例。",
    descriptionEn:
      'Create professional Excel workbooks for A-share financial analysis. Adapts the original xlsx-author skill for Chinese financial modeling standards, CAS conventions, and A-share formatting. Triggers on "A股Excel模型", "财务模型制作", "create model China", "build model xlsx", "制作模型", or "Excel model [company]".',
    categories: ["research-tools"],
    sourceFolder: "skills/china-xlsx-author",
  },
  {
    id: "cim-builder",
    titleZh: "CIM备忘录构建器",
    titleEn: "CIM Builder",
    descriptionZh:
      "构建机密信息备忘录（CIM）——交易概览、投资亮点、行业概述、公司描述、财务模型和附录。用于并购流程、私募融资或交易营销时使用。",
    descriptionEn:
      'Structure and draft a Confidential Information Memorandum for sell-side M&A processes. Organizes company information into a professional, investor-ready document with consistent formatting and narrative flow. Use when preparing sell-side materials, drafting a CIM, or organizing company data for a sale process. Triggers on "CIM", "confidential information memorandum", "offering memorandum", "info memo", "draft CIM", or "sell-side materials".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/cim-builder",
  },
  {
    id: "clean-data-xls",
    titleZh: "数据清洗",
    titleEn: "Clean Data XLS",
    descriptionZh:
      "清洗混乱的电子表格数据——去除空格、修复大小写不一致、转换文本型数字、标准化日期、删除重复项并标记混合类型列。用于数据混乱、不一致或需要为分析做准备时。",
    descriptionEn:
      'Clean up messy spreadsheet data — trim whitespace, fix inconsistent casing, convert numbers-stored-as-text, standardize dates, remove duplicates, and flag mixed-type columns. Use when data is messy, inconsistent, or needs prep before analysis. Triggers on "clean this data", "clean up this sheet", "normalize this data", "fix formatting", "dedupe", "standardize this column", "this data is messy".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/clean-data-xls",
  },
  {
    id: "client-report",
    titleZh: "客户报告",
    titleEn: "Client Report",
    descriptionZh:
      "为财富管理客户生成综合报告。包含投资组合摘要、业绩归因、资产配置、市场评论和个性化建议。",
    descriptionEn:
      'Generate professional client-facing performance reports with portfolio returns, allocation breakdowns, and market commentary. Suitable for quarterly or annual distribution. Triggers on "client report", "performance report", "quarterly report for [client]", "generate reports", or "client statement".',
    categories: ["wealth-risk"],
    sourceFolder: "skills/client-report",
  },
  {
    id: "client-review",
    titleZh: "客户回顾",
    titleEn: "Client Review",
    descriptionZh:
      "为客户回顾会议准备材料——投资组合业绩、目标进展、市场更新和建议调整。用于财富管理季度或年度客户回顾。",
    descriptionEn:
      'Prepare for client review meetings with portfolio performance summary, allocation analysis, talking points, and action items. Pulls together account data into a concise meeting-ready format. Use before quarterly reviews, annual checkups, or ad-hoc client meetings. Triggers on "client review", "meeting prep for [client]", "quarterly review", "prep for [client name]", or "client meeting".',
    categories: ["wealth-risk"],
    sourceFolder: "skills/client-review",
  },
  {
    id: "competitive-analysis",
    titleZh: "竞争分析",
    titleEn: "Competitive Analysis",
    descriptionZh:
      "进行全面的竞争格局分析。构建对比矩阵、评估护城河和市场份额、识别颠覆者和替代品。使用标准框架（波特五力、SWOT等）评估竞争态势。",
    descriptionEn:
      'Framework for building competitive landscape decks — market positioning, competitor deep-dives, comparative analysis, strategic synthesis. Use when the user asks for a competitive landscape, competitor analysis, peer comparison, market positioning assessment, strategic review, or investment memo deck. Also triggers on "who are the competitors to X", "benchmark X against peers", "build a market map", or any request to systematically evaluate competitive dynamics across an industry.',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/competitive-analysis",
  },
  {
    id: "comps-analysis",
    titleZh: "可比公司估值分析",
    titleEn: "Comps Analysis",
    descriptionZh:
      "执行完整的可比公司分析——构建同业组、收集财务数据和估值倍数、计算基准范围并得出隐含估值。用于估值、并购定价或IPO定价时使用。",
    descriptionEn:
      "Build institutional-grade comparable company analysis workbooks with peer groups, financial metrics, valuation multiples, benchmarking, and implied valuation.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/comps-analysis",
  },
  {
    id: "data-providers--finance-sentiment",
    titleZh: "财经情绪分析",
    titleEn: "Finance Sentiment",
    descriptionZh:
      '使用 Adanos Finance API 获取 Reddit、X.com、新闻和 Polymarket 的结构化股票情绪。当用户询问某只股票被讨论的热度、某个代码在社交平台的火热程度、某公司有多少 Polymarket 下注、各信源是否一致，或对比多只股票的情绪时使用。触发词："TSLA 社交情绪"、"NVDA 在 X.com 有多热"、"AAPL 在 Reddit 有多少提及"、"对比 AMD 与 NVDA 情绪"、"Polymarket 下注"、"看涨百分比"等。该技能只读，不下单也不修改任何内容。',
    descriptionEn:
      'Fetch structured stock sentiment across Reddit, X.com, news, and Polymarket using the Adanos Finance API. Use this skill whenever the user asks how much people are talking about a stock, how hot a ticker is on social platforms, how many Polymarket bets exist for a company, whether sources are aligned, or to compare stock sentiment across multiple tickers. Triggers include: "social sentiment on TSLA", "how hot is NVDA on X.com", "how many Reddit mentions does AAPL have", "compare sentiment on AMD vs NVDA", "how many Polymarket bets on Microsoft", "is Reddit aligned with X on META", "stock buzz", "bullish percentage", and any mention of cross-source stock sentiment research. This skill is READ-ONLY and does not place trades or modify anything.',
    categories: ["research-tools"],
    sourceFolder: "skills/data-providers/finance-sentiment",
  },
  {
    id: "data-providers--fintel-data",
    titleZh: "Fintel 机构数据",
    titleEn: "Fintel Data",
    descriptionZh:
      "通过 REST API（https://api.fintel.io/v1，X-API-KEY 头，需 FINTEL_API_KEY）或官方 MCP 服务（https://mcp.fintel.io/mcp）查询 Fintel（fintel.io）机构市场情报。只读数据：空头持仓、借券费率与可借数量、每日空头成交量、交付失败（FTD）、SEC 13F 机构持仓、SEC 3/4/5 表内幕交易、分析师目标价、评级与预测、股息与盈利历史、盈利与股息日历、收盘价 K 线、最新成交价、按代码/CUSIP/ISIN/FIGI 的安全主数据查询、排行榜、自选列表与预警。",
    descriptionEn:
      'Query Fintel (fintel.io) institutional market intelligence via the REST API at https://api.fintel.io/v1 with FINTEL_API_KEY (X-API-KEY header), or the official MCP server at https://mcp.fintel.io/mcp. Read-only data: short interest, borrow rate/fee and shares available to borrow, daily short volume, fails-to-deliver (FTD), institutional ownership from SEC 13F filings, insider transactions from SEC Form 3/4/5, analyst price targets, ratings and forecasts, dividends and earnings history, earnings and dividend calendars, EOD price bars, last trade price, security master lookup by ticker/CUSIP/ISIN/FIGI, leaderboards, watchlists and alerts. Triggers: "fintel", "fintel.io", short interest, short squeeze data, borrow rate, cost to borrow, shares available to borrow, FTD, fails to deliver, short volume, 13F holders, institutional owners, who owns X, insider buying, insider selling, Form 4 transactions, analyst price target, days to cover, short interest ratio.',
    categories: ["research-tools"],
    sourceFolder: "skills/data-providers/fintel-data",
  },
  {
    id: "data-providers--funda-data",
    titleZh: "Funda AI 金融数据",
    titleEn: "Funda Data",
    descriptionZh:
      "通过两个接口查询 Funda AI 金融数据：MCP 服务（https://funda.ai/api/mcp）用于分析师级研究综合（DCF、可比公司、财报前瞻/回顾、行业深挖、SEC 文件、电话会纪要、供应链图谱、持股流向、宏观框架）；REST API（https://api.funda.ai/v1，需 FUNDA_API_KEY）用于原始数据（实时报价、盘中 K 线、收盘价、财务报表、期权链/Greeks/GEX、供应链知识图谱、社媒情绪、新闻、日历、FRED、ESG、国会交易、AI 招聘信号）。综合/分析类问题优先用 MCP，MCP 拒绝的原始结构化数据用 REST。",
    descriptionEn:
      'Query Funda AI financial data via two surfaces: the MCP server at https://funda.ai/api/mcp for analyst-grade research synthesis (DCF, comps, earnings previews/recaps, sector deep-dives, SEC filings, transcripts, supply-chain mapping, ownership flow, macro framing) via the agent_chat tool — OR the REST API at https://api.funda.ai/v1 with FUNDA_API_KEY for raw data (real-time quotes, intraday candles, EOD prices, financial statements, options chains/greeks/GEX, supply-chain KG, social sentiment, news, calendars, FRED, ESG, congressional trades, AI hiring signals). Triggers: "funda", "funda.ai", real-time quote, stock price, intraday, balance sheet, income statement, options chain, DCF, comps, earnings preview/recap, analyst estimates, 10-K/10-Q/8-K, transcript, ownership flow, gamma exposure, supply chain, sector deep-dive, congressional trades, FRED. Prefer MCP for synthesis/analysis questions; use REST for raw structured data the MCP declines.',
    categories: ["research-tools"],
    sourceFolder: "skills/data-providers/funda-data",
  },
  {
    id: "data-providers--hormuz-strait",
    titleZh: "霍尔木兹海峡动态",
    titleEn: "Hormuz Strait",
    descriptionZh:
      "查询霍尔木兹海峡当前状况——航运通行数据、油价影响、滞留船舶、保险风险等级、外交进展与全球贸易影响。当用户询问霍尔木兹海峡、霍尔木兹咽喉、波斯湾航运风险、石油运输中断、海湾战争风险溢价、中东航运路线、经霍尔木兹的油轮交通、石油供应链风险或影响能源市场的地缘政治风险时使用。",
    descriptionEn:
      'Check the current status of the Strait of Hormuz — shipping transit data, oil price impact, stranded vessels, insurance risk levels, diplomatic developments, and global trade impact. Use this skill whenever the user asks about the Strait of Hormuz, Hormuz chokepoint, Persian Gulf shipping risk, oil transit disruption, war risk premium in the Gulf, Middle East shipping routes, tanker traffic through Hormuz, oil supply chain risk, or geopolitical risk affecting energy markets. Triggers include: "Hormuz status", "Strait of Hormuz", "is Hormuz open", "shipping through the Gulf", "oil chokepoint", "Persian Gulf tanker traffic", "war risk premium", "Hormuz crisis", "energy supply chain risk", "oil transit disruption", "Middle East shipping", any mention of Hormuz or Persian Gulf in context of oil, shipping, or geopolitical risk.',
    categories: ["research-tools"],
    sourceFolder: "skills/data-providers/hormuz-strait",
  },
  {
    id: "data-providers--hyperliquid-reader",
    titleZh: "Hyperliquid 行情读取",
    titleEn: "Hyperliquid Reader",
    descriptionZh:
      "通过 opencli（只读、公共信息 API）读取 Hyperliquid（app.hyperliquid.xyz）永续与现货市场数据。当用户需要 Hyperliquid 永续或现货市场、标记/预言机/中间价格、24 小时涨跌、资金费率（小时或年化 APR）、未平仓合约、成交量、L2 订单簿、OHLCV K 线、历史资金费率，或跨平台资金费率对比（Hyperliquid 对比 Binance 对比 Bybit）以做资金费率套利时使用。只读市场数据——无账户、订单或交易操作。",
    descriptionEn:
      'Read Hyperliquid (app.hyperliquid.xyz) perp + spot market data via opencli (read-only, public info API). Use whenever the user wants Hyperliquid perpetual or spot markets, mark/oracle/mid prices, 24h change, funding rates (hourly or annualized APR), open interest, volume, the L2 order book, OHLCV candles, historical funding, or a cross-venue funding comparison (Hyperliquid vs Binance vs Bybit) for funding arbitrage. Triggers: "Hyperliquid funding for BTC", "HL perp markets", "funding on BTC perp", "Hyperliquid order book", "HL open interest", "funding arb Hyperliquid vs Binance", "Hyperliquid candles for SOL", "Hyperliquid spot markets", "PURR price on Hyperliquid", "hyperliquid", "hyperliquid.xyz", "HL DEX". READ-ONLY market data — no account, order, or trade operations.',
    categories: ["research-tools"],
    sourceFolder: "skills/data-providers/hyperliquid-reader",
  },
  {
    id: "data-providers--tradingview-reader",
    titleZh: "TradingView 行情读取",
    titleEn: "Tradingview Reader",
    descriptionZh:
      "使用 opencli（只读）读取 TradingView 桌面应用的市场数据、新闻、预警、自选列表与筛选器结果。当用户需要报价、期权链、期权到期日、股票/加密货币/外汇/期货/债券筛选结果、涨跌幅榜、新闻标题或正文、预警列表（活跃、触发日志、离线触发）、包含彩旗标记的自选列表、代码搜索/自动补全、图表状态或本地 TradingView.app 截图时使用。该技能为只读——不执行交易、不修改自选列表、不改变图表布局。",
    descriptionEn:
      'Read TradingView desktop app for market data, news, alerts, watchlists, and screener results using opencli (read-only). Use this skill whenever the user wants quotes, options chains, options expiries, screener results across stocks/crypto/forex/futures/bonds, gainers/losers/movers, news headlines or full story bodies, alerts (active list, fire log, offline fires), watchlists including colored flag lists, symbol search/autocomplete, chart state, or screenshots from their local TradingView.app. Triggers include: "options chain for X", "IV on Y", "show me SNDK puts", "TV screener for Y sector", "screen oversold stocks", "TV gainers", "crypto by market cap", "TradingView news on AAPL", "show my watchlists", "red flag list", "list my alerts", "what alerts fired", "search TV for nvidia", "what symbol is on my chart", "screenshot NVDA chart", "TradingView IV skew", "TV expiries for X". This skill is READ-ONLY — it does NOT place trades, modify watchlists, or change chart layouts.',
    categories: ["research-tools"],
    sourceFolder: "skills/data-providers/tradingview-reader",
  },
  {
    id: "datapack-builder",
    titleZh: "数据包构建器",
    titleEn: "Datapack Builder",
    descriptionZh:
      "为投行交易流程构建全面的数据包。整合公司信息、财务数据、行业研究和估值分析，用于交易营销和尽职调查。",
    descriptionEn:
      "Build professional financial services data packs from various sources including CIMs, offering memorandums, SEC filings, web search, or MCP servers. Extract, normalize, and standardize financial data into investment committee-ready Excel workbooks with consistent structure, proper formatting, and documented assumptions. Use for M&A due diligence, private equity analysis, investment committee materials, and standardizing financial reporting across portfolio companies. Do not use for simple financial calculations or working with already-completed data packs.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/datapack-builder",
  },
  {
    id: "dcf-model",
    titleZh: "DCF估值模型",
    titleEn: "DCF Model",
    descriptionZh:
      "创建真实的DCF（现金流折现）模型进行股权估值。从SEC文件和卖方研报获取财务数据，构建完整的现金流预测和WACC计算，执行敏感性分析，并输出包含执行摘要的专业Excel模型。用于需要DCF方法估值、内在价值分析或详细财务建模时。",
    descriptionEn:
      "Real DCF (Discounted Cash Flow) model creation for equity valuation. Retrieves financial data from SEC filings and analyst reports, builds comprehensive cash flow projections with proper WACC calculations, performs sensitivity analysis, and outputs professional Excel models with executive summaries. Use when users need to value a company using DCF methodology, request intrinsic value analysis, or ask for detailed financial modeling with growth projections and terminal value calculations.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/dcf-model",
  },
  {
    id: "dd-checklist",
    titleZh: "尽职调查清单",
    titleEn: "DD Checklist",
    descriptionZh:
      "为私募股权和风险投资交易生成全面的尽职调查清单。覆盖财务、法务、商业、技术和运营层面的审查。",
    descriptionEn:
      'Generate and track comprehensive due diligence checklists tailored to the target company\'s sector, deal type, and complexity. Covers all major workstreams with request lists, status tracking, and red flag escalation. Use when kicking off diligence, organizing a data room review, or tracking outstanding items. Triggers on "dd checklist", "due diligence tracker", "diligence request list", "what do we still need", or "data room review".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/dd-checklist",
  },
  {
    id: "dd-meeting-prep",
    titleZh: "尽调会议准备",
    titleEn: "DD Meeting Prep",
    descriptionZh:
      "为尽职调查会议准备材料。从数据库中提取历史记录、生成议题、整理关键问题和证据引用。用于管理会议、卖方会议和专家访谈准备。",
    descriptionEn:
      'Prepare for due diligence meetings — management presentations, expert network calls, customer references, and advisor sessions. Generates targeted question lists, benchmarks to reference, and red flags to probe. Use before any diligence meeting or call. Triggers on "prep for management meeting", "diligence call prep", "expert call questions", "customer reference questions", or "meeting prep for [company]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/dd-meeting-prep",
  },
  {
    id: "deal-screening",
    titleZh: "交易初筛",
    titleEn: "Deal Screening",
    descriptionZh:
      "按行业、规模、增长、利润率和估值标准筛选潜在并购和投资标的。为标的池打分和排名。",
    descriptionEn:
      'Quickly screen inbound deal flow — CIMs, teasers, and broker materials — against the fund\'s investment criteria. Extracts key deal metrics, runs a pass/fail framework, and outputs a one-page screening memo. Use when reviewing new deal flow, triaging inbound materials, or deciding whether to take a first call. Triggers on "screen this deal", "review this CIM", "should we look at this", "triage this teaser", or "deal screening".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/deal-screening",
  },
  {
    id: "deal-sourcing",
    titleZh: "交易寻源",
    titleEn: "Deal Sourcing",
    descriptionZh:
      "识别和评估潜在的并购目标和投资机会。使用行业筛选、网络和数据库搜索来建立交易管道。",
    descriptionEn:
      'PE deal sourcing workflow — discover target companies, check CRM for existing relationships, and draft personalized founder outreach emails. Use when sourcing new deals, prospecting companies in a sector, or reaching out to founders. Triggers on "find companies", "source deals", "draft founder email", "check if we\'ve seen this company", or "outreach to founder".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/deal-sourcing",
  },
  {
    id: "deal-tracker",
    titleZh: "交易追踪器",
    titleEn: "Deal Tracker",
    descriptionZh: "追踪活跃交易的状态。监控里程碑、截止日期、文档和利益相关者沟通。用于交易管理。",
    descriptionEn:
      'Track multiple live deals with milestones, deadlines, action items, and status updates. Maintains a deal pipeline view and surfaces upcoming deadlines and overdue items. Use when managing a book of business, tracking process milestones, or preparing for weekly deal reviews. Triggers on "deal tracker", "deal status", "where are we on", "process update", "deal pipeline", or "weekly deal review".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/deal-tracker",
  },
  {
    id: "deck-refresh",
    titleZh: "演示文稿刷新",
    titleEn: "Deck Refresh",
    descriptionZh:
      "用最新数据刷新现有PPT演示文稿。更新图表、表格和关键指标，同时保留整体叙事和设计。用于投资者更新、董事会演示和路演。",
    descriptionEn:
      'Updates a presentation with new numbers — quarterly refreshes, earnings updates, comp rolls, rebased market data. Use whenever the user asks to "update the deck with Q4 numbers", "refresh the comps", "roll this forward", "swap in the new earnings", "change all the $485M to $512M", or any request to swap figures across an existing deck without rebuilding it.',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/deck-refresh",
  },
  {
    id: "earnings-analysis",
    titleZh: "财报分析",
    titleEn: "Earnings Analysis",
    descriptionZh:
      "分析季度盈利发布——实际业绩vs一致预期、关键驱动因素分解、管理层指引变化和股价反应。用于盈利事后分析。",
    descriptionEn:
      'Create professional equity research earnings update reports (8-12 pages, 3,000-5,000 words) analyzing quarterly results for companies already under coverage. Fast-turnaround format focusing on beat/miss analysis, key metrics, updated estimates, and revised thesis. Includes 1-3 summary tables and 8-12 charts. Use when user requests "earnings update", "quarterly update", "earnings analysis", "Q1/Q2/Q3/Q4 results", or post-earnings report.',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/earnings-analysis",
  },
  {
    id: "earnings-preview",
    titleZh: "财报预览",
    titleEn: "Earnings Preview",
    descriptionZh:
      "为即将发布的盈利生成预览报告。包含一致预期、关键指标敏感性、历史意外分析和需要关注的电话会议议题。",
    descriptionEn:
      'Build pre-earnings analysis with estimate models, scenario frameworks, and key metrics to watch. Use before a company reports quarterly earnings to prepare positioning notes, set up bull/bear scenarios, and identify what will move the stock. Triggers on "earnings preview", "what to watch for [company] earnings", "pre-earnings", "earnings setup", or "preview Q[X] for [company]".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/earnings-preview",
  },
  {
    id: "earnings-preview-beta",
    titleZh: "财报预览（Beta）",
    titleEn: "Earnings Preview (Beta)",
    descriptionZh:
      "为即将发布的盈利生成预览报告（实验版）。包含一致预期、关键指标敏感性和历史意外分析。",
    descriptionEn:
      "Generate a concise 4-5 page equity research earnings preview for a single company. Analyzes the most recent earnings transcript, competitor landscape, valuation, and recent news to produce a professional HTML report.",
    categories: ["company-fundamentals"],
    sourceFolder: "skills/earnings-preview-beta",
  },
  {
    id: "equity-research",
    titleZh: "股权研究",
    titleEn: "Equity Research",
    descriptionZh:
      "为股票撰写完整的研究报告。包含公司概况、行业分析、财务模型、估值和投资建议。用于卖方研究、买方研究或投资决策。",
    descriptionEn:
      "Generate comprehensive equity research snapshots combining analyst consensus estimates, company fundamentals, historical prices, and macroeconomic context. Use when researching stocks, comparing estimates to actuals, analyzing company financials, assessing equity valuations, or building investment cases.",
    categories: ["company-fundamentals"],
    sourceFolder: "skills/equity-research",
  },
  {
    id: "financial-plan",
    titleZh: "财务规划",
    titleEn: "Financial Plan",
    descriptionZh:
      "为个人客户制定综合财务规划。包含退休规划、教育规划、税务优化、保险分析和遗产规划。用于财富管理场景。",
    descriptionEn:
      'Build or update a comprehensive financial plan covering retirement projections, education funding, estate planning, and cash flow analysis. Use for new client onboarding, annual plan reviews, or scenario modeling. Triggers on "financial plan", "retirement plan", "can I retire", "education funding", "estate plan", "cash flow analysis", or "plan update".',
    categories: ["wealth-risk"],
    sourceFolder: "skills/financial-plan",
  },
  {
    id: "fixed-income-portfolio",
    titleZh: "固定收益投资组合",
    titleEn: "Fixed Income Portfolio",
    descriptionZh:
      "管理固定收益投资组合——久期定位、收益率曲线策略、行业配置和个券选择。用于债券组合管理和信用分析。",
    descriptionEn:
      "Review fixed income portfolios by pricing multiple bonds, retrieving reference data, analyzing cashflows, and running scenario analysis. Use when reviewing bond portfolios, computing portfolio duration and DV01, analyzing cashflow waterfalls, stress testing rate scenarios, or assessing portfolio composition.",
    categories: ["portfolio-trading"],
    sourceFolder: "skills/fixed-income-portfolio",
  },
  {
    id: "funding-digest",
    titleZh: "融资周报",
    titleEn: "Funding Digest",
    descriptionZh:
      "生成融资动态摘要——追踪风投、私募股权和战略投资者最近的融资轮次。包含交易条款、估值趋势和行业聚焦。",
    descriptionEn:
      "Generate a polished one-page PowerPoint slide summarizing key takeaways from recent funding rounds and notable capital markets activity across a user's watched sectors or companies. Use this skill when the user asks for a deal flow summary, weekly recap, funding digest, transaction roundup, or capital markets briefing. Triggers on: 'deal flow digest', 'weekly funding recap', 'deal roundup', 'transaction summary this week', 'what happened in [sector] this week', 'capital markets update', or any request to compile recent funding activity into a briefing slide. Produces a professional single-slide PPTX with key takeaways, valuation data, and Capital IQ deal links.",
    categories: ["deals-private-capital"],
    sourceFolder: "skills/funding-digest",
  },
  {
    id: "fx-carry-trade",
    titleZh: "外汇套息交易",
    titleEn: "FX Carry Trade",
    descriptionZh:
      "分析外汇套息交易机会。比较各国利率、评估汇率风险和回撤风险，构建套息交易策略。用于全球宏观和外汇交易场景。",
    descriptionEn:
      "Evaluate FX carry trade opportunities by combining spot rates, forward points, interest rate differentials, volatility surface analysis, and historical price trends. Use when analyzing carry trades, comparing FX forward curves, assessing carry-to-vol ratios, or evaluating currency pair opportunities.",
    categories: ["portfolio-trading"],
    sourceFolder: "skills/fx-carry-trade",
  },
  {
    id: "gl-recon",
    titleZh: "总账对账",
    titleEn: "GL Recon",
    descriptionZh:
      "执行总账对账——将交易和余额核对到支持文件。用于月末关账、审计准备或当科目未结清时。",
    descriptionEn:
      "Reconcile general ledger to subledger for a trade date or period — match at the position or transaction level, surface breaks, and classify each break by likely cause. Use for daily or month-end recon runs across asset classes.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/gl-recon",
  },
  {
    id: "ib-check-deck",
    titleZh: "投行检查清单",
    titleEn: "Ib Check Deck",
    descriptionZh:
      "执行为投行汇报、交易更新和客户沟通而设计的全面检查清单。包含财务数据提取、格式验证和证券业标准合规性。",
    descriptionEn:
      'Investment banking presentation quality checker. Reviews a pitch deck or client-ready presentation for (1) number consistency across slides, (2) data-narrative alignment, (3) language polish against IB standards, (4) visual and formatting QC. Use whenever the user asks to review, check, QC, proof, or do a final pass on a deck, pitch, or client materials — including requests like "check my numbers", "reconcile figures across slides", "is this client-ready", or "what am I missing before I send this out".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/ib-check-deck",
  },
  {
    id: "ic-memo",
    titleZh: "投资委员会备忘录",
    titleEn: "Ic Memo",
    descriptionZh:
      "为投资委员会决策撰写结构化备忘录。包含投资论点、估值、风险分析和建议。用于私募股权和风险投资的投委会流程。",
    descriptionEn:
      'Draft a structured investment committee memo for PE deal approval. Synthesizes due diligence findings, financial analysis, and deal terms into a professional IC-ready document. Use when preparing for investment committee, writing up a deal, or creating a formal recommendation. Triggers on "write IC memo", "investment committee memo", "deal write-up", "prepare IC materials", or "recommendation memo".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/ic-memo",
  },
  {
    id: "idea-generation",
    titleZh: "投资想法生成",
    titleEn: "Idea Generation",
    descriptionZh:
      "系统性生成投资想法——跨行业和地区筛选，应用定量筛选和定性评估。用于买方研究和投资组合构建。",
    descriptionEn:
      'Systematic stock screening and investment idea sourcing. Combines quantitative screens, thematic research, and pattern recognition to surface new long and short ideas. Use when looking for new ideas, running screens, or conducting thematic sweeps. Triggers on "idea generation", "stock screen", "find ideas", "what looks interesting", "screen for", "new ideas", or "pitch me something".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/idea-generation",
  },
  {
    id: "initiating-coverage",
    titleZh: "首次覆盖报告",
    titleEn: "Initiating Coverage",
    descriptionZh:
      "撰写完整的首次覆盖研究报告。包含公司概览、行业分析、财务模型、估值框架和投资建议。遵循卖方研究标准和最佳实践。",
    descriptionEn:
      "Create institutional-quality equity research initiation reports through a 5-task workflow. Tasks must be executed individually with verified prerequisites - (1) company research, (2) financial modeling, (3) valuation analysis, (4) chart generation, (5) final report assembly. Each task produces specific deliverables (markdown docs, Excel models, charts, or DOCX reports). Tasks 3-5 have dependencies on earlier tasks.",
    categories: ["company-fundamentals"],
    sourceFolder: "skills/initiating-coverage",
  },
  {
    id: "investment-banking--china-buyer-list",
    titleZh: "中国买方清单",
    titleEn: "China Buyer List",
    descriptionZh:
      "为中国并购交易构建潜在买方清单。筛选战略买方和财务买方，按契合度和收购能力排序。适配中国市场并购环境和买方特征。",
    descriptionEn:
      'Build a list of potential strategic and financial acquirers for A-share sell-side M&A mandates. Adapted from the original buyer-list skill for Chinese market acquirer universe. Triggers on "A股买方名单", "潜在收购方", "buyer list China", "strategic buyers China", "who would buy this A-share company", or "build buyer universe".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/investment-banking/china-buyer-list",
  },
  {
    id: "investment-banking--china-cim-builder",
    titleZh: "中国CIM备忘录构建器",
    titleEn: "China CIM Builder",
    descriptionZh:
      "构建中国市场的机密信息备忘录（CIM）。适配中国交易流程、中国特色披露要求和中文文档惯例。",
    descriptionEn:
      'Structure and draft Confidential Information Memorandums (CIMs) for A-share sell-side M&A processes. Organizes company information into professional, investor-ready documents with Chinese market context. Triggers on "A股CIM", "保密信息备忘录", "CIM China", "confidential memorandum A-share", or "offering memorandum [company]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/investment-banking/china-cim-builder",
  },
  {
    id: "investment-banking--china-competitive-analysis",
    titleZh: "中国竞争分析",
    titleEn: "China Competitive Analysis",
    descriptionZh:
      "为中国市场进行竞争格局分析。构建对比矩阵、评估护城河和市场份额。适配中国行业结构和竞争特征。",
    descriptionEn:
      'Competitive landscape analysis for A-share companies and Chinese industries. Maps competitors, compares positioning, and assesses relative strengths. Adapted from the original competitive-analysis skill for Chinese market context. Triggers on "A股竞争格局", "行业竞争分析", "competitive landscape China", "competitive analysis A-share", or "[company] competitors China".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/investment-banking/china-competitive-analysis",
  },
  {
    id: "investment-banking--china-datapack-builder",
    titleZh: "中国数据包构建器",
    titleEn: "China Datapack Builder",
    descriptionZh: "为中国投行交易流程构建全面的数据包。整合中国公司信息、财务数据和行业研究。",
    descriptionEn:
      'Build professional data packs for A-share investment banking deals — M&A due diligence, IC materials, company profiles. Adapted from the original datapack-builder skill for Chinese data sources (AkShare, 巨潮, exchange filings) and CAS accounting. Triggers on "A股数据包", "投行数据包", "datapack China", "due diligence pack A-share", or "IC data pack [company]".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/investment-banking/china-datapack-builder",
  },
  {
    id: "investment-banking--china-deal-tracker",
    titleZh: "中国交易追踪器",
    titleEn: "China Deal Tracker",
    descriptionZh:
      "追踪中国活跃交易的状态。监控里程碑、截止日期、文档和利益相关者沟通。适配中国并购和IPO交易流程。",
    descriptionEn:
      'Track A-share sell-side M&A and deal pipeline with milestones, deadlines, and action items. Adapted from the original deal-tracker skill for Chinese market deal processes. Triggers on "A股交易跟踪", "并购进度", "deal tracker China", "M&A pipeline A-share", or "track progress on [deal]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/investment-banking/china-deal-tracker",
  },
  {
    id: "investment-banking--china-merger-model",
    titleZh: "中国并购模型",
    titleEn: "China Merger Model",
    descriptionZh:
      "为中国并购交易构建并购财务模型。包含收购价格计算、资金来源与用途、增厚/摊薄分析。适配中国会计准则和税务规则。",
    descriptionEn:
      'Accretion/dilution and merger consequences analysis for A-share M&A transactions. Adapted from the original merger-model skill for Chinese GAAP, CAS accounting, and China market transaction structures. Triggers on "A股并购分析", "并购模型", "accretion dilution China", "merger model A-share", or "M&A consequences [company]".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/investment-banking/china-merger-model",
  },
  {
    id: "investment-banking--china-pitch-deck",
    titleZh: "中国路演PPT",
    titleEn: "China Pitch Deck",
    descriptionZh:
      "构建中国投行风格的交易路演演示文稿。适配中国商业演示惯例、中文排版和投资者沟通习惯。",
    descriptionEn:
      'Populate A-share investment banking pitch deck templates with data from source files. Adapted from the original pitch-deck skill for Chinese companies, A-share market data, and Chinese business context. Triggers on "A股Pitch Deck", "路演PPT", "pitch deck China", "pitch deck A-share", or "fill pitch template for [company]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/investment-banking/china-pitch-deck",
  },
  {
    id: "investment-banking--china-process-letter",
    titleZh: "中国流程函",
    titleEn: "China Process Letter",
    descriptionZh:
      "为中国并购交易撰写流程函——概述交易流程、时间表、提交要求和选择标准。适配中国交易惯例。",
    descriptionEn:
      'Draft process letters and bid instructions for A-share sell-side M&A processes. Covers indication of interest (IOI) instructions, final bid procedures, and management meeting logistics adapted for Chinese market conventions. Triggers on "A股流程函", "投标函", "process letter China", "bid instructions A-share", or "IOI instructions [company]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/investment-banking/china-process-letter",
  },
  {
    id: "investment-banking--china-strip-profile",
    titleZh: "中国剥离分析",
    titleEn: "China Strip Profile",
    descriptionZh:
      "为中国潜在交易构建公司/资产的精简财务画像。提取关键指标、市场数据和高层次估值参数。",
    descriptionEn:
      'Create one-page company profile slides (strip profiles) for A-share targets in pitch books and deal materials. Adapted from the original strip-profile skill for Chinese companies, A-share market data, and Chinese business terminology. Triggers on "A股公司简介", "公司概况", "strip profile China", "one-pager A-share", or "target profile for [company]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/investment-banking/china-strip-profile",
  },
  {
    id: "investment-banking--china-teaser",
    titleZh: "中国交易简介",
    titleEn: "China Teaser",
    descriptionZh:
      "为中国并购交易撰写匿名交易简介——突出投资亮点、财务摘要和交易概览，不透露公司名称。适配中国市场交易惯例。",
    descriptionEn:
      'Draft anonymous one-page company teasers for A-share sell-side M&A processes. Creates compelling blind profiles without revealing the company\'s identity, adapted for Chinese market conventions. Triggers on "A股Teaser", "盲审材料", "blind profile China", "anonymous teaser A-share", or "sell-side teaser".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/investment-banking/china-teaser",
  },
  {
    id: "investment-proposal",
    titleZh: "投资建议书",
    titleEn: "Investment Proposal",
    descriptionZh:
      "为客户撰写个性化的投资建议书。包含投资目标、风险承受能力评估、资产配置建议和具体标的推荐。用于财富管理新客户开发。",
    descriptionEn:
      'Create professional investment proposals for prospective clients. Covers the firm\'s approach, proposed allocation, expected outcomes, and fee structure. Use when pitching new clients or presenting a new investment strategy. Triggers on "investment proposal", "prospect presentation", "pitch new client", "proposal for [client]", or "new client presentation".',
    categories: ["wealth-risk"],
    sourceFolder: "skills/investment-proposal",
  },
  {
    id: "kyc-doc-parse",
    titleZh: "KYC文档解析",
    titleEn: "KYC Doc Parse",
    descriptionZh:
      "解析KYC/AML文件——从身份证、护照、公司注册文件和地址证明中提取结构化数据。用于合规和客户入驻流程。",
    descriptionEn:
      "Parse an investor or client onboarding packet into structured KYC fields — identity, ownership, control, source of funds, and document inventory. Use as the first step of KYC screening; output feeds the rules engine.",
    categories: ["wealth-risk"],
    sourceFolder: "skills/kyc-doc-parse",
  },
  {
    id: "kyc-rules",
    titleZh: "KYC规则引擎",
    titleEn: "KYC Rules",
    descriptionZh:
      "根据管辖区的KYC/AML要求评估客户资料——识别缺失信息、标记风险信号并生成补救步骤。",
    descriptionEn:
      "Apply the firm's KYC/AML rules grid to a parsed onboarding record — assign a risk rating, list every rule outcome with the rule cited, and flag what's missing or escalation-worthy. Use after kyc-doc-parse; this skill decides nothing, it scores and routes.",
    categories: ["wealth-risk"],
    sourceFolder: "skills/kyc-rules",
  },
  {
    id: "lbo-model",
    titleZh: "LBO估值模型",
    titleEn: "LBO Model",
    descriptionZh:
      "为私募股权交易、交易材料或投资委员会演示构建LBO（杠杆收购）模型。该技能填充公式、验证计算并确保适应任何模板结构的专业格式标准。",
    descriptionEn:
      "This skill should be used when completing LBO (Leveraged Buyout) model templates in Excel for private equity transactions, deal materials, or investment committee presentations. The skill fills in formulas, validates calculations, and ensures professional formatting standards that adapt to any template structure.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/lbo-model",
  },
  {
    id: "macro-liquidity",
    titleZh: "宏观流动性监控",
    titleEn: "Macro Liquidity",
    descriptionZh:
      "宏观流动性监控与风险预警系统。追踪4项核心指标（美联储净流动性、SOFR隔夜融资利率、MOVE国债波动率指数、日元套利交易信号），实时评估全球金融系统流动性状况，输出流动性评级与风险应对建议。",
    descriptionEn:
      "Macro liquidity monitoring and risk early-warning system. Tracks 4 core indicators (Fed Net Liquidity, SOFR, MOVE Index, Yen Carry Trade) to assess global financial system liquidity conditions and provide risk response recommendations.",
    categories: ["market-macro"],
    sourceFolder: "skills/macro-liquidity",
  },
  {
    id: "macro-rates-monitor",
    titleZh: "宏观利率监控",
    titleEn: "Macro Rates Monitor",
    descriptionZh:
      "监控宏观利率环境——追踪央行政策、收益率曲线变动、通胀预期和跨境利差。用于固定收益、外汇和资产配置决策。",
    descriptionEn:
      "Build macroeconomic and rates dashboards combining macro indicators, yield curves, inflation breakevens, and swap rates. Use when monitoring macro conditions, analyzing yield curve shape, decomposing real vs nominal rates, assessing policy rate expectations, or evaluating financial conditions.",
    categories: ["market-macro"],
    sourceFolder: "skills/macro-rates-monitor",
  },
  {
    id: "market-analysis--company-valuation",
    titleZh: "公司估值",
    titleEn: "Company Valuation",
    descriptionZh:
      "使用多种方法评估公司价值，包括现金流折现（DCF）、相对估值（倍数法）、分部加总（SOTP）以及 WACC/ERP 参数设定。当用户询问公司估值、目标价、内在价值、DCF 分析、同行估值对比或并购价值时使用。提供估值假设、敏感性分析与结论，并明确说明数据与研究目的，不构成投资建议。",
    descriptionEn:
      'Estimate the intrinsic value of a public company using DCF, relative (peer multiple) and sum-of-parts (SOTP) methods, then triangulate to an implied share price with upside/downside versus the current market price. Use this skill whenever the user asks: "what is AAPL worth", "valuation of NVDA", "fair value of TSLA", "intrinsic value", "DCF for MSFT", "build a DCF", "discounted cash flow", "WACC", "terminal value", "implied share price", "upside to fair value", "is X overvalued/undervalued", "relative valuation", "peer comparison valuation", "EV/EBITDA target", "SOTP", "sum of the parts", "how much is [company] worth", "price target from fundamentals", "value this company", or any ticker in the context of computing intrinsic or relative valuation. Default to running ALL three methods (DCF + relative + SOTP-if-applicable) and presenting a blended implied price with a sensitivity table. Do not answer valuation questions from memory — always run the workflow.',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/market-analysis/company-valuation",
  },
  {
    id: "market-analysis--earnings-preview",
    titleZh: "财报前瞻",
    titleEn: "Earnings Preview",
    descriptionZh:
      '使用 Yahoo Finance 数据生成任何股票的财报前简报。当用户想为即将到来的财报做准备、了解分析师预期、回顾公司超预期/不及预期的历史记录，或在财报电话会前快速了解情况时使用。触发词："AAPL 财报前瞻"、"TSLA 财报预期"、"MSFT 下周发财报"、"财报前瞻"、"财报前分析"、"分析师预期"、"财报设置"、"共识预期"、"EPS 预期"、"财报季前瞻"等。',
    descriptionEn:
      'Generate a pre-earnings briefing for any stock using Yahoo Finance data. Use this skill whenever the user wants to prepare for an upcoming earnings report, understand what analysts expect, review a company\'s beat/miss track record, or get a quick overview before an earnings call. Triggers include: "earnings preview for AAPL", "what to expect from TSLA earnings", "MSFT reports next week", "earnings preview", "pre-earnings analysis", "what are analysts expecting for NVDA", "earnings estimates for", "will GOOGL beat earnings", "earnings beat/miss history", "upcoming earnings", "before earnings", "earnings setup", "consensus estimates", "earnings whisper", "EPS expectations", "what\'s the street expecting", "earnings season preview", any mention of preparing for or previewing an earnings report, or any request to understand expectations ahead of a company\'s earnings date. Always use this skill when the user mentions a ticker in context of upcoming earnings, even if they don\'t say "preview" explicitly.',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/market-analysis/earnings-preview",
  },
  {
    id: "market-analysis--earnings-recap",
    titleZh: "财报回顾",
    titleEn: "Earnings Recap",
    descriptionZh:
      '使用 Yahoo Finance 数据生成任何股票的财报后分析。当用户想回顾财报发布后的情况、了解超预期/不及预期结果、查看股价反应或获取财报回顾时使用。触发词："AAPL 财报回顾"、"TSLA 财报怎么样"、"MSFT 财报结果"、"NVDA 是否超预期"、"财报后分析"、"财报惊喜"、"财报反应"、"EPS 超预期/不及预期"、"营收超预期/不及预期"、"季度业绩"等。',
    descriptionEn:
      'Generate a post-earnings analysis for any stock using Yahoo Finance data. Use when the user wants to review what happened after earnings, understand beat/miss results, see stock reaction, or get an earnings recap. Triggers: "AAPL earnings recap", "how did TSLA earnings go", "MSFT earnings results", "did NVDA beat earnings", "post-earnings analysis", "earnings surprise", "what happened with GOOGL earnings", "earnings reaction", "stock moved after earnings", "EPS beat or miss", "revenue beat or miss", "quarterly results for", "how were earnings", "AMZN reported last night", "earnings call recap", or any request about a company\'s recent earnings outcome. Use this skill when the user references a past earnings event, even if they just say "AAPL reported" or "how did they do".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/market-analysis/earnings-recap",
  },
  {
    id: "market-analysis--estimate-analysis",
    titleZh: "盈利预期分析",
    titleEn: "Estimate Analysis",
    descriptionZh:
      '使用 Yahoo Finance 数据深入分析任何股票的分析师预期与修正趋势。当用户想了解分析师预期方向、EPS 或营收预测随时间的变化、对比预期分布，或分析多期增长预测时使用。触发词："AAPL 预期分析"、"NVDA 分析师预期趋势"、"TSLA EPS 修正"、"MSFT 预期变化"、"预期修正"、"EPS 趋势"、"营收预期"、"共识变化"、"分析师预期"、"预期分布"、"预期动量"、"修正趋势"、"前瞻预期"、"下季度预期"、"年度预期"、"多空预期对比"、"预期区间"等。',
    descriptionEn:
      'Deep-dive into analyst estimates and revision trends for any stock using Yahoo Finance data. Use when the user wants to understand analyst estimate direction, how EPS or revenue forecasts changed over time, compare estimate distributions, or analyze growth projections across periods. Triggers: "estimate analysis for AAPL", "analyst estimate trends for NVDA", "EPS revisions for TSLA", "how have estimates changed for MSFT", "estimate revisions", "EPS trend", "revenue estimates", "consensus changes", "analyst estimates", "estimate distribution", "growth estimates for", "estimate momentum", "revision trend", "forward estimates", "next quarter estimates", "annual estimates", "estimate spread", "bull vs bear estimates", "estimate range", or any request about tracking or comparing analyst estimates/revisions. Use this skill when the user asks about estimates beyond a simple lookup — if they want context, trends, or analysis, this is the right skill.',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/market-analysis/estimate-analysis",
  },
  {
    id: "market-analysis--etf-premium",
    titleZh: "ETF 溢价分析",
    titleEn: "ETF Premium",
    descriptionZh:
      '通过 Yahoo Finance 计算 ETF 相对 NAV 的溢价/折价，并将单日暴涨分解为 NAV 驱动与结构性驱动（伽马挤压、做市商对冲、AP 套利受阻）。当用户询问 ETF 溢价或折价、NAV 对比、ETF 为何偏离持仓，或某波涨幅中有多少由做市商对冲驱动时使用。触发词："ETF 溢价"、"ETF 折价"、"NAV 溢价"、"SPY 是否有溢价"、"交易高于/低于 NAV"、"ETF 溢价筛选"、"ETF 套利"、"ETF 伽马挤压"、"做市商伽马敞口"、"溢价收敛"等。尤其适用于杠杆、反向、国际、债券、商品和加密货币 ETF。',
    descriptionEn:
      'Calculate ETF premium/discount vs NAV via Yahoo Finance, and decompose single-day surges into NAV-driven vs structural components (gamma squeeze, dealer hedging, blocked AP arbitrage). Use whenever the user asks about an ETF\'s premium or discount, NAV comparison, why an ETF diverged from its holdings, or how much of a move is dealer-hedging-driven. Triggers: "ETF premium", "ETF discount", "NAV premium", "is SPY at a premium", "BITO premium", "IBIT premium", "bond ETF discount", "trading above/below NAV", "ETF premium screener", "biggest discount", "compare ETF NAV", "ETF arbitrage", "ETF gamma squeeze", "ETF premium surge", "decompose ETF move", "dealer gamma exposure", "GEX for ETF", "why did this ETF jump", "premium convergence", "AP arbitrage blocked", or any request about the gap between an ETF\'s price and underlying value. Especially relevant for leveraged, inverse, international, bond, commodity, and crypto ETFs.',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/market-analysis/etf-premium",
  },
  {
    id: "market-analysis--options-payoff",
    titleZh: "期权收益曲线分析",
    titleEn: "Options Payoff",
    descriptionZh:
      '生成带动态参数控件的交互式期权收益（盈亏）曲线图。当用户分享期权持仓截图、描述期权策略，或要求可视化某笔期权交易的盈利/亏损方式时使用。触发场景：蝶式、价差（垂直/日历/对角/比例）、跨式、宽跨式、秃鹰、备兑看涨、保护性看跌、铁鹰式，或任何多腿期权结构。也适用于用户粘贴行权价、权利金、到期日，或说"展示收益"、"画出盈亏曲线"、"这笔交易长什么样"，或上传券商（IBKR、TastyTrade、Robinhood 等）截图时。',
    descriptionEn:
      'Generate an interactive options payoff curve chart with dynamic parameter controls. Use this skill whenever the user shares an options position screenshot, describes an options strategy, or asks to visualize how an options trade makes or loses money. Triggers include: any mention of butterfly, spread (vertical/calendar/diagonal/ratio), straddle, strangle, condor, covered call, protective put, iron condor, or any multi-leg options structure. Also triggers when a user pastes strike prices, premiums, expiry dates, or says things like "show me the payoff", "draw the P&L curve", "what does this trade look like", or uploads a screenshot from a broker (IBKR, TastyTrade, Robinhood, etc). Always use this skill even if the user only provides partial info — extract what you can and use defaults for the rest.',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/market-analysis/options-payoff",
  },
  {
    id: "market-analysis--saas-valuation-compression",
    titleZh: "SaaS 估值压缩分析",
    titleEn: "SaaS Valuation Compression",
    descriptionZh:
      '分析 SaaS 公司在融资轮次之间的估值压缩。当用户询问：SaaS 公司估值倍数在两轮之间变化多少、ARR 倍数为何压缩或扩张、将公司压缩程度与宏观基准对比，或解释任何 VC 支持的软件公司估值变化驱动因素时使用。触发词："估值压缩"、"ARR 倍数"、"轮间估值"、"倍数变化"，或用户要求比较公司融资轮次时。',
    descriptionEn:
      'Analyze SaaS company valuation compression between funding rounds. Use this skill whenever the user asks about: how much a SaaS company\'s valuation multiple changed between rounds, why the ARR multiple compressed or expanded, comparing a company\'s compression to macro benchmarks, or explaining what drove valuation changes for any VC-backed software company. Trigger on phrases like "valuation compression", "ARR multiple", "round-to-round valuation", "multiple change", or when the user asks to compare a company\'s funding rounds. Always use this skill for any multi-round SaaS valuation analysis — do not try to answer from memory alone.',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/market-analysis/saas-valuation-compression",
  },
  {
    id: "market-analysis--sepa-strategy",
    titleZh: "SEPA 趋势交易策略",
    titleEn: "SEPA Strategy",
    descriptionZh:
      "使用 Mark Minervini 的 SEPA（精确买入点分析）方法论分析股票。当用户提到 SEPA、Minervini、超级业绩股、趋势模板、VCP（波动收缩形态）、第二阶段上升趋势、阶段分析、枢轴点突破，或询问成长股筛选标准时使用。也用于评估股票是否符合波段交易买入条件、均线多头排列（价格在 50MA 之上、150MA 之上、200MA 之上）、带量确认的突破质量、基于风险百分比的仓位计算，以及杯柄、平台整理、牛旗、高位紧旗等整理形态。",
    descriptionEn:
      'Analyze stocks using Mark Minervini\'s SEPA (Specific Entry Point Analysis) methodology. Use this skill whenever the user mentions SEPA, Minervini, superperformance, trend template, VCP (Volatility Contraction Pattern), Stage 2 uptrend, stage analysis, pivot point breakout, or asks about growth stock screening criteria. Also triggers when the user wants to evaluate whether a stock meets swing trading entry criteria, check moving average alignment (bullish stacking: price above 50MA above 150MA above 200MA), assess breakout quality with volume confirmation, calculate position sizing based on risk percentage, or identify consolidation patterns like cup-with-handle, flat base, bull flag, or high tight flag. Use this skill even when the user simply asks "should I buy this stock" or "is this a good setup" in the context of growth/momentum trading, or when they share a stock chart and want pattern analysis.',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/market-analysis/sepa-strategy",
  },
  {
    id: "market-analysis--stock-correlation",
    titleZh: "股票相关性分析",
    titleEn: "Stock Correlation",
    descriptionZh:
      '分析股票相关性，发现关联公司与交易配对。当用户询问相关股票、关联公司、板块同行、交易配对，或两只及以上股票如何同向/反向波动时使用。触发词："与 NVDA 相关的股票"、"与 AMD 相关的股票"、"AAPL 和 MSFT 的相关性"、"什么和它同涨同跌"、"板块同行"、"配对交易"、"联动股票"、"beta"、"相对表现"、"供应链伙伴"、"相关性矩阵"、"共同波动"、"相关代码"、"半导体同行"、"对冲配对"、"实现相关性"、"滚动相关性"等。若只给一个代码，则推断用户想要相关同行。',
    descriptionEn:
      'Analyze stock correlations to find related companies and trading pairs. Use when the user asks about correlated stocks, related companies, sector peers, trading pairs, or how two or more stocks move together. Triggers: "what correlates with NVDA", "find stocks related to AMD", "correlation between AAPL and MSFT", "what moves with", "sector peers", "pair trading", "correlated stocks", "when NVDA drops what else drops", "stocks that move together", "beta to", "relative performance", "supply chain partners", "correlation matrix", "co-movement", "related tickers", "sympathy plays", "semiconductor peers", "hedging pair", "realized correlation", "rolling correlation", or any request about stocks that move in tandem or inversely. Also triggers for well-known pairs like AMD/NVDA, GOOGL/AVGO, LITE/COHR. If only one ticker is provided, infer the user wants correlated peers.',
    categories: ["market-macro"],
    sourceFolder: "skills/market-analysis/stock-correlation",
  },
  {
    id: "market-analysis--stock-liquidity",
    titleZh: "股票流动性分析",
    titleEn: "Stock Liquidity",
    descriptionZh:
      '基于 Yahoo Finance 数据，通过买卖价差、成交量分布、订单簿深度、市场冲击估算与换手率分析股票流动性。当用户询问流动性、交易成本、买卖价差、市场深度、成交量分析、滑点、市场冲击、换手率，或一只股票在不明显推动价格的情况下交易的难易程度时使用。触发词："AAPL 流动性如何"、"买卖价差"、"成交量分析"、"订单簿深度"、"大单市场冲击"、"换手率"、"滑点估算"、"流动性对比"、"价差分析"、"ADTV"、"Amihud 非流动性"、"成交金额"、"执行成本估算"、"流动性评分"、低价股、小盘股或流动性差的证券。',
    descriptionEn:
      'Analyze stock liquidity using bid-ask spreads, volume profiles, order book depth, market impact estimates, and turnover ratios via Yahoo Finance data. Use this skill whenever the user asks about liquidity, trading costs, bid-ask spread, market depth, volume analysis, slippage, market impact, turnover ratio, or how easy/hard it is to trade a stock without moving the price. Triggers: "how liquid is AAPL", "bid-ask spread", "volume analysis", "order book depth", "market impact of a large order", "turnover ratio", "slippage estimate", "can I trade 100k shares without moving the price", "liquidity comparison", "spread analysis", "ADTV", "Amihud illiquidity", "dollar volume", "execution cost estimate", "liquidity score", penny stocks, small caps, or thinly traded securities.',
    categories: ["market-macro"],
    sourceFolder: "skills/market-analysis/stock-liquidity",
  },
  {
    id: "market-analysis--yfinance-data",
    titleZh: "yfinance 数据获取",
    titleEn: "Yfinance Data",
    descriptionZh:
      '使用 yfinance Python 库获取金融与市场数据。当用户需要股票价格、历史行情、财务报表、期权链、股息、盈利、分析师评级或任何市场数据时使用。触发场景：股票价格、股票代码（AAPL、MSFT、TSLA 等）、"获取财报数据"、"查看盈利"、"下载股票数据"、"期权链"、"股息历史"、"资产负债表"、"利润表"、"现金流量"、"分析师目标价"、"机构持仓"、"股票对比"、"筛选股票"，或任何涉及 Yahoo Finance 数据的请求。',
    descriptionEn:
      'Fetch financial and market data using the yfinance Python library. Use this skill whenever the user asks for stock prices, historical data, financial statements, options chains, dividends, earnings, analyst recommendations, or any market data. Triggers include: any mention of stock price, ticker symbol (AAPL, MSFT, TSLA, etc.), "get me the financials", "show earnings", "what\'s the price of", "download stock data", "options chain", "dividend history", "balance sheet", "income statement", "cash flow", "analyst targets", "institutional holders", "compare stocks", "screen for stocks", or any request involving Yahoo Finance data. Always use this skill even if the user only provides a ticker — infer intent from context.',
    categories: ["research-tools"],
    sourceFolder: "skills/market-analysis/yfinance-data",
  },
  {
    id: "merger-model",
    titleZh: "并购模型",
    titleEn: "Merger Model",
    descriptionZh:
      "为并购交易构建全面的并购财务模型。包含收购价格计算、资金来源与用途、增厚/摊薄分析和协同效应建模。",
    descriptionEn:
      'Build accretion/dilution analysis for M&A transactions. Models pro forma EPS impact, synergy sensitivities, and purchase price allocation. Use when evaluating a potential acquisition, preparing merger consequences analysis for a pitch, or advising on deal terms. Triggers on "merger model", "accretion dilution", "M&A model", "pro forma EPS", "merger consequences", or "deal impact analysis".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/merger-model",
  },
  {
    id: "model-update",
    titleZh: "模型更新",
    titleEn: "Model Update",
    descriptionZh:
      "用最新数据更新现有财务模型。滚动前推预测期、引入最新实际数据、刷新假设条件。用于季度模型维护。",
    descriptionEn:
      'Update financial models with new data — quarterly earnings, management guidance, macro changes, or revised assumptions. Adjusts estimates, recalculates valuation, and flags material changes. Use after earnings, guidance updates, or when assumptions need refreshing. Triggers on "update model", "plug earnings", "refresh estimates", "update numbers for [company]", "new guidance", or "revise estimates".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/model-update",
  },
  {
    id: "morning-note",
    titleZh: "晨报",
    titleEn: "Morning Note",
    descriptionZh:
      "生成每日市场晨报。包含隔夜市场回顾、今日经济日历、新闻摘要和投资组合点评。用于投资团队的每日启动。",
    descriptionEn:
      'Draft concise morning meeting notes summarizing overnight developments, trade ideas, and key events for coverage stocks. Designed for the 7am morning meeting format — tight, opinionated, actionable. Triggers on "morning note", "morning meeting", "what happened overnight", "trade idea", "morning call prep", or "daily note".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/morning-note",
  },
  {
    id: "nav-tieout",
    titleZh: "净值核对",
    titleEn: "NAV Tieout",
    descriptionZh:
      "核对基金净值（NAV）——将基金管理的资产估值核对到托管银行记录。用于基金净值计算和投资者报告。",
    descriptionEn:
      "Tie an LP statement to the fund's NAV pack — recompute the LP's capital account from the NAV components and flag any line that doesn't agree. Use before LP statements are distributed.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/nav-tieout",
  },
  {
    id: "operations--china-kyc-doc-parse",
    titleZh: "中国KYC文档解析",
    titleEn: "China KYC Doc Parse",
    descriptionZh:
      "解析中国KYC/AML文件——从身份证、护照、营业执照和地址证明中提取结构化数据。适配中国合规和客户入驻流程要求。",
    descriptionEn:
      'Parse and extract data from Chinese identity documents for KYC (Know Your Customer) compliance. Adapts the original kyc-doc-parse skill for Chinese ID cards, business licenses, and domestic compliance requirements. Triggers on "A股KYC", "身份文件解析", "parse Chinese ID", "KYC document", "客户身份识别", or "extract [document type]".',
    categories: ["wealth-risk"],
    sourceFolder: "skills/operations/china-kyc-doc-parse",
  },
  {
    id: "operations--china-kyc-rules",
    titleZh: "中国KYC规则引擎",
    titleEn: "China KYC Rules",
    descriptionZh:
      "根据中国管辖区KYC/AML要求评估客户资料——识别缺失信息、标记风险信号并生成补救步骤。",
    descriptionEn:
      'Chinese KYC (Know Your Customer) and AML (Anti-Money Laundering) rules for financial services. Adapts the original kyc-rules skill for Chinese regulatory requirements and domestic compliance. Triggers on "A股KYC规则", "中国反洗钱", "AML rules China", "KYC compliance China", "反洗钱规定", or "KYC requirements".',
    categories: ["wealth-risk"],
    sourceFolder: "skills/operations/china-kyc-rules",
  },
  {
    id: "option-vol-analysis",
    titleZh: "期权波动率分析",
    titleEn: "Option Vol Analysis",
    descriptionZh:
      "分析期权隐含波动率——构建波动率曲面、识别偏斜和期限结构异常、评估波动率交易策略。用于衍生品交易和风险管理。",
    descriptionEn:
      "Analyze option volatility by combining vol surface data, option pricing with Greeks, and historical price data to assess implied vs realized volatility. Use when pricing options, analyzing volatility surfaces, computing Greeks, assessing vol premiums, or evaluating vol trading strategies.",
    categories: ["portfolio-trading"],
    sourceFolder: "skills/option-vol-analysis",
  },
  {
    id: "pitch-deck",
    titleZh: "路演PPT",
    titleEn: "Pitch Deck",
    descriptionZh:
      "构建投行标准的交易路演演示文稿。包含交易概览、投资亮点、行业分析、财务摘要和交易结构。用于客户推介和交易营销。",
    descriptionEn:
      "Populates investment banking pitch deck templates with data from source files. Use when: user provides a PowerPoint template to fill in, user has source data (Excel/CSV) to populate into slides, user mentions populating or filling a pitch deck template, or user needs to transfer data into existing slide layouts. Not for creating presentations from scratch.",
    categories: ["deals-private-capital"],
    sourceFolder: "skills/pitch-deck",
  },
  {
    id: "portfolio-monitoring",
    titleZh: "投资组合监控",
    titleEn: "Portfolio Monitoring",
    descriptionZh:
      "监控投资组合公司的表现——追踪关键业绩指标、财务指标和预警信号。为私募股权投资组合管理生成定期更新。",
    descriptionEn:
      'Track and analyze portfolio company performance against plan. Ingests monthly/quarterly financial packages (Excel, PDF), extracts KPIs, flags variances to budget, and produces summary dashboards. Use when reviewing portfolio company financials, preparing board materials, or monitoring covenant compliance. Triggers on "review portfolio company", "monthly financials", "how is [company] performing", "covenant check", or "portfolio update".',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/portfolio-monitoring",
  },
  {
    id: "portfolio-rebalance",
    titleZh: "投资组合再平衡",
    titleEn: "Portfolio Rebalance",
    descriptionZh:
      "分析投资组合的再平衡需求。计算偏离度、生成交易建议、考虑税务影响和交易成本。用于财富管理和资产管理。",
    descriptionEn:
      'Analyze portfolio allocation drift and generate rebalancing trade recommendations across accounts. Considers tax implications, transaction costs, and wash sale rules. Triggers on "rebalance", "portfolio drift", "allocation check", "rebalancing trades", or "my portfolio is out of balance".',
    categories: ["portfolio-trading"],
    sourceFolder: "skills/portfolio-rebalance",
  },
  {
    id: "ppt-template-creator",
    titleZh: "PPT模板创建器",
    titleEn: "PPT Template Creator",
    descriptionZh:
      "创建符合行业标准的金融机构PPT模板。按品牌设置幻灯片母版、布局、配色方案和排版。",
    descriptionEn:
      "Creates self-contained PPT template SKILLS (not presentations) from user-provided PowerPoint templates. Use ONLY when a user wants to create a reusable skill from their template. For creating actual presentations, use the pptx skill instead.",
    categories: ["research-tools"],
    sourceFolder: "skills/ppt-template-creator",
  },
  {
    id: "pptx-author",
    titleZh: "PPT生成器",
    titleEn: "PPTX Author",
    descriptionZh: "以无界面方式生成.pptx演示文稿文件——用于无Office应用运行的自动化代理会话中。",
    descriptionEn:
      "Produce a .pptx file on disk (headless) instead of driving a live PowerPoint document — for managed-agent sessions with no open Office app.",
    categories: ["research-tools"],
    sourceFolder: "skills/pptx-author",
  },
  {
    id: "private-equity--china-ai-readiness",
    titleZh: "中国AI就绪度扫描",
    titleEn: "China AI Readiness",
    descriptionZh:
      "扫描中国投资组合中最高杠杆的AI机会并排名。接收中国被投公司的季度更新和财务数据，识别AI快速获胜机会。",
    descriptionEn:
      'Assess an A-share portfolio company\'s AI readiness for China-focused private equity investments. Evaluates data infrastructure, technology stack, talent, and AI adoption opportunities in the Chinese market context. Triggers on "A股公司AI评估", "AI readiness China", "AI assessment portfolio company", "AI转型评估", or "artificial intelligence readiness [company]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/private-equity/china-ai-readiness",
  },
  {
    id: "private-equity--china-dd-checklist",
    titleZh: "中国尽职调查清单",
    titleEn: "China DD Checklist",
    descriptionZh:
      "为中国私募股权和风险投资交易生成全面的尽职调查清单。覆盖中国特色的财务、法务、商业、技术和运营审查。",
    descriptionEn:
      'Due diligence checklists for A-share investments and M&A transactions. Adapted from the original dd-checklist skill for Chinese market due diligence requirements, regulatory filings, and business practices. Triggers on "A股尽调清单", "尽调清单", "due diligence China", "DD checklist A-share", "尽调checklist [company]", or "due diligence questions [company]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/private-equity/china-dd-checklist",
  },
  {
    id: "private-equity--china-dd-meeting-prep",
    titleZh: "中国尽调会议准备",
    titleEn: "China DD Meeting Prep",
    descriptionZh:
      "为中国尽职调查会议准备材料。从数据库中提取历史记录、生成议题、整理关键问题。适配中国商业沟通习惯。",
    descriptionEn:
      'Prepare management meeting materials and question lists for A-share investment due diligence. Adapted from the original dd-meeting-prep skill for Chinese business culture and management meeting conventions. Triggers on "A股尽调会议准备", "管理层会议准备", "management meeting China", "DD meeting prep", "管理層访谈准备", or "prepare for management meeting [company]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/private-equity/china-dd-meeting-prep",
  },
  {
    id: "private-equity--china-deal-sourcing",
    titleZh: "中国交易寻源",
    titleEn: "China Deal Sourcing",
    descriptionZh:
      "识别和评估中国的潜在并购目标和投资机会。使用行业筛选和中国本土数据库来建立交易管道。",
    descriptionEn:
      'Discover and evaluate potential A-share investment opportunities for China-focused private equity and investment strategies. Adapted from the original deal-sourcing skill for Chinese market structure, data sources, and business practices. Triggers on "A股项目挖掘", "投资项目发现", "deal sourcing China", "find A-share deals", "sourcing opportunities China", or "discover investment targets".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/private-equity/china-deal-sourcing",
  },
  {
    id: "private-equity--china-ic-memo",
    titleZh: "中国投资委员会备忘录",
    titleEn: "China IC Memo",
    descriptionZh:
      "为中国投资委员会决策撰写结构化备忘录。包含投资论点、估值、风险分析和建议。适配中国私募股权和风险投资的投委会流程。",
    descriptionEn:
      'Investment Committee memo drafting for China-focused PE/IB deals. Adapted from the original ic-memo skill for Chinese market context, terminology, and decision frameworks. Triggers on "A股投委会", "IC Memo", "investment memo China", "投委会材料", "IC memo A-share", or "committee memo [company]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/private-equity/china-ic-memo",
  },
  {
    id: "private-equity--china-portfolio-monitoring",
    titleZh: "中国投资组合监控",
    titleEn: "China Portfolio Monitoring",
    descriptionZh:
      "监控中国投资组合公司的表现——追踪关键业绩指标、财务指标和预警信号。为中国私募股权管理生成定期更新。",
    descriptionEn:
      'Track and report on A-share portfolio company performance for China-focused private equity funds. Monitors KPIs, financials, and strategic milestones. Adapted from the original portfolio-monitoring skill for Chinese portfolio companies. Triggers on "A股投后管理", "基金投后监控", "portfolio monitoring China", "monitor portfolio company", "投后报告", or "portfolio company review".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/private-equity/china-portfolio-monitoring",
  },
  {
    id: "private-equity--china-returns-analysis",
    titleZh: "中国投资回报分析",
    titleEn: "China Returns Analysis",
    descriptionZh:
      "分析中国私募股权投资回报——计算IRR、MOIC、DPI和TVPI。按投资和基金层面分解业绩。适配中国LP报告。",
    descriptionEn:
      'IRR and MOIC analysis for China-focused private equity and investment funds. Adapted from the original returns-analysis skill for RMB/USD fund structures, China market conventions, and Chinese portfolio companies. Triggers on "A股基金回报", "IRR分析", "returns China", "MOIC analysis China", "基金业绩分析", or "portfolio returns review".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/private-equity/china-returns-analysis",
  },
  {
    id: "private-equity--china-unit-economics",
    titleZh: "中国单位经济学分析",
    titleEn: "China Unit Economics",
    descriptionZh:
      "分析中国公司单位经济学——CAC、LTV、毛利率、贡献利润和投资回收期。按客户群组、地域和产品线分解。",
    descriptionEn:
      'Unit economics analysis for China-focused portfolio companies. Adapted from the original unit-economics skill for Chinese business models, pricing, and market dynamics. Triggers on "A股单位经济模型", "单元经济模型", "unit economics China", "unit economics [company]", "LTV/CAC China", or "Cohort analysis [company]".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/private-equity/china-unit-economics",
  },
  {
    id: "private-equity--china-value-creation-plan",
    titleZh: "中国价值创造计划",
    titleEn: "China Value Creation Plan",
    descriptionZh:
      "为中国被投公司制定价值创造计划。识别运营改进杠杆、设定里程碑、分配资源和建模财务影响。",
    descriptionEn:
      'Post-close value creation plans for China-focused portfolio companies. Adapted from the original value-creation-plan skill for Chinese business context, management practices, and market dynamics. Triggers on "A股投后增值", "价值提升计划", "value creation plan China", "100-day plan China", "portfolio value creation", or "value creation [company]".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/private-equity/china-value-creation-plan",
  },
  {
    id: "process-letter",
    titleZh: "流程函",
    titleEn: "Process Letter",
    descriptionZh:
      "为并购交易撰写流程函——概述交易流程、时间表、提交要求和选择标准。用于买方寻源和交易执行。",
    descriptionEn:
      'Draft process letters and bid instructions for sell-side M&A processes. Covers initial indication of interest (IOI) instructions, final bid procedures, and management meeting logistics. Triggers on "process letter", "bid instructions", "IOI letter", "bid procedures", "final round letter", or "management meeting invite".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/process-letter",
  },
  {
    id: "returns-analysis",
    titleZh: "投资回报分析",
    titleEn: "Returns Analysis",
    descriptionZh:
      "分析私募股权投资回报——计算IRR、MOIC、DPI和TVPI。按投资和基金层面分解业绩。用于LP报告和投资组合审查。",
    descriptionEn:
      'Build quick IRR/MOIC sensitivity tables for PE deal evaluation. Models returns across entry multiple, leverage, exit multiple, growth, and hold period scenarios. Use when sizing up a deal, stress-testing assumptions, or preparing IC returns exhibits. Triggers on "returns analysis", "IRR sensitivity", "MOIC table", "what\'s the return at", "model the returns", or "back of the envelope".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/returns-analysis",
  },
  {
    id: "roll-forward",
    titleZh: "滚动前推",
    titleEn: "Roll Forward",
    descriptionZh:
      "对基金会计科目执行滚动前推——从前一期间到当前期间，验证每个科目的期初→变动→期末逻辑。用于基金管理和月末结账。",
    descriptionEn:
      "Build a roll-forward schedule for a balance-sheet account — beginning balance plus activity less reversals equals ending balance, with each component tied to GL. Use for month-end close packages and audit support.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/roll-forward",
  },
  {
    id: "sector-overview",
    titleZh: "行业概览",
    titleEn: "Sector Overview",
    descriptionZh:
      "生成行业板块的深度概览报告。包含市场规模、竞争格局、增长驱动因素、监管趋势和主要上市公司分析。",
    descriptionEn:
      'Create comprehensive industry and sector landscape reports covering market dynamics, competitive positioning, key players, and thematic trends. Use for client requests, sector initiations, thematic research pieces, or internal knowledge building. Triggers on "sector overview", "industry report", "market landscape", "sector analysis", "industry deep dive", or "thematic research".',
    categories: ["market-macro"],
    sourceFolder: "skills/sector-overview",
  },
  {
    id: "skill-creator",
    titleZh: "技能创建器",
    titleEn: "Skill Creator",
    descriptionZh:
      "创建和打包新的Agent技能。包含技能定义、参数配置、工作流设计和使用示例。用于扩展LingWu的技能库。",
    descriptionEn:
      "Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations.",
    categories: ["research-tools"],
    sourceFolder: "skills/skill-creator",
  },
  {
    id: "social-readers--discord-reader",
    titleZh: "Discord 阅读器",
    titleEn: "Discord Reader",
    descriptionZh:
      '使用 opencli（只读）读取 Discord 以进行财经研究。当用户想读取 Discord 频道、在交易服务器中搜索消息、查看公会/频道信息、监控加密货币或市场讨论群，或从 Discord 收集金融情绪时使用。触发词："查看我的 Discord"、"搜索 Discord"、"读取 Discord 消息"、"交易 Discord 里有什么"、"列出我的服务器"、"BTC 的 Discord 情绪"等。该技能只读——不支持发送消息、表情回应或任何写操作。',
    descriptionEn:
      'Read Discord for financial research using opencli (read-only). Use this skill whenever the user wants to read Discord channels, search for messages in trading servers, view guild/channel info, monitor crypto or market discussion groups, or gather financial sentiment from Discord. Triggers include: "check my Discord", "search Discord for", "read Discord messages", "what\'s happening in the trading Discord", "show Discord channels", "list my servers", "Discord sentiment on BTC", "what are people saying in Discord about AAPL", "monitor crypto Discord", any mention of Discord in context of reading financial news, market research, or trading community discussions. This skill is READ-ONLY — it does NOT support sending messages, reacting, or any write operations.',
    categories: ["research-tools"],
    sourceFolder: "skills/social-readers/discord-reader",
  },
  {
    id: "social-readers--linkedin-reader",
    titleZh: "LinkedIn 阅读器",
    titleEn: "Linkedin Reader",
    descriptionZh:
      '使用 opencli（只读）读取 LinkedIn 以进行财经研究。当用户想读取 LinkedIn 信息流、搜索金融/交易行业职位、查看关于市场或财报的专业帖子，或从 LinkedIn 收集专业情绪时使用。触发词："查看我的 LinkedIn 信息流"、"搜索 LinkedIn"、"关于 AAPL 的 LinkedIn 帖子"、"LinkedIn 金融职位"、"LinkedIn 市场情绪"、"分析师在 LinkedIn 上说什么"等。该技能只读——不支持发帖、点赞、评论、加好友或任何写操作。',
    descriptionEn:
      'Read LinkedIn for financial research using opencli (read-only). Use this skill whenever the user wants to read their LinkedIn feed, search for jobs in the finance/trading industry, view professional posts about markets or earnings, or gather professional sentiment from LinkedIn. Triggers include: "check my LinkedIn feed", "search LinkedIn for", "LinkedIn posts about", "what\'s on LinkedIn about AAPL", "finance jobs on LinkedIn", "LinkedIn market sentiment", "who\'s posting about earnings on LinkedIn", "LinkedIn feed", "professional network buzz", "what are analysts saying on LinkedIn", any mention of LinkedIn in context of reading financial news, market research, job searches, or professional commentary. This skill is READ-ONLY — it does NOT support posting, liking, commenting, connecting, or any write operations.',
    categories: ["research-tools"],
    sourceFolder: "skills/social-readers/linkedin-reader",
  },
  {
    id: "social-readers--opencli-reader",
    titleZh: "opencli 通用阅读器",
    titleEn: "OpenCLI Reader",
    descriptionZh:
      'opencli 覆盖但本仓库没有专门阅读器时的通用只读后备方案——包括 Yahoo Finance、Bloomberg、Reuters、Barchart、东方财富、雪球、新浪财经、Reddit、HackerNews、Substack、Medium、微博、Bilibili、小红书、知乎、arXiv、Google Scholar、Apple Podcasts、小宇宙、Spotify、YouTube、微信公众号、Amazon 等。触发词："用 opencli 读取"、"抓取 HackerNews 首页"、"读取 Reddit r/wallstreetbets"、"获取东方财富热门股票"、"拉取雪球信息流"、"获取 Bloomberg 市场头条"等。信源匹配时优先使用 twitter-reader、linkedin-reader、discord-reader、telegram-reader 或 yc-reader。只读——绝不调用写操作。',
    descriptionEn:
      'Generic read-only fallback for any source opencli covers but this repo has no dedicated reader for — Yahoo Finance, Bloomberg, Reuters, Barchart, Eastmoney, Xueqiu, Sinafinance, Reddit, HackerNews, Substack, Medium, Weibo, Bilibili, Xiaohongshu, Zhihu, arXiv, Google Scholar, Apple Podcasts, Xiaoyuzhou, Spotify, YouTube, Weixin, Amazon, and more. Triggers: "use opencli to read", "grab the frontpage from hackernews", "read reddit r/wallstreetbets", "fetch Eastmoney hot stocks", "pull Xueqiu feed", "get Bloomberg markets headlines", "search arXiv for", any request to read from a site where a specialized skill does not exist but opencli does. FALLBACK — prefer twitter-reader, linkedin-reader, discord-reader, telegram-reader, or yc-reader when the source matches. READ-ONLY — never invoke write operations.',
    categories: ["research-tools"],
    sourceFolder: "skills/social-readers/opencli-reader",
  },
  {
    id: "social-readers--telegram-reader",
    titleZh: "Telegram 阅读器",
    titleEn: "Telegram Reader",
    descriptionZh:
      '使用 tdl（只读）读取 Telegram 频道与群组，获取财经新闻与市场研究。当用户想读取 Telegram 频道、导出财经 Telegram 群的消息、列出 Telegram 会话、在频道中搜索新闻，或从 Telegram 收集市场情报时使用。触发词："查看我的 Telegram"、"读取 Telegram 频道"、"Telegram 新闻"、"从 X 导出消息"、"列出我的 Telegram 会话"、"加密 Telegram"、"市场新闻 Telegram"等。该技能只读——不支持发消息、加入频道或任何写操作。',
    descriptionEn:
      'Read Telegram channels and groups for financial news and market research using tdl (read-only). Use this skill whenever the user wants to read Telegram channels, export messages from financial Telegram groups, list their Telegram chats, search for news in Telegram channels, or gather market intelligence from Telegram. Triggers include: "check my Telegram", "read Telegram channel", "Telegram news", "what\'s new in my Telegram channels", "export messages from", "list my Telegram chats", "financial news on Telegram", "crypto Telegram", "market news Telegram", any mention of Telegram in context of reading financial news, crypto signals, or market research. This skill is READ-ONLY — it does NOT support sending messages, joining channels, or any write operations.',
    categories: ["research-tools"],
    sourceFolder: "skills/social-readers/telegram-reader",
  },
  {
    id: "social-readers--twitter-reader",
    titleZh: "Twitter/X 阅读器",
    titleEn: "Twitter Reader",
    descriptionZh:
      '使用 opencli（只读）读取 Twitter/X 以进行财经研究。当用户想读取 Twitter 信息流、搜索财经推文、查看书签、查询用户资料，或从 Twitter/X 收集市场情绪时使用。触发词："查看我的信息流"、"搜索 Twitter"、"显示我的书签"、"查询 @user"、"关于 X 的热门话题"、"Twitter 市场情绪"、"大家怎么评价 AAPL"、"fintwit"等。该技能只读——不支持发帖、点赞、转推或任何写操作。',
    descriptionEn:
      'Read Twitter/X for financial research using opencli (read-only). Use this skill whenever the user wants to read their Twitter feed, search for financial tweets, view bookmarks, look up user profiles, or gather market sentiment from Twitter/X. Triggers include: "check my feed", "search Twitter for", "show my bookmarks", "who follows", "look up @user", "what\'s trending about", "market sentiment on Twitter", "what are people saying about AAPL", "recent tweets from @elonmusk", "show me @user\'s posts", "fintwit", any mention of Twitter/X in context of reading financial news or market research. This skill is READ-ONLY — it does NOT support posting, liking, retweeting, or any write operations.',
    categories: ["research-tools"],
    sourceFolder: "skills/social-readers/twitter-reader",
  },
  {
    id: "social-readers--yc-reader",
    titleZh: "YC 初创公司查询",
    titleEn: "YC Reader",
    descriptionZh:
      '使用 yc-oss API（只读）查询 Y Combinator 公司、批次与创业生态数据。当用户想研究 YC 支持的初创公司、查找特定批次或行业的公司、查看哪些 YC 公司在招聘、探索顶级 YC 公司，或按行业/标签分析初创趋势时使用。触发词："YC 金融科技公司"、"最新 YC 批次有哪些"、"YC 招聘中"、"顶级 Y Combinator 公司"、"AI 标签的 YC 公司"、"W25 批次"、"YC 数据"等。API 为每日更新的静态 JSON 数据集。',
    descriptionEn:
      'Look up Y Combinator companies, batches, and startup ecosystem data using the yc-oss API (read-only). Use this skill whenever the user wants to research YC-backed startups, find companies in a specific batch or industry, check which YC companies are hiring, explore top YC companies, or analyze startup trends by sector or tag. Triggers include: "YC companies in fintech", "who\'s in the latest YC batch", "YC startups hiring", "top Y Combinator companies", "find YC companies tagged AI", "W25 batch", "S24 companies", "YC stats", "Y Combinator portfolio", "startup research", "which YC companies do X", "venture research on YC", any mention of Y Combinator, YC batch, or YC-backed companies in the context of startup research, venture analysis, or market intelligence. This is a read-only data source — the API is a static JSON dataset updated daily.',
    categories: ["research-tools"],
    sourceFolder: "skills/social-readers/yc-reader",
  },
  {
    id: "startup-tools--startup-analysis",
    titleZh: "初创公司分析",
    titleEn: "Startup Analysis",
    descriptionZh:
      '从三个视角分析初创公司：VC 投资人、求职者与 CEO/创始人。当用户想评估一家初创公司、判断是否投资或加入、进行尽职调查、评估初创公司的工作邀约、理解公司竞争地位，或评估公司健康度与发展轨迹时使用。触发词："分析这家初创公司"、"我该加入 X 吗"、"X 值得投资吗"、"尽职调查"、"这家初创公司怎么样"、"公司分析"等。默认提供全部三个视角的分析。',
    descriptionEn:
      'Analyze a startup from three perspectives: VC investor, job applicant, and CEO/founder. Use this skill whenever the user wants to evaluate a startup, assess whether to invest in or join a startup, do due diligence, evaluate a job offer from a startup, understand a startup\'s competitive position, or assess company health and trajectory. Triggers: "analyze this startup", "should I join [company]", "is [company] a good investment", "evaluate [company]", "due diligence on [company]", "what do you think of [startup]", "should I take this startup job offer", "how healthy is [company]", "startup assessment", "company analysis", "is [company] worth joining", "what\'s the outlook for [company]", "research [company] for me", any mention of evaluating or assessing a startup or tech company from investment, career, or strategic perspectives — provide all three perspectives by default.',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/startup-tools/startup-analysis",
  },
  {
    id: "strip-profile",
    titleZh: "剥离分析",
    titleEn: "Fsi Strip Profile",
    descriptionZh:
      "为潜在交易构建公司/资产的精简财务画像。提取关键指标、市场数据和高层次估值参数。用于交易流程的初始阶段。",
    descriptionEn:
      "For potential transactions, build a simplified financial profile of the company/assets. Extract key metrics, market data, and high-level valuation parameters. Used in the initial stage of the trading workflow.",
    categories: ["deals-private-capital"],
    sourceFolder: "skills/strip-profile",
  },
  {
    id: "swap-curve-strategy",
    titleZh: "互换曲线策略",
    titleEn: "Swap Curve Strategy",
    descriptionZh:
      "分析利率互换曲线以进行策略定位——识别曲线交易、蝴蝶策略和基差互换机会。用于固定收益交易和利率风险管理。",
    descriptionEn:
      "Analyze the interest rate swap curve by pricing swaps at multiple tenors, overlaying government and inflation curves, and identifying curve trade opportunities. Use when analyzing swap curves, computing swap spreads, decomposing real rates, identifying steepener/flattener/butterfly trades, or comparing swap rates across currencies.",
    categories: ["portfolio-trading"],
    sourceFolder: "skills/swap-curve-strategy",
  },
  {
    id: "tax-loss-harvesting",
    titleZh: "税务亏损收割",
    titleEn: "Tax Loss Harvesting",
    descriptionZh:
      "分析投资组合的税务亏损收割机会——识别亏损仓位、计算税务节省、建议替代证券和管理洗售规则。用于财富管理的税务优化。",
    descriptionEn:
      'Identify tax-loss harvesting opportunities across taxable accounts. Finds positions with unrealized losses, suggests replacement securities, and tracks wash sale windows. Triggers on "tax-loss harvesting", "TLH", "harvest losses", "tax losses", "unrealized losses", or "year-end tax planning".',
    categories: ["wealth-risk"],
    sourceFolder: "skills/tax-loss-harvesting",
  },
  {
    id: "tear-sheet",
    titleZh: "简要信息表",
    titleEn: "Tear Sheet",
    descriptionZh:
      "为公司、交易或投资机会生成一页式简要信息表。按不同受众需求定制——企业开发、股权研究、投行并购或销售/BD。",
    descriptionEn:
      "Generate professional company tear sheets using S&P Capital IQ data via the Kensho LLM-ready API MCP server. Use this skill whenever the user asks for a tear sheet, company one-pager, company profile, fact sheet, company snapshot, or company overview document — especially when they mention a specific company name or ticker. Also trigger when users ask for equity research summaries, M&A company profiles, corporate development target profiles, sales/BD meeting prep documents, or any concise single-company financial summary. This skill supports four audience types: equity research, investment banking/M&A, corporate development, and sales/business development. If the user doesn't specify an audience, ask. Works for both public and private companies.",
    categories: ["company-fundamentals"],
    sourceFolder: "skills/tear-sheet",
  },
  {
    id: "teaser",
    titleZh: "交易简介",
    titleEn: "Teaser",
    descriptionZh:
      "为并购交易撰写匿名交易简介——突出投资亮点、财务摘要和交易概览，不透露公司名称。用于买方寻源的第一阶段。",
    descriptionEn:
      'Draft anonymous one-page company teasers for sell-side M&A processes. Creates a compelling summary without revealing the company\'s identity, designed to gauge buyer interest before NDA execution. Triggers on "teaser", "blind teaser", "anonymous profile", "one-pager for process", or "draft teaser for sell-side".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/teaser",
  },
  {
    id: "tech-earnings-deepdive",
    titleZh: "科技股财报深度分析",
    titleEn: "Tech Earnings Deepdive",
    descriptionZh:
      "科技股财报深度分析与多视角投资备忘录系统。覆盖16个分析模块（A-P）、6种投资哲学视角、机构级证据标准、反偏见框架和可执行决策系统。",
    descriptionEn:
      "Tech Stock Earnings Deep Dive Analysis and Multi-Perspective Investment Memo System. Covers 16 analysis modules (A-P), 6 investment philosophy perspectives, institutional-grade evidence standards, anti-bias framework, and actionable decision system.",
    categories: ["company-fundamentals"],
    sourceFolder: "skills/tech-earnings-deepdive",
  },
  {
    id: "thesis-tracker",
    titleZh: "投资论点追踪器",
    titleEn: "Thesis Tracker",
    descriptionZh:
      "追踪投资论点——记录入场逻辑、监控关键假设、标记论点变化并评估退出条件。用于投后管理和投资组合审查。",
    descriptionEn:
      'Maintain and update investment theses for portfolio positions and watchlist names. Track key data points, catalysts, and thesis milestones over time. Use when updating a thesis with new information, reviewing position rationale, or checking if a thesis is still intact. Triggers on "update thesis for [company]", "is my thesis still intact", "thesis check", "add data point to [company]", or "review my positions".',
    categories: ["company-fundamentals"],
    sourceFolder: "skills/thesis-tracker",
  },
  {
    id: "ui-tools--generative-ui",
    titleZh: "生成式 UI 设计",
    titleEn: "Generative UI",
    descriptionZh:
      'Claude 内置生成式 UI（show_widget 工具，在 claude.ai 对话中内联渲染交互式 HTML/SVG 组件）的设计系统与规范。提供完整的 Anthropic "Imagine" 设计系统，使 Claude 无需先调用 read_me 即可产出高质量组件。当用户要求可视化数据、创建交互式图表、构建仪表盘、渲染图表、画流程图、展示线框稿、创建交互式讲解，或产出纯文本/markdown 之外的任何视觉内容时使用。触发词："展示"、"可视化"、"画"、"图表"、"仪表盘"、"流程图"、"组件"、"交互式"、"线框稿"、"演示"等。',
    descriptionEn:
      'Design system and guidelines for Claude\'s built-in generative UI — the show_widget tool that renders interactive HTML/SVG widgets inline in claude.ai conversations. This skill provides the complete Anthropic "Imagine" design system so Claude produces high-quality widgets without needing to call read_me first. Use this skill whenever the user asks to visualize data, create an interactive chart, build a dashboard, render a diagram, draw a flowchart, show a mockup, create an interactive explainer, or produce any visual content beyond plain text or markdown. Triggers include: "show me", "visualize", "draw", "chart", "dashboard", "diagram", "flowchart", "widget", "interactive", "mockup", "illustrate", "explain how X works" (with visual), or any request for visual/interactive output. Also triggers when the user wants to display financial data visually, create comparison grids, or build tools with sliders, toggles, or live-updating displays.',
    categories: ["research-tools"],
    sourceFolder: "skills/ui-tools/generative-ui",
  },
  {
    id: "unit-economics",
    titleZh: "单位经济学分析",
    titleEn: "Unit Economics",
    descriptionZh:
      "分析单位经济学——CAC、LTV、毛利率、贡献利润和投资回收期。按客户群组、地域和产品线分解单位盈利能力。用于私募股权和风险投资尽职调查。",
    descriptionEn:
      'Analyze unit economics for PE targets — ARR cohorts, LTV/CAC, net retention, payback periods, revenue quality, and margin waterfall. Essential for software/SaaS, recurring revenue, and subscription businesses. Use when evaluating revenue quality, building a cohort analysis, or assessing customer economics. Triggers on "unit economics", "cohort analysis", "ARR analysis", "LTV CAC", "net retention", "revenue quality", or "customer economics".',
    categories: ["valuation-modeling"],
    sourceFolder: "skills/unit-economics",
  },
  {
    id: "us-market-sentiment",
    titleZh: "美股市场情绪监控",
    titleEn: "US Market Sentiment",
    descriptionZh:
      "美股市场情绪监控与仓位建议系统。通过追踪5项核心指标（NAAIM持仓指数、机构股票配置、散户净买入、标普500远期市盈率、对冲基金杠杆率），评估市场情绪并输出仓位调整建议。",
    descriptionEn:
      "US stock market sentiment monitoring and position recommendation system. Evaluates market sentiment by tracking 5 core indicators (NAAIM, Institutional Allocation, Retail Buying, Forward P/E, Hedge Fund Leverage) and outputs sentiment ratings and position recommendations.",
    categories: ["market-macro"],
    sourceFolder: "skills/us-market-sentiment",
  },
  {
    id: "us-value-investing",
    titleZh: "美股价值投资分析",
    titleEn: "US Value Investing",
    descriptionZh:
      "美股价值投资分析框架。通过4个核心维度（ROE可持续性、债务安全性、自由现金流质量、经济护城河评估）系统评估上市公司，输出投资评级与分析逻辑。",
    descriptionEn:
      "US stock value investing analysis framework. Systematically evaluates listed companies through 4 core dimensions (ROE sustainability, debt safety, free cash flow quality, economic moat assessment), outputting investment ratings and analytical reasoning.",
    categories: ["company-fundamentals"],
    sourceFolder: "skills/us-value-investing",
  },
  {
    id: "value-creation-plan",
    titleZh: "价值创造计划",
    titleEn: "Value Creation Plan",
    descriptionZh:
      "为被投公司制定价值创造计划。识别运营改进杠杆、设定里程碑、分配资源和建模财务影响。用于私募股权的投后价值创造。",
    descriptionEn:
      'Structure post-acquisition value creation plans with revenue, cost, and operational levers mapped to an EBITDA bridge. Includes 100-day priorities, KPI targets, and accountability frameworks. Use when planning post-close execution, preparing operating partner materials, or building a board-ready value creation roadmap. Triggers on "value creation plan", "100-day plan", "post-close plan", "EBITDA bridge", "operating plan", or "value creation levers".',
    categories: ["deals-private-capital"],
    sourceFolder: "skills/value-creation-plan",
  },
  {
    id: "variance-commentary",
    titleZh: "差异分析评论",
    titleEn: "Variance Commentary",
    descriptionZh:
      "为基金业绩差异撰写分析评论——解释实际与预期之间的差异。按资产类别、地域和策略分解差异来源。",
    descriptionEn:
      "Write flux commentary for every P&L and balance-sheet line over threshold — current vs prior period and vs budget, with the driver explained from underlying activity. Use for the month-end close package and management reporting.",
    categories: ["valuation-modeling"],
    sourceFolder: "skills/variance-commentary",
  },
  {
    id: "wealth-management--china-client-report",
    titleZh: "中国客户报告",
    titleEn: "China Client Report",
    descriptionZh:
      "为中国财富管理客户生成综合报告。包含投资组合摘要、业绩归因、资产配置和个性化建议。",
    descriptionEn:
      'Generate client-facing performance reports for Chinese wealth management clients. Adapted from the original client-report skill for A-share portfolios, Chinese regulatory requirements, and local reporting conventions. Triggers on "A股客户报告", "客户持仓报告", "client report China", "wealth report A-share", "客户业绩报告", or "portfolio report for [client]".',
    categories: ["wealth-risk"],
    sourceFolder: "skills/wealth-management/china-client-report",
  },
  {
    id: "wealth-management--china-client-review",
    titleZh: "中国客户回顾",
    titleEn: "China Client Review",
    descriptionZh: "为中国客户回顾会议准备材料——投资组合业绩、目标进展、市场更新和建议调整。",
    descriptionEn:
      'Prepare for Chinese wealth management client meetings with performance summaries, talking points, and relationship context. Adapted from the original client-review skill for A-share portfolios and Chinese client conventions. Triggers on "A股客户回顾", "客户会议准备", "client review China", "wealth client review", "客户回访准备", or "prepare for client meeting [client]".',
    categories: ["wealth-risk"],
    sourceFolder: "skills/wealth-management/china-client-review",
  },
  {
    id: "wealth-management--china-financial-plan",
    titleZh: "中国财务规划",
    titleEn: "China Financial Plan",
    descriptionZh:
      "为中国个人客户制定综合财务规划。包含退休规划、教育规划、税务优化和保险分析。适配中国市场产品和服务。",
    descriptionEn:
      'Create financial plans for Chinese wealth management clients covering retirement, education, estate, and cash-flow planning. Adapted from the original financial-plan skill for Chinese tax rules, social security, and local financial products. Triggers on "A股财务规划", "理财规划", "financial plan China", "retirement plan China", "财务规划客户", "退休规划", "教育金规划", or "comprehensive financial plan".',
    categories: ["wealth-risk"],
    sourceFolder: "skills/wealth-management/china-financial-plan",
  },
  {
    id: "wealth-management--china-investment-proposal",
    titleZh: "中国投资建议书",
    titleEn: "China Investment Proposal",
    descriptionZh:
      "为中国客户撰写个性化的投资建议书。包含投资目标、风险承受能力评估、资产配置建议和具体标的推荐。",
    descriptionEn:
      'Draft investment proposals for Chinese wealth management clients. Creates structured proposals with investment rationale, product recommendations, and risk disclosures. Adapted from the original investment-proposal skill for A-share products and Chinese regulatory requirements. Triggers on "A股投资建议书", "投资方案", "investment proposal China", "proposal for [client]", "investment recommendation A-share", or "build investment proposal".',
    categories: ["wealth-risk"],
    sourceFolder: "skills/wealth-management/china-investment-proposal",
  },
  {
    id: "wealth-management--china-portfolio-rebalance",
    titleZh: "中国投资组合再平衡",
    titleEn: "China Portfolio Rebalance",
    descriptionZh:
      "分析中国投资组合的再平衡需求。计算偏离度、生成交易建议、考虑税务影响和交易成本。",
    descriptionEn:
      'Portfolio rebalancing analysis for A-share wealth management portfolios. Analyzes allocation drift, generates rebalancing trades, and optimizes for tax efficiency. Adapted from the original portfolio-rebalance skill for Chinese portfolios. Triggers on "A股组合再平衡", "调仓", "rebalance China", "portfolio rebalance A-share", "rebalance portfolio", or "adjust allocation [client]".',
    categories: ["wealth-risk"],
    sourceFolder: "skills/wealth-management/china-portfolio-rebalance",
  },
  {
    id: "xlsx-author",
    titleZh: "Excel生成器",
    titleEn: "XLSX Author",
    descriptionZh: "以无界面方式在磁盘上生成.xlsx文件——用于无Office应用运行的自动化代理会话中。",
    descriptionEn:
      "Produce a .xlsx file on disk (headless) instead of driving a live Excel workbook — for managed-agent sessions with no open Office app.",
    categories: ["research-tools"],
    sourceFolder: "skills/xlsx-author",
  },
];
