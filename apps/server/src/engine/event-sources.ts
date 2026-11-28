import type { Holding } from "../../../../packages/domain/src/agent.ts";
import type { PolicyDrift } from "../../../../packages/domain/src/investor.ts";
import {
  POLICY_BASIS_LABELS,
  POLICY_MARKET_NOTE,
} from "../../../../packages/domain/src/investor.ts";
import type { Store } from "../db.ts";
import type { HarvestedEvent } from "./event-triage.ts";

/** 账户级（无标的）事件的占位符号：风险测评到期等，走同一条事件管线。 */
export const ACCOUNT_SYMBOL = "PROFILE";

const DAY_MS = 24 * 60 * 60 * 1000;
/** 到期提醒的天数档：≤30 天先打招呼，7/3/1 天各再提醒一次。 */
const MATURITY_THRESHOLDS = [1, 3, 7, 30];

/** 首次亏损的「是否已在成本下方」状态，用来实现「首次」语义与回落后再触发。 */
const LOSS_STATE_KIND = "first-loss-state";

interface LossState {
  id: string;
  symbol: string;
  /** 上一次评估时是否已跌破成本。 */
  belowCost: boolean;
  /** 已触发的首次亏损次数；用作去重键区分每一次「首次」。 */
  dropCount: number;
  updatedAt: string;
}

/** 首次亏损判定的输入：需要现价与成本，缺一不产生事件。 */
export interface FirstLossInput {
  symbol: string;
  name?: string;
  avgCost: number;
  price: number;
}

/** 选中最小的、仍 ≥ daysUntil 的天数档（1 / 3 / 7 / 30）。 */
export function maturityBucket(daysUntil: number): number | undefined {
  for (const threshold of MATURITY_THRESHOLDS) if (daysUntil <= threshold) return threshold;
  return undefined;
}

/**
 * A4 事件源：到期事项 / 首次亏损 / 配置偏离。
 *
 * 生成器只产出候选事件，判级与去重全部沿用既有管线；缺关键数据一律不产出，
 * 绝不用 0 或默认值假设（PRD A4 验收）。
 */
export class EventSourcesService {
  constructor(private readonly db: Store) {}

  /** 到期事项：持仓 maturity_date 落在 30 天内，按天数档各产出一条。 */
  maturityEvents(_owner: string, holdings: Holding[], now = new Date()): HarvestedEvent[] {
    const events: HarvestedEvent[] = [];
    for (const holding of holdings) {
      if (!holding.maturity_date) continue;
      const maturityAt = holding.maturity_date.slice(0, 10);
      const parsed = Date.parse(`${maturityAt}T00:00:00.000Z`);
      if (!Number.isFinite(parsed)) continue;
      const daysUntil = Math.ceil((parsed - now.getTime()) / DAY_MS);
      if (daysUntil < 0) continue;
      const bucket = maturityBucket(daysUntil);
      if (bucket === undefined) continue;
      const label = holding.name?.trim() || holding.symbol_code;
      events.push({
        source: "maturity",
        candidate: {
          type: "maturity",
          symbol: holding.symbol_code,
          title: `「${label}」将于 ${daysUntil} 天后到期`,
          body: `到期日 ${maturityAt}，当前持仓 ${holding.quantity} ${holding.currency === "CNY" ? "份" : "股"}。仅提示到期与需要确认的信息，不提供买卖建议。`,
          daysUntil,
          dedupeKey: `maturity:${holding.symbol_code}:d${bucket}`,
          source: "maturity",
        },
      });
    }
    return events;
  }

  /**
   * 首次亏损：仅在「从未亏 → 首次亏」跃迁时产出；回到成本上方后再跌破可再次触发。
   * 用落库状态记录跃迁，避免每天重复，也避免深亏时反复轰炸。
   */
  async firstLossEvents(
    owner: string,
    positions: FirstLossInput[],
    now = new Date(),
  ): Promise<HarvestedEvent[]> {
    const events: HarvestedEvent[] = [];
    for (const position of positions) {
      // 缺关键数据不产生事件：没有有效成本或现价就不猜。
      if (!(position.avgCost > 0) || !Number.isFinite(position.price) || position.price <= 0)
        continue;
      const id = position.symbol;
      const state = await this.db.get<LossState>(owner, LOSS_STATE_KIND, id);
      const belowCost = position.price < position.avgCost;
      const wasBelow = state?.belowCost ?? false;
      const dropCount = state?.dropCount ?? 0;

      if (belowCost && !wasBelow) {
        const lossPercent = ((position.avgCost - position.price) / position.avgCost) * 100;
        const label = position.name?.trim() || position.symbol;
        const nextCount = dropCount + 1;
        events.push({
          source: "first_loss",
          candidate: {
            type: "first_loss",
            symbol: position.symbol,
            title: `「${label}」首次跌破成本`,
            body: `现价 ${position.price} 低于成本 ${position.avgCost}，浮亏约 ${lossPercent.toFixed(2)}%。这是首次跌破成本的提示，不构成交易建议。`,
            magnitudePercent: Number(lossPercent.toFixed(2)),
            dedupeKey: `first_loss:${position.symbol}:d${nextCount}`,
            source: "first_loss",
          },
        });
        await this.db.put<LossState>(owner, LOSS_STATE_KIND, {
          id,
          symbol: position.symbol,
          belowCost: true,
          dropCount: nextCount,
          updatedAt: now.toISOString(),
        });
      } else if (!belowCost && wasBelow) {
        // 回到成本上方：重新武装，下一次跌破可再次触发。
        await this.db.put<LossState>(owner, LOSS_STATE_KIND, {
          id,
          symbol: position.symbol,
          belowCost: false,
          dropCount,
          updatedAt: now.toISOString(),
        });
      }
    }
    return events;
  }

  /** 配置偏离：仅市值口径的 breach 产出候选；成本口径只展示、绝不触发事件。 */
  policyDriftEvents(drifts: PolicyDrift[]): HarvestedEvent[] {
    const events: HarvestedEvent[] = [];
    for (const drift of drifts) {
      if (drift.valueBasis !== "market") continue;
      const breaches = drift.rows.filter((row) => row.status === "breach");
      if (breaches.length === 0) continue;
      const scope = drift.currency ? `${drift.currency} ` : "";
      const detail = breaches
        .map(
          (row) =>
            `${row.label ?? row.key} ${row.actual}%（目标 ${row.target}%，偏离 ${row.drift > 0 ? "+" : ""}${row.drift} 点）`,
        )
        .join("；");
      events.push({
        source: "policy_drift",
        candidate: {
          type: "policy_drift",
          symbol: drift.portfolioId,
          title: `配置偏离：${POLICY_BASIS_LABELS[drift.basis]}越界（${scope}${breaches.length} 项）`,
          body: `${detail}。${drift.note ?? POLICY_MARKET_NOTE}。`,
          dedupeKey: `policy_drift:${drift.portfolioId}:${drift.basis}:${drift.currency ?? "ALL"}`,
          source: "policy_drift",
          occurredAt: drift.computedAt,
        },
      });
    }
    return events;
  }
}
