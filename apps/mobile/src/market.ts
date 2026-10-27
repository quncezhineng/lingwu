/**
 * 投研行情数据层（F1 观察列表 / F2 市场简报）。
 *
 * 真实接口（后端 B4，main afc0723）：
 * - GET    /api/watchlists                    → { watchlists: Watchlist[] }（symbols 为代码数组）
 * - POST   /api/watchlists                    → Watchlist
 * - PUT    /api/watchlists/:id                → Watchlist
 * - DELETE /api/watchlists/:id                → 204
 * - POST   /api/watchlists/:id/symbols        → Watchlist
 * - DELETE /api/watchlists/:id/symbols/:code  → Watchlist（code 需 URL 编码）
 * - GET    /api/watchlists/:id/summary        → quotes / movers / unavailable
 * - GET    /api/symbols/search?q=&limit=      → { matches: SymbolMatch[] }
 *
 * 行情（price/change）来自 summary 接口，列表接口只返回代码，
 * 因此在 summary 返回前卡片以「—」占位，而不是编造价格。
 * 接口不可用（后端未启动 / 路由未就绪）时回落 mock 种子，并在 UI 上标注「示例数据」。
 */
import { useSyncExternalStore } from "react";
import type { LingWuApi } from "./api";

export type MarketKind = "US" | "CN" | "HK" | "ETF";

export interface SymbolMeta {
  code: string;
  name: string;
  market: MarketKind;
}

export interface Quote {
  price: number;
  change?: number;
  changePercent?: number;
  weekChangePercent?: number;
  /** 当日成交量 / 20 日均量，≥2 视为放量（mock 数据提供）。 */
  volumeRatio?: number;
  currency?: string;
  stale?: boolean;
}

export type AlertKind = "price_break" | "change_threshold" | "volume_spike" | "news";

export interface SymbolAlert {
  kind: AlertKind;
  /** 价格突破的关键位（例：52 周新高 205.4）。 */
  level?: number;
  /** 涨跌幅阈值（百分数，正负表示方向）。 */
  threshold?: number;
  /** 放量倍数。 */
  multiple?: number;
  /** 关联新闻标题。 */
  headline?: string;
}

export interface WatchlistSymbol {
  symbol: SymbolMeta;
  /** summary 尚未返回或该标的取价失败时为 undefined。 */
  quote?: Quote;
  alerts: SymbolAlert[];
  unavailable?: boolean;
}

export interface Watchlist {
  id: string;
  name: string;
  symbols: WatchlistSymbol[];
  updatedAt: string;
}

export interface IndexQuote {
  name: string;
  value: number;
  changePercent: number;
}

export interface BriefingSymbolUpdate {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  alert?: AlertKind;
}

export interface BriefingEvent {
  time: string;
  title: string;
}

export interface MarketBriefing {
  id: string;
  /** 生成日期 YYYY-MM-DD；早于今天时 UI 标记「昨日」。 */
  date: string;
  summary: string[];
  marketData: IndexQuote[];
  symbolUpdates: BriefingSymbolUpdate[];
  events: BriefingEvent[];
  generatedAt: string;
}

export type DataSource = "mock" | "api";

/* ------------------------------------------------------------------ *
 * 行情目录（mock 种子 + 搜索兜底 + 离线报价）
 * ------------------------------------------------------------------ */

const CATALOG: SymbolMeta[] = [
  { code: "AAPL", name: "Apple Inc.", market: "US" },
  { code: "MSFT", name: "Microsoft Corp.", market: "US" },
  { code: "NVDA", name: "NVIDIA Corp.", market: "US" },
  { code: "TSLA", name: "Tesla Inc.", market: "US" },
  { code: "GOOGL", name: "Alphabet Inc.", market: "US" },
  { code: "600519.SS", name: "贵州茅台", market: "CN" },
  { code: "300750.SZ", name: "宁德时代", market: "CN" },
  { code: "601318.SS", name: "中国平安", market: "CN" },
  { code: "000858.SZ", name: "五粮液", market: "CN" },
  { code: "00700.HK", name: "腾讯控股", market: "HK" },
  { code: "09988.HK", name: "阿里巴巴-W", market: "HK" },
  { code: "SPY", name: "SPDR S&P 500 ETF", market: "ETF" },
  { code: "QQQ", name: "Invesco QQQ Trust", market: "ETF" },
  { code: "510300.SS", name: "沪深300ETF", market: "ETF" },
];

