export const desktopColumns = {
  breakpoint: 1024,
  centerMin: 520,
  divider: 6,
  left: { min: 200, max: 340, initial: 240 },
  right: { min: 220, max: 400, initial: 260 },
} as const;
export type ColumnSide = "left" | "right";
export type ColumnWidths = Record<ColumnSide, number>;
export const COLUMN_WIDTHS_STORAGE_KEY = "lingwu:desktop-columns:v1";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}
export function normalizeColumnWidths(value: unknown): ColumnWidths {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const read = (side: ColumnSide) => {
    const width = record[side];
    const bounds = desktopColumns[side];
    return typeof width === "number" && Number.isFinite(width)
      ? clamp(width, bounds.min, bounds.max)
      : bounds.initial;
  };
  return { left: read("left"), right: read("right") };
}
export function fitColumnWidths(available: number, desired: ColumnWidths): ColumnWidths {
  let { left, right } = normalizeColumnWidths(desired);
  const excess = Math.max(
    0,
    Math.ceil(left + right + desktopColumns.divider * 2 + desktopColumns.centerMin - available),
  );
  const shrinkLeft = Math.min(left - desktopColumns.left.min, Math.ceil(excess / 2));
  left -= shrinkLeft;
  const shrinkRight = Math.min(right - desktopColumns.right.min, excess - shrinkLeft);
  right -= shrinkRight;
  left -= Math.min(left - desktopColumns.left.min, excess - shrinkLeft - shrinkRight);
  return { left, right };
}
export function columnMaxWidth(available: number, widths: ColumnWidths, side: ColumnSide) {
  const other = side === "left" ? "right" : "left";
  return Math.max(
    desktopColumns[side].min,
    Math.min(
      desktopColumns[side].max,
      Math.floor(available - widths[other] - desktopColumns.centerMin - desktopColumns.divider * 2),
    ),
  );
}
export function resizeColumn(
  available: number,
  widths: ColumnWidths,
  side: ColumnSide,
  value: number,
) {
  const fitted = fitColumnWidths(available, widths);
  return {
    ...fitted,
    [side]: clamp(value, desktopColumns[side].min, columnMaxWidth(available, fitted, side)),
  };
}
export function draggedColumnWidth(
  side: ColumnSide,
  startWidth: number,
  startX: number,
  x: number,
) {
  return startWidth + (x - startX) * (side === "left" ? 1 : -1);
}
export type ColumnResizeHandleProps = {
  side: ColumnSide;
  width: number;
  min: number;
  max: number;
  label: string;
  hint: string;
  onResize: (value: number, finished: boolean) => void;
};
