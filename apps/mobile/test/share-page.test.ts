import assert from "node:assert/strict";
import test from "node:test";
import { formatShareDay, parseSharedConversation } from "../src/share-page-model.ts";
import { isSharePath } from "../src/share-page-path.ts";

test("分享路径识别：命中服务端生成的 16 位 id", () => {
  assert.equal(isSharePath("/s/0GdKYjYZE1vGrgZ0"), "0GdKYjYZE1vGrgZ0");
  // 结尾带斜杠、id 含 base64url 的 `-` / `_` 都要能认出来。
  assert.equal(isSharePath("/s/aB-c_D12345678/"), "aB-c_D12345678");
});

test("分享路径识别：兼容部署在子路径下的情况", () => {
  assert.equal(isSharePath("/lingwu/s/0GdKYjYZE1vGrgZ0"), "0GdKYjYZE1vGrgZ0");
});

test("分享路径识别：其他路由不会被误判成分享页", () => {
  for (const pathname of ["/", "/s", "/s/", "/s/short", "/chats/s/0GdKYjYZE1vGrgZ0/x"])
    assert.equal(isSharePath(pathname), null, pathname);
});

test("分享正文解析：字段齐全时原样收下", () => {
  assert.deepEqual(
    parseSharedConversation({
      id: "0GdKYjYZE1vGrgZ0",
      question: "这只股票怎么样？",
      answer: "**估值偏高**。",
      createdAt: "2026-11-12T02:00:00.000Z",
    }),
    {
      id: "0GdKYjYZE1vGrgZ0",
      question: "这只股票怎么样？",
      answer: "**估值偏高**。",
      createdAt: "2026-11-12T02:00:00.000Z",
    },
  );
});

test("分享正文解析：缺 id 或缺正文一律拒绝，避免渲染空白页", () => {
  assert.equal(parseSharedConversation(null), null);
  assert.equal(parseSharedConversation("oops"), null);
  assert.equal(parseSharedConversation({ answer: "只有回答" }), null);
  assert.equal(parseSharedConversation({ id: "0GdKYjYZE1vGrgZ0" }), null);
});

test("分享正文解析：可选字段缺失时补默认值", () => {
  assert.deepEqual(parseSharedConversation({ id: "id-aaaaaaa", answer: "只有回答" }), {
    id: "id-aaaaaaa",
    question: "",
    answer: "只有回答",
    createdAt: "",
  });
});

test("页脚日期按本地时区格式化为 YYYY-MM-DD，非法时间不显示", () => {
  assert.match(formatShareDay("2026-11-12T02:00:00.000Z"), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(formatShareDay(""), "");
  assert.equal(formatShareDay("not-a-date"), "");
});