const SEED_QUOTES: Record<string, Quote> = {
  AAPL: {
    price: 198.5,
    change: 4.52,
    changePercent: 2.34,
    weekChangePercent: 5.12,
    volumeRatio: 1.4,
  },
  TSLA: {
    price: 245.8,
    change: 10.72,
    changePercent: 4.56,
    weekChangePercent: 8.91,
    volumeRatio: 2.3,
  },
  NVDA: {
    price: 142.3,
    change: -0.64,
    changePercent: -0.45,
    weekChangePercent: 2.18,
    volumeRatio: 0.9,
  },
  MSFT: {
    price: 431.2,
    change: 2.18,
    changePercent: 0.51,
    weekChangePercent: 1.32,
    volumeRatio: 1.1,
  },
  GOOGL: {
    price: 172.4,
    change: -1.05,
    changePercent: -0.61,
    weekChangePercent: 0.44,
    volumeRatio: 0.8,
  },
  "600519.SS": {
    price: 1856,
    change: -23,
    changePercent: -1.23,
    weekChangePercent: -2.87,
    volumeRatio: 1.2,
  },
  "300750.SZ": {
    price: 268.4,
    change: 9.12,
    changePercent: 5.24,
    weekChangePercent: 6.9,
    volumeRatio: 2.6,
  },
  "601318.SS": {
    price: 51.26,
    change: 0.38,
    changePercent: 0.75,
    weekChangePercent: -0.9,
    volumeRatio: 1,
  },
  "000858.SZ": {
    price: 138.9,
    change: -2.1,
    changePercent: -1.49,
    weekChangePercent: -3.31,
    volumeRatio: 1.3,
  },
  "00700.HK": {
    price: 412.6,
    change: 6.4,
    changePercent: 1.58,
    weekChangePercent: 3.42,
    volumeRatio: 1.5,
  },
  "09988.HK": {
    price: 98.55,
    change: -1.15,
    changePercent: -1.15,
    weekChangePercent: 0.62,
    volumeRatio: 0.95,
  },
  SPY: {
    price: 584.15,
    change: 4.42,
    changePercent: 0.78,
    weekChangePercent: 1.64,
    volumeRatio: 1.05,
  },
  QQQ: {
    price: 498.32,
    change: 5.91,
    changePercent: 1.2,
    weekChangePercent: 2.46,
    volumeRatio: 1.15,
  },
  "510300.SS": {
    price: 3.92,
    change: 0.03,
    changePercent: 0.85,
    weekChangePercent: 1.12,
    volumeRatio: 1.25,
  },
};

const SEED_ALERTS: Record<string, SymbolAlert[]> = {
  AAPL: [{ kind: "price_break", level: 198.5 }],
  TSLA: [{ kind: "volume_spike", multiple: 2.3 }],
  "300750.SZ": [
    { kind: "change_threshold", threshold: 5.24 },
    { kind: "news", headline: "宁德时代发布新一代神行电池，机构上调全年出货预期" },
  ],
  "00700.HK": [{ kind: "news", headline: "腾讯第三季度广告收入超预期" }],
};

/** 后端把 `.SH` 规范化成 `.SS`，这里同步做一次，避免 mock/live 代码不一致。 */
export function normalizeCode(code: string): string {
  const trimmed = code.trim();
  return /\.SH$/i.test(trimmed)
    ? `${trimmed.slice(0, -3).toUpperCase()}.SS`
    : trimmed.toUpperCase();
}

export function catalogEntry(code: string): SymbolMeta | undefined {
  const normalized = normalizeCode(code);
  return CATALOG.find((item) => item.code === normalized);
}

