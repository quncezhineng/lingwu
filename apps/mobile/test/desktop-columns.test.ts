import assert from "node:assert/strict";
import test from "node:test";
import {
  columnMaxWidth,
  desktopColumns,
  draggedColumnWidth,
  fitColumnWidths,
  normalizeColumnWidths,
  resizeColumn,
} from "../src/desktop-columns.ts";

test("invalid saved widths cannot escape the sidebar bounds", () => {
  assert.deepEqual(normalizeColumnWidths(undefined), { left: 240, right: 260 });
  assert.deepEqual(normalizeColumnWidths({ left: "340", right: Number.NaN }), {
    left: 240,
    right: 260,
  });
  assert.deepEqual(normalizeColumnWidths({ left: -100, right: 10000 }), { left: 200, right: 400 });
});

test("every supported desktop viewport keeps both sidebar bounds and a readable center", () => {
  for (const available of [1024, 1061, 1280, 1440, 1920, 2560, 1024.5]) {
    for (const left of [200, 240, 340])
      for (const right of [220, 260, 400]) {
        const fitted = fitColumnWidths(available, { left, right });
        assert.ok(fitted.left >= desktopColumns.left.min && fitted.left <= desktopColumns.left.max);
        assert.ok(
          fitted.right >= desktopColumns.right.min && fitted.right <= desktopColumns.right.max,
        );
        assert.ok(
          available - fitted.left - fitted.right - desktopColumns.divider * 2 >=
            desktopColumns.centerMin,
        );
        assert.ok(Number.isInteger(fitted.left) && Number.isInteger(fitted.right));
      }
  }
});

test("dragging either sidebar respects its dynamic maximum without moving the other sidebar", () => {
  const widths = fitColumnWidths(1061, { left: 240, right: 260 });
  const left = resizeColumn(1061, widths, "left", 10000);
  assert.equal(left.right, widths.right);
  assert.equal(left.left, columnMaxWidth(1061, widths, "left"));
  const right = resizeColumn(1061, widths, "right", 10000);
  assert.equal(right.left, widths.left);
  assert.equal(right.right, columnMaxWidth(1061, widths, "right"));
  assert.equal(resizeColumn(1061, widths, "left", -10000).left, 200);
  assert.equal(resizeColumn(1061, widths, "right", -10000).right, 220);
});

test("left and right handles follow the mouse in mirrored directions", () => {
  assert.equal(draggedColumnWidth("left", 240, 300, 350), 290);
  assert.equal(draggedColumnWidth("right", 260, 1000, 950), 310);
  assert.equal(draggedColumnWidth("right", 260, 1000, 1050), 210);
});

test("temporary viewport shrink does not destroy saved wide-screen preferences", () => {
  const preferred = { left: 340, right: 400 };
  const narrow = fitColumnWidths(1024, preferred);
  assert.ok(narrow.left < preferred.left && narrow.right < preferred.right);
  assert.deepEqual(fitColumnWidths(1920, preferred), preferred);
  assert.deepEqual(preferred, { left: 340, right: 400 });
});
