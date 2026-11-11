export type ScrollLayout = {
  height: number;
  y: number;
  bottomInset: number;
};

export type PrependAnchor = ScrollLayout & {
  firstMessageId: string;
};

/** Still on the live tail when the gap under the viewport is inside this slack. */
export const followLatestSlack = 120;

/** Far enough from the tail to offer a jump-to-latest control. */
export const awayFromLatestSlack = 400;

export function tailOffset(height: number, viewport: number): number {
  if (viewport <= 0) return 0;
  return Math.max(0, height - viewport);
}

/**
 * Nudge a reader who was already on the tail by exactly the content growth.
 * A large gap means they scrolled up, or the viewport was yanked: do not pull
 * them to the absolute bottom. A settled tail (no real growth) does not scroll.
 */
export function pinnedTailNudge(input: {
  following: boolean;
  previousHeight: number;
  height: number;
  offset: number;
  viewport: number;
  slack?: number;
}): number | undefined {
  if (!input.following || input.viewport <= 0 || input.previousHeight <= 0) return undefined;
  const delta = input.height - input.previousHeight;
  if (delta <= 1) return undefined;
  const gapBefore = input.previousHeight - input.offset - input.viewport;
  if (gapBefore > (input.slack ?? followLatestSlack)) return undefined;
  const next = Math.min(input.offset + delta, tailOffset(input.height, input.viewport));
  if (next - input.offset <= 1) return undefined;
  return next;
}

/** Keep the tail above a taller composer. Readers who moved up stay put. */
export function composerInsetNudge(input: {
  following: boolean;
  insetDelta: number;
  offset: number;
  height: number;
  viewport: number;
}): number | undefined {
  if (!input.following || input.insetDelta <= 1 || input.viewport <= 0) return undefined;
  const next = Math.min(input.offset + input.insetDelta, tailOffset(input.height, input.viewport));
  if (next - input.offset <= 1) return undefined;
  return next;
}

/** Ignore composer growth: only content inserted above the reader moves its anchor. */
export function restorePrependOffset(
  anchor: PrependAnchor,
  current: Pick<ScrollLayout, "height" | "bottomInset"> & { firstMessageId: string | null },
): number | undefined {
  if (current.firstMessageId !== anchor.firstMessageId) return undefined;
  const addedHeight = current.height - current.bottomInset - (anchor.height - anchor.bottomInset);
  const nextY = anchor.y + addedHeight;
  if (!Number.isFinite(addedHeight) || addedHeight <= 0 || !Number.isFinite(nextY))
    return undefined;
  return Math.max(0, nextY);
}
