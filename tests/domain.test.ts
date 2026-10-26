import assert from "node:assert/strict";
import test from "node:test";
import {
  createTaskSchema,
  marketBriefingSchema,
  priceAlertSchema,
  researchReportSchema,
  symbolSchema,
  watchlistSchema,
} from "../packages/domain/src/agent.ts";
import {
  emailDraftSchema,
  eventDraftSchema,
  proposalSchema,
} from "../packages/domain/src/index.ts";

const email = {
  to: ["reader@example.com"],
  subject: "Your visit",
  body: "See you soon.",
};
const event = {
  title: "Museum visit",
  start: "2026-10-10T10:00:00-07:00",
  end: "2026-10-10T14:00:00-07:00",
};

test("email drafts default cc, bcc, and attachmentIds to empty arrays", () => {
  const parsed = emailDraftSchema.parse(email);
  assert.deepEqual(parsed.cc, []);
  assert.deepEqual(parsed.bcc, []);
  assert.deepEqual(parsed.attachmentIds, []);
});

test("email drafts reject a subject containing a line break", () => {
  assert.equal(emailDraftSchema.safeParse({ ...email, subject: "Visit\nplan" }).success, false);
  assert.equal(emailDraftSchema.safeParse({ ...email, subject: "Visit\rplan" }).success, false);
});

test("email drafts enforce recipient, cc/bcc, and attachment limits", () => {
  assert.equal(emailDraftSchema.safeParse({ ...email, to: [] }).success, false);
  assert.equal(
    emailDraftSchema.safeParse({
      ...email,
      cc: Array.from({ length: 51 }, (_, i) => `person${i}@example.com`),
    }).success,
    false,
  );
  assert.equal(
    emailDraftSchema.safeParse({
      ...email,
      attachmentIds: Array.from({ length: 11 }, (_, i) => `file-${i}`),
    }).success,
    false,
  );
});

test("email drafts reject malformed addresses", () => {
  assert.equal(emailDraftSchema.safeParse({ ...email, to: ["not-an-email"] }).success, false);
});

test("timed events require an explicit UTC offset", () => {
  assert.equal(eventDraftSchema.parse(event).timeZone, "America/Los_Angeles");
  assert.equal(
    eventDraftSchema.safeParse({ ...event, start: "2026-10-10T10:00:00" }).success,
    false,
  );
  assert.equal(
    eventDraftSchema.safeParse({ ...event, start: "2026-10-10T10:00:00Z" }).success,
    true,
  );
});

test("all-day events reject a full timestamp in place of a date", () => {
  const allDay = { ...event, allDay: true, start: "2026-10-10", end: "2026-10-11" };
  assert.equal(eventDraftSchema.parse(allDay).allDay, true);
  assert.equal(
    eventDraftSchema.safeParse({ ...allDay, start: "2026-10-10T00:00:00Z" }).success,
    false,
  );
});

test("events reject an end at or before the start", () => {
  assert.equal(
    eventDraftSchema.safeParse({ ...event, end: "2026-10-09T10:00:00-07:00" }).success,
    false,
  );
  assert.equal(eventDraftSchema.safeParse({ ...event, end: event.start }).success, false);
});

test("events reject nonexistent dates instead of normalizing them into the next month", () => {
  for (const allDay of [true, false]) {
    const format = (date: string) => (allDay ? date : `${date}T10:00:00+08:00`);
    for (const date of ["2026-02-29", "2026-02-30", "2026-04-31", "2100-02-29"]) {
      for (const field of ["start", "end"] as const) {
        assert.equal(
          eventDraftSchema.safeParse({
            ...event,
            allDay,
            start: format("2000-01-01"),
            end: format("2200-01-01"),
            [field]: format(date),
          }).success,
          false,
          `${field} must reject ${format(date)}`,
        );
      }
    }
  }
});

test("events accept valid leap days, month ends, and explicit offsets", () => {
  for (const suffix of [
    "",
    "T10:00Z",
    "T10:00+05:30",
    "T10:00:00Z",
    "T10:00:00.123+08:00",
    "T10:00:00-07:00",
  ]) {
    for (const [start, end] of [
      ["2000-02-29", "2000-03-01"],
      ["2024-02-29", "2024-03-01"],
      ["2026-04-30", "2026-05-01"],
    ]) {
      assert.equal(
        eventDraftSchema.safeParse({
          ...event,
          allDay: suffix === "",
          start: start + suffix,
          end: end + suffix,
        }).success,
        true,
        `${start + suffix} to ${end + suffix} must remain valid`,
      );
    }
  }
});

