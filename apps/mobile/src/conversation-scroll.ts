export type ScrollLayout = {
  height: number;
  y: number;
  bottomInset: number;
};

export type PrependAnchor = ScrollLayout & {
  firstMessageId: string;
};

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
