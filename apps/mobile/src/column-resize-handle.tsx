import type { ColumnResizeHandleProps } from "./desktop-columns";

/** Native layouts use drawers, so there is no mouse resize handle. */
export function ColumnResizeHandle(_props: ColumnResizeHandleProps) {
  return null;
}
