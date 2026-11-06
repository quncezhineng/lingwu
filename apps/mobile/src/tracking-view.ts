import type { AgentTask, AgentWorkspace, Goal, Monitor } from "../../../packages/domain/src/agent";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_WINDOW_MS = 7 * DAY_MS;
const ACTIVE_TASK_STATUSES = new Set(["queued", "running", "scheduled"]);

export type AttentionAction =
  | "add_details"
  | "review"
  | "retry"
  | "continue"
  | "fix_reminder"
  | "view_reminder"
  | "plan_next"
  | "view_goal";

export type AttentionReason =
  | "task_input"
  | "task_review"
  | "task_failed"
  | "task_running"
  | "monitor_error"
  | "monitor_due"
  | "monitor_active"
  | "monitor_paused"
  | "goal_plan"
  | "goal_milestone"
  | "goal_review";

export interface AttentionItem {
  id: string;
  source: "task" | "monitor" | "goal";
  /**
   * `next_up` items compete for the three-slot summary. `goal` items only
   * explain the next action inside a goal card.
   */
  surface: "next_up" | "goal";
  priority: number;
  action: AttentionAction;
  reason: AttentionReason;
  title: string;
  at?: string;
  taskId?: string;
  monitorId?: string;
  goalId?: string;
  milestoneId?: string;
}

export interface RecentActivity {
  at: string;
  source: "task" | "monitor" | "milestone";
  id: string;
  title: string;
  status?: string;
  taskId?: string;
  monitorId?: string;
}

export interface GoalTrack {
  goal: Goal;
  tasks: AgentTask[];
  reminders: Monitor[];
  nextAction?: AttentionItem;
  recentActivity?: RecentActivity;
  recentActivities: RecentActivity[];
  dailyActivities: RecentActivity[];
  activityAt: string;
}

export interface TrackingView {
  nextUp: AttentionItem[];
  goalTracks: GoalTrack[];
  standaloneReminders: Monitor[];
  reminders: Monitor[];
  counts: {
    tasks: number;
    tracking: number;
    attention: number;
  };
}

function taskAttention(task: AgentTask): AttentionItem | undefined {
  if (task.status === "waiting_input")
    return {
      id: `task:${task.id}:input`,
      source: "task",
      surface: "next_up",
      priority: 100,
      action: "add_details",
      reason: "task_input",
      title: task.title,
      at: task.updatedAt,
      taskId: task.id,
      ...(task.goalId ? { goalId: task.goalId } : {}),
      ...(task.milestoneId ? { milestoneId: task.milestoneId } : {}),
    };
  if (task.status === "waiting_approval")
    return {
      id: `task:${task.id}:review`,
      source: "task",
      surface: "next_up",
      priority: 95,
      action: "review",
      reason: "task_review",
      title: task.title,
      at: task.updatedAt,
      taskId: task.id,
      ...(task.goalId ? { goalId: task.goalId } : {}),
      ...(task.milestoneId ? { milestoneId: task.milestoneId } : {}),
    };
  if (task.status === "failed")
    return {
      id: `task:${task.id}:failed`,
      source: "task",
      surface: "next_up",
      priority: 80,
      action: "retry",
      reason: "task_failed",
      title: task.title,
      at: task.updatedAt,
      taskId: task.id,
      ...(task.goalId ? { goalId: task.goalId } : {}),
      ...(task.milestoneId ? { milestoneId: task.milestoneId } : {}),
    };
  if (ACTIVE_TASK_STATUSES.has(task.status))
    return {
      id: `task:${task.id}:running`,
      source: "task",
      surface: "goal",
      priority: 50,
      action: "continue",
      reason: "task_running",
      title: task.title,
      at: task.updatedAt,
      taskId: task.id,
      ...(task.goalId ? { goalId: task.goalId } : {}),
      ...(task.milestoneId ? { milestoneId: task.milestoneId } : {}),
    };
  return undefined;
}

function monitorAttention(monitor: Monitor, now: Date): AttentionItem | undefined {
  if (monitor.status === "stopped") return undefined;
  if (monitor.status === "paused") {
    return {
      id: `monitor:${monitor.id}:paused`,
      source: "monitor",
      surface: monitor.error ? "next_up" : "goal",
      priority: monitor.error ? 75 : 30,
      action: monitor.error ? "fix_reminder" : "view_reminder",
      reason: monitor.error ? "monitor_error" : "monitor_paused",
      title: monitor.title,
      at: monitor.lastCheckedAt ?? monitor.nextCheckAt,
      monitorId: monitor.id,
      ...(monitor.goalId ? { goalId: monitor.goalId } : {}),
      ...(monitor.milestoneId ? { milestoneId: monitor.milestoneId } : {}),
    };
  }
  const next = Date.parse(monitor.nextCheckAt);
  if (Number.isFinite(next) && next <= now.getTime() + DAY_MS)
    return {
      id: `monitor:${monitor.id}:due`,
      source: "monitor",
      surface: "next_up",
      priority: 60,
      action: "view_reminder",
      reason: "monitor_due",
      title: monitor.title,
      at: monitor.nextCheckAt,
      monitorId: monitor.id,
      ...(monitor.goalId ? { goalId: monitor.goalId } : {}),
      ...(monitor.milestoneId ? { milestoneId: monitor.milestoneId } : {}),
    };
  return {
    id: `monitor:${monitor.id}:active`,
    source: "monitor",
    surface: "goal",
    priority: 45,
    action: "view_reminder",
    reason: "monitor_active",
    title: monitor.title,
    at: monitor.nextCheckAt,
    monitorId: monitor.id,
    ...(monitor.goalId ? { goalId: monitor.goalId } : {}),
    ...(monitor.milestoneId ? { milestoneId: monitor.milestoneId } : {}),
  };
}

