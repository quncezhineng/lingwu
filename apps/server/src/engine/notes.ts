import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  InvestmentNote,
  NoteCheck,
  ThesisEvidence,
  ThesisStatusChange,
} from "../../../../packages/domain/src/agent.ts";
import { normalizeYahooSymbol } from "../../../../packages/integrations/src/market-data.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

const NOTE_KIND = "notes";
const CHECK_KIND = "thesis_checks";
const MAX_CONTENT = 2000;
const MIN_THESIS_CONTENT = 10;

const symbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[A-Za-z0-9^=.-]+$/, "Invalid symbol");
const noteTypeSchema = z.enum(["BUY_REASON", "SELL_REASON", "RESEARCH", "THESIS"]);
const statusSchema = z.enum(["ACTIVE", "VALIDATED", "INVALIDATED", "EXPIRED"]);

const titleSchema = z.string().trim().max(80);

const httpUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "Evidence URL must use http(s)");

/** 客户端只提交可复核的原始信息；id / fetched_at / healthy 由服务端维护。 */
export const evidenceInputSchema = z.object({
  id: z.string().trim().max(100).optional(),
  url: httpUrlSchema,
  published_at: z.string().date().optional(),
  quote_number: z.string().trim().max(120).optional(),
});
export type EvidenceInput = z.infer<typeof evidenceInputSchema>;

const falsifyConditionSchema = z.object({
  kind: z.enum(["PRICE_ABOVE", "PRICE_BELOW", "CHANGE_PCT", "CUSTOM"]),
  expression: z.string().trim().min(1).max(200),
});

const horizonSchema = z
  .object({
    from: z.string().date(),
    to: z.string().date(),
  })
  .refine((value) => value.to >= value.from, {
    message: "Horizon end must not be before its start",
  });

const thesisFieldsShape = {
  evidence: z.array(evidenceInputSchema).max(10).optional(),
  falsify_condition: falsifyConditionSchema.optional(),
  horizon: horizonSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
};

function onlyThesisFields(value: {
  evidence?: unknown;
  falsify_condition?: unknown;
  horizon?: unknown;
  confidence?: unknown;
}) {
  return (
    value.evidence === undefined &&
    value.falsify_condition === undefined &&
    value.horizon === undefined &&
    value.confidence === undefined
  );
}

export const createNoteSchema = z
  .object({
    symbol_code: symbolSchema,
    type: noteTypeSchema,
    title: titleSchema.optional(),
    content: z.string().trim().min(1).max(MAX_CONTENT),
    status: statusSchema.optional(),
    ...thesisFieldsShape,
  })
  .superRefine((value, ctx) => {
    if (value.type === "THESIS" && value.content.length < MIN_THESIS_CONTENT)
      ctx.addIssue({ code: "custom", message: "Thesis content needs at least 10 characters" });
    if (value.status && value.type !== "THESIS")
      ctx.addIssue({ code: "custom", message: "Only THESIS notes carry a status" });
    if (value.type !== "THESIS" && !onlyThesisFields(value))
      ctx.addIssue({ code: "custom", message: "Only THESIS notes carry thesis fields" });
    if (value.type === "THESIS" && (value.status ?? "ACTIVE") === "ACTIVE") {
      if (!value.evidence?.length)
        ctx.addIssue({ code: "custom", message: "An active thesis needs at least one evidence" });
    }
  });

