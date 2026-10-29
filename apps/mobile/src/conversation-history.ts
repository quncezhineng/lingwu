import type { Message } from "@copilotkit/react-native/headless";

export type ReadableToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/** Rich Threads store the authoritative transcript separately from live replay. */
export function threadHistoryPath(threadId: string) {
  return `/api/copilotkit/threads/${encodeURIComponent(threadId)}/messages`;
}

/**
 * Prefer the persisted transcript, then append any messages that only exist in
 * the live runtime. Keeping persisted records first also prevents a partial
 * replayed message from replacing its complete saved counterpart.
 */
export function mergePersistedThreadMessages(
  persisted: readonly Message[],
  live: readonly Message[],
): Message[] {
  const seen = new Set<string>();
  const merged: Message[] = [];
  for (const message of [...persisted, ...live]) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    merged.push(message);
  }
  return merged;
}

/**
 * Rich Threads can contain older or partially persisted tool-call records.
 * Normalize both SDK shapes and discard incomplete records before rendering.
 */
export function readableToolCalls(message: unknown): ReadableToolCall[] {
  if (!message || typeof message !== "object") return [];
  const toolCalls = (message as { toolCalls?: unknown }).toolCalls;
  if (!Array.isArray(toolCalls)) return [];

  const normalized: ReadableToolCall[] = [];
  for (const value of toolCalls) {
    if (!value || typeof value !== "object") continue;
    const call = value as Record<string, unknown>;
    const fn =
      call.function && typeof call.function === "object"
        ? (call.function as Record<string, unknown>)
        : undefined;
    const id = typeof call.id === "string" ? call.id : "";
    const name =
      typeof fn?.name === "string" ? fn.name : typeof call.name === "string" ? call.name : "";
    if (!id || !name) continue;
    const rawArguments = fn?.arguments ?? call.arguments;
    const args =
      typeof rawArguments === "string"
        ? rawArguments
        : rawArguments === undefined
          ? "{}"
          : JSON.stringify(rawArguments);
    normalized.push({
      id,
      type: "function",
      function: { name, arguments: args },
    });
  }
  return normalized;
}
