import type { AgentArtifact } from "../../../packages/domain/src/agent";
import { markdownExcerpt } from "./file-library";

export const WORKBENCH_INSIGHT_LIMIT = 3;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * 今日领悟只读取最近完成的研究产物，不补静态示例数据。
 * artifact.data 是开放结构，因此每个展示字段都需要逐项验证类型。
 */
export function latestWorkbenchInsights(
  artifacts: readonly AgentArtifact[],
  limit = WORKBENCH_INSIGHT_LIMIT,
): AgentArtifact[] {
  return [...artifacts]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(0, limit));
}

export interface WorkbenchInsightView {
  title: string;
  takeaway?: string;
  category?: string;
  symbolName?: string;
  code?: string;
  basis?: string;
  limits?: string;
  revisit?: string;
  plain?: string;
}

export function workbenchInsightView(artifact: AgentArtifact): WorkbenchInsightView {
  const data =
    artifact.data && typeof artifact.data === "object"
      ? (artifact.data as Record<string, unknown>)
      : {};
  const field = (...keys: string[]) => {
    for (const key of keys) {
      const value = text(data[key]);
      if (value) return value;
    }
    return undefined;
  };

  return {
    title: markdownExcerpt(artifact.summary || artifact.title, 180),
    takeaway: field("takeaway", "conclusion", "detail", "insight"),
    category: field("category"),
    symbolName: field("symbolName", "name"),
    code: field("code", "symbol"),
    basis: field("basis", "evidence", "evidenceSummary"),
    limits: field("limits", "caveats", "unknowns"),
    revisit: field("revisit", "reviewAt", "revisitAt"),
    plain: field("plain", "plainExplanation", "simpleExplanation"),
  };
}

/** Demo 的翻页在首尾停止，不在第一张和最后一张之间循环。 */
export function moveInsightIndex(current: number, direction: -1 | 1, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, current + direction));
}
