import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { CopilotKitIntelligence } from "@copilotkit/runtime/v2";
import { createApp } from "../apps/server/src/app.ts";
import {
  ConversationHistory,
  conversationHistoryPage,
} from "../apps/server/src/conversation-history.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";

const messages = Array.from({ length: 45 }, (_, i) => [
  { id: `user-${i}`, role: "user", content: `Question ${i}` },
  {
    id: `assistant-${i}`,
    role: "assistant",
    content: `Answer ${i}`,
    toolCalls: [
      { id: `call-${i}`, type: "function", function: { name: "browse_web", arguments: "{}" } },
    ],
  },
  { id: `tool-${i}`, role: "tool", toolCallId: `call-${i}`, content: `Result ${i}` },
]).flat();

test("latest page includes 30 visible messages with complete tool results", () => {
  const page = conversationHistoryPage(messages, { limit: 30 });
  assert.deepEqual(page.messages, messages.slice(90));
  assert.equal(page.before, "user-30");
  assert.equal(page.hasMore, true);
});

test("exclusive cursors reach the beginning without holes or duplicate messages", () => {
  const newest = conversationHistoryPage(messages, { limit: 30 });
  assert.ok(newest.before);
  const middle = conversationHistoryPage(messages, { limit: 30, before: newest.before });
  assert.ok(middle.before);
  const oldest = conversationHistoryPage(messages, { limit: 30, before: middle.before });
  assert.deepEqual([...oldest.messages, ...middle.messages, ...newest.messages], messages);
  assert.equal(oldest.hasMore, false);
  assert.equal(oldest.before, null);
});

test("appending live messages does not move an older history cursor", () => {
  const page = conversationHistoryPage(messages, { limit: 30 });
  const appended = [...messages, { id: "live", role: "user", content: "New question" }];
  assert.ok(page.before);
  assert.deepEqual(
    conversationHistoryPage(appended, { limit: 30, before: page.before }).messages,
    messages.slice(45, 90),
  );
  assert.throws(() => conversationHistoryPage(messages, { limit: 30, before: "missing" }), {
    status: 409,
  });
});

test("empty, short and tool-only transcripts terminate pagination", () => {
  for (const input of [[], messages.slice(0, 3), messages.filter((m) => m.role === "tool")]) {
    const page = conversationHistoryPage(input, { limit: 30 });
    assert.deepEqual(page.messages, input);
    assert.equal(page.hasMore, false);
  }
});

test("pages share one cloud snapshot, scoped by owner and invalidated by new events or expiry", async () => {
  let reads = 0,
    version = 0,
    now = 0;
  const history = new ConversationHistory(
    async () => {
      reads += 1;
      return messages;
    },
    async () => version,
    () => now,
  );
  await Promise.all([history.messages("owner", "thread"), history.messages("owner", "thread")]);
  await history.messages("owner", "thread");
  assert.equal(reads, 1);
  await history.messages("another-owner", "thread");
  assert.equal(reads, 2);
  version += 1;
  await history.messages("owner", "thread");
  assert.equal(reads, 3);
  now = 30_001;
  await history.messages("owner", "thread");
  assert.equal(reads, 4);
});

test("failed cloud snapshots can be retried instead of caching an empty transcript", async () => {
  let reads = 0;
  const history = new ConversationHistory(
    async () => {
      if (++reads === 1) throw new Error("Unavailable");
      return messages;
    },
    async () => 0,
  );
  await assert.rejects(history.messages("owner", "thread"));
  assert.deepEqual(await history.messages("owner", "thread"), messages);
  assert.equal(reads, 2);
});

test("an in-flight old snapshot cannot hide a reply that just completed", async () => {
  let version = 0;
  const resolvers: ((value: typeof messages) => void)[] = [];
  const history = new ConversationHistory(
    () => new Promise<typeof messages>((resolve) => resolvers.push(resolve)),
    async () => version,
  );
  const old = history.messages("owner", "thread");
  await Promise.resolve();
  version = 1;
  const fresh = history.messages("owner", "thread");
  await Promise.resolve();
  assert.equal(resolvers.length, 2);
  const latest = [...messages, { id: "new", role: "user", content: "Latest" }];
  resolvers[1](latest);
  assert.deepEqual(await fresh, latest);
  resolvers[0](messages);
  await old;
  assert.deepEqual(await history.messages("owner", "thread"), latest);
});

let db: Store, directory: string, token: string;
let server: Awaited<ReturnType<typeof createApp>>;
const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-history-"));
  db = await createStore();
  server = await createApp(db, {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "sample",
    intelligenceApiKey: "test-project-key-never-sent",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  });
  const session = await server.app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  token = (await session.json()).token;
});
after(async () => {
  await server.agent.stop();
  await db.close();
  await rm(directory, { recursive: true, force: true });
});

test("paginated cloud history always uses the authenticated owner", async (t) => {
  const calls: unknown[] = [];
  t.mock.method(CopilotKitIntelligence.prototype, "getThreadMessages", async (input: unknown) => {
    calls.push(input);
    return { messages };
  });
  const response = await server.app.request(
    "/api/conversation/threads/thread-1/messages?userId=forged",
    { headers: headers() },
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).messages, messages.slice(90));
  assert.deepEqual(calls, [{ threadId: "thread-1", userId: "local-user" }]);
  const older = await server.app.request(
    "/api/conversation/threads/thread-1/messages?before=user-30",
    { headers: headers() },
  );
  assert.deepEqual((await older.json()).messages, messages.slice(45, 90));
  for (const query of ["limit=0", "limit=101", "limit=no", "before="]) {
    assert.equal(
      (
        await server.app.request(`/api/conversation/threads/thread-1/messages?${query}`, {
          headers: headers(),
        })
      ).status,
      422,
    );
  }
});

test("history failures are not mistaken for an empty conversation", async (t) => {
  t.mock.method(CopilotKitIntelligence.prototype, "getThreadMessages", async () => {
    throw new Error("Unavailable");
  });
  assert.equal(
    (
      await server.app.request("/api/conversation/threads/unavailable/messages", {
        headers: headers(),
      })
    ).status,
    502,
  );
  assert.equal(
    (await server.app.request("/api/conversation/threads/thread-1/messages")).status,
    401,
  );
});

test("legacy pagination preserves the full transcript for subsequent saves", async () => {
  await db.put("local-user", "conversations", { id: "default", messages });
  const latest = await server.app.request("/api/conversation?limit=30", { headers: headers() });
  assert.deepEqual((await latest.json()).messages, messages.slice(90));
  const full = await server.app.request("/api/conversation", { headers: headers() });
  assert.deepEqual((await full.json()).messages, messages);
  assert.deepEqual(
    (await db.get<{ messages: unknown[] }>("local-user", "conversations", "default"))?.messages,
    messages,
  );
});
