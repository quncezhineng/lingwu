import type { AgentTask, Monitor } from "../../../packages/domain/src/agent";

/** 侧栏里和任务放在一起的，只是仍在运行的自动化。 */
const ACTIVE_AUTOMATION = "active";
/** 监控任务由对应的自动化代表，不在任务行里再出现一次。 */
const TASK_STATUSES = new Set<AgentTask["status"]>(["queued", "running", "succeeded", "failed"]);

export type RailWorkItem = {
  kind: "automation" | "task";
  id: string;
  title: string;
  /** 用来排序和按天分组。 */
  at: string;
  /** 自动化行打开它背后的执行记录。 */
  taskId?: string;
};

export function railWorkItems(
  tasks: readonly AgentTask[],
  monitors: readonly Monitor[],
): RailWorkItem[] {
  const automations: RailWorkItem[] = monitors
    .filter((monitor) => monitor.status === ACTIVE_AUTOMATION)
    .map((monitor) => ({
      kind: "automation",
      id: monitor.id,
      title: monitor.title,
      at: monitor.lastCheckedAt || monitor.nextCheckAt,
      taskId: monitor.taskId,
    }));
  const jobs: RailWorkItem[] = tasks
    .filter((task) => task.kind !== "monitor" && TASK_STATUSES.has(task.status))
    .map((task) => ({
      kind: "task",
      id: task.id,
      title: task.title,
      at: task.createdAt,
    }));
  return [...automations, ...jobs].sort(
    (a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id),
  );
}

export type RailWorkGroup = { day: string; label: string; items: RailWorkItem[] };

/** 先取最近的若干条，再按本地日历日分组，新的一天在上面。 */
export function groupRailWork(
  items: readonly RailWorkItem[],
  options: { limit?: number; locale: string; timeZone?: string; now?: Date },
): RailWorkGroup[] {
  const slice = options.limit === undefined ? items : items.slice(0, options.limit);
  const timeZone = options.timeZone;
  const groups: RailWorkGroup[] = [];
  for (const item of slice) {
    const day = calendarDay(item.at, timeZone);
    const current = groups[groups.length - 1];
    if (current?.day === day) current.items.push(item);
    else
      groups.push({
        day,
        label: dayLabel(day, options.locale, timeZone, options.now),
        items: [item],
      });
  }
  return groups;
}

function calendarDay(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dayLabel(
  day: string,
  locale: string,
  timeZone: string | undefined,
  now = new Date(),
): string {
  if (!day) return "";
  const today = calendarDay(now.toISOString(), timeZone);
  const yesterday = calendarDay(new Date(now.getTime() - 86_400_000).toISOString(), timeZone);
  if (day === today) return "today";
  if (day === yesterday) return "yesterday";
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Intl.DateTimeFormat(locale, { timeZone, month: "short", day: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, date, 12)),
  );
}
