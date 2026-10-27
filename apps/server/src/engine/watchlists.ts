import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Watchlist } from "../../../../packages/domain/src/agent.ts";
import {
  type Market,
  MarketDataError,
  type MarketDataService,
  type Quote,
  resolveMarket,
  withTimeout,
} from "../../../../packages/integrations/src/market-data.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

const WATCHLIST_KIND = "watchlists";
const SYMBOL_KIND = "symbols";
/** Movers are symbols whose daily change exceeds this percentage. */
const MOVER_THRESHOLD_PERCENT = 2;
/** Whole-summary budget; per-symbol quotes are already bounded by MarketDataService. */
const SUMMARY_TIMEOUT_MS = Number(process.env.MARKET_DATA_SUMMARY_TIMEOUT_MS ?? 10_000);

const nameSchema = z.string().trim().min(1).max(100);
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[A-Za-z0-9^=.-]+$/, "Symbol codes may only contain letters, digits, . = - ^");

export const createWatchlistSchema = z.object({
  name: nameSchema,
  symbols: z.array(codeSchema).max(200).default([]),
});

export const updateWatchlistSchema = z
  .object({
    name: nameSchema.optional(),
    symbols: z.array(codeSchema).max(200).optional(),
  })
  .refine((value) => value.name !== undefined || value.symbols !== undefined, {
    message: "Provide a name or symbols to update",
  });

export const addSymbolSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1).max(200).optional(),
  market: z.enum(["US", "CN", "HK"]).optional(),
  sector: z.string().trim().max(100).optional(),
});

export type CreateWatchlistInput = z.infer<typeof createWatchlistSchema>;
export type UpdateWatchlistInput = z.infer<typeof updateWatchlistSchema>;
export type AddSymbolInput = z.infer<typeof addSymbolSchema>;

export interface SymbolMeta {
  id: string;
  code: string;
  name?: string;
  market: Market;
  sector?: string;
  updated_at: string;
}

export interface WatchlistQuote {
  symbol: string;
  name?: string;
  market: Market;
  price?: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  currency?: string;
  asOf?: string;
  stale?: boolean;
  error?: string;
}

export interface WatchlistMover {
  symbol: string;
  changePercent: number;
  direction: "up" | "down";
}

export interface WatchlistSummary {
  watchlist_id: string;
  name: string;
  generated_at: string;
  quotes: WatchlistQuote[];
  movers: WatchlistMover[];
  unavailable: string[];
}

function normalizeCode(code: string): string {
  const trimmed = code.trim();
  return /\.SH$/i.test(trimmed)
    ? `${trimmed.slice(0, -3).toUpperCase()}.SS`
    : trimmed.toUpperCase();
}

/** Watchlists live in the JSONB records store; symbol metadata is shared per owner. */
export class WatchlistsService {
  constructor(
    private readonly db: Store,
    private readonly market: MarketDataService,
  ) {}

  async list(owner: string): Promise<Watchlist[]> {
    return this.db.list<Watchlist>(owner, WATCHLIST_KIND);
  }

  private async require(owner: string, id: string): Promise<Watchlist> {
    const watchlist = await this.db.get<Watchlist>(owner, WATCHLIST_KIND, id);
    if (!watchlist) throw new AppError("Watchlist not found", 404);
    return watchlist;
  }

  private async saveSymbols(owner: string, symbols: string[], hints: AddSymbolInput[]) {
    const at = new Date().toISOString();
    for (const symbol of symbols) {
      const hint = hints.find((item) => normalizeCode(item.code) === symbol);
      const existing = await this.db.get<SymbolMeta>(owner, SYMBOL_KIND, symbol);
      const meta: SymbolMeta = {
        id: symbol,
        code: symbol,
        name: hint?.name ?? existing?.name,
        market: hint?.market ?? existing?.market ?? resolveMarket(symbol),
        sector: hint?.sector ?? existing?.sector,
        updated_at: at,
      };
      await this.db.put(owner, SYMBOL_KIND, meta);
    }
  }

  async create(owner: string, input: CreateWatchlistInput): Promise<Watchlist> {
    const at = new Date().toISOString();
    const watchlist: Watchlist = {
      id: randomUUID(),
      user_id: owner,
      name: input.name,
      symbols: [...new Set(input.symbols.map(normalizeCode))],
      created_at: at,
      updated_at: at,
    };
    await this.saveSymbols(owner, watchlist.symbols, []);
    return this.db.put(owner, WATCHLIST_KIND, watchlist);
  }

