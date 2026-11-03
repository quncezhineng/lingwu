export type WatchlistMenuAnchor = { x: number; y: number; width: number; height: number };

/** Window coordinates are shared by measureInWindow and the transparent menu Modal. */
export function watchlistMenuPosition(
  anchor: WatchlistMenuAnchor,
  viewport: { width: number; height: number },
  menu: { width: number; height: number },
) {
  const margin = 8;
  const gap = 6;
  const width = Math.min(menu.width, Math.max(0, viewport.width - margin * 2));
  const maxHeight = Math.min(menu.height, Math.max(0, viewport.height - margin * 2));
  const left = Math.max(
    margin,
    Math.min(anchor.x + anchor.width - width, viewport.width - margin - width),
  );
  const below = anchor.y + anchor.height + gap;
  const above = anchor.y - gap - maxHeight;
  const top = below + maxHeight <= viewport.height - margin ? below : above;
  return {
    left,
    top: Math.max(margin, Math.min(top, viewport.height - margin - maxHeight)),
    width,
    maxHeight,
  };
}
