/**
 * P1-F2 单测：笔记/论点解析、日期分组、论点排序、mock 兜底与无模型降级。
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { LingWuApi } from "../src/api.ts";
import {
  bucketOf,
  createNote,
  groupNotesByDate,
  type InvestmentNote,
  loadNotes,
  newestCheckEntry,
  notesSnapshot,
  parseNote,
  parseNoteChecks,
  parseThesisCheck,
  runThesisCheck,
  sortTheses,
  updateNote,
} from "../src/notes.ts";

function fakeApi(handler: (path: string, body?: unknown, method?: string) => unknown): LingWuApi {
  return {
    token: "test-token",
    request: async (path: string, body?: unknown, method?: string) =>
      handler(path, body, method ?? (body === undefined ? "GET" : "POST")),
  } as unknown as LingWuApi;
}

const NOTE_PAYLOAD = {
  id: "n-1",
  symbol_code: "AAPL",
  type: "THESIS",
  title: "服务收入占比",
  content: "服务业务将在 2027 年贡献 30% 营收。",
  status: "ACTIVE",
  check: {
    outcome: "pending_confirmation",
    source: "automated",
    checked_at: "2026-10-26T08:00:00.000Z",
    note: "未配置模型，未生成结论。",
  },
  last_checked_at: "2026-10-26T08:00:00.000Z",
  created_at: "2026-10-25T09:00:00.000Z",
  updated_at: "2026-10-26T08:00:00.000Z",
};

test("笔记解析：B3 契约字段与「待人工确认」检验态", () => {
  const note = parseNote(NOTE_PAYLOAD);
  assert.ok(note);
  assert.equal(note?.symbolCode, "AAPL");
  assert.equal(note?.type, "THESIS");
  assert.equal(note?.title, "服务收入占比");
  assert.equal(note?.status, "ACTIVE");
  assert.equal(note?.check?.outcome, "pending_confirmation");
  assert.equal(note?.check?.source, "automated");
  assert.equal(note?.check?.note, "未配置模型，未生成结论。");
  assert.equal(parseNote({ id: "x" }), undefined);
});

test("检验记录解析：items 与 pending/manual_updates", () => {
  const record = parseThesisCheck({
    id: "c-1",
    week: "2026-W43",
    checked_at: "2026-10-26T08:00:00.000Z",
    pending: 2,
    manual_updates: 1,
    note: "部分论点待人工确认。",
    items: [
      {
        note_id: "n-1",
        symbol_code: "AAPL",
        outcome: "pending_confirmation",
        source: "automated",
        previous_status: "ACTIVE",
      },
      { note_id: "n-2", symbol_code: "TSLA", outcome: "valid", source: "manual" },
      { bad: true },
    ],
  });
  assert.ok(record);
  assert.equal(record?.items.length, 2);
  assert.equal(record?.pending, 2);
  assert.equal(record?.items[0]?.previousStatus, "ACTIVE");
  assert.equal(record?.items[1]?.source, "manual");
});

test("检验历史：按时间倒序，failed 保留原因而非结论", () => {
  const checks = parseNoteChecks({
    checks: [
      {
        week: "2026-W43",
        checked_at: "2026-10-20T08:00:00.000Z",
        outcome: "pending_confirmation",
        source: "automated",
        status: "ok",
      },
      {
        week: "2026-W44",
        checked_at: "2026-10-27T08:00:00.000Z",
        outcome: "invalid",
        source: "automated",
        status: "failed",
        error: "model timeout",
      },
    ],
  });
  assert.equal(checks.length, 2);
  assert.equal(checks[0]?.week, "2026-W44");
  assert.equal(checks[0]?.status, "failed");
  assert.equal(checks[0]?.error, "model timeout");
  assert.equal(checks[1]?.status, "ok");
  assert.equal(parseNoteChecks({ checks: [{ outcome: "weird" }] }).length, 0);
  assert.equal(newestCheckEntry(checks)?.week, "2026-W44");
});

test("日期分组：今天/昨天/本周/更早", () => {
  const now = new Date();
  const iso = (daysAgo: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(10, 0, 0, 0);
    return date.toISOString();
  };
  assert.equal(bucketOf(iso(0)), "today");
  assert.equal(bucketOf(iso(1)), "yesterday");
  assert.equal(bucketOf(iso(3)), "week");
  assert.equal(bucketOf(iso(20)), "earlier");
  const base = (id: string, createdAt: string): InvestmentNote => ({
    id,
    symbolCode: "AAPL",
    type: "RESEARCH",
    content: id,
    createdAt,
    updatedAt: createdAt,
  });
  const groups = groupNotesByDate([base("a", iso(0)), base("b", iso(20)), base("c", iso(3))]);
  assert.equal(groups.today.length, 1);
  assert.equal(groups.earlier.length, 1);
  assert.equal(groups.week.length, 1);
});

test("论点排序：待人工确认优先，其次待验证/成立/不成立/已过期", () => {
  const note = (
    id: string,
    status: InvestmentNote["status"],
    outcome?: NonNullable<InvestmentNote["check"]>["outcome"],
  ): InvestmentNote => ({
    id,
    symbolCode: "AAPL",
    type: "THESIS",
    content: id,
    status,
    check: outcome
      ? { outcome, source: "automated", checkedAt: "2026-10-26T08:00:00.000Z" }
      : undefined,
    createdAt: "2026-10-25T08:00:00.000Z",
    updatedAt: "2026-10-25T08:00:00.000Z",
  });
  const sorted = sortTheses([
    note("expired", "EXPIRED"),
    note("invalid", "INVALIDATED"),
    note("valid", "VALIDATED"),
    note("pending", "ACTIVE"),
    note("confirm", "ACTIVE", "pending_confirmation"),
  ]);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["confirm", "pending", "valid", "invalid", "expired"],
  );
});

test("接口不可用时回落 mock 且不伪造结论", async () => {
  const api = fakeApi(() => {
    throw new Error("offline");
  });
  await loadNotes(api, true);
  const state = notesSnapshot();
  assert.equal(state.source, "mock");
  assert.ok(state.notes.length >= 8);
  const pending = state.notes.find((note) => note.check?.outcome === "pending_confirmation");
  assert.ok(pending);
  assert.equal(pending?.status, "ACTIVE");
  const record = await runThesisCheck(api);
  assert.ok(record.items.length >= 1);
  assert.equal(record.pending, 1);
});

test("标题可选：创建时写入，清空后回退正文摘要", async () => {
  const api = fakeApi(() => {
    throw new Error("offline");
  });
  const created = await createNote(api, {
    symbolCode: "AAPL",
    type: "RESEARCH",
    title: "  毛利率修复  ",
    content: "正文内容",
  });
  assert.equal(created.title, "毛利率修复");
  const cleared = await updateNote(api, created.id, { title: "" });
  assert.equal(cleared.title, undefined);
});
