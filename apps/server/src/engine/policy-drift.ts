import type {
  DriftStatus,
  InvestmentPolicy,
  InvestmentPolicyInput,
  PolicyBasis,
  PolicyDrift,
  PolicyDriftRow,
} from "../../../../packages/domain/src/investor.ts";
import {
  POLICY_BASIS_LABELS,
  POLICY_MARKET_NOTE,
} from "../../../../packages/domain/src/investor.ts";
import type { MonitorCurrency } from "../../../../packages/domain/src/monitor-currency.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";
import type { PortfoliosService, Position } from "./portfolios.ts";

const POLICY_KIND = "investment_policies";
/** 目标未显式给区间时的默认容忍带（百分点）。 */
export const DEFAULT_BAND_PERCENT = 5;
/** 超过容忍带多少倍记为 warning（再往上算 breach）。 */
export const WARNING_BAND_MULTIPLIER = 1.5;

/** 偏离主口径是市值；成本口径只用于对比展示。 */
export type DriftValueBasis = "market" | "cost";

/**
 * A2 目标配置与偏离。
 *
 * - 目标配置（InvestmentPolicy）：每个组合一份，按某个维度（资产类别 / 行业 /
 *   地区 / 币种）给出一组目标权重与容忍带，合计须约等于 100%。
 * - 偏离（PolicyDrift）：**分币种各算一份**（原币市值占比，不做汇率折算）；
 *   市值是主口径（参与 breach 判定），成本口径仅用于对比展示。
 */
export class PolicyDriftService {
  constructor(
    private readonly db: Store,
    private readonly portfolios: PortfoliosService,
  ) {}

  async get(owner: string, portfolioId: string): Promise<InvestmentPolicy | null> {
    return this.db.get<InvestmentPolicy>(owner, POLICY_KIND, portfolioId);
  }

  async require(owner: string, portfolioId: string): Promise<InvestmentPolicy> {
    const policy = await this.get(owner, portfolioId);
    if (!policy) throw new AppError("Investment policy not found", 404);
    return policy;
  }

  /** 保存 / 覆盖目标配置（入参已由 investmentPolicySchema 校验合计与重复 key）。 */
  async set(
    owner: string,
    portfolioId: string,
    input: InvestmentPolicyInput,
  ): Promise<InvestmentPolicy> {
    const at = new Date().toISOString();
    const policy: InvestmentPolicy = {
      id: portfolioId,
      owner,
      portfolioId,
      basis: input.basis,
      targets: input.targets,
      note: input.note,
      updatedAt: at,
    };
    return this.db.put(owner, POLICY_KIND, policy);
  }

  async remove(owner: string, portfolioId: string): Promise<void> {
    await this.require(owner, portfolioId);
    await this.db.remove(owner, POLICY_KIND, portfolioId);
  }

  /**
   * 计算偏离。返回按币种拆开的一组结果（不在币种间做任何换算）。
   * valueBasis=cost 时用成本口径，仅供对比展示。
   */
  async drift(
    owner: string,
    portfolioId: string,
    valueBasis: DriftValueBasis = "market",
  ): Promise<PolicyDrift[]> {
    const policy = await this.require(owner, portfolioId);
    const summary = await this.portfolios.summary(owner, portfolioId);
    const byCurrency = new Map<string, Position[]>();
    for (const position of summary.positions) {
      const bucket = byCurrency.get(position.currency) ?? [];
      bucket.push(position);
      byCurrency.set(position.currency, bucket);
    }
    const at = new Date().toISOString();
    return [...byCurrency.entries()].map(([currency, positions]) =>
      buildPart(policy, positions, currency as MonitorCurrency, valueBasis, at),
    );
  }
}

/** 单币种口径下的偏离计算（纯函数，便于单测）。 */
export function buildPart(
  policy: InvestmentPolicy,
  positions: Position[],
  currency: MonitorCurrency,
  valueBasis: DriftValueBasis,
  computedAt: string,
): PolicyDrift {
  const totals = new Map<string, number>();
  let sum = 0;
  for (const position of positions) {
    const value = valueBasis === "cost" ? position.cost : (position.market_value ?? 0);
    if (!Number.isFinite(value) || value <= 0) continue;
    const key = sliceKey(position, policy.basis);
    totals.set(key, (totals.get(key) ?? 0) + value);
    sum += value;
  }

  const targetByKey = new Map(policy.targets.map((target) => [target.key, target]));
  const keys = new Set<string>([...totals.keys(), ...targetByKey.keys()]);
  const rows: PolicyDriftRow[] = [...keys].map((key) => {
    const target = targetByKey.get(key);
    const actual = sum > 0 ? ((totals.get(key) ?? 0) / sum) * 100 : 0;
    const targetPercent = target?.targetPercent ?? 0;
    const band = target?.bandPercent ?? DEFAULT_BAND_PERCENT;
    const drift = round2(actual - targetPercent);
    return {
      key,
      label: target?.label ?? labelForKey(policy.basis, key),
      target: targetPercent,
      actual: round2(actual),
      drift,
      band,
      status: driftStatus(drift, band),
    };
  });
  rows.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

  return {
    portfolioId: policy.portfolioId,
    basis: policy.basis,
    valueBasis,
    currency,
    note: policy.note || POLICY_MARKET_NOTE,
    rows,
    computedAt,
  };
}

/** 给持仓在某一维度上归类。 */
export function sliceKey(position: Position, basis: PolicyBasis): string {
  switch (basis) {
    case "asset_class":
      // 有到期日视为固定收益，否则按权益处理（持仓表没有单独的资产类别字段）。
      return position.maturity_date ? "bond" : "equity";
    case "sector":
      return position.sector?.trim() || "未分类";
    case "region":
      return position.market;
    case "currency":
      return position.currency;
  }
}

function labelForKey(basis: PolicyBasis, key: string): string {
  if (basis === "asset_class") return key === "bond" ? "固定收益" : "权益";
  if (basis === "region")
    return key === "CN" ? "中国" : key === "HK" ? "中国香港" : key === "US" ? "美国" : key;
  if (basis === "currency") return `${POLICY_BASIS_LABELS.currency} · ${key}`;
  return key;
}

/** 偏离落到容忍带的哪一档：带内 / 超带 1.5 倍以内 / 超出 1.5 倍。 */
export function driftStatus(drift: number, band: number): DriftStatus {
  const magnitude = Math.abs(drift);
  if (magnitude <= band) return "within";
  if (magnitude <= band * WARNING_BAND_MULTIPLIER) return "warning";
  return "breach";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
