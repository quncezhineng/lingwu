import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DELIVERABLE_KINDS,
  DELIVERABLE_SOURCE_TYPES,
  DELIVERABLE_STATUSES,
  type Deliverable,
  type DeliverableAuditEntry,
  type DeliverableCitation,
  type DeliverableCitationInput,
  type DeliverableSource,
  type DeliverableVersion,
  deliverableCitationSchema,
  deliverableSourceSchema,
} from "../../../../packages/domain/src/deliverable.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

export const DELIVERABLE_KIND = "deliverables";
export const DELIVERABLE_AUDIT_KIND = "deliverable_audits";
export const DEFAULT_DISCLAIMER = "本内容由灵悟 AI 辅助生成，仅供研究参考，不构成投资建议。";
export const MAX_DELIVERABLE_CONTENT = 50_000;

/** 投研交付物里明确禁止的对外表述；命中任意一项即拦截发送。 */
export const PROHIBITED_TERMS = [
  "稳赚",
  "稳赚不赔",
  "保本",
  "保证收益",
  "收益承诺",
  "零风险",
  "无风险",
  "必涨",
  "包赚",
  "保证本金",
  "绝对收益",
  "100%收益",
] as const;

const actorSchema = z.enum(["user", "agent", "system"]).default("user");

export const createDeliverableSchema = z
  .object({
    kind: z.enum(DELIVERABLE_KINDS).default("CUSTOM"),
    title: z.string().trim().min(1).max(160),
    content: z.string().max(MAX_DELIVERABLE_CONTENT).default(""),
    sources: z.array(deliverableSourceSchema).max(20).default([]),
    citations: z.array(deliverableCitationSchema).max(100).default([]),
    disclaimer: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const updateDeliverableSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    content: z.string().max(MAX_DELIVERABLE_CONTENT).optional(),
    sources: z.array(deliverableSourceSchema).max(20).optional(),
    citations: z.array(deliverableCitationSchema).max(100).optional(),
    editor: z.enum(["user", "agent"]).default("user"),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.content !== undefined ||
      value.sources !== undefined ||
      value.citations !== undefined,
    { message: "Provide title, content, sources or citations to update" },
  );

export const transitionDeliverableSchema = z
  .object({
    actor: actorSchema,
    actorId: z.string().trim().min(1).max(200).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .default({ actor: "user" });

export const sendDeliverableSchema = z
  .object({
    recipients: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
    channel: z.enum(["manual", "email", "share"]).default("manual"),
    actor: actorSchema,
    actorId: z.string().trim().min(1).max(200).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const deliverableListQuerySchema = z.object({
  status: z.enum(DELIVERABLE_STATUSES).optional(),
  kind: z.enum(DELIVERABLE_KINDS).optional(),
  sourceType: z.enum(DELIVERABLE_SOURCE_TYPES).optional(),
  sourceId: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type CreateDeliverableInput = z.infer<typeof createDeliverableSchema>;
export type UpdateDeliverableInput = z.infer<typeof updateDeliverableSchema>;
export type TransitionDeliverableInput = z.infer<typeof transitionDeliverableSchema>;
export type SendDeliverableInput = z.infer<typeof sendDeliverableSchema>;
export type DeliverableListQuery = z.infer<typeof deliverableListQuerySchema>;

export interface NumericToken {
  text: string;
  occurrence: number;
}

export interface DiffLine {
  type: "context" | "added" | "removed";
  text: string;
}

export interface DeliverableDiff {
  addedLines: number;
  removedLines: number;
  lines: DiffLine[];
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 把代码、URL、日期与时间从正文里遮掉，但保留字符偏移，
 * 避免把链接或日期里的数字误判成需要溯源的业务数字。
 */
function maskNonNumericText(content: string) {
  const masks = [
    /```[\s\S]*?```/g,
    /`[^`\n]*`/g,
    /https?:\/\/[^\s)]+/gi,
    /\b\d{4}-\d{1,2}-\d{1,2}\b/g,
    /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,
    /\b(?:19|20)\d{2}年/g,
  ];
  return masks.reduce(
    (text, pattern) => text.replace(pattern, (match) => " ".repeat(match.length)),
    content,
  );
}

/** 提取正文中的数字 token 及其出现序号。 */
export function extractNumericTokens(content: string): NumericToken[] {
  const masked = maskNonNumericText(content);
  const pattern = /(?<![\w])(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)%?/g;
  const occurrences = new Map<string, number>();
  const tokens: NumericToken[] = [];
  for (const match of masked.matchAll(pattern)) {
    const text = match[0];
    const occurrence = (occurrences.get(text) ?? 0) + 1;
    occurrences.set(text, occurrence);
    tokens.push({ text, occurrence });
  }
  return tokens;
}

function citationCovers(token: NumericToken, citation: DeliverableCitation) {
  return citation.match === token.text && citation.occurrence === token.occurrence;
}

/** 找出尚未补来源、也未标为估算的数字。 */
export function findUnsourcedNumbers(
  content: string,
  citations: readonly DeliverableCitation[],
): NumericToken[] {
  return extractNumericTokens(content).filter(
    (token) => !citations.some((citation) => citationCovers(token, citation)),
  );
}

export function findProhibitedTerms(content: string): string[] {
  return PROHIBITED_TERMS.filter((term) => content.includes(term));
}

/** 保证对外内容带免责声明；已经包含同一文案时不重复追加。 */
export function injectDisclaimer(content: string, disclaimer: string) {
  if (content.includes(disclaimer)) return { content, injected: false };
  const trimmed = content.trimEnd();
  return {
    content: `${trimmed}${trimmed ? "\n\n---\n\n" : ""}${disclaimer}`,
    injected: true,
  };
}

/** 版本 diff：按行做 LCS，返回新增/删除行。 */
export function diffDeliverableContent(before: string, after: string): DeliverableDiff {
  const left = before.split("\n").slice(0, 2000);
  const right = after.split("\n").slice(0, 2000);
  const rows = left.length + 1;
  const cols = right.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        left[i] === right[j]
          ? (table[i + 1]![j + 1] ?? 0) + 1
          : Math.max(table[i + 1]![j] ?? 0, table[i]![j + 1] ?? 0);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      lines.push({ type: "context", text: left[i]! });
      i += 1;
      j += 1;
    } else if (
      j < right.length &&
      (i >= left.length || (table[i]![j + 1] ?? 0) >= (table[i + 1]![j] ?? 0))
    ) {
      lines.push({ type: "added", text: right[j]! });
      j += 1;
    } else {
      lines.push({ type: "removed", text: left[i]! });
      i += 1;
    }
  }
  return {
    addedLines: lines.filter((line) => line.type === "added").length,
    removedLines: lines.filter((line) => line.type === "removed").length,
    lines,
  };
}

function normalizeCitation(input: DeliverableCitationInput): DeliverableCitation {
  return {
    id: input.id ?? randomUUID(),
    match: input.match,
    occurrence: input.occurrence ?? 1,
    ...(input.url ? { url: input.url } : {}),
    ...(input.fetchedAt ? { fetchedAt: input.fetchedAt } : {}),
    ...(input.excerpt ? { excerpt: input.excerpt } : {}),
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.estimated ? { estimated: true } : {}),
  };
}

function normalizedSources(sources: DeliverableSource[]) {
  return sources.map((source) => ({
    type: source.type,
    id: source.id,
    ...(source.title ? { title: source.title } : {}),
    ...(source.url ? { url: source.url } : {}),
  }));
}

export function deliverableSummary(note: Deliverable) {
  return {
    id: note.id,
    kind: note.kind,
    title: note.title,
    status: note.status,
    version: note.version,
    sources: note.sources,
    submitted_at: note.review.submittedAt,
    updated_at: note.updatedAt,
  };
}

function excerptForList(note: Deliverable) {
  return note.content.replace(/\s+/g, " ").trim().slice(0, 160);
}

export interface DeliverableServiceOptions {
  disclaimer?: string;
  now?: () => Date;
}

export class DeliverablesService {
  private readonly disclaimer: string;
  private readonly now: () => Date;

  constructor(
    private readonly db: Store,
    options: DeliverableServiceOptions = {},
  ) {
    this.disclaimer =
      options.disclaimer ?? process.env.DELIVERABLE_DISCLAIMER ?? DEFAULT_DISCLAIMER;
    this.now = options.now ?? (() => new Date());
  }

  private at() {
    return this.now().toISOString();
  }

  private async require(owner: string, id: string) {
    const note = await this.db.get<Deliverable>(owner, DELIVERABLE_KIND, id);
    if (!note) throw new AppError("Deliverable not found", 404);
    return note;
  }

  private async audit(
    owner: string,
    note: Deliverable,
    action: DeliverableAuditEntry["action"],
    input: {
      actor?: DeliverableAuditEntry["actor"];
      actorId?: string;
      detail?: string;
      metadata?: Record<string, unknown>;
    } = {},
  ) {
    const entry: DeliverableAuditEntry = {
      id: randomUUID(),
      deliverableId: note.id,
      ownerId: owner,
      action,
      actor: input.actor ?? "user",
      ...(input.actorId ? { actorId: input.actorId } : {}),
      at: this.at(),
      version: note.version,
      ...(input.detail ? { detail: input.detail } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    await this.db.put(owner, DELIVERABLE_AUDIT_KIND, entry);
    return entry;
  }

  async list(owner: string, query: DeliverableListQuery = { limit: 100 }) {
    const notes = (await this.db.list<Deliverable>(owner, DELIVERABLE_KIND)).filter((note) => {
      if (query.status && note.status !== query.status) return false;
      if (query.kind && note.kind !== query.kind) return false;
      if (query.sourceType && !note.sources.some((source) => source.type === query.sourceType))
        return false;
      if (query.sourceId && !note.sources.some((source) => source.id === query.sourceId))
        return false;
      return true;
    });
    return notes.slice(0, query.limit).map((note) => ({
      ...deliverableSummary(note),
      excerpt: excerptForList(note),
    }));
  }

  async get(owner: string, id: string) {
    return this.require(owner, id);
  }

  async create(owner: string, input: CreateDeliverableInput) {
    const at = this.at();
    const disclaimer = input.disclaimer ?? this.disclaimer;
    const note: Deliverable = {
      id: randomUUID(),
      ownerId: owner,
      kind: input.kind,
      title: input.title,
      content: input.content,
      status: "draft",
      version: 1,
      versions: [
        {
          version: 1,
          title: input.title,
          content: input.content,
          editor: "user",
          at,
          addedLines: input.content.split("\n").length,
          removedLines: 0,
        },
      ],
      sources: normalizedSources(input.sources),
      citations: input.citations.map(normalizeCitation),
      disclaimer,
      review: {},
      createdAt: at,
      updatedAt: at,
      schemaVersion: 1,
    };
    const saved = await this.db.put(owner, DELIVERABLE_KIND, note);
    await this.audit(owner, saved, "created", {
      metadata: { kind: saved.kind, status: saved.status },
    });
    return saved;
  }

  async update(owner: string, id: string, input: UpdateDeliverableInput) {
    const note = await this.require(owner, id);
    if (note.status !== "draft" && note.status !== "in_review")
      throw new AppError(
        "Only draft or in-review deliverables can be edited",
        409,
        "invalid_status",
      );
    const at = this.at();
    const nextTitle = input.title ?? note.title;
    const nextContent = input.content ?? note.content;
    const contentChanged = nextTitle !== note.title || nextContent !== note.content;
    let version = note.version;
    let versions = note.versions;
    let addedLines = 0;
    let removedLines = 0;
    if (contentChanged) {
      const diff = diffDeliverableContent(note.content, nextContent);
      addedLines = diff.addedLines;
      removedLines = diff.removedLines;
      version = note.version + 1;
      const entry: DeliverableVersion = {
        version,
        title: nextTitle,
        content: nextContent,
        editor: input.editor,
        at,
        addedLines,
        removedLines,
      };
      versions = [...note.versions, entry].slice(-50);
    }
    const saved = await this.db.put(owner, DELIVERABLE_KIND, {
      ...note,
      title: nextTitle,
      content: nextContent,
      version,
      versions,
      ...(input.sources !== undefined ? { sources: normalizedSources(input.sources) } : {}),
      ...(input.citations !== undefined
        ? { citations: input.citations.map(normalizeCitation) }
        : {}),
      updatedAt: at,
    });
    await this.audit(owner, saved, "updated", {
      actor: input.editor,
      metadata: {
        content_changed: contentChanged,
        sources_changed: input.sources !== undefined,
        citations_changed: input.citations !== undefined,
        added_lines: addedLines,
        removed_lines: removedLines,
      },
    });
    return saved;
  }

  async submit(owner: string, id: string, input: TransitionDeliverableInput = { actor: "user" }) {
    const note = await this.require(owner, id);
    if (note.status !== "draft")
      throw new AppError("Only draft deliverables can be submitted", 409, "invalid_transition");
    const at = this.at();
    const saved = await this.db.put(owner, DELIVERABLE_KIND, {
      ...note,
      status: "in_review" as const,
      review: { ...note.review, submittedAt: at, submittedBy: input.actorId ?? input.actor },
      updatedAt: at,
    });
    await this.audit(owner, saved, "submitted", {
      actor: input.actor,
      actorId: input.actorId,
      detail: input.note,
    });
    return saved;
  }

  async approve(owner: string, id: string, input: TransitionDeliverableInput = { actor: "user" }) {
    const note = await this.require(owner, id);
    if (note.status !== "in_review")
      throw new AppError("Only in-review deliverables can be approved", 409, "invalid_transition");
    if (!note.content.trim())
      throw new AppError("An empty deliverable cannot be approved", 422, "empty_content");
    const unsourced = findUnsourcedNumbers(note.content, note.citations);
    if (unsourced.length) {
      await this.audit(owner, note, "compliance_blocked", {
        actor: input.actor,
        actorId: input.actorId,
        detail: "unsourced_numbers",
        metadata: { numbers: unsourced },
      });
      throw new AppError(
        `Unsourced numbers must be resolved before approval: ${unsourced
          .map((token) => token.text)
          .join(", ")}`,
        422,
        "unsourced_numbers",
      );
    }
    const at = this.at();
    const saved = await this.db.put(owner, DELIVERABLE_KIND, {
      ...note,
      status: "approved" as const,
      review: { ...note.review, approvedAt: at, approvedBy: input.actorId ?? input.actor },
      updatedAt: at,
    });
    await this.audit(owner, saved, "approved", {
      actor: input.actor,
      actorId: input.actorId,
      detail: input.note,
    });
    return saved;
  }

  async send(owner: string, id: string, input: SendDeliverableInput) {
    const note = await this.require(owner, id);
    if (note.status !== "approved")
      throw new AppError("Only approved deliverables can be sent", 409, "invalid_transition");
    const prohibited = findProhibitedTerms(note.content);
    if (prohibited.length) {
      await this.audit(owner, note, "compliance_blocked", {
        actor: input.actor,
        actorId: input.actorId,
        detail: "prohibited_language",
        metadata: { terms: prohibited },
      });
      throw new AppError(
        `Prohibited wording must be removed before sending: ${prohibited.join(", ")}`,
        422,
        "prohibited_language",
      );
    }
    const at = this.at();
    const injection = injectDisclaimer(note.content, note.disclaimer);
    let version = note.version;
    let versions = note.versions;
    if (injection.injected) {
      const diff = diffDeliverableContent(note.content, injection.content);
      version = note.version + 1;
      versions = [
        ...note.versions,
        {
          version,
          title: note.title,
          content: injection.content,
          editor: "system" as const,
          at,
          addedLines: diff.addedLines,
          removedLines: diff.removedLines,
        },
      ].slice(-50);
    }
    const saved = await this.db.put(owner, DELIVERABLE_KIND, {
      ...note,
      content: injection.content,
      version,
      versions,
      status: "sent" as const,
      send: {
        sentAt: at,
        sentBy: input.actorId ?? input.actor,
        recipients: input.recipients,
        channel: input.channel,
      },
      updatedAt: at,
    });
    await this.audit(owner, saved, "sent", {
      actor: input.actor,
      actorId: input.actorId,
      detail: input.note,
      metadata: {
        recipients: input.recipients,
        channel: input.channel,
        disclaimer_injected: injection.injected,
      },
    });
    return saved;
  }

  async archive(owner: string, id: string, input: TransitionDeliverableInput = { actor: "user" }) {
    const note = await this.require(owner, id);
    if (note.status === "archived") return note;
    const at = this.at();
    const saved = await this.db.put(owner, DELIVERABLE_KIND, {
      ...note,
      status: "archived" as const,
      archivedAt: at,
      updatedAt: at,
    });
    await this.audit(owner, saved, "archived", {
      actor: input.actor,
      actorId: input.actorId,
      detail: input.note,
    });
    return saved;
  }

  async versions(owner: string, id: string) {
    const note = await this.require(owner, id);
    return note.versions.map(({ content: _content, ...version }) => version);
  }

  async diff(owner: string, id: string, from: number, to: number) {
    const note = await this.require(owner, id);
    const before = note.versions.find((version) => version.version === from);
    const after = note.versions.find((version) => version.version === to);
    if (!before || !after)
      throw new AppError("Deliverable version not found", 404, "version_not_found");
    return {
      from,
      to,
      ...diffDeliverableContent(before.content, after.content),
    };
  }

  async audits(owner: string, id: string) {
    await this.require(owner, id);
    return (
      await this.db.listByField<DeliverableAuditEntry>(
        owner,
        DELIVERABLE_AUDIT_KIND,
        "deliverableId",
        id,
      )
    ).sort((left, right) => right.at.localeCompare(left.at));
  }

  async export(owner: string, id: string, format: "markdown" | "html") {
    const note = await this.require(owner, id);
    const content = injectDisclaimer(note.content, note.disclaimer).content;
    if (format === "html") return renderDeliverableHtml(note, content);
    return renderDeliverableMarkdown(note, content);
  }
}

export function renderDeliverableMarkdown(note: Deliverable, content: string) {
  const lines = [
    `# ${note.title}`,
    "",
    `> ${note.kind} · v${note.version} · ${note.status}`,
    "",
    content,
  ];
  if (note.citations.length) {
    lines.push("", "## 数字来源");
    for (const citation of note.citations) {
      if (citation.estimated) {
        lines.push(`- ${citation.match} — 估算`);
        continue;
      }
      const excerpt = citation.excerpt ? `：${citation.excerpt}` : "";
      lines.push(
        `- ${citation.match} — [${citation.url}](${citation.url}) · ${citation.fetchedAt ?? ""}${excerpt}`,
      );
    }
  }
  if (note.sources.length) {
    lines.push("", "## 来源回链");
    for (const source of note.sources) {
      const label = `${source.type}:${source.title ?? source.id}`;
      lines.push(source.url ? `- [${label}](${source.url})` : `- ${label}`);
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderDeliverableHtml(note: Deliverable, content: string) {
  const citations = note.citations
    .map((citation) => {
      if (citation.estimated) return `<li>${escapeHtml(citation.match)} — 估算</li>`;
      return `<li>${escapeHtml(citation.match)} — <a href="${escapeHtml(citation.url ?? "")}">${escapeHtml(
        citation.url ?? "",
      )}</a> · ${escapeHtml(citation.fetchedAt ?? "")}${citation.excerpt ? `：${escapeHtml(citation.excerpt)}` : ""}</li>`;
    })
    .join("");
  const sources = note.sources
    .map((source) => {
      const label = escapeHtml(`${source.type}:${source.title ?? source.id}`);
      return `<li>${source.url ? `<a href="${escapeHtml(source.url)}">${label}</a>` : label}</li>`;
    })
    .join("");
  return [
    "<!doctype html>",
    '<html lang="zh-Hans"><head><meta charset="utf-8">',
    `<title>${escapeHtml(note.title)}</title>`,
    "<style>body{font-family:system-ui,sans-serif;line-height:1.65;max-width:820px;margin:40px auto;padding:0 20px;color:#222}pre{white-space:pre-wrap;background:#f6f6f4;padding:16px;border-radius:8px}a{color:#145c43}</style>",
    "</head><body>",
    `<h1>${escapeHtml(note.title)}</h1>`,
    `<p>${escapeHtml(note.kind)} · v${note.version} · ${escapeHtml(note.status)}</p>`,
    `<pre>${escapeHtml(content)}</pre>`,
    citations ? `<h2>数字来源</h2><ul>${citations}</ul>` : "",
    sources ? `<h2>来源回链</h2><ul>${sources}</ul>` : "",
    "</body></html>",
  ].join("");
}
