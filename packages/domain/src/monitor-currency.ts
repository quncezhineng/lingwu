export const CURRENCY_CODES = ["CNY", "USD", "HKD"] as const;
export type MonitorCurrency = (typeof CURRENCY_CODES)[number];

export function normalizeMonitorCurrency(value: unknown): MonitorCurrency | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.normalize("NFKC").toUpperCase().replace(/\s/g, "");
  if (["CNY", "CNY¥", "RMB", "RMB¥", "CN¥", "¥", "人民币", "人民幣", "元"].includes(token))
    return "CNY";
  if (["HKD", "HK$", "HK＄", "港币", "港幣", "港元"].includes(token)) return "HKD";
  if (["USD", "USD$", "US$", "$", "美元", "美金"].includes(token)) return "USD";
  return undefined;
}

/** Explicit currency wins. For legacy rules, use clear currency/market clues;
 * conflicting clues need a user choice. Unmarked old rules retain USD semantics. */
export function resolveMonitorCurrency(source: {
  currency?: MonitorCurrency;
  title?: string;
  description?: string;
  value?: string;
  url?: string;
}): MonitorCurrency | undefined {
  if (source.currency) return source.currency;
  const context =
    `${source.title ?? ""} ${source.description ?? ""} ${source.value ?? ""}`.normalize("NFKC");
  const currencies = new Set<MonitorCurrency>();
  if (
    /\b(?:CNY|RMB)\b|人民币|人民幣|[¥￥]|A\s*股|沪市|深市|\b\d{6}\.(?:SH|SZ|SS|BJ)\b/i.test(context)
  )
    currencies.add("CNY");
  if (/\bHKD\b|HK\s*\$|港币|港幣|港元|港股|\b\d{1,5}\.HK\b/i.test(context)) currencies.add("HKD");
  if (/\bUSD\b|US\s*\$|美元|美金|美股/i.test(context)) currencies.add("USD");
  try {
    const url = new URL(source.url ?? "");
    const host = url.hostname.toLowerCase();
    const path = decodeURIComponent(url.pathname).toUpperCase();
    if (
      /(?:^|\.)(?:eastmoney\.com|sina\.com\.cn|xueqiu\.com|finance\.yahoo\.com|futunn\.com)$/.test(
        host,
      )
    ) {
      if (/(?:SH|SZ|BJ)\d{6}|\d{6}\.(?:SS|SZ|SH|BJ)\b|\d{6}-(?:SH|SZ|BJ)\b/.test(path))
        currencies.add("CNY");
      if (/\d{1,5}\.HK\b|(?:\/HK\/|HK\d{4,5})|\d{4,5}-HK\b/.test(path)) currencies.add("HKD");
      if (/[A-Z]+-US\b/.test(path)) currencies.add("USD");
    }
  } catch {
    /* A missing or malformed URL supplies no currency evidence. */
  }
  if (currencies.size === 1) return [...currencies][0];
  if (currencies.size > 1) return undefined;
  if (/\d(?:[\d,.]*\d)?\s*元/.test(context)) return "CNY";
  return "USD";
}

export function monitorPriceLabel(source: Parameters<typeof resolveMonitorCurrency>[0]) {
  const currency = resolveMonitorCurrency(source);
  return `${currency ? `${currency} ` : ""}${source.value ?? ""}`;
}
