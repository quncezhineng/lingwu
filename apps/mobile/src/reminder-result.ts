import { z } from "zod";

const reminderSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  condition: z.enum(["change", "contains", "price_below"]),
  value: z.string().default(""),
  intervalMinutes: z.number(),
  schedule: z.enum(["interval", "daily", "weekly"]).optional(),
  timeOfDay: z.string().nullable().optional(),
  weekday: z.number().min(1).max(7).nullable().optional(),
  nextCheckAt: z.string(),
  lastCheckedAt: z.string().nullable().default(null),
});

const alertSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
});

const reminderResultSchema = z.object({
  reminders: z.array(reminderSchema).default([]),
  alerts: z.array(alertSchema).default([]),
});

export type ReminderItem = z.infer<typeof reminderSchema>;
export type ReminderAlert = z.infer<typeof alertSchema>;
export type ReminderResult = z.infer<typeof reminderResultSchema>;

const EMPTY: ReminderResult = { reminders: [], alerts: [] };

/** Parses a list_reminders tool result, including replay values serialized as JSON. */
export function parseReminderResult(value: unknown): ReminderResult | undefined {
  let parsed = value;
  if (typeof parsed === "string") {
    const text = parsed.trim();
    if (!text) return EMPTY;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const result = reminderResultSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}
