import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Holding, Portfolio } from "../../../../packages/domain/src/agent.ts";
import {
  MarketDataError,
  type MarketDataService,
  normalizeYahooSymbol,
  type Quote,
  resolveMarket,
  withTimeout,
} from "../../../../packages/integrations/src/market-data.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";
import {
  CURRENCY_BENCHMARKS,
  computeRiskMetrics,
  equityCurve,
  type RiskMetrics,
  riskFreeRate,
  toReturns,
  weightedReturns,
} from "./portfolio-risk.ts";

const PORTFOLIO_KIND = "portfolios";
const HOLDING_KIND = "holdings";
const MAX_CSV_ROWS = 1000;
const SUMMARY_BUDGET_MS = Number(process.env.MARKET_DATA_SUMMARY_TIMEOUT_MS ?? 10_000);

const nameSchema = z.string().trim().min(1).max(100);
const symbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[A-Za-z0-9^=.-]+$/, "Invalid symbol");
const currencySchema = z.enum(["CNY", "USD", "HKD"]);

export const createPortfolioSchema = z.object({
  name: nameSchema,
  base_currency: currencySchema.default("CNY"),
  benchmark: z.string().trim().max(32).optional(),
});

export const updatePortfolioSchema = z
  .object({
    name: nameSchema.optional(),
    base_currency: currencySchema.optional(),
    benchmark: z.string().trim().max(32).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Provide at least one field to update",
  });

export const addHoldingSchema = z.object({
  symbol_code: symbolSchema,
  quantity: z.number().finite().positive(),
  avg_cost: z.number().finite().nonnegative(),
  name: z.string().trim().max(200).optional(),
  sector: z.string().trim().max(100).optional(),
  currency: currencySchema.optional(),
  buy_date: z.string().date().optional(),
});

export const updateHoldingSchema = z
  .object({
    quantity: z.number().finite().positive().optional(),
    avg_cost: z.number().finite().nonnegative().optional(),
    name: z.string().trim().max(200).optional(),
    sector: z.string().trim().max(100).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Provide at least one field to update",
  });

export type CreatePortfolioInput = z.infer<typeof createPortfolioSchema>;
export type UpdatePortfolioInput = z.infer<typeof updatePortfolioSchema>;
export type AddHoldingInput = z.infer<typeof addHoldingSchema>;
export type UpdateHoldingInput = z.infer<typeof updateHoldingSchema>;

export interface Position extends Holding {
  /** Original-currency cost basis (quantity × avg_cost). */
  cost: number;
  price?: number;
  price_source?: string;
  stale?: boolean;
  market_value?: number;
  pnl?: number;
  pnl_pct?: number | null;
  change_percent?: number;
  error?: string;
}

export interface CurrencyTotal {
  currency: string;
  /** Cost of all positions in this currency, including unvalued ones. */
  cost: number;
  /** Market value of valued positions only. Failed quotes are excluded, never cost-filled. */
  market_value: number;
  /** PnL of valued positions only (market_value - valued cost). */
  pnl: number;
  pnl_pct: number | null;
  positions: number;
  valued_positions: number;
  unvalued: { count: number; cost_total: number };
  /** valued market value / (valued market value + unvalued cost), ratio 0-1. */
  valuation_coverage: number;
}

export interface AllocationSlice {
  key: string;
  market_value: number;
  /** Percentage 0-100 within the currency bucket. */
  weight: number;
}

export interface PortfolioSummary {
  portfolio: Portfolio;
  generated_at: string;
  /** P1 明确不做汇率折算，按币种分别汇总。 */
  fx_note: string;
  totals: CurrencyTotal[];
  positions: Position[];
  allocation: {
    currency: string;
    total_market_value: number;
    by_symbol: AllocationSlice[];
    by_sector: AllocationSlice[];
    by_market: AllocationSlice[];
  }[];
  top_holdings: { currency: string; items: AllocationSlice[] }[];
  /** Risk metrics per currency bucket; never combined across currencies. */
  risk: RiskMetrics[];
  unavailable: string[];
}

export interface CsvFieldError {
  field: string;
  reason: string;
}