function hashSeed(code: string) {
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) hash = (hash * 31 + code.charCodeAt(i)) % 100000;
  return hash;
}

function syntheticQuote(symbol: SymbolMeta): Quote {
  const seed = hashSeed(symbol.code);
  const price = Number((20 + (seed % 48000) / 100).toFixed(2));
  const changePercent = Number((((seed % 900) - 400) / 100).toFixed(2));
  return {
    price,
    change: Number(((price * changePercent) / 100).toFixed(2)),
    changePercent,
    weekChangePercent: Number((changePercent * 1.7).toFixed(2)),
    volumeRatio: Number((0.7 + (seed % 220) / 100).toFixed(1)),
  };
}

export function quoteFor(symbol: SymbolMeta): Quote {
  const seed = SEED_QUOTES[symbol.code];
  return seed ? { ...seed } : syntheticQuote(symbol);
}

export function alertsFor(code: string): SymbolAlert[] {
  return (SEED_ALERTS[code] ?? []).map((alert) => ({ ...alert }));
}

export function metaFor(code: string): SymbolMeta {
  const normalized = normalizeCode(code);
  return (
    catalogEntry(normalized) ?? {
      code: normalized,
      name: normalized,
      market: guessMarket(normalized),
    }
  );
}

function guessMarket(code: string): MarketKind {
  if (/\.SS$|\.SZ$|^6|^0|^3/.test(code)) return "CN";
  if (/\.HK$/.test(code)) return "HK";
  return "US";
}

export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * mock 种子（随语言切换重建）
 * ------------------------------------------------------------------ */

function mockWatchlists(locale: string): Watchlist[] {
  const zh = locale.startsWith("zh");
  const build = (code: string): WatchlistSymbol | undefined => {
    const symbol = catalogEntry(code);
    return symbol ? { symbol, quote: quoteFor(symbol), alerts: alertsFor(code) } : undefined;
  };
  const first = ["AAPL", "600519.SS", "TSLA", "NVDA"]
    .map(build)
    .filter(Boolean) as WatchlistSymbol[];
  const second = ["SPY", "QQQ", "510300.SS"].map(build).filter(Boolean) as WatchlistSymbol[];
  return [
    {
      id: "wl-core",
      name: zh ? "核心持仓" : "Core holdings",
      symbols: first,
      updatedAt: new Date().toISOString(),
    },
    {
      id: "wl-etf",
      name: zh ? "ETF 观察" : "ETF watch",
      symbols: second,
      updatedAt: new Date().toISOString(),
    },
  ];
}

