/**
 * 深度研究（F4）数据层。
 *
 * 后端 B5 契约：
 * - POST /api/research { symbol } → 201 AgentTask（kind=research，4 步 plan）
 * - GET  /api/agent/tasks/:id → { task, events, artifacts, files, browsers }
 * - GET  /api/research/:symbol → { report: ResearchReport | null }
 *
 * 报告字段为 snake_case；这里统一转换为驼峰视图模型，并对缺失字段做容错。
 */
import type { AgentArtifact, AgentTask, RunEvent } from "../../../packages/domain/src/agent";
import type { LingWuApi } from "./api";

export type ResearchMethod = "range_heuristic" | "price_band_heuristic";

export interface ResearchNews {
  title: string;
  url: string;
  excerpt?: string;
  publishedAt?: string;
}

export interface ResearchPeer {
  symbol: string;
  name?: string;
  price?: number;
  changePercent?: number;
  error?: string;
}

export interface ResearchValuation {
  method: ResearchMethod;
  current: number;
  low: number;
  mid: number;
  high: number;
  assumptions: string[];
  caveat: string;
}

export interface ResearchReport {
  id: string;
  symbolCode: string;
  title: string;
  companyOverview: string;
  financials: Record<string, unknown>;
  /** financials.unavailable：缺失字段名列表。 */
  unavailable: string[];
  news: ResearchNews[];
  peers: ResearchPeer[];
  valuation?: ResearchValuation;
  risks: string[];
  generatedAt: string;
}

export interface ResearchProgress {
  task: AgentTask;
  events: RunEvent[];
}

export const RESEARCH_TERMINAL: ReadonlyArray<AgentTask["status"]> = [
  "succeeded",
  "failed",
  "paused",
];

