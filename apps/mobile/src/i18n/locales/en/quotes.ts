import type { Dictionary } from "../../types";

/** 统一行情卡片（命名空间：quotes）。 */
const quotes = {
  "quotes.updatedAt": "Updated {time}",
  "quotes.delayed": "Delayed",
  "quotes.delayedMinutes": "Delayed {count} min",
  "quotes.closed": "Closed",
  "quotes.volume": "Vol {value}",
  "quotes.unavailable": "Quote unavailable",
  "quotes.fetching": "Fetching quotes…",
  "quotes.retry": "Retry",
  "quotes.errorNetwork": "Network error",
  "quotes.errorTimeout": "Request timed out",
  "quotes.errorHttp": "Market data request failed",
  "quotes.errorParse": "Couldn’t read the quote",
  "quotes.errorNotFound": "Symbol not found",
  "quotes.errorUnsupported": "Symbol not supported",
  "quotes.errorProvider": "Data provider error",
  "quotes.a11y": "{code} {name}, price {price}, change {changePercent}, {time}",
};

export default quotes satisfies Dictionary;
