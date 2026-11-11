import assert from "node:assert/strict";
import test from "node:test";
import {
  botHasUnread,
  botMatchesQuery,
  latestBotPreview,
  orderBotsByActivity,
  rubberBandOffset,
} from "../src/mobile-bots.ts";

test("the bots home preview is the latest user or assistant line", () => {
  const preview = latestBotPreview([
    { role: "user", content: "你好", createdAt: "2026-11-11T08:00:00.000Z" },
    { role: "tool", content: "ignored" },
    { role: "assistant", content: "今天 **伦敦金** 在回调", createdAt: "2026-11-11T09:00:00.000Z" },
  ]);
  assert.deepEqual(preview, {
    text: "今天 **伦敦金** 在回调",
    at: "2026-11-11T09:00:00.000Z",
  });
  assert.equal(latestBotPreview([{ role: "tool", content: "only a tool" }]), null);
  assert.deepEqual(latestBotPreview([{ role: "assistant", content: "  没有时间  " }]), {
    text: "没有时间",
  });
});

test("unread is an in-app notification tied to that bot's task", () => {
  const tasks = [
    { id: "task-a", threadId: "thread-a" },
    { id: "task-b", threadId: "thread-b" },
  ];
  const notifications = [
    { read: false, taskId: "task-a" },
    { read: true, taskId: "task-b" },
  ];
  assert.equal(botHasUnread("thread-a", false, tasks, notifications), true);
  assert.equal(botHasUnread("thread-b", false, tasks, notifications), false);
  assert.equal(botHasUnread("thread-c", false, tasks, notifications), false);
});

test("pulling past the edge resists instead of following the finger one-to-one", () => {
  assert.equal(rubberBandOffset(0, 800), 0);
  assert.equal(rubberBandOffset(120, 0), 0);
  const pulled = rubberBandOffset(200, 800);
  assert.ok(pulled > 0 && pulled < 200);
  assert.equal(rubberBandOffset(-200, 800), -pulled);
});

test("search matches the name, role, or preview and activity sorts newest first", () => {
  assert.equal(botMatchesQuery({ name: "小悟", role: "投研助理" }, "伦敦金", "伦敦"), true);
  assert.equal(botMatchesQuery({ name: "小悟", role: "投研助理" }, "伦敦金", "观察"), false);
  assert.equal(botMatchesQuery({ name: "小悟", role: "投研助理" }, "", "  "), true);
  assert.deepEqual(
    orderBotsByActivity([{ id: "old" }, { id: "quiet" }, { id: "new" }], {
      old: "2026-11-10T00:00:00.000Z",
      new: "2026-11-11T00:00:00.000Z",
    }).map((bot) => bot.id),
    ["new", "old", "quiet"],
  );
});
