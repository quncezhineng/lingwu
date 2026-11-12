import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { type BaseEvent, EventType } from "@ag-ui/core";
import { from, lastValueFrom, toArray } from "rxjs";
import { coalesceTextChunks } from "../apps/server/src/engine/coalesce-text.ts";

interface CapturedReply {
  messageId: string;
  deltas: string[];
  text: string;
}

const captured = JSON.parse(
  readFileSync(new URL("./fixtures/xiaowu-7388e0ff-deltas.json", import.meta.url), "utf8"),
) as CapturedReply;

const chunk = (delta: string, messageId = captured.messageId) =>
  ({ type: EventType.TEXT_MESSAGE_CHUNK, messageId, role: "assistant", delta }) as BaseEvent;

test("captured 小悟 deltas concatenate to the intact reply", () => {
  assert.equal(captured.deltas.join(""), captured.text);
  assert.equal(captured.deltas.length, 1438);
  assert.match(captured.text, /2026 三季报（财通证券）/);
  assert.match(captured.text, /ROE \*\*32\.0%\*\*/);
  assert.match(captured.text, /\*\*要往下走，请您给我三个信息：\*\*/);
});

test("coalescing the captured burst does not drop, duplicate, or reorder characters", async () => {
  const events = await lastValueFrom(
    coalesceTextChunks(from(captured.deltas.map((delta) => chunk(delta)))).pipe(toArray()),
  );
  const merged = events.map((event) => (event as { delta?: string }).delta ?? "").join("");
  assert.equal(merged, captured.text);
  assert.ok(events.length < 80, `expected a short burst, got ${events.length}`);
  assert.ok(events.length > 1, "the reply still streams in more than one piece");
  for (const event of events) assert.equal(event.type, EventType.TEXT_MESSAGE_CHUNK);
});

test("a non-text event flushes the buffer without swallowing the event", async () => {
  const tool = { type: EventType.TOOL_CALL_START, toolCallId: "call-1" } as BaseEvent;
  const events = await lastValueFrom(
    coalesceTextChunks(from([chunk("202"), chunk("6"), tool, chunk(" 三")]), 100).pipe(toArray()),
  );
  assert.deepEqual(
    events.map((event) => (event as { delta?: string }).delta ?? event.type),
    ["2026", EventType.TOOL_CALL_START, " 三"],
  );
});
