import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import {
  classifyAssetClass,
  driftStatus,
  keyOfPosition,
  PolicyDriftService,
} from "../apps/server/src/engine/policy-drift.ts";
import { PortfoliosService, type Position } from "../apps/server/src/engine/portfolios.ts";
import { AppError } from "../apps/server/src/errors.ts";
import { investmentPolicySchema } from "../packages/domain/src/investor.ts";
import type { MarketDataService } from "../packages/integrations/src/market-data.ts";

const prices: Record<string, number> = {
  "600519.SS": 100,
  "000001.SZ": 100,
  AAPL: 100,
};

const market = {
  getQuote: async (symbol: string) => ({
    symbol,
    price: prices[symbol] ?? 100,
    previousClose: 100,
    change: 0,
    changePercent: 0,
    currency: symbol.endsWith(".SS") || symbol.endsWith(".SZ") ? "CNY" : "USD",
    asOf: "2026-11-23T00:00:00.000Z",
    source: "stub",
  }),
  getHistory: async () => [
    { date: "2025-11-03", close: 100 },
    { date: "2025-11-04", close: 101 },
  ],
} as unknown as MarketDataService;

test("目标配置 schema：合计需为 100% 且不允许重复键", () => {
  const valid = investmentPolicySchema.parse({
    basis: "sector",
    targets: [
      { key: "白酒", label: "白酒", targetPercent: 60 },
      { key: "银行", label: "银行", targetPercent: 40 },
    ],
  });
  assert.equal(valid.targets[0]?.bandPercent, 5, "bandPercent 默认 5");

  assert.throws(() =>
    investmentPolicySchema.parse({
      basis: "sector",
      targets: [
        { key: "白酒", label: "白酒", targetPercent: 60 },
        { key: "银行", label: "银行", targetPercent: 30 },
      ],
    }),
  );
  assert.throws(() =>
    investmentPolicySchema.parse({
      basis: "sector",
      targets: [
        { key: "白酒", label: "白酒", targetPercent: 50 },
        { key: "白酒", label: "白酒 2", targetPercent: 50 },
      ],
    }),
  );
});

test("偏离分档：越界 breach，越过 80% 带宽 warning，其余 within", () => {
  assert.equal(driftStatus(2, 5), "within");
  assert.equal(driftStatus(-2, 5), "within");
  assert.equal(driftStatus(4.5, 5), "warning");
  assert.equal(driftStatus(6, 5), "breach");
  assert.equal(driftStatus(-6, 5), "breach");
});

test("维度归类：资产类别按名称/行业保守识别，其余直接取字段", () => {
  const position = {
    symbol_code: "019547.SH",
    name: "国债",
    sector: "固定收益",
    market: "CN",
    currency: "CNY",
  } as Position;
  assert.equal(classifyAssetClass(position), "bond");
  assert.equal(
    classifyAssetClass({
      symbol_code: "511990.SS",
      name: "货币基金",
      sector: undefined,
    } as Position),
    "cash",
  );
  assert.equal(
    classifyAssetClass({
      symbol_code: "600519.SS",
      name: "贵州茅台",
      sector: undefined,
    } as Position),
    "equity",
  );
  assert.equal(keyOfPosition("region", position), "CN");
  assert.equal(keyOfPosition("currency", position), "CNY");
  assert.equal(keyOfPosition("sector", position), "固定收益");
});

test("目标配置服务：组合不存在时保存报 404，无政策时偏离为空", async () => {
  const db = await createStore();
  try {
    const owner = "owner-policy-missing";
    const portfolios = new PortfoliosService(db, market);
    const service = new PolicyDriftService(db, portfolios);

    assert.equal(await service.getPolicy(owner, "nope"), null);
    assert.deepEqual(await service.drift(owner, "nope"), []);

    await assert.rejects(
      () =>
        service.savePolicy(owner, "nope", {
          basis: "sector",
          targets: [{ key: "白酒", label: "白酒", targetPercent: 100, bandPercent: 5 }],
        }),
      (error: unknown) => error instanceof AppError && error.status === 404,
    );
    assert.equal(await service.getPolicy(owner, "nope"), null);
    assert.equal(await service.removePolicy(owner, "nope").catch(() => "404"), "404");
  } finally {
    await db.close();
  }
});

