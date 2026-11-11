import { type BaseEvent, EventType } from "@ag-ui/core";
import { concatMap, from, map, type Observable } from "rxjs";
import type { Store } from "../db.ts";
import { backgroundFailure } from "../log.ts";

/** One AG-UI event as it is stored and replayed for a thread. */
export interface StoredStreamEvent {
  seq: number;
  ts: string;
  runId: string;
  event: BaseEvent;
}

/** The envelope placed in an SSE `data:` line. The AG-UI event stays nested so the
 *  client can apply it with the same semantics as the direct runtime transport. */
export interface StreamEnvelope extends StoredStreamEvent {
  threadId: string;
}

export interface StreamRun {
  runId: string;
  status: "running" | "finished" | "error";
  startedAt: string;
  updatedAt: string;
}

export interface StreamStatus {
  threadId: string;
  active: boolean;
  lastEventId: number;
  oldestEventId: number;
  eventCount: number;
  run: StreamRun | null;
}

export interface StreamAttachHandlers {
  /** Called once, synchronously, before any replay event. */
  onReady(status: StreamStatus, reset: boolean, replayFrom: number): void;
  /** Called for each replayed or live event, in sequence order. */
  onEvent(envelope: StreamEnvelope): void;
}

export interface StreamAttachment {
  unsubscribe(): void;
}

interface PersistedStream {
  id: string;
  seq: number;
  oldestSeq: number;
  events: StoredStreamEvent[];
  run: StreamRun | null;
  updatedAt: string;
  /** 每条消息第一次出现在流里的时间（messageId → ISO），见 `ThreadStream.times`。 */
  times?: Record<string, string>;
}

interface ThreadStream {
  owner: string;
  threadId: string;
  events: StoredStreamEvent[];
  bytes: number;
  lastSeq: number;
  run: StreamRun | null;
  /**
   * 每条消息第一次出现的时间（messageId → ISO）。
   *
   * 对话正文由 CopilotKit 的 Rich Threads 持久化，消息本身不带时间戳，所以每个
   * 回复下面要显示的时间只能由本服务在转发流事件时记下来。这张小表独立于
   * `events` 存在：事件窗口会滚动裁剪，时间表仍能把老消息的时间保留下来。
   */
  times: Record<string, string>;
  subscribers: Set<(envelope: StreamEnvelope) => void>;
  loaded: boolean;
  loading?: Promise<void>;
  flushTimer?: ReturnType<typeof setTimeout>;
  writing?: Promise<void>;
  dirty: boolean;
  closed: boolean;
}

const DEFAULT_MAX_EVENTS = 2000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_FLUSH_MS = 400;
const STALE_RUN_MS = 10 * 60 * 1000;
/** 时间表只服务于「回复下面的时间」，保留最近的这些消息即可。 */
const MESSAGE_TIMES_LIMIT = 500;

function iso() {
  return new Date().toISOString();
}

/** 时间表来自存储，可能被旧版本或人工编辑写坏，只接受 ISO 字符串。 */
function normalizeTimes(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const times: Record<string, string> = {};
  for (const [id, at] of Object.entries(value as Record<string, unknown>)) {
    if (!id || typeof at !== "string") continue;
    if (!Number.isFinite(Date.parse(at))) continue;
    times[id] = at;
  }
  return times;
}

/**
 * 给旧数据补时间表。
 *
 * 时间表是后加的字段：更早的线程只存了事件。事件本来就带着 `ts` 和 `messageId`，
 * 按顺序取每条消息的第一次出现即可——这是真实时间，前提是它的事件还没被裁剪掉。
 */
function deriveTimes(
  events: readonly StoredStreamEvent[],
  stored: Record<string, string>,
): Record<string, string> {
  const times = { ...stored };
  for (const item of events) {
    const messageId = (item.event as { messageId?: unknown }).messageId;
    if (typeof messageId !== "string" || !messageId || times[messageId]) continue;
    times[messageId] = item.ts;
  }
  return trimTimes(times);
}

/** 只保留最近的消息时间，靠对象插入顺序淘汰最旧的一条。 */
function trimTimes(times: Record<string, string>): Record<string, string> {
  const ids = Object.keys(times);
  if (ids.length <= MESSAGE_TIMES_LIMIT) return times;
  for (const stale of ids.slice(0, ids.length - MESSAGE_TIMES_LIMIT)) delete times[stale];
  return times;
}

function eventSize(event: StoredStreamEvent) {
  return Buffer.byteLength(JSON.stringify(event), "utf8");
}

