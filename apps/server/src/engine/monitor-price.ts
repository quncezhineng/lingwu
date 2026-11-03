import {
  type MonitorCurrency,
  normalizeMonitorCurrency,
} from "../../../../packages/domain/src/monitor-currency.ts";

const amount = "(?:\\d{1,3}(?:[, \\u00a0\\u202f]\\d{3})+|\\d+)(?:\\.\\d+)?";
const marker =
  "(?:HK\\s*\\$|US\\s*\\$|USD\\s*\\$?|(?:CNY|RMB)\\s*¥?|HKD|人民币\\s*¥?|人民幣\\s*¥?|港币|港幣|港元|美元|美金|CN\\s*¥|[$¥]|元)";
const numberEnd = "(?![\\d.,A-Za-z%千万萬亿億])";
const pricePattern = `(?<![A-Za-z0-9_.,+\\-])(?:(?<prefix>${marker})\\s*[:：]?\\s*(?<a>${amount})${numberEnd}|(?<b>${amount})${numberEnd}\\s*(?<suffix>${marker})(?![A-Za-z_]))`;
const currentLabel =
  "(?:最新(?:成交)?价(?:格)?|最新價(?:格)?|现价|現價|当前价(?:格)?|當前價(?:格)?|current\\s+price|last\\s+(?:traded\\s+)?price|(?:^|\\n)\\s*price\\s*:)";
const currentPattern = `${currentLabel}[\\s:：]*(?:(?<prefix>${marker})\\s*(?<a>${amount})${numberEnd}|(?<b>${amount})${numberEnd}[ \\t]*(?<suffix>${marker})?)`;

function explicitCurrency(marker: string): MonitorCurrency | undefined {
  const token = marker.replace(/\s/g, "");
  if (/^(?:CNY|RMB|人民币|人民幣|CN¥)/i.test(token)) return "CNY";
  return normalizeMonitorCurrency(token);
}

/** A currency code in the page can disambiguate "$" and "元". Unsupported
 * dollar/yen currencies never silently become USD/CNY. */
function pageCurrencies(text: string) {
  const found = new Set<MonitorCurrency>();
  if (/(?<![A-Za-z_])(?:CNY|RMB)(?![A-Za-z_])|人民币|人民幣/i.test(text)) found.add("CNY");
  if (/(?<![A-Za-z_])HKD(?![A-Za-z_])|HK\s*\$|港币|港幣|港元/i.test(text)) found.add("HKD");
  if (/(?<![A-Za-z_])USD(?![A-Za-z_])|US\s*\$|美元|美金/i.test(text)) found.add("USD");
  return found;
}

export function readMonitoredPrice(text: string, currency: MonitorCurrency) {
  const source = text.normalize("NFKC");
  const context = pageCurrencies(source);
  const unsupportedDollar = /\b(?:CAD|AUD|NZD|SGD)\b|加元|澳元|纽元|紐元|新加坡元/i.test(source);
  const unsupportedYen = /\bJPY\b|日元|日圓/i.test(source);
  const unit = (value: string): MonitorCurrency | undefined => {
    const token = value.replace(/\s/g, "");
    if (token === "$") {
      if (unsupportedDollar || context.size > 1) return undefined;
      const only = [...context][0];
      return only === "CNY" ? undefined : (only ?? (currency === "HKD" ? "HKD" : "USD"));
    }
    if (token === "¥") return unsupportedYen ? undefined : "CNY";
    if (token === "元") {
      if (unsupportedYen || context.size > 1) return undefined;
      const only = [...context][0];
      return only === "USD" ? undefined : (only ?? (currency === "HKD" ? "HKD" : "CNY"));
    }
    return explicitCurrency(token);
  };
  const parse = (match: RegExpMatchArray, bare: boolean) => {
    const groups = match.groups ?? {};
    const prefix = groups.prefix ? unit(groups.prefix) : undefined;
    const suffix = groups.suffix ? unit(groups.suffix) : undefined;
    if (
      (groups.prefix && !prefix) ||
      (groups.suffix && !suffix) ||
      (prefix && suffix && prefix !== suffix)
    )
      return undefined;
    let detected = prefix ?? suffix;
    if (!detected && bare && !unsupportedDollar && !unsupportedYen) {
      if (context.size > 1) return undefined;
      detected = [...context][0] ?? currency;
    }
    const price = Number((groups.a ?? groups.b ?? "").replace(/[,\s]/g, ""));
    return detected && Number.isFinite(price) && price > 0
      ? { price, currency: detected }
      : undefined;
  };
  const current = [...source.matchAll(new RegExp(currentPattern, "gimu"))]
    .map((match) => parse(match, true))
    .filter((item) => item !== undefined);
  // Current/last prices take precedence over earlier closes, daily lows and fees.
  const candidates = new RegExp(currentLabel, "imu").test(source)
    ? current
    : [...source.matchAll(new RegExp(pricePattern, "giu"))]
        .map((match) => parse(match, false))
        .filter((item) => item !== undefined);
  const prices = [
    ...new Set(candidates.filter((item) => item.currency === currency).map((item) => item.price)),
  ];
  if (!prices.length)
    throw new Error(`No readable ${currency} price was found on the monitored page`);
  if (prices.length > 1)
    throw new Error(
      `The monitored page contains multiple ${currency} prices; select a page with one current price`,
    );
  return prices[0];
}
