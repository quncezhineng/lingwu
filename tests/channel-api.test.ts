import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { Channel, ChannelMessage } from "../packages/domain/src/channel.ts";

type App = Awaited<ReturnType<typeof createApp>>;

let directory: string;
let db: Store;
let server: App;
let alice: string;
let bob: string;

function config(dataDir: string): Config {
  return {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir,
    agentBackend: "sample",
    intelligenceApiKey: "test-project-key-never-sent",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: [],
  };
}

function headers(token = alice) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-channel-"));
  db = await createStore({ dataDir: join(directory, "db") });
  server = await createApp(db, config(directory));
  alice = (await server.auth.issue("alice")).token;
  bob = (await server.auth.issue("bob")).token;
});

after(async () => {
  await server.agent.stop();
  await db.close();
  await rm(directory, { recursive: true, force: true });
});

test("channel endpoints require an authenticated session", async () => {
  assert.equal((await server.app.request("/api/channels")).status, 401);
  assert.equal(
    (
      await server.app.request("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "投研群", agentIds: ["a", "b"] }),
      })
    ).status,
    401,
  );
});

test("create, list, update and delete a channel", async () => {
  const created = await server.app.request("/api/channels", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: "新能源投研组",
      agentIds: ["agent-research", "agent-macro", "agent-risk"],
      description: "研究新能源标的",
    }),
  });
  assert.equal(created.status, 201);
  const channel = (await created.json()) as Channel;
  assert.equal(channel.name, "新能源投研组");
  assert.equal(channel.agentIds.length, 3);

  const listed = (await (
    await server.app.request("/api/channels", { headers: headers() })
  ).json()) as Channel[];
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, channel.id);

  const updated = await server.app.request(`/api/channels/${channel.id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ name: "新能源投研组 v2" }),
  });
  assert.equal(updated.status, 200);
  assert.equal(((await updated.json()) as Channel).name, "新能源投研组 v2");

  const deleted = await server.app.request(`/api/channels/${channel.id}`, {
    method: "DELETE",
    headers: headers(),
  });
  assert.equal(deleted.status, 200);
  const empty = (await (
    await server.app.request("/api/channels", { headers: headers() })
  ).json()) as Channel[];
  assert.equal(empty.length, 0);
});

test("channel validation rejects fewer than two members", async () => {
  const res = await server.app.request("/api/channels", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name: "单人频道", agentIds: ["only-one"] }),
  });
  assert.equal(res.status, 422);
});

test("channels are isolated per owner", async () => {
  await server.app.request("/api/channels", {
    method: "POST",
    headers: headers(alice),
    body: JSON.stringify({ name: "Alice 的频道", agentIds: ["a", "b"] }),
  });
  const bobList = (await (
    await server.app.request("/api/channels", { headers: headers(bob) })
  ).json()) as Channel[];
  assert.equal(bobList.length, 0);
});

test("home previews require a session and stay per owner", async () => {
  assert.equal((await server.app.request("/api/home/previews")).status, 401);
  const bobPreviews = (await (
    await server.app.request("/api/home/previews", { headers: headers(bob) })
  ).json()) as { channels: Record<string, unknown>; agents: Record<string, unknown> };
  // Bob 没有任何频道、也没有智能体空间，预览应为空，看不到 Alice 的数据。
  assert.deepEqual(Object.keys(bobPreviews.channels), []);
  assert.deepEqual(Object.keys(bobPreviews.agents), []);
});

test("home previews return every channel once, trimmed and capped", async () => {
  const created = await server.app.request("/api/channels", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name: "预览频道", agentIds: ["a", "b"] }),
  });
  const channel = (await created.json()) as Channel;
  // 塞满大字段（工具过程、附件），验证预览会裁剪掉，只留文案需要的四个字段。
  const message = (index: number): ChannelMessage => ({
    id: `m-${String(index).padStart(3, "0")}`,
    channelId: channel.id,
    role: index % 2 === 0 ? "user" : "member",
    text: `第 ${index} 条`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    tools: [{ id: `tool-${index}`, name: "search", args: { q: "x" } }],
    attachmentIds: ["file-1"],
  });
  const total = 35;
  for (let index = 0; index < total; index += 1)
    await db.put("alice", "channel_messages", message(index));

  const response = await server.app.request("/api/home/previews", { headers: headers() });
  assert.equal(response.status, 200);
  const previews = (await response.json()) as {
    channels: Record<string, { id: string; role: string; text: string; createdAt: string }[]>;
    agents: Record<string, unknown[]>;
  };
  const list = previews.channels[channel.id];
  // 只回最近 30 条（共 35 条），并按时间升序，末尾是最新一条。
  assert.equal(list.length, 30);
  assert.equal(list[0].id, "m-005");
  assert.equal(list.at(-1)?.id, "m-034");
  // 裁剪：工具过程与附件不回传。
  assert.deepEqual(Object.keys(list[0]).sort(), ["createdAt", "id", "role", "text"]);
});