/**
 * Rebuild the retained tail from persisted input.
 *
 * A crash can leave a store object that is a few hundred milliseconds behind the
 * process. It can also be hand-edited or written by an older build. Replay must
 * never trust array order, duplicate sequence numbers, or a stale `seq` field:
 * doing so would make the client treat a real suffix as a sequence hole (or skip
 * events entirely). Keep the last copy of a duplicated id, because that write is
 * the newest version of that event.
 */
function normalizeEvents(value: unknown): StoredStreamEvent[] {
  if (!Array.isArray(value)) return [];
  const bySeq = new Map<number, StoredStreamEvent>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Partial<StoredStreamEvent>;
    if (!Number.isSafeInteger(item.seq) || (item.seq as number) <= 0) continue;
    if (!item.event || typeof item.event !== "object" || typeof item.event.type !== "string")
      continue;
    const seq = item.seq as number;
    bySeq.set(seq, {
      seq,
      ts: typeof item.ts === "string" ? item.ts : iso(),
      runId: typeof item.runId === "string" ? item.runId : "",
      event: item.event,
    });
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/**
 * Keep the newest contiguous suffix. A replay that contains an internal hole can
 * never satisfy the client's sequence gate: it would reconnect forever without
 * making progress. The events before the last hole are unrecoverable anyway, so
 * discard them and expose the newest runnable suffix instead.
 */
function contiguousTail(events: StoredStreamEvent[]): StoredStreamEvent[] {
  let start = 0;
  for (let index = 1; index < events.length; index += 1) {
    if (events[index].seq !== events[index - 1].seq + 1) start = index;
  }
  return events.slice(start);
}

function isRunFinished(type: BaseEvent["type"]) {
  return type === EventType.RUN_FINISHED || type === EventType.RUN_ERROR;
}

/**
 * Application-owned conversation stream ledger.
 *
 * The CopilotKit runtime still owns model execution and thread persistence, but every
 * local AG-UI event is mirrored here before it reaches either transport. That gives the
 * app a direct, replayable SSE channel that survives a dropped connection without
 * making a second model call.
 *
 * Scope: fan-out is process-local, matching the current single-instance Hono server.
 * The retained window is persisted to the existing Store so a restart can replay the
 * recent tail; multi-instance deployments need a shared pub/sub layer (Redis/Postgres
 * LISTEN/NOTIFY) in front of `publish`.
 */
export class ConversationStream {
  private readonly threads = new Map<string, ThreadStream>();

  constructor(
    private readonly db: Store,
    private readonly options: {
      maxEvents?: number;
      maxBytes?: number;
      flushMs?: number;
      now?: () => Date;
    } = {},
  ) {}

  private key(owner: string, threadId: string) {
    return `${owner}\u0000${threadId}`;
  }

  private make(owner: string, threadId: string): ThreadStream {
    return {
      owner,
      threadId,
      events: [],
      bytes: 0,
      lastSeq: 0,
      run: null,
      times: {},
      subscribers: new Set(),
      loaded: false,
      dirty: false,
      closed: false,
    };
  }

  private async ensure(owner: string, threadId: string): Promise<ThreadStream> {
    const key = this.key(owner, threadId);
    let state = this.threads.get(key);
    if (!state) {
      state = this.make(owner, threadId);
      this.threads.set(key, state);
    }
    if (state.loaded) return state;
    if (!state.loading) {
      state.loading = (async () => {
        try {
          const saved = await this.db.get<PersistedStream>(owner, "conversation-streams", threadId);
          if (saved && !state.loaded && state.events.length === 0) {
            state.events = contiguousTail(normalizeEvents(saved.events));
            // Derive the cursor from the recoverable events. A persisted `seq`
            // that leads them describes events this process can no longer replay;
            // continuing from it would create a permanent sequence hole for every
            // attached client. Only use it when no event survived at all.
            const persistedSeq = Number.isSafeInteger(saved.seq) && saved.seq > 0 ? saved.seq : 0;
            state.lastSeq = state.events.at(-1)?.seq ?? persistedSeq;
            state.run = saved.run ?? null;
            state.times = deriveTimes(state.events, normalizeTimes(saved.times));
            state.bytes = state.events.reduce((sum, item) => sum + eventSize(item), 0);
            if (state.run?.status === "running") {
              const updated = Date.parse(state.run.updatedAt);
              if (Number.isFinite(updated) && Date.now() - updated > STALE_RUN_MS) {
                state.run = {
                  ...state.run,
                  status: "error",
                  updatedAt: iso(),
                };
              }
            }
            this.trim(state);
          }
          state.loaded = true;
        } catch (error) {
          // A storage problem must not prevent live streaming. Keep the in-memory ledger.
          backgroundFailure("conversation.stream.load", error);
          state.loaded = true;
        }
      })().finally(() => {
        state.loading = undefined;
      });
    }
    await state.loading;
    return state;
  }

  private trim(state: ThreadStream) {
    const maxEvents = this.options.maxEvents ?? DEFAULT_MAX_EVENTS;
    const maxBytes = this.options.maxBytes ?? DEFAULT_MAX_BYTES;
    while (state.events.length > maxEvents || state.bytes > maxBytes) {
      const dropped = state.events.shift();
      if (!dropped) break;
      state.bytes -= eventSize(dropped);
    }
  }

  /**
   * 记下一条消息第一次出现在流里的时间。
   *
   * 只记第一次：同一条消息后续的增量事件不能把时间往后推，否则长回复会显示成
   * 「回复结束时的时间」。表只保留最近的 `MESSAGE_TIMES_LIMIT` 条，靠对象的插入
   * 顺序淘汰最旧的一条。
   */
  private rememberTime(state: ThreadStream, event: BaseEvent, ts: string) {
    const messageId = (event as { messageId?: unknown }).messageId;
    if (typeof messageId !== "string" || !messageId || state.times[messageId]) return;
    state.times[messageId] = ts;
    trimTimes(state.times);
  }

  private snapshot(state: ThreadStream): StreamStatus {
    return {
      threadId: state.threadId,
      active: state.run?.status === "running",
      lastEventId: state.lastSeq,
      oldestEventId: state.events[0]?.seq ?? state.lastSeq + 1,
      eventCount: state.events.length,
      run: state.run,
    };
  }

  private scheduleFlush(state: ThreadStream) {
    state.dirty = true;
    if (state.flushTimer || state.closed) return;
    state.flushTimer = setTimeout(() => {
      state.flushTimer = undefined;
      void this.flush(state);
    }, this.options.flushMs ?? DEFAULT_FLUSH_MS);
    // Keep a long-lived server process able to exit in tests and on shutdown.
    state.flushTimer.unref?.();
  }

  private async flush(state: ThreadStream) {
    if (state.writing) {
      await state.writing;
      if (state.dirty) {
        if (state.closed) await this.flush(state);
        else this.scheduleFlush(state);
      }
      return;
    }
    if (!state.dirty) return;
    state.dirty = false;
    const payload: PersistedStream = {
      id: state.threadId,
      seq: state.lastSeq,
      oldestSeq: state.events[0]?.seq ?? state.lastSeq + 1,
      events: state.events,
      run: state.run,
      times: state.times,
      updatedAt: iso(),
    };
    state.writing = this.db
      .put(state.owner, "conversation-streams", payload)
      .then(() => undefined)
      .catch((error) => backgroundFailure("conversation.stream.flush", error))
      .finally(() => {
        state.writing = undefined;
      });
    await state.writing;
    if (state.dirty) {
      // During shutdown no timer will run, so drain the newest batch inline.
      if (state.closed) await this.flush(state);
      else this.scheduleFlush(state);
    }
  }

  /**
   * Mirror one AG-UI event. Publication is serialized by `observe`; direct callers
   * should await it so sequence numbers and ordering stay deterministic.
   */
  async publish(
    owner: string,
    threadId: string,
    runId: string,
    event: BaseEvent,
  ): Promise<StreamEnvelope> {
    const state = await this.ensure(owner, threadId);
    const seq = ++state.lastSeq;
    const ts = iso();
    const stored: StoredStreamEvent = { seq, ts, runId, event };
    state.events.push(stored);
    state.bytes += eventSize(stored);
    this.rememberTime(state, event, ts);
    this.trim(state);

    if (event.type === EventType.RUN_STARTED) {
      state.run = {
        runId,
        status: "running",
        startedAt: ts,
        updatedAt: ts,
      };
    } else if (isRunFinished(event.type) && state.run?.runId === runId) {
      state.run = {
        ...state.run,
        status: event.type === EventType.RUN_ERROR ? "error" : "finished",
        updatedAt: ts,
      };
    } else if (state.run?.runId === runId) {
      state.run = { ...state.run, updatedAt: ts };
    }

    const envelope: StreamEnvelope = { ...stored, threadId };
    for (const subscriber of [...state.subscribers]) {
      try {
        subscriber(envelope);
      } catch (error) {
        state.subscribers.delete(subscriber);
        backgroundFailure("conversation.stream.subscriber", error);
      }
    }
    this.scheduleFlush(state);
    return envelope;
  }

  /** Wrap an AG-UI observable without changing its events or error semantics. */
  observe(
    owner: string,
    threadId: string,
    runId: string,
    source: Observable<BaseEvent>,
  ): Observable<BaseEvent> {
    return source.pipe(
      concatMap((event) =>
        from(
          this.publish(owner, threadId, runId, event).catch((error) => {
            backgroundFailure("conversation.stream.publish", error);
          }),
        ).pipe(map(() => event)),
      ),
    );
  }

  /**
   * Attach a live subscriber and synchronously deliver replay first.
   *
   * - `after === null`: a fresh page follows the active run from its first event; an idle
   *   thread starts live at the current tail.
   * - `after` outside the retained window (or ahead of the ledger): reset, then replay
   *   the retained tail so the client can rebuild a consistent view.
   */
  async attach(
    owner: string,
    threadId: string,
    after: number | null,
    handlers: StreamAttachHandlers,
  ): Promise<StreamAttachment> {
    const state = await this.ensure(owner, threadId);
    const oldest = state.events[0]?.seq ?? state.lastSeq + 1;
    const last = state.lastSeq;

    let reset = false;
    let replayFrom = last;
    if (after === null) {
      if (state.run?.status === "running") {
        const activeStart = state.events.find((item) => item.runId === state.run?.runId)?.seq;
        // A long run can outlive the 2000-event window. Its RUN_STARTED and the
        // first deltas are then gone, but the retained tail still contains the
        // rest of the live reply. Replaying from `last` would attach the client
        // to future deltas only and silently drop the answer it reloaded for.
        replayFrom = (activeStart ?? oldest) - 1;
      } else {
        replayFrom = last;
      }
    } else if (!Number.isInteger(after) || after > last || after < oldest - 1) {
      reset = true;
      replayFrom =
        state.run?.status === "running"
          ? (state.events.find((item) => item.runId === state.run?.runId)?.seq ?? oldest) - 1
          : oldest - 1;
    } else {
      replayFrom = after;
    }

    handlers.onReady(this.snapshot(state), reset, replayFrom);
    for (const item of state.events) {
      if (item.seq > replayFrom) handlers.onEvent({ ...item, threadId });
    }

    const subscriber = (envelope: StreamEnvelope) => handlers.onEvent(envelope);
    state.subscribers.add(subscriber);
    return {
      unsubscribe: () => {
        state.subscribers.delete(subscriber);
      },
    };
  }

  async status(owner: string, threadId: string): Promise<StreamStatus> {
    return this.snapshot(await this.ensure(owner, threadId));
  }

  /**
   * 每条消息第一次出现的时间（messageId → ISO）。
   *
   * 会话历史接口用它给消息补上 `metadata.at`，让回复下面能显示时间——
   * Rich Threads 持久化的正文本身不带时间戳。没有记录的消息不会出现在返回值里，
   * 前端据此不显示时间，而不是拿「现在」冒充。
   */
  async messageTimes(owner: string, threadId: string): Promise<Record<string, string>> {
    return { ...(await this.ensure(owner, threadId)).times };
  }

  /**
   * 记下一条不会出现在事件流里的消息的时间（用户提问）。
   *
   * 用户消息只在 `RunAgentInput.messages` 里出现，没有对应的 AG-UI 事件，
   * 所以时间必须在请求入口单独打点，否则提问下面的时间只能靠插值猜。
   * 已经有记录就不覆盖：重试同一轮提问时消息 id 不变。
   */
  async noteMessage(owner: string, threadId: string, messageId: string): Promise<void> {
    if (!threadId || !messageId) return;
    const ts = iso();
    const state = await this.ensure(owner, threadId);
    if (state.times[messageId]) return;
    state.times[messageId] = ts;
    trimTimes(state.times);
    this.scheduleFlush(state);
  }

  /** Number of attached SSE clients; exposed for cleanup/concurrency tests. */
  subscriberCount(threadId?: string) {
    let total = 0;
    for (const state of this.threads.values()) {
      if (threadId === undefined || state.threadId === threadId) total += state.subscribers.size;
    }
    return total;
  }

  /** Flush all dirty ledgers. Used by shutdown and tests. */
  async close() {
    await Promise.all(
      [...this.threads.values()].map(async (state) => {
        state.closed = true;
        if (state.flushTimer) {
          clearTimeout(state.flushTimer);
          state.flushTimer = undefined;
        }
        if (state.dirty || state.writing) await this.flush(state);
        // Long-lived SSE handlers own their HTTP responses; clearing the set makes
        // sure a shutdown cannot leave a publisher pointing at a dead process.
        state.subscribers.clear();
      }),
    );
  }
}