function compareAttention(a: AttentionItem, b: AttentionItem) {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aTime = a.at ? Date.parse(a.at) : Number.POSITIVE_INFINITY;
  const bTime = b.at ? Date.parse(b.at) : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;
  return a.id.localeCompare(b.id);
}

function timestamp(value?: string) {
  return value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
}

function shanghaiDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function recentActivities(
  goal: Goal,
  tasks: readonly AgentTask[],
  reminders: readonly Monitor[],
  notifications: AgentWorkspace["notifications"],
  now: Date,
): RecentActivity[] {
  const cutoff = now.getTime() - ACTIVITY_WINDOW_MS;
  const taskIds = new Set(tasks.map((task) => task.id));
  const monitorByTask = new Map(reminders.map((monitor) => [monitor.taskId, monitor] as const));
  const activity: RecentActivity[] = [];
  for (const milestone of goal.milestones) {
    if (!milestone.done || !milestone.completedAt) continue;
    const at = timestamp(milestone.completedAt);
    if (at < cutoff || at > now.getTime()) continue;
    activity.push({
      at: milestone.completedAt,
      source: "milestone",
      id: `milestone:${milestone.id}`,
      title: milestone.title,
    });
  }
  for (const notification of notifications) {
    if (!notification.taskId || !taskIds.has(notification.taskId)) continue;
    const at = timestamp(notification.createdAt);
    if (at < cutoff || at > now.getTime()) continue;
    const task = tasks.find((item) => item.id === notification.taskId);
    const monitor = monitorByTask.get(notification.taskId);
    activity.push({
      at: notification.createdAt,
      source: monitor ? "monitor" : "task",
      id: `notification:${notification.id}`,
      title: notification.title,
      ...(task ? { status: task.status } : {}),
      taskId: notification.taskId,
      ...(monitor ? { monitorId: monitor.id } : {}),
    });
  }
  return activity.sort((a, b) => {
    if (a.at !== b.at) return b.at.localeCompare(a.at);
    return a.id.localeCompare(b.id);
  });
}

function goalNextAction(
  goal: Goal,
  tasks: readonly AgentTask[],
  reminders: readonly Monitor[],
  now: Date,
): AttentionItem | undefined {
  const taskAction = [...tasks]
    .map(taskAttention)
    .filter((item): item is AttentionItem => Boolean(item))
    .sort(compareAttention)[0];
  if (taskAction) return taskAction;

  const monitorAction = [...reminders]
    .map((monitor) => monitorAttention(monitor, now))
    .filter((item): item is AttentionItem => Boolean(item))
    .sort(compareAttention)[0];
  if (monitorAction) return monitorAction;

  const milestone = goal.milestones.find((item) => !item.done);
  if (milestone)
    return {
      id: `goal:${goal.id}:milestone:${milestone.id}`,
      source: "goal",
      surface: "goal",
      priority: 35,
      action: "view_goal",
      reason: "goal_milestone",
      title: milestone.title,
      at: goal.createdAt,
      goalId: goal.id,
      milestoneId: milestone.id,
    };

  if (goal.status !== "active") return undefined;
  return {
    id: `goal:${goal.id}:plan`,
    source: "goal",
    surface: "next_up",
    priority: 40,
    action: "plan_next",
    reason: "goal_plan",
    title: goal.title,
    at: goal.createdAt,
    goalId: goal.id,
  };
}

function sameAttentionTarget(a: AttentionItem, b: AttentionItem) {
  if (a.taskId && b.taskId) return a.taskId === b.taskId;
  if (a.monitorId && b.monitorId) return a.monitorId === b.monitorId;
  return a.id === b.id;
}

