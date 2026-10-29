import type { AgentArtifact } from "../../../packages/domain/src/agent";
import { markdownExcerpt } from "./file-library";
import type { BriefingSymbolUpdate, IndexQuote } from "./market";

export const BRIEFING_INSIGHT_LIMIT = 3;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** The briefing uses the newest research output as its reading clues. */
export function latestBriefingInsights(
  artifacts: readonly AgentArtifact[],
  limit = BRIEFING_INSIGHT_LIMIT,
): AgentArtifact[] {
  return [...artifacts]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(0, limit));
}

/** Keep the lead deterministic and avoid rendering an empty paragraph. */
export function briefingLead(summary: readonly string[]): string {
  return summary.map((item) => item.trim()).find(Boolean) ?? "";
}

export function briefingIndices(
  rows: readonly IndexQuote[],
  limit = BRIEFING_INSIGHT_LIMIT,
): IndexQuote[] {
  return rows.slice(0, Math.max(0, limit));
}

export function briefingRelationStats(rows: readonly BriefingSymbolUpdate[]): {
  total: number;
  moved: number;
} {
  return {
    total: rows.length,
    moved: rows.filter((row) => !!row.alert).length,
  };
}

export interface BriefingInsightView {
  title: string;
  category?: string;
  symbolName?: string;
  code?: string;
}

/**
 * Agent artifacts are structured research outputs, not the Demo's static insight
 * cards. Read only fields the server actually supplied and fall back to the
 * artifact title when no summary is available.
 */
export function briefingInsightView(artifact: AgentArtifact): BriefingInsightView {
  const data =
    artifact.data && typeof artifact.data === "object"
      ? (artifact.data as Record<string, unknown>)
      : {};
  return {
    title: markdownExcerpt(artifact.summary || artifact.title, 180),
    category: text(data.category),
    symbolName: text(data.symbolName) ?? text(data.name),
    code: text(data.code) ?? text(data.symbol),
  };
}