export interface CsvRowResult {
  /** Physical CSV line number (header is line 1). */
  row: number;
  status: "ok" | "error";
  errors: CsvFieldError[];
  parsed?: {
    symbol_code: string;
    quantity: number;
    avg_cost: number;
    buy_date: string;
    name?: string;
    sector?: string;
    market?: "US" | "CN" | "HK";
    currency: string;
  };
}

export interface CsvPreview {
  total: number;
  valid: number;
  invalid: number;
  rows: CsvRowResult[];
}

export interface CsvImportResult {
  portfolio: Portfolio;
  /** Rows that passed validation, including rows merged into an existing symbol. */
  rows_accepted: number;
  /** New symbols created. */
  imported_count: number;
  /** Rows merged into an existing symbol (within the file or the portfolio). */
  merged_count: number;
  errors: { row: number; field: string; reason: string }[];
  /** sha256 of the uploaded CSV; the idempotency key component. */
  content_hash: string;
  /** True when the same content was already applied to this portfolio within 24h. */
  duplicate_import: boolean;
}

interface ImportBatch {
  id: string;
  portfolio_id: string;
  content_hash: string;
  rows_accepted: number;
  imported_count: number;
  merged_count: number;
  errors: { row: number; field: string; reason: string }[];
  created_at: string;
}

const IMPORT_BATCH_KIND = "portfolio_imports";
const IMPORT_DEDUPE_MS = 24 * 60 * 60 * 1000;

function inferCurrency(symbol: string): "CNY" | "USD" | "HKD" {
  const market = resolveMarket(symbol);
  return market === "CN" ? "CNY" : market === "HK" ? "HKD" : "USD";
}

/** Split one CSV line into fields, honouring double quotes and escaped quotes. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      fields.push(field.trim());
      field = "";
    } else field += char;
  }
  fields.push(field.trim());
  return fields;
}

/** Parse and validate a holdings CSV. Errors are reported per line; valid rows still import. */
export function parseHoldingsCsv(text: string): CsvPreview {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const numbered = lines
    .map((content, index) => ({ line: index + 1, content: content.trim() }))
    .filter((item) => item.content.length > 0);
  if (numbered.length === 0) throw new AppError("CSV is empty", 422);
  if (numbered.length > MAX_CSV_ROWS + 1)
    throw new AppError(`CSV supports at most ${MAX_CSV_ROWS} holdings rows`, 422);

  const header = splitCsvLine(numbered[0]?.content ?? "").map((item) => item.toLowerCase());
  const column = (name: string) => header.indexOf(name);
  const symbolIndex = column("symbol");
  const quantityIndex = column("quantity");
  // `cost_price` is the contract column; keep `avg_cost` as a tolerated alias.
  const costIndex = column("cost_price") >= 0 ? column("cost_price") : column("avg_cost");
  const buyDateIndex = column("buy_date");
  if (symbolIndex < 0 || quantityIndex < 0 || costIndex < 0 || buyDateIndex < 0)
    throw new AppError("CSV header must include symbol, quantity, cost_price and buy_date", 422);

  const nameIndex = column("name");
  const sectorIndex = column("sector");
  const marketIndex = column("market");
  const currencyIndex = column("currency");
  const rows: CsvRowResult[] = [];

  for (const item of numbered.slice(1)) {
    const fields = splitCsvLine(item.content);
    const errors: CsvFieldError[] = [];
    const rawSymbol = fields[symbolIndex] ?? "";
    const symbol = rawSymbol ? normalizeYahooSymbol(rawSymbol) : "";
    if (!symbol) errors.push({ field: "symbol", reason: "required" });
    else if (!symbolSchema.safeParse(rawSymbol).success)
      errors.push({ field: "symbol", reason: `invalid: ${rawSymbol}` });

    const quantity = Number(fields[quantityIndex]);
    if (!Number.isFinite(quantity) || quantity <= 0)
      errors.push({ field: "quantity", reason: "must be > 0" });
    const cost = Number(fields[costIndex]);
    if (!Number.isFinite(cost) || cost < 0)
      errors.push({ field: "cost_price", reason: "must be >= 0" });

    const rawBuyDate = fields[buyDateIndex] ?? "";
    const buyDate = rawBuyDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(buyDate) || Number.isNaN(Date.parse(rawBuyDate)))
      errors.push({ field: "buy_date", reason: "expected YYYY-MM-DD" });

    const rawMarket = (fields[marketIndex] ?? "").toUpperCase();
    const market =
      rawMarket === "US" || rawMarket === "CN" || rawMarket === "HK"
        ? (rawMarket as "US" | "CN" | "HK")
        : undefined;
    if (rawMarket && !market) errors.push({ field: "market", reason: `invalid: ${rawMarket}` });

    const rawCurrency = (fields[currencyIndex] ?? "").toUpperCase();
    if (rawCurrency && !currencySchema.safeParse(rawCurrency).success)
      errors.push({ field: "currency", reason: `invalid: ${rawCurrency}` });
    const currency =
      rawCurrency && currencySchema.safeParse(rawCurrency).success
        ? rawCurrency
        : market === "CN"
          ? "CNY"
          : market === "HK"
            ? "HKD"
            : market === "US"
              ? "USD"
              : inferCurrency(symbol);

    if (errors.length > 0) {
      rows.push({ row: item.line, status: "error", errors });
      continue;
    }
    rows.push({
      row: item.line,
      status: "ok",
      errors: [],
      parsed: {
        symbol_code: symbol,
        quantity,
        avg_cost: cost,
        buy_date: buyDate,
        ...(nameIndex >= 0 && fields[nameIndex] ? { name: fields[nameIndex] } : {}),
        ...(sectorIndex >= 0 && fields[sectorIndex] ? { sector: fields[sectorIndex] } : {}),
        ...(market ? { market } : {}),
        currency,
      },
    });
  }

  return {
    total: rows.length,
    valid: rows.filter((row) => row.status === "ok").length,
    invalid: rows.filter((row) => row.status === "error").length,
    rows,
  };
}

