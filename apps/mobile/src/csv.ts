/**
 * CSV 工具（P1-F1 导入流程）。
 *
 * - 解析：支持逗号/分号/制表符分隔、引号转义、CRLF、UTF-8 BOM；
 * - 映射：表头同义词自动识别（code/symbol/代码…）；
 * - 校验：逐行生成 valid/warning/error 与字段级原因（与 B1 契约的
 *   `{ row, field, reason }` 对齐）；
 * - 输出：生成后端可接受的规范 CSV（固定列名），以及错误行 CSV 供下载。
 */

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

const DELIMITERS = [",", ";", "\t"] as const;

export function stripBom(text: string) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectDelimiter(sample: string) {
  const counts = DELIMITERS.map((delimiter) => ({
    delimiter,
    count: sample.split(delimiter).length - 1,
  })).sort((a, b) => b.count - a.count);
  return counts[0]?.count ? counts[0].delimiter : ",";
}

/** 解析一行 CSV（支持引号包裹与 "" 转义）。 */
function parseLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else quoted = false;
      } else current += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function parseCsv(input: string): CsvTable {
  const text = stripBom(input).replace(/\r\n?/g, "\n");
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(lines[0] ?? "");
  const headers = parseLine(lines[0] ?? "", delimiter);
  const rows = lines.slice(1).map((line) => parseLine(line, delimiter));
  return { headers, rows };
}

export type PortfolioField =
  | "symbol"
  | "name"
  | "quantity"
  | "avg_cost"
  | "buy_date"
  | "currency"
  | "sector"
  | "market";

export const PORTFOLIO_FIELDS: PortfolioField[] = [
  "symbol",
  "name",
  "quantity",
  "avg_cost",
  "buy_date",
  "currency",
  "sector",
  "market",
];

export const REQUIRED_FIELDS: PortfolioField[] = ["symbol", "quantity", "avg_cost"];

const SYNONYMS: Record<PortfolioField, string[]> = {
  symbol: ["symbol", "code", "ticker", "代码", "股票代码", "标的代码"],
  name: ["name", "名称", "股票名称", "标的名称"],
  quantity: ["quantity", "qty", "shares", "数量", "持仓数量", "股数"],
  avg_cost: ["avg_cost", "cost", "average_cost", "cost_price", "成本", "成本价", "均价"],
  buy_date: ["buy_date", "date", "买入日期", "日期"],
  currency: ["currency", "ccy", "币种"],
  sector: ["sector", "industry", "行业"],
  market: ["market", "市场"],
};

function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

/** 表头同义词自动映射：返回字段 → 列索引。同一列只映射一次。 */
export function autoMap(headers: string[]): Partial<Record<PortfolioField, number>> {
  const mapping: Partial<Record<PortfolioField, number>> = {};
  const used = new Set<number>();
  for (const field of PORTFOLIO_FIELDS) {
    const names = SYNONYMS[field].map(normalizeHeader);
    const index = headers.findIndex(
      (header, i) => !used.has(i) && names.includes(normalizeHeader(header)),
    );
    if (index >= 0) {
      mapping[field] = index;
      used.add(index);
    }
  }
  return mapping;
}

export function fieldSynonymHint(field: PortfolioField) {
  return SYNONYMS[field].slice(0, 4).join(" / ");
}

export interface RowIssue {
  field: string;
  reason: string;
  value?: string;
}

export interface ImportRow {
  /** 物理行号（表头为 1，数据从 2 开始）。 */
  line: number;
  status: "valid" | "warning" | "error";
  values: Partial<Record<PortfolioField, string>>;
  issues: RowIssue[];
}

export interface ImportPreview {
  rows: ImportRow[];
  summary: { valid: number; warning: number; error: number; merged: number };
}

function cell(values: Partial<Record<PortfolioField, string>>, field: PortfolioField) {
  return (values[field] ?? "").trim();
}

const CURRENCIES = new Set(["CNY", "USD", "HKD"]);

function inferCurrency(symbol: string) {
  if (/\.SS$|\.SZ$/i.test(symbol) || /^\d{6}$/.test(symbol)) return "CNY";
  if (/\.HK$/i.test(symbol)) return "HKD";
  return "USD";
}

