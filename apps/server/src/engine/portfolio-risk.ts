import type { HistoryBar } from "../../../../packages/integrations/src/market-data.ts";

/** Daily return point aligned by trading date. */
export interface ReturnPoint {
  date: string;
  ret: number;
}

export interface WeightedReturns {
  returns: ReturnPoint[];
  weight: number;
}

export interface RiskUnavailable {
  metric: string;
  reason: string;
}

export interface RiskSeriesPoint {
  date: string;
  /** Normalized NAV starting at 1.0 on the first aligned day. */
  portfolio: number;
  benchmark: number;
}

export interface RiskMetrics {
  currency: string;
  benchmark: string;
  risk_free_rate: number;
  /** Number of aligned trading-day returns used by Beta/Sharpe. */
  observations: number;
  beta?: number;
  sharpe?: number;
  /** Peak-to-trough decline in percent (positive number), requires ≥60 bars. */
  max_drawdown?: number;
  annualized_return?: number;
  annualized_volatility?: number;
  /** Cumulative portfolio return over the aligned window, percent. */
  portfolio_return?: number;
  /** Cumulative benchmark return over the aligned window, percent. */
  benchmark_return?: number;
  /** portfolio_return - benchmark_return, percentage points. */
  excess_return?: number;
  /** Normalized NAV curves for the frontend chart (start 1.0, ≤120 points). */
  series?: RiskSeriesPoint[];
  unavailable: RiskUnavailable[];
}

export const TRADING_DAYS = 252;
export const BETA_WINDOW = 250;
export const MIN_OBSERVATIONS = 120;
export const MIN_DRAWDOWN_BARS = 60;

export function riskFreeRate(): number {
  const value = Number(process.env.RISK_FREE_RATE ?? 0.02);
  return Number.isFinite(value) && value >= 0 ? value : 0.02;
}

/** Convert daily closes into date-keyed simple returns. */
export function toReturns(bars: HistoryBar[]): ReturnPoint[] {
  const points: ReturnPoint[] = [];
  for (let i = 1; i < bars.length; i++) {
    const previous = bars[i - 1];
    const current = bars[i];
    if (!previous || !current || previous.close <= 0) continue;
    points.push({ date: current.date, ret: current.close / previous.close - 1 });
  }
  return points;
}