export class PortfoliosService {
  constructor(
    private readonly db: Store,
    private readonly market: MarketDataService,
  ) {}

  async list(owner: string): Promise<Portfolio[]> {
    return this.db.list<Portfolio>(owner, PORTFOLIO_KIND);
  }

  private async requirePortfolio(owner: string, id: string): Promise<Portfolio> {
    const portfolio = await this.db.get<Portfolio>(owner, PORTFOLIO_KIND, id);
    if (!portfolio) throw new AppError("Portfolio not found", 404);
    return portfolio;
  }

  async get(owner: string, id: string): Promise<{ portfolio: Portfolio; holdings: Holding[] }> {
    const portfolio = await this.requirePortfolio(owner, id);
    return { portfolio, holdings: await this.holdings(owner, id) };
  }

  async holdings(owner: string, portfolioId: string): Promise<Holding[]> {
    return this.db.listByField<Holding>(owner, HOLDING_KIND, "portfolio_id", portfolioId);
  }

  async create(owner: string, input: CreatePortfolioInput): Promise<Portfolio> {
    const at = new Date().toISOString();
    const portfolio: Portfolio = {
      id: randomUUID(),
      user_id: owner,
      name: input.name,
      base_currency: input.base_currency,
      ...(input.benchmark ? { benchmark: input.benchmark } : {}),
      created_at: at,
      updated_at: at,
    };
    return this.db.put(owner, PORTFOLIO_KIND, portfolio);
  }

  async update(owner: string, id: string, input: UpdatePortfolioInput): Promise<Portfolio> {
    const portfolio = await this.requirePortfolio(owner, id);
    const next: Portfolio = {
      ...portfolio,
      name: input.name ?? portfolio.name,
      base_currency: input.base_currency ?? portfolio.base_currency,
      ...(input.benchmark !== undefined ? { benchmark: input.benchmark } : {}),
      updated_at: new Date().toISOString(),
    };
    return this.db.put(owner, PORTFOLIO_KIND, next);
  }

  async remove(owner: string, id: string): Promise<void> {
    await this.requirePortfolio(owner, id);
    for (const holding of await this.holdings(owner, id))
      await this.db.remove(owner, HOLDING_KIND, holding.id);
    await this.db.remove(owner, PORTFOLIO_KIND, id);
  }

  async addHolding(owner: string, portfolioId: string, input: AddHoldingInput): Promise<Holding> {
    await this.requirePortfolio(owner, portfolioId);
    const symbol = normalizeYahooSymbol(input.symbol_code);
    const existing = (await this.holdings(owner, portfolioId)).find(
      (holding) => holding.symbol_code === symbol,
    );
    if (existing) return this.mergeHolding(owner, existing, input.quantity, input.avg_cost);
    return this.insertHolding(owner, portfolioId, input);
  }

