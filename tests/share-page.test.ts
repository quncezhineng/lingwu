import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Hono } from "hono";
import { z } from "zod";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { shareApiRoutes, sharePageRoutes } from "../apps/server/src/share-routes.ts";

let db: Store;
let app: Hono<{ Variables: { owner: string } }>;

before(async () => {
  db = await createStore();
  app = new Hono<{ Variables: { owner: string } }>();
  // 测试里用固定 owner 代替鉴权中间件。
  app.use("/api/*", async (c, next) => {
    c.set("owner", "owner-1");
    await next();
  });
  // 与生产 app.ts 一致：校验失败返回 422，而不是 500。
  app.onError((error, c) =>
    error instanceof z.ZodError
      ? c.json({ error: error.issues.map((issue) => issue.message).join("; ") }, 422)
      : c.json({ error: "Request failed." }, 500),
  );
  app.route(
    "/api/shares",
    shareApiRoutes({
      store: db,
      config: { webUrl: "https://lingwu.test", publicUrl: "https://api.lingwu.test" },
    }),
  );
  app.route("/s", sharePageRoutes({ store: db, config: { webUrl: "https://lingwu.test", publicUrl: "https://api.lingwu.test" } }));
});

after(async () => {
  await db.close();
});

async function createShare(question: string, answer: string) {
  const response = await app.request("/api/shares", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, answer }),
  });
  assert.equal(response.status, 201);
  return (await response.json()) as { id: string; url: string };
}

test("创建分享返回指向前端域名的公开链接", async () => {
  const share = await createShare("这只股票怎么样？", "## 结论\n\n**估值偏高**。");
  assert.match(share.id, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(share.url, `https://lingwu.test/s/${share.id}`);
});

test("公开页面渲染提问与 Markdown 回复，且无需登录", async () => {
  const share = await createShare("这只股票怎么样？", "## 结论\n\n**估值偏高**，建议观望。");
  const response = await app.request(`/s/${share.id}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  const html = await response.text();
  assert.match(html, /这只股票怎么样？/);
  assert.match(html, /<h2>结论<\/h2>/);
  assert.match(html, /<strong>估值偏高<\/strong>/);
  assert.match(html, /由灵悟生成/);
  assert.match(html, /<a class="brand-home"/);
  assert.match(html, /href="https:\/\/lingwu\.test"/);
  assert.match(html, /target="_top"/);
  assert.match(html, /<img class="brand-logo" src="data:image\/svg\+xml,/);
});

test("提问里的 HTML 被转义，Markdown 里的原始 HTML 不生效", async () => {
  const share = await createShare(
    '<script>alert("x")</script>',
    "正文 <img src=x onerror=alert(1)> 结束",
  );
  const html = await (await app.request(`/s/${share.id}`)).text();
  assert.ok(!html.includes('<script>alert("x")</script>'));
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.ok(!html.includes("onerror=alert(1)>"));
});

test("不存在的 id 返回 404 页面", async () => {
  const response = await app.request("/s/doesnotexist1234");
  assert.equal(response.status, 404);
  assert.match(await response.text(), /这个分享不存在/);
});

test("非法 id 形状直接 404", async () => {
  const response = await app.request("/s/%20%20");
  assert.equal(response.status, 404);
});

test("缺少回复正文时拒绝创建", async () => {
  const response = await app.request("/api/shares", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "只有提问" }),
  });
  assert.equal(response.status, 422);
});

test("提问为空时仍可分享（不渲染提问区块）", async () => {
  const share = await createShare("", "只有回答。");
  const html = await (await app.request(`/s/${share.id}`)).text();
  assert.ok(!html.includes('class="ask"'));
  assert.match(html, /只有回答。/);
});
