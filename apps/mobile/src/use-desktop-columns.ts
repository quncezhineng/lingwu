import { useCallback, useRef, useState } from "react";
import {
  COLUMN_WIDTHS_STORAGE_KEY,
  type ColumnSide,
  fitColumnWidths,
  normalizeColumnWidths,
  RIGHT_RAIL_COLLAPSED_STORAGE_KEY,
  resizeColumn,
} from "./desktop-columns";
import { readStorage, writeStorage } from "./i18n/storage";

function loadWidths() {
  try {
    return normalizeColumnWidths(JSON.parse(readStorage(COLUMN_WIDTHS_STORAGE_KEY) ?? "null"));
  } catch {
    return normalizeColumnWidths(undefined);
  }
}

function loadRailCollapsed() {
  return readStorage(RIGHT_RAIL_COLLAPSED_STORAGE_KEY) === "1";
}
export function useDesktopColumns(available: number) {
  const [preferred, setPreferred] = useState(loadWidths);
  const widths = fitColumnWidths(available, preferred);
  const current = useRef(widths);
  current.current = widths;
  const resize = useCallback(
    (side: ColumnSide, value: number, finished: boolean) => {
      const next = resizeColumn(available, current.current, side, value);
      current.current = next;
      setPreferred(next);
      if (finished) writeStorage(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(next));
    },
    [available],
  );
  const [railCollapsed, setRailCollapsed] = useState(loadRailCollapsed);
  const toggleRail = useCallback(() => {
    setRailCollapsed((current) => {
      const next = !current;
      writeStorage(RIGHT_RAIL_COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);
  const expandRail = useCallback(() => {
    setRailCollapsed((current) => {
      if (!current) return current;
      writeStorage(RIGHT_RAIL_COLLAPSED_STORAGE_KEY, "0");
      return false;
    });
  }, []);
  return { widths, resize, railCollapsed, toggleRail, expandRail };
}