  async update(owner: string, id: string, input: UpdateWatchlistInput): Promise<Watchlist> {
    const watchlist = await this.require(owner, id);
    const next: Watchlist = {
      ...watchlist,
      name: input.name ?? watchlist.name,
      symbols: input.symbols ? [...new Set(input.symbols.map(normalizeCode))] : watchlist.symbols,
      updated_at: new Date().toISOString(),
    };
    await this.saveSymbols(owner, next.symbols, []);
    return this.db.put(owner, WATCHLIST_KIND, next);
  }

  async remove(owner: string, id: string): Promise<void> {
    await this.require(owner, id);
    await this.db.remove(owner, WATCHLIST_KIND, id);
  }

  async addSymbol(owner: string, id: string, input: AddSymbolInput): Promise<Watchlist> {
    const watchlist = await this.require(owner, id);
    const code = normalizeCode(input.code);
    if (watchlist.symbols.includes(code)) return watchlist;
    if (watchlist.symbols.length >= 200)
      throw new AppError("A watchlist can hold at most 200 symbols", 422);
    await this.saveSymbols(owner, [code], [input]);
    const next: Watchlist = {
      ...watchlist,
      symbols: [...watchlist.symbols, code],
      updated_at: new Date().toISOString(),
    };
    return this.db.put(owner, WATCHLIST_KIND, next);
  }

  async removeSymbol(owner: string, id: string, symbolCode: string): Promise<Watchlist> {
    const watchlist = await this.require(owner, id);
    const code = normalizeCode(decodeURIComponent(symbolCode));
    const next: Watchlist = {
      ...watchlist,
      symbols: watchlist.symbols.filter((symbol) => symbol !== code),
      updated_at: new Date().toISOString(),
    };
    return this.db.put(owner, WATCHLIST_KIND, next);
  }

  /** Quote every symbol and flag the day's movers. Partial failures are reported per symbol. */
  async summary(owner: string, id: string): Promise<WatchlistSummary> {
    const watchlist = await this.require(owner, id);
    const deadline = Date.now() + SUMMARY_TIMEOUT_MS;
    const settled = await Promise.allSettled(
      watchlist.symbols.map(async (symbol) => {
        const remaining = Math.max(1, deadline - Date.now());
        return {
          symbol,
          quote: await withTimeout(
            this.market.getQuote(symbol),
            remaining,
            `Timed out loading ${symbol}`,
          ),
        };
      }),
    );
    const quotes: WatchlistQuote[] = [];
    const unavailable: string[] = [];
    settled.forEach((result, i) => {
      const symbol = watchlist.symbols[i] ?? "";
      if (result.status === "fulfilled") {
        quotes.push(toWatchlistQuote(symbol, result.value.quote));
        return;
      }
      unavailable.push(symbol);
      quotes.push({
        symbol,
        market: resolveMarket(symbol),
        error: result.reason instanceof MarketDataError ? result.reason.kind : "provider_error",
      });
    });
    const movers: WatchlistMover[] = quotes
      .filter(
        (quote): quote is WatchlistQuote & { changePercent: number } =>
          typeof quote.changePercent === "number" &&
          Math.abs(quote.changePercent) >= MOVER_THRESHOLD_PERCENT,
      )
      .map(
        (quote): WatchlistMover => ({
          symbol: quote.symbol,
          changePercent: quote.changePercent,
          direction: quote.changePercent >= 0 ? "up" : "down",
        }),
      )
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    return {
      watchlist_id: watchlist.id,
      name: watchlist.name,
      generated_at: new Date().toISOString(),
      quotes,
      movers,
      unavailable,
    };
  }
}

function toWatchlistQuote(symbol: string, quote: Quote): WatchlistQuote {
  return {
    symbol,
    name: quote.name,
    market: quote.market,
    price: quote.price,
    previousClose: quote.previousClose,
    change: quote.change,
    changePercent: quote.changePercent,
    currency: quote.currency,
    asOf: quote.asOf,
    ...(quote.stale ? { stale: true } : {}),
  };
}
