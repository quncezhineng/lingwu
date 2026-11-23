import { createHash } from "node:crypto";
import type { InvestmentNote, ResearchReport } from "../../../../packages/domain/src/agent.ts";
import type {
  SuggestedMonitor,
  TrackingPlan,
  TrackingPlanItem,
} from "../../../../packages/domain/src/investor.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

const PLAN_KIND = "tracking-plans";

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function trackingPlanId(symbol: string, reportId: string): string {
  return createHash("sha256").update(`plan:${symbol}:${reportId}`).digest("hex");
}

/**
 * 研报 → 跟踪计划（PRD R4）。
 *
 * 只写研报里真有依据的东西：估值区间、52 周区间、风险提示都是研报自带的字段；
 * 财报日、ROE 净利率这类研报没覆盖的，明确标 placeholder，不伪装成结论。
 */
export function deriveTrackingPlan(
  report: ResearchReport,
  options: { now?: Date; name?: string } = {},
): TrackingPlan {
  const now = options.now ?? new Date();
  const items: TrackingPlanItem[] = [];
  const caveats: string[] = [];
  const valuation = (report.sections.valuation ?? {}) as Record<string, unknown>;
  const financials = (report.sections.financials ?? {}) as Record<string, unknown>;
  const low = asNumber(valuation.low);
  const high = asNumber(valuation.high);
  const mid = asNumber(valuation.mid);
  const current = asNumber(valuation.current) ?? asNumber(financials.price);
  const currency = typeof financials.currency === "string" ? financials.currency : undefined;

  if (low !== undefined && high !== undefined && high > low) {
    items.push({
      kind: "valuation",
      text: `估值区间 ${formatNumber(low)}–${formatNumber(high)}${currency ? ` ${currency}` : ""}${
        current !== undefined ? `，当前 ${formatNumber(current)}` : ""
      }${mid !== undefined ? `，中枢 ${formatNumber(mid)}` : ""}`,
      source: "sections.valuation",
      confidence: "derived",
    });
  } else {
    items.push({
      kind: "valuation",
      text: "研报未给出有效估值区间，需补齐数据后重算。",
      source: "sections.valuation",
      confidence: "placeholder",
    });
    caveats.push("估值区间缺失，无法派生价格上下沿提醒。");
  }

  const assumptions = Array.isArray(valuation.assumptions)
    ? valuation.assumptions.filter((item): item is string => typeof item === "string")
    : [];
  for (const assumption of assumptions.slice(0, 3)) {
    items.push({
      kind: "assumption",
      text: assumption.slice(0, 200),
      source: "sections.valuation.assumptions",
      confidence: "derived",
    });
  }
  if (!assumptions.length) {
    items.push({
      kind: "assumption",
      text: "关键假设待补：研报未列出估值假设，建议在下一次研究时明确收入/利润率假设。",
      source: "sections.valuation.assumptions",
      confidence: "placeholder",
    });
  }

  const weekLow = asNumber(financials.fiftyTwoWeekLow);
  const weekHigh = asNumber(financials.fiftyTwoWeekHigh);
  if (weekLow !== undefined && weekHigh !== undefined) {
    items.push({
      kind: "metric",
      text: `52 周区间 ${formatNumber(weekLow)}–${formatNumber(weekHigh)}，跌破下沿或突破上沿都值得复核。`,
      source: "sections.financials",
      confidence: "derived",
    });
  }
  items.push({
    kind: "metric",
    text: "ROE、净利率、营收增速：当前数据源未提供，标为待补，不作为结论。",
    source: "sections.financials.unavailable",
    confidence: "placeholder",
  });

  items.push({
    kind: "catalyst",
    text: "下次财报日 / 行业事件：事件日历尚未接入，需手动确认日期后再设定提醒。",
    source: "sections.news",
    confidence: "placeholder",
  });
  caveats.push("财报日与财务指标未接入数据源，催化剂条目为待补占位。");

  const suggestedMonitors: SuggestedMonitor[] = [];
  if (low !== undefined && high !== undefined && high > low) {
    suggestedMonitors.push({
      title: `${report.symbol_code} 跌到估值下沿`,
      condition: "price_below",
      value: formatNumber(low),
      ...(currency ? { currency } : {}),
      intervalMinutes: 30,
      rationale: "跌到区间下沿意味着市场比研报更悲观，需要复核假设是否被破坏。",
    });
    suggestedMonitors.push({
      title: `${report.symbol_code} 涨到估值上沿`,
      condition: "price_above",
      value: formatNumber(high),
      ...(currency ? { currency } : {}),
      intervalMinutes: 30,
      rationale: "接近区间上沿时可评估兑现节奏，避免「研究过但没动作」。",
    });
  }

  const overview = report.sections.company_overview.trim().slice(0, 160);
  const thesisDraft = [
    `${report.title}（${report.generated_at.slice(0, 10)} 自动派生）`,
    overview,
    low !== undefined && high !== undefined
      ? `估值区间 ${formatNumber(low)}–${formatNumber(high)}，若价格回到区间内且关键假设未变，论点维持。`
      : "估值区间缺失，论点暂不设价格条件。",
    assumptions.length ? `关键假设：${assumptions.slice(0, 2).join("；")}` : "",
    "待验证：财报字段（ROE/净利率/营收增速）与下次财报日。",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: trackingPlanId(report.symbol_code, report.id),
    symbol: report.symbol_code,
    ...(options.name ? { name: options.name } : {}),
    reportId: report.id,
    createdAt: now.toISOString(),
    status: "draft",
    items,
    suggestedMonitors,
    thesisDraft,
    caveats,
  };
}