function mockBriefing(locale: string): MarketBriefing {
  const zh = locale.startsWith("zh");
  return {
    id: `briefing-${todayISO()}`,
    date: todayISO(),
    summary: zh
      ? [
          "美股三大指数集体收涨，纳指涨 1.20% 创历史新高，科技股领涨。",
          "美联储官员暗示 12 月可能降息，10 年期美债收益率回落至 4.12%。",
          "你的观察列表 AAPL 突破 52 周新高，TSLA 放量上涨 4.56%。",
          "宁德时代发布新一代神行电池，A 股新能源板块尾盘走强。",
        ]
      : [
          "US indices closed higher; the Nasdaq rose 1.20% to a record close on tech strength.",
          "Fed officials hinted at a December cut; the 10-year Treasury yield eased to 4.12%.",
          "AAPL in your watchlist hit a 52-week high while TSLA rose 4.56% on heavy volume.",
          "CATL unveiled its next-gen Shenxing battery, lifting A-share battery names late in the session.",
        ],
    marketData: [
      { name: zh ? "上证指数" : "Shanghai Composite", value: 3256.78, changePercent: 0.85 },
      { name: zh ? "深证成指" : "Shenzhen Component", value: 10432.15, changePercent: 1.12 },
      { name: zh ? "纳斯达克" : "Nasdaq", value: 18956.32, changePercent: 1.2 },
      { name: zh ? "标普 500" : "S&P 500", value: 5842.15, changePercent: 0.78 },
    ],
    symbolUpdates: [
      { code: "AAPL", name: "Apple Inc.", price: 198.5, changePercent: 2.34, alert: "price_break" },
      {
        code: "TSLA",
        name: "Tesla Inc.",
        price: 245.8,
        changePercent: 4.56,
        alert: "volume_spike",
      },
      { code: "NVDA", name: "NVIDIA Corp.", price: 142.3, changePercent: -0.45 },
    ],
    events: [
      { time: "20:30", title: zh ? "美国 10 月非农就业数据公布" : "US October nonfarm payrolls" },
      { time: "22:00", title: zh ? "美联储主席鲍威尔发表讲话" : "Fed Chair Powell speech" },
      {
        time: "04:00",
        title: zh ? "苹果、微软发布季度财报" : "Apple and Microsoft report earnings",
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * store：观察列表
 * ------------------------------------------------------------------ */

interface WatchlistState {
  status: "loading" | "ready";
  lists: Watchlist[];
  activeId?: string;
  source: DataSource;
  /** 接口失败但已回落 mock 时的原因，UI 用于解释「示例数据」。 */
  degraded?: string;
  /** summary 正在拉取（行情可能暂时为空）。 */
  refreshing: boolean;
}

let watchlistState: WatchlistState = {
  status: "loading",
  lists: [],
  source: "mock",
  refreshing: false,
};
const watchlistListeners = new Set<() => void>();

function setWatchlistState(next: Partial<WatchlistState>) {
  watchlistState = { ...watchlistState, ...next };
  for (const listener of watchlistListeners) listener();
}

function subscribeWatchlists(listener: () => void) {
  watchlistListeners.add(listener);
  return () => watchlistListeners.delete(listener);
}

export function useWatchlistState() {
  return useSyncExternalStore(subscribeWatchlists, () => watchlistState);
}

export function activeWatchlist(): Watchlist | undefined {
  return watchlistState.lists.find((list) => list.id === watchlistState.activeId);
}

let watchlistLocale = "";
let loadedFor = "";
let watchlistRequest: Promise<void> | undefined;
const summaryRequests = new Map<string, Promise<void>>();

function seedWatchlists(locale: string) {
  const lists = mockWatchlists(locale);
  watchlistLocale = locale;
  setWatchlistState({
    status: "ready",
    lists,
    activeId: watchlistState.activeId ?? lists[0]?.id,
    source: "mock",
    refreshing: false,
  });
}

function seedWatchlistsIfNeeded(locale: string) {
  if (watchlistLocale !== locale || !watchlistState.lists.length) seedWatchlists(locale);
}

/** 首次加载：GET /api/watchlists；失败回落 mock。 */
export function loadWatchlists(api: LingWuApi, locale: string, force = false): Promise<void> {
  const key = `${locale}:${api.token}`;
  if (!force) {
    if (watchlistRequest) return watchlistRequest;
    if (watchlistState.status === "ready" && watchlistLocale === locale && loadedFor === key)
      return Promise.resolve();
  }
  // 先不铺 mock 报价：真实接口成功时直接展示实时数据，
  // 只有接口失败才回落到 mock（避免短暂显示假价格）。
  if (!watchlistState.lists.length) {
    watchlistLocale = locale;
    setWatchlistState({ status: "loading", source: "api", degraded: undefined });
  }
  const request = (async () => {
    try {
      const payload = await api.request<unknown>("/api/watchlists");
      const lists = parseWatchlists(payload);
      if (!lists) throw new Error("Unexpected watchlist payload");
      loadedFor = key;
      const activeId = lists.some((list) => list.id === watchlistState.activeId)
        ? watchlistState.activeId
        : lists[0]?.id;
      setWatchlistState({
        status: "ready",
        lists,
        activeId,
        source: "api",
        degraded: undefined,
        refreshing: !!activeId,
      });
      if (activeId) await loadSummary(api, activeId);
    } catch (error) {
      seedWatchlistsIfNeeded(locale);
      setWatchlistState({
        status: "ready",
        source: "mock",
        refreshing: false,
        degraded: error instanceof Error ? error.message : String(error),
      });
    } finally {
      watchlistRequest = undefined;
    }
  })();
  watchlistRequest = request;
  return request;
}

/** GET /api/watchlists/:id/summary：把 quotes / movers 合并进当前列表。 */
export function loadSummary(api: LingWuApi, id: string): Promise<void> {
  const inFlight = summaryRequests.get(id);
  if (inFlight) return inFlight;
  setWatchlistState({ refreshing: true });
  const request = (async () => {
    try {
      const payload = await api.request<unknown>(
        `/api/watchlists/${encodeURIComponent(id)}/summary`,
      );
      const summary = parseSummary(payload);
      if (!summary) return;
      const lists = watchlistState.lists.map((list) =>
        list.id === id ? mergeSummary(list, summary) : list,
      );
      setWatchlistState({ lists, degraded: undefined });
    } catch (error) {
      setWatchlistState({ degraded: error instanceof Error ? error.message : String(error) });
    } finally {
      summaryRequests.delete(id);
      setWatchlistState({ refreshing: false });
    }
  })();
  summaryRequests.set(id, request);
  return request;
}

export function selectWatchlist(api: LingWuApi, id: string) {
  if (!watchlistState.lists.some((list) => list.id === id)) return;
  setWatchlistState({ activeId: id });
  const list = watchlistState.lists.find((item) => item.id === id);
  if (watchlistState.source === "api" && list?.symbols.some((item) => !item.quote)) {
    void loadSummary(api, id);
  }
}

/** 60s 轮询：真实接口模式刷新 summary；mock 模式让报价小幅波动，便于观察刷新效果。 */
export function refreshWatchlists(api: LingWuApi, locale: string) {
  if (watchlistState.source === "api") {
    if (watchlistState.activeId) void loadSummary(api, watchlistState.activeId);
    return;
  }
  const lists = watchlistState.lists.map((list) => ({
    ...list,
    symbols: list.symbols.map((item) => {
      if (!item.quote) return item;
      const drift = Number(((Math.random() - 0.5) * 0.6).toFixed(3));
      const price = Number(Math.max(0.01, item.quote.price * (1 + drift / 100)).toFixed(2));
      const change = Number(((item.quote.change ?? 0) + price - item.quote.price).toFixed(2));
      return {
        ...item,
        quote: {
          ...item.quote,
          price,
          change,
          changePercent: Number((((item.quote.changePercent ?? 0) + drift) as number).toFixed(2)),
        },
      };
    }),
    updatedAt: new Date().toISOString(),
  }));
  seedWatchlistsIfNeeded(locale);
  setWatchlistState({ lists });
}

let localIdSeed = 0;
function localId(prefix: string) {
  localIdSeed += 1;
  return `${prefix}-${Date.now().toString(36)}-${localIdSeed}`;
}

function makeSymbolEntry(symbol: SymbolMeta): WatchlistSymbol {
  return { symbol, quote: quoteFor(symbol), alerts: alertsFor(symbol.code) };
}

export function createWatchlist(api: LingWuApi, input: { name: string; symbols: SymbolMeta[] }) {
  const list: Watchlist = {
    id: localId("wl"),
    name: input.name.trim(),
    symbols: input.symbols.map(makeSymbolEntry),
    updatedAt: new Date().toISOString(),
  };
  setWatchlistState({ lists: [...watchlistState.lists, list], activeId: list.id });
  if (watchlistState.source === "api") {
    void api
      .request("/api/watchlists", {
        name: list.name,
        symbols: list.symbols.map((item) => item.symbol.code),
      })
      .then(() => loadWatchlists(api, watchlistLocale, true))
      .catch(() => undefined);
  }
}

export function updateWatchlist(
  api: LingWuApi,
  id: string,
  patch: { name?: string; symbols?: SymbolMeta[] },
) {
  const lists = watchlistState.lists.map((list) => {
    if (list.id !== id) return list;
    const symbols =
      patch.symbols === undefined
        ? list.symbols
        : patch.symbols.map(
            (symbol) =>
              list.symbols.find((item) => item.symbol.code === symbol.code) ??
              makeSymbolEntry(symbol),
          );
    return {
      ...list,
      name: patch.name?.trim() || list.name,
      symbols,
      updatedAt: new Date().toISOString(),
    };
  });
  setWatchlistState({ lists });
  if (watchlistState.source === "api") {
    void api
      .request(
        `/api/watchlists/${encodeURIComponent(id)}`,
        {
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.symbols === undefined
            ? {}
            : { symbols: patch.symbols.map((symbol) => symbol.code) }),
        },
        "PUT",
      )
      .then(() => loadSummary(api, id))
      .catch(() => undefined);
  }
}

export function deleteWatchlist(api: LingWuApi, id: string) {
  const lists = watchlistState.lists.filter((list) => list.id !== id);
  setWatchlistState({
    lists,
    activeId: watchlistState.activeId === id ? lists[0]?.id : watchlistState.activeId,
  });
  if (watchlistState.source === "api") {
    void api
      .request(`/api/watchlists/${encodeURIComponent(id)}`, undefined, "DELETE")
      .catch(() => undefined);
  }
}

export function addSymbols(api: LingWuApi, id: string, symbols: SymbolMeta[]) {
  const list = watchlistState.lists.find((item) => item.id === id);
  if (!list) return;
  const additions = symbols.filter(
    (symbol) => !list.symbols.some((item) => item.symbol.code === symbol.code),
  );
  if (!additions.length) return;
  updateWatchlist(api, id, { symbols: [...list.symbols.map((item) => item.symbol), ...additions] });
  if (watchlistState.source === "api") {
    for (const symbol of additions) {
      void api
        .request(`/api/watchlists/${encodeURIComponent(id)}/symbols`, {
          code: symbol.code,
          name: symbol.name,
          ...(symbol.market === "ETF" ? {} : { market: symbol.market }),
        })
        .then(() => loadSummary(api, id))
        .catch(() => undefined);
    }
  }
}

export function removeSymbol(api: LingWuApi, id: string, code: string) {
  const list = watchlistState.lists.find((item) => item.id === id);
  if (!list) return;
  updateWatchlist(api, id, {
    symbols: list.symbols.filter((item) => item.symbol.code !== code).map((item) => item.symbol),
  });
  if (watchlistState.source === "api") {
    void api
      .request(
        `/api/watchlists/${encodeURIComponent(id)}/symbols/${encodeURIComponent(code)}`,
        undefined,
        "DELETE",
      )
      .catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ *
 * 标的搜索
 * ------------------------------------------------------------------ */

function localSearch(query: string, limit = 6): SymbolMeta[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return CATALOG.filter(
    (item) => item.code.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle),
  ).slice(0, limit);
}

/** GET /api/symbols/search?q=；接口不可用时退回内置目录。 */
export async function searchSymbols(
  api: LingWuApi,
  query: string,
  limit = 6,
): Promise<SymbolMeta[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const payload = await api.request<unknown>(
      `/api/symbols/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`,
    );
    const matches = isRecord(payload) && Array.isArray(payload.matches) ? payload.matches : null;
    if (matches) {
      const parsed = matches.map(parseSymbolMatch).filter((item): item is SymbolMeta => !!item);
      if (parsed.length || watchlistState.source === "api") return parsed;
    }
  } catch {
    // 搜索接口未就绪：用内置目录兜底，保证离线也能添加标的。
  }
  return localSearch(trimmed, limit);
}

/* ------------------------------------------------------------------ *
 * store：市场简报
 * ------------------------------------------------------------------ */

interface BriefingState {
  status: "loading" | "ready" | "generating";
  briefing?: MarketBriefing;
  source: DataSource;
  error?: string;
}

let briefingState: BriefingState = { status: "loading", source: "mock" };
const briefingListeners = new Set<() => void>();
let briefingLocale = "";
let briefingLoadedAt = 0;
let briefingRequest: Promise<void> | undefined;
const BRIEFING_TTL = 60 * 60 * 1000;

function setBriefingState(next: Partial<BriefingState>) {
  briefingState = { ...briefingState, ...next };
  for (const listener of briefingListeners) listener();
}

function subscribeBriefing(listener: () => void) {
  briefingListeners.add(listener);
  return () => briefingListeners.delete(listener);
}

export function useBriefingState() {
  return useSyncExternalStore(subscribeBriefing, () => briefingState);
}

/** GET /api/briefings/today；接口未就绪（B3 进行中）时回落 mock。 */
export function loadBriefing(api: LingWuApi, locale: string, force = false): Promise<void> {
  if (!force && briefingState.status === "ready" && briefingLocale === locale) {
    if (Date.now() - briefingLoadedAt < BRIEFING_TTL) return Promise.resolve();
  }
  if (briefingRequest) return briefingRequest;
  const request = (async () => {
    try {
      const payload = await api.request<unknown>("/api/briefings/today");
      const parsed = parseBriefing(payload);
      if (!parsed) throw new Error("Unexpected briefing payload");
      briefingLocale = locale;
      briefingLoadedAt = Date.now();
      setBriefingState({ status: "ready", briefing: parsed, source: "api", error: undefined });
    } catch (error) {
      briefingLocale = locale;
      briefingLoadedAt = Date.now();
      setBriefingState({
        status: "ready",
        briefing: mockBriefing(locale),
        source: "mock",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      briefingRequest = undefined;
    }
  })();
  briefingRequest = request;
  return request;
}

/** 「立即生成今日简报」：mock 模式下模拟生成；真实接口就绪后替换为触发 market_briefing 任务。 */
export async function generateBriefing(locale: string): Promise<void> {
  setBriefingState({ status: "generating", error: undefined });
  await new Promise((resolve) => setTimeout(resolve, 900));
  briefingLocale = locale;
  briefingLoadedAt = Date.now();
  setBriefingState({ status: "ready", briefing: mockBriefing(locale), source: "mock" });
}

/* ------------------------------------------------------------------ *
 * 宽容解析：后端字段 snake_case / camelCase 均可
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

function marketOf(value: unknown, code: string): MarketKind {
  if (value === "US" || value === "CN" || value === "HK") return value;
  const known = catalogEntry(code);
  return known?.market ?? guessMarket(code);
}

function parseSymbolMatch(value: unknown): SymbolMeta | undefined {
  if (!isRecord(value)) return undefined;
  const code = str(value.symbol) ?? str(value.code);
  if (!code) return undefined;
  const known = catalogEntry(code);
  const type = (str(value.type) ?? "").toUpperCase();
  const market: MarketKind =
    type === "ETF" || known?.market === "ETF" ? "ETF" : marketOf(value.market, code);
  return {
    code: normalizeCode(code),
    name: str(value.name) ?? str(value.longname) ?? known?.name ?? code,
    market,
  };
}

export function parseWatchlists(payload: unknown): Watchlist[] | undefined {
  const raw = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.watchlists)
      ? payload.watchlists
      : undefined;
  if (!raw) return undefined;
  const lists: Watchlist[] = [];
  raw.forEach((item, index) => {
    if (!isRecord(item)) return;
    const symbolsRaw = Array.isArray(item.symbols) ? item.symbols : [];
    const symbols: WatchlistSymbol[] = [];
    for (const entry of symbolsRaw) {
      const code =
        typeof entry === "string" ? entry : isRecord(entry) ? str(entry.code) : undefined;
      if (!code) continue;
      const normalized = normalizeCode(code);
      // 异动只来自真实 summary（movers），不沿用 mock 种子。
      symbols.push({ symbol: metaFor(normalized), alerts: [] });
    }
    lists.push({
      id: str(item.id) ?? `remote-${index}`,
      name: str(item.name) ?? `Watchlist ${index + 1}`,
      symbols,
      updatedAt: str(item.updated_at) ?? str(item.updatedAt) ?? new Date().toISOString(),
    });
  });
  return lists;
}

export interface SummaryQuote {
  symbol: string;
  name?: string;
  market: MarketKind;
  quote?: Quote;
  unavailable: boolean;
  changePercent?: number;
}

export interface Summary {
  quotes: SummaryQuote[];
  generatedAt: string;
}

export function parseSummary(payload: unknown): Summary | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.quotes)) return undefined;
  const quotes: SummaryQuote[] = payload.quotes.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const symbol = str(entry.symbol);
    if (!symbol) return [];
    const price = num(entry.price);
    const code = normalizeCode(symbol);
    return [
      {
        symbol: code,
        name: str(entry.name),
        market: marketOf(entry.market, code),
        quote:
          price === undefined
            ? undefined
            : {
                price,
                change: num(entry.change),
                changePercent: num(entry.changePercent),
                currency: str(entry.currency),
                stale: entry.stale === true,
              },
        unavailable: !!str(entry.error) || price === undefined,
        changePercent: num(entry.changePercent),
      },
    ];
  });
  return {
    quotes,
    generatedAt: str(payload.generated_at) ?? str(payload.generatedAt) ?? new Date().toISOString(),
  };
}

export function mergeSummary(list: Watchlist, summary: Summary): Watchlist {
  const byCode = new Map(summary.quotes.map((quote) => [quote.symbol, quote]));
  return {
    ...list,
    updatedAt: summary.generatedAt,
    symbols: list.symbols.map((item) => {
      const remote = byCode.get(item.symbol.code);
      if (!remote) return item;
      const symbol: SymbolMeta = {
        code: item.symbol.code,
        name: remote.name ?? item.symbol.name,
        // ETF 是前端的分组维度，后端只返回 US/CN/HK：保留本地判定。
        market: item.symbol.market === "ETF" ? "ETF" : remote.market,
      };
      const alerts =
        remote.changePercent !== undefined && Math.abs(remote.changePercent) >= 2
          ? [{ kind: "change_threshold" as const, threshold: remote.changePercent }]
          : [];
      return { symbol, quote: remote.quote, alerts, unavailable: remote.unavailable };
    }),
  };
}

export function parseBriefing(payload: unknown): MarketBriefing | undefined {
  if (!isRecord(payload)) return undefined;
  const record = isRecord(payload.briefing) ? payload.briefing : payload;
  const summary = record.summary;
  if (!Array.isArray(summary) || !summary.length) return undefined;
  const marketData = record.marketData ?? record.market_data;
  const symbolUpdates = record.symbolUpdates ?? record.symbol_updates;
  return {
    id: str(record.id) ?? `briefing-${todayISO()}`,
    date: str(record.date) ?? todayISO(),
    summary: summary.filter((line): line is string => typeof line === "string"),
    marketData: Array.isArray(marketData)
      ? marketData.flatMap((entry) =>
          isRecord(entry) && typeof entry.name === "string" && typeof entry.value === "number"
            ? [
                {
                  name: entry.name,
                  value: entry.value,
                  changePercent: num(entry.changePercent) ?? 0,
                },
              ]
            : [],
        )
      : [],
    symbolUpdates: Array.isArray(symbolUpdates)
      ? symbolUpdates.flatMap((entry) =>
          isRecord(entry) && typeof entry.code === "string" && typeof entry.price === "number"
            ? [
                {
                  code: entry.code,
                  name: str(entry.name) ?? entry.code,
                  price: entry.price,
                  changePercent: num(entry.changePercent) ?? 0,
                  alert:
                    entry.alert === "price_break" ||
                    entry.alert === "change_threshold" ||
                    entry.alert === "volume_spike" ||
                    entry.alert === "news"
                      ? entry.alert
                      : undefined,
                },
              ]
            : [],
        )
      : [],
    events: Array.isArray(record.events)
      ? record.events.flatMap((entry) =>
          isRecord(entry) && typeof entry.title === "string"
            ? [{ time: str(entry.time) ?? "", title: entry.title }]
            : [],
        )
      : [],
    generatedAt: str(record.generated_at) ?? str(record.generatedAt) ?? new Date().toISOString(),
  };
}
