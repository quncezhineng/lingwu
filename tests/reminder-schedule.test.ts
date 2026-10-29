import assert from "node:assert/strict";
import test from "node:test";
import { nextMonitorCheckAt } from "../apps/server/src/engine/service.ts";
import { monitorInputSchema } from "../packages/domain/src/agent.ts";

test("daily and weekly reminders use the requested Asia/Shanghai time", () => {
  const beforeClose = new Date("2026-10-29T06:00:00.000Z");
  assert.equal(
    nextMonitorCheckAt(
      { schedule: "daily", timeOfDay: "15:30", intervalMinutes: 1440 },
      beforeClose,
    ),
    "2026-10-29T07:30:00.000Z",
  );
  assert.equal(
    nextMonitorCheckAt(
      { schedule: "daily", timeOfDay: "09:00", intervalMinutes: 1440 },
      beforeClose,
    ),
    "2026-10-30T01:00:00.000Z",
  );
  assert.equal(
    nextMonitorCheckAt(
      { schedule: "weekly", weekday: 5, timeOfDay: "18:00", intervalMinutes: 10080 },
      beforeClose,
    ),
    "2026-10-30T10:00:00.000Z",
  );
});

test("monitor input preserves description and validates scheduled reminders", () => {
  const parsed = monitorInputSchema.parse({
    title: "Weekly review",
    description: "Review my watchlist",
    url: "https://example.com",
    schedule: "weekly",
    weekday: 5,
    timeOfDay: "18:00",
  });
  assert.equal(parsed.description, "Review my watchlist");
  assert.equal(parsed.schedule, "weekly");
  assert.equal(
    monitorInputSchema.safeParse({
      title: "Missing time",
      url: "https://example.com",
      schedule: "daily",
    }).success,
    false,
  );
});
