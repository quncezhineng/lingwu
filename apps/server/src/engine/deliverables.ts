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
  type DeliverableComplianceReport,
  type DeliverablePiiFinding,
  type DeliverableShare,
  type DeliverableSource,
  type DeliverableVersion,
  type DeliverableViolation,
  deliverableCitationSchema,
  deliverableSourceSchema,
} from "../../../../packages/domain/src/deliverable.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

export const DELIVERABLE_KIND = "deliverables";
export const DELIVERABLE_AUDIT_KIND = "deliverable_audits";
export const DELIVERABLE_SHARE_KIND = "deliverable_shares";
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
    template_id: z.string().trim().min(1).max(100).optional(),
    template_version: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

export const updateDeliverableSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    content: z.string().max(MAX_DELIVERABLE_CONTENT).optional(),
    sources: z.array(deliverableSourceSchema).max(20).optional(),
    citations: z.array(deliverableCitationSchema).max(100).optional(),
    template_id: z.string().trim().min(1).max(100).optional(),
    template_version: z.string().trim().min(1).max(60).optional(),
    editor: z.enum(["user", "agent"]).default("user"),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.content !== undefined ||
      value.sources !== undefined ||
      value.citations !== undefined ||
      value.template_id !== undefined ||
      value.template_version !== undefined,
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

const httpUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "Source URL must use http(s)");

/** 无源数字的三种处理方式：补来源 / 标为估算 / 删除。 */
export const resolveNumberSchema = z.discriminatedUnion("resolution", [
  z
    .object({
      resolution: z.literal("source"),
      match: z.string().trim().min(1).max(80),
      occurrence: z.number().int().min(1).max(1000).default(1),
      url: httpUrlSchema,
      excerpt: z.string().trim().min(1).max(500),
      fetchedAt: z.iso.datetime({ offset: true }).optional(),
    })
    .strict(),
  z
    .object({
      resolution: z.literal("estimate"),
      match: z.string().trim().min(1).max(80),
      occurrence: z.number().int().min(1).max(1000).default(1),
    })
    .strict(),
  z
    .object({
      resolution: z.literal("remove"),
      match: z.string().trim().min(1).max(80),
      occurrence: z.number().int().min(1).max(1000).default(1),
    })
    .strict(),
]);

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
export type ResolveNumberInput = z.infer<typeof resolveNumberSchema>;
export type DeliverableListQuery = z.infer<typeof deliverableListQuerySchema>;

export interface NumericToken {
  text: string;
  occurrence: number;
  start: number;
  end: number;
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
    /[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/g,
    /(?<!\d)1[3-9]\d{9}(?!\d)/g,
    /(?<![\dA-Za-z])\d{17}[\dXx](?![\dA-Za-z])/g,
  ];
  return masks.reduce(
    (text, pattern) => text.replace(pattern, (match) => " ".repeat(match.length)),
    content,
  );
}

/** 数字 token 的规范化：去掉数字与单位之间的空格，统一百分号与负号。 */
export function normalizeNumericToken(text: string) {
  return text.replace(/\s+/g, "").replace(/％/g, "%").replace(/−/g, "-").toLowerCase();
}

/**
 * 提取正文中的数字 token 及其出现序号。
 *
 * token 保留正负号与单位/币种（`-5%`、`+5%`、`10亿元` 是不同 token），
 * 避免不同量纲或方向被同一条引用错误覆盖。
 */
