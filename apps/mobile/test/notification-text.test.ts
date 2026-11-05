import assert from "node:assert/strict";
import { test } from "node:test";
import { notificationExcerpt } from "../src/notification-text.ts";

test("去掉字面量 \\n 与 Markdown 标记，压成一行", () => {
  const body = "已完成贵州茅台（600519.SH）深度研究：\\n\\n1) 最新财报\\n2) **估值** 22x";
  assert.equal(
    notificationExcerpt(body),
    "已完成贵州茅台（600519.SH）深度研究： 1) 最新财报 2) 估值 22x",
  );
});

test("超长正文截断并补省略号", () => {
  const body = "市场简报：".repeat(40);
  const excerpt = notificationExcerpt(body, 20);
  assert.equal(excerpt.length, 20);
  assert.ok(excerpt.endsWith("…"));
});

test("短文本原样返回，空文本返回空串", () => {
  assert.equal(notificationExcerpt("  简短通知  "), "简短通知");
  assert.equal(notificationExcerpt(""), "");
});

test("链接只保留文字，图片标记被丢弃", () => {
  assert.equal(notificationExcerpt("详见[报告](https://example.com/a)。"), "详见报告。");
});
