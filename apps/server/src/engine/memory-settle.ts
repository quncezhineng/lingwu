import type { MemoryCategory } from "../../../../packages/domain/src/agent.ts";
import { MEMORY_CATEGORIES } from "../../../../packages/domain/src/agent.ts";

/**
 * 对话自动沉淀记忆的共享组件。
 *
 * 「频道群聊」每轮结束自动把结论沉淀进频道记忆、「单聊（Agent 对话）」每轮结束自动把
 * 值得长期复用的内容沉淀进 Agent 记忆，这两条路径共用同一套整理产出：模型输出 JSON 候选
 * → 取第一段 `[...]` 解析 → 按固定分类词表校正 category → 上限条数 → 归一化去重。
 *
 * 常量与纯函数放在这里，避免 conversation.ts 反向依赖 channel-chat.ts 形成循环导入
 * （channel-chat 已在引用 conversation 的 formatQuoteToolResult）。
 */

/** 一轮最多沉淀几条记忆，避免淹掉记忆板块。 */
export const MEMORY_SETTLE_LIMIT = 3;

/** 用户消息 + 回复太短时，这一轮不值得占用记忆位（寒暄、单字确认）。 */
export const MEMORY_SETTLE_MIN_CHARS = 80;

/** 送入整理提示词的对话正文上限，避免长报告把上下文撑爆。 */
export const MEMORY_SETTLE_TRANSCRIPT_LIMIT = 12_000;

/** 记忆去重用的归一化文本：忽略大小写、空白、标点与符号。 */
export function normalizeMemoryText(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

/**
 * 从模型输出里取出记忆候选。
 *
 * 模型偶尔会带上解释或 ```json 包裹，这里只认第一段 `[...]`，并用固定的分类词表校正
 * category，越界时回退到「关注领域」，保证写进库的记忆分类始终合法。
 */
export function parseMemoryCandidates(raw: string): { text: string; category: MemoryCategory }[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const candidates: { text: string; category: MemoryCategory }[] = [];
  for (const item of parsed) {
    const source =
      typeof item === "string"
        ? { text: item, category: undefined }
        : item && typeof item === "object"
          ? (item as { text?: unknown; category?: unknown })
          : undefined;
    if (!source) continue;
    const text = typeof source.text === "string" ? source.text.trim().slice(0, 400) : "";
    if (!text) continue;
    const category = MEMORY_CATEGORIES.includes(source.category as MemoryCategory)
      ? (source.category as MemoryCategory)
      : "关注领域";
    candidates.push({ text, category });
    if (candidates.length >= MEMORY_SETTLE_LIMIT) break;
  }
  return candidates;
}
