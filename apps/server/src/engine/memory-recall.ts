import type { AgentMemory } from "../../../../packages/domain/src/agent.ts";

const TERM = /[\p{L}\p{N}_-]+/gu;

function terms(query: string): string[] {
  return [...new Set(query.toLocaleLowerCase().match(TERM) ?? [])];
}

function score(text: string, query: string, words: readonly string[]): number {
  const body = text.toLocaleLowerCase();
  let value = body.includes(query.toLocaleLowerCase()) ? 6 : 0;
  for (const word of words) {
    if (body.includes(word)) value += word.length >= 3 ? 2 : 1;
  }
  return value;
}

/** Keyword recall over the owner's saved memories, ordered by relevance then recency. */
export function recallMemories(
  memories: readonly AgentMemory[],
  query: string,
  limit = 10,
): AgentMemory[] {
  const words = terms(query.trim());
  if (!words.length) return [];
  const count = Math.max(1, Math.min(20, Math.trunc(limit)));
  return memories
    .map((memory) => ({ memory, score: score(memory.text, query.trim(), words) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.memory.createdAt.localeCompare(a.memory.createdAt))
    .slice(0, count)
    .map((entry) => entry.memory);
}
