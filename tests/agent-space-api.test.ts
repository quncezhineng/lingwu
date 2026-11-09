import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";

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

function agentState(name: string, threadId: string, currentAgentId = "system-agent") {
  return {
    version: 1,
    currentAgentId,
    agents: [
      {
        id: "system-agent",
        threadId: "main-thread",
        template: "general",
        name,
        role: "投研助理",
        persona: "先给结论，再说明依据。",
        avatar: "orb",
        system: true,
        threadExists: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        skills: ["research"],
        customSkills: [],
      },
      {
        id: `agent-${name}`,
        threadId,
        template: "custom",
        name: "研究 Agent",
        role: "研究员",
        persona: "只使用可核验的来源。",
        avatar: "moon",
        system: false,
        threadExists: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        skills: ["research", "files"],
        customSkills: [
          {
            id: "cash-flow",
            name: "现金流检查",
            purpose: "比较利润与现金流",
            instructions: "列出利润、经营现金流和应收账款的变化。",
            outputFormat: "结论、数据、疑点",
            enabled: true,
            version: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ],
    preferences: {
      name: "Ada",
      risk: "balanced",
      markets: ["A股"],
      areas: ["科技"],
      goal: "持续跟踪",
      horizon: "3 years",
    },
    onboardingDone: true,
    onboardingStep: 4,
  };
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-agent-space-"));
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

test("Agent space endpoints require an authenticated session", async () => {
  assert.equal((await server.app.request("/api/agent-space")).status, 401);
  assert.equal(
    (
      await server.app.request("/api/agent-space", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentState("Alice", "alice-thread")),
      })
    ).status,
    401,
  );
});

test("the Agent space contract rejects malformed and ambiguous states", async () => {
  const save = (body: unknown) =>
    server.app.request("/api/agent-space", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(body),
    });

  const invalidCurrent = agentState("Alice", "alice-thread", "missing-agent");
  assert.equal((await save(invalidCurrent)).status, 422);

  const duplicateThreads = agentState("Alice", "main-thread");
  assert.equal((await save(duplicateThreads)).status, 422);

  const twoSystems = agentState("Alice", "alice-thread");
  twoSystems.agents[1] = { ...twoSystems.agents[1], system: true };
  assert.equal((await save(twoSystems)).status, 422);

  assert.equal((await save({ ...agentState("Alice", "alice-thread"), version: 2 })).status, 422);
});

test("Agent spaces persist independently for each authenticated owner", async () => {
  const aliceState = agentState("Alice", "alice-thread");
  const bobState = agentState("Bob", "bob-thread");
  assert.equal(
    (
      await server.app.request("/api/agent-space", {
        method: "PUT",
        headers: headers(alice),
        body: JSON.stringify(aliceState),
      })
    ).status,
    200,
  );

  const aliceSaved = await (
    await server.app.request("/api/agent-space", { headers: headers(alice) })
  ).json();
  assert.deepEqual(aliceSaved, aliceState);
  assert.equal(
    await (await server.app.request("/api/agent-space", { headers: headers(bob) })).json(),
    null,
  );

  assert.equal(
    (
      await server.app.request("/api/agent-space", {
        method: "PUT",
        headers: headers(bob),
        body: JSON.stringify(bobState),
      })
    ).status,
    200,
  );
  assert.equal(
    (await server.app.request("/api/agent-space", { headers: headers(alice) })).headers.get(
      "content-type",
    ),
    "application/json",
  );
  assert.deepEqual(
    await (await server.app.request("/api/agent-space", { headers: headers(alice) })).json(),
    aliceState,
  );
  assert.deepEqual(
    await (await server.app.request("/api/agent-space", { headers: headers(bob) })).json(),
    bobState,
  );
});

test("the account-level skill library is accepted and persisted", async () => {
  const state = {
    ...agentState("Library", "library-thread"),
    skillLibrary: [
      {
        id: "library-skill",
        name: "估值复核",
        purpose: "复核 DCF 关键假设",
        instructions: "检查 WACC、终值增长率与收入 CAGR。",
        outputFormat: "结论、假设、疑点",
        enabled: true,
        version: 1,
        createdAt: "2026-11-08T00:00:00.000Z",
        updatedAt: "2026-11-08T00:00:00.000Z",
      },
    ],
  };
  const saved = await server.app.request("/api/agent-space", {
    method: "PUT",
    headers: headers(alice),
    body: JSON.stringify(state),
  });
  // 顶层 schema 是 .strict()：漏掉 skillLibrary 时新版客户端的整个状态会被判 422。
  assert.equal(saved.status, 200);
  assert.deepEqual(
    await (await server.app.request("/api/agent-space", { headers: headers(alice) })).json(),
    state,
  );
});

test("the saved Agent space survives an application restart", async () => {
  const restartRoot = await mkdtemp(join(tmpdir(), "lingwu-agent-space-restart-"));
  try {
    const dataDir = join(restartRoot, "db");
    let firstDb = await createStore({ dataDir });
    let firstServer = await createApp(firstDb, config(restartRoot));
    const token = (await firstServer.auth.issue("persistent-user")).token;
    const saved = agentState("Persistent", "persistent-thread");
    const response = await firstServer.app.request("/api/agent-space", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(saved),
    });
    assert.equal(response.status, 200);
    await firstServer.agent.stop();
    await firstDb.close();

    firstDb = await createStore({ dataDir });
    firstServer = await createApp(firstDb, config(restartRoot));
    const reopened = await firstServer.app.request("/api/agent-space", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(reopened.status, 200);
    assert.deepEqual(await reopened.json(), saved);
    await firstServer.agent.stop();
    await firstDb.close();
  } finally {
    await rm(restartRoot, { recursive: true, force: true });
  }
});