test("events default calendarId, location, and description", () => {
  const parsed = eventDraftSchema.parse(event);
  assert.equal(parsed.calendarId, "primary");
  assert.equal(parsed.location, "");
  assert.equal(parsed.description, "");
});

test("proposal schema discriminates on kind and validates nested data", () => {
  assert.equal(proposalSchema.safeParse({ kind: "email.send", data: email }).success, true);
  assert.equal(
    proposalSchema.safeParse({ kind: "email.send", data: { ...email, subject: "" } }).success,
    false,
  );
  assert.equal(proposalSchema.safeParse({ kind: "unknown.kind", data: {} }).success, false);
});

// ─── 投研智能体数据模型 ───

const watchlist = {
  id: "0b7f2a3c-1d4e-4f5a-8b9c-0d1e2f3a4b5c",
  user_id: "1c8f3b4d-2e5f-4a6b-9c0d-1e2f3a4b5c6d",
  name: "核心持仓",
  symbols: ["AAPL", "600519.SH"],
  created_at: "2026-10-26T00:00:00Z",
  updated_at: "2026-10-26T01:00:00Z",
};

test("watchlist schema accepts a valid document and rejects an empty name", () => {
  assert.equal(watchlistSchema.safeParse(watchlist).success, true);
  assert.equal(watchlistSchema.safeParse({ ...watchlist, name: "" }).success, false);
  assert.equal(watchlistSchema.safeParse({ ...watchlist, id: "not-a-uuid" }).success, false);
});

test("symbol schema requires a supported market", () => {
  assert.equal(symbolSchema.safeParse({ code: "AAPL", name: "Apple", market: "US" }).success, true);
  assert.equal(
    symbolSchema.safeParse({ code: "AAPL", name: "Apple", market: "JP" }).success,
    false,
  );
});

test("market briefing requires 3 to 5 summary points and a date-only value", () => {
  const briefing = {
    id: "2d9f4c5e-3a6b-4c7d-8e9f-0a1b2c3d4e5f",
    user_id: "1c8f3b4d-2e5f-4a6b-9c0d-1e2f3a4b5c6d",
    date: "2026-10-26",
    summary: ["a", "b", "c"],
    content: "full text",
    market_data: {},
    symbol_updates: {},
    events: [],
    generated_at: "2026-10-26T00:00:00Z",
  };
  assert.equal(marketBriefingSchema.safeParse(briefing).success, true);
  assert.equal(marketBriefingSchema.safeParse({ ...briefing, summary: ["a", "b"] }).success, false);
  assert.equal(
    marketBriefingSchema.safeParse({ ...briefing, summary: ["a", "b", "c", "d", "e", "f"] })
      .success,
    false,
  );
  assert.equal(
    marketBriefingSchema.safeParse({ ...briefing, date: "2026-10-26T00:00:00Z" }).success,
    false,
  );
});

test("research report validates the six structured sections", () => {
  const report = {
    id: "3e0a5d6f-4b7c-4d8e-9f0a-1b2c3d4e5f6a",
    user_id: "1c8f3b4d-2e5f-4a6b-9c0d-1e2f3a4b5c6d",
    symbol_code: "AAPL",
    title: "Apple 深度研究",
    sections: {
      company_overview: "overview",
      financials: {},
      news: [],
      peer_comparison: [],
      valuation: {},
      risks: ["risk"],
    },
    generated_at: "2026-10-26T00:00:00Z",
  };
  assert.equal(researchReportSchema.safeParse(report).success, true);
  const { risks: _risks, ...missingRisks } = report.sections;
  assert.equal(
    researchReportSchema.safeParse({ ...report, sections: missingRisks }).success,
    false,
  );
});

test("price alert defaults enabled to true and rejects unknown thresholds", () => {
  const alert = {
    id: "4f1b6e7a-5c8d-4e9f-8a1b-2c3d4e5f6a7b",
    user_id: "1c8f3b4d-2e5f-4a6b-9c0d-1e2f3a4b5c6d",
    symbol_code: "AAPL",
    threshold_type: "PRICE_ABOVE",
    threshold_value: 200,
    created_at: "2026-10-26T00:00:00Z",
  };
  assert.equal(priceAlertSchema.parse(alert).enabled, true);
  assert.equal(priceAlertSchema.safeParse({ ...alert, threshold_type: "VOLUME" }).success, false);
});

test("task creation accepts market_briefing and research kinds", () => {
  assert.equal(
    createTaskSchema.safeParse({ prompt: "生成今日简报", kind: "market_briefing" }).success,
    true,
  );
  assert.equal(createTaskSchema.safeParse({ prompt: "研究 AAPL", kind: "research" }).success, true);
  assert.equal(createTaskSchema.safeParse({ prompt: "x", kind: "unknown" }).success, false);
});
