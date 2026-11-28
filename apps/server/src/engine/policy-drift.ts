import type {
  InvestmentPolicy,
  PolicyBasis,
  PolicyDrift,
  PolicyDriftRow,
  PolicyInput,
} from "../../../../packages/domain/src/investor.ts";
import {
  POLICY_MARKET_NOTE,
  POLICY_WARNING_RATIO,
} from "../../../../packages/domain/src/investor.ts";
import type { MonitorCurrency } from "../../../../packages/domain/src/monitor-currency.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";
import type { PortfoliosService, Position } from "./portfolios.ts";

const POLICY_KIND = "investment-policies";

/** 记录多带一个 id 字段（= portfolioId），满足 Store.put 主键约定。 */
type PolicyRecord = InvestmentPolicy & { id: string };

const round2 = (value: number) => Math.max(0, Math.round(value * 100) / 100);

/**
 * 把某个标的归到政策维度的一个键上（PRD A2）。
 *
 * - sector / region / currency 直接取持仓字段；
 * - asset_class 无原始字段，用名称 / 行业关键词做保守归类，识别不到按「股票」处理。
 */
export function keyOfPosition(basis: PolicyBasis, position: Position): string {
  switch (basis) {
    case "asset_class":
      return classifyAssetClass(position);
    case "sector":
      return position.sector?.trim() || "未分类";
    case "region":
      return position.market;
    case "currency":
      return position.currency;
  }
}

const BOND_PATTERN = /债|bond|固定收益|票据|存款|理财/;
const CASH_PATTERN = /现金|货币|货币基金|cash|money.?market|mmf/;

/** 资产类别：债 / 现金 / 股票，识别不到按股票（占比最高的默认档）。 */
export function classifyAssetClass(
  position: Pick<Position, "symbol_code" | "name" | "sector">,
): string {
  const text =
    `${position.name ?? ""} ${position.sector ?? ""} ${position.symbol_code}`.toLowerCase();
  if (CASH_PATTERN.test(text)) return "cash";
  if (BOND_PATTERN.test(text)) return "bond";
  return "equity";
}

/** 偏离分档：越界=breach，越过 80% 带宽=warning，其余 within。 */
export function driftStatus(drift: number, bandPercent: number): PolicyDriftRow["status"] {
  const magnitude = Math.abs(drift);
  if (magnitude > bandPercent) return "breach";
  if (bandPercent > 0 && magnitude > bandPercent * POLICY_WARNING_RATIO) return "warning";
  return "within";
}

function buildDrift(args: {
  policy: InvestmentPolicy;
  valueBasis: "market" | "cost";
  currency?: MonitorCurrency;
  actuals: Map<string, number>;
  computedAt: string;
  note?: string;
}): PolicyDrift {
  const rows: PolicyDriftRow[] = [];
  const covered = new Set<string>();
  for (const target of args.policy.targets) {
    const actual = round2(args.actuals.get(target.key) ?? 0);
    rows.push({
      key: target.key,
      label: target.label,
      target: target.targetPercent,
      actual,
      drift: round2(actual - target.targetPercent),
      status: driftStatus(actual - target.targetPercent, target.bandPercent),
    });
    covered.add(target.key);
  }
  // 有实际暴露但政策里没定义的键：目标 0，任何暴露都算越界，提醒用户补充计划。
  for (const [key, value] of args.actuals) {
    if (covered.has(key)) continue;
    const actual = round2(value);
    if (actual === 0) continue;
    rows.push({
      key,
      target: 0,
      actual,
      drift: actual,
      status: driftStatus(actual, 0),
    });
  }
  rows.sort((a, b) => b.target - a.target || a.key.localeCompare(b.key));
  return {
    portfolioId: args.policy.portfolioId,
    basis: args.policy.basis,
    valueBasis: args.valueBasis,
    ...(args.currency ? { currency: args.currency } : {}),
    rows,
    ...(args.note ? { note: args.note } : {}),
    computedAt: args.computedAt,
  };
}

