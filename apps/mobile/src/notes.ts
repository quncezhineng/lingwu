/**
 * 投资笔记与论点追踪（P1-F2）数据层。
 *
 * 后端 B3 契约：
 * - GET    /api/notes?symbol&type&q&limit → { notes: InvestmentNote[] }
 * - POST   /api/notes → 201 InvestmentNote
 * - PUT    /api/notes/:id → InvestmentNote
 * - DELETE /api/notes/:id → 204
 * - GET    /api/notes/thesis-check/latest → { check: ThesisCheckRecord|null, next_run }
 * - POST   /api/notes/thesis-check → ThesisCheckRecord
 *
 * 类型：BUY_REASON / SELL_REASON / RESEARCH / THESIS；
 * 状态：ACTIVE（待验证）/ VALIDATED（成立）/ INVALIDATED（不成立）/ EXPIRED（已过期）；
 * 检验：outcome valid|invalid|inconclusive|pending_confirmation，source automated|manual。
 * UI 绝不依据 outcome 自动改写 status。
 */
import { useSyncExternalStore } from "react";
import type { LingWuApi } from "./api";

export type NoteType = "BUY_REASON" | "SELL_REASON" | "RESEARCH" | "THESIS";
export type ThesisStatus = "ACTIVE" | "VALIDATED" | "INVALIDATED" | "EXPIRED";
export type CheckOutcome = "valid" | "invalid" | "inconclusive" | "pending_confirmation";

export interface NoteCheck {
  outcome: CheckOutcome;
  source: "automated" | "manual";
  checkedAt: string;
  note?: string;
}

/** 单条论点检验记录（GET /api/notes/:id/checks）。failed 表示检验本身失败。 */
export interface NoteCheckEntry extends NoteCheck {
  week: string;
  status: "ok" | "failed";
  error?: string;
}

export interface InvestmentNote {
  id: string;
  symbolCode: string;
  type: NoteType;
  title?: string;
  content: string;
  status?: ThesisStatus;
  check?: NoteCheck;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ThesisCheckItem {
  noteId: string;
  symbolCode: string;
  outcome: CheckOutcome;
  source: "automated" | "manual";
  note?: string;
  previousStatus?: ThesisStatus;
  status?: ThesisStatus;
}

export interface ThesisCheckRecord {
  id: string;
  week: string;
  checkedAt: string;
  items: ThesisCheckItem[];
  pending: number;
  manualUpdates: number;
  note: string;
}

export type NotesSource = "mock" | "api";

export const NOTE_TYPES: NoteType[] = ["BUY_REASON", "SELL_REASON", "RESEARCH", "THESIS"];
export const THESIS_STATUSES: ThesisStatus[] = ["ACTIVE", "VALIDATED", "INVALIDATED", "EXPIRED"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function noteType(value: unknown): NoteType | undefined {
  return value === "BUY_REASON" ||
    value === "SELL_REASON" ||
    value === "RESEARCH" ||
    value === "THESIS"
    ? value
    : undefined;
}

function thesisStatus(value: unknown): ThesisStatus | undefined {
  return value === "ACTIVE" ||
    value === "VALIDATED" ||
    value === "INVALIDATED" ||
    value === "EXPIRED"
    ? value
    : undefined;
}

function checkOutcome(value: unknown): CheckOutcome | undefined {
  return value === "valid" ||
    value === "invalid" ||
    value === "inconclusive" ||
    value === "pending_confirmation"
    ? value
    : undefined;
}

export function parseNote(value: unknown): InvestmentNote | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const symbolCode = str(value.symbol_code) ?? str(value.symbolCode);
  const type = noteType(value.type);
  const content = str(value.content);
  if (!id || !symbolCode || !type || !content) return undefined;
  const checkRaw = isRecord(value.check) ? value.check : undefined;
  const outcome = checkRaw ? checkOutcome(checkRaw.outcome) : undefined;
  const source = checkRaw?.source === "manual" ? "manual" : checkRaw ? "automated" : undefined;
  const checkedAt = checkRaw ? (str(checkRaw.checked_at) ?? str(checkRaw.checkedAt)) : undefined;
  return {
    id,
    symbolCode,
    type,
    title: str(value.title),
    content,
    status: thesisStatus(value.status),
    check:
      outcome && source && checkedAt
        ? {
            outcome,
            source,
            checkedAt,
            note: str(checkRaw?.note),
          }
        : undefined,
    lastCheckedAt: str(value.last_checked_at) ?? str(value.lastCheckedAt),
    createdAt: str(value.created_at) ?? str(value.createdAt) ?? new Date().toISOString(),
    updatedAt: str(value.updated_at) ?? str(value.updatedAt) ?? new Date().toISOString(),
  };
}

export function parseThesisCheck(value: unknown): ThesisCheckRecord | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  if (!id) return undefined;
  const items = Array.isArray(value.items)
    ? value.items.flatMap((item) => {
        if (!isRecord(item)) return [];
        const noteId = str(item.note_id) ?? str(item.noteId);
        const symbolCode = str(item.symbol_code) ?? str(item.symbolCode);
        const outcome = checkOutcome(item.outcome);
        if (!noteId || !symbolCode || !outcome) return [];
        return [
          {
            noteId,
            symbolCode,
            outcome,
            source: item.source === "manual" ? ("manual" as const) : ("automated" as const),
            note: str(item.note),
            previousStatus: thesisStatus(item.previous_status),
            status: thesisStatus(item.status),
          },
        ];
      })
    : [];
  return {
    id,
    week: str(value.week) ?? "",
    checkedAt: str(value.checked_at) ?? str(value.checkedAt) ?? new Date().toISOString(),
    items,
    pending: typeof value.pending === "number" ? value.pending : 0,
    manualUpdates: typeof value.manual_updates === "number" ? value.manual_updates : 0,
    note: str(value.note) ?? "",
  };
}

