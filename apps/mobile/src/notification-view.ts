import type { AgentNotification, AgentWorkspace, Goal } from "../../../packages/domain/src/agent";

export interface NotificationGroup {
  id: string;
  goalId?: string;
  goal?: Goal;
  notifications: AgentNotification[];
  unread: number;
  latestAt: string;
}

function compareNotifications(a: AgentNotification, b: AgentNotification) {
  const byDate = b.createdAt.localeCompare(a.createdAt);
  return byDate || a.id.localeCompare(b.id);
}

/**
 * Notifications stay flat in storage. Grouping is derived from the durable
 * task so legacy and orphaned notifications can always fall back to standalone.
 */
export function buildNotificationGroups(workspace: AgentWorkspace): NotificationGroup[] {
  const goals = new Map(workspace.goals.map((goal) => [goal.id, goal] as const));
  const tasks = new Map(workspace.tasks.map((task) => [task.id, task] as const));
  const grouped = new Map<string, NotificationGroup>();

  for (const notification of workspace.notifications) {
    const task = notification.taskId ? tasks.get(notification.taskId) : undefined;
    const goal = task?.goalId ? goals.get(task.goalId) : undefined;
    const id = goal ? `goal:${goal.id}` : "standalone";
    const group = grouped.get(id) ?? {
      id,
      ...(goal ? { goalId: goal.id, goal } : {}),
      notifications: [],
      unread: 0,
      latestAt: notification.createdAt,
    };
    group.notifications.push(notification);
    if (!notification.read) group.unread++;
    if (notification.createdAt > group.latestAt) group.latestAt = notification.createdAt;
    grouped.set(id, group);
  }

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      notifications: [...group.notifications].sort(compareNotifications),
    }))
    .sort((a, b) => {
      if (Boolean(a.goalId) !== Boolean(b.goalId)) return a.goalId ? -1 : 1;
      if (a.unread !== b.unread) return b.unread - a.unread;
      if (a.latestAt !== b.latestAt) return b.latestAt.localeCompare(a.latestAt);
      return a.id.localeCompare(b.id);
    });
}