export interface MaterializeResult {
  alertIds: string[];
  noteIds: string[];
}

export interface TrackingPlanDeps {
  db: Store;
  /** 落地为价格提醒（不依赖网页 URL，适合估值上下沿）。 */
  createAlert: (
    owner: string,
    input: {
      symbol_code: string;
      threshold_type: "PRICE_ABOVE" | "PRICE_BELOW";
      threshold_value: number;
      interval_minutes: number;
    },
  ) => Promise<{ id: string }>;
  createThesis: (
    owner: string,
    input: { symbol_code: string; title: string; content: string },
  ) => Promise<InvestmentNote>;
  /** 落地成功后回调，用于写动作审计（R6）；失败不影响落地。 */
  audit?: (
    owner: string,
    input: { plan: TrackingPlan; alertIds: string[]; noteIds: string[] },
  ) => Promise<void> | void;
  now?: () => Date;
}

/**
 * 跟踪计划服务：研报生成后自动派生 draft，用户确认后一键落地为
 * 价格提醒 + 论点（论点绑定估值下沿作为跟踪信号）。
 */
export class TrackingPlanService {
  constructor(private readonly deps: TrackingPlanDeps) {}

  private get db() {
    return this.deps.db;
  }

  async derive(
    owner: string,
    report: ResearchReport,
    options: { name?: string } = {},
  ): Promise<TrackingPlan> {
    const plan = deriveTrackingPlan(report, { now: this.deps.now?.() ?? new Date(), ...options });
    const existing = await this.db.get<TrackingPlan>(owner, PLAN_KIND, plan.id);
    // 已存在且已落地：不覆盖 materialized，避免自动派生把用户确认过的计划冲掉。
    if (existing?.materialized) return existing;
    return this.db.put(owner, PLAN_KIND, plan);
  }

  async list(owner: string, symbol?: string): Promise<TrackingPlan[]> {
    const plans = await this.db.list<TrackingPlan>(owner, PLAN_KIND);
    return plans
      .filter((plan) => (symbol ? plan.symbol === symbol : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(owner: string, id: string): Promise<TrackingPlan> {
    const plan = await this.db.get<TrackingPlan>(owner, PLAN_KIND, id);
    if (!plan) throw new AppError("Tracking plan not found", 404);
    return plan;
  }

  /** 落地：创建价格提醒 + 论点笔记；幂等（已落地直接返回）。 */
  async materialize(owner: string, id: string): Promise<TrackingPlan> {
    const plan = await this.get(owner, id);
    if (plan.materialized) return plan;

    const alertIds: string[] = [];
    for (const monitor of plan.suggestedMonitors) {
      const threshold = Number(monitor.value);
      if (!Number.isFinite(threshold) || threshold <= 0) continue;
      const alert = await this.deps.createAlert(owner, {
        symbol_code: plan.symbol,
        threshold_type: monitor.condition === "price_below" ? "PRICE_BELOW" : "PRICE_ABOVE",
        threshold_value: threshold,
        interval_minutes: monitor.intervalMinutes,
      });
      alertIds.push(alert.id);
    }

    const note = await this.deps.createThesis(owner, {
      symbol_code: plan.symbol,
      title: `${plan.name ?? plan.symbol} 跟踪论点`.slice(0, 80),
      content: plan.thesisDraft.slice(0, 2000),
    });
    const low = plan.suggestedMonitors.find((monitor) => monitor.condition === "price_below");
    const lowValue = low ? Number(low.value) : Number.NaN;
    if (Number.isFinite(lowValue) && lowValue > 0) {
      // 绑定一条"走弱即复核"的信号：跌破下沿不直接判死论点，只标受威胁。
      await this.db.put(owner, "notes", {
        ...note,
        evidence: [
          {
            kind: "price",
            direction: "above",
            value: lowValue,
            onBreach: "threat",
            label: "股价维持在估值区间下沿之上",
          },
        ],
      });
    }

    const saved = await this.db.put<TrackingPlan>(owner, PLAN_KIND, {
      ...plan,
      status: "active",
      materialized: {
        alertIds,
        noteIds: [note.id],
        at: (this.deps.now?.() ?? new Date()).toISOString(),
      },
    });
    // R6 审计：落地会真的往账户里加提醒和论点，必须留一条可撤销的记录。
    try {
      await this.deps.audit?.(owner, { plan: saved, alertIds, noteIds: [note.id] });
    } catch {
      // 审计写失败不能把已经落地的提醒回滚掉：留痕是旁路，不是事务的一部分。
    }
    return saved;
  }
}

export { PLAN_KIND };
