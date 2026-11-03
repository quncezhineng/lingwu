import { useCallback, useRef, useState } from "react";
import {
  COLUMN_WIDTHS_STORAGE_KEY,
  type ColumnSide,
  fitColumnWidths,
  normalizeColumnWidths,
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
  return { widths, resize };
}