/** 校验映射后的行；返回逐行问题与汇总（重复代码记入 merged）。 */
export function validateRows(
  table: CsvTable,
  mapping: Partial<Record<PortfolioField, number>>,
): ImportPreview {
  const rows: ImportRow[] = [];
  const seen = new Map<string, number>();
  let merged = 0;

  table.rows.forEach((cells, index) => {
    const line = index + 2;
    const values: Partial<Record<PortfolioField, string>> = {};
    for (const field of PORTFOLIO_FIELDS) {
      const column = mapping[field];
      if (column !== undefined) values[field] = cells[column] ?? "";
    }
    const issues: RowIssue[] = [];
    const symbol = cell(values, "symbol").toUpperCase();
    if (!symbol) issues.push({ field: "symbol", reason: "代码为空" });

    const quantityRaw = cell(values, "quantity");
    const quantity = Number(quantityRaw.replace(/,/g, ""));
    if (!quantityRaw) issues.push({ field: "quantity", reason: "数量为空" });
    else if (!Number.isFinite(quantity) || quantity <= 0)
      issues.push({ field: "quantity", reason: "数量必须为大于 0 的数字", value: quantityRaw });

    const costRaw = cell(values, "avg_cost");
    const cost = Number(costRaw.replace(/,/g, ""));
    if (!costRaw) issues.push({ field: "avg_cost", reason: "成本价为空" });
    else if (!Number.isFinite(cost) || cost < 0)
      issues.push({ field: "avg_cost", reason: "成本价不能为负数", value: costRaw });

    const currency = cell(values, "currency").toUpperCase();
    if (currency && !CURRENCIES.has(currency))
      issues.push({ field: "currency", reason: "不支持的币种（仅 CNY/USD/HKD）", value: currency });

    const warnings: RowIssue[] = [];
    if (symbol) {
      if (seen.has(symbol)) {
        merged += 1;
        warnings.push({
          field: "symbol",
          reason: `${symbol} 重复出现，导入时合并（数量求和、成本价按数量加权）`,
        });
      } else seen.set(symbol, line);
    }
    if (!cell(values, "sector"))
      warnings.push({ field: "sector", reason: "未填写行业，将计入未分类" });

    const status: ImportRow["status"] = issues.length
      ? "error"
      : warnings.length
        ? "warning"
        : "valid";
    rows.push({
      line,
      status,
      values: {
        ...values,
        symbol,
        currency: currency || (symbol ? inferCurrency(symbol) : ""),
      },
      issues: [...issues, ...warnings],
    });
  });

  return {
    rows,
    summary: {
      valid: rows.filter((row) => row.status !== "error").length,
      warning: rows.filter((row) => row.status === "warning").length,
      error: rows.filter((row) => row.status === "error").length,
      merged,
    },
  };
}

export const CANONICAL_HEADERS = [
  "symbol",
  "quantity",
  "cost_price",
  "buy_date",
  "name",
  "sector",
  "currency",
  "market",
] as const;

function escapeCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
}

/** 生成后端可接受的规范 CSV（仅包含非错误行）。 */
export function toCanonicalCsv(rows: ImportRow[]): string {
  const lines = [CANONICAL_HEADERS.join(",")];
  for (const row of rows) {
    if (row.status === "error") continue;
    const get = (field: PortfolioField) => cell(row.values, field);
    lines.push(
      [
        get("symbol"),
        get("quantity"),
        get("avg_cost"),
        get("buy_date") || today(),
        get("name"),
        get("sector"),
        get("currency"),
        get("market"),
      ]
        .map(escapeCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** 错误行 CSV（附原因列），供「下载错误行」使用。 */
export function toErrorCsv(rows: ImportRow[]): string {
  const lines = ["row,symbol,quantity,cost_price,reasons"];
  for (const row of rows) {
    if (row.status !== "error") continue;
    const reasons = row.issues
      .filter((issue) => issue.reason !== "" && !issue.reason.includes("未填写行业"))
      .map((issue) => `${issue.field}:${issue.reason}`)
      .join(" | ");
    lines.push(
      [
        String(row.line),
        cell(row.values, "symbol"),
        cell(row.values, "quantity"),
        cell(row.values, "avg_cost"),
        reasons,
      ]
        .map(escapeCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** 模板 CSV（前端提供下载，列名与规范 CSV 一致）。 */
export function templateCsv() {
  return [
    CANONICAL_HEADERS.join(","),
    "AAPL,10,180.50,2026-01-15,Apple Inc.,Technology,USD,US",
    "600519.SS,100,1700,2026-02-20,贵州茅台,食品饮料,CNY,CN",
    "",
  ].join("\n");
}

/** 预览中的「现有数量 → 导入后数量」（按标的合并同文件内多行后）。 */
export function projectedQuantities(rows: ImportRow[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "error") continue;
    const symbol = cell(row.values, "symbol");
    const quantity = Number(cell(row.values, "quantity").replace(/,/g, ""));
    if (!symbol || !Number.isFinite(quantity)) continue;
    totals.set(symbol, (totals.get(symbol) ?? 0) + quantity);
  }
  return totals;
}