  private async insertHolding(
    owner: string,
    portfolioId: string,
    input: AddHoldingInput,
  ): Promise<Holding> {
    const symbol = normalizeYahooSymbol(input.symbol_code);
    const at = new Date().toISOString();
    const holding: Holding = {
      id: randomUUID(),
      portfolio_id: portfolioId,
      symbol_code: symbol,
      market: resolveMarket(symbol),
      currency: input.currency ?? inferCurrency(symbol),
      quantity: input.quantity,
      avg_cost: input.avg_cost,
      buy_date: input.buy_date ?? at.slice(0, 10),
      ...(input.name ? { name: input.name } : {}),
      ...(input.sector ? { sector: input.sector } : {}),
      created_at: at,
      updated_at: at,
    };
    return this.db.put(owner, HOLDING_KIND, holding);
  }

  private async mergeHolding(
    owner: string,
    holding: Holding,
    quantity: number,
    avgCost: number,
  ): Promise<Holding> {
    const total = holding.quantity + quantity;
    const weighted = (holding.quantity * holding.avg_cost + quantity * avgCost) / total;
    return this.db.put(owner, HOLDING_KIND, {
      ...holding,
      quantity: total,
      avg_cost: Number(weighted.toFixed(6)),
      updated_at: new Date().toISOString(),
    });
  }

  private async requireHolding(
    owner: string,
    portfolioId: string,
    holdingId: string,
  ): Promise<Holding> {
    const holding = await this.db.get<Holding>(owner, HOLDING_KIND, holdingId);
    if (!holding || holding.portfolio_id !== portfolioId)
      throw new AppError("Holding not found", 404);
    return holding;
  }

