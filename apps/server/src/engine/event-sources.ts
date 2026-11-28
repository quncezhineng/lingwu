import type { Holding } from "../../../../packages/domain/src/agent.ts";
import type {
  EventCandidateInput,
  InvestmentPolicy,
  PolicyDrift,
} from "../../../../packages/domain/src/investor.ts";
import { POLICY_BASIS_LABELS } from "../../../../packages/domain/src/investor.ts";
import type { Position } from "./portfolios.ts";

/** 声明式事件源的统一输入。 */
export interface EventSourceInput {
  now: Date;
  holdings: Holding[];
  positions: Position[];
  /** 有目标配置时才有配置偏离事件。 */
  policy?: InvestmentPolicy;
  /** 该组合的偏离结果（市值口径）；与 policy 一起传入才产出偏离事件。 */
  drift?: PolicyDrift[];
}

/** 到期提醒的观察窗口：进入这个天数以内才产出事件。 */
export const MATURITY_HORIZON_DAYS = 30;
/** 配置偏离事件只对 breach 档产出（warning 只展示不打扰）。 */
export const DRIFT_EVENT_STATUS = "breach";

/**
 * A4 新增的三类事件源（纯函数，不落库）。
 *
 * 与价格/新闻事件不同，这三类都从**用户自己的持仓与目标**派生：
 *   - maturity：持仓的到期日临近（或已到期）；
 *   - first_loss：持仓跌破成本（按亏损带分桶，越亏越深分桶变化才再提醒）；
 *   - policy_drift：组合实际配置偏离目标超过容忍带。
 * 生成后统一交给 EventTriageService 判级落库。
 */
export function generateEventCandidates(input: EventSourceInput): EventCandidateInput[] {
  return [
    ...maturityEvents(input.holdings, input.now),
    ...firstLossEvents(input.positions),
    ...policyDriftEvents(input.policy, input.drift),
  ];
}

/** 到期事项：按「到期日 + 阶段」分桶，一天最多四档提醒（D30 / D7 / D1 / 已到期）。 */
export function maturityEvents(
  holdings: Holding[],
  now: Date,
  horizonDays = MATURITY_HORIZON_DAYS,
): EventCandidateInput[] {
  const events: EventCandidateInput[] = [];
  for (const holding of holdings) {
    if (!holding.maturity_date) continue;
    const daysUntil = daysUntilDate(holding.maturity_date, now);
    if (daysUntil > horizonDays) continue;
    const phase = maturityPhase(daysUntil);
    const name = holding.name?.trim() || holding.symbol_code;
    const title =
      daysUntil < 0
        ? `${name} 已到期（${holding.maturity_date}）`
        : `${name} 将于 ${holding.maturity_date} 到期（还剩 ${daysUntil} 天）`;
    events.push({
      type: "maturity",
      symbol: holding.symbol_code,
      title,
      body: `持仓 ${holding.quantity} 份，到期日 ${holding.maturity_date}。请确认是否续投或赎回。`,
      daysUntil,
      dedupeBucket: `${holding.maturity_date}:${phase}`,
      source: "maturity",
    });
  }
  return events;
}

/**
 * 首次亏损：跌破成本时提醒。按亏损带（每 5 个百分点）分桶，
 * 同带不重复打扰；继续下探跨带，或回本后再跌破更深的带时才再次提醒。
 */
export function firstLossEvents(positions: Position[]): EventCandidateInput[] {
  const events: EventCandidateInput[] = [];
  for (const position of positions) {
    const pnlPct = position.pnl_pct;
    if (pnlPct === null || pnlPct === undefined || pnlPct >= 0) continue;
    const magnitude = Math.abs(pnlPct);
    const band = Math.floor(magnitude / 5) * 5;
    const name = position.name?.trim() || position.symbol_code;
    events.push({
      type: "first_loss",
      symbol: position.symbol_code,
      title: `${name} 跌破成本，浮亏 ${magnitude.toFixed(2)}%`,
      body: `当前价 ${position.price ?? "-"}，成本 ${position.avg_cost}（${position.currency}），浮亏 ${Math.abs(position.pnl ?? 0).toFixed(2)}。`,
      magnitudePercent: round2(magnitude),
      dedupeBucket: `loss-${band}`,
      source: "first_loss",
    });
  }
  return events;
}

/**
 * 配置偏离：只对超出容忍带（breach）的维度产出，按「币种 + 维度 + key」分桶，
 * 修正回带内后再次偏离才会重新提醒。偏离是组合级事件，用 `^PORTFOLIO` 占位标的。
 */
export function policyDriftEvents(
  policy?: InvestmentPolicy,
  drift?: PolicyDrift[],
): EventCandidateInput[] {
  if (!policy || !drift) return [];
  const events: EventCandidateInput[] = [];
  for (const part of drift) {
    // 只在市值口径上产出（成本口径仅对比展示，不做事件源）。
    if (part.valueBasis !== "market") continue;
    for (const row of part.rows) {
      if (row.status !== DRIFT_EVENT_STATUS) continue;
      const sign = row.drift > 0 ? "+" : "";
      events.push({
        type: "policy_drift",
        symbol: "^PORTFOLIO",
        title: `${POLICY_BASIS_LABELS[policy.basis]}「${row.label}」偏离目标 ${sign}${row.drift}%`,
        body: `目标 ${row.target}%，实际 ${row.actual}%，容忍带 ±${row.band} 个百分点，已超出。口径：${part.note}。`,
        magnitudePercent: round2(Math.abs(row.drift)),
        dedupeBucket: `${part.currency ?? "ALL"}:${policy.basis}:${row.key}`,
        source: "policy_drift",
      });
    }
  }
  return events;
}

/** 到期阶段：把「还剩 N 天」压成四档，避免天天提醒。 */
function maturityPhase(daysUntil: number): string {
  if (daysUntil < 0) return "matured";
  if (daysUntil <= 1) return "D1";
  if (daysUntil <= 7) return "D7";
  return "D30";
}

/** 目标日期距今天的天数（按 UTC 自然日，避免时区抖动）。 */
export function daysUntilDate(dateStr: string, now: Date): number {
  const target = Date.parse(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(target)) return Number.POSITIVE_INFINITY;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86400000);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
