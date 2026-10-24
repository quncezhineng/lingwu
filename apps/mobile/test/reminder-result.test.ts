import assert from "node:assert/strict";
import test from "node:test";
import { parseReminderResult } from "../src/reminder-result.ts";

const result = {
  reminders: [
    {
      id: "monitor-1",
      title: "Price watch",
      condition: "price_below",
      value: "80",
      intervalMinutes: 15,
      nextCheckAt: "2026-10-25T04:00:00.000Z",
      lastCheckedAt: null,
    },
  ],
  alerts: [
    {
      id: "alert-1",
      title: "Price changed",
      body: "The price is now 79.",
      createdAt: "2026-10-25T03:50:00.000Z",
    },
  ],
};

test("parses list_reminders objects and replay JSON", () => {
  assert.deepEqual(parseReminderResult(result), result);
  assert.deepEqual(parseReminderResult(JSON.stringify(result)), result);
});

test("an empty tool result has no reminders instead of rendering a parse failure", () => {
  assert.deepEqual(parseReminderResult(""), { reminders: [], alerts: [] });
  assert.deepEqual(parseReminderResult({}), { reminders: [], alerts: [] });
});

test("malformed reminder results are rejected", () => {
  assert.equal(parseReminderResult("{not json"), undefined);
  assert.equal(
    parseReminderResult({ reminders: [{ id: "missing fields" }], alerts: [] }),
    undefined,
  );
});
