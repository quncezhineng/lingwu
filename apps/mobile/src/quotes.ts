/**
 * 统一行情卡片数据层（P1-F3 / P1-4 Part A）。
 *
 * - POST /api/market/quotes { symbols }：≤50、去重保序、逐项 error、单标的 5s / 整体 10s；
 * - 前端在 5s 内展示骨架，超时转「行情不可用 · 请求超时」；
 * - stale 显示延迟 Chip；任何行情有 asOf 才显示「更新 HH:mm」。
 */
import { useEffect, useMemo, useState } from "react";
import type { LingWuApi } from "./api";
import type { Quote } from "./market";

export type QuoteError =
  | "network"
  | "timeout"
  | "http"
  | "parse"
  | "not_found"
  | "unsupported"
  | "provider_error";

export interface QuoteView {
  price: number;
  change?: number;
  changePercent?: number;
  weekChangePercent?: number;
  volume?: number;
  volumeRatio?: number;
  currency?: string;
  asOf?: string;
  stale?: boolean;
  marketState?: "open" | "closed" | "pre" | "post";
}

export type QuoteAvailability =
  | { status: "loading" }
  | { status: "ready"; quote: QuoteView }
  | { status: "unavailable"; reason?: QuoteError; retryable?: boolean };

const QUOTE_ERRORS = new Set<string>([
  "network",
  "timeout",
  "http",
  "parse",
  "not_found",
  "unsupported",
  "provider_error",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parseBatchQuotes(payload: unknown): Record<string, QuoteAvailability> {
  const result: Record<string, QuoteAvailability> = {};
  const items = isRecord(payload) && Array.isArray(payload.quotes) ? payload.quotes : [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const symbol = str(item.symbol);
    if (!symbol) continue;
    const price = num(item.price);
    const error = str(item.error);
    if (price === undefined) {
      result[symbol] = {
        status: "unavailable",
        reason: error && QUOTE_ERRORS.has(error) ? (error as QuoteError) : "parse",
        retryable: true,
      };
      continue;
    }
    result[symbol] = {
      status: "ready",
      quote: {
        price,
        change: num(item.change),
        changePercent: num(item.changePercent),
        volume: num(item.volume),
        currency: str(item.currency),
        asOf: str(item.asOf) ?? str(item.as_of),
        stale: item.stale === true,
        marketState:
          item.marketState === "closed" ||
          item.marketState === "open" ||
          item.marketState === "pre" ||
          item.marketState === "post"
            ? item.marketState
            : undefined,
      },
    };
  }
  return result;
}

/** 5s 客户端超时（后端整体预算 10s，前端先给出可解释状态）。 */
export async function fetchQuotes(
  api: LingWuApi,
  symbols: string[],
  timeoutMs = 5000,
): Promise<Record<string, QuoteAvailability>> {
  const unique = [...new Set(symbols.filter(Boolean))].slice(0, 50);
  if (!unique.length) return {};
  const request = api.request<unknown>("/api/market/quotes", { symbols: unique });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const payload = await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return parseBatchQuotes(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason: QuoteError = message === "timeout" ? "timeout" : "network";
    return Object.fromEntries(
      unique.map((symbol) => [
        symbol,
        { status: "unavailable", reason, retryable: true } as QuoteAvailability,
      ]),
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface InlineQuoteView {
  symbol: string;
  name?: string;
  market?: string;
  currency?: string;
  availability: QuoteAvailability;
}

/**
 * 对话内联行情（`get_quote` 工具）：
 * - 单标的优先取 `quote`，多标的取 `quotes[]`；
 * - error 七类复用 QuoteError，缺价但不带 error 时按解析失败处理；
 * - asOf 缺失保持 undefined，不编造时间。
 */
export function parseToolQuotes(payload: unknown): InlineQuoteView[] {
  let value = payload;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!isRecord(value)) return [];
  const single = isRecord(value.quote) ? value.quote : undefined;
  const list = single ? [single] : Array.isArray(value.quotes) ? value.quotes : [];
  return list.flatMap((item): InlineQuoteView[] => {
    if (!isRecord(item)) return [];
    const symbol = str(item.symbol);
    if (!symbol) return [];
    const price = num(item.price);
    const error = str(item.error);
    const currency = str(item.currency);
    if (price === undefined) {
      return [
        {
          symbol,
          name: str(item.name),
          market: str(item.market),
          currency,
          availability: {
            status: "unavailable",
            reason: error && QUOTE_ERRORS.has(error) ? (error as QuoteError) : "parse",
            retryable: false,
          },
        },
      ];
    }
    return [
      {
        symbol,
        name: str(item.name),
        market: str(item.market),
        currency,
        availability: {
          status: "ready",
          quote: {
            price,
            change: num(item.change),
            changePercent: num(item.changePercent),
            volume: num(item.volume),
            currency,
            asOf: str(item.asOf) ?? str(item.as_of),
            stale: item.stale === true,
          },
        },
      },
    ];
  });
}

export function useQuotes(api: LingWuApi, symbols: string[], options: { refreshMs?: number } = {}) {
  const key = useMemo(() => [...new Set(symbols.filter(Boolean))].sort().join(","), [symbols]);
  const [quotes, setQuotes] = useState<Record<string, QuoteAvailability>>(() => {
    const initial: Record<string, QuoteAvailability> = {};
    for (const symbol of key.split(",").filter(Boolean)) initial[symbol] = { status: "loading" };
    return initial;
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!key) return;
    const list = key.split(",");
    let active = true;
    setQuotes((current) => {
      const next: Record<string, QuoteAvailability> = { ...current };
      for (const symbol of list)
        if (!next[symbol] || next[symbol]?.status === "loading")
          next[symbol] = { status: "loading" };
      return next;
    });
    void fetchQuotes(api, list).then((result) => {
      if (active) setQuotes((current) => ({ ...current, ...result }));
    });
    const interval = options.refreshMs
      ? setInterval(() => setVersion((value) => value + 1), options.refreshMs)
      : undefined;
    return () => {
      active = false;
      if (interval) clearInterval(interval);
    };
  }, [api, key, options.refreshMs, version]);

  const retry = () => setVersion((value) => value + 1);
  return { quotes, retry };
}

/** 观察列表 summary 报价 → 卡片可用性。 */
export function availabilityFromQuote(quote?: Quote, unavailable = false): QuoteAvailability {
  if (!quote)
    return unavailable
      ? { status: "unavailable", reason: "provider_error", retryable: true }
      : { status: "loading" };
  return {
    status: "ready",
    quote: {
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      weekChangePercent: quote.weekChangePercent,
      volumeRatio: quote.volumeRatio,
      currency: quote.currency,
      stale: quote.stale,
    },
  };
}

/* ------------------------------------------------------------------ *
 * 展示格式化
 * ------------------------------------------------------------------ */

export function formatVolume(value: number | undefined, locale: string) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const zh = locale.startsWith("zh");
  if (value >= 100_000_000)
    return zh ? `${(value / 100_000_000).toFixed(1)}亿` : `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 10_000)
    return zh ? `${Math.round(value / 10_000)}万` : `${(value / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat(locale).format(value);
}

export function formatAsOf(value: string | undefined, locale: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return { time, label: time };
  const day = date.toLocaleDateString(locale, { month: "2-digit", day: "2-digit" });
  return { time, label: `${day} ${time}` };
}

export function formatDelayMinutes(asOf: string | undefined, now = Date.now()) {
  if (!asOf) return undefined;
  const date = new Date(asOf).getTime();
  if (Number.isNaN(date)) return undefined;
  const minutes = Math.max(0, Math.round((now - date) / 60000));
  return minutes;
}
