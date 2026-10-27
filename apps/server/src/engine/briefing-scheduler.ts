import type { TaskStatus } from "../../../../packages/domain/src/agent.ts";
import type { Store } from "../db.ts";

const WATCHLIST_KIND = "watchlists";
const TASK_KIND = "tasks";

interface BriefingTask {
  kind: string;
  status: TaskStatus;
  input?: Record<string, unknown>;
  updatedAt?: string;
}

export interface BriefingSchedulerDeps {
  db: Store;
  /** Enqueue one market_briefing task. Must be idempotent for the same owner/date/attempt. */
  enqueue(owner: string, date: string, attempt: number): Promise<unknown>;
}

export interface BriefingSchedulerOptions {
  now?: () => Date;
  /** Defaults to BRIEFING_SCHEDULE_ENABLED === "true"; off unless the deployment opts in. */
  enabled?: boolean;
  /** UTC hour of the daily run. Defaults to BRIEFING_SCHEDULE_UTC_HOUR or 0 (UTC 00:00). */
  hourUtc?: number;
  /** Attempts per owner per day, including the first one. Defaults to 3. */
  maxAttemptsPerDay?: number;
  /** Wait between a failed attempt and the next retry. Defaults to 5 minutes. */
  retryDelayMs?: number;
  /** Bound the work per tick; remaining owners are picked up on the next tick. */
  maxOwnersPerTick?: number;
  log?: (entry: Record<string, unknown>) => void;
}

const ACTIVE_STATUSES: TaskStatus[] = [
  "queued",
  "running",
  "scheduled",
  "waiting_approval",
  "waiting_input",
  "paused",
  "succeeded",
];

/**
 * Creates the durable daily briefing task once per owner per UTC date.
 *
 * The durable worker already runs `scheduled`/`queued` tasks with leases and retries at the
 * task level; this scheduler only decides *when* a task should exist. It is safe to call on
 * every maintenance tick: existing tasks for the date make it a no-op.
 */
export function createBriefingScheduler(
  deps: BriefingSchedulerDeps,
  options: BriefingSchedulerOptions = {},
) {
  const enabled = options.enabled ?? process.env.BRIEFING_SCHEDULE_ENABLED === "true";
  const configuredHour = Number(process.env.BRIEFING_SCHEDULE_UTC_HOUR ?? 0);
  const hourUtc = options.hourUtc ?? (Number.isInteger(configuredHour) ? configuredHour : 0);
  const maxAttemptsPerDay = options.maxAttemptsPerDay ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 5 * 60_000;
  const maxOwnersPerTick = options.maxOwnersPerTick ?? 200;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));

  async function runOnce(): Promise<number> {
    if (!enabled) return 0;
    const current = now();
    const date = current.toISOString().slice(0, 10);
    const dueAt = Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate(),
      hourUtc,
    );
    if (current.getTime() < dueAt) return 0;

    const owners = new Set(
      (await deps.db.scan<{ id: string }>(WATCHLIST_KIND)).map(({ owner }) => owner),
    );
    if (owners.size === 0) return 0;

    const todayByOwner = new Map<string, BriefingTask[]>();
    for (const { owner, value } of await deps.db.scan<BriefingTask>(TASK_KIND)) {
      if (value.kind !== "market_briefing" || value.input?.date !== date) continue;
      const list = todayByOwner.get(owner) ?? [];
      list.push(value);
      todayByOwner.set(owner, list);
    }

    let created = 0;
    let considered = 0;
    for (const owner of owners) {
      if (considered >= maxOwnersPerTick) break;
      considered++;
      const today = todayByOwner.get(owner) ?? [];
      // A live or already-finished briefing for today means no new task is needed.
      if (today.some((task) => ACTIVE_STATUSES.includes(task.status))) continue;
      const attempts = today.length;
      if (attempts >= maxAttemptsPerDay) {
        log({
          timestamp: current.toISOString(),
          context: { phase: "briefing-schedule" },
          outcome: "skipped",
          reason: "attempts_exhausted",
          date,
        });
        continue;
      }
      if (attempts > 0) {
        const lastAt = Math.max(...today.map((task) => Date.parse(task.updatedAt ?? "") || 0));
        if (current.getTime() - lastAt < retryDelayMs) continue;
      }
      try {
        await deps.enqueue(owner, date, attempts);
        created++;
        log({
          timestamp: current.toISOString(),
          context: { phase: "briefing-schedule" },
          outcome: "enqueued",
          date,
          attempt: attempts + 1,
        });
      } catch (error) {
        // One owner's task cap or storage error must not stop the rest of the tick.
        log({
          timestamp: current.toISOString(),
          context: { phase: "briefing-schedule" },
          outcome: "failed",
          date,
          error: error instanceof Error ? error.name : "unknown",
        });
      }
    }
    return created;
  }

  return { runOnce, enabled, hourUtc };
}
