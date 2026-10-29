import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSavedInsightIds,
  resetSavedInsightsForTests,
  toggledInsightIds,
  toggleSavedInsight,
} from "../src/saved-insights.ts";

test("saved insight ids keep the newest save first and toggle cleanly", () => {
  assert.deepEqual(toggledInsightIds(["a"], "b"), ["b", "a"]);
  assert.deepEqual(toggledInsightIds(["b", "a"], "b"), ["a"]);
});

test("saving and unsaving updates the shared snapshot", () => {
  resetSavedInsightsForTests();
  toggleSavedInsight("apple");
  toggleSavedInsight("nvidia");
  assert.deepEqual(getSavedInsightIds(), ["nvidia", "apple"]);

  toggleSavedInsight("apple");
  assert.deepEqual(getSavedInsightIds(), ["nvidia"]);
  resetSavedInsightsForTests();
});
