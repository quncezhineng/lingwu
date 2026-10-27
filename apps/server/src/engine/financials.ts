import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeYahooSymbol } from "../../../../packages/integrations/src/market-data.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

const REPORT_KIND = "financial_reports";

export const parseFinancialsSchema = z
  .object({
    symbol_code: z
      .string()
      .trim()
      .max(24)
      .regex(/^[A-Za-z0-9^=.-]*$/, "Invalid symbol")
      .optional(),
    text: z.string().min(1).max(2_000_000).optional(),
    pdf_base64: z.string().min(1).max(8_000_000).optional(),
    source_file: z.string().trim().max(300).optional(),
    source_url: z.url().max(2048).optional(),
  })
  .refine((value) => value.text !== undefined || value.pdf_base64 !== undefined, {
    message: "Provide extracted text or a PDF",
  });

export type ParseFinancialsInput = z.infer<typeof parseFinancialsSchema>;

export type MetricKey = "revenue" | "net_profit" | "eps" | "gross_margin" | "operating_cash_flow";

export interface MetricValue {
  current: number | null;
  previous: number | null;
  unit: "CNY" | "USD" | "HKD" | "percent" | "per_share" | "unknown";
  /** Percent change vs the previous period (null for margins, which use change_pp). */
  yoy: number | null;
  /** Margin change in percentage points. */
  change_pp?: number | null;
}

export interface FinancialParseResult {
  id: string;
  symbol_code?: string;
  parse_status: "complete" | "partial" | "failed";
  metrics: Record<MetricKey, MetricValue>;
  unavailable: string[];
  comparison_source: "same_pdf" | "previous_report" | "none";
  expectations: "not_available";
  expectations_note: string;
  source_file?: string;
  source_url?: string;
  parsed_at: string;
}

interface MetricPattern {
  key: MetricKey;
  pattern: RegExp;
  unit: MetricValue["unit"];
  percent?: boolean;
}

const METRIC_PATTERNS: MetricPattern[] = [
  {
    key: "revenue",
    pattern:
      /(?:营业总收入|营业收入|营收|Revenue)[^\d%]{0,24}([\d,]+(?:\.\d+)?)\s*(亿元|万元|十亿元|百万|亿|万)?/i,
    unit: "CNY",
  },
  {
    key: "net_profit",
    pattern:
      /(?:归属于母公司(?:股东)?的净利润|归母净利润|净利润|Net\s+(?:income|profit))[^\d%]{0,24}([\d,]+(?:\.\d+)?)\s*(亿元|万元|十亿元|百万|亿|万)?/i,
    unit: "CNY",
  },
  {
    key: "eps",
    pattern:
      /(?:基本每股收益|稀释每股收益|每股收益|Earnings\s+per\s+share|EPS)[^\d%]{0,20}([\d,]+(?:\.\d+)?)/i,
    unit: "per_share",
  },
  {
    key: "gross_margin",
    pattern: /(?:毛利率|Gross\s+margin)[^\d%]{0,16}([\d,]+(?:\.\d+)?)\s*%/i,
    unit: "percent",
    percent: true,
  },
  {
    key: "operating_cash_flow",
    pattern:
      /(?:经营活动产生的现金流量净额|经营活动现金流(?:量)?净额|经营活动现金流|Operating\s+cash\s+flow)[^\d%]{0,24}([\d,]+(?:\.\d+)?)\s*(亿元|万元|十亿元|百万|亿|万)?/i,
    unit: "CNY",
  },
];

const SCALE: Record<string, number> = {
  十亿: 1e9,
  亿: 1e8,
  亿元: 1e8,
  百万: 1e6,
  万: 1e4,
  万元: 1e4,
};

function toNumber(raw: string, unit?: string): number {
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return Number.NaN;
  return value * (unit ? (SCALE[unit] ?? 1) : 1);
}

/** Look for a previous-period figure within a short window after the current match. */
function findPrevious(text: string, index: number, percent: boolean): number | null {
  const window = text.slice(index, index + 240);
  const pattern = percent
    ? /(?:上年同期|上期|去年同期|previous(?: period)?)[^\d%]{0,16}([\d,]+(?:\.\d+)?)\s*%/i
    : /(?:上年同期|上期|去年同期|previous(?: period)?)[^\d%]{0,16}([\d,]+(?:\.\d+)?)\s*(亿元|万元|十亿元|百万|亿|万)?/i;
  const match = pattern.exec(window);
  if (!match?.[1]) return null;
  const value = toNumber(match[1], match[2]);
  return Number.isFinite(value) ? value : null;
}

