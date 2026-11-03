import { useEffect, useRef, useState } from "react";
import {
  type ColumnResizeHandleProps,
  desktopColumns,
  draggedColumnWidth,
} from "./desktop-columns";
import { colors } from "./ui";

export function ColumnResizeHandle({
  side,
  width,
  min,
  max,
  label,
  hint,
  onResize,
}: ColumnResizeHandleProps) {
  const drag = useRef<{ pointer: number; x: number; width: number; lastX: number } | null>(null);
  const lastTap = useRef<{ x: number; at: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);
  const finish = () => {
    const session = drag.current;
    if (!session) return;
    drag.current = null;
    setDragging(false);
    onResize(draggedColumnWidth(side, session.width, session.x, session.lastX), true);
  };
  return (
    <hr
      aria-label={label}
      aria-description={hint}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={Math.floor(max)}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      title={hint}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, x: event.clientX, width, lastX: event.clientX };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const session = drag.current;
        if (!session || session.pointer !== event.pointerId) return;
        session.lastX = event.clientX;
        if (Math.abs(event.clientX - session.x) > 3) lastTap.current = null;
        onResize(draggedColumnWidth(side, session.width, session.x, event.clientX), false);
      }}
      onPointerUp={(event) => {
        const session = drag.current;
        if (!session || session.pointer !== event.pointerId) return;
        session.lastX = event.clientX;
        const tap = Math.abs(session.lastX - session.x) <= 3;
        const previous = lastTap.current;
        const doubleTap =
          tap &&
          previous &&
          Date.now() - previous.at < 400 &&
          Math.abs(previous.x - session.lastX) <= 3;
        lastTap.current = tap && !doubleTap ? { x: session.lastX, at: Date.now() } : null;
        finish();
        // Touch emulation does not emit dblclick after pointer capture. Handle
        // two stationary taps too, so tablets and mouse emulation can reset.
        if (doubleTap) onResize(desktopColumns[side].initial, true);
      }}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onDoubleClick={() => onResize(desktopColumns[side].initial, true)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 30 : 10;
        const direction = side === "left" ? 1 : -1;
        const next =
          event.key === "Home"
            ? min
            : event.key === "End"
              ? max
              : event.key === "ArrowRight"
                ? width + step * direction
                : event.key === "ArrowLeft"
                  ? width - step * direction
                  : undefined;
        if (next === undefined) return;
        lastTap.current = null;
        event.preventDefault();
        onResize(next, true);
      }}
      onMouseEnter={() => setHighlighted(true)}
      onMouseLeave={() => setHighlighted(false)}
      onFocus={() => setHighlighted(true)}
      onBlur={() => setHighlighted(false)}
      style={{
        width: desktopColumns.divider,
        margin: 0,
        padding: 0,
        border: 0,
        flexShrink: 0,
        alignSelf: "stretch",
        position: "relative",
        cursor: "col-resize",
        touchAction: "none",
        userSelect: "none",
        outline: "none",
        backgroundColor: dragging || highlighted ? colors.sky : "transparent",
        backgroundImage: `linear-gradient(${dragging || highlighted ? colors.primary : colors.lineSoft}, ${dragging || highlighted ? colors.primary : colors.lineSoft}), linear-gradient(${dragging || highlighted ? colors.primary : colors.lineStrong}, ${dragging || highlighted ? colors.primary : colors.lineStrong})`,
        backgroundSize: "1px 100%, 4px 28px",
        backgroundPosition: "center, center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
