import type { Message, ToolCall } from "@copilotkit/react-native/headless";

export type ReadableToolCall = ToolCall;

export const HISTORY_PAGE_SIZE = 30;
export interface ThreadHistoryPage {
  messages: Message[];
  hasMore: boolean;
  before: string | null;
}

export function threadHistoryPagePath(threadId?: string, before?: string | null) {
  const path = threadId
    ? `/api/conversation/threads/${encodeURIComponent(threadId)}/messages`
    : "/api/conversation";
  return `${path}?limit=${HISTORY_PAGE_SIZE}${before ? `&before=${encodeURIComponent(before)}` : ""}`;
}

/** Loading full model context must not expand the transcript's visible window. */
export function visibleHistoryWindow(messages: readonly Message[], firstId: string | null) {
  const start = firstId === null ? 0 : messages.findIndex((message) => message.id === firstId);
  return start > 0 ? messages.slice(start) : messages;
}

export function prependHistoryPage(
  earlier: readonly Message[],
  current: readonly Message[],
): Message[] {
  // Full model context may already contain this page. Keep its chronological
  // order instead of moving that page ahead of even older context.
  if (earlier.length && current.some((message) => message.id === earlier[0].id)) {
    const byId = new Map(earlier.map((message) => [message.id, message]));
    return current.map((message) => byId.get(message.id) ?? message);
  }
  return mergePersistedThreadMessages(earlier, current);
}

/** Rich Threads store the authoritative transcript separately from live replay. */
export function threadHistoryPath(threadId: string) {
  return `/api/conversation/threads/${encodeURIComponent(threadId)}/context`;
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
  return dropMisplacedToolResults(changed ? normalized : messages);
}

/**
 * A tool result has to sit with the assistant call that produced it. Results that
 * were replayed after a later user message make the model reject the whole turn.
 */
function dropMisplacedToolResults(messages: readonly Message[]): Message[] {
  let active = new Set<string>();
  let changed = false;
  const kept: Message[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      const id =
        "toolCallId" in message && typeof message.toolCallId === "string" ? message.toolCallId : "";
      if (id && active.has(id)) {
        kept.push(message);
        continue;
      }
      changed = true;
      continue;
    }
    if (message.role === "assistant") {
      const calls =
        "toolCalls" in message && Array.isArray(message.toolCalls) ? message.toolCalls : [];
      active = new Set(
        calls
          .map((call) =>
            call && typeof call === "object" && "id" in call && typeof call.id === "string"
              ? call.id
              : "",
          )
          .filter((id) => id.length > 0),
      );
    } else active = new Set();
    kept.push(message);
  }
  return changed ? kept : (messages as Message[]);
}
