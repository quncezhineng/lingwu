import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { isoWeekKey, NotesService } from "../apps/server/src/engine/notes.ts";
import type { InvestmentNote } from "../packages/domain/src/agent.ts";
import { MarketDataService } from "../packages/integrations/src/market-data.ts";

let db: Store;
let server: Awaited<ReturnType<typeof createApp>>;
let directory: string;
let token: string;
let config: Config;

const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
async function call<T>(path: string, init: RequestInit = {}, status = 200): Promise<T> {
  const response = await server.app.request(`/api${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  assert.equal(response.status, status, await response.clone().text());
  return response.json() as Promise<T>;
}
const post = <T>(path: string, body: unknown, status = 201) =>
  call<T>(path, { method: "POST", body: JSON.stringify(body) }, status);

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "lingwu-notes-"));
  db = await createStore({ dataDir: join(directory, "db") });
  config = {
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
  server = await createApp(db, config, {
    market: new MarketDataService({ akshare: null, onError: () => undefined }),
  });
  const session = await server.app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  token = (await session.json()).token;
});

beforeEach(async () => {
  await server.agent.stop();
  server = await createApp(db, config, {
    market: new MarketDataService({ akshare: null, onError: () => undefined }),
  });
  token = (
    await (
      await server.app.request("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).json()
  ).token;
});

after(async () => {
  await server?.agent?.stop();
  await db?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("notes API requires a session", async () => {
  assert.equal((await server.app.request("/api/notes")).status, 401);
});

test("creates a thesis note with ACTIVE status and a pending check", async () => {
  const note = await post<InvestmentNote>("/notes", {
    symbol_code: "aapl",
    type: "THESIS",
    content: "看好服务业务增长与现金流",
  });
  assert.equal(note.symbol_code, "AAPL");
  assert.equal(note.status, "ACTIVE");
  assert.equal(note.check?.outcome, "pending_confirmation");
  assert.equal(note.check?.source, "automated");
  assert.ok(note.last_checked_at);
});

test("validates thesis length and rejects status on non-thesis notes", async () => {
  await call(
    "/notes",
    {
      method: "POST",
      body: JSON.stringify({ symbol_code: "AAPL", type: "THESIS", content: "太短" }),
    },
    422,
  );
  await call(
    "/notes",
    {
      method: "POST",
      body: JSON.stringify({
        symbol_code: "AAPL",
        type: "RESEARCH",
        content: "研究心得",
        status: "VALIDATED",
      }),
    },
    422,
  );
});

test("filters notes by symbol, type and text", async () => {
  await post("/notes", { symbol_code: "TSLA", type: "BUY_REASON", content: "估值便宜" });
  await post("/notes", { symbol_code: "NVDA", type: "RESEARCH", content: "算力需求跟踪" });

  const bySymbol = await call<{ notes: InvestmentNote[] }>("/notes?symbol=tsla");
  assert.ok(bySymbol.notes.every((note) => note.symbol_code === "TSLA"));
  assert.ok(bySymbol.notes.some((note) => note.type === "BUY_REASON"));

  const byType = await call<{ notes: InvestmentNote[] }>("/notes?type=RESEARCH");
  assert.ok(byType.notes.every((note) => note.type === "RESEARCH"));

  const byText = await call<{ notes: InvestmentNote[] }>("/notes?q=算力需求");
  assert.equal(byText.notes.length, 1);
  assert.equal(byText.notes[0]?.symbol_code, "NVDA");
});

test("manual status updates mark the check as manual", async () => {
  const note = await post<InvestmentNote>("/notes", {
    symbol_code: "AAPL",
    type: "THESIS",
    content: "论点内容足够长可以验证",
  });
  const updated = await call<InvestmentNote>(`/notes/${note.id}`, {
    method: "PUT",
    body: JSON.stringify({ status: "VALIDATED" }),
  });
  assert.equal(updated.status, "VALIDATED");
  assert.equal(updated.check?.source, "manual");
  assert.equal(updated.check?.outcome, "valid");
});

test("weekly thesis check is idempotent and never overwrites manual status", async () => {
  // Use a dedicated owner so other tests' notes do not affect the counts.
  const owner = "thesis-owner";
  const notes = new NotesService(db);
  const manual = await notes.create(owner, {
    symbol_code: "AAPL",
    type: "THESIS",
    content: "手动确认过的论点内容",
  });
  await notes.update(owner, manual.id, { status: "VALIDATED" });
  await notes.create(owner, {
    symbol_code: "MSFT",
    type: "THESIS",
    content: "尚未确认的论点内容说明",
  });

  const now = new Date("2026-10-28T03:00:00Z");
  let notified = 0;
  const notify = async () => {
    notified++;
  };
  const first = await notes.runThesisCheck(owner, { now, notify });
  assert.equal(first.week, isoWeekKey(now));
  assert.equal(first.pending, 2);
  assert.equal(first.manual_updates, 1);
  assert.ok(first.items.every((item) => item.outcome === "pending_confirmation"));
  assert.equal(notified, 1);

  const second = await notes.runThesisCheck(owner, { now, notify });
  assert.equal(second.id, first.id);
  assert.equal(notified, 1, "same week must not notify twice");

  const stored = await notes.list(owner, { symbol: "AAPL" });
  assert.equal(stored[0]?.status, "VALIDATED");
  assert.equal(stored[0]?.check?.source, "manual");
});

test("thesis-check routes expose the latest record and next run", async () => {
  await post("/notes", { symbol_code: "AAPL", type: "THESIS", content: "论点内容足够长可以验证" });
  const check = await post<{ week: string; pending: number }>("/notes/thesis-check", {}, 200);
  assert.match(check.week, /^\d{4}-W\d{2}$/);
  assert.ok(check.pending >= 1);

  const latest = await call<{ check: { id: string } | null; next_run: string }>(
    "/notes/thesis-check/latest",
  );
  assert.ok(latest.check?.id);
  assert.match(latest.next_run, /T00:00:00\.000Z$/);
});

test("deletes a note and returns 404 afterwards", async () => {
  const note = await post<InvestmentNote>("/notes", {
    symbol_code: "AAPL",
    type: "BUY_REASON",
    content: "买入理由",
  });
  const deleted = await server.app.request(`/api/notes/${note.id}`, {
    method: "DELETE",
    headers: headers(),
  });
  assert.equal(deleted.status, 204);
  await call(`/notes/${note.id}`, { method: "PUT", body: JSON.stringify({ content: "x" }) }, 404);
});

test("note titles are optional, echoed back and capped at 80 characters", async () => {
  const note = await post<InvestmentNote>("/notes", {
    symbol_code: "AAPL",
    type: "BUY_REASON",
    title: "买入理由：服务业务",
    content: "服务业务增长稳定",
  });
  assert.equal(note.title, "买入理由：服务业务");

  await call(
    "/notes",
    {
      method: "POST",
      body: JSON.stringify({
        symbol_code: "AAPL",
        type: "BUY_REASON",
        title: "x".repeat(81),
        content: "y",
      }),
    },
    422,
  );

  const updated = await call<InvestmentNote>(`/notes/${note.id}`, {
    method: "PUT",
    body: JSON.stringify({ title: "更新后的标题" }),
  });
  assert.equal(updated.title, "更新后的标题");
});

test("per-note check history is newest first and exposes failed checks", async () => {
  const notes = new NotesService(db);
  const note = await notes.create("local-user", {
    symbol_code: "AAPL",
    type: "THESIS",
    content: "论点内容足够长可以验证",
  });
  await db.put("local-user", "thesis_checks", {
    id: "chk-ok",
    week: "2026-W44",
    checked_at: "2026-10-28T03:00:00.000Z",
    items: [
      {
        note_id: note.id,
        symbol_code: "AAPL",
        outcome: "pending_confirmation",
        source: "automated",
        check_status: "ok",
      },
    ],
    pending: 1,
    manual_updates: 0,
    note: "待确认",
  });
  await db.put("local-user", "thesis_checks", {
    id: "chk-failed",
    week: "2026-W45",
    checked_at: "2026-11-04T03:00:00.000Z",
    items: [
      {
        note_id: note.id,
        symbol_code: "AAPL",
        outcome: "pending_confirmation",
        source: "automated",
        check_status: "failed",
        error: "model timeout",
      },
    ],
    pending: 1,
    manual_updates: 0,
    note: "检验失败",
  });

  const history = await call<{
    checks: {
      week: string;
      checked_at: string;
      outcome: string;
      source: string;
      status: string;
      error?: string;
    }[];
  }>(`/notes/${note.id}/checks`);

  assert.equal(history.checks.length, 2);
  assert.equal(history.checks[0]?.status, "failed");
  assert.equal(history.checks[0]?.error, "model timeout");
  assert.equal(history.checks[1]?.status, "ok");
  assert.equal(history.checks[1]?.week, "2026-W44");

  const limited = await call<{ checks: unknown[] }>(`/notes/${note.id}/checks?limit=1`);
  assert.equal(limited.checks.length, 1);
  await call(`/notes/${note.id}/checks?limit=0`, {}, 422);
  await call("/notes/00000000-0000-0000-0000-000000000000/checks", {}, 404);
});
