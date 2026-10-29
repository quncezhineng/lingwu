import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentArtifact } from "../../../packages/domain/src/agent.ts";
import type { InvestmentNote } from "../src/notes.ts";
import {
  latestInsightForSymbol,
  latestNoteForSymbol,
  symbolCodesMatch,
} from "../src/watchlist-symbol-view.ts";

function note(id: string, symbolCode: string, createdAt: string): InvestmentNote {
  return {
    id,
    symbolCode,
    type: "RESEARCH",
    content: `Note ${id}`,
    createdAt,
    updatedAt: createdAt,
  };
}

function artifact(id: string, createdAt: string, data: Record<string, unknown>): AgentArtifact {
  return {
    id,
    taskId: `task-${id}`,
    kind: "research_report",
    title: `Report ${id}`,
    summary: `Summary ${id}`,
    data,
    createdAt,
  };
}

test("watchlist summary uses the newest note for the exact normalized symbol", () => {
  const notes = [
    note("old", "600519.SS", "2026-10-20T08:00:00.000Z"),
    note("new", "600519", "2026-10-29T08:00:00.000Z"),
    note("other", "AAPL", "2026-10-30T08:00:00.000Z"),
  ];

  assert.equal(latestNoteForSymbol(notes, "600519.SS")?.id, "new");
});

test("watchlist matching tolerates a missing A-share exchange suffix only", () => {
  assert.equal(symbolCodesMatch("600519.SS", "600519"), true);
  assert.equal(symbolCodesMatch("300750.SZ", "300750"), true);
  assert.equal(symbolCodesMatch("AAPL", "600519"), false);
});

test("watchlist summary matches insights by normalized code before name", () => {
  const artifacts = [
    artifact("old", "2026-10-20T08:00:00.000Z", { code: "600519.SS" }),
    artifact("new", "2026-10-29T08:00:00.000Z", { code: "600519" }),
    artifact("name-fallback", "2026-10-30T08:00:00.000Z", { symbolName: "贵州茅台" }),
    artifact("other", "2026-11-01T08:00:00.000Z", { code: "AAPL" }),
  ];

  assert.equal(
    latestInsightForSymbol(artifacts, { code: "600519.SS", name: "贵州茅台" })?.id,
    "name-fallback",
  );
});

test("watchlist summary does not attach unrelated name-only insights", () => {
  const artifacts = [artifact("other", "2026-10-29T08:00:00.000Z", { symbolName: "Apple Inc." })];

  assert.equal(
    latestInsightForSymbol(artifacts, { code: "600519.SS", name: "贵州茅台" }),
    undefined,
  );
});