/** Weighted portfolio returns across holdings; weights are market-value shares. */
export function weightedReturns(series: WeightedReturns[]): ReturnPoint[] {
  const usable = series.filter((entry) => entry.weight > 0 && entry.returns.length > 0);
  if (usable.length === 0) return [];
  const totalWeight = usable.reduce((sum, entry) => sum + entry.weight, 0);
  const byDate = new Map<string, number>();
  for (const entry of usable) {
    const share = entry.weight / totalWeight;
    for (const point of entry.returns)
      byDate.set(point.date, (byDate.get(point.date) ?? 0) + share * point.ret);
  }
  return [...byDate.entries()]
    .map(([date, ret]) => ({ date, ret }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Sample standard deviation (n-1). */
export function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Sample covariance (n-1). */
export function sampleCovariance(a: number[], b: number[]): number {
  if (a.length < 2 || a.length !== b.length) return 0;
  const meanA = mean(a);
  const meanB = mean(b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - meanA) * (b[i] - meanB);
  return sum / (a.length - 1);
}

/** Maximum peak-to-trough drawdown in percent (positive number). */
export function maxDrawdown(closes: number[]): number {
  let peak = Number.NEGATIVE_INFINITY;
  let worst = 0;
  for (const close of closes) {
    if (close > peak) peak = close;
    if (peak > 0) worst = Math.max(worst, (peak - close) / peak);
  }
  return worst * 100;
}

export interface ComputeRiskInput {
  currency: string;
  benchmark: string;
  /** Daily closes for the currency bucket equity curve (used for MaxDD). */
  portfolioCloses: number[];
  portfolioReturns: ReturnPoint[];
  benchmarkReturns: ReturnPoint[];
  /** First bar date (V0). Series anchors NAV=1.0 here so all daily returns count. */
  portfolioStartDate?: string;
  benchmarkStartDate?: string;
  riskFreeRate?: number;
}

/**
 * Risk metrics for one currency bucket.
 * Contract: daily returns, 252 annualization, sample variance (n-1), 250-day Beta window,
 * Beta/Sharpe require ≥120 aligned observations, MaxDD requires ≥60 bars.
 */
export function computeRiskMetrics(input: ComputeRiskInput): RiskMetrics {
  const rf = input.riskFreeRate ?? riskFreeRate();
  const benchmarkByDate = new Map(input.benchmarkReturns.map((point) => [point.date, point.ret]));
  const aligned = input.portfolioReturns
    .filter((point) => benchmarkByDate.has(point.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const observations = aligned.length;
  const unavailable: RiskUnavailable[] = [];

  let beta: number | undefined;
  let sharpe: number | undefined;
  let annualizedReturn: number | undefined;
  let annualizedVolatility: number | undefined;

  // Normalized NAV curves anchored at the first bar (V0) with NAV=1, then every
  // aligned daily return is applied. Downsampled to ≤120 points for charts.
  let portfolioNav = 1;
  let benchmarkNav = 1;
  const rawSeries: RiskSeriesPoint[] = [];
  const baseDate =
    [input.portfolioStartDate, input.benchmarkStartDate]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? (aligned[0] ? shiftDate(aligned[0].date, -1) : undefined);
  if (baseDate) rawSeries.push({ date: baseDate, portfolio: 1, benchmark: 1 });
  for (const point of aligned) {
    portfolioNav *= 1 + point.ret;
    benchmarkNav *= 1 + (benchmarkByDate.get(point.date) ?? 0);
    rawSeries.push({
      date: point.date,
      portfolio: Number(portfolioNav.toFixed(6)),
      benchmark: Number(benchmarkNav.toFixed(6)),
    });
  }
  const series = downsampleSeries(rawSeries, 120);
  const lastPoint = rawSeries.at(-1);

  if (observations >= MIN_OBSERVATIONS) {
    const window = aligned.slice(-BETA_WINDOW);
    const portfolioWindow = window.map((point) => point.ret);
    const benchmarkWindow = window.map((point) => benchmarkByDate.get(point.date) ?? 0);
    const variance = sampleCovariance(benchmarkWindow, benchmarkWindow);
    if (variance === 0) unavailable.push({ metric: "beta", reason: "flat_benchmark" });
    else beta = Number((sampleCovariance(portfolioWindow, benchmarkWindow) / variance).toFixed(6));

    const returns = aligned.map((point) => point.ret);
    const stdev = sampleStdDev(returns);
    if (stdev === 0) unavailable.push({ metric: "sharpe", reason: "flat_returns" });
    else {
      const excess = mean(returns) - rf / TRADING_DAYS;
      sharpe = Number(((excess / stdev) * Math.sqrt(TRADING_DAYS)).toFixed(6));
    }
    annualizedVolatility = Number((stdev * Math.sqrt(TRADING_DAYS) * 100).toFixed(4));
    const total = returns.reduce((product, value) => product * (1 + value), 1);
    if (total > 0 && returns.length > 0)
      annualizedReturn = Number(((total ** (TRADING_DAYS / returns.length) - 1) * 100).toFixed(4));
  } else {
    unavailable.push({ metric: "beta", reason: "insufficient_history" });
    unavailable.push({ metric: "sharpe", reason: "insufficient_history" });
  }

  let drawdown: number | undefined;
  if (input.portfolioCloses.length >= MIN_DRAWDOWN_BARS)
    drawdown = Number(maxDrawdown(input.portfolioCloses).toFixed(4));
  else unavailable.push({ metric: "max_drawdown", reason: "insufficient_history" });

  return {
    currency: input.currency,
    benchmark: input.benchmark,
    risk_free_rate: rf,
    observations,
    ...(beta !== undefined ? { beta } : {}),
    ...(sharpe !== undefined ? { sharpe } : {}),
    ...(drawdown !== undefined ? { max_drawdown: drawdown } : {}),
    ...(annualizedReturn !== undefined ? { annualized_return: annualizedReturn } : {}),
    ...(annualizedVolatility !== undefined ? { annualized_volatility: annualizedVolatility } : {}),
    ...(lastPoint
      ? {
          portfolio_return: Number(((lastPoint.portfolio - 1) * 100).toFixed(4)),
          benchmark_return: Number(((lastPoint.benchmark - 1) * 100).toFixed(4)),
          excess_return: Number(((lastPoint.portfolio - lastPoint.benchmark) * 100).toFixed(4)),
        }
      : {}),
    ...(series.length > 0 ? { series } : {}),
    unavailable,
  };
}

export const CURRENCY_BENCHMARKS: Record<string, string> = {
  CNY: "000300.SS",
  USD: "^GSPC",
  HKD: "^HSI",
};

/** Shift an ISO date by whole days (UTC), used only when no explicit start date is given. */
export function shiftDate(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Keep at most `max` points, preserving the last point so the endpoint stays exact. */
export function downsampleSeries(points: RiskSeriesPoint[], max: number): RiskSeriesPoint[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const sampled = points.filter((_, index) => index % step === 0);
  const last = points.at(-1);
  if (last && sampled.at(-1)?.date !== last.date) sampled.push(last);
  return sampled;
}

/** Equity curve from weighted returns so MaxDD can be computed without FX conversion. */
export function equityCurve(returns: ReturnPoint[]): number[] {
  const closes: number[] = [1];
  let value = 1;
  for (const point of returns) {
    value *= 1 + point.ret;
    closes.push(value);
  }
  return closes;
}
