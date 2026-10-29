/**
 * 行情数据层单测（F1/F2）。
 *
 * 覆盖：代码规范化、观察列表响应解析、summary 合并（报价 / 异动 / ETF 分组保留）、
 * 简报解析（camelCase 与 snake_case）、标的搜索的真实接口与离线兜底。
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { LingWuApi } from "../src/api.ts";
import {
  activeWatchlist,
  deleteWatchlist,
  loadWatchlists,
  mergeSummary,
  normalizeCode,
  parseBriefing,
  parseSummary,
  parseWatchlists,
  searchSymbols,
} from "../src/market.ts";

function fakeApi(handler: (path: string, body?: unknown, method?: string) => unknown): LingWuApi {
  return {
    token: "test-token",
    request: async (path: string, body?: unknown, method?: string) =>
      handler(path, body, method ?? (body === undefined ? "GET" : "POST")),
  } as unknown as LingWuApi;
}

test("代码规范化：.SH → .SS、统一大写", () => {
  assert.equal(normalizeCode("600519.sh"), "600519.SS");
  assert.equal(normalizeCode(" aapl "), "AAPL");
  assert.equal(normalizeCode("00700.HK"), "0700.HK");
});

test("观察列表响应：代码数组解析为带名称的标的，未取价前不编造报价", () => {
  const lists = parseWatchlists({
    watchlists: [
      {
        id: "wl-1",
        name: "核心持仓",
        symbols: ["AAPL", "600519.SS", "510300.SS"],
        updated_at: "2026-10-27T00:00:00.000Z",
      },
    ],
  });
  assert.ok(lists);
  assert.equal(lists?.length, 1);
  const list = lists?.[0];
  assert.equal(list?.name, "核心持仓");
  assert.deepEqual(
    list?.symbols.map((item) => item.symbol.code),
    ["AAPL", "600519.SS", "510300.SS"],
  );
  assert.equal(list?.symbols[1]?.symbol.name, "贵州茅台");
  assert.equal(list?.symbols[2]?.symbol.market, "ETF");
  assert.equal(list?.symbols[0]?.quote, undefined);
});

test("观察列表响应：基金代码按内置目录归入基金分组", () => {
  const lists = parseWatchlists({
    watchlists: [{ id: "wl-fund", name: "基金观察", symbols: ["005827"] }],
  });
  assert.equal(lists?.[0]?.symbols[0]?.symbol.name, "易方达蓝筹精选混合");
  assert.equal(lists?.[0]?.symbols[0]?.symbol.market, "FUND");
});

test("观察列表响应结构不符时返回 undefined（触发 mock 兜底）", () => {
  assert.equal(parseWatchlists({ nope: true }), undefined);
  assert.equal(parseWatchlists(null), undefined);
});

test("summary 解析：成功取价 / 失败标的标记不可用", () => {
  const summary = parseSummary({
    watchlist_id: "wl-1",
    generated_at: "2026-10-27T01:02:03.000Z",
    quotes: [
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        market: "US",
        price: 343.91,
        change: -3.81,
        changePercent: -1.1,
        currency: "USD",
      },
      { symbol: "600519.SS", market: "CN", error: "network" },
    ],
    movers: [],
    unavailable: ["600519.SS"],
  });
  assert.ok(summary);
  assert.equal(summary?.quotes.length, 2);
  assert.equal(summary?.quotes[0]?.quote?.price, 343.91);
  assert.equal(summary?.quotes[0]?.quote?.currency, "USD");
  assert.equal(summary?.quotes[0]?.unavailable, false);
  assert.equal(summary?.quotes[1]?.quote, undefined);
  assert.equal(summary?.quotes[1]?.unavailable, true);
});

test("summary 合并：回填名称与报价，≥2% 涨跌生成异动，ETF 分组不被覆盖", () => {
  const lists = parseWatchlists({
    watchlists: [{ id: "wl-1", name: "观察", symbols: ["AAPL", "510300.SS"] }],
  });
  const summary = parseSummary({
    quotes: [
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        market: "US",
        price: 343.91,
        change: 7.2,
        changePercent: 2.14,
        currency: "USD",
      },
      {
        symbol: "510300.SS",
        name: "沪深300ETF",
        market: "CN",
        price: 3.95,
        change: 0.01,
        changePercent: 0.25,
        currency: "CNY",
      },
    ],
  });
  assert.ok(lists && summary);
  const [list] = lists;
  const merged = mergeSummary(list, summary);
  assert.equal(merged.symbols[0]?.quote?.price, 343.91);
  assert.equal(merged.symbols[0]?.symbol.name, "Apple Inc.");
  assert.equal(merged.symbols[0]?.alerts[0]?.kind, "change_threshold");
  assert.equal(merged.symbols[0]?.alerts[0]?.threshold, 2.14);
  assert.equal(merged.symbols[1]?.symbol.market, "ETF");
  assert.equal(merged.symbols[1]?.alerts.length, 0);
  assert.equal(merged.updatedAt, summary.generatedAt);
});

test("简报解析：camelCase 与 snake_case 字段均可识别", () => {
  const camel = parseBriefing({
    id: "b-1",
    date: "2026-10-27",
    summary: ["一", "二", "三"],
    marketData: [{ name: "纳斯达克", value: 18956.32, changePercent: 1.2 }],
    symbolUpdates: [
      { code: "AAPL", name: "Apple Inc.", price: 343.91, changePercent: 2.14, alert: "news" },
    ],
    events: [{ time: "20:30", title: "非农" }],
    generatedAt: "2026-10-27T00:00:00.000Z",
  });
  assert.equal(camel?.summary.length, 3);
  assert.equal(camel?.marketData[0]?.value, 18956.32);
  assert.equal(camel?.symbolUpdates[0]?.alert, "news");
  assert.equal(camel?.events[0]?.time, "20:30");

  const snake = parseBriefing({
    briefing: {
      id: "b-2",
      date: "2026-10-27",
      summary: ["一", "二", "三"],
      market_data: [{ name: "标普 500", value: 5842.15, changePercent: 0.78 }],
      symbol_updates: [{ code: "TSLA", price: 245.8, changePercent: 4.56 }],
      events: [],
      generated_at: "2026-10-27T00:00:00.000Z",
    },
  });
  assert.equal(snake?.marketData[0]?.name, "标普 500");
  assert.equal(snake?.symbolUpdates[0]?.name, "TSLA");
  assert.equal(snake?.symbolUpdates[0]?.alert, undefined);
  assert.equal(snake?.events.length, 0);
});

test("简报解析：B3 契约（market_data.indexes + symbol_updates 记录）", () => {
  const parsed = parseBriefing({
    id: "b-9",
    date: "2026-10-27",
    summary: ["一", "二", "三"],
    content: "# 简报",
    market_data: {
      indexes: [
        {
          symbol: "^GSPC",
          name: "S&P 500",
          market: "US",
          price: 5842.15,
          previousClose: 5796.93,
          change: 45.22,
          changePercent: 0.78,
          asOf: "2026-10-27T00:00:00.000Z",
          stale: false,
        },
      ],
    },
    symbol_updates: {
      AAPL: { name: "Apple Inc.", price: 343.91, changePercent: 2.34 },
      "600519.SH": { price: 1356.97, changePercent: -1.2 },
      TSLA: { price: 391.62, changePercent: 1.2 },
    },
    events: [],
    generated_at: "2026-10-27T00:00:00.000Z",
  });
  assert.deepEqual(parsed?.marketData, [{ name: "S&P 500", value: 5842.15, changePercent: 0.78 }]);
  assert.deepEqual(
    parsed?.symbolUpdates.map((item) => item.code),
    ["AAPL", "600519.SS", "TSLA"],
  );
  assert.equal(parsed?.symbolUpdates[0]?.alert, "change_threshold");
  assert.equal(parsed?.symbolUpdates[1]?.alert, undefined);
  assert.equal(parsed?.symbolUpdates[2]?.alert, undefined);
});

test("简报解析：data_status=partial、unavailable、events_status 标记", () => {
  const parsed = parseBriefing({
    id: "b-p",
    date: "2026-10-27",
    summary: ["一", "二", "三"],
    events: [],
    events_status: "not_implemented",
    data_status: "partial",
    unavailable: ["600519.SS"],
  });
  assert.equal(parsed?.dataStatus, "partial");
  assert.deepEqual(parsed?.unavailable, ["600519.SS"]);
  assert.equal(parsed?.eventsStatus, "not_implemented");
});

test("简报解析：仅凭 unavailable 推导 partial，无标识时保持 undefined", () => {
  const partial = parseBriefing({
    date: "2026-10-27",
    summary: ["一", "二", "三"],
    unavailable: ["AAPL"],
  });
  assert.equal(partial?.dataStatus, "partial");
  const complete = parseBriefing({
    date: "2026-10-27",
    summary: ["一", "二", "三"],
    data_status: "complete",
  });
  assert.equal(complete?.dataStatus, "complete");
  assert.deepEqual(complete?.unavailable, []);
  const unknown = parseBriefing({ date: "2026-10-27", summary: ["一", "二", "三"] });
  assert.equal(unknown?.dataStatus, undefined);
  assert.equal(unknown?.eventsStatus, undefined);
});

test("简报解析：缺少 summary 时视为无效，触发 mock 兜底", () => {
  assert.equal(parseBriefing({ id: "b-3", date: "2026-10-27", summary: [] }), undefined);
  assert.equal(parseBriefing("nope"), undefined);
});

test("标的搜索：优先真实接口，type=ETF 归入 ETF 分组", async () => {
  const api = fakeApi(() => ({
    matches: [
      { symbol: "aapl", name: "Apple Inc.", market: "US", exchange: "NASDAQ", type: "EQUITY" },
      { symbol: "AAPU", name: "Direxion AAPL Bull 2X", market: "US", type: "ETF" },
    ],
  }));
  const matches = await searchSymbols(api, "aapl");
  assert.deepEqual(
    matches.map((item) => item.code),
    ["AAPL", "AAPU"],
  );
  assert.equal(matches[1]?.market, "ETF");
});

test("标的搜索：type=FUND 归入基金分组", async () => {
  const api = fakeApi(() => ({
    matches: [{ symbol: "005827", name: "易方达蓝筹精选混合", type: "FUND" }],
  }));
  const matches = await searchSymbols(api, "005827");
  assert.equal(matches[0]?.market, "FUND");
});

test("标的搜索：接口失败时回落到内置目录", async () => {
  const api = fakeApi(() => {
    throw new Error("offline");
  });
  const matches = await searchSymbols(api, "苹果");
  assert.equal(matches.length, 0);
  const fallback = await searchSymbols(api, "600519");
  assert.equal(fallback[0]?.code, "600519.SS");
  assert.equal(fallback[0]?.name, "贵州茅台");
});

test("删除观察列表：接口失败回滚并抛出，成功则移除", async () => {
  const payload = { watchlists: [{ id: "wl-del", name: "待删", symbols: ["AAPL"] }] };
  const api = fakeApi((path) => (path === "/api/watchlists" ? payload : {}));
  await loadWatchlists(api, "zh-Hans", true);
  assert.equal(activeWatchlist()?.id, "wl-del");

  const failing = fakeApi((_path, _body, method) => {
    if (method === "DELETE") throw new Error("boom");
    return {};
  });
  await assert.rejects(() => deleteWatchlist(failing, "wl-del"), /boom/);
  assert.equal(activeWatchlist()?.id, "wl-del", "失败后应回滚乐观删除");

  const ok = fakeApi(() => undefined);
  await deleteWatchlist(ok, "wl-del");
  assert.equal(activeWatchlist(), undefined);
});
