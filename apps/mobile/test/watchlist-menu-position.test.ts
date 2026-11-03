import assert from "node:assert/strict";
import test from "node:test";
import { watchlistMenuPosition } from "../src/watchlist-menu-position.ts";

const menu = { width: 192, height: 134 };

test("list menus open below their trigger, aligned to its right edge", () => {
  assert.deepEqual(
    watchlistMenuPosition(
      { x: 640, y: 280, width: 38, height: 38 },
      { width: 1200, height: 800 },
      menu,
    ),
    { left: 486, top: 324, width: 192, maxHeight: 134 },
  );
});

test("menus flip above a trigger near the viewport bottom", () => {
  const position = watchlistMenuPosition(
    { x: 640, y: 730, width: 38, height: 38 },
    { width: 1200, height: 800 },
    menu,
  );
  assert.equal(position.top, 590);
  assert.ok(position.top + position.maxHeight < 730);
});

test("menus stay inside either horizontal edge", () => {
  for (const x of [-20, 0, 14, 340, 400]) {
    const position = watchlistMenuPosition(
      { x, y: 100, width: 28, height: 24 },
      { width: 390, height: 760 },
      menu,
    );
    assert.ok(position.left >= 8);
    assert.ok(position.left + position.width <= 382);
  }
});

test("narrow and short viewports constrain the menu to a scrollable rectangle", () => {
  const position = watchlistMenuPosition(
    { x: 90, y: 55, width: 28, height: 24 },
    { width: 160, height: 100 },
    menu,
  );
  assert.deepEqual(position, { left: 8, top: 8, width: 144, maxHeight: 84 });
});
