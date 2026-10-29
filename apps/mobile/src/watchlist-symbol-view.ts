import type { AgentArtifact } from "../../../packages/domain/src/agent";
import { workbenchInsightView } from "./insight-view";
import { normalizeCode, type SymbolMeta } from "./market";
import type { InvestmentNote } from "./notes";

/**
 * 自选与研究数据可能一边存 `600519.SS`、另一边只存 `600519`。
 * 仅在双方都是六位 A 股代码时允许忽略交易所后缀，避免误合并同名数字代码。
 */
export function symbolCodesMatch(left: string, right: string): boolean {
  const a = normalizeCode(left);
  const b = normalizeCode(right);
  if (a === b) return true;
  const aShare = /^(\d{6})(?:\.(SS|SZ))?$/;
  const bShare = /^(\d{6})(?:\.(SS|SZ))?$/;
  const aMatch = a.match(aShare);
  const bMatch = b.match(bShare);
  if (!aMatch || !bMatch || aMatch[1] !== bMatch[1]) return false;
  return !aMatch[2] || !bMatch[2] || aMatch[2] === bMatch[2];
}

/** 自选摘要只展示与该标的直接关联的真实笔记。 */
export function latestNoteForSymbol(
  notes: readonly InvestmentNote[],
  symbolCode: string,
): InvestmentNote | undefined {
  return notes
    .filter((note) => symbolCodesMatch(note.symbolCode, symbolCode))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/**
 * 将最近研究产物与标的信息做保守匹配。
 * 优先使用结构化代码，只有缺失代码时才回退到名称完全一致。
 */
export function latestInsightForSymbol(
  artifacts: readonly AgentArtifact[],
  symbol: Pick<SymbolMeta, "code" | "name">,
): AgentArtifact | undefined {
  const targetName = symbol.name.trim();
  return [...artifacts]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find((artifact) => {
      const view = workbenchInsightView(artifact);
      if (view.code) return symbolCodesMatch(view.code, symbol.code);
      return !!targetName && view.symbolName?.trim() === targetName;
    });
}