/** 解析检验历史；failed 记录保留 error，绝不映射成「不成立」。 */
export function parseNoteChecks(payload: unknown): NoteCheckEntry[] {
  const raw = isRecord(payload) && Array.isArray(payload.checks) ? payload.checks : [];
  return raw
    .flatMap((entry): NoteCheckEntry[] => {
      if (!isRecord(entry)) return [];
      const outcome = checkOutcome(entry.outcome);
      const checkedAt = str(entry.checked_at) ?? str(entry.checkedAt);
      if (!outcome || !checkedAt) return [];
      return [
        {
          outcome,
          source: entry.source === "manual" ? "manual" : "automated",
          checkedAt,
          note: str(entry.note),
          week: str(entry.week) ?? "",
          status: entry.status === "failed" ? "failed" : "ok",
          error: str(entry.error),
        },
      ];
    })
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
}

/* ------------------------------------------------------------------ *
 * mock 数据
 * ------------------------------------------------------------------ */

function daysAgo(days: number, hour = 9, minute = 12) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function mockNotes(): InvestmentNote[] {
  const pendingCheck: NoteCheck = {
    outcome: "pending_confirmation",
    source: "automated",
    checkedAt: daysAgo(1, 8, 0),
    note: "未配置模型，未生成结论；请人工确认论点是否仍成立。",
  };
  return [
    {
      id: "note-1",
      symbolCode: "AAPL",
      type: "BUY_REASON",
      content: "建仓理由：服务业务增速超预期，估值回到 25x 以下，现金流质量稳定。",
      createdAt: daysAgo(0, 14, 20),
      updatedAt: daysAgo(0, 14, 20),
    },
    {
      id: "note-2",
      symbolCode: "AAPL",
      type: "THESIS",
      content: "服务业务将在 2027 年贡献 30% 营收，且毛利率高于硬件业务。",
      status: "ACTIVE",
      check: pendingCheck,
      lastCheckedAt: pendingCheck.checkedAt,
      createdAt: daysAgo(1, 9, 12),
      updatedAt: daysAgo(1, 9, 12),
    },
    {
      id: "note-3",
      symbolCode: "TSLA",
      type: "THESIS",
      content: "FSD 订阅收入将在 2027 年成为第二增长曲线。",
      status: "ACTIVE",
      check: {
        outcome: "valid",
        source: "automated",
        checkedAt: daysAgo(1, 8, 0),
        note: "最近两个季度 FSD 递延收入环比增长，订阅渗透率提升。",
      },
      lastCheckedAt: daysAgo(1, 8, 0),
      createdAt: daysAgo(2, 11, 5),
      updatedAt: daysAgo(1, 8, 0),
    },
    {
      id: "note-4",
      symbolCode: "600519.SS",
      type: "THESIS",
      content: "高端白酒需求韧性仍在，渠道库存将在年内回到合理区间。",
      status: "VALIDATED",
      check: {
        outcome: "valid",
        source: "manual",
        checkedAt: daysAgo(3, 10, 0),
        note: "人工确认：批价企稳，动销环比改善。",
      },
      lastCheckedAt: daysAgo(3, 10, 0),
      createdAt: daysAgo(6, 15, 30),
      updatedAt: daysAgo(3, 10, 0),
    },
    {
      id: "note-5",
      symbolCode: "MSFT",
      type: "THESIS",
      content: "云业务增速将连续四个季度回升至 30% 以上。",
      status: "INVALIDATED",
      check: {
        outcome: "invalid",
        source: "automated",
        checkedAt: daysAgo(4, 8, 0),
        note: "最近一个季度云业务增速回落至 26%，未达论点条件。",
      },
      lastCheckedAt: daysAgo(4, 8, 0),
      createdAt: daysAgo(9, 16, 40),
      updatedAt: daysAgo(4, 8, 0),
    },
    {
      id: "note-6",
      symbolCode: "NVDA",
      type: "THESIS",
      content: "数据中心资本开支周期将在 2026 年见顶。",
      status: "EXPIRED",
      createdAt: daysAgo(15, 10, 10),
      updatedAt: daysAgo(12, 9, 0),
    },
    {
      id: "note-7",
      symbolCode: "600519.SS",
      type: "RESEARCH",
      content: "渠道调研：三季度回款进度正常，经销商库存约 1.5 个月，低于去年同期。",
      createdAt: daysAgo(5, 17, 5),
      updatedAt: daysAgo(5, 17, 5),
    },
    {
      id: "note-8",
      symbolCode: "TSLA",
      type: "SELL_REASON",
      content: "减仓理由：短期估值透支，交付量增速放缓，先锁定部分收益。",
      createdAt: daysAgo(20, 13, 45),
      updatedAt: daysAgo(20, 13, 45),
    },
  ];
}

