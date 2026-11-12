import assert from "node:assert/strict";
import test from "node:test";
import { formatShareDay, parseSharedConversation } from "../src/share-page-model.ts";
import { isSharePath, parseSharePath } from "../src/share-page-path.ts";

test("分享路径识别：命中服务端生成的 16 位 id", () => {
  assert.equal(isSharePath("/s/0GdKYjYZE1vGrgZ0"), "0GdKYjYZE1vGrgZ0");
  // 结尾带斜杠、id 含 base64url 的 `-` / `_` 都要能认出来。
  assert.equal(isSharePath("/s/aB-c_D12345678/"), "aB-c_D12345678");
});

test("分享路径识别：兼容部署在子路径下的情况", () => {
  assert.equal(isSharePath("/lingwu/s/0GdKYjYZE1vGrgZ0"), "0GdKYjYZE1vGrgZ0");
});

test("分享路径识别：其他路由不会被误判成分享页", () => {
  for (const pathname of ["/", "/s", "/s/", "/chats/s/0GdKYjYZE1vGrgZ0/x"])
    assert.deepEqual(parseSharePath(pathname), { kind: "none" }, pathname);
});

test("分享路径识别：复制时粘上的尾随标点与引号不影响识别", () => {
  // 微信/邮件里复制链接，句末句号、右括号、中文句号、引号都常被一起带上。
  for (const pathname of [
    "/s/0GdKYjYZE1vGrgZ0.",
    "/s/0GdKYjYZE1vGrgZ0)",
    "/s/0GdKYjYZE1vGrgZ0。",
    "/s/0GdKYjYZE1vGrgZ0”",
    "/s/0GdKYjYZE1vGrgZ0'",
  ])
    assert.deepEqual(parseSharePath(pathname), { kind: "share", id: "0GdKYjYZE1vGrgZ0" }, pathname);
});

test("分享路径识别：百分号编码过的路径也能还原", () => {
  // `%73` 是 `s`：某些转发链路会把整条链接做一次编码。
  assert.deepEqual(parseSharePath("/%73/0GdKYjYZE1vGrgZ0"), {
    kind: "share",
    id: "0GdKYjYZE1vGrgZ0",
  });
});

test("分享路径识别：id 形状不对时报「链接不完整」，不退回首页", () => {
  // 关键回归：以前这种情况返回 null，App 会渲染工作区/登录页，看起来就是
  // 「分享链接点进去进不了页面」。现在必须显式区分出来。
  for (const pathname of [
    "/s/short",
    "/s/0GdKY jYZ",
    "/s/0GdKYjYZE1vGrgZ0extra-long-tail-over-limit",
  ])
    assert.deepEqual(parseSharePath(pathname), { kind: "broken" }, pathname);
  // `isSharePath` 保持旧语义：只认合法分享路径。
  assert.equal(isSharePath("/s/short"), null);
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