export function isResearchDone(task: AgentTask) {
  return RESEARCH_TERMINAL.includes(task.status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function strList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseValuation(value: unknown): ResearchValuation | undefined {
  if (!isRecord(value)) return undefined;
  const current = num(value.current);
  const low = num(value.low);
  const mid = num(value.mid);
  const high = num(value.high);
  if (current === undefined || low === undefined || mid === undefined || high === undefined)
    return undefined;
  return {
    method: value.method === "price_band_heuristic" ? "price_band_heuristic" : "range_heuristic",
    current,
    low,
    mid,
    high,
    assumptions: strList(value.assumptions),
    caveat: str(value.caveat) ?? "",
  };
}

export function parseResearchReport(payload: unknown): ResearchReport | undefined {
  if (!isRecord(payload)) return undefined;
  const record = isRecord(payload.report) ? payload.report : payload;
  if (!isRecord(record.sections)) return undefined;
  const sections = record.sections;
  const financials = isRecord(sections.financials) ? sections.financials : {};
  const news = Array.isArray(sections.news)
    ? sections.news.flatMap((item) =>
        isRecord(item) && typeof item.title === "string" && typeof item.url === "string"
          ? [
              {
                title: item.title,
                url: item.url,
                excerpt: str(item.excerpt),
                publishedAt: str(item.publishedAt) ?? str(item.published_at),
              },
            ]
          : [],
      )
    : [];
  const peers = Array.isArray(sections.peer_comparison)
    ? sections.peer_comparison.flatMap((item) => {
        if (!isRecord(item) || typeof item.symbol !== "string") return [];
        return [
          {
            symbol: item.symbol,
            name: str(item.name),
            price: num(item.price),
            changePercent: num(item.changePercent),
            error: str(item.error),
          },
        ];
      })
    : [];
  const symbolCode = str(record.symbol_code) ?? str(record.symbolCode) ?? "";
  return {
    id: str(record.id) ?? `research-${symbolCode}`,
    symbolCode,
    title: str(record.title) ?? symbolCode,
    companyOverview: str(sections.company_overview) ?? "",
    financials,
    unavailable: strList(financials.unavailable),
    news,
    peers,
    valuation: parseValuation(sections.valuation),
    risks: strList(sections.risks),
    generatedAt: str(record.generated_at) ?? str(record.generatedAt) ?? new Date().toISOString(),
  };
}

/** POST /api/research：创建任务并立即返回（后台由耐久任务引擎执行）。 */
export function startResearch(api: LingWuApi, symbol: string): Promise<AgentTask> {
  return api.request<AgentTask>("/api/research", { symbol });
}

export function fetchResearchTask(
  api: LingWuApi,
  taskId: string,
): Promise<{ task: AgentTask; events: RunEvent[]; artifacts: AgentArtifact[] }> {
  return api.request(`/api/agent/tasks/${encodeURIComponent(taskId)}`);
}

/** GET /api/research/:symbol：最新一份已生成的研报（可能为 null）。 */
export async function fetchLatestReport(
  api: LingWuApi,
  symbol: string,
): Promise<ResearchReport | undefined> {
  const payload = await api.request<unknown>(`/api/research/${encodeURIComponent(symbol)}`);
  return parseResearchReport(payload);
}

/* ------------------------------------------------------------------ *
 * PDF 导出：生成可打印的自包含 HTML
 * ------------------------------------------------------------------ */

export interface ReportLabels {
  disclaimer: string;
  sources: string;
  overview: string;
  financials: string;
  news: string;
  peers: string;
  valuation: string;
  risks: string;
  unavailable: string;
  heuristic: string;
  current: string;
  low: string;
  mid: string;
  high: string;
  generatedAt: string;
  noNews: string;
  noPeers: string;
  noValuation: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value: number | undefined) {
  return value === undefined
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

const FINANCIAL_LABELS: Record<string, string> = {
  price: "Price",
  previousClose: "Previous close",
  change: "Change",
  changePercent: "Change %",
  dayHigh: "Day high",
  dayLow: "Day low",
  volume: "Volume",
  fiftyTwoWeekHigh: "52w high",
  fiftyTwoWeekLow: "52w low",
  currency: "Currency",
  asOf: "As of",
  source: "Source",
};

function financialRows(report: ResearchReport) {
  return Object.entries(report.financials)
    .filter(([key, value]) => key !== "unavailable" && value !== null && value !== undefined)
    .map(([key, value]) => ({
      key,
      label: FINANCIAL_LABELS[key] ?? key,
      value:
        typeof value === "number"
          ? formatNumber(value)
          : typeof value === "string"
            ? value
            : JSON.stringify(value),
    }));
}

/** 生成打印/分享用的自包含 HTML（含免责声明、数据来源与缺失字段说明）。 */
export function researchReportDocument(report: ResearchReport, labels: ReportLabels): string {
  const rows = financialRows(report)
    .map((row) => `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`)
    .join("");
  const news = report.news.length
    ? `<ul>${report.news
        .map(
          (item) =>
            `<li><a href="${escapeHtml(item.url)}" rel="noreferrer">${escapeHtml(item.title)}</a>${
              item.publishedAt ? `<small> · ${escapeHtml(item.publishedAt)}</small>` : ""
            }</li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">${escapeHtml(labels.noNews)}</p>`;
  const peers = report.peers.length
    ? `<table><thead><tr><th>Symbol</th><th>Name</th><th>Price</th><th>Change %</th></tr></thead><tbody>${report.peers
        .map(
          (peer) =>
            `<tr><td>${escapeHtml(peer.symbol)}</td><td>${escapeHtml(peer.name ?? "—")}</td><td>${escapeHtml(
              formatNumber(peer.price),
            )}</td><td>${escapeHtml(peer.changePercent === undefined ? (peer.error ?? "—") : `${peer.changePercent.toFixed(2)}%`)}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="muted">${escapeHtml(labels.noPeers)}</p>`;
  const valuation = report.valuation
    ? `<p class="badge">${escapeHtml(labels.heuristic)}</p>
       <table><tbody>
         <tr><th>${escapeHtml(labels.current)}</th><td>${escapeHtml(formatNumber(report.valuation.current))}</td></tr>
         <tr><th>${escapeHtml(labels.low)}</th><td>${escapeHtml(formatNumber(report.valuation.low))}</td></tr>
         <tr><th>${escapeHtml(labels.mid)}</th><td>${escapeHtml(formatNumber(report.valuation.mid))}</td></tr>
         <tr><th>${escapeHtml(labels.high)}</th><td>${escapeHtml(formatNumber(report.valuation.high))}</td></tr>
       </tbody></table>
       ${
         report.valuation.assumptions.length
           ? `<ul>${report.valuation.assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
           : ""
       }
       ${report.valuation.caveat ? `<p class="muted">${escapeHtml(report.valuation.caveat)}</p>` : ""}`
    : `<p class="muted">${escapeHtml(labels.noValuation)}</p>`;
  const risks = report.risks.length
    ? `<ul>${report.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  const unavailable = report.unavailable.length
    ? `<p class="muted">${escapeHtml(labels.unavailable)}: ${escapeHtml(report.unavailable.join(", "))}</p>`
    : "";
  const sources = report.news.map(
    (item) =>
      `<li><a href="${escapeHtml(item.url)}" rel="noreferrer">${escapeHtml(item.url)}</a></li>`,
  );

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(report.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f5f7; color: #0e1115; font: 14px/1.7 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  main { width: min(860px, calc(100% - 32px)); margin: 24px auto 48px; padding: 40px 44px; background: #fff; border: 1px solid #e7eaef; border-radius: 14px; }
  h1 { margin: 0 0 6px; font-size: 26px; letter-spacing: -0.4px; }
  h2 { margin: 30px 0 10px; font-size: 17px; }
  .meta { color: #737373; font-size: 12px; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 13px; }
  th, td { border: 1px solid #e7eaef; padding: 8px 10px; text-align: left; }
  th { background: #f5f6f8; font-weight: 600; width: 34%; }
  ul { margin: 6px 0 12px; padding-left: 22px; }
  .badge { display: inline-block; margin: 4px 0 10px; padding: 4px 10px; border-radius: 999px; background: rgba(226,121,0,.12); color: #994f00; font-size: 12px; font-weight: 600; }
  .muted { color: #737373; font-size: 12px; }
  footer { margin-top: 30px; padding-top: 14px; border-top: 1px solid #e7eaef; }
  a { color: #4b3fe3; word-break: break-all; }
  @media print {
    body { background: #fff; }
    main { width: 100%; margin: 0; padding: 0; border: 0; border-radius: 0; }
  }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(report.title)}</h1>
  <p class="meta">${escapeHtml(report.symbolCode)} · ${escapeHtml(labels.generatedAt)} ${escapeHtml(
    new Date(report.generatedAt).toLocaleString("zh-CN"),
  )}</p>

  <h2>${escapeHtml(labels.overview)}</h2>
  <p>${escapeHtml(report.companyOverview)}</p>

  <h2>${escapeHtml(labels.financials)}</h2>
  <table><tbody>${rows}</tbody></table>
  ${unavailable}

  <h2>${escapeHtml(labels.news)}</h2>
  ${news}

  <h2>${escapeHtml(labels.peers)}</h2>
  ${peers}

  <h2>${escapeHtml(labels.valuation)}</h2>
  ${valuation}

  <h2>${escapeHtml(labels.risks)}</h2>
  ${risks}

  <footer>
    <h2>${escapeHtml(labels.sources)}</h2>
    ${sources.length ? `<ul>${sources.join("")}</ul>` : `<p class="muted">${escapeHtml(labels.noNews)}</p>`}
    <p class="muted"><strong>${escapeHtml(labels.disclaimer)}</strong></p>
  </footer>
</main>
</body>
</html>`;
}
