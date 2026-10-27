import MarkdownIt from "markdown-it";

export const assistantMarkdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

export function isSafeAssistantUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname;
  } catch {
    return false;
  }
}

function decodeReference(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type InlineDocumentKind = "html" | "markdown";

export interface InlineDocument {
  name: string;
  kind: InlineDocumentKind;
  source: string;
}

export interface InlineDocumentScan {
  documents: ReadonlyMap<string, InlineDocument>;
  markdown: string;
}

/** Normalize an inline file reference so prose can be matched to its code block. */
export function inlineDocumentReference(
  value: string,
): { name: string; kind: InlineDocumentKind } | undefined {
  const clean = decodeReference(value.trim())
    .replace(/^file:\/\//, "")
    .split(/[?#]/, 1)[0]
    .replace(/^\.\//, "");
  const basename = clean.split("/").pop();
  if (!basename) return undefined;
  if (/\.html?$/i.test(basename)) return { name: basename.toLowerCase(), kind: "html" };
  if (/\.(?:md|markdown)$/i.test(basename))
    return { name: basename.toLowerCase(), kind: "markdown" };
  return undefined;
}

/** Normalize an inline document filename without exposing its file kind. */
export function inlineDocumentFileName(value: string): string | undefined {
  return inlineDocumentReference(value)?.name;
}

/** Preserve the HTML-only helper used by callers that only accept HTML documents. */
export function inlineHtmlFileName(value: string): string | undefined {
  const reference = inlineDocumentReference(value);
  return reference?.kind === "html" ? reference.name : undefined;
}

function fenceKind(token: { info: string; content: string }): InlineDocumentKind | undefined {
  const language = token.info.trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (language === "html" || language === "htm") return "html";
  if (language === "md" || language === "markdown") return "markdown";
  const source = token.content.trimStart();
  return /^<!doctype\s+html(?:\s|>)/i.test(source) || /^<html(?:\s|>)/i.test(source)
    ? "html"
    : undefined;
}

/**
 * HTML returned directly in chat is often introduced as "save this as `report.html`"
 * or "save this as `report.md`". Find the paired source block and remove it from the
 * visible Markdown so chat only shows the clickable filename.
 */
export function scanInlineDocuments(markdown: string): InlineDocumentScan {
  const documents = new Map<string, InlineDocument>();
  const hiddenRanges: Array<[number, number]> = [];
  const pending = new Map<string, InlineDocumentKind>();
  for (const token of assistantMarkdown.parse(markdown, {})) {
    if (token.type === "inline") {
      for (const child of token.children ?? []) {
        if (child.type !== "code_inline") continue;
        const reference = inlineDocumentReference(child.content);
        if (reference) pending.set(reference.name, reference.kind);
      }
      continue;
    }
    if (token.type !== "fence" && token.type !== "code_block") continue;
    const kind = fenceKind(token);
    let matched = false;
    if (kind) {
      for (const [name, fileKind] of pending) {
        if (fileKind !== kind || documents.has(name)) continue;
        documents.set(name, { name, kind, source: token.content });
        matched = true;
      }
    }
    if (matched && token.map) hiddenRanges.push(token.map);
    pending.clear();
  }
  const hiddenLines = new Set<number>();
  for (const [start, end] of hiddenRanges) {
    for (let line = start; line < end; line++) hiddenLines.add(line);
  }
  const visibleMarkdown = hiddenLines.size
    ? markdown
        .split(/\r?\n/)
        .filter((_, index) => !hiddenLines.has(index))
        .join("\n")
    : markdown;
  return { documents, markdown: visibleMarkdown };
}

/** Backward-compatible HTML-only view of the inline document scan. */
export function inlineHtmlDocuments(markdown: string): ReadonlyMap<string, string> {
  const documents = new Map<string, string>();
  for (const [name, document] of scanInlineDocuments(markdown).documents) {
    if (document.kind === "html") documents.set(name, document.source);
  }
  return documents;
}