test("目标配置服务：市值口径偏离按行业分档，政策外暴露也算越界", async () => {
  const db = await createStore();
  try {
    const owner = "owner-policy-drift";
    const portfolios = new PortfoliosService(db, market);
    const service = new PolicyDriftService(db, portfolios);
    const portfolio = await portfolios.create(owner, { name: "长期价值", base_currency: "CNY" });
    await portfolios.addHolding(owner, portfolio.id, {
      symbol_code: "600519.SS",
      quantity: 10,
      avg_cost: 100,
      sector: "白酒",
    });
    await portfolios.addHolding(owner, portfolio.id, {
      symbol_code: "000001.SZ",
      quantity: 10,
      avg_cost: 100,
      sector: "银行",
    });

    await service.savePolicy(owner, portfolio.id, {
      basis: "sector",
      targets: [
        { key: "白酒", label: "白酒", targetPercent: 90, bandPercent: 5 },
        { key: "银行", label: "银行", targetPercent: 10, bandPercent: 5 },
      ],
    });
    const saved = await service.getPolicy(owner, portfolio.id);
    assert.equal(saved?.basis, "sector");
    assert.ok(!("id" in (saved as object)), "返回的政策不应泄漏内部主键");

    const [drift] = await service.drift(owner, portfolio.id, { valueBasis: "market" });
    assert.ok(drift);
    assert.equal(drift.valueBasis, "market");
    const white = drift.rows.find((row) => row.key === "白酒");
    const bank = drift.rows.find((row) => row.key === "银行");
    assert.equal(white?.actual, 50);
    assert.equal(white?.status, "breach");
    assert.equal(bank?.drift, 40);
    assert.equal(bank?.status, "breach");

    // 政策只保留「白酒」，银行暴露按目标 0 处理并判越界。
    await service.savePolicy(owner, portfolio.id, {
      basis: "sector",
      targets: [{ key: "白酒", label: "白酒", targetPercent: 100, bandPercent: 5 }],
    });
    const [onlyWhite] = await service.drift(owner, portfolio.id, { valueBasis: "market" });
    const uncovered = onlyWhite?.rows.find((row) => row.key === "银行");
    assert.equal(uncovered?.target, 0);
    assert.equal(uncovered?.status, "breach");

    await service.removePolicy(owner, portfolio.id);
    assert.deepEqual(await service.drift(owner, portfolio.id), []);
  } finally {
    await db.close();
  }
});

test("目标配置服务：多币种分别输出，成本口径单独计算", async () => {
  const db = await createStore();
  try {
    const owner = "owner-policy-currency";
    const portfolios = new PortfoliosService(db, market);
    const service = new PolicyDriftService(db, portfolios);
    const portfolio = await portfolios.create(owner, { name: "全球", base_currency: "CNY" });
    await portfolios.addHolding(owner, portfolio.id, {
      symbol_code: "600519.SS",
      quantity: 10,
      avg_cost: 100,
      sector: "白酒",
    });
    await portfolios.addHolding(owner, portfolio.id, {
      symbol_code: "AAPL",
      quantity: 10,
      avg_cost: 100,
      sector: "科技",
    });

    await service.savePolicy(owner, portfolio.id, {
      basis: "sector",
      targets: [{ key: "白酒", label: "白酒", targetPercent: 100, bandPercent: 5 }],
    });
    const drifts = await service.drift(owner, portfolio.id, { valueBasis: "market" });
    assert.equal(drifts.length, 2, "CNY / USD 各自一段，不跨币种相加");
    assert.deepEqual(
      drifts.map((drift) => drift.currency),
      ["CNY", "USD"],
    );

    // 币种维度是组合级：按原币市值占比，只有一段。
    await service.savePolicy(owner, portfolio.id, {
      basis: "currency",
      targets: [
        { key: "CNY", label: "人民币", targetPercent: 50, bandPercent: 5 },
        { key: "USD", label: "美元", targetPercent: 50, bandPercent: 5 },
      ],
    });
    const currencyDrift = await service.drift(owner, portfolio.id);
    assert.equal(currencyDrift.length, 1);
    assert.equal(currencyDrift[0]?.currency, undefined);
    assert.equal(currencyDrift[0]?.note?.includes("未做汇率折算"), true);
    assert.equal(currencyDrift[0]?.rows.length, 2);
  } finally {
    await db.close();
  }
});