export function parseFinancialText(text: string): {
  metrics: Record<MetricKey, MetricValue>;
  unavailable: string[];
} {
  const normalized = text.replace(/\u00a0/g, " ");
  const metrics = {} as Record<MetricKey, MetricValue>;
  const unavailable: string[] = [];

  for (const { key, pattern, unit, percent } of METRIC_PATTERNS) {
    const match = pattern.exec(normalized);
    const current = match?.[1] ? toNumber(match[1], match[2]) : Number.NaN;
    if (!match || !Number.isFinite(current)) {
      metrics[key] = { current: null, previous: null, unit: percent ? "percent" : unit, yoy: null };
      unavailable.push(`${key}:current`);
      continue;
    }
    const previous = match?.[0]
      ? findPrevious(normalized, (match.index ?? 0) + match[0].length, Boolean(percent))
      : null;
    const resolvedPrevious =
      previous ?? findPrevious(normalized, match.index ?? 0, Boolean(percent));
    let yoy: number | null = null;
    let changePp: number | null | undefined;
    if (percent) {
      changePp = resolvedPrevious === null ? null : Number((current - resolvedPrevious).toFixed(4));
    } else if (resolvedPrevious !== null && resolvedPrevious !== 0) {
      yoy = Number((((current - resolvedPrevious) / resolvedPrevious) * 100).toFixed(4));
    }
    if (resolvedPrevious === null) unavailable.push(`${key}:previous`);
    metrics[key] = {
      current,
      previous: resolvedPrevious,
      unit: percent ? "percent" : unit,
      yoy,
      ...(percent ? { change_pp: changePp ?? null } : {}),
    };
  }
  return { metrics, unavailable };
}

/** Extract text from a PDF via pdftotext; fails explicitly when the tool is absent. */
export function extractPdfText(bytes: Buffer, timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.env.PDFTOTEXT_BIN ?? "pdftotext",
      ["-", "-"],
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code;
          reject(
            new AppError(
              code === "ENOENT"
                ? "PDF text extraction is unavailable (install pdftotext or send extracted text)"
                : "PDF text extraction failed",
              422,
            ),
          );
          return;
        }
        resolve(stdout);
      },
    );
    child.stdin?.end(bytes);
  });
}

function unitForSymbol(symbol?: string): "CNY" | "USD" | "HKD" | "unknown" {
  if (!symbol) return "unknown";
  if (/\.(SS|SZ)$/i.test(symbol)) return "CNY";
  if (/\.HK$/i.test(symbol)) return "HKD";
  return "USD";
}

export class FinancialsService {
  constructor(private readonly db: Store) {}

  async parse(owner: string, input: ParseFinancialsInput): Promise<FinancialParseResult> {
    const text =
      input.text ?? (await extractPdfText(Buffer.from(input.pdf_base64 ?? "", "base64")));
    const { metrics, unavailable } = parseFinancialText(text);
    const symbol = input.symbol_code ? normalizeYahooSymbol(input.symbol_code) : undefined;
    const currency = unitForSymbol(symbol);
    if (currency !== "unknown" && currency !== "CNY") {
      for (const key of ["revenue", "net_profit", "operating_cash_flow"] as MetricKey[]) {
        if (metrics[key].unit === "CNY") metrics[key] = { ...metrics[key], unit: currency };
      }
    }
    const present = (Object.keys(metrics) as MetricKey[]).filter(
      (key) => metrics[key].current !== null,
    );
    const complete = present.length === 5 && unavailable.length === 0;
    const result: FinancialParseResult = {
      id: createHash("sha256")
        .update(`financial:${owner}:${text.slice(0, 2000)}:${Date.now()}`)
        .digest("hex")
        .slice(0, 32),
      ...(symbol ? { symbol_code: symbol } : {}),
      parse_status: present.length === 0 ? "failed" : complete ? "complete" : "partial",
      metrics,
      unavailable,
      comparison_source: complete ? "same_pdf" : "none",
      expectations: "not_available",
      expectations_note: "未接入市场一致预期；对比对象为上一期（同一财报或同类型上一份）。",
      ...(input.source_file ? { source_file: input.source_file } : {}),
      ...(input.source_url ? { source_url: input.source_url } : {}),
      parsed_at: new Date().toISOString(),
    };
    await this.db.put(owner, REPORT_KIND, result);
    return result;
  }

  async latest(owner: string, symbol: string): Promise<FinancialParseResult | null> {
    const normalized = normalizeYahooSymbol(symbol);
    const reports = await this.db.listByField<FinancialParseResult>(
      owner,
      REPORT_KIND,
      "symbol_code",
      normalized,
    );
    return reports[0] ?? null;
  }

  async history(owner: string, symbol: string, limit = 10): Promise<FinancialParseResult[]> {
    const normalized = normalizeYahooSymbol(symbol);
    const reports = await this.db.listByField<FinancialParseResult>(
      owner,
      REPORT_KIND,
      "symbol_code",
      normalized,
    );
    return reports.slice(0, limit);
  }
}