  async updateHolding(
    owner: string,
    portfolioId: string,
    holdingId: string,
    input: UpdateHoldingInput,
  ): Promise<Holding> {
    const holding = await this.requireHolding(owner, portfolioId, holdingId);
    return this.db.put(owner, HOLDING_KIND, {
      ...holding,
      quantity: input.quantity ?? holding.quantity,
      avg_cost: input.avg_cost ?? holding.avg_cost,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.sector !== undefined ? { sector: input.sector } : {}),
      updated_at: new Date().toISOString(),
    });
  }

  async removeHolding(owner: string, portfolioId: string, holdingId: string): Promise<void> {
    await this.requireHolding(owner, portfolioId, holdingId);
    await this.db.remove(owner, HOLDING_KIND, holdingId);
  }

  previewCsv(text: string): CsvPreview {
    return parseHoldingsCsv(text);
  }

  async importCsv(
    owner: string,
    input: { csv: string; portfolio_id?: string; name?: string; base_currency?: string },
  ): Promise<CsvImportResult> {
    const preview = parseHoldingsCsv(input.csv);
    const contentHash = createHash("sha256").update(input.csv, "utf8").digest("hex");
    const portfolio = input.portfolio_id
      ? await this.requirePortfolio(owner, input.portfolio_id)
      : await this.create(owner, {
          name: input.name ?? "导入组合",
          base_currency: currencySchema.parse(input.base_currency ?? "CNY"),
        });

    // Batch idempotency: the same content applied to the same portfolio within 24h is a no-op.
    const batchId = createHash("sha256")
      .update(`portfolio-import:${owner}:${portfolio.id}:${contentHash}`)
      .digest("hex");
    const previous = await this.db.get<ImportBatch>(owner, IMPORT_BATCH_KIND, batchId);
    if (previous && Date.now() - Date.parse(previous.created_at) < IMPORT_DEDUPE_MS)
      return {
        portfolio,
        rows_accepted: previous.rows_accepted,
        imported_count: previous.imported_count,
        merged_count: previous.merged_count,
        errors: previous.errors,
        content_hash: contentHash,
        duplicate_import: true,
      };

    let imported = 0;
    let merged = 0;
    // Cache existing holdings so a 1000-row file does not re-read the store per row.
    const existingBySymbol = new Map(
      (await this.holdings(owner, portfolio.id)).map((holding) => [holding.symbol_code, holding]),
    );
    for (const row of preview.rows) {
      if (row.status !== "ok" || !row.parsed) continue;
      const existing = existingBySymbol.get(row.parsed.symbol_code);
      if (existing) {
        existingBySymbol.set(
          row.parsed.symbol_code,
          await this.mergeHolding(owner, existing, row.parsed.quantity, row.parsed.avg_cost),
        );
        merged++;
      } else {
        const holding = await this.insertHolding(owner, portfolio.id, {
          symbol_code: row.parsed.symbol_code,
          quantity: row.parsed.quantity,
          avg_cost: row.parsed.avg_cost,
          buy_date: row.parsed.buy_date,
          currency: currencySchema.parse(row.parsed.currency),
          ...(row.parsed.name ? { name: row.parsed.name } : {}),
          ...(row.parsed.sector ? { sector: row.parsed.sector } : {}),
        });
        existingBySymbol.set(holding.symbol_code, holding);
        imported++;
      }
    }
    const errors = preview.rows
      .filter((row) => row.status === "error")
      .flatMap((row) => row.errors.map((error) => ({ row: row.row, ...error })));
    await this.db.put<ImportBatch>(owner, IMPORT_BATCH_KIND, {
      id: batchId,
      portfolio_id: portfolio.id,
      content_hash: contentHash,
      rows_accepted: preview.valid,
      imported_count: imported,
      merged_count: merged,
      errors,
      created_at: new Date().toISOString(),
    });
    return {
      portfolio,
      rows_accepted: preview.valid,
      imported_count: imported,
      merged_count: merged,
      errors,
      content_hash: contentHash,
      duplicate_import: false,
    };
  }

  /** Quote every holding and aggregate per currency. No FX conversion in P1. */
  async summary(owner: string, portfolioId: string): Promise<PortfolioSummary> {
    const portfolio = await this.requirePortfolio(owner, portfolioId);
    const holdings = await this.holdings(owner, portfolioId);
    const deadline = Date.now() + SUMMARY_BUDGET_MS;
    const quotes = await Promise.allSettled(
      holdings.map(async (holding) => {
        const remaining = Math.max(1, deadline - Date.now());
        return withTimeout(
          this.market.getQuote(holding.symbol_code),
          remaining,
          `Timed out loading ${holding.symbol_code}`,
        );
      }),
    );
    const quoteByCode = new Map<string, Quote>();
    const unavailable: string[] = [];
    quotes.forEach((result, i) => {
      const holding = holdings[i];
      if (!holding) return;
      if (result.status === "fulfilled") quoteByCode.set(holding.symbol_code, result.value);
      else unavailable.push(holding.symbol_code);
    });

    const positions: Position[] = holdings.map((holding, index) => {
      const quote = quoteByCode.get(holding.symbol_code);
      const cost = holding.quantity * holding.avg_cost;
      if (!quote) {
        const settled = quotes[index];
        const error =
          settled?.status === "rejected"
            ? settled.reason instanceof MarketDataError
              ? settled.reason.kind
              : "provider_error"
            : "provider_error";
        // Never cost-fill a failed quote: callers must show it as unvalued.
        return { ...holding, cost, error };
      }
      const marketValue = holding.quantity * quote.price;
      const pnl = marketValue - cost;
      return {
        ...holding,
        cost,
        price: quote.price,
        price_source: quote.source,
        ...(quote.stale ? { stale: true } : {}),
        market_value: Number(marketValue.toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        pnl_pct: cost === 0 ? null : Number(((pnl / cost) * 100).toFixed(4)),
        change_percent: Number(quote.changePercent.toFixed(4)),
      };
    });

    const currencies = [...new Set(positions.map((position) => position.currency))];
    const totals: CurrencyTotal[] = currencies.map((currency) => {
      const items = positions.filter((position) => position.currency === currency);
      const valued = items.filter((item) => item.market_value !== undefined);
      const unvalued = items.filter((item) => item.market_value === undefined);
      const cost = items.reduce((sum, item) => sum + item.cost, 0);
      const valuedCost = valued.reduce((sum, item) => sum + item.cost, 0);
      const marketValue = valued.reduce((sum, item) => sum + (item.market_value ?? 0), 0);
      const pnl = marketValue - valuedCost;
      const unvaluedCost = unvalued.reduce((sum, item) => sum + item.cost, 0);
      const coverage =
        marketValue + unvaluedCost === 0 ? 0 : marketValue / (marketValue + unvaluedCost);
      return {
        currency,
        cost: Number(cost.toFixed(2)),
        market_value: Number(marketValue.toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        pnl_pct: valuedCost === 0 ? null : Number(((pnl / valuedCost) * 100).toFixed(4)),
        positions: items.length,
        valued_positions: valued.length,
        unvalued: { count: unvalued.length, cost_total: Number(unvaluedCost.toFixed(2)) },
        valuation_coverage: Number(coverage.toFixed(6)),
      };
    });

    const allocation = currencies.map((currency) => {
      const items = positions.filter(
        (position) => position.currency === currency && position.market_value !== undefined,
      );
      const total = items.reduce((sum, item) => sum + (item.market_value ?? 0), 0);
      const slice = (keyOf: (position: Position) => string): AllocationSlice[] => {
        const grouped = new Map<string, number>();
        for (const item of items)
          grouped.set(keyOf(item), (grouped.get(keyOf(item)) ?? 0) + (item.market_value ?? 0));
        return [...grouped.entries()]
          .map(([key, value]) => ({
            key,
            market_value: Number(value.toFixed(2)),
            weight: total === 0 ? 0 : Number(((value / total) * 100).toFixed(2)),
          }))
          .sort((a, b) => b.market_value - a.market_value);
      };
      return {
        currency,
        total_market_value: Number(total.toFixed(2)),
        by_symbol: slice((item) => item.symbol_code),
        by_sector: slice((item) => item.sector ?? "未分类"),
        by_market: slice((item) => item.market),
        excluded_symbols: positions
          .filter(
            (position) => position.currency === currency && position.market_value === undefined,
          )
          .map((position) => position.symbol_code),
      };
    });

    const topHoldings = allocation.map((entry) => ({
      currency: entry.currency,
      items: entry.by_symbol.slice(0, 5),
    }));

    const risk = await Promise.all(
      currencies.map(async (currency): Promise<RiskMetrics> => {
        const benchmark =
          portfolio.benchmark ??
          CURRENCY_BENCHMARKS[currency] ??
          CURRENCY_BENCHMARKS.USD ??
          "^GSPC";
        const items = positions.filter(
          (position) => position.currency === currency && position.market_value !== undefined,
        );
        const unavailableMetrics = (reason: string): RiskMetrics => ({
          currency,
          benchmark,
          risk_free_rate: riskFreeRate(),
          observations: 0,
          unavailable: [{ metric: "*", reason }],
        });
        if (items.length === 0) return unavailableMetrics("no_positions_with_quotes");
        const remaining = deadline - Date.now();
        if (remaining < 500) return unavailableMetrics("timeout");
        try {
          const settled = await Promise.allSettled(
            items.map((position) => {
              const left = Math.max(1, deadline - Date.now());
              return withTimeout(
                this.market.getHistory(position.symbol_code, "1y"),
                left,
                `Timed out loading history for ${position.symbol_code}`,
              );
            }),
          );
          if (settled.some((result) => result.status === "rejected"))
            return unavailableMetrics("history_unavailable");
          const benchmarkBars = await withTimeout(
            this.market.getHistory(benchmark, "1y"),
            Math.max(1, deadline - Date.now()),
            `Timed out loading benchmark ${benchmark}`,
          );
          const bars = settled.map(
            (result) => (result as PromiseFulfilledResult<{ date: string; close: number }[]>).value,
          );
          const portfolioReturns = weightedReturns(
            items.map((position, i) => ({
              returns: toReturns(bars[i] ?? []),
              weight: position.market_value ?? 0,
            })),
          );
          return computeRiskMetrics({
            currency,
            benchmark,
            portfolioCloses: equityCurve(portfolioReturns),
            portfolioReturns,
            benchmarkReturns: toReturns(benchmarkBars),
          });
        } catch (error) {
          return unavailableMetrics(
            error instanceof MarketDataError ? error.kind : "history_unavailable",
          );
        }
      }),
    );
    risk.sort((a, b) => a.currency.localeCompare(b.currency));

    return {
      portfolio,
      generated_at: new Date().toISOString(),
      fx_note: "跨币种未折算：各币种分别汇总，合计不跨币种相加。",
      totals,
      positions,
      allocation,
      top_holdings: topHoldings,
      risk,
      unavailable,
    };
  }
}
