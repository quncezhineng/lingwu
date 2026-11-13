/**
 * 交易日历：CN / HK / US 三个市场各自判断周末与法定休市日。
 *
 * 休市日是显式数据表，不按「猜测」推断；每年交易所公布次年安排后在这里补行。
 * 部署侧如遇到临时休市（台风、国丧等），可通过 `MONITOR_HOLIDAYS_JSON` 追加，
 * 无需改代码，例如：
 *   MONITOR_HOLIDAYS_JSON='{"HK":["2026-09-08"]}'
 */

export type TradingMarket = "CN" | "HK" | "US";

export const MARKET_TIME_ZONES: Record<TradingMarket, string> = {
  CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong",
  US: "America/New_York",
};

/**
 * 交易所休市日（不含周末）。覆盖 2025–2027；US 为 NYSE 安排，CN 为沪深交易所安排，
 * HK 为港交所安排。列表之外的日期按「工作日即交易日」处理。
 */
const MARKET_HOLIDAYS: Record<TradingMarket, readonly string[]> = {
  US: [
    // 2025
    "2025-01-01",
    "2025-01-09",
    "2025-01-20",
    "2025-02-17",
    "2025-04-18",
    "2025-05-26",
    "2025-06-19",
    "2025-07-04",
    "2025-09-01",
    "2025-11-27",
    "2025-12-25",
    // 2026
    "2026-01-01",
    "2026-01-19",
    "2026-02-16",
    "2026-04-03",
    "2026-05-25",
    "2026-06-19",
    "2026-07-03",
    "2026-09-07",
    "2026-11-26",
    "2026-12-25",
    // 2027
    "2027-01-01",
    "2027-01-18",
    "2027-02-15",
    "2027-03-26",
    "2027-05-31",
    "2027-06-18",
    "2027-07-05",
    "2027-09-06",
    "2027-11-25",
    "2027-12-24",
  ],
  HK: [
    // 2025
    "2025-01-01",
    "2025-01-29",
    "2025-01-30",
    "2025-01-31",
    "2025-04-04",
    "2025-04-18",
    "2025-04-21",
    "2025-05-01",
    "2025-05-05",
    "2025-07-01",
    "2025-10-01",
    "2025-10-07",
    "2025-10-29",
    "2025-12-25",
    "2025-12-26",
    // 2026
    "2026-01-01",
    "2026-02-17",
    "2026-02-18",
    "2026-02-19",
    "2026-04-03",
    "2026-04-06",
    "2026-05-01",
    "2026-05-25",
    "2026-06-19",
    "2026-07-01",
    "2026-10-01",
    "2026-10-19",
    "2026-12-25",
    // 2027
    "2027-01-01",
    "2027-02-08",
    "2027-02-09",
    "2027-03-26",
    "2027-03-29",
    "2027-04-05",
    "2027-05-03",
    "2027-05-13",
    "2027-06-09",
    "2027-07-01",
    "2027-10-01",
    "2027-10-08",
    "2027-12-27",
  ],
  CN: [
    // 2025
    "2025-01-01",
    "2025-01-28",
    "2025-01-29",
    "2025-01-30",
    "2025-01-31",
    "2025-02-03",
    "2025-02-04",
    "2025-04-04",
    "2025-05-01",
    "2025-05-02",
    "2025-05-05",
    "2025-06-02",
    "2025-10-01",
    "2025-10-02",
    "2025-10-03",
    "2025-10-06",
    "2025-10-07",
    "2025-10-08",
    // 2026
    "2026-01-01",
    "2026-01-02",
    "2026-02-16",
    "2026-02-17",
    "2026-02-18",
    "2026-02-19",
    "2026-02-20",
    "2026-04-06",
    "2026-05-01",
    "2026-05-04",
    "2026-05-05",
    "2026-06-19",
    "2026-09-25",
    "2026-10-01",
    "2026-10-02",
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    // 2027
    "2027-01-01",
    "2027-02-08",
    "2027-02-09",
    "2027-02-10",
    "2027-02-11",
    "2027-02-12",
    "2027-04-05",
    "2027-05-03",
    "2027-05-04",
    "2027-05-05",
    "2027-06-09",
    "2027-09-15",
    "2027-10-01",
    "2027-10-04",
    "2027-10-05",
    "2027-10-06",
    "2027-10-07",
  ],
};

function holidayOverrides(): Partial<Record<TradingMarket, string[]>> {
  const raw = process.env.MONITOR_HOLIDAYS_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Partial<Record<TradingMarket, string[]>> = {};
    for (const market of ["CN", "HK", "US"] as const) {
      const value = parsed[market];
      if (Array.isArray(value))
        result[market] = value.filter((item): item is string => typeof item === "string");
    }
    return result;
  } catch {
    return {};
  }
}

const HOLIDAYS: Record<TradingMarket, ReadonlySet<string>> = (() => {
  const overrides = holidayOverrides();
  return {
    CN: new Set([...MARKET_HOLIDAYS.CN, ...(overrides.CN ?? [])]),
    HK: new Set([...MARKET_HOLIDAYS.HK, ...(overrides.HK ?? [])]),
    US: new Set([...MARKET_HOLIDAYS.US, ...(overrides.US ?? [])]),
  };
})();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(date: string): Date {
  if (!DATE_PATTERN.test(date)) throw new Error(`Invalid calendar date: ${date}`);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid calendar date: ${date}`);
  return parsed;
}

/** ISO 日期（YYYY-MM-DD）是否是周末。 */
export function isWeekend(date: string): boolean {
  const day = parseDate(date).getUTCDay();
  return day === 0 || day === 6;
}

/** 某市场在某 ISO 日期是否开市。 */
export function isTradingDay(market: TradingMarket, date: string): boolean {
  return !isWeekend(date) && !HOLIDAYS[market].has(date);
}

/** 下一个交易日（严格大于传入日期）。 */
export function nextTradingDay(market: TradingMarket, date: string): string {
  const cursor = parseDate(date);
  for (let index = 1; index <= 14; index++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const candidate = cursor.toISOString().slice(0, 10);
    if (isTradingDay(market, candidate)) return candidate;
  }
  return parseDate(date).toISOString().slice(0, 10);
}

/** 某个时刻在指定时区的本地 ISO 日期。 */
export function localDate(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export interface MarketClock {
  date: string;
  hour: number;
  minute: number;
}

/** 指定时区的本地日期与时刻（24 小时制）。 */
export function localClock(timeZone: string, at: Date): MarketClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

/** 市场本地日期与时刻（24 小时制）。 */
export function marketClock(market: TradingMarket, at: Date): MarketClock {
  return localClock(MARKET_TIME_ZONES[market], at);
}

/** 标的所属市场：与行情层的 Yahoo 后缀规则保持一致。 */
export function marketForSymbol(symbol: string): TradingMarket {
  const upper = symbol.trim().toUpperCase();
  if (upper.endsWith(".SS") || upper.endsWith(".SZ") || upper.endsWith(".SH")) return "CN";
  if (upper.endsWith(".HK")) return "HK";
  return "US";
}
