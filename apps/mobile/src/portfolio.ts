/**
 * 投资组合数据层（P1-F1）。
 *
 * 真实接口优先（B1 契约）：
 * - GET    /api/portfolios
 * - POST   /api/portfolios
 * - PUT    /api/portfolios/:id
 * - DELETE /api/portfolios/:id
 * - GET    /api/portfolios/:id/summary
 * - POST   /api/portfolios/:id/holdings · PUT/DELETE …/holdings/:holdingId
 * - POST   /api/portfolios/import/preview · /import
 *
 * 接口不可用时使用本地 mock（报价复用 market.ts 的 mock 行情），
 * 页面明确标注「示例数据」。风险指标仅在 mock 中提供；真实接口未返回 risk 时
 * 显示「数据不足」，绝不编造。
 */
import { useSyncExternalStore } from "react";
import type { LingWuApi } from "./api";
import { metaFor, quoteFor } from "./market";
import type { Direction } from "./market-format";

export type Currency = "CNY" | "USD" | "HKD";
export type MarketKind = "US" | "CN" | "HK";

export interface Portfolio {
  id: string;
  name: string;
  baseCurrency: Currency;
  benchmark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Holding {
  id: string;
  portfolioId: string;
  symbolCode: string;
  name?: string;
  market: MarketKind;
  currency: Currency;
  quantity: number;
  avgCost: number;
  sector?: string;
  buyDate?: string;
}

export interface AllocationSlice {
  key: string;
  marketValue: number;
  weight: number;
}

export interface PositionView extends Holding {
  cost: number;
  price?: number;
  marketValue?: number;
  pnl?: number;
  pnlPct?: number;
  weight?: number;
  changePercent?: number;
  stale?: boolean;
  error?: string;
}

export interface RiskSeriesPoint {
  date: string;
  portfolio: number;
  benchmark: number;
}

export interface RiskMetricIssue {
  metric: string;
  reason: string;
}

export interface RiskSummary {
  beta?: number;
  sharpe?: number;
  /** 峰谷跌幅（正数百分比，展示时加负号）。 */
  maxDrawdown?: number;
  /** 年化收益（%）。 */
  return1y?: number;
  annualizedVolatility?: number;
  samples?: number;
  riskFreeRate?: number;
  benchmarkSymbol?: string;
  benchmark?: { symbol: string; name: string; return1y?: number };
  /** 指标不可用原因（B2：insufficient_history / flat_returns / flat_benchmark）。 */
  unavailable?: RiskMetricIssue[];
  series?: RiskSeriesPoint[];
}

export interface CurrencyGroup {
  currency: Currency;
  cost: number;
  marketValue: number;
  pnl: number;
  pnlPct?: number;
  pricedCount: number;
  totalCount: number;
  positions: PositionView[];
  bySymbol: AllocationSlice[];
  bySector: AllocationSlice[];
  topHoldings: AllocationSlice[];
  risk?: RiskSummary;
  /** 无法估值（行情失败）的持仓数量与成本合计，UI 需显式披露。 */
  unvaluedCount: number;
  unvaluedCost: number;
  /** 可估值市值 /（可估值市值 + 未估值成本），0–1。 */
  valuationCoverage?: number;
  excludedSymbols: string[];
  unavailable: string[];
}

export interface PortfolioSummaryView {
  portfolio?: Portfolio;
  groups: CurrencyGroup[];
  fxNote: string;
  generatedAt: string;
  unavailable: string[];
}

export type PortfolioSource = "mock" | "api";

export const CURRENCIES: Currency[] = ["CNY", "USD", "HKD"];

export function directionFor(value: number): Direction {
  if (value > 0.005) return "up";
  if (value < -0.005) return "down";
  return "flat";
}

export function marketCurrency(market: MarketKind): Currency {
  if (market === "CN") return "CNY";
  if (market === "HK") return "HKD";
  return "USD";
}

/* ------------------------------------------------------------------ *
 * mock 数据与汇总计算
 * ------------------------------------------------------------------ */

const MOCK_HOLDINGS: Record<string, Holding[]> = {
  "pf-long": [
    {
      id: "h-1",
      portfolioId: "pf-long",
      symbolCode: "600519.SS",
      market: "CN",
      currency: "CNY",
      quantity: 100,
      avgCost: 1700,
      sector: "食品饮料",
    },
    {
      id: "h-2",
      portfolioId: "pf-long",
      symbolCode: "000858.SZ",
      market: "CN",
      currency: "CNY",
      quantity: 300,
      avgCost: 150,
      sector: "食品饮料",
    },
    {
      id: "h-3",
      portfolioId: "pf-long",
      symbolCode: "300750.SZ",
      market: "CN",
      currency: "CNY",
      quantity: 200,
      avgCost: 210,
      sector: "电力设备",
    },
    {
      id: "h-4",
      portfolioId: "pf-long",
      symbolCode: "AAPL",
      market: "US",
      currency: "USD",
      quantity: 45,
      avgCost: 180.5,
      sector: "信息技术",
    },
    {
      id: "h-5",
      portfolioId: "pf-long",
      symbolCode: "MSFT",
      market: "US",
      currency: "USD",
      quantity: 20,
      avgCost: 390,
      sector: "信息技术",
    },
    {
      id: "h-6",
      portfolioId: "pf-long",
      symbolCode: "NVDA",
      market: "US",
      currency: "USD",
      quantity: 60,
      avgCost: 110,
      sector: "信息技术",
    },
  ],
  "pf-short": [
    {
      id: "h-7",
      portfolioId: "pf-short",
      symbolCode: "TSLA",
      market: "US",
      currency: "USD",
      quantity: 30,
      avgCost: 300,
      sector: "可选消费",
    },
    {
      id: "h-8",
      portfolioId: "pf-short",
      symbolCode: "00700.HK",
      market: "HK",
      currency: "HKD",
      quantity: 200,
      avgCost: 380,
      sector: "信息技术",
    },
  ],
};

function mockPortfolios(): Portfolio[] {
  const now = new Date().toISOString();
  return [
    { id: "pf-long", name: "长期价值", baseCurrency: "CNY", createdAt: now, updatedAt: now },
    { id: "pf-short", name: "短线", baseCurrency: "USD", createdAt: now, updatedAt: now },
  ];
}

function mockRisk(currency: Currency, holdings: PositionView[], seed: number): RiskSummary {
  const benchmark =
    currency === "CNY"
      ? { symbol: "000300.SS", name: "沪深300" }
      : currency === "HKD"
        ? { symbol: "^HSI", name: "恒生指数" }
        : { symbol: "^GSPC", name: "标普500" };
  const points: RiskSeriesPoint[] = [];
  let portfolioValue = 0;
  let benchmarkValue = 0;
  for (let i = 0; i < 52; i += 1) {
    const date = new Date();
    date.setDate(date.getDate() - (51 - i) * 7);
    portfolioValue += Math.sin((i + seed) / 5) * 0.9 + 0.32 + (i % 7 === 0 ? 0.4 : 0);
    benchmarkValue += Math.sin((i + seed) / 7) * 0.7 + 0.18;
    points.push({
      date: `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`,
      portfolio: Number(portfolioValue.toFixed(2)),
      benchmark: Number(benchmarkValue.toFixed(2)),
    });
  }
  const last = points[points.length - 1];
  const totalCost = holdings.reduce((sum, item) => sum + item.cost, 0);
  return {
    beta: Number((0.95 + (seed % 4) * 0.08).toFixed(2)),
    sharpe: Number((1.05 + (seed % 3) * 0.11).toFixed(2)),
    maxDrawdown: Number((12 + (seed % 5) * 1.7).toFixed(1)),
    return1y: last?.portfolio,
    samples: 252,
    benchmark: { ...benchmark, return1y: last?.benchmark },
    series: points,
    unavailable: totalCost > 0 ? [] : [{ metric: "return", reason: "zero_cost" }],
  };
}

function allocation(positions: PositionView[], keyOf: (position: PositionView) => string) {
  const totals = new Map<string, number>();
  let total = 0;
  for (const position of positions) {
    if (position.marketValue === undefined) continue;
    total += position.marketValue;
    const key = keyOf(position);
    totals.set(key, (totals.get(key) ?? 0) + position.marketValue);
  }
  const slices = [...totals.entries()]
    .map(([key, marketValue]) => ({
      key,
      marketValue,
      weight: total > 0 ? (marketValue / total) * 100 : 0,
    }))
    .sort((a, b) => b.marketValue - a.marketValue);
  return { slices, total };
}

/** 配置条形：Top 6 + 其他；<1% 的份额并入「其他」。 */
export function buildAllocationSlices(slices: AllocationSlice[]): AllocationSlice[] {
  if (!slices.length) return [];
  const sorted = [...slices].sort((a, b) => b.marketValue - a.marketValue);
  const main = sorted.filter((slice) => slice.weight >= 1).slice(0, 6);
  const mainKeys = new Set(main.map((slice) => slice.key));
  const otherValue = sorted
    .filter((slice) => !mainKeys.has(slice.key))
    .reduce((sum, slice) => sum + slice.marketValue, 0);
  const rows =
    otherValue > 0 ? [...main, { key: "__other__", marketValue: otherValue, weight: 0 }] : main;
  const total = rows.reduce((sum, slice) => sum + slice.marketValue, 0);
  return rows.map((slice) => ({
    ...slice,
    weight: total > 0 ? (slice.marketValue / total) * 100 : 0,
  }));
}

function buildGroup(currency: Currency, holdings: Holding[]): CurrencyGroup {
  const positions: PositionView[] = holdings.map((holding) => {
    const quote = quoteFor(metaFor(holding.symbolCode));
    const cost = holding.quantity * holding.avgCost;
    const marketValue = holding.quantity * quote.price;
    const pnl = marketValue - cost;
    return {
      ...holding,
      name: holding.name ?? metaFor(holding.symbolCode).name,
      cost,
      price: quote.price,
      marketValue,
      pnl,
      pnlPct: cost > 0 ? (pnl / cost) * 100 : undefined,
      changePercent: quote.changePercent,
      stale: quote.stale,
    };
  });
  const cost = positions.reduce((sum, position) => sum + position.cost, 0);
  const marketValue = positions.reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
  const pnl = marketValue - cost;
  const pricedTotal = positions.reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
  const withWeight = positions.map((position) => ({
    ...position,
    weight:
      position.marketValue !== undefined && pricedTotal > 0
        ? (position.marketValue / pricedTotal) * 100
        : undefined,
  }));
  const bySymbol = allocation(withWeight, (position) => position.symbolCode);
  const bySector = allocation(withWeight, (position) => position.sector || "未分类");
  return {
    currency,
    cost,
    marketValue: pricedTotal,
    pnl,
    pnlPct: cost > 0 ? (pnl / cost) * 100 : undefined,
    pricedCount: positions.filter((position) => position.marketValue !== undefined).length,
    totalCount: positions.length,
    positions: withWeight,
    bySymbol: bySymbol.slices,
    bySector: bySector.slices,
    topHoldings: bySymbol.slices.slice(0, 5),
    risk: mockRisk(currency, positions, currency.length + holdings.length),
    unvaluedCount: 0,
    unvaluedCost: 0,
    valuationCoverage: 1,
    excludedSymbols: [],
    unavailable: [],
  };
}

export function buildMockSummary(portfolio: Portfolio): PortfolioSummaryView {
  const holdings = MOCK_HOLDINGS[portfolio.id] ?? [];
  const groups = CURRENCIES.filter((currency) =>
    holdings.some((holding) => holding.currency === currency),
  ).map((currency) =>
    buildGroup(
      currency,
      holdings.filter((holding) => holding.currency === currency),
    ),
  );
  return {
    portfolio,
    groups,
    fxNote: "跨币种未折算：各币种分别汇总，合计不跨币种相加。",
    generatedAt: new Date().toISOString(),
    unavailable: [],
  };
}

/* ------------------------------------------------------------------ *
 * 状态 store
 * ------------------------------------------------------------------ */

interface PortfolioState {
  status: "loading" | "ready";
  portfolios: Portfolio[];
  activeId?: string;
  source: PortfolioSource;
  summary?: PortfolioSummaryView;
  summaryStatus: "idle" | "loading" | "ready" | "error";
  degraded?: string;
}

let state: PortfolioState = {
  status: "loading",
  portfolios: [],
  source: "mock",
  summaryStatus: "idle",
};
const listeners = new Set<() => void>();
let loadedKey = "";
let loadRequest: Promise<void> | undefined;

function setState(next: Partial<PortfolioState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePortfolioState() {
  return useSyncExternalStore(subscribe, () => state);
}

export function activePortfolio(): Portfolio | undefined {
  return state.portfolios.find((portfolio) => portfolio.id === state.activeId);
}

function seedMock() {
  const portfolios = mockPortfolios();
  setState({
    status: "ready",
    portfolios,
    activeId: portfolios[0]?.id,
    source: "mock",
    summary: portfolios[0] ? buildMockSummary(portfolios[0]) : undefined,
    summaryStatus: "ready",
  });
}

const SUMMARY_TTL = 60 * 1000;
let summaryAt = 0;

export function loadPortfolios(api: LingWuApi, force = false): Promise<void> {
  const key = api.token;
  if (!force && state.status === "ready" && loadedKey === key) {
    if (state.source === "mock" || Date.now() - summaryAt < SUMMARY_TTL) return Promise.resolve();
  }
  if (loadRequest) return loadRequest;
  if (!state.portfolios.length) setState({ status: "loading" });
  const request = (async () => {
    try {
      const payload = await api.request<unknown>("/api/portfolios");
      const portfolios = parsePortfolios(payload);
      if (!portfolios) throw new Error("Unexpected portfolio payload");
      loadedKey = key;
      setState({
        status: "ready",
        portfolios,
        activeId: portfolios.some((portfolio) => portfolio.id === state.activeId)
          ? state.activeId
          : portfolios[0]?.id,
        source: "api",
        degraded: undefined,
      });
      if (state.activeId) await loadSummary(api, state.activeId);
    } catch (error) {
      seedMock();
      loadedKey = key;
      setState({ degraded: errorText(error) });
    } finally {
      loadRequest = undefined;
    }
  })();
  loadRequest = request;
  return request;
}

export function selectPortfolio(api: LingWuApi, id: string) {
  if (!state.portfolios.some((portfolio) => portfolio.id === id)) return;
  setState({ activeId: id });
  if (state.source === "mock") {
    const portfolio = state.portfolios.find((item) => item.id === id);
    setState({
      summary: portfolio ? buildMockSummary(portfolio) : undefined,
      summaryStatus: "ready",
    });
    return;
  }
  if (state.summary?.portfolio?.id !== id) void loadSummary(api, id);
}

export function loadSummary(api: LingWuApi, id: string): Promise<void> {
  setState({ summaryStatus: "loading" });
  return (async () => {
    try {
      const payload = await api.request<unknown>(
        `/api/portfolios/${encodeURIComponent(id)}/summary`,
      );
      const summary = parseSummary(payload, state.portfolios, id);
      if (!summary) throw new Error("Unexpected portfolio summary payload");
      summaryAt = Date.now();
      setState({ summary, summaryStatus: "ready", degraded: undefined });
    } catch (error) {
      setState({ summaryStatus: "error", degraded: errorText(error) });
    }
  })();
}

export function refreshSummary(api: LingWuApi) {
  if (!state.activeId) return;
  if (state.source === "mock") {
    const portfolio = activePortfolio();
    setState({
      summary: portfolio ? buildMockSummary(portfolio) : undefined,
      summaryStatus: "ready",
    });
    return;
  }
  void loadSummary(api, state.activeId);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

let localId = 0;
function nextId(prefix: string) {
  localId += 1;
  return `${prefix}-${Date.now().toString(36)}-${localId}`;
}

export async function createPortfolio(
  api: LingWuApi,
  input: { name: string; baseCurrency?: Currency; benchmark?: string },
): Promise<Portfolio> {
  const now = new Date().toISOString();
  const created: Portfolio = {
    id: nextId("pf"),
    name: input.name.trim(),
    baseCurrency: input.baseCurrency ?? "CNY",
    benchmark: input.benchmark,
    createdAt: now,
    updatedAt: now,
  };
  setState({ portfolios: [...state.portfolios, created], activeId: created.id });
  if (state.source === "api") {
    try {
      const payload = await api.request<unknown>("/api/portfolios", {
        name: created.name,
        base_currency: created.baseCurrency,
        benchmark: created.benchmark,
      });
      const parsed = parsePortfolio(payload);
      if (parsed) {
        setState({
          portfolios: state.portfolios.map((item) => (item.id === created.id ? parsed : item)),
          activeId: parsed.id,
        });
        await loadSummary(api, parsed.id);
        return parsed;
      }
    } catch {
      setState({
        portfolios: state.portfolios.filter((item) => item.id !== created.id),
        activeId: state.portfolios[0]?.id,
      });
      throw new Error("create_failed");
    }
  }
  setState({ summary: buildMockSummary(created), summaryStatus: "ready" });
  return created;
}

export async function renamePortfolio(api: LingWuApi, id: string, name: string) {
  const previous = state.portfolios;
  const next = previous.map((item) =>
    item.id === id ? { ...item, name: name.trim(), updatedAt: new Date().toISOString() } : item,
  );
  setState({ portfolios: next });
  if (state.source !== "api") return;
  try {
    await api.request(`/api/portfolios/${encodeURIComponent(id)}`, { name: name.trim() }, "PUT");
  } catch (error) {
    setState({ portfolios: previous });
    throw error;
  }
}

export async function deletePortfolio(api: LingWuApi, id: string) {
  const previousPortfolios = state.portfolios;
  const previousActive = state.activeId;
  const previousSummary = state.summary;
  const remaining = previousPortfolios.filter((item) => item.id !== id);
  setState({
    portfolios: remaining,
    activeId: previousActive === id ? remaining[0]?.id : previousActive,
    summary: previousActive === id ? undefined : previousSummary,
  });
  if (state.source === "api") {
    try {
      await api.request(`/api/portfolios/${encodeURIComponent(id)}`, undefined, "DELETE");
    } catch (error) {
      setState({
        portfolios: previousPortfolios,
        activeId: previousActive,
        summary: previousSummary,
      });
      throw error;
    }
    return;
  }
  const portfolio = activePortfolio();
  setState({ summary: portfolio ? buildMockSummary(portfolio) : undefined });
}

export async function addHolding(
  api: LingWuApi,
  input: {
    portfolioId: string;
    symbolCode: string;
    quantity: number;
    avgCost: number;
    name?: string;
    sector?: string;
    currency?: Currency;
    buyDate?: string;
  },
): Promise<void> {
  const meta = metaFor(input.symbolCode);
  const holding: Holding = {
    id: nextId("h"),
    portfolioId: input.portfolioId,
    symbolCode: input.symbolCode,
    name: input.name ?? meta.name,
    market: meta.market === "ETF" ? "US" : meta.market,
    currency: input.currency ?? marketCurrency(meta.market === "ETF" ? "US" : meta.market),
    quantity: input.quantity,
    avgCost: input.avgCost,
    sector: input.sector,
    buyDate: input.buyDate,
  };
  if (state.source === "mock") {
    const list = MOCK_HOLDINGS[input.portfolioId] ?? [];
    const existing = list.find((item) => item.symbolCode === holding.symbolCode);
    if (existing) {
      const totalQuantity = existing.quantity + holding.quantity;
      existing.avgCost =
        totalQuantity > 0
          ? (existing.quantity * existing.avgCost + holding.quantity * holding.avgCost) /
            totalQuantity
          : holding.avgCost;
      existing.quantity = totalQuantity;
    } else {
      MOCK_HOLDINGS[input.portfolioId] = [...list, holding];
    }
    const portfolio = activePortfolio();
    setState({
      summary: portfolio ? buildMockSummary(portfolio) : undefined,
      summaryStatus: "ready",
    });
    return;
  }
  await api.request(`/api/portfolios/${encodeURIComponent(input.portfolioId)}/holdings`, {
    symbol_code: holding.symbolCode,
    quantity: holding.quantity,
    avg_cost: holding.avgCost,
    name: holding.name,
    sector: holding.sector,
    currency: holding.currency,
    buy_date: holding.buyDate,
  });
  await loadSummary(api, input.portfolioId);
}

export async function updateHolding(
  api: LingWuApi,
  portfolioId: string,
  holdingId: string,
  patch: { quantity?: number; avgCost?: number; sector?: string },
): Promise<void> {
  if (state.source === "mock") {
    const list = MOCK_HOLDINGS[portfolioId] ?? [];
    const target = list.find((item) => item.id === holdingId);
    if (target) {
      if (patch.quantity !== undefined) target.quantity = patch.quantity;
      if (patch.avgCost !== undefined) target.avgCost = patch.avgCost;
      if (patch.sector !== undefined) target.sector = patch.sector;
    }
    const portfolio = activePortfolio();
    setState({
      summary: portfolio ? buildMockSummary(portfolio) : undefined,
      summaryStatus: "ready",
    });
    return;
  }
  await api.request(
    `/api/portfolios/${encodeURIComponent(portfolioId)}/holdings/${encodeURIComponent(holdingId)}`,
    {
      ...(patch.quantity === undefined ? {} : { quantity: patch.quantity }),
      ...(patch.avgCost === undefined ? {} : { avg_cost: patch.avgCost }),
      ...(patch.sector === undefined ? {} : { sector: patch.sector }),
    },
    "PUT",
  );
  await loadSummary(api, portfolioId);
}

export async function deleteHolding(
  api: LingWuApi,
  portfolioId: string,
  holdingId: string,
): Promise<void> {
  if (state.source === "mock") {
    MOCK_HOLDINGS[portfolioId] = (MOCK_HOLDINGS[portfolioId] ?? []).filter(
      (item) => item.id !== holdingId,
    );
    const portfolio = activePortfolio();
    setState({
      summary: portfolio ? buildMockSummary(portfolio) : undefined,
      summaryStatus: "ready",
    });
    return;
  }
  await api.request(
    `/api/portfolios/${encodeURIComponent(portfolioId)}/holdings/${encodeURIComponent(holdingId)}`,
    undefined,
    "DELETE",
  );
  await loadSummary(api, portfolioId);
}

/** 模拟「现有数量 → 导入后数量」（导入预览二次确认用）。 */
export function projectedHoldingQuantities(symbols: Map<string, number>) {
  const group = state.summary?.groups.flatMap((item) => item.positions) ?? [];
  const rows: Array<{ symbol: string; current: number; next: number }> = [];
  for (const [symbol, addition] of symbols) {
    const current = group.find((position) => position.symbolCode === symbol)?.quantity ?? 0;
    rows.push({ symbol, current, next: current + addition });
  }
  return rows;
}

/** mock 模式下的导入提交：合并同标的（数量相加、成本按数量加权）。 */
export function commitMockImport(
  portfolioId: string,
  rows: Array<{
    symbol: string;
    quantity: number;
    avgCost: number;
    currency: Currency;
    name?: string;
    sector?: string;
    buyDate?: string;
  }>,
) {
  const list = MOCK_HOLDINGS[portfolioId] ?? [];
  for (const row of rows) {
    const existing = list.find((item) => item.symbolCode === row.symbol);
    if (existing) {
      const totalQuantity = existing.quantity + row.quantity;
      existing.avgCost =
        totalQuantity > 0
          ? (existing.quantity * existing.avgCost + row.quantity * row.avgCost) / totalQuantity
          : row.avgCost;
      existing.quantity = totalQuantity;
      if (!existing.sector && row.sector) existing.sector = row.sector;
    } else {
      list.push({
        id: nextId("h"),
        portfolioId,
        symbolCode: row.symbol,
        name: row.name ?? metaFor(row.symbol).name,
        market:
          metaFor(row.symbol).market === "ETF" ? "US" : (metaFor(row.symbol).market as MarketKind),
        currency: row.currency,
        quantity: row.quantity,
        avgCost: row.avgCost,
        sector: row.sector,
        buyDate: row.buyDate,
      });
    }
  }
  MOCK_HOLDINGS[portfolioId] = list;
  const portfolio = activePortfolio();
  setState({
    summary: portfolio ? buildMockSummary(portfolio) : undefined,
    summaryStatus: "ready",
  });
}

/* ------------------------------------------------------------------ *
 * 解析（B1 契约，宽松）
 * ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function currencyOf(value: unknown, fallback: Currency = "CNY"): Currency {
  return value === "USD" || value === "CNY" || value === "HKD" ? value : fallback;
}

function marketOf(value: unknown): MarketKind {
  return value === "CN" || value === "HK" ? value : "US";
}

function parsePortfolio(value: unknown): Portfolio | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const name = str(value.name);
  if (!id || !name) return undefined;
  return {
    id,
    name,
    baseCurrency: currencyOf(value.base_currency ?? value.baseCurrency),
    benchmark: str(value.benchmark),
    createdAt: str(value.created_at) ?? str(value.createdAt) ?? new Date().toISOString(),
    updatedAt: str(value.updated_at) ?? str(value.updatedAt) ?? new Date().toISOString(),
  };
}

export function parsePortfolios(payload: unknown): Portfolio[] | undefined {
  const raw = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.portfolios)
      ? payload.portfolios
      : undefined;
  if (!raw) return undefined;
  return raw.map(parsePortfolio).filter((item): item is Portfolio => !!item);
}

function parseRisk(value: unknown): RiskSummary | undefined {
  if (!isRecord(value)) return undefined;
  const benchmark = isRecord(value.benchmark) ? value.benchmark : undefined;
  const series = Array.isArray(value.series)
    ? value.series.flatMap((point) =>
        isRecord(point) && typeof point.date === "string"
          ? [
              {
                date: point.date,
                portfolio: num(point.portfolio) ?? 0,
                benchmark: num(point.benchmark) ?? 0,
              },
            ]
          : [],
      )
    : undefined;
  const benchmarkSymbol = str(value.benchmark);
  return {
    beta: num(value.beta),
    sharpe: num(value.sharpe),
    maxDrawdown: num(value.max_drawdown) ?? num(value.maxDrawdown),
    return1y: num(value.annualized_return) ?? num(value.return_1y) ?? num(value.return1y),
    annualizedVolatility: num(value.annualized_volatility),
    samples: num(value.observations) ?? num(value.samples),
    riskFreeRate: num(value.risk_free_rate),
    benchmarkSymbol,
    benchmark: benchmark
      ? {
          symbol: str(benchmark.symbol) ?? benchmarkSymbol ?? "",
          name: str(benchmark.name) ?? "",
          return1y: num(benchmark.return_1y) ?? num(benchmark.return1y),
        }
      : undefined,
    unavailable: Array.isArray(value.unavailable)
      ? value.unavailable.flatMap((item) => {
          if (typeof item === "string") return [{ metric: "unknown", reason: item }];
          if (isRecord(item) && typeof item.metric === "string")
            return [{ metric: item.metric, reason: str(item.reason) ?? "" }];
          return [];
        })
      : undefined,
    series,
  };
}

function parseSlices(value: unknown, keyName: "symbol" | "key"): AllocationSlice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const key = str(entry[keyName]) ?? str(entry.symbol) ?? str(entry.key);
    const marketValue = num(entry.market_value) ?? num(entry.marketValue) ?? 0;
    if (!key) return [];
    return [{ key, marketValue, weight: num(entry.weight) ?? 0 }];
  });
}

export function parseSummary(
  payload: unknown,
  portfolios: Portfolio[],
  id: string,
): PortfolioSummaryView | undefined {
  if (!isRecord(payload)) return undefined;
  const record = isRecord(payload.portfolio) ? payload.portfolio : {};
  const portfolio =
    parsePortfolio(record) ?? portfolios.find((item) => item.id === id) ?? undefined;
  if (!portfolio) return undefined;
  const totals = Array.isArray(payload.totals) ? payload.totals : [];
  const positions = Array.isArray(payload.positions) ? payload.positions : [];
  const allocationRaw = Array.isArray(payload.allocation) ? payload.allocation : [];
  const topRaw = Array.isArray(payload.top_holdings) ? payload.top_holdings : [];
  const riskRaw = payload.risk;

  const groups: CurrencyGroup[] = totals.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const currency = currencyOf(entry.currency);
    const groupPositions: PositionView[] = positions.flatMap((raw) => {
      if (!isRecord(raw)) return [];
      const positionCurrency = currencyOf(raw.currency ?? raw.currency_code, currency);
      if (positionCurrency !== currency) return [];
      const holdingId =
        str(raw.id) ?? str(raw.holding_id) ?? `${str(raw.symbol_code) ?? "h"}-${currency}`;
      const quantity = num(raw.quantity) ?? 0;
      const avgCost = num(raw.avg_cost) ?? num(raw.avgCost) ?? 0;
      return [
        {
          id: holdingId,
          portfolioId: id,
          symbolCode: str(raw.symbol_code) ?? str(raw.symbol) ?? "",
          name: str(raw.name),
          market: marketOf(raw.market),
          currency,
          quantity,
          avgCost,
          sector: str(raw.sector),
          cost: num(raw.cost) ?? quantity * avgCost,
          price: num(raw.price),
          marketValue: num(raw.market_value) ?? num(raw.marketValue),
          pnl: num(raw.pnl),
          pnlPct: num(raw.pnl_pct) ?? num(raw.pnlPct),
          weight: num(raw.weight),
          changePercent: num(raw.change_percent) ?? num(raw.changePercent),
          stale: raw.stale === true,
          error: str(raw.error),
        },
      ];
    });
    const allocation = allocationRaw.find(
      (item) => isRecord(item) && currencyOf(item.currency) === currency,
    );
    const top = topRaw.find((item) => isRecord(item) && currencyOf(item.currency) === currency);
    const unvalued = isRecord(entry.unvalued) ? entry.unvalued : undefined;
    const riskEntry = Array.isArray(riskRaw)
      ? riskRaw.find((item) => isRecord(item) && currencyOf(item.currency) === currency)
      : isRecord(riskRaw)
        ? (riskRaw[currency] ?? (currency === portfolio.baseCurrency ? riskRaw : undefined))
        : undefined;
    const pricedTotal = groupPositions.reduce(
      (sum, position) => sum + (position.marketValue ?? 0),
      0,
    );
    const weightedPositions = groupPositions.map((position) => ({
      ...position,
      weight:
        position.weight ??
        (position.marketValue !== undefined && pricedTotal > 0
          ? (position.marketValue / pricedTotal) * 100
          : undefined),
    }));
    return [
      {
        currency,
        cost: num(entry.cost) ?? 0,
        marketValue: num(entry.market_value) ?? num(entry.marketValue) ?? 0,
        pnl: num(entry.pnl) ?? 0,
        pnlPct: num(entry.pnl_pct) ?? num(entry.pnlPct),
        pricedCount:
          num(entry.valued_positions) ?? groupPositions.filter((p) => p.price !== undefined).length,
        totalCount: num(entry.total_count) ?? num(entry.positions) ?? groupPositions.length,
        positions: weightedPositions,
        bySymbol: isRecord(allocation) ? parseSlices(allocation.by_symbol, "key") : [],
        bySector: isRecord(allocation) ? parseSlices(allocation.by_sector, "key") : [],
        topHoldings: isRecord(top) ? parseSlices(top.items, "key") : [],
        risk: parseRisk(riskEntry),
        unvaluedCount:
          num(unvalued?.count) ??
          groupPositions.filter((position) => position.marketValue === undefined).length,
        unvaluedCost:
          num(unvalued?.cost_total) ??
          groupPositions
            .filter((position) => position.marketValue === undefined)
            .reduce((sum, position) => sum + position.cost, 0),
        valuationCoverage:
          num(entry.valuation_coverage) ?? num(entry.valuationCoverage) ?? undefined,
        excludedSymbols:
          isRecord(allocation) && Array.isArray(allocation.excluded_symbols)
            ? allocation.excluded_symbols.filter((item): item is string => typeof item === "string")
            : [],
        unavailable: Array.isArray(payload.unavailable)
          ? payload.unavailable.filter((item): item is string => typeof item === "string")
          : [],
      },
    ];
  });

  return {
    portfolio,
    groups,
    fxNote: str(payload.fx_note) ?? "跨币种未折算：各币种分别汇总，合计不跨币种相加。",
    generatedAt: str(payload.generated_at) ?? new Date().toISOString(),
    unavailable: Array.isArray(payload.unavailable)
      ? payload.unavailable.filter((item): item is string => typeof item === "string")
      : [],
  };
}
