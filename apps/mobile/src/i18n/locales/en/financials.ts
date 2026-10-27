import type { Dictionary } from "../../types";

/** 财报解析展示（命名空间：financials）。 */
const financials = {
  "financials.title": "Financials",
  "financials.banner":
    "Compared with the previous period (YoY); consensus estimates are not connected yet.",
  "financials.metricColumn": "Metric",
  "financials.current": "Current",
  "financials.previous": "Previous",
  "financials.yoy": "YoY",
  "financials.changePp": "Change (pp)",
  "financials.revenue": "Revenue",
  "financials.netProfit": "Net profit",
  "financials.eps": "EPS",
  "financials.grossMargin": "Gross margin",
  "financials.operatingCashFlow": "Operating cash flow",
  "financials.unavailable": "Unavailable fields",
  "financials.comparisonNone": "No previous period found — showing the current period only.",
  "financials.bannerPartial":
    "Some metrics lack current/previous data; missing values are shown as —.",
  "financials.statusComplete": "Complete",
  "financials.statusPartial": "Partial",
  "financials.statusFailed": "Parse failed",
  "financials.noReport": "No parsed financials yet.",
  "financials.pasteTitle": "Parse financial text",
  "financials.textPlaceholder":
    "Paste the financial statement text (revenue, net profit, EPS, gross margin, operating cash flow)…",
  "financials.parseText": "Parse text",
  "financials.uploadPdf": "Upload PDF",
  "financials.parsing": "Parsing…",
  "financials.parseFailed": "Couldn’t parse this text. Check the content and try again.",
  "financials.pdfUnsupported":
    "PDF parsing isn’t available in this environment. Paste the text instead or contact your administrator.",
  "financials.parsedAt": "Parsed {time}",
  "financials.source": "Source",
  "financials.update": "Update financials",
  "financials.collapse": "Hide",
};

export default financials satisfies Dictionary;
