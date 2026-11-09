const QUEUED_START = /^(?:已排队|任务已排队|已把任务交给后台)/;
const TASK_TOKEN = /任务号\s*([0-9a-f]{6,})/i;

export type QueuedBrief = { headline: string; body: string };

/** 认出模型交办后写下的「已排队」说明，拆成标题和可展开正文。 */
export function queuedBrief(text: string): QueuedBrief | null {
  const trimmed = text.trim();
  if (!QUEUED_START.test(trimmed)) return null;
  const [first, ...rest] = trimmed.split(/\n+/);
  const headline = (first ?? "").replace(/\s+/g, " ").trim();
  if (!headline) return null;
  return { headline, body: rest.join("\n").trim() };
}

type LooseCall = { id?: string; name?: string; function?: { name?: string } };

type LooseMessage = {
  role: string;
  content?: unknown;
  toolCallId?: string;
  toolCalls?: readonly LooseCall[];
};

let published: Map<string, QueuedBrief> = new Map();
const listeners = new Set<() => void>();

/** 对话流解析出的说明。弹窗只读这份结果，不再重复注册同一个 Agent。 */
export function publishQueuedBriefs(briefs: Map<string, QueuedBrief>) {
  published = briefs;
  for (const listener of listeners) listener();
}

export function subscribeQueuedBriefs(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function queuedBriefSnapshot(): Map<string, QueuedBrief> {
  return published;
}

function contentText(message: LooseMessage): string {
  return typeof message.content === "string" ? message.content : "";
}

function taskIdFromResult(result: unknown): string | undefined {
  let value = result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["id", "taskId"]) {
    const id = record[key];
    if (typeof id === "string" && id) return id;
  }
  return undefined;
}

function handoffTaskIds(message: LooseMessage, messages: readonly LooseMessage[]): string[] {
  const ids: string[] = [];
  for (const call of message.toolCalls ?? []) {
    const name = call.function?.name ?? call.name;
    if (name !== "delegate_task" && name !== "research_stock") continue;
    const toolMessage = messages.find(
      (candidate) => candidate.role === "tool" && candidate.toolCallId === call.id,
    );
    const id = taskIdFromResult(toolMessage?.content);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** 把每段「已排队」说明对上它交代的任务。任务号只写了前几位时按前缀匹配。 */
export function briefsForTasks(messages: readonly LooseMessage[]): Map<string, QueuedBrief> {
  const found = new Map<string, QueuedBrief>();
  let pending: string[] = [];
  const assign = (brief: QueuedBrief) => {
    const token = TASK_TOKEN.exec(brief.headline)?.[1]?.toLowerCase();
    const matched = token ? pending.filter((id) => id.toLowerCase().startsWith(token)) : pending;
    for (const id of matched.length ? matched : pending) found.set(id, brief);
    pending = [];
  };
  for (const message of messages) {
    if (message.role === "user") {
      pending = [];
      continue;
    }
    if (message.role !== "assistant") continue;
    pending.push(...handoffTaskIds(message, messages).filter((id) => !pending.includes(id)));
    const brief = queuedBrief(contentText(message));
    if (brief) assign(brief);
  }
  return found;
}
