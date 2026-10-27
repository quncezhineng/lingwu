import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { InvestmentNote, NoteCheck } from "../../../../packages/domain/src/agent.ts";
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

export const createNoteSchema = z
  .object({
    symbol_code: symbolSchema,
    type: noteTypeSchema,
    content: z.string().trim().min(1).max(MAX_CONTENT),
    status: statusSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "THESIS" && value.content.length < MIN_THESIS_CONTENT)
      ctx.addIssue({ code: "custom", message: "Thesis content needs at least 10 characters" });
    if (value.status && value.type !== "THESIS")
      ctx.addIssue({ code: "custom", message: "Only THESIS notes carry a status" });
  });

export const updateNoteSchema = z
  .object({
    content: z.string().trim().min(1).max(MAX_CONTENT).optional(),
    status: statusSchema.optional(),
  })
  .refine((value) => value.content !== undefined || value.status !== undefined, {
    message: "Provide content or status to update",
  });

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
    const note: InvestmentNote = {
      id: randomUUID(),
      user_id: owner,
      symbol_code: normalizeYahooSymbol(input.symbol_code),
      type: input.type,
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
    const at = new Date().toISOString();
    const content = input.content ?? note.content;
    if (note.type === "THESIS" && content.length < MIN_THESIS_CONTENT)
      throw new AppError("Thesis content needs at least 10 characters", 422);
    const manualCheck: NoteCheck | undefined = input.status
      ? {
          outcome: manualOutcome(input.status),
          source: "manual",
          checked_at: at,
          note: "用户手动更新论点状态。",
        }
      : note.check;
    return this.db.put(owner, NOTE_KIND, {
      ...note,
      content,
      ...(input.status ? { status: input.status } : {}),
      ...(manualCheck ? { check: manualCheck } : {}),
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
