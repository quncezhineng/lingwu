export type ArchivedThreadLike = {
  id: string;
  name?: string | null;
  archived?: boolean;
};

/**
 * Return archived conversations once each, optionally filtered by name.
 * The runtime can briefly return duplicate ids while a pending thread syncs.
 */
export function filterArchivedThreads<T extends ArchivedThreadLike>(
  threads: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  const seen = new Set<string>();
  return threads.filter((thread) => {
    if (!thread.archived || seen.has(thread.id)) return false;
    seen.add(thread.id);
    return !needle || (thread.name ?? "").toLocaleLowerCase().includes(needle);
  });
}
