import assert from "node:assert/strict";
import test from "node:test";
import {
  computeRiskMetrics,
  downsampleSeries,
  equityCurve,
  maxDrawdown,
  sampleCovariance,
  sampleStdDev,
  TRADING_DAYS,
  toReturns,
  weightedReturns,
} from "../apps/server/src/engine/portfolio-risk.ts";

function returnsOf(values: number[]) {
  return values.map((ret, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, ret }));
}

const benchmarkValues = Array.from({ length: 260 }, (_, i) => (i % 2 === 0 ? 0.01 : 0.02));
const benchmark = returnsOf(benchmarkValues);
const doubled = returnsOf(benchmarkValues.map((value) => value * 2));

test("toReturns converts closes into simple returns and skips invalid points", () => {
  const bars = [
    { date: "2026-01-01", close: 100 },
    { date: "2026-01-02", close: 110 },
    { date: "2026-01-03", close: 99 },
  ];
  const returns = toReturns(bars);
  assert.equal(returns.length, 2);
  assert.ok(Math.abs((returns[0]?.ret ?? 0) - 0.1) < 1e-12);
  assert.ok(Math.abs((returns[1]?.ret ?? 0) + 0.1) < 1e-12);
});

test("sample standard deviation and covariance use n-1", () => {
  assert.equal(sampleStdDev([1, 2, 3]), 1);
  assert.equal(sampleCovariance([1, 2, 3], [2, 4, 6]), 2);
  assert.equal(sampleStdDev([5]), 0);
});

test("max drawdown measures the worst peak-to-trough decline", () => {
  assert.equal(maxDrawdown([100, 120, 90, 110]), 25);
  assert.equal(maxDrawdown([100, 110, 120]), 0);
});

test("weightedReturns blends holdings by weight", () => {
  const blended = weightedReturns([
    { returns: returnsOf([0.1, -0.1]), weight: 0.5 },
    { returns: returnsOf([0.02, 0.02]), weight: 0.5 },
  ]);
  assert.equal(blended.length, 2);
  assert.ok(Math.abs((blended[0]?.ret ?? 0) - 0.06) < 1e-12);
  assert.ok(Math.abs((blended[1]?.ret ?? 0) + 0.04) < 1e-12);
});

test("beta is 2 when portfolio returns are twice the benchmark", () => {
  const metrics = computeRiskMetrics({
    currency: "USD",
    benchmark: "^GSPC",
    portfolioReturns: doubled,
    benchmarkReturns: benchmark,
    portfolioCloses: equityCurve(doubled),
    riskFreeRate: 0.02,
  });
  assert.equal(metrics.observations, 260);
  assert.equal(metrics.beta, 2);
  assert.ok(metrics.sharpe !== undefined);
  assert.ok((metrics.max_drawdown ?? 0) >= 0);

  // Normalized NAV: starts at 1.0, downsampled to ≤120 points, benchmark return in percent.
  assert.ok(metrics.series);
  assert.equal(metrics.series?.[0]?.portfolio, 1);
  assert.equal(metrics.series?.[0]?.benchmark, 1);
  assert.ok((metrics.series?.length ?? 0) <= 120);
  const last = metrics.series?.at(-1);
  assert.ok((last?.portfolio ?? 0) > 1);
  assert.ok(Math.abs((metrics.benchmark_return ?? 0) - ((last?.benchmark ?? 1) - 1) * 100) < 1e-6);
  assert.ok(
    Math.abs(
      (metrics.excess_return ?? 0) - ((last?.portfolio ?? 1) - (last?.benchmark ?? 1)) * 100,
    ) < 1e-6,
  );
});

test("sharpe uses the 2% risk-free rate and 252 annualization", () => {
  const metrics = computeRiskMetrics({
    currency: "USD",
    benchmark: "^GSPC",
    portfolioReturns: doubled,
    benchmarkReturns: benchmark,
    portfolioCloses: equityCurve(doubled),
    riskFreeRate: 0.02,
  });
  const values = benchmarkValues.map((value) => value * 2);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const stdev = sampleStdDev(values);
  const expected = ((mean - 0.02 / TRADING_DAYS) / stdev) * Math.sqrt(TRADING_DAYS);
  assert.ok(Math.abs((metrics.sharpe ?? 0) - expected) < 1e-5);
});

test("flat returns mark sharpe unavailable instead of returning zero", () => {
  const flat = returnsOf(Array.from({ length: 200 }, () => 0));
  const metrics = computeRiskMetrics({
    currency: "USD",
    benchmark: "^GSPC",
    portfolioReturns: flat,
    benchmarkReturns: flat,
    portfolioCloses: equityCurve(flat),
  });
  assert.equal(metrics.sharpe, undefined);
  assert.ok(
    metrics.unavailable.some((item) => item.metric === "sharpe" && item.reason === "flat_returns"),
  );
  assert.ok(
    metrics.unavailable.some((item) => item.metric === "beta" && item.reason === "flat_benchmark"),
  );
});

test("short histories return explicit unavailable reasons", () => {
  const short = returnsOf(Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01)));
  const metrics = computeRiskMetrics({
    currency: "USD",
    benchmark: "^GSPC",
    portfolioReturns: short,
    benchmarkReturns: short,
    portfolioCloses: equityCurve(short),
  });
  assert.equal(metrics.beta, undefined);
  assert.equal(metrics.sharpe, undefined);
  assert.equal(metrics.max_drawdown, undefined);
  assert.deepEqual(metrics.unavailable.map((item) => `${item.metric}:${item.reason}`).sort(), [
    "beta:insufficient_history",
    "max_drawdown:insufficient_history",
    "sharpe:insufficient_history",
  ]);
});

test("downsampleSeries keeps the last point", () => {
  const points = Array.from({ length: 300 }, (_, i) => ({
    date: `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    portfolio: 1 + i / 1000,
    benchmark: 1 + i / 2000,
  }));
  const sampled = downsampleSeries(points, 120);
  assert.ok(sampled.length <= 121);
  assert.equal(sampled.at(-1)?.date, points.at(-1)?.date);
});

test("max drawdown is available with 60 bars even when beta is not", () => {
  const values = Array.from({ length: 70 }, (_, i) => (i % 3 === 0 ? 0.01 : -0.005));
  const metrics = computeRiskMetrics({
    currency: "CNY",
    benchmark: "000300.SS",
    portfolioReturns: returnsOf(values),
    benchmarkReturns: returnsOf(values),
    portfolioCloses: equityCurve(returnsOf(values)),
  });
  assert.ok(metrics.max_drawdown !== undefined);
  assert.equal(metrics.beta, undefined);
});