function mockCheck(notes: InvestmentNote[]): ThesisCheckRecord {
  const theses = notes.filter((note) => note.type === "THESIS");
  return {
    id: "check-mock-1",
    week: "2026-W43",
    checkedAt: daysAgo(1, 8, 0),
    pending: theses.filter((note) => note.check?.outcome === "pending_confirmation").length,
    manualUpdates: 0,
    note: "部分论点因未配置模型标记为待人工确认。",
    items: theses.map((note) => ({
      noteId: note.id,
      symbolCode: note.symbolCode,
      outcome: note.check?.outcome ?? "inconclusive",
      source: note.check?.source ?? "automated",
      note: note.check?.note,
      status: note.status,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * store
 * ------------------------------------------------------------------ */

interface NotesState {
  status: "loading" | "ready";
  notes: InvestmentNote[];
  source: NotesSource;
  error?: string;
  check?: ThesisCheckRecord;
  nextRun?: string;
  checkLoading?: boolean;
}

let state: NotesState = { status: "loading", notes: [], source: "mock" };
const listeners = new Set<() => void>();
let loadKey = "";
let loadRequest: Promise<void> | undefined;
let checkRequest: Promise<void> | undefined;

function setState(next: Partial<NotesState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNotesState() {
  return useSyncExternalStore(subscribe, () => state);
}

/** 非 React 环境（单测/脚本）读取当前快照。 */
export function notesSnapshot() {
  return state;
}

function seedMock(error?: string) {
  const notes = mockNotes();
  setState({
    status: "ready",
    notes,
    source: "mock",
    error,
    check: mockCheck(notes),
    nextRun: daysAgo(-4, 8, 0),
  });
}

export function loadNotes(api: LingWuApi, force = false): Promise<void> {
  const key = api.token;
  if (!force && state.status === "ready" && loadKey === key) return Promise.resolve();
  if (loadRequest) return loadRequest;
  if (!state.notes.length) setState({ status: "loading" });
  const request = (async () => {
    try {
      const payload = await api.request<unknown>("/api/notes?limit=200");
      const notes =
        isRecord(payload) && Array.isArray(payload.notes)
          ? payload.notes.map(parseNote).filter((note): note is InvestmentNote => !!note)
          : undefined;
      if (!notes) throw new Error("Unexpected notes payload");
      loadKey = key;
      setState({ status: "ready", notes, source: "api", error: undefined });
      await loadLatestCheck(api);
    } catch (error) {
      seedMock(error instanceof Error ? error.message : String(error));
      loadKey = key;
    } finally {
      loadRequest = undefined;
    }
  })();
  loadRequest = request;
  return request;
}

export function loadLatestCheck(api: LingWuApi): Promise<void> {
  if (checkRequest) return checkRequest;
  setState({ checkLoading: true });
  const request = (async () => {
    try {
      const payload = await api.request<unknown>("/api/notes/thesis-check/latest");
      const record = isRecord(payload) ? payload : {};
      const check = record.check === null ? undefined : parseThesisCheck(record.check);
      const nextRun = str(record.next_run) ?? str(record.nextRun);
      setState({ check, nextRun, checkLoading: false });
    } catch {
      const record = mockCheck(state.notes);
      setState({ check: record, nextRun: daysAgo(-4, 8, 0), checkLoading: false });
    } finally {
      checkRequest = undefined;
    }
  })();
  checkRequest = request;
  return request;
}

function localId() {
  return `note-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
}

/** 单条笔记的检验时间线；mock 模式回退到最近一次检验。 */
export async function loadNoteChecks(
  api: LingWuApi,
  note: InvestmentNote,
  limit = 50,
): Promise<NoteCheckEntry[]> {
  if (state.source === "mock")
    return note.check ? [{ ...note.check, week: "mock", status: "ok" }] : [];
  const payload = await api.request<unknown>(
    `/api/notes/${encodeURIComponent(note.id)}/checks?limit=${limit}`,
  );
  return parseNoteChecks(payload);
}

export async function createNote(
  api: LingWuApi,
  input: {
    symbolCode: string;
    type: NoteType;
    title?: string;
    content: string;
    status?: ThesisStatus;
  },
): Promise<InvestmentNote> {
  const title = input.title?.trim();
  if (state.source === "api") {
    const payload = await api.request<unknown>("/api/notes", {
      symbol_code: input.symbolCode,
      type: input.type,
      ...(title ? { title } : {}),
      content: input.content,
      ...(input.type === "THESIS" ? { status: input.status ?? "ACTIVE" } : {}),
    });
    const note = parseNote(payload);
    if (!note) throw new Error("Unexpected note payload");
    setState({ notes: [note, ...state.notes] });
    return note;
  }
  const now = new Date().toISOString();
  const note: InvestmentNote = {
    id: localId(),
    symbolCode: input.symbolCode,
    type: input.type,
    ...(title ? { title } : {}),
    content: input.content,
    ...(input.type === "THESIS" ? { status: input.status ?? "ACTIVE" } : {}),
    createdAt: now,
    updatedAt: now,
  };
  setState({ notes: [note, ...state.notes] });
  return note;
}

export async function updateNote(
  api: LingWuApi,
  id: string,
  patch: { title?: string; content?: string; status?: ThesisStatus },
): Promise<InvestmentNote> {
  if (state.source === "api") {
    const payload = await api.request<unknown>(
      `/api/notes/${encodeURIComponent(id)}`,
      {
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.content === undefined ? {} : { content: patch.content }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
      },
      "PUT",
    );
    const note = parseNote(payload);
    if (!note) throw new Error("Unexpected note payload");
    setState({ notes: state.notes.map((item) => (item.id === id ? note : item)) });
    return note;
  }
  const existing = state.notes.find((item) => item.id === id);
  if (!existing) throw new Error("Note not found");
  const updated: InvestmentNote = {
    ...existing,
    ...(patch.title === undefined ? {} : { title: patch.title.trim() || undefined }),
    ...(patch.content === undefined ? {} : { content: patch.content }),
    ...(patch.status === undefined ? {} : { status: patch.status }),
    updatedAt: new Date().toISOString(),
  };
  setState({ notes: state.notes.map((item) => (item.id === id ? updated : item)) });
  return updated;
}

export async function deleteNote(api: LingWuApi, id: string): Promise<void> {
  if (state.source === "api") {
    await api.request(`/api/notes/${encodeURIComponent(id)}`, undefined, "DELETE");
  }
  setState({ notes: state.notes.filter((item) => item.id !== id) });
}

export async function runThesisCheck(api: LingWuApi): Promise<ThesisCheckRecord> {
  setState({ checkLoading: true });
  if (state.source === "mock") {
    const record = mockCheck(state.notes);
    setState({
      check: { ...record, checkedAt: new Date().toISOString(), week: "mock" },
      nextRun: daysAgo(-4, 8, 0),
      checkLoading: false,
    });
    return record;
  }
  try {
    const payload = await api.request<unknown>("/api/notes/thesis-check", {});
    const record = parseThesisCheck(payload);
    if (!record) throw new Error("Unexpected thesis check payload");
    setState({ check: record, checkLoading: false });
    await loadNotes(api, true);
    return record;
  } catch (error) {
    setState({ checkLoading: false });
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * 视图辅助
 * ------------------------------------------------------------------ */

export function thesisNotes(notes: InvestmentNote[]) {
  return notes.filter((note) => note.type === "THESIS");
}

const STATUS_ORDER: Record<ThesisStatus, number> = {
  ACTIVE: 0,
  VALIDATED: 1,
  INVALIDATED: 2,
  EXPIRED: 3,
};

/** 论点排序：待人工确认 > 待验证 > 成立 > 不成立 > 已过期；同组按最近检验倒序。 */
export function sortTheses(notes: InvestmentNote[]) {
  return [...notes].sort((a, b) => {
    const pendingA = a.check?.outcome === "pending_confirmation" ? -1 : 0;
    const pendingB = b.check?.outcome === "pending_confirmation" ? -1 : 0;
    if (pendingA !== pendingB) return pendingA - pendingB;
    const statusA = STATUS_ORDER[a.status ?? "ACTIVE"];
    const statusB = STATUS_ORDER[b.status ?? "ACTIVE"];
    if (statusA !== statusB) return statusA - statusB;
    return (b.lastCheckedAt ?? b.updatedAt).localeCompare(a.lastCheckedAt ?? a.updatedAt);
  });
}

export type DateBucket = "today" | "yesterday" | "week" | "earlier";

export function bucketOf(iso: string): DateBucket {
  const date = new Date(iso);
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor(
    (startOfDay.getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86400000,
  );
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return "week";
  return "earlier";
}

export function groupNotesByDate(notes: InvestmentNote[]) {
  const buckets: Record<DateBucket, InvestmentNote[]> = {
    today: [],
    yesterday: [],
    week: [],
    earlier: [],
  };
  for (const note of [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    buckets[bucketOf(note.createdAt)].push(note);
  }
  return buckets;
}

/* ------------------------------------------------------------------ *
 * 跨页入口意图（标的详情 → 笔记中心 / 论点 Tab）
 * ------------------------------------------------------------------ */

export interface NotesIntent {
  tab: "notes" | "theses";
  symbol?: string;
}

let pendingIntent: NotesIntent | undefined;

export function setNotesIntent(intent: NotesIntent) {
  pendingIntent = intent;
}

export function consumeNotesIntent(): NotesIntent | undefined {
  const intent = pendingIntent;
  pendingIntent = undefined;
  return intent;
}
