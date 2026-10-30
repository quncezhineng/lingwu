import type { Message, ToolCall } from "@copilotkit/react-native/headless";

export type ReadableToolCall = ToolCall;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Rich Threads has exposed tool calls in both the canonical AG-UI shape and
 * a compact `{ id, name, args }` shape. The compact shape is fine for display,
 * but submitting it back to the runtime fails its RunAgentInput validation.
 */
function normalizeToolCall(
  value: unknown,
): { call: ReadableToolCall; changed: boolean } | undefined {
  if (!isRecord(value)) return undefined;
  const fn = isRecord(value.function) ? value.function : undefined;
  const id = typeof value.id === "string" ? value.id : "";
  const name =
    typeof fn?.name === "string" ? fn.name : typeof value.name === "string" ? value.name : "";
  if (!id || !name) return undefined;
  const rawArguments = fn?.arguments ?? value.arguments ?? value.args;
  const args =
    typeof rawArguments === "string"
      ? rawArguments
      : rawArguments === undefined
        ? "{}"
        : JSON.stringify(rawArguments);
  if (
    value.type === "function" &&
    fn &&
    typeof fn.name === "string" &&
    typeof fn.arguments === "string"
  )
    return { call: value as ReadableToolCall, changed: false };
  return {
    call: {
      id,
      type: "function",
      function: { name, arguments: args },
    },
    changed: true,
  };
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
    const call = normalizeToolCall(value);
    if (call) normalized.push(call.call);
  }
  return normalized;
}

/**
 * Make persisted and replayed history safe to send back through the runtime.
 * Reuses unchanged messages so callers can avoid needless state updates.
 */
export function normalizeThreadMessages(messages: readonly Message[]): Message[] {
  let changed = false;
  const normalized = messages.map((message) => {
    if (message.role !== "assistant") return message;
    const toolCalls = (message as { toolCalls?: unknown }).toolCalls;
    if (!Array.isArray(toolCalls)) return message;

    const calls: ReadableToolCall[] = [];
    let messageChanged = false;
    for (const value of toolCalls) {
      const call = normalizeToolCall(value);
      if (!call) {
        messageChanged = true;
        continue;
      }
      calls.push(call.call);
      messageChanged ||= call.changed;
    }
    if (!messageChanged) return message;

    changed = true;
    if (calls.length) return { ...message, toolCalls: calls } as Message;
    const { toolCalls: _discarded, ...withoutToolCalls } = message as typeof message & {
      toolCalls: unknown[];
    };
    return withoutToolCalls as Message;
  });
  return changed ? normalized : (messages as Message[]);
}