/**
 * 目标配置与偏离（PRD A2）。
 *
 * 每个组合一份政策（kind="investment-policies"，id=portfolioId）。偏离主口径按市值，
 * 成本口径仅作对比展示。多个币种分别输出，不跨币种相加；币种维度本身按原币市值直接占比，
 * 未做汇率折算，note 里写明。
 */
export class PolicyDriftService {
  constructor(
    private readonly db: Store,
    private readonly portfolios: PortfoliosService,
  ) {}

  async getPolicy(owner: string, portfolioId: string): Promise<InvestmentPolicy | null> {
    const record = await this.db.get<PolicyRecord>(owner, POLICY_KIND, portfolioId);
    if (!record) return null;
    const { id: _id, ...policy } = record;
    return policy;
  }

  /** 保存目标配置；组合必须存在，目标合计由 schema 校验（100% ±0.5）。 */
  async savePolicy(
    owner: string,
    portfolioId: string,
    input: PolicyInput,
  ): Promise<InvestmentPolicy> {
    await this.portfolios.get(owner, portfolioId);
    const now = new Date().toISOString();
    const policy: InvestmentPolicy = {
      owner,
      portfolioId,
      basis: input.basis,
      targets: input.targets.map((target) => ({
        key: target.key,
        label: target.label,
        targetPercent: target.targetPercent,
        bandPercent: target.bandPercent,
      })),
      note: input.note ?? POLICY_MARKET_NOTE,
      updatedAt: now,
    };
    await this.db.put(owner, POLICY_KIND, { ...policy, id: portfolioId });
    return policy;
  }

  async removePolicy(owner: string, portfolioId: string): Promise<void> {
    const existing = await this.getPolicy(owner, portfolioId);
    if (!existing) throw new AppError("Policy not found", 404);
    await this.db.remove(owner, POLICY_KIND, portfolioId);
  }

  /**
   * 计算偏离。无政策时返回空数组——绝不用默认值假设（PRD A2 验收）。
   * 成本口径只用于展示：调用方不得据此触发 `policy_drift` 事件。
   */
  async drift(
    owner: string,
    portfolioId: string,
    options: { valueBasis?: "market" | "cost" } = {},
  ): Promise<PolicyDrift[]> {
    const policy = await this.getPolicy(owner, portfolioId);
    if (!policy) return [];
    const valueBasis = options.valueBasis ?? "market";
    const summary = await this.portfolios.summary(owner, portfolioId);
    const computedAt = new Date().toISOString();

    if (policy.basis === "currency") {
      // 币种维度是组合级的：按原币市值直接占比，未折算。
      let total = 0;
      for (const bucket of summary.allocation) total += bucket.total_market_value;
      const actuals = new Map<string, number>();
      for (const bucket of summary.allocation)
        actuals.set(bucket.currency, total === 0 ? 0 : (bucket.total_market_value / total) * 100);
      return [
        buildDrift({
          policy,
          valueBasis,
          actuals,
          computedAt,
          note: POLICY_MARKET_NOTE,
        }),
      ];
    }

    const currencies = [...new Set(summary.positions.map((position) => position.currency))].sort();
    return currencies.map((currency) => {
      const items = summary.positions.filter(
        (position) =>
          position.currency === currency &&
          (valueBasis === "market" ? position.market_value !== undefined : true),
      );
      const value = (position: Position) =>
        valueBasis === "market" ? (position.market_value ?? 0) : position.cost;
      const total = items.reduce((sum, position) => sum + value(position), 0);
      const actuals = new Map<string, number>();
      for (const item of items) {
        const key = keyOfPosition(policy.basis, item);
        actuals.set(key, (actuals.get(key) ?? 0) + (total === 0 ? 0 : (value(item) / total) * 100));
      }
      return buildDrift({ policy, valueBasis, currency, actuals, computedAt });
    });
  }
}
