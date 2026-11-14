import type { Artifact } from "../../../packages/domain/src";
import type { AgentArtifact } from "../../../packages/domain/src/agent";
import { markdownExcerpt } from "./file-library";

export interface UserAttachment {
  id: string;
  name: string;
}

export interface DisplayUserMessage {
  text: string;
  attachments: UserAttachment[];
}

const ATTACHMENT_MARKER = /\n\nAttached documents:\s*/;

/** Drop the composer skill line before the bubble or title is shown. */
export function withoutSelectedSkills(content: string): string {
  return content.replace(/\n\nSelected skills:\s*[^\n]*/g, "").trimEnd();
}

/** Append the skill ids the server uses to load methods the person attached. */
export function promptWithSkills(
  text: string,
  skills: readonly { id: string; name: string }[],
): string {
  const entries = skills
    .map((skill) => ({ id: skill.id.trim(), name: (skill.name || skill.id).trim() }))
    .filter((skill) => skill.id);
  if (!entries.length) return text;
  const line = entries.map((skill) => `${skill.name} (skill ID: ${skill.id})`).join(", ");
  return `${text.replace(/\s+$/g, "")}\n\nSelected skills: ${line}`;
}
const ATTACHMENT_ENTRY = /(.+?)\s+\(artifact ID:\s*([^)]+)\)(?:\s*,\s*|$)/g;
const UNTOUCHED_MARKDOWN = /(```[\s\S]*?```|`[^`\n]*`|\[[^\]]*\]\([^)]*\)|<[^>]*>)/g;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\/-]/g;

/** The composer appends artifact ids after a blank line for the agent. Hide that
 *  transport detail from the bubble and expose the files as tappable chips. */
export function displayUserMessage(content: string): DisplayUserMessage {
  const visible = withoutSelectedSkills(content);
  const marker = ATTACHMENT_MARKER.exec(visible);
  if (!marker) return { text: visible, attachments: [] };
  const text = visible.slice(0, marker.index).trimEnd();
  const segment = visible.slice(marker.index + marker[0].length);
  const attachments: UserAttachment[] = [];
  for (const match of segment.matchAll(ATTACHMENT_ENTRY)) {
    const name = match[1]?.trim();
    const id = match[2]?.trim();
    if (name && id) attachments.push({ id, name });
  }
  return { text, attachments };
}

/** Appends the stable artifact references the agent uses to load selected files.
 *  Analysis artifacts have no server read path, so a bounded summary excerpt is
 *  inlined after the reference list to give the model content to reason about.
 *  The bubble renderer only turns "name (artifact ID: id)" pairs into chips and
 *  ignores the excerpt block, so the visible message stays clean. */
export function promptWithAttachments(
  text: string,
  files: readonly Pick<Artifact, "id" | "name">[],
  analysis?: readonly AgentArtifact[],
): string {
  const documents = [
    ...files.map((file) => `${file.name} (artifact ID: ${file.id})`),
    ...(analysis ?? []).map((artifact) => `${artifact.title} (artifact ID: ${artifact.id})`),
  ];
  if (!documents.length) return text;
  let content = `${text.trimEnd()}\n\nAttached documents: ${documents.join(", ")}`;
  // 分析产物摘要块跟在引用列表之后，以尾逗号收尾以便渲染端把最后一条也识别成附件；
  // 气泡渲染只提取 "name (artifact ID: id)"，摘要块本身不会泄露到用户可见消息里。
  if (analysis?.length) {
    content += `,\n\nAttached analysis documents:\n${analysis
      .map((artifact) => `- ${artifact.title}: ${markdownExcerpt(artifact.summary, 240)}`)
      .join("\n")}`;
  }
  return content;
}

function decodeReference(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Match an inline code span or relative link against the files of this thread. */
export function findReferencedFile<T extends Pick<Artifact, "id" | "name">>(
  value: string,
  files: readonly T[],
): T | undefined {
  const clean = decodeReference(value.trim())
    .replace(/^file:\/\//, "")
    .split(/[?#]/, 1)[0]
    .replace(/^\.\//, "");
  if (!clean) return undefined;
  const basename = clean.split("/").pop() ?? clean;
  const byId = files.filter((file) => file.id === clean);
  if (byId.length === 1) return byId[0];
  const byName = files.filter((file) => file.name === clean);
  if (byName.length === 1) return byName[0];
  const byBasename = files.filter((file) => file.name === basename);
  return byBasename.length === 1 ? byBasename[0] : undefined;
}

function markdownLabels(files: readonly Pick<Artifact, "name">[]): string[] {
  const names = new Map<string, number>();
  for (const file of files) {
    const path = file.name.trim().replace(/^\.?\//, "");
    const base = path.split("/").pop() ?? path;
    for (const label of new Set([path, base])) {
      if (label.includes(".") && !label.includes("`") && !/[\r\n]/.test(label)) {
        names.set(label, (names.get(label) ?? 0) + 1);
      }
    }
  }
  return [...names]
    .filter(([, count]) => count === 1)
    .map(([label]) => label)
    .sort((a, b) => b.length - a.length);
}

/**
 * Adds inline-code markers around bare names of files in this thread. Existing code,
 * fenced blocks, Markdown links and raw HTML are left untouched so only prose is linked.
 */
export function markFileMentions(text: string, files: readonly Pick<Artifact, "name">[]): string {
  const labels = markdownLabels(files);
  if (!text || !labels.length) return text;
  const alternatives = labels.map((label) => label.replace(REGEX_SPECIAL, "\\$&")).join("|");
  const mention = new RegExp(`(^|[^\\w./\\\\-])(${alternatives})(?![\\w/-]|\\.\\w)`, "g");
  return text
    .split(UNTOUCHED_MARKDOWN)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(mention, "$1`$2`")))
    .join("");
}
