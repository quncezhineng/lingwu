/**
 * 行情展示格式化（观察列表 / 标的详情共用）。
 *
 * 涨跌使用中国市场惯例：红涨、绿跌、灰平；正文色采用 AA 对比度的深色变体，
 * 图形（圆点/箭头）仍可使用高饱和语义色。
 */
import { activeLocaleTag } from "./i18n";
import type { MarketKind } from "./market";

export type Direction = "up" | "down" | "flat";

export function defaultCurrency(market: MarketKind) {
  if (market === "CN" || market === "FUND") return "CNY";
  if (market === "HK") return "HKD";
  return "USD";
}

export function currencySymbol(currency: string) {
  if (currency === "CNY") return "¥";
  if (currency === "HKD") return "HK$";
  return "$";
}

export function formatPrice(value: number, currency: string, precision = 2) {
  const text = new Intl.NumberFormat(activeLocaleTag(), {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value);
  return `${currencySymbol(currency)}${text}`;
}

export function formatPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function directionOf(value: number): Direction {
  if (value > 0.005) return "up";
  if (value < -0.005) return "down";
  return "flat";
}
