import { useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "./i18n/storage";

const STORAGE_KEY = "lingwu.sidebar-collapsed.v1";
let collapsed = readStorage(STORAGE_KEY) === "true";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function toggleSidebar() {
  collapsed = !collapsed;
  writeStorage(STORAGE_KEY, String(collapsed));
  for (const listener of listeners) listener();
}

/** 桌面导航宽度跨页面共享，刷新后恢复上次的折叠状态。 */
export function useSidebarCollapsed() {
  return useSyncExternalStore(
    subscribe,
    () => collapsed,
    () => false,
  );
}