export const updateNoteSchema = z
  .object({
    title: titleSchema.optional(),
    content: z.string().trim().min(1).max(MAX_CONTENT).optional(),
    status: statusSchema.optional(),
    evidence: z.array(evidenceInputSchema).max(10).optional(),
    falsify_condition: falsifyConditionSchema.nullable().optional(),
    horizon: horizonSchema.nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.content !== undefined ||
      value.status !== undefined ||
      !onlyThesisFields(value),
    { message: "Provide title, content, status or thesis fields to update" },
  );

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export interface ThesisCheckItem {
  note_id: string;
  symbol_code: string;
  previous_status?: string;
  status?: string;
  outcome: NoteCheck["outcome"];
  source: NoteCheck["source"];
  note?: string;
  /** "ok" for evaluated checks; "failed" when the check itself errored. */
  check_status?: "ok" | "failed";
  error?: string;
}

export interface ThesisCheckRecord {
  id: string;
  week: string;
  checked_at: string;
  items: ThesisCheckItem[];
  pending: number;
  manual_updates: number;
  note: string;
}

export type NoteNotifier = (title: string, body: string, key: string) => Promise<unknown>;

/** ISO-8601 week key, e.g. 2026-W44 (UTC). */
export function isoWeekKey(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function manualOutcome(status: InvestmentNote["status"]): NoteCheck["outcome"] {
  switch (status) {
    case "VALIDATED":
      return "valid";
    case "INVALIDATED":
      return "invalid";
    case "ACTIVE":
      return "inconclusive";
    case "EXPIRED":
      return "inconclusive";
    default:
      return "inconclusive";
  }
}

function normalizeEvidence(
  input: EvidenceInput[],
  at: string,
  existing: ThesisEvidence[] = [],
): ThesisEvidence[] {
  return input.map((item) => {
    const previous =
      (item.id ? existing.find((entry) => entry.id === item.id) : undefined) ??
      existing.find((entry) => entry.url === item.url);
    return {
      id: previous?.id ?? randomUUID(),
      url: item.url,
      ...(item.published_at ? { published_at: item.published_at } : {}),
      ...(item.quote_number ? { quote_number: item.quote_number } : {}),
      fetched_at: previous?.fetched_at ?? at,
      healthy: previous?.healthy ?? true,
    };
  });
}

/**
 * 到点回检：已到期 / 7 天内到期 / 尚早。
 * 只看处于 ACTIVE 且带期限的论点；没有期限的论点交给周检。
 */
export function thesisReviewDue(
  note: Pick<InvestmentNote, "type" | "status" | "horizon">,
  now = new Date(),
): "overdue" | "due_soon" | "later" {
  if (note.type !== "THESIS" || note.status !== "ACTIVE" || !note.horizon) return "later";
  const end = new Date(`${note.horizon.to}T00:00:00.000Z`).getTime();
  if (Number.isNaN(end)) return "later";
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = (end - today) / 86_400_000;
  if (days < 0) return "overdue";
  if (days <= 7) return "due_soon";
  return "later";
}

export class NotesService {
  constructor(private readonly db: Store) {}

  async list(
    owner: string,
    filters: { symbol?: string; type?: string; q?: string; limit?: number } = {},
  ): Promise<InvestmentNote[]> {
    let notes = await this.db.list<InvestmentNote>(owner, NOTE_KIND);
    if (filters.symbol) {
      const symbol = normalizeYahooSymbol(filters.symbol);
      notes = notes.filter((note) => note.symbol_code === symbol);
    }
    if (filters.type) notes = notes.filter((note) => note.type === filters.type);
    if (filters.q) {
      const needle = filters.q.toLowerCase();
      notes = notes.filter(
        (note) =>
          note.content.toLowerCase().includes(needle) ||
          note.symbol_code.toLowerCase().includes(needle),
      );
    }
    return notes.slice(0, filters.limit ?? 200);
  }

  private async require(owner: string, id: string): Promise<InvestmentNote> {
    const note = await this.db.get<InvestmentNote>(owner, NOTE_KIND, id);
    if (!note) throw new AppError("Note not found", 404);
    return note;
  }

  async create(owner: string, input: CreateNoteInput): Promise<InvestmentNote> {
    const at = new Date().toISOString();
    const isThesis = input.type === "THESIS";
    if (isThesis && (input.status ?? "ACTIVE") === "ACTIVE" && !input.evidence?.length)
      throw new AppError("An active thesis needs at least one evidence", 422);
    const evidence = isThesis && input.evidence ? normalizeEvidence(input.evidence, at) : undefined;
    const note: InvestmentNote = {
      id: randomUUID(),
      user_id: owner,
      symbol_code: normalizeYahooSymbol(input.symbol_code),
      type: input.type,
      ...(input.title ? { title: input.title } : {}),
      content: input.content,
      ...(input.type === "THESIS"
        ? {
            status: input.status ?? "ACTIVE",
            check: {
              outcome: "pending_confirmation",
              source: "automated",
              checked_at: at,
              note: "尚未检验；请在周检后人工确认。",
            },
            last_checked_at: at,
            ...(evidence ? { evidence } : {}),
            ...(input.falsify_condition ? { falsify_condition: input.falsify_condition } : {}),
            ...(input.horizon ? { horizon: input.horizon } : {}),
            ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
          }
        : {}),
      created_at: at,
      updated_at: at,
    };
    return this.db.put(owner, NOTE_KIND, note);
  }

  async update(owner: string, id: string, input: UpdateNoteInput): Promise<InvestmentNote> {
    const note = await this.require(owner, id);
    if (input.status && note.type !== "THESIS")
      throw new AppError("Only THESIS notes carry a status", 422);
    if (note.type !== "THESIS" && !onlyThesisFields(input))
      throw new AppError("Only THESIS notes carry thesis fields", 422);
    const at = new Date().toISOString();
    const content = input.content ?? note.content;
    if (note.type === "THESIS" && content.length < MIN_THESIS_CONTENT)
      throw new AppError("Thesis content needs at least 10 characters", 422);

    // 证据是「活跃论点」的准入门槛：允许历史数据只读，但不允许把无证据的论点重新置为活跃。
    const evidence =
      input.evidence !== undefined
        ? normalizeEvidence(input.evidence, at, note.evidence)
        : note.evidence;
    // 以最终状态校验：即便请求没有同时提交 status，也不能把活跃论点的证据清空。
    if ((input.status ?? note.status) === "ACTIVE" && !evidence?.length)
      throw new AppError("An active thesis needs at least one evidence", 422);

    const manualCheck: NoteCheck | undefined = input.status
      ? {
          outcome: manualOutcome(input.status),
          source: "manual",
          checked_at: at,
          note: "用户手动更新论点状态。",
        }
      : note.check;
    const statusChanged = input.status !== undefined && input.status !== note.status;
    const statusHistory: ThesisStatusChange[] | undefined = statusChanged
      ? [
          ...(note.status_history ?? []),
          {
            ...(note.status ? { from: note.status } : {}),
            to: input.status as NonNullable<InvestmentNote["status"]>,
            at,
            source: "user" as const,
          },
        ].slice(-50)
      : note.status_history;
    return this.db.put(owner, NOTE_KIND, {
      ...note,
      content,
      ...(input.title !== undefined
        ? input.title
          ? { title: input.title }
          : { title: undefined }
        : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(manualCheck ? { check: manualCheck } : {}),
      ...(evidence !== undefined ? { evidence } : {}),
      ...(input.falsify_condition !== undefined
        ? { falsify_condition: input.falsify_condition ?? undefined }
        : {}),
      ...(input.horizon !== undefined ? { horizon: input.horizon ?? undefined } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence ?? undefined } : {}),
      ...(statusHistory !== undefined ? { status_history: statusHistory } : {}),
      updated_at: at,
    });
  }

  async remove(owner: string, id: string): Promise<void> {
    await this.require(owner, id);
    await this.db.remove(owner, NOTE_KIND, id);
  }

  latestCheckId(owner: string, week: string): string {
    return hash(`thesis-check:${owner}:${week}`);
  }

  async latestCheck(owner: string): Promise<ThesisCheckRecord | null> {
    const records = await this.db.list<ThesisCheckRecord>(owner, CHECK_KIND);
    return records[0] ?? null;
  }

  /** Per-note check history, newest first, including failed checks. */
  async listChecks(
    owner: string,
    noteId: string,
    limit = 20,
  ): Promise<
    {
      week: string;
      checked_at: string;
      outcome: NoteCheck["outcome"];
      source: NoteCheck["source"];
      status: "ok" | "failed";
      error?: string;
      note?: string;
    }[]
  > {
    await this.require(owner, noteId);
    const records = await this.db.list<ThesisCheckRecord>(owner, CHECK_KIND);
    const entries = records
      .flatMap((record) =>
        record.items
          .filter((item) => item.note_id === noteId)
          .map((item) => ({
            week: record.week,
            checked_at: record.checked_at,
            outcome: item.outcome,
            source: item.source,
            status: item.check_status ?? "ok",
            ...(item.error ? { error: item.error } : {}),
            ...(item.note ? { note: item.note } : {}),
          })),
      )
      .sort((a, b) =>
        b.checked_at === a.checked_at
          ? b.week.localeCompare(a.week)
          : b.checked_at.localeCompare(a.checked_at),
      );
    return entries.slice(0, limit);
  }

  /**
   * Weekly thesis review. Idempotent per ISO week: manual and scheduled runs share one record.
   * Without a model key the outcome is always `pending_confirmation`; no conclusion is invented.
   * Notes whose check.source is `manual` keep the user's status and are only flagged.
   */
  async runThesisCheck(
    owner: string,
    options: { now?: Date; notify?: NoteNotifier } = {},
  ): Promise<ThesisCheckRecord> {
    const now = options.now ?? new Date();
    const week = isoWeekKey(now);
    const id = this.latestCheckId(owner, week);
    const existing = await this.db.get<ThesisCheckRecord>(owner, CHECK_KIND, id);
    if (existing) return existing;

    const notes = (await this.db.list<InvestmentNote>(owner, NOTE_KIND)).filter(
      (note) => note.type === "THESIS",
    );
    const checkedAt = now.toISOString();
    const items: ThesisCheckItem[] = [];
    let pending = 0;
    let manualUpdates = 0;

    for (const note of notes) {
      if (note.check?.source === "manual") {
        manualUpdates++;
        pending++;
        items.push({
          note_id: note.id,
          symbol_code: note.symbol_code,
          ...(note.status ? { status: note.status, previous_status: note.status } : {}),
          outcome: "pending_confirmation",
          source: "automated",
          check_status: "ok",
          note: "用户已手动确认，自动化周检未覆盖；有更新待确认。",
        });
        // Preserve the manual check so future automated runs keep treating it as user-confirmed.
        await this.db.put(owner, NOTE_KIND, {
          ...note,
          last_checked_at: checkedAt,
        });
        continue;
      }
      pending++;
      const check: NoteCheck = {
        outcome: "pending_confirmation",
        source: "automated",
        checked_at: checkedAt,
        note: "未配置模型，未生成结论；请人工确认。",
      };
      await this.db.put(owner, NOTE_KIND, {
        ...note,
        check,
        last_checked_at: checkedAt,
        updated_at: checkedAt,
      });
      items.push({
        note_id: note.id,
        symbol_code: note.symbol_code,
        ...(note.status ? { status: note.status } : {}),
        outcome: check.outcome,
        source: check.source,
        check_status: "ok",
        note: check.note,
      });
    }

    const record: ThesisCheckRecord = {
      id,
      week,
      checked_at: checkedAt,
      items,
      pending,
      manual_updates: manualUpdates,
      note:
        pending > 0
          ? `本周有 ${pending} 条论点待人工确认（未配置模型，未生成结论）。`
          : "本周没有需要检验的论点。",
    };
    await this.db.put(owner, CHECK_KIND, record);
    if (options.notify && pending > 0)
      await options.notify("论点周检待确认", record.note, `thesis-check-notice:${owner}:${week}`);
    return record;
  }
}
