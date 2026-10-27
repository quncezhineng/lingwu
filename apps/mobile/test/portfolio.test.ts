/**
 * P1-F1 单测：CSV 解析/映射/校验、配置聚合、组合汇总解析与 mock 汇总口径。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { autoMap, parseCsv, toCanonicalCsv, toErrorCsv, validateRows } from "../src/csv.ts";
import { normalizeCode } from "../src/market.ts";
import {
  buildAllocationSlices,
  buildMockSummary,
  type Portfolio,
  parseSummary,
} from "../src/portfolio.ts";

const PORTFOLIO: Portfolio = {
  id: "pf-1",
  name: "长期价值",
  baseCurrency: "CNY",
  createdAt: "2026-10-27T00:00:00.000Z",
  updatedAt: "2026-10-27T00:00:00.000Z",
};

test("CSV 解析：BOM、CRLF、引号与分号分隔", () => {
  const table = parseCsv(
    '\ufeffsymbol,quantity,cost_price\n"AAPL",10,180.5\n"600519.SS",100,1700\n',
  );
  assert.deepEqual(table.headers, ["symbol", "quantity", "cost_price"]);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[0], ["AAPL", "10", "180.5"]);

  const quoted = parseCsv('symbol,name\nAAPL,"Apple, Inc."\n');
  assert.equal(quoted.rows[0]?.[1], "Apple, Inc.");

  const semicolon = parseCsv("symbol;quantity;cost_price\nAAPL;10;180\n");
  assert.deepEqual(semicolon.rows[0], ["AAPL", "10", "180"]);
});

test("表头同义词自动映射（中英文）", () => {
  const mapping = autoMap(["股票代码", "持仓数量", "成本价", "行业"]);
  assert.equal(mapping.symbol, 0);
  assert.equal(mapping.quantity, 1);
  assert.equal(mapping.avg_cost, 2);
  assert.equal(mapping.sector, 3);
  assert.equal(mapping.name, undefined);
});

test("逐行校验：数量/成本/币种错误阻断，缺行业给警告，重复代码合并", () => {
  const table = parseCsv(
    "symbol,quantity,cost_price,currency\nAAPL,10,180,USD\nAAPL,5,200,USD\nTSLA,0,250,USD\nMSFT,2,-1,USD\nNVDA,3,100,EUR\n",
  );
  const preview = validateRows(table, autoMap(table.headers));
  assert.equal(preview.summary.error, 3);
  assert.equal(preview.summary.valid, 2);
  assert.equal(preview.summary.merged, 1);
  const tesla = preview.rows.find((row) => row.values.symbol === "TSLA");
  assert.equal(tesla?.status, "error");
  assert.ok(tesla?.issues.some((issue) => issue.field === "quantity"));
  const nvda = preview.rows.find((row) => row.values.symbol === "NVDA");
  assert.ok(nvda?.issues.some((issue) => issue.reason.includes("币种")));
  const firstApple = preview.rows[0];
  assert.ok(firstApple?.issues.some((issue) => issue.field === "sector"));
  const secondApple = preview.rows[1];
  assert.ok(secondApple?.issues.some((issue) => issue.reason.includes("重复")));
});

test("规范 CSV：跳过错误行、缺省买入日期与币种推断", () => {
  const table = parseCsv(
    "symbol,quantity,cost_price\nAAPL,10,180.5\nBAD,0,1\n600519.SS,100,1700\n",
  );
  const preview = validateRows(table, autoMap(table.headers));
  const csv = toCanonicalCsv(preview.rows);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "symbol,quantity,cost_price,buy_date,name,sector,currency,market");
  assert.equal(lines.length, 3);
  assert.match(lines[1] ?? "", /^AAPL,10,180\.5,\d{4}-\d{2}-\d{2},,,USD,$/);
  assert.match(lines[2] ?? "", /600519\.SS,100,1700,/);
  const errors = toErrorCsv(preview.rows);
  assert.match(errors, /BAD/);
  assert.match(errors, /quantity/);
});

test("配置聚合：Top 6 + 其他，<1% 并入其他且权重归一", () => {
  const slices = [
    { key: "A", marketValue: 500, weight: 50 },
    { key: "B", marketValue: 200, weight: 20 },
    { key: "C", marketValue: 100, weight: 10 },
    { key: "D", marketValue: 80, weight: 8 },
    { key: "E", marketValue: 60, weight: 6 },
    { key: "F", marketValue: 40, weight: 4 },
    { key: "G", marketValue: 15, weight: 1.5 },
    { key: "H", marketValue: 5, weight: 0.5 },
  ];
  const result = buildAllocationSlices(slices);
  assert.equal(result.length, 7);
  assert.equal(result[result.length - 1]?.key, "__other__");
  assert.ok(Math.abs(result.reduce((sum, slice) => sum + slice.weight, 0) - 100) < 0.001);
  // Top 6 之后的 G/H 均并入「其他」
  assert.equal(
    result.find((slice) => slice.key === "G"),
    undefined,
  );
  const other = result.find((slice) => slice.key === "__other__");
  assert.ok((other?.marketValue ?? 0) > 15);
});

test("B1 汇总解析：totals/positions/allocation/unvalued/risk 分币种映射", () => {
  const summary = parseSummary(
    {
      portfolio: { id: "pf-1", name: "长期价值", base_currency: "CNY" },
      generated_at: "2026-10-27T02:00:00.000Z",
      fx_note: "跨币种未折算",
      totals: [
        {
          currency: "CNY",
          cost: 170000,
          market_value: 185600,
          pnl: 15600,
          pnl_pct: 9.18,
          positions: 1,
          unvalued: { count: 1, cost_total: 5000 },
          valuation_coverage: 0.9737,
        },
        { currency: "USD", cost: 8100, market_value: 8500, pnl: 400, positions: 1 },
      ],
      positions: [
        {
          id: "h-1",
          symbol_code: "600519.SS",
          name: "贵州茅台",
          market: "CN",
          currency: "CNY",
          quantity: 100,
          avg_cost: 1700,
          cost: 170000,
          price: 1856,
          market_value: 185600,
          pnl: 15600,
          pnl_pct: 9.18,
          weight: 100,
          sector: "食品饮料",
        },
        {
          id: "h-2",
          symbol_code: "AAPL",
          market: "US",
          currency: "USD",
          quantity: 45,
          avg_cost: 180,
          price: 188.9,
          market_value: 8500.5,
          pnl: 400.5,
          weight: 100,
        },
      ],
      allocation: [
        {
          currency: "CNY",
          by_symbol: [{ key: "600519.SS", market_value: 185600, weight: 100 }],
          by_sector: [{ key: "食品饮料", market_value: 185600, weight: 100 }],
          excluded_symbols: ["000858.SZ"],
        },
      ],
      top_holdings: [
        { currency: "CNY", items: [{ key: "600519.SS", market_value: 185600, weight: 100 }] },
      ],
      risk: {
        CNY: {
          beta: 1.08,
          sharpe: 1.24,
          max_drawdown: -18.6,
          return_1y: 12.4,
          samples: 252,
          benchmark: { symbol: "000300.SS", name: "沪深300", return_1y: 8.1 },
        },
      },
    },
    [PORTFOLIO],
    "pf-1",
  );
  assert.ok(summary);
  assert.equal(summary?.groups.length, 2);
  const cny = summary?.groups[0];
  assert.equal(cny?.currency, "CNY");
  assert.equal(cny?.marketValue, 185600);
  assert.equal(cny?.unvaluedCount, 1);
  assert.equal(cny?.unvaluedCost, 5000);
  assert.equal(cny?.valuationCoverage, 0.9737);
  assert.deepEqual(cny?.excludedSymbols, ["000858.SZ"]);
  assert.equal(cny?.risk?.beta, 1.08);
  assert.equal(cny?.risk?.benchmark?.return1y, 8.1);
  const usd = summary?.groups[1];
  assert.equal(usd?.currency, "USD");
  assert.equal(usd?.risk, undefined);
});

test("mock 汇总：按币种分组、无跨币种合计、权重与浮盈自洽", () => {
  const summary = buildMockSummary({ ...PORTFOLIO, id: "pf-long" });
  const currencies = summary.groups.map((group) => group.currency);
  assert.deepEqual(currencies, ["CNY", "USD"]);
  for (const group of summary.groups) {
    const marketValue = group.positions.reduce(
      (sum, position) => sum + (position.marketValue ?? 0),
      0,
    );
    assert.ok(Math.abs(marketValue - group.marketValue) < 0.01);
    assert.ok(Math.abs((group.pnl / group.cost) * 100 - (group.pnlPct ?? 0)) < 0.01);
    const weight = group.positions.reduce((sum, position) => sum + (position.weight ?? 0), 0);
    assert.ok(Math.abs(weight - 100) < 0.01);
    assert.equal(group.risk?.samples, 252);
    assert.ok((group.risk?.series?.length ?? 0) >= 12);
  }
});

test("港股代码归一化：去前导零到 4 位", () => {
  assert.equal(normalizeCode("00700.HK"), "0700.HK");
  assert.equal(normalizeCode("09988.hk"), "9988.HK");
  assert.equal(normalizeCode("600519.sh"), "600519.SS");
});
