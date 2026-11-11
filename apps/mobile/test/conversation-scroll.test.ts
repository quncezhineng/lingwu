import assert from "node:assert/strict";
import test from "node:test";
import {
  composerInsetNudge,
  type PrependAnchor,
  pinnedTailNudge,
  restorePrependOffset,
} from "../src/conversation-scroll.ts";

const anchor: PrependAnchor = {
  height: 1200,
  y: 80,
  bottomInset: 90,
  firstMessageId: "older-first",
};

test("prepending older messages keeps the same content under the reader", () => {
  assert.equal(
    restorePrependOffset(anchor, {
      height: 1800,
      bottomInset: 90,
      firstMessageId: "older-first",
    }),
    680,
  );
});

test("composer growth alongside a prepend does not count as inserted history", () => {
  assert.equal(
    restorePrependOffset(anchor, {
      height: 1900,
      bottomInset: 190,
      firstMessageId: "older-first",
    }),
    680,
  );
});

test("composer shrink alongside a prepend does not shorten the restored offset", () => {
  assert.equal(
    restorePrependOffset(anchor, {
      height: 1750,
      bottomInset: 40,
      firstMessageId: "older-first",
    }),
    680,
  );
});

test("padding-only changes leave an anchor pending for the later history layout", () => {
  for (const bottomInset of [40, 90, 190])
    assert.equal(
      restorePrependOffset(anchor, {
        height: anchor.height + bottomInset - anchor.bottomInset,
        bottomInset,
        firstMessageId: "older-first",
      }),
      undefined,
    );
  assert.equal(
    restorePrependOffset(anchor, {
      height: 1900,
      bottomInset: 190,
      firstMessageId: "older-first",
    }),
    680,
  );
  assert.equal(anchor.height, 1200);
  assert.equal(anchor.y, 80);
});

test("content changes cannot consume an anchor before its target message is committed", () => {
  for (const firstMessageId of [null, "current-first"])
    assert.equal(
      restorePrependOffset(anchor, { height: 1800, bottomInset: 90, firstMessageId }),
      undefined,
    );
});

test("content shrink, invalid measurements and negative scroll results are safe", () => {
  assert.equal(
    restorePrependOffset(anchor, {
      height: 1190,
      bottomInset: 90,
      firstMessageId: "older-first",
    }),
    undefined,
  );
  assert.equal(
    restorePrependOffset(anchor, {
      height: Number.NaN,
      bottomInset: 90,
      firstMessageId: "older-first",
    }),
    undefined,
  );
  assert.equal(
    restorePrependOffset(
      { ...anchor, y: -700 },
      {
        height: 1800,
        bottomInset: 90,
        firstMessageId: "older-first",
      },
    ),
    0,
  );
});

test("a pinned reader follows only the new growth and ignores a settled tail", () => {
  assert.equal(
    pinnedTailNudge({
      following: true,
      previousHeight: 2300,
      height: 2400,
      offset: 1700,
      viewport: 600,
    }),
    1800,
  );
  assert.equal(
    pinnedTailNudge({
      following: true,
      previousHeight: 2400,
      height: 2400,
      offset: 1800,
      viewport: 600,
    }),
    undefined,
  );
});

test("a reader who scrolled up is not pulled to the tail", () => {
  assert.equal(
    pinnedTailNudge({
      following: false,
      previousHeight: 2300,
      height: 2400,
      offset: 400,
      viewport: 600,
    }),
    undefined,
  );
  assert.equal(
    pinnedTailNudge({
      following: true,
      previousHeight: 2300,
      height: 2400,
      offset: 400,
      viewport: 600,
    }),
    undefined,
  );
});

test("composer growth keeps a pinned tail and leaves a reader who moved up", () => {
  assert.equal(
    composerInsetNudge({
      following: true,
      insetDelta: 24,
      offset: 1700,
      height: 2400,
      viewport: 600,
    }),
    1724,
  );
  assert.equal(
    composerInsetNudge({
      following: false,
      insetDelta: 24,
      offset: 400,
      height: 2400,
      viewport: 600,
    }),
    undefined,
  );
});
