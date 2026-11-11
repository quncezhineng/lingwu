import MarkdownIt from "markdown-it";

export const assistantMarkdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

const SEPARATOR_CELL = /^:?-{3,}:?$/;

function splitPipes(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && line[i + 1] === "|") {
      current += "|";
      i += 1;
      continue;
    }
    if (line[i] === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += line[i];
  }
  cells.push(current);
  return cells;
}

function pipeCells(line: string): string[] {
  const cells = splitPipes(line.trim());
  let start = 0;
  let end = cells.length;
  if (cells[0]?.trim() === "") start = 1;
  if (end > start && cells[end - 1]?.trim() === "") end -= 1;
  return cells.slice(start, end);
}

function isSeparatorLine(line: string): boolean {
  const cells = pipeCells(line);
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL.test(cell.trim()));
}

function isPipeRow(line: string): boolean {
  const trimmed = line.trim();
  if (isSeparatorLine(trimmed)) return false;
  return pipeCells(trimmed).length >= 2 && (trimmed.match(/(?<!\\)\|/g)?.length ?? 0) >= 2;
}

function rowFromCells(cells: string[]): string {
  return `| ${cells.map((cell) => cell.trim()).join(" | ")} |`;
}

function separatorFor(row: string): string {
  const count = Math.max(1, pipeCells(row).length);
  return `| ${Array.from({ length: count }, () => "---").join(" | ")} |`;
}

/** A streamed chunk can glue the divider onto the header: `| 口径 | 价格 |---|---|`. */
function splitGluedSeparator(line: string): string[] {
  if (isSeparatorLine(line) || !isPipeRow(line)) return [line];
  const cells = pipeCells(line);
  const sepAt = cells.findIndex((cell) => SEPARATOR_CELL.test(cell.trim()));
  if (sepAt <= 0) return [line];
  const head = cells.slice(0, sepAt);
  return [rowFromCells(head), separatorFor(rowFromCells(head))];
}

function normalizePipeTables(prose: string, streaming: boolean): string {
  const lines = prose.split("\n");
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const glued = splitGluedSeparator(lines[index] ?? "");
    if (glued.length === 2) {
      const block = [...glued];
      index += 1;
      while (
        index < lines.length &&
        (isPipeRow(lines[index] ?? "") || isSeparatorLine(lines[index] ?? ""))
      ) {
        block.push(lines[index] ?? "");
        index += 1;
      }
      out.push(...block);
      continue;
    }
    if (!isPipeRow(lines[index] ?? "") && !isSeparatorLine(lines[index] ?? "")) {
      out.push(lines[index] ?? "");
      index += 1;
      continue;
    }
    const block: string[] = [];
    while (
      index < lines.length &&
      (isPipeRow(lines[index] ?? "") || isSeparatorLine(lines[index] ?? ""))
    ) {
      block.push(lines[index] ?? "");
      index += 1;
    }
    // A chunk that stopped mid-row is not a cell yet. Hide it until the stream finishes.
    if (streaming && block.length > 0) {
      const last = block[block.length - 1]?.trim() ?? "";
      if (isPipeRow(last) && !last.endsWith("|")) block.pop();
    }
    if (block.length === 0) continue;
    if (isPipeRow(block[0] ?? "") && !isSeparatorLine(block[1] ?? ""))
      block.splice(1, 0, separatorFor(block[0] ?? ""));
    out.push(...block);
  }
  return out.join("\n");
}

function protectInlineCode(text: string): { text: string; codes: string[] } {
  const codes: string[] = [];
  return {
    text: text.replace(/``[\s\S]*?``|`[^`\n]*`/g, (match) => {
      codes.push(match);
      return `\uE000${codes.length - 1}\uE000`;
    }),
    codes,
  };
}

function restoreInlineCode(text: string, codes: string[]): string {
  return text.replace(/\uE000(\d+)\uE000/g, (_, index: string) => codes[Number(index)] ?? "");
}

function repairEmphasisLine(line: string): string {
  // Keep a real pair (`的**抛压**`). Only a lone marker jammed between two
  // letters is noise (`定价**不是`). Deleting every such marker also ate the
  // opener of a pair and left the closer on screen.
  let next = line.replace(/^(\s*[-*+])\*\*/, "$1 **");
  next = next.replace(/^(\s*\d+[.)])\*\*/, "$1 **");
  const lostOpening = /^(\s*(?:[-*+]|\d+[.)])\s+)((?:(?!\*\*)[\s\S])*)\*\*\s*$/.exec(next);
  if (lostOpening) return `${lostOpening[1]}**${lostOpening[2].trimEnd()}**`;
  const unclosed = /^(\s*(?:[-*+]|\d+[.)])\s+)\*\*((?:(?!\*\*)[\s\S])*)$/.exec(next);
  if (unclosed && !next.trimEnd().endsWith("**")) return `${next.trimEnd()}**`;
  if ((next.match(/\*\*/g)?.length ?? 0) === 1)
    next = next.replace(/([\p{L}\p{N}])\*\*([\p{L}\p{N}])/u, "$1$2");
  if ((next.match(/\*\*/g)?.length ?? 0) % 2 === 1 && /(?:^|\s)\*\*\S/.test(next))
    return `${next.trimEnd()}**`;
  return next;
}

function closeDanglingEmphasis(prose: string): string {
  const protectedCode = protectInlineCode(prose);
  const repaired = protectedCode.text.split("\n").map(repairEmphasisLine).join("\n");
  return restoreInlineCode(repaired, protectedCode.codes);
}

/** CommonMark only treats `# title` as a heading. Models often write `##一、`. */
function normalizeAtxHeadings(prose: string): string {
  return prose.replace(/^[ \t]{0,3}([#＃]{1,6})(?![#＃ \t])/gm, (_, marks: string) => {
    return `${"#".repeat(marks.length)} `;
  });
}

function mapOutsideFences(source: string, streaming: boolean): string {
  const lines = source.split("\n");
  const out: string[] = [];
  let fence: "`" | "~" | null = null;
  let prose: string[] = [];
  const flush = () => {
    if (prose.length === 0) return;
    const normalized = normalizeAtxHeadings(normalizePipeTables(prose.join("\n"), streaming));
    out.push(closeDanglingEmphasis(normalized));
    prose = [];
  };
  for (const line of lines) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (!fence && marker) {
      flush();
      fence = marker[1].startsWith("`") ? "`" : "~";
      out.push(line);
      continue;
    }
    if (fence && new RegExp(`^ {0,3}${fence}{3,}\\s*$`).test(line)) {
      fence = null;
      out.push(line);
      continue;
    }
    if (fence) out.push(line);
    else prose.push(line);
  }
  flush();
  if (fence) out.push(fence.repeat(3));
  return out.join("\n");
}

/**
 * Streaming chunks arrive before a table divider or a closing `**` exists.
 * Incomplete markers are completed or held back so they are not drawn as literal
 * text. A finished message then parses as GFM: tables, bold, and lists.
 * No cell values are invented; a missing divider is only dashes.
 */
export function presentAssistantMarkdown(source: string, streaming = false): string {
  if (!source) return source;
  return mapOutsideFences(source, streaming);
}

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
