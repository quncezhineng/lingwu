import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { ConversationAgent } from "../apps/server/src/engine/conversation.ts";
import { modelProviders } from "../apps/server/src/models.ts";
import type { ModelSettings } from "../packages/domain/src/model-settings.ts";
import { decryptSecret } from "../packages/integrations/src/vault.ts";

const gateway = createServer(async (request, response) => {
  const buffers = [];
  for await (const chunk of request) buffers.push(chunk);
  const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : undefined;
  requests.push({ path: request.url, key: request.headers.authorization, body });
  if (redirect) {
    response.writeHead(302, { Location: `${baseUrl}/leaked` });
    response.end();
    return;
  }
  if (failureStatus) {
    response.writeHead(failureStatus, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ error: { message: `echoed secret ${request.headers.authorization}` } }),
    );
    return;
  }
  if (request.url?.endsWith("/models")) {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ data: [{ id: "deepseek-flash" }, { id: "deepseek-v4-pro" }] }));
    return;
  }
  const task = body?.tools?.some(
    (tool: { function?: { name: string } }) => tool.function?.name === "finish_task",
  );
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const emit = (delta: unknown, finish_reason: string | null = null) =>
    response.write(
      `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
    );
  emit({
    role: "assistant",
    ...(task
      ? {
          tool_calls: [
            {
              index: 0,
              id: "finish-1",
              type: "function",
              function: {
                name: "finish_task",
                arguments: JSON.stringify({ summary: "Personal task completed." }),
              },
            },
          ],
        }
      : { content: "Personal model reply." }),
  });
  emit({}, task ? "tool_calls" : "stop");
  response.end("data: [DONE]\n\n");
});

let db: Store,
  server: Awaited<ReturnType<typeof createApp>>,
  config: Config,
  directory: string,
  baseUrl: string;
let alice: string, bob: string, previousKey: string | undefined;
let failureStatus = 0;
let redirect = false;
const requests: { path?: string; key?: string; body?: { model: string } }[] = [];
const key = "sk-alice-private-test-key";
const input = () => ({ provider: "deepseek", model: "deepseek-flash", apiKey: key });
async function request(
  token: string,
  method = "GET",
  body?: unknown,
  path = "/api/model/settings",
) {
  return server.app.request(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function save(token = alice, body = input()) {
  const response = await request(token, "PUT", body);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json() as Promise<ModelSettings>;
}

before(async () => {
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");
  const address = gateway.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
  directory = await mkdtemp(join(tmpdir(), "lingwu-personal-model-"));
  db = await createStore({ dataDir: join(directory, "postgres") });
  previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "server-key";
  config = {
    mode: "sample",
    agentBackend: "model",
    model: "deepseek/deepseek-v4-pro",
    deepseekBaseUrl: baseUrl,
    encryptionKey: randomBytes(32).toString("base64"),
    dataDir: directory,
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    intelligenceApiKey: "test-project-key-never-sent",
    allowedOrigins: [],
    webSearchEnabled: false,
  };
  server = await createApp(db, config);
  alice = (await server.auth.issue("alice")).token;
  bob = (await server.auth.issue("bob")).token;
});
beforeEach(async () => {
  failureStatus = 0;
  redirect = false;
  requests.length = 0;
  for (const owner of ["alice", "bob"]) {
    await db.remove(owner, "credentials", "model:deepseek");
    await db.remove(owner, "settings", "model");
  }
});
after(async () => {
  await server?.agent.stop();
  await db?.close();
  gateway.closeAllConnections();
  await new Promise<void>((resolve) => gateway.close(() => resolve()));
  if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = previousKey;
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("all model settings operations require authentication", async () => {
  for (const [method, path] of [
    ["GET", "/api/model/settings"],
    ["PUT", "/api/model/settings"],
    ["DELETE", "/api/model/settings"],
    ["POST", "/api/model/settings/test"],
  ]) {
    assert.equal(
      (
        await server.app.request(path, {
          method,
          body: method === "PUT" || method === "POST" ? JSON.stringify(input()) : undefined,
        })
      ).status,
      401,
    );
  }
});

test("connection testing does not persist; saving encrypts a write-only key and isolates users", async () => {
  assert.equal((await request(alice, "POST", input(), "/api/model/settings/test")).status, 200);
  assert.equal(await db.get("alice", "credentials", "model:deepseek"), null);
  const result = await save();
  assert.equal(result.source, "personal");
  assert.equal(result.hasApiKey, true);
  assert.doesNotMatch(JSON.stringify(result), /sk-alice|secret|apiKey/);
  const stored = await db.get<{ secret: string }>("alice", "credentials", "model:deepseek");
  assert.ok(stored);
  assert.ok(stored?.secret.startsWith("v1."));
  assert.doesNotMatch(JSON.stringify(stored), /sk-alice/);
  assert.equal(decryptSecret(stored.secret, config.encryptionKey ?? ""), key);
  const [a, b] = await Promise.all([
    request(alice, "GET", undefined, "/api/workspace"),
    request(bob, "GET", undefined, "/api/workspace"),
  ]);
  const aliceWorkspace = await a.json(),
    bobWorkspace = await b.json();
  assert.equal(aliceWorkspace.runtime.model, "deepseek/deepseek-flash");
  assert.equal(bobWorkspace.runtime.model, "deepseek/deepseek-v4-pro");
  assert.doesNotMatch(JSON.stringify(aliceWorkspace), /sk-alice|server-key/);
  assert.equal((await (await request(bob)).json()).hasApiKey, false);
  assert.equal(config.model, "deepseek/deepseek-v4-pro");
});

test("failed validation never overwrites a working configuration or leaks provider errors", async () => {
  await save();
  failureStatus = 401;
  const response = await request(alice, "PUT", { ...input(), apiKey: "invalid-secret" });
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "modelSettings.authenticationFailed" });
  const resolved = await server.workspace.models.resolve("alice");
  assert.equal(resolved.connection?.apiKey, key);
  failureStatus = 0;
  assert.equal((await request(alice, "PUT", { ...input(), model: "missing-model" })).status, 422);
});

test("blank keys retain the user's provider credential while model selection changes", async () => {
  await save();
  assert.equal(
    (await request(alice, "PUT", { ...input(), apiKey: "", model: "deepseek-v4-pro" })).status,
    200,
  );
  assert.equal((await server.workspace.models.resolve("alice")).connection?.apiKey, key);
  assert.equal((await server.workspace.models.resolve("alice")).model, "deepseek/deepseek-v4-pro");
});

test("provider parameters are shared while credentials and model references remain user scoped", async () => {
  await save();
  await save(bob, { ...input(), apiKey: "sk-bob-key" });
  const stored = await db.get<Record<string, unknown>>("alice", "credentials", "model:deepseek");
  assert.equal(stored?.baseUrl, undefined);
  assert.equal(stored?.model, undefined);
  assert.equal(stored?.modelId, "deepseek-flash");
  config.deepseekBaseUrl = `${baseUrl}/shared`;
  try {
    const [a, b] = await Promise.all([
      server.workspace.models.resolve("alice"),
      server.workspace.models.resolve("bob"),
    ]);
    assert.equal(a.connection?.baseUrl, `${baseUrl}/shared`);
    assert.equal(b.connection?.baseUrl, `${baseUrl}/shared`);
    assert.equal(a.connection?.apiKey, key);
    assert.equal(b.connection?.apiKey, "sk-bob-key");
    const catalogue = await (await request(alice)).json();
    assert.equal(catalogue.providers[0].id, "deepseek");
    assert.equal(catalogue.providers[0].models.length, 2);
  } finally {
    config.deepseekBaseUrl = baseUrl;
  }
});

test("users cannot override shared endpoints or submit unknown providers, models or malformed keys", async () => {
  for (const url of [
    "http://169.254.169.254/latest/meta-data",
    "https://api.deepseek.com.attacker.test/v1",
    "https://user:password@api.deepseek.com/v1",
    "https://api.deepseek.com/v1?secret=x",
    "file:///etc/passwd",
  ]) {
    assert.equal((await request(alice, "PUT", { ...input(), baseUrl: url })).status, 422);
  }
  assert.equal((await request(alice, "PUT", { ...input(), apiKey: "bad\r\nheader" })).status, 422);
  assert.equal((await request(alice, "PUT", { ...input(), provider: "unknown" })).status, 422);
  assert.equal(
    (await request(alice, "PUT", { ...input(), model: "custom/not-in-catalogue" })).status,
    422,
  );
  assert.equal(requests.length, 0);
});

test("configuration persists across application restart; removal restores only this user's default", async () => {
  await save();
  await save(bob, { ...input(), apiKey: "sk-bob-key", model: "deepseek-v4-pro" });
  const restarted = await createApp(db, { ...config });
  try {
    assert.equal((await restarted.workspace.models.resolve("alice")).connection?.apiKey, key);
  } finally {
    await restarted.agent.stop();
  }
  assert.equal((await request(alice, "DELETE")).status, 200);
  const resolved = await server.workspace.models.resolve("alice");
  assert.equal(resolved.source, "server");
  assert.equal(resolved.connection, undefined);
  assert.equal((await server.workspace.models.resolve("bob")).connection?.apiKey, "sk-bob-key");
});

test("chat and delegated work actually use the owner's key, URL and model without global mutations", async () => {
  await save();
  await save(bob, { ...input(), apiKey: "sk-bob-key", model: "deepseek-v4-pro" });
  requests.length = 0;
  const run = (owner: string) =>
    new Promise<string>((resolve, reject) => {
      const events: unknown[] = [];
      new ConversationAgent(config, server.agent, owner)
        .run({
          threadId: randomUUID(),
          runId: randomUUID(),
          messages: [{ id: randomUUID(), role: "user", content: "Say hello" }],
          state: {},
          tools: [],
          context: [],
          forwardedProps: {},
        })
        .subscribe({
          next: (event) => events.push(event),
          error: reject,
          complete: () => resolve(JSON.stringify(events)),
        });
    });
  const replies = await Promise.all([run("alice"), run("bob")]);
  for (const reply of replies) {
    assert.match(reply, /Personal model reply/);
    assert.doesNotMatch(reply, /sk-alice|sk-bob/);
  }
  const task = await server.agent.createTask("alice", { prompt: "Complete the sample task" });
  await server.agent.worker.tick();
  const finished = await server.agent.getTask("alice", task.id);
  assert.equal(finished.status, "succeeded", finished.error ?? finished.question);
  assert.equal(finished.result, "Personal task completed.");
  const calls = requests.filter((request) => request.path === "/v1/chat/completions");
  assert.ok(
    calls.some((call) => call.key === `Bearer ${key}` && call.body?.model === "deepseek-flash"),
  );
  assert.ok(
    calls.some(
      (call) => call.key === "Bearer sk-bob-key" && call.body?.model === "deepseek-v4-pro",
    ),
  );
  assert.ok(
    calls.filter((call) => call.key === `Bearer ${key}`).length >= 2,
    "both chat and task use the personal configuration",
  );
  assert.equal(config.model, "deepseek/deepseek-v4-pro");
});

test("personal settings work without a server model key", async () => {
  await save();
  const previous = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    assert.equal((await server.workspace.snapshot("alice")).runtime.configured, true);
    assert.equal((await server.workspace.snapshot("bob")).runtime.configured, false);
  } finally {
    process.env.DEEPSEEK_API_KEY = previous;
  }
});

test("configured-model pickers merge server providers with the current user's saved providers", async () => {
  await save();
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "configured-server-key";
  try {
    const snapshot = await server.workspace.snapshot("alice");
    assert.ok(snapshot.runtime.modelOptions?.some((choice) => choice.provider === "openai"));
    assert.ok(snapshot.runtime.modelOptions?.some((choice) => choice.provider === "deepseek"));
    assert.equal(snapshot.runtime.modelLabels?.["deepseek/deepseek-flash"], "DeepSeek-Flash");
    assert.equal(snapshot.runtime.model, "deepseek/deepseek-flash");
    assert.doesNotMatch(JSON.stringify(snapshot), /configured-server-key|sk-alice/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("inactive personal providers remain selectable without exposing another user's providers", async () => {
  modelProviders.push({
    id: "fixture",
    label: "Fixture provider",
    key: "LINGWU_TEST_PROVIDER_KEY",
    models: ["deepseek-flash"],
    personal: { protocol: "openai-chat-completions", defaultBaseUrl: baseUrl },
  });
  try {
    await save();
    await save(alice, { ...input(), provider: "fixture", apiKey: "sk-fixture-personal" });
    const choices = await server.workspace.models.choices("alice");
    assert.ok(choices.some((choice) => choice.provider === "deepseek"));
    assert.ok(choices.some((choice) => choice.provider === "fixture"));
    assert.ok(
      !(await server.workspace.models.choices("bob")).some(
        (choice) => choice.provider === "fixture",
      ),
    );
    await server.workspace.models.select("alice", "deepseek/deepseek-flash");
    assert.equal((await server.workspace.models.resolve("alice")).connection?.apiKey, key);
    await server.workspace.models.select("alice", "fixture/deepseek-flash");
    assert.equal(
      (await server.workspace.models.resolve("alice")).connection?.apiKey,
      "sk-fixture-personal",
    );
  } finally {
    modelProviders.pop();
    await db.remove("alice", "credentials", "model:fixture");
    await db.remove("alice", "settings", "model");
  }
});

test("personal model selection through the existing picker preserves the user's encrypted key", async () => {
  await save();
  const response = await request(
    alice,
    "POST",
    { model: "deepseek/deepseek-v4-pro" },
    "/api/model",
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await server.workspace.models.resolve("alice")).model, "deepseek/deepseek-v4-pro");
  assert.equal((await server.workspace.models.resolve("alice")).connection?.apiKey, key);
  assert.equal((await server.workspace.models.resolve("bob")).source, "server");
});

test("provider redirects cannot forward a key and missing encryption refuses storage", async () => {
  redirect = true;
  const response = await request(alice, "PUT", input());
  assert.equal(response.status, 422);
  assert.equal(requests.length, 1);
  assert.equal(await db.get("alice", "credentials", "model:deepseek"), null);
  redirect = false;
  const previous = config.encryptionKey;
  config.encryptionKey = undefined;
  try {
    const response = await request(alice, "PUT", input());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "modelSettings.encryptionUnavailable");
    assert.equal((await (await request(alice)).json()).canConfigure, false);
  } finally {
    config.encryptionKey = previous;
  }
});
