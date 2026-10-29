import assert from "node:assert/strict";
import test from "node:test";
import { greetingKeyForHour, userLocalHour } from "../src/greeting.ts";

test("问候语按上午、下午、晚上分段", () => {
  assert.equal(greetingKeyForHour(5), "workbench.greetingMorning");
  assert.equal(greetingKeyForHour(11), "workbench.greetingMorning");
  assert.equal(greetingKeyForHour(12), "workbench.greetingAfternoon");
  assert.equal(greetingKeyForHour(17), "workbench.greetingAfternoon");
  assert.equal(greetingKeyForHour(18), "workbench.greetingEvening");
  assert.equal(greetingKeyForHour(2), "workbench.greetingEvening");
});

test("小时数按用户时区读取", () => {
  const instant = new Date("2026-10-29T03:30:00Z");
  assert.equal(userLocalHour(instant, "Asia/Shanghai"), 11);
  assert.equal(userLocalHour(instant, "America/Los_Angeles"), 20);
});
