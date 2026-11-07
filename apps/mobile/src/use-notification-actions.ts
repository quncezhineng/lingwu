import { useCallback, useMemo, useState } from "react";
import type { AgentNotification } from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import {
  actionableNotifications,
  markNotificationRead,
  notificationError,
  READ_ALL_PATH,
  unreadNotifications,
} from "./notification-actions";
import { useWorkspace } from "./workspace";

/**
 * Shared read receipts for every notification surface. Opening a notification
 * marks it read first and only navigates when that write succeeded.
 */
export function useNotificationActions() {
  const { data, mutate } = useAgentWorkspace();
  const { open } = useWorkspace();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const notifications = data?.notifications;
  const unread = useMemo(() => unreadNotifications(notifications), [notifications]);
  const updates = useMemo(() => actionableNotifications(notifications), [notifications]);

  const markRead = useCallback(
    async (id: string): Promise<boolean> => {
      setBusy(true);
      try {
        await markNotificationRead(mutate, id);
        setError("");
        return true;
      } catch (e) {
        setError(notificationError(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [mutate],
  );

  const readAll = useCallback(async (): Promise<void> => {
    if (!unread.length || busy) return;
    setBusy(true);
    try {
      await mutate(READ_ALL_PATH, {});
      setError("");
    } catch (e) {
      setError(notificationError(e));
    } finally {
      setBusy(false);
    }
  }, [mutate, unread.length, busy]);

  const openNotification = useCallback(
    async (item: AgentNotification): Promise<void> => {
      if (!(await markRead(item.id))) return;
      if (item.taskId) open({ type: "task", taskId: item.taskId });
    },
    [markRead, open],
  );

  return {
    unreadCount: unread.length,
    updates,
    error,
    busy,
    markRead,
    readAll,
    openNotification,
  };
}
