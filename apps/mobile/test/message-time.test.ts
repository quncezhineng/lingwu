import assert from "node:assert/strict";
import test from "node:test";
import { activeLocaleTag, tr } from "../src/i18n/translate.ts";
import { formatMessageTime, interpolateMessageTimes, messageTimeAt } from "../src/message-time.ts";

const tag = activeLocaleTag();
const clock = (at: number) =>
  new Date(at).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });

test("a reply without a recorded time shows nothing instead of a made-up one", () => {
  assert.equal(messageTimeAt({ id: "m", role: "assistant" }), 0);
  assert.equal(messageTimeAt({ metadata: {} }), 0);
  assert.equal(messageTimeAt({ metadata: { at: "not-a-date" } }), 0);
  assert.equal(messageTimeAt({ metadata: { at: "" } }), 0);
  assert.equal(messageTimeAt(null), 0);
  assert.equal(formatMessageTime(0), "");
});

test("the server-provided metadata timestamp is read as milliseconds", () => {
  const at = "2026-03-05T06:32:00.000Z";
  assert.equal(messageTimeAt({ metadata: { at } }), Date.parse(at));
  assert.equal(messageTimeAt({ metadata: { at: Date.parse(at) } }), Date.parse(at));
});

test("a reply from today shows only the clock time", () => {
  const now = new Date(2026, 2, 5, 20, 0).getTime();
  const sent = new Date(2026, 2, 5, 14, 32).getTime();
  assert.equal(formatMessageTime(sent, now), clock(sent));
});

test("the day boundary is the calendar day, not 24 hours", () => {
  const shortlyAfterMidnight = new Date(2026, 2, 5, 0, 1).getTime();
  const lastNight = new Date(2026, 2, 4, 23, 59).getTime();
  assert.equal(
    formatMessageTime(lastNight, shortlyAfterMidnight),
    tr("chat.timeYesterday", { time: clock(lastNight) }),
  );
});

test("replies from earlier this week keep the weekday, older ones show the date", () => {
  const now = new Date(2026, 2, 20, 12, 0).getTime();
  const thisWeek = new Date(2026, 2, 18, 9, 5).getTime();
  const sameWeek = formatMessageTime(thisWeek, now);
  assert.ok(sameWeek.endsWith(clock(thisWeek)));
  assert.equal(
    sameWeek,
    `${new Date(thisWeek).toLocaleDateString(tag, { weekday: "short" })} ${clock(thisWeek)}`,
  );

  const older = new Date(2026, 2, 2, 9, 5).getTime();
  const olderLabel = formatMessageTime(older, now);
  assert.equal(
    olderLabel,
    `${new Date(older).toLocaleDateString(tag, { month: "short", day: "numeric" })} ${clock(older)}`,
  );
});

test("a reply from another year spells the year out", () => {
  const now = new Date(2026, 2, 20, 12, 0).getTime();
  const lastYear = new Date(2025, 10, 7, 18, 40).getTime();
  assert.equal(
    formatMessageTime(lastYear, now),
    `${new Date(lastYear).toLocaleDateString(tag, { year: "numeric", month: "short", day: "numeric" })} ${clock(lastYear)}`,
  );
});

test("older replies are interpolated between the real timestamps around them", () => {
  const transcript = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
  const at = (minute: number) => Date.parse(`2026-03-05T09:${String(minute).padStart(2, "0")}:00`);
  const filled = interpolateMessageTimes(transcript, { a: at(0), e: at(40) });
  // 12 点整到 12 点 40 之间四条空档，按消息顺序平分。
  assert.deepEqual(
    ["b", "c", "d"].map((id) => filled[id]),
    [at(10), at(20), at(30)],
  );
  // 已有真实时间的消息不会被改写。
  assert.equal(filled.a, undefined);
  assert.equal(filled.e, undefined);
});

test("an earlier anchor stretches the range back without inventing time outside it", () => {
  const transcript = ["first", "second", "third"].map((id) => ({ id }));
  const firstSeen = Date.parse("2026-03-05T09:00:00");
  const taskCreated = Date.parse("2026-03-05T08:00:00");
  const filled = interpolateMessageTimes(transcript, { third: firstSeen }, [taskCreated]);
  assert.equal(filled.first, taskCreated);
  assert.equal(filled.second, (taskCreated + firstSeen) / 2);
});

test("a conversation with a single anchor stays blank instead of faking a time", () => {
  const transcript = ["a", "b", "c"].map((id) => ({ id }));
  assert.deepEqual(
    interpolateMessageTimes(transcript, { b: Date.parse("2026-03-05T09:00:00") }),
    {},
  );
  assert.deepEqual(interpolateMessageTimes(transcript, {}), {});
});

test("replies newer than the last real timestamp stay blank", () => {
  const transcript = ["a", "b", "c"].map((id) => ({ id }));
  const filled = interpolateMessageTimes(transcript, {
    a: Date.parse("2026-03-05T09:00:00"),
    b: Date.parse("2026-03-05T09:10:00"),
  });
  assert.equal(filled.c, undefined);
});

test("replies older than the first real timestamp stay blank without an earlier anchor", () => {
  const transcript = ["a", "b", "c", "d"].map((id) => ({ id }));
  const filled = interpolateMessageTimes(transcript, {
    c: Date.parse("2026-03-05T09:00:00"),
    d: Date.parse("2026-03-05T09:10:00"),
  });
  assert.equal(filled.a, undefined);
  assert.equal(filled.b, undefined);
});

test("a question takes the timestamp of the reply that follows it", () => {
  const transcript = [
    { id: "q1", role: "user" },
    { id: "a1", role: "assistant" },
    { id: "q2", role: "user" },
    { id: "a2", role: "assistant" },
  ];
  const first = Date.parse("2026-03-05T09:00:00");
  const second = Date.parse("2026-03-05T09:40:00");
  const filled = interpolateMessageTimes(transcript, { a1: first, a2: second });
  // 提问紧挨着回复，取回复时间；不是两者中间的 09:20。
  assert.equal(filled.q2, second);
});
