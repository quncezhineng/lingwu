import type { AgentNotification, Monitor } from "../../../../packages/domain/src/agent.ts";

const ALERT_LIMIT = 8;

/** Builds the compact reminder list shown by the conversation tool. */
export function reminderList(
  monitors: readonly Monitor[],
  notifications: readonly AgentNotification[],
) {
  return {
    reminders: monitors
      .filter((monitor) => monitor.status === "active")
      .sort((a, b) => a.nextCheckAt.localeCompare(b.nextCheckAt))
      .map((monitor) => ({
        id: monitor.id,
        title: monitor.title,
        ...(monitor.description ? { description: monitor.description } : {}),
        condition: monitor.condition,
        value: monitor.value,
        intervalMinutes: monitor.intervalMinutes,
        ...(monitor.schedule && monitor.schedule !== "interval"
          ? {
              schedule: monitor.schedule,
              timeOfDay: monitor.timeOfDay ?? null,
              weekday: monitor.weekday ?? null,
            }
          : {}),
        nextCheckAt: monitor.nextCheckAt,
        lastCheckedAt: monitor.lastCheckedAt ?? null,
      })),
    alerts: notifications
      .filter((notification) => !notification.read)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, ALERT_LIMIT)
      .map(({ id, title, body, createdAt }) => ({ id, title, body, createdAt })),
  };
}
