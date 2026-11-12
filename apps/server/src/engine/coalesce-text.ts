import { type BaseEvent, EventType } from "@ag-ui/core";
import { Observable } from "rxjs";

/** Consecutive model chunks small enough to merge. Larger ones are already a burst. */
const DEFAULT_MAX_CHARS = 96;

const MERGEABLE = new Set<BaseEvent["type"]>([
  EventType.TEXT_MESSAGE_CHUNK,
  EventType.REASONING_MESSAGE_CONTENT,
]);

interface ChunkEvent extends BaseEvent {
  type: BaseEvent["type"];
  messageId?: string;
  delta?: string;
}

/**
 * Merge a burst of tiny text or reasoning deltas into fewer events.
 *
 * The model emits one or two characters at a time (the 11:54 小悟 reply was
 * 1,438 text chunks). The intelligence gateway then fans each chunk out to
 * the browser. Under that rate the browser copy loses spans, so `**` markers
 * arrive without their partners and characters disappear, while the local
 * ledger — which records every delta before this merge — stays intact.
 * Concatenation is unchanged. A non-chunk event flushes the buffer first, so
 * tool calls and RUN_FINISHED keep their original order.
 */
export function coalesceTextChunks(
  source: Observable<BaseEvent>,
  maxChars = DEFAULT_MAX_CHARS,
): Observable<BaseEvent> {
  return new Observable((subscriber) => {
    let pending: ChunkEvent | null = null;
    const flush = () => {
      if (!pending) return;
      const event = pending;
      pending = null;
      if (event.delta) subscriber.next(event);
    };
    const subscription = source.subscribe({
      next(event) {
        const chunk = event as ChunkEvent;
        if (
          MERGEABLE.has(chunk.type) &&
          typeof chunk.messageId === "string" &&
          typeof chunk.delta === "string"
        ) {
          if (pending && (pending.type !== chunk.type || pending.messageId !== chunk.messageId))
            flush();
          if (!pending) pending = { ...chunk, delta: "" };
          pending.delta += chunk.delta;
          if ((pending.delta?.length ?? 0) >= maxChars) flush();
          return;
        }
        flush();
        subscriber.next(event);
      },
      error(error) {
        flush();
        subscriber.error(error);
      },
      complete() {
        flush();
        subscriber.complete();
      },
    });
    return () => subscription.unsubscribe();
  });
}
