import assert from "node:assert/strict";
import test from "node:test";
import { shouldCompletePop } from "../src/ios-gesture.ts";

test("a right-edge swipe completes the pop past halfway or with enough speed", () => {
  assert.equal(shouldCompletePop(200, 390, 0), true);
  assert.equal(shouldCompletePop(40, 390, 0.8), true);
  assert.equal(shouldCompletePop(40, 390, 0.2), false);
  assert.equal(shouldCompletePop(0, 390, 2), false);
  assert.equal(shouldCompletePop(10, 0, 2), false);
});