export function extractNumericTokens(content: string): NumericToken[] {
  const masked = maskNonNumericText(content);
  const pattern =
    /(?<![\w#/.-])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s?(?:亿元|亿美元|万美元|亿港元|万港元|%|％|bps|bp|x|X|倍|亿|万|美元|港元|元|点))?/g;
  const occurrences = new Map<string, number>();
  const tokens: NumericToken[] = [];
  for (const match of masked.matchAll(pattern)) {
    const raw = match[0];
    const text = raw.trim();
    if (!text || !/\d/.test(text)) continue;
    if (/^[-+]?(?:19|20)\d{2}$/.test(text)) continue;
    // 行首列表序号（`1.` / `- 2)`）与 `## 1.` 标题序号不是结论数字。
    const start = (match.index ?? 0) + raw.indexOf(text);
    const lineStart = masked.lastIndexOf("\n", start - 1) + 1;
    const prefix = masked.slice(lineStart, start);
    const suffix = masked.slice(start + text.length);
    if (/^\s*(?:(?:#{1,6}|[-*+])\s*)?$/.test(prefix) && /^[.)、](?:\s|$)/.test(suffix)) continue;
    const digits = text.replace(/\D/g, "");
    if (/^1[3-9]\d{9}$/.test(digits) || digits.length >= 15) continue;
    const key = normalizeNumericToken(text);
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    tokens.push({ text, occurrence, start, end: start + text.length });
  }
  return tokens;
}

function citationCovers(token: NumericToken, citation: DeliverableCitation) {
  return (
    normalizeNumericToken(citation.match) === normalizeNumericToken(token.text) &&
    citation.occurrence === token.occurrence
  );
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

const PII_PATTERNS: Array<{
  code: DeliverablePiiFinding["code"];
  label: string;
  pattern: RegExp;
  mask: (value: string) => string;
}> = [
  {
    code: "phone",
    label: "手机号",
    pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
    mask: (value) => `${value.slice(0, 3)}****${value.slice(-4)}`,
  },
  {
    code: "id_card",
    label: "身份证号",
    pattern: /(?<![\dA-Za-z])\d{17}[\dXx](?![\dA-Za-z])/g,
    mask: (value) => `${value.slice(0, 4)}**********${value.slice(-4)}`,
  },
  {
    code: "email",
    label: "邮箱",
    pattern: /[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/g,
    mask: (value) => `${value.slice(0, 2)}***@***`,
  },
  {
    code: "bank_account",
    label: "资金账号",
    pattern: /(账号|账户|卡号|资金号)\s*[:：]?\s*(\d[\d\s-]{6,})/g,
    mask: (value) => `${value.slice(0, 4)}****`,
  },
  {
    code: "client_name",
    label: "客户姓名",
    pattern: /(客户姓名|客户)\s*[:：]\s*[\u4e00-\u9fa5]{2,4}/g,
    mask: () => "客户：[已脱敏]",
  },
];

/** 规则检测客户信息（手机号 / 身份证 / 邮箱 / 资金账号 / 客户姓名）。 */
export function detectPii(text: string): DeliverablePiiFinding[] {
  const findings: DeliverablePiiFinding[] = [];
  for (const rule of PII_PATTERNS) {
    for (const match of text.matchAll(rule.pattern)) {
      if (!match[0]) continue;
      findings.push({
        code: rule.code,
        label: rule.label,
        excerpt: match[0].slice(0, 120),
        redacted: rule.mask(match[0]),
        source: "rule",
      });
    }
  }
  return findings;
}

export function redactPii(text: string): string {
  let next = text;
  for (const rule of PII_PATTERNS) next = next.replace(rule.pattern, (match) => rule.mask(match));
  return next;
}

/**
 * 应用模型复核给出的 `redacted` 文本。
 * 命中片段找不到、或 `redacted` 仍等于原文时视为无法脱敏，由调用方阻断发送，
 * 避免出现「正文未脱敏但审计写 pii_redacted」。
 */
export function applyModelPiiFindings(
  text: string,
  findings: readonly DeliverablePiiFinding[],
): { content: string; missing: string[] } {
  let next = text;
  const missing: string[] = [];
  for (const finding of findings) {
    if (!finding.excerpt || !finding.redacted || finding.redacted === finding.excerpt) {
      missing.push(finding.excerpt || finding.label);
      continue;
    }
    if (!next.includes(finding.excerpt)) {
      missing.push(finding.excerpt);
      continue;
    }
    next = next.split(finding.excerpt).join(finding.redacted);
  }
  return { content: next, missing };
}

/** 规则库命中的违禁表述（带片段，便于前端明确提示）。 */
export function detectProhibited(content: string): DeliverableViolation[] {
  const violations: DeliverableViolation[] = [];
  for (const term of PROHIBITED_TERMS) {
    const index = content.indexOf(term);
    if (index < 0) continue;
    violations.push({
      code: "prohibited_language",
      label: term,
      excerpt: content.slice(Math.max(0, index - 12), index + term.length + 24),
    });
  }
  return violations;
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
  /**
   * 模型复核钩子：规则库之外的第二道客户信息检查。
   * 未配置时合规报告如实标注 `not_configured`，不伪造双检通过。
   */
  piiReview?: (content: string) => Promise<DeliverablePiiFinding[]> | DeliverablePiiFinding[];
}

export class DeliverablesService {
  private readonly disclaimer: string;
  private readonly now: () => Date;
  private readonly piiReview?: DeliverableServiceOptions["piiReview"];

  constructor(
    private readonly db: Store,
    options: DeliverableServiceOptions = {},
  ) {
    this.disclaimer =
      options.disclaimer ?? process.env.DELIVERABLE_DISCLAIMER ?? DEFAULT_DISCLAIMER;
    this.now = options.now ?? (() => new Date());
    this.piiReview = options.piiReview;
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
      ...(input.template_id ? { template_id: input.template_id } : {}),
      ...(input.template_version ? { template_version: input.template_version } : {}),
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

  /**
   * 定时任务产出自动落交付物中心。
   * 同一任务重放（进程重启 / 恢复）时返回已有记录，不重复创建。
   */
  async captureFromTask(
    owner: string,
    task: { id: string; title: string; kind: string; result?: string },
  ) {
    const existing = await this.db.listByField<Deliverable>(
      owner,
      DELIVERABLE_KIND,
      "sourceTaskId",
      task.id,
    );
    if (existing[0]) return existing[0];
    const kind =
      task.kind === "market_briefing" ? "BRIEFING" : task.kind === "finance" ? "TABLE" : "REPORT";
    const at = this.at();
    const content = task.result?.trim() || task.title;
    const note: Deliverable = {
      id: randomUUID(),
      ownerId: owner,
      kind,
      title: task.title,
      content,
      status: "draft",
      version: 1,
      versions: [
        {
          version: 1,
          title: task.title,
          content,
          editor: "agent",
          at,
          addedLines: content.split("\n").length,
          removedLines: 0,
        },
      ],
      sources: [{ type: "task", id: task.id, title: task.title }],
      citations: [],
      disclaimer: this.disclaimer,
      review: {},
      sourceTaskId: task.id,
      createdAt: at,
      updatedAt: at,
      schemaVersion: 1,
    };
    const saved = await this.db.put(owner, DELIVERABLE_KIND, note);
    await this.audit(owner, saved, "created", {
      actor: "agent",
      detail: "定时任务产出自动进入交付物中心",
      metadata: { task_id: task.id, kind: saved.kind },
    });
    return saved;
  }

  async update(owner: string, id: string, input: UpdateDeliverableInput) {
    const note = await this.require(owner, id);
    if (note.status === "sent" || note.status === "archived")
      throw new AppError("Sent or archived deliverables are read-only", 409, "invalid_status");
    const at = this.at();
    const nextTitle = input.title ?? note.title;
    const nextContent = input.content ?? note.content;
    const contentChanged = nextTitle !== note.title || nextContent !== note.content;
    const material = contentChanged || input.sources !== undefined || input.citations !== undefined;
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
    // 已批准的交付物发生实质变更必须重新审批：退回 draft 并撤销旧分享链接。
    const demoted = note.status === "approved" && material;
    const saved = await this.db.put(owner, DELIVERABLE_KIND, {
      ...note,
      title: nextTitle,
      content: nextContent,
      version,
      versions,
      ...(demoted
        ? {
            status: "draft" as const,
            review: { ...note.review, approvedAt: undefined, approvedBy: undefined },
          }
        : {}),
      ...(input.sources !== undefined ? { sources: normalizedSources(input.sources) } : {}),
      ...(input.citations !== undefined
        ? { citations: input.citations.map(normalizeCitation) }
        : {}),
      ...(input.template_id !== undefined ? { template_id: input.template_id } : {}),
      ...(input.template_version !== undefined ? { template_version: input.template_version } : {}),
      updatedAt: at,
    });
    if (demoted) await this.revokeSharesFor(owner, note.id, "approved 修改退回 draft");
    await this.audit(owner, saved, "updated", {
      actor: input.editor,
      detail: demoted ? "已批准交付物发生实质修改，已退回草稿并撤销分享链接" : undefined,
      metadata: {
        content_changed: contentChanged,
        sources_changed: input.sources !== undefined,
        citations_changed: input.citations !== undefined,
        demoted_to_draft: demoted,
        added_lines: addedLines,
        removed_lines: removedLines,
      },
    });
    return saved;
  }

  /** 撤销某交付物的全部有效分享链接。 */
  private async revokeSharesFor(owner: string, deliverableId: string, reason: string) {
    const shares = await this.db.listByField<DeliverableShare>(
      owner,
      DELIVERABLE_SHARE_KIND,
      "deliverableId",
      deliverableId,
    );
    for (const share of shares) {
      if (!share.revoked)
        await this.db.put(owner, DELIVERABLE_SHARE_KIND, {
          ...share,
          revoked: true,
          revokedReason: reason,
        } as DeliverableShare);
    }
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

  /** in_review 退回修改；approved 也允许退回（会撤销分享链接）。 */
  async returnToDraft(
    owner: string,
    id: string,
    input: TransitionDeliverableInput = { actor: "user" },
  ) {
    const note = await this.require(owner, id);
    if (note.status !== "in_review" && note.status !== "approved")
      throw new AppError(
        "Only in-review or approved deliverables can be returned to draft",
        409,
        "invalid_transition",
      );
    const at = this.at();
    const saved = await this.db.put(owner, DELIVERABLE_KIND, {
      ...note,
      status: "draft" as const,
      review: {},
      updatedAt: at,
    });
    if (note.status === "approved") await this.revokeSharesFor(owner, note.id, "交付物退回草稿");
    await this.audit(owner, saved, "returned", {
      actor: input.actor,
      actorId: input.actorId,
      detail: input.note ?? "退回草稿修改",
      metadata: { from_status: note.status },
    });
    return saved;
  }

  /**
   * 无源数字的三种处理：补来源 / 标为估算 / 删除。
   * 已批准的交付物发生处理后同样退回 draft，避免绕过人审。
   */
  async resolveNumber(owner: string, id: string, input: ResolveNumberInput) {
    const note = await this.require(owner, id);
    if (note.status === "sent" || note.status === "archived")
      throw new AppError("Sent or archived deliverables are read-only", 409, "invalid_status");
    const token = extractNumericTokens(note.content).find(
      (item) =>
        normalizeNumericToken(item.text) === normalizeNumericToken(input.match) &&
        item.occurrence === input.occurrence,
    );
    if (!token)
      throw new AppError(
        `Number not found in content: ${input.match} #${input.occurrence}`,
        404,
        "number_not_found",
      );
    const at = this.at();
    const key = normalizeNumericToken(token.text);
    if (input.resolution === "source" || input.resolution === "estimate") {
      const citation: DeliverableCitation =
        input.resolution === "source"
          ? {
              id: randomUUID(),
              match: token.text,
              occurrence: token.occurrence,
              url: input.url,
              fetchedAt: input.fetchedAt ?? at,
              excerpt: input.excerpt,
            }
          : {
              id: randomUUID(),
              match: token.text,
              occurrence: token.occurrence,
              estimated: true,
            };
      const citations = [
        ...note.citations.filter(
          (item) =>
            !(normalizeNumericToken(item.match) === key && item.occurrence === token.occurrence),
        ),
        citation,
      ];
      const demoted = note.status === "approved";
      const saved = await this.db.put(owner, DELIVERABLE_KIND, {
        ...note,
        citations,
        ...(demoted
          ? {
              status: "draft" as const,
              review: { ...note.review, approvedAt: undefined, approvedBy: undefined },
            }
          : {}),
        updatedAt: at,
      });
      if (demoted) await this.revokeSharesFor(owner, note.id, "数字来源变更退回草稿");
      await this.audit(
        owner,
        saved,
        input.resolution === "source" ? "number_sourced" : "number_estimated",
        {
          detail:
            input.resolution === "source"
              ? `为「${token.text}」补充来源`
              : `将「${token.text}」标记为估算`,
          metadata: { match: token.text, occurrence: token.occurrence, demoted_to_draft: demoted },
        },
      );
      return saved;
    }

    // 删除数字会改写正文，生成新版本并重算后续同名 token 的出现序号。
    const content = (note.content.slice(0, token.start) + note.content.slice(token.end))
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ +([，。；、！？,.;!?])/g, "$1");
    if (!content.trim()) throw new AppError("Cannot remove the only content", 422, "empty_content");
    const diff = diffDeliverableContent(note.content, content);
    const version = note.version + 1;
    const demoted = note.status === "approved";
    const saved = await this.db.put(owner, DELIVERABLE_KIND, {
      ...note,
      content,
      citations: note.citations
        .filter(
          (item) =>
            !(normalizeNumericToken(item.match) === key && item.occurrence === token.occurrence),
        )
        .map((item) =>
          normalizeNumericToken(item.match) === key && item.occurrence > token.occurrence
            ? { ...item, occurrence: item.occurrence - 1 }
            : item,
        ),
      version,
      versions: [
        ...note.versions,
        {
          version,
          title: note.title,
          content,
          editor: "user" as const,
          at,
          addedLines: diff.addedLines,
          removedLines: diff.removedLines,
        },
      ].slice(-50),
      ...(demoted
        ? {
            status: "draft" as const,
            review: { ...note.review, approvedAt: undefined, approvedBy: undefined },
          }
        : {}),
      updatedAt: at,
    });
    if (demoted) await this.revokeSharesFor(owner, note.id, "删除数字退回草稿");
    await this.audit(owner, saved, "number_removed", {
      detail: `删除「${token.text}」并生成新版本`,
      metadata: { match: token.text, occurrence: token.occurrence, demoted_to_draft: demoted },
    });
    return saved;
  }

  /** 合规检查：规则库 + 可选的模型复核钩子；未配置模型时如实标注。 */
  async checkCompliance(note: Deliverable): Promise<DeliverableComplianceReport> {
    const violations = detectProhibited(note.content);
    const rulePii = detectPii(note.content);
    const modelPii = this.piiReview
      ? (await this.piiReview(note.content)).map((finding) => ({
          ...finding,
          source: "model" as const,
        }))
      : [];
    const pii = [...rulePii, ...modelPii];
    const unsourced = findUnsourcedNumbers(note.content, note.citations);
    const disclaimerMissing = !note.content.includes(note.disclaimer);
    return {
      checkedAt: this.at(),
      passed: violations.length === 0 && unsourced.length === 0,
      disclaimer: note.disclaimer,
      disclaimerMissing,
      violations,
      pii,
      unsourcedNumbers: unsourced.map((token) => token.text),
      ruleEngine: "ok",
      modelReview: this.piiReview ? (modelPii.length ? "flagged" : "ok") : "not_configured",
    };
  }

  async compliance(owner: string, id: string) {
    return this.checkCompliance(await this.require(owner, id));
  }

  async send(owner: string, id: string, input: SendDeliverableInput) {
    const note = await this.require(owner, id);
    if (note.status !== "approved")
      throw new AppError("Only approved deliverables can be sent", 409, "invalid_transition");
    const report = await this.checkCompliance(note);
    if (report.violations.length) {
      await this.audit(owner, note, "compliance_blocked", {
        actor: input.actor,
        actorId: input.actorId,
        detail: "prohibited_language",
        metadata: { terms: report.violations.map((item) => item.label) },
      });
      throw new AppError(
        `Prohibited wording must be removed before sending: ${report.violations
          .map((item) => item.label)
          .join(", ")}`,
        422,
        "prohibited_language",
      );
    }
    if (report.unsourcedNumbers.length) {
      await this.audit(owner, note, "compliance_blocked", {
        actor: input.actor,
        actorId: input.actorId,
        detail: "unsourced_numbers",
        metadata: { numbers: report.unsourcedNumbers },
      });
      throw new AppError(
        `Unsourced numbers must be resolved before sending: ${report.unsourcedNumbers.join(", ")}`,
        422,
        "unsourced_numbers",
      );
    }
    const at = this.at();
    // 客户信息在发送前自动脱敏；报告只持久化脱敏后的预览，原始 PII 不落库。
    const ruleRedacted = report.pii.some((finding) => finding.source === "rule")
      ? redactPii(note.content)
      : note.content;
    const modelFindings = report.pii.filter((finding) => finding.source === "model");
    const modelApplication = applyModelPiiFindings(ruleRedacted, modelFindings);
    if (modelApplication.missing.length) {
      await this.audit(owner, note, "compliance_blocked", {
        actor: input.actor,
        actorId: input.actorId,
        detail: "pii_unredacted",
        metadata: { findings: modelApplication.missing },
      });
      throw new AppError(
        `Model review found customer information that could not be redacted: ${modelApplication.missing.join(", ")}`,
        422,
        "pii_unredacted",
      );
    }
    const redacted = modelApplication.content;
    const piiChanged = redacted !== note.content;
    const injection = injectDisclaimer(redacted, note.disclaimer);
    let version = note.version;
    let versions = note.versions;
    if (injection.injected || redacted !== note.content) {
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
        sentVersion: version,
      },
      compliance: {
        ...report,
        passed: true,
        disclaimerMissing: false,
        pii: report.pii.map((finding) => ({ ...finding, excerpt: finding.redacted })),
      },
      updatedAt: at,
    });
    if (piiChanged)
      await this.audit(owner, saved, "pii_redacted", {
        actor: "system",
        detail: `发送前自动脱敏 ${report.pii.length} 处客户信息`,
        metadata: { codes: report.pii.map((item) => item.code) },
      });
    await this.audit(owner, saved, "sent", {
      actor: input.actor,
      actorId: input.actorId,
      detail: input.note,
      metadata: {
        recipients: input.recipients,
        channel: input.channel,
        disclaimer_injected: injection.injected,
        pii_redacted: report.pii.length,
        model_review: report.modelReview,
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
    // 归档后旧分享链接立即失效，分享列表也不再展示。
    await this.revokeSharesFor(owner, note.id, "交付物归档");
    await this.audit(owner, saved, "archived", {
      actor: input.actor,
      actorId: input.actorId,
      detail: input.note,
    });
    return saved;
  }

  /** 生成只读分享链接；只有已发送版本可分享，链接锁定发送时的快照。 */
  async share(owner: string, id: string) {
    const note = await this.require(owner, id);
    const sentVersion = note.send?.sentVersion;
    if (note.status !== "sent" || !sentVersion)
      throw new AppError("Only sent deliverables can be shared", 409, "not_sent");
    const share: DeliverableShare = {
      id: randomUUID(),
      deliverableId: note.id,
      ownerId: owner,
      createdAt: this.at(),
      revoked: false,
      sentVersion,
      disclaimer: note.disclaimer,
    };
    await this.db.put(owner, DELIVERABLE_SHARE_KIND, share);
    await this.audit(owner, note, "shared", { detail: "生成只读分享链接" });
    return share;
  }

  async shares(owner: string, id: string) {
    const shares = await this.db.listByField<DeliverableShare>(
      owner,
      DELIVERABLE_SHARE_KIND,
      "deliverableId",
      id,
    );
    return shares.filter((share) => !share.revoked);
  }

  async revokeShare(owner: string, shareId: string) {
    const share = await this.db.get<DeliverableShare>(owner, DELIVERABLE_SHARE_KIND, shareId);
    if (!share) throw new AppError("Share not found", 404);
    if (!share.revoked)
      await this.db.put(owner, DELIVERABLE_SHARE_KIND, { ...share, revoked: true });
    const note = await this.require(owner, share.deliverableId);
    await this.audit(owner, note, "share_revoked", { detail: `撤销分享链接 ${shareId}` });
  }

  /**
   * 公开只读视图：只读分享时锁定的发送版本。
   * 交付物被不再处于 sent、或发送版本变化时链接立即失效。
   */
  async publicView(shareId: string) {
    const record = await this.db.getByKindAndId<DeliverableShare>(DELIVERABLE_SHARE_KIND, shareId);
    if (!record || record.value.revoked) return null;
    const share = record.value;
    const note = await this.db.get<Deliverable>(
      share.ownerId,
      DELIVERABLE_KIND,
      share.deliverableId,
    );
    if (!note || note.status !== "sent") return null;
    if (note.send?.sentVersion !== share.sentVersion) return null;
    const snapshot = note.versions.find((item) => item.version === share.sentVersion);
    if (!snapshot) return null;
    return {
      id: note.id,
      title: snapshot.title,
      content: snapshot.content,
      kind: note.kind,
      disclaimer: share.disclaimer,
      version: snapshot.version,
      createdAt: snapshot.at,
    };
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
