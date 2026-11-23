import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { AgentTask } from "../packages/domain/src/agent.ts";
import type { AgentActionLogEntry } from "../packages/domain/src/audit.ts";

let db: Store;
let server: Awaited<ReturnType<typeof createApp>>;
let directory: string;
let token: string;

const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
async function call<T>(path: string, init: RequestInit = {}, status = 200): Promise<T> {
  const response = await server.app.request(`/api${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  assert.equal(response.status, status, await response.clone().text());
  return response.json() as Promise<T>;
}
const post = <T>(path: string, body: unknown, status = 200) =>
  call<T>(path, { method: "POST", body: JSON.stringify(body) }, status);

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-audit-"));
  db = await createStore({ dataDir: join(directory, "db") });
  const config: Config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    intelligenceApiKey: "test-project-key-never-sent",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  server = await createApp(db, config);
  const session = await server.app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey: undefined }),
  });
  const body = (await session.json()) as { token?: string };
  assert.ok(body.token, "session must return a token");
  token = body.token;
});

after(async () => {
  await server?.agent?.stop();
  await db?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("审计接口：派发任务后能在审计日志里查到，并撤销掉", async () => {
  const task = await post<AgentTask>(
    "/agent/tasks",
    { title: "研究 英伟达", prompt: "研究 英伟达", kind: "research", input: { symbol: "NVDA" } },
    201,
  );

  const actions = await call<AgentActionLogEntry[]>("/audit/actions");
  const entry = actions.find((item) => item.refs?.taskId === task.id);
  assert.ok(entry, "task dispatch must be audited");
  assert.equal(entry.kind, "task");
  assert.equal(entry.actor, "user");
  assert.equal(entry.revocable, true);
  assert.equal(entry.target?.symbol, "NVDA");
  assert.match(entry.action, /研究 英伟达/);

  const revoked = await post<{ entry: AgentActionLogEntry; undone: boolean; note: string }>(
    `/audit/actions/${entry.id}/revoke`,
    {},
  );
  assert.equal(revoked.undone, true);
  assert.equal(revoked.entry.outcome, "revoked");
  assert.match(revoked.note, /任务已取消/);

  // 撤销是真的取消了任务，而不只是改了个标记。
  const refreshed = await call<{ task: AgentTask }>(`/agent/tasks/${task.id}`);
  assert.equal(refreshed.task.status, "cancelled");

  // 默认列表不含已撤销的条目。
  const after = await call<AgentActionLogEntry[]>("/audit/actions");
  assert.equal(
    after.some((item) => item.id === entry.id),
    false,
  );
  const withRevoked = await call<AgentActionLogEntry[]>("/audit/actions?includeRevoked=true");
  assert.equal(
    withRevoked.some((item) => item.id === entry.id),
    true,
  );
});

test("审计接口：按标的筛选，非法参数直接 422", async () => {
  await post<AgentTask>(
    "/agent/tasks",
    { title: "整理账单", prompt: "整理账单", kind: "finance" },
    201,
  );
  const all = await call<AgentActionLogEntry[]>("/audit/actions");
  assert.ok(all.length >= 1);
  // 上一条 NVDA 任务已经被撤销，默认列表不含它，所以要显式带上已撤销的一起筛。
  const nvda = await call<AgentActionLogEntry[]>("/audit/actions?symbol=NVDA&includeRevoked=true");
  assert.ok(nvda.length >= 1);
  assert.ok(nvda.every((item) => item.target?.symbol === "NVDA"));
  await call("/audit/actions?kind=nonsense", {}, 422);
});
