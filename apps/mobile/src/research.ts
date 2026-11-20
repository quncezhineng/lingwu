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

/* 报告 HTML 页面的渲染放在 report-page.ts（agent-html 版式），这里只做数据层。 */
export { type ReportLabels, researchReportDocument } from "./report-page.ts";
