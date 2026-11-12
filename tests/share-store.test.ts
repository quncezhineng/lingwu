/**
 * 分享持久化：本地库 + Supabase 双写/回表的契约。
 *
 * 这些用例锁住的是「分享链接不能因为某一边坏掉就失效」这条产品承诺：
 * Supabase 挂了要退回本地、本地被重建了要能从远端补回来。
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { createShareStore, type ShareRecord } from "../apps/server/src/share-store.ts";

/** 只填分享存储关心的两个字段，其余用断言绕过 Config 的完整形状。 */
const withSupabase = () =>
  ({ supabaseUrl: "https://example.supabase.co", supabaseServiceRoleKey: "service-key" }) as Config;
const withoutSupabase = () => ({}) as Config;

const record = (id = "abcdefgh12345678"): ShareRecord => ({
  id,
  question: "这只股票怎么样？",
  answer: "**估值偏高**。",
  createdAt: "2026-11-12T02:00:00.000Z",
});

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
const realFetch = globalThis.fetch;

/** 用可控的假 fetch 顶掉真实网络，避免测试连到 example.supabase.co。 */
function stubFetch(handler: (call: Call) => Promise<Response> | Response): void {
  calls = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
}

const ok = (body: unknown = null) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

let dir = "";
let db: Store;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "lingwu-share-"));
  db = await createStore({ dataDir: join(dir, "db") });
});

after(async () => {
  globalThis.fetch = realFetch;
  await db.close();
  await rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
  calls = [];
  globalThis.fetch = realFetch;
});

test("未配置 Supabase 时退化为纯本地，读写都不发网络请求", async () => {
  const shares = createShareStore({ db, config: withoutSupabase() });
  await shares.put("owner-a", record());

  assert.deepEqual(await shares.get("abcdefgh12345678"), record());
  assert.equal(calls.length, 0);
});

test("配置 Supabase 后写入双写：远端 upsert，本地同时可读", async () => {
  stubFetch(() => ok());
  const shares = createShareStore({ db, config: withSupabase() });
  await shares.put("owner-a", record("remote0000000001"));

  assert.equal(calls.length, 1);
  const [call] = calls;
  const headers = call.init?.headers as Record<string, string>;
  assert.match(call.url, /\/rest\/v1\/lingwu_shares$/);
  assert.equal(call.init?.method, "POST");
  // upsert 语义：重试同一个 id 不会因为主键冲突失败。
  assert.match(headers.Prefer, /merge-duplicates/);
  assert.equal(headers.apikey, "service-key");
  const body = JSON.parse(String(call.init?.body)) as Record<string, unknown>;
  assert.equal(body.id, "remote0000000001");
  assert.equal(body.owner, "owner-a");
  assert.equal(body.answer, "**估值偏高**。");
  assert.equal(body.created_at, "2026-11-12T02:00:00.000Z");

  // 本地已经写入，读的时候不必再打远端。
  calls = [];
  assert.equal((await shares.get("remote0000000001"))?.answer, "**估值偏高**。");
  assert.equal(calls.length, 0);
});

test("本地被重建后，能从 Supabase 回表并把记录补回本地", async () => {
  stubFetch((call) => {
    assert.match(call.url, /lingwu_shares\?id=eq\.legacy00000000001/);
    return ok([
      {
        id: "legacy00000000001",
        owner: "owner-old",
        question: "老问题",
        answer: "老回答",
        created_at: "2026-11-01T08:00:00+00:00",
      },
    ]);
  });
  const shares = createShareStore({ db, config: withSupabase() });

  const found = await shares.get("legacy00000000001");
  assert.deepEqual(found, {
    id: "legacy00000000001",
    question: "老问题",
    answer: "老回答",
    createdAt: "2026-11-01T08:00:00+00:00",
  });

  // 回填是后台动作，等一个微任务再读本地。
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await shares.get("legacy00000000001"))?.answer, "老回答");
  assert.equal(calls.length, 1, "回填之后不应该再查远端");
});

test("Supabase 写入失败不阻断分享：本地已存住就照常返回", async () => {
  stubFetch(() => new Response("boom", { status: 500 }));
  const shares = createShareStore({ db, config: withSupabase() });

  await shares.put("owner-b", record("fail000000000001"));
  // 本地仍然读得到，链接不会因为远端故障而失效。
  assert.equal((await shares.get("fail000000000001"))?.question, "这只股票怎么样？");
});

test("远端网络异常时读取退回本地，不抛错", async () => {
  const shares = createShareStore({ db, config: withSupabase() });
  await shares.put("owner-c", record("net0000000000001"));

  stubFetch(() => {
    throw new TypeError("network down");
  });
  // 换一个只存在于本地的进程视角之外也没关系：本地命中就不会走网络。
  assert.equal((await shares.get("net0000000000001"))?.answer, "**估值偏高**。");

  // 本地没有的 id：远端抛错要当作「没有」，不能把公开页打崩。
  assert.equal(await shares.get("missing0000000001"), null);
});

test("远端行形状不对时当作没有，避免渲染空白页", async () => {
  stubFetch(() =>
    ok([{ id: "bad0000000000001", owner: "owner-d", created_at: "2026-11-12T02:00:00Z" }]),
  );
  const shares = createShareStore({ db, config: withSupabase() });
  assert.equal(await shares.get("bad0000000000001"), null);
});

test("远端返回空数组时按不存在处理", async () => {
  stubFetch(() => ok([]));
  const shares = createShareStore({ db, config: withSupabase() });
  assert.equal(await shares.get("gone0000000000001"), null);
});