export function buildTrackingView(workspace: AgentWorkspace, now = new Date()): TrackingView {
  const goals = workspace.goals ?? [];
  const tasks = workspace.tasks ?? [];
  const notifications = workspace.notifications ?? [];
  const monitors = (workspace.monitors ?? []).filter((monitor) => monitor.status !== "stopped");
  const goalIds = new Set(goals.map((goal) => goal.id));
  const completedGoalIds = new Set(
    goals.filter((goal) => goal.status === "completed").map((goal) => goal.id),
  );
  const linkedMonitors = monitors.filter(
    (monitor) => monitor.goalId && goalIds.has(monitor.goalId),
  );
  const standaloneReminders = monitors
    .filter((monitor) => !monitor.goalId || !goalIds.has(monitor.goalId))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return a.nextCheckAt.localeCompare(b.nextCheckAt);
    });

  const goalTracks = goals.map((goal): GoalTrack => {
    const goalTasks = tasks
      .filter((task) => task.goalId === goal.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const reminders = linkedMonitors
      .filter((monitor) => monitor.goalId === goal.id)
      .sort((a, b) => a.nextCheckAt.localeCompare(b.nextCheckAt));
    const goalActivity = recentActivities(goal, goalTasks, reminders, notifications, now);
    const recentActivity = goalActivity[0];
    const today = shanghaiDate(now);
    const dailyActivities = goalActivity.filter(
      (activity) => shanghaiDate(new Date(activity.at)) === today,
    );
    const activityAt = [
      goal.createdAt,
      ...goalTasks.map((task) => task.updatedAt),
      ...goalActivity.map((activity) => activity.at),
    ].sort((a, b) => timestamp(b) - timestamp(a))[0];
    return {
      goal,
      tasks: goalTasks,
      reminders,
      nextAction: goalNextAction(goal, goalTasks, reminders, now),
      ...(recentActivity ? { recentActivity } : {}),
      recentActivities: goalActivity,
      dailyActivities,
      activityAt: activityAt || goal.createdAt,
    };
  });

  const candidates: AttentionItem[] = [];
  for (const task of tasks) {
    if (task.goalId && completedGoalIds.has(task.goalId)) continue;
    if (
      task.status === "waiting_input" ||
      task.status === "waiting_approval" ||
      task.status === "failed"
    ) {
      const item = taskAttention(task);
      if (item) candidates.push(item);
    }
  }
  for (const monitor of monitors) {
    if (monitor.goalId && completedGoalIds.has(monitor.goalId)) continue;
    const item = monitorAttention(monitor, now);
    if (item?.surface === "next_up") candidates.push(item);
  }
  for (const track of goalTracks) {
    if (track.goal.status === "completed") continue;
    if (track.nextAction?.surface === "next_up") candidates.push(track.nextAction);
    const openReminders = track.reminders.some((monitor) => monitor.status === "active");
    const openTasks = track.tasks.some(
      (task) =>
        task.status === "waiting_input" ||
        task.status === "waiting_approval" ||
        task.status === "failed" ||
        ACTIVE_TASK_STATUSES.has(task.status),
    );
    const incomplete = track.goal.milestones.filter((milestone) => !milestone.done).length;
    if (track.goal.status === "active" && !openTasks && !openReminders && incomplete > 1)
      candidates.push({
        id: `goal:${track.goal.id}:review`,
        source: "goal",
        surface: "next_up",
        priority: 20,
        action: "view_goal",
        reason: "goal_review",
        title: track.goal.title,
        at: track.activityAt,
        goalId: track.goal.id,
      });
  }

  const unique: AttentionItem[] = [];
  for (const item of candidates.sort(compareAttention))
    if (!unique.some((current) => sameAttentionTarget(current, item))) unique.push(item);
  const nextUp: AttentionItem[] = [];
  const perGoal = new Map<string, number>();
  for (const item of unique) {
    if (nextUp.length === 3) break;
    if (item.goalId) {
      const count = perGoal.get(item.goalId) ?? 0;
      if (count >= 2) continue;
      perGoal.set(item.goalId, count + 1);
    }
    nextUp.push(item);
  }

  goalTracks.sort((a, b) => {
    const aAttention = a.nextAction?.surface === "next_up" ? 1 : 0;
    const bAttention = b.nextAction?.surface === "next_up" ? 1 : 0;
    if (aAttention !== bAttention) return bAttention - aAttention;
    const rank = { active: 2, paused: 1, completed: 0 } as const;
    if (rank[a.goal.status] !== rank[b.goal.status])
      return rank[b.goal.status] - rank[a.goal.status];
    if (a.activityAt !== b.activityAt) return b.activityAt.localeCompare(a.activityAt);
    return b.goal.createdAt.localeCompare(a.goal.createdAt);
  });

  return {
    nextUp,
    goalTracks,
    standaloneReminders,
    reminders: [...monitors].sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return a.nextCheckAt.localeCompare(b.nextCheckAt);
    }),
    counts: {
      tasks: tasks.length,
      tracking: goals.filter((goal) => goal.status !== "completed").length + monitors.length,
      attention: nextUp.length,
    },
  };
}
