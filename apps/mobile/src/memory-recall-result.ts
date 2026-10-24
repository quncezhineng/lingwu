import { z } from "zod";

const memorySchema = z.object({
  id: z.string(),
  text: z.string(),
  source: z.string().default(""),
  createdAt: z.string(),
});

const recallResultSchema = z.object({
  query: z.string().default(""),
  memories: z.array(memorySchema).default([]),
});

export type RecalledMemory = z.infer<typeof memorySchema>;
export type MemoryRecallResult = z.infer<typeof recallResultSchema>;

const EMPTY: MemoryRecallResult = { query: "", memories: [] };

/** Parses a recall_memory result, including JSON strings restored from thread history. */
export function parseMemoryRecallResult(value: unknown): MemoryRecallResult | undefined {
  let parsed = value;
  if (typeof parsed === "string") {
    const text = parsed.trim();
    if (!text) return EMPTY;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const result = recallResultSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}
