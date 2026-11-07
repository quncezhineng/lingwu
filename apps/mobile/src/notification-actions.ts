import type { AgentNotification } from "../../../packages/domain/src/agent";

/** Notifications stay flat in the workspace snapshot; each view derives its own selection. */
export function unreadNotifications(
  notifications: readonly AgentNotification[] | undefined,
): AgentNotification[] {
  return (notifications ?? []).filter((item) => !item.read);
}

/** Only task-linked unread notifications can take the user back to the work. */
export function actionableNotifications(
  notifications: readonly AgentNotification[] | undefined,
): AgentNotification[] {
  return unreadNotifications(notifications).filter((item) => Boolean(item.taskId));
}

export function unreadCount(notifications: readonly AgentNotification[] | undefined): number {
  return unreadNotifications(notifications).length;
}

export type NotificationMutate = (path: string, body: unknown) => Promise<unknown>;

export function notificationReadPath(id: string): string {
  return `/notifications/${encodeURIComponent(id)}/read`;
}

export const READ_ALL_PATH = "/notifications/read-all";

export function notificationError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The single place that writes a read receipt; callers decide what to do on failure. */
export async function markNotificationRead(mutate: NotificationMutate, id: string): Promise<void> {
  await mutate(notificationReadPath(id), {});
}
