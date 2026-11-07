/**
 * 投融资决策信号识别（规则兜底）。
 *
 * 当模型未能主动调用 write_memory 时，用关键词规则在任务结果 / 对话文本里
 * 捕捉投融资决策信号，自动沉淀一条 kind="decision" 的记忆。
 *
 * 设计约束：
 *   - 规则只做「触发」，不做「结构化抽取」——阶段/金额/条款等字段由模型主动调用时提供；
 *     规则兜底只保证「有决策发生时，至少有一条记忆被记下」，避免漏记。
 *   - 阈值：命中 ≥1 条信号即可触发，避免过度敏感导致误记。
 */

export interface DealSignalHit {
  /** 命中的投融资阶段。 */
  stage: NonNullable<import("../../../../packages/domain/src/agent.ts").DealHabits["stage"]>;
  /** 命中的关键词（用于审计 / 调试）。 */
  keyword: string;
}

/** 关键词 → 投融资阶段映射。顺序即优先级，先命中者优先。 */
const DEAL_SIGNALS: ReadonlyArray<{ pattern: RegExp; stage: DealSignalHit["stage"] }> = [
  { pattern: /尽调|尽职调查|due\s*diligence/i, stage: "尽调" },
  { pattern: /交割|打款|closing|settlement/i, stage: "交割" },
  { pattern: /退出|回购|上市|ipo|并购|m&a|被收购|转让/i, stage: "退出" },
  { pattern: /减持|清仓|卖出|止损|止盈|平仓/i, stage: "决策" },
  { pattern: /加仓|买入|建仓|增持|入金|打新|申购/i, stage: "决策" },
  { pattern: /谈判|对价|条款|估值|valutation|定价|pre-money|post-money/i, stage: "谈判" },
  { pattern: /发现.*机会|看中|筛选出|挖掘出|物色/i, stage: "发现" },
];

/**
 * 扫描文本，返回命中的投融资决策信号（可能为空）。
 */
export function detectDealSignals(text: string): DealSignalHit[] {
  const trimmed = text?.trim();
  if (!trimmed) return [];
  const hits: DealSignalHit[] = [];
  const seenStages = new Set<string>();
  for (const { pattern, stage } of DEAL_SIGNALS) {
    if (seenStages.has(stage)) continue;
    const match = pattern.exec(trimmed);
    if (match) {
      hits.push({ stage, keyword: match[0] });
      seenStages.add(stage);
    }
  }
  return hits;
}

/**
 * 判断一段文本是否值得沉淀为一条投融资决策记忆。
 * 规则兜底偏保守：至少命中一个明确阶段信号才返回 true。
 */
export function isDealDecision(text: string): boolean {
  return detectDealSignals(text).length > 0;
}
