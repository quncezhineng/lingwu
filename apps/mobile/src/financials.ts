/**
 * 财报解析数据层（P1-F3 / P1-4 Part B）。
 *
 * - POST /api/financials/parse { symbol_code, text | pdf_base64, source_file? }
 * - GET  /api/financials/:symbol → { report: FinancialParseResult | null }
 *
 * 口径：对比对象为上一期（同一 PDF 或同类型上一份），不接入市场一致预期；
 * 缺失字段由后端 `unavailable[]` 显式给出，前端不得静默省略。
 */
import type { LingWuApi } from "./api";

export type MetricKey = "revenue" | "net_profit" | "eps" | "gross_margin" | "operating_cash_flow";

export const METRIC_KEYS: MetricKey[] = [
  "revenue",
  "net_profit",
  "eps",
  "gross_margin",
  "operating_cash_flow",
];

export type MetricUnit = "CNY" | "USD" | "HKD" | "percent" | "per_share" | "unknown";

export interface FinancialMetric {
  current: number | null;
  previous: number | null;
  unit: MetricUnit;
  yoy: number | null;
  changePp?: number | null;
}

export interface FinancialReport {
  id: string;
  symbolCode?: string;
  parseStatus: "complete" | "partial" | "failed";
  metrics: Record<MetricKey, FinancialMetric>;
  unavailable: string[];
  comparisonSource: "same_pdf" | "previous_report" | "none";
  expectations: "not_available";
  expectationsNote: string;
  sourceFile?: string;
  sourceUrl?: string;
  parsedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function metricOf(value: unknown): FinancialMetric {
  const record = isRecord(value) ? value : {};
  const unit = record.unit;
  return {
    current: num(record.current),
    previous: num(record.previous),
    unit:
      unit === "CNY" ||
      unit === "USD" ||
      unit === "HKD" ||
      unit === "percent" ||
      unit === "per_share"
        ? unit
        : "unknown",
    yoy: num(record.yoy),
    changePp: "change_pp" in record ? num(record.change_pp) : undefined,
  };
}

export function parseFinancialReport(payload: unknown): FinancialReport | undefined {
  if (!isRecord(payload)) return undefined;
  const record = isRecord(payload.report) ? payload.report : payload;
  const id = str(record.id);
  if (!id) return undefined;
  const metricsRaw = isRecord(record.metrics) ? record.metrics : {};
  const parseStatus = record.parse_status ?? record.parseStatus;
  return {
    id,
    symbolCode: str(record.symbol_code) ?? str(record.symbolCode),
    parseStatus:
      parseStatus === "complete" || parseStatus === "failed" || parseStatus === "partial"
        ? parseStatus
        : "partial",
    metrics: {
      revenue: metricOf(metricsRaw.revenue),
      net_profit: metricOf(metricsRaw.net_profit),
      eps: metricOf(metricsRaw.eps),
      gross_margin: metricOf(metricsRaw.gross_margin),
      operating_cash_flow: metricOf(metricsRaw.operating_cash_flow),
    },
    unavailable: Array.isArray(record.unavailable)
      ? record.unavailable.filter((item): item is string => typeof item === "string")
      : [],
    comparisonSource:
      record.comparison_source === "same_pdf" || record.comparison_source === "previous_report"
        ? record.comparison_source
        : "none",
    expectations: "not_available",
    expectationsNote: str(record.expectations_note) ?? "未接入市场一致预期；对比对象为上一期。",
    sourceFile: str(record.source_file),
    sourceUrl: str(record.source_url),
    parsedAt: str(record.parsed_at) ?? new Date().toISOString(),
  };
}

export async function fetchLatestFinancials(
  api: LingWuApi,
  symbol: string,
): Promise<FinancialReport | undefined> {
  const payload = await api.request<unknown>(`/api/financials/${encodeURIComponent(symbol)}`);
  if (isRecord(payload) && payload.report === null) return undefined;
  return parseFinancialReport(payload);
}

export interface ParseFinancialsInput {
  symbolCode: string;
  text?: string;
  pdfBase64?: string;
  sourceFile?: string;
}

export async function parseFinancials(
  api: LingWuApi,
  input: ParseFinancialsInput,
): Promise<FinancialReport> {
  const payload = await api.request<unknown>("/api/financials/parse", {
    symbol_code: input.symbolCode,
    ...(input.text === undefined ? {} : { text: input.text }),
    ...(input.pdfBase64 === undefined ? {} : { pdf_base64: input.pdfBase64 }),
    ...(input.sourceFile === undefined ? {} : { source_file: input.sourceFile }),
  });
  const report = parseFinancialReport(payload);
  if (!report) throw new Error("Unexpected financials payload");
  return report;
}

/** 422 通常表示服务端缺少 PDF 解析组件（pdftotext）。 */
export function isPdfUnsupported(error: unknown) {
  return (error as { status?: number }).status === 422;
}
