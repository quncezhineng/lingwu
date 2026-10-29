import { useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "./i18n/storage";

export const SAVED_INSIGHTS_STORAGE_KEY = "lingwu.saved-insights.v1";

function parseSavedIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item): item is string => typeof item === "string"))];
  } catch {
    return [];
  }
}

let savedIds = parseSavedIds(readStorage(SAVED_INSIGHTS_STORAGE_KEY));
let snapshot: readonly string[] = Object.freeze([...savedIds]);
const listeners = new Set<() => void>();

function emit() {
  snapshot = Object.freeze([...savedIds]);
  for (const listener of listeners) listener();
}

/** 纯函数，便于单测；返回按最近收藏优先排序的新数组。 */
export function toggledInsightIds(current: readonly string[], id: string): string[] {
  return current.includes(id)
    ? current.filter((candidate) => candidate !== id)
    : [id, ...current.filter((candidate) => candidate !== id)];
}

export function getSavedInsightIds(): readonly string[] {
  return snapshot;
}

export function isInsightSaved(id: string): boolean {
  return savedIds.includes(id);
}

/** 收藏状态跨页面共享，并持久化到浏览器本地存储；原生端退化为会话内存。 */
export function toggleSavedInsight(id: string): readonly string[] {
  savedIds = toggledInsightIds(savedIds, id);
  writeStorage(SAVED_INSIGHTS_STORAGE_KEY, JSON.stringify(savedIds));
  emit();
  return snapshot;
}

export function subscribeSavedInsights(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetSavedInsightsForTests(): void {
  savedIds = [];
  writeStorage(SAVED_INSIGHTS_STORAGE_KEY, "[]");
  emit();
}

export function useSavedInsightIds(): readonly string[] {
  return useSyncExternalStore(subscribeSavedInsights, getSavedInsightIds, getSavedInsightIds);
}
