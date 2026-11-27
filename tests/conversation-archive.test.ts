import assert from "node:assert/strict";
import { test } from "node:test";
import { EventType } from "@ag-ui/core";
import { lastValueFrom, of } from "rxjs";
import {
  ARCHIVE_KIND,
  type ArchivedMessage,
  ConversationArchive,
  messageText,
} from "../apps/server/src/conversation-archive.ts";
import { createStore } from "../apps/server/src/db.ts";

/** 归档是 fire-and-forget 的旁路，测试里轮询等到落库完成。 */
async function waitFor<T>(read: () => Promise<T | null>): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < 2000) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("timed out waiting for the archived message");
}

test("user questions are archived with their full text", async () => {
  const db = await createStore();
  const archive = new ConversationArchive(db);
  await archive.userMessage("alice", "thread-1", { id: "u1", content: "帮我看看这份财报" });
  const saved = await db.get<ArchivedMessage>("alice", ARCHIVE_KIND, "u1");
  assert.equal(saved?.role, "user");
  assert.equal(saved?.threadId, "thread-1");
  assert.equal(saved?.text, "帮我看看这份财报");
  assert.ok(saved?.at, "归档要带时间戳");
});

test("assistant replies are assembled from the event stream and archived on end", async () => {
  const db = await createStore();
  const archive = new ConversationArchive(db);
  await lastValueFrom(
    archive.observe(
      "alice",
      "thread-1",
      of(
        { type: EventType.TEXT_MESSAGE_START, messageId: "a1", role: "assistant" } as const,
        { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "a1", delta: "灵悟" } as const,
        { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "a1", delta: "很好用" } as const,
        { type: EventType.TEXT_MESSAGE_END, messageId: "a1" } as const,
      ),
    ),
  );
  const saved = await waitFor(() => db.get<ArchivedMessage>("alice", ARCHIVE_KIND, "a1"));
  assert.equal(saved.role, "assistant");
  assert.equal(saved.text, "灵悟很好用");
});

test("interleaved messages never bleed into each other", async () => {
  const db = await createStore();
  const archive = new ConversationArchive(db);
  await lastValueFrom(
    archive.observe(
      "alice",
      "thread-1",
      of(
        { type: EventType.TEXT_MESSAGE_START, messageId: "a1", role: "assistant" } as const,
        { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "a2", delta: "第二条" } as const,
        { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "a1", delta: "第一条" } as const,
        { type: EventType.TEXT_MESSAGE_END, messageId: "a1" } as const,
        { type: EventType.TEXT_MESSAGE_END, messageId: "a2" } as const,
      ),
    ),
  );
  // 缺 START 的第二条也要按空串起头，不能把正文丢掉。
  const first = await waitFor(() => db.get<ArchivedMessage>("alice", ARCHIVE_KIND, "a1"));
  const second = await waitFor(() => db.get<ArchivedMessage>("alice", ARCHIVE_KIND, "a2"));
  assert.equal(first.text, "第一条");
  assert.equal(second.text, "第二条");
});

test("empty messages are not archived", async () => {
  const db = await createStore();
  const archive = new ConversationArchive(db);
  await archive.userMessage("alice", "thread-1", { id: "u-empty", content: "" });
  await lastValueFrom(
    archive.observe(
      "alice",
      "thread-1",
      of(
        { type: EventType.TEXT_MESSAGE_START, messageId: "a-empty", role: "assistant" } as const,
        { type: EventType.TEXT_MESSAGE_END, messageId: "a-empty" } as const,
      ),
    ),
  );
  assert.deepEqual(await db.list("alice", ARCHIVE_KIND), []);
});

test("messageText reads both plain strings and text parts", () => {
  assert.equal(messageText("纯文本"), "纯文本");
  assert.equal(
    messageText([
      { type: "text", text: "带" },
      { type: "image", url: "https://example.com/a.png" },
      { type: "text", content: "附件" },
    ]),
    "带附件",
  );
  assert.equal(messageText(undefined), "");
});

test("backfill writes history messages without inventing a timestamp", async () => {
  const db = await createStore();
  const archive = new ConversationArchive(db);
  const wrote = await archive.backfill("alice", "thread-old", {
    id: "history-1",
    role: "assistant",
    content: "很久以前的回复",
  });
  assert.equal(wrote, true);
  const saved = await db.get<ArchivedMessage>("alice", ARCHIVE_KIND, "history-1");
  assert.equal(saved?.role, "assistant");
  assert.equal(saved?.text, "很久以前的回复");
  assert.equal(saved?.backfilled, true);
  // 历史消息没有可靠时间，宁可空着也不写「现在」。
  assert.equal(saved?.at, undefined);
});

test("allOwners() lists each owner once so backfill can walk them", async () => {
  const db = await createStore();
  assert.deepEqual(await db.allOwners(), []);
  await db.put("bob", "settings", { id: "model", model: "x" });
  await db.put("alice", ARCHIVE_KIND, { id: "m1", threadId: "t", role: "user", text: "hi" });
  await db.put("bob", "notes", { id: "n1" });
  assert.deepEqual(await db.allOwners(), ["alice", "bob"]);
});

test("backfill skips tool messages, empty content and reruns safely", async () => {
  const db = await createStore();
  const archive = new ConversationArchive(db);
  assert.equal(
    await archive.backfill("alice", "t", { id: "tool-1", role: "tool", content: "结果" }),
    false,
  );
  assert.equal(
    await archive.backfill("alice", "t", { id: "blank-1", role: "user", content: "" }),
    false,
  );
  // 同一 id 重复回填只覆盖、不产生第二条。
  await archive.backfill("alice", "t", { id: "dup-1", role: "user", content: "问一次" });
  await archive.backfill("alice", "t", { id: "dup-1", role: "user", content: "问一次" });
  const all = await db.list<ArchivedMessage>("alice", ARCHIVE_KIND);
  assert.equal(all.length, 1);
  assert.equal(all[0]?.id, "dup-1");
});
