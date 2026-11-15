import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { Channel } from "../packages/domain/src/channel.ts";

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
