export type GlobalSearchKind =
  | "task"
  | "artifact"
  | "file"
  | "conversation"
  | "mail"
  | "event"
  | "memory"
  | "monitor";

export interface SearchDocument {
  id: string;
  kind: GlobalSearchKind;
  title: string;
  detail: string;
  /** Additional searchable text that should not be shown in the result row. */
  keywords?: string;
  updatedAt?: string;
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase();
}

/**
 * Rank local workspace records using every whitespace-separated term.
 * Title matches rank ahead of metadata, while recency breaks equal scores.
 */
export function rankSearchDocuments(
  documents: readonly SearchDocument[],
  query: string,
  limit = 40,
): SearchDocument[] {
  const normalizedQuery = normalize(query).trim();
  if (!normalizedQuery || limit <= 0) return [];
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return documents
    .map((document, index) => {
      const title = normalize(document.title);
      const secondary = normalize(`${document.detail} ${document.keywords ?? ""}`);
      if (!terms.every((term) => title.includes(term) || secondary.includes(term))) {
        return undefined;
      }

      let score = 0;
      if (title === normalizedQuery) score += 160;
      else if (title.startsWith(normalizedQuery)) score += 100;
      else if (title.includes(normalizedQuery)) score += 70;
      for (const term of terms) {
        if (title === term) score += 50;
        else if (title.startsWith(term)) score += 30;
        else if (title.includes(term)) score += 20;
        if (secondary.includes(term)) score += 5;
      }
      return { document, index, score };
    })
    .filter((result): result is { document: SearchDocument; index: number; score: number } =>
      Boolean(result),
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const updated = (b.document.updatedAt ?? "").localeCompare(a.document.updatedAt ?? "");
      return updated || a.index - b.index;
    })
    .slice(0, limit)
    .map(({ document }) => document);
}

/** Most recently updated records, used as the search sheet's initial state. */
export function recentSearchDocuments(
  documents: readonly SearchDocument[],
  limit = 12,
): SearchDocument[] {
  return [...documents]
    .map((document, index) => ({ document, index }))
    .sort((a, b) => {
      const updated = (b.document.updatedAt ?? "").localeCompare(a.document.updatedAt ?? "");
      return updated || a.index - b.index;
    })
    .slice(0, Math.max(0, limit))
    .map(({ document }) => document);
}
