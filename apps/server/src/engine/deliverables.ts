/**
 * OPT-04 交付物中心 + OPT-05 溯源与合规门。
 *
 * 硬口径：
 * - 交付物默认 draft；draft → in_review → approved → sent 全部显式留痕，sent 只能由人触发。
 * - 正文中每个数字都必须可追溯：补来源 / 标为估算 / 删除，三选一后才能 approved。
 * - approved → sent 之间强制合规门：免责声明注入、违禁表述拦截、客户信息脱敏。
 * - 每次修改生成新版本；版本 diff、数字出处、合规结果与审计日志都可回看、可导出。
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  Deliverable,
  DeliverableAuditEntry,
  DeliverableCitation,
  DeliverableComplianceReport,
  DeliverableKind,
  DeliverableNumberRef,
  DeliverablePiiFinding,
  DeliverableStatus,
  DeliverableVersion,
  DeliverableViolation,
} from "../../../../packages/domain/src/agent.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

export const DELIVERABLES_KIND = "deliverables";
export const DELIVERABLE_SHARES_KIND = "deliverable-shares";

export const DEFAULT_DISCLAIMER =
  "本内容由灵悟 AI 辅助生成，仅供研究参考，不构成任何投资建议。市场有风险，决策需谨慎。";

const MAX_CONTENT = 200_000;
const MAX_VERSIONS = 60;

export const deliverableKinds = [
  "BRIEFING",
  "REPORT",
  "MINUTES",
  "ONE_PAGER",
  "REVIEW",
  "TABLE",
  "CUSTOM",
] as const satisfies readonly DeliverableKind[];

const httpUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "Source URL must use http(s)");

export const deliverableCitationInputSchema = z.object({
  number_text: z.string().trim().min(1).max(120),
  source_url: httpUrlSchema,
  excerpt: z.string().trim().min(1).max(600),
  fetched_at: z.string().datetime().optional(),
});
export type DeliverableCitationInput = z.infer<typeof deliverableCitationInputSchema>;

const sourceLinkSchema = z.object({
  type: z.enum(["task", "briefing", "symbol", "thesis", "note", "artifact", "deliverable", "url"]),
  id: z.string().trim().min(1).max(200),
  label: z.string().trim().max(200).optional(),
  url: httpUrlSchema.optional(),
});

export const createDeliverableSchema = z.object({
  kind: z.enum(deliverableKinds),
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(MAX_CONTENT),
  citations: z.array(deliverableCitationInputSchema).max(200).optional(),
  source_links: z.array(sourceLinkSchema).max(30).optional(),
  created_from: sourceLinkSchema.optional(),
  template_id: z.string().trim().max(100).optional(),
  template_version: z.string().trim().max(60).optional(),
  disclaimer: z.string().trim().max(1000).optional(),
  recipient: z.string().trim().max(200).optional(),
});
export type CreateDeliverableInput = z.infer<typeof createDeliverableSchema>;

export const updateDeliverableSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    content: z.string().trim().min(1).max(MAX_CONTENT).optional(),
    citations: z.array(deliverableCitationInputSchema).max(200).optional(),
    source_links: z.array(sourceLinkSchema).max(30).optional(),
    template_id: z.string().trim().max(100).optional(),
    template_version: z.string().trim().max(60).optional(),
    disclaimer: z.string().trim().max(1000).optional(),
    recipient: z.string().trim().max(200).optional(),
    change_summary: z.string().trim().max(200).optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.content !== undefined ||
      value.citations !== undefined ||
      value.source_links !== undefined ||
      value.template_id !== undefined ||
      value.template_version !== undefined ||
      value.disclaimer !== undefined ||
      value.recipient !== undefined,
    { message: "Provide at least one field to update" },
  );
export type UpdateDeliverableInput = z.infer<typeof updateDeliverableSchema>;

export const resolveNumberSchema = z.discriminatedUnion("resolution", [
  z.object({
    resolution: z.literal("source"),
    source_url: httpUrlSchema,
    excerpt: z.string().trim().min(1).max(600),
    fetched_at: z.string().datetime().optional(),
  }),
  z.object({ resolution: z.literal("estimate") }),
  z.object({ resolution: z.literal("remove") }),
]);
export type ResolveNumberInput = z.infer<typeof resolveNumberSchema>;

export interface DeliverableAuditEntryInput {
  deliverable_id: string;
  action: string;
  actor: "agent" | "user" | "system";
  detail?: string;
  version?: number;
}
export type DeliverableAuditSink = (
  owner: string,
  entry: DeliverableAuditEntryInput,
) => Promise<unknown> | unknown;

export interface DeliverableDiff {
  from_version: number;
  to_version: number;
  added: string[];
  removed: string[];
  changed: boolean;
}

export interface DeliverableShare {
  id: string;
  deliverable_id: string;
  created_at: string;
  revoked: boolean;
  /** 分享锁定在发送时的版本；公开页只读这个快照，不读当前正文。 */
  sent_version: number;
  /** 分享时的免责声明快照，后续配置变更不影响已发出的链接。 */
  disclaimer: string;
}

/* ------------------------------------------------------------------ *
 * 数字提取与版本 diff（纯函数，便于单测）
 * ------------------------------------------------------------------ */

const NUMBER_PATTERN =
  /(?<![\w#/.-])[-+]?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|％|bps|bp|x|X|倍|万|亿|美元|元|港元|点))?/g;

/** 去掉代码块和链接 URL，避免把版本号、端口、URL 里的数字当成结论。 */
function scannableContent(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, (block) => " ".repeat(block.length))
    .replace(/`[^`]*`/g, (code) => " ".repeat(code.length))
    .replace(/\]\([^)]*\)/g, (link) => ")".padStart(link.length, " "));
}

export interface ExtractedNumber {
  text: string;
  start: number;
  end: number;
}

/** 提取正文中需要出处的数字；年份、日期、序号不作为结论数字。 */
export function extractNumbers(content: string): ExtractedNumber[] {
  const scan = scannableContent(content);
  const found: ExtractedNumber[] = [];
  for (const match of scan.matchAll(NUMBER_PATTERN)) {
    const text = match[0].trim();
    const start = match.index ?? 0;
    if (!text || !/\d/.test(text)) continue;
    // 纯 4 位年份、列表序号、Markdown 标题序号不是需要复核的结论数字。
    if (/^(19|20)\d{2}$/.test(text)) continue;
    const digits = text.replace(/\D/g, "");
    // 手机号、身份证号与长账号属于客户信息，交给合规门脱敏，不作为结论数字。
    if (/^1[3-9]\d{9}$/.test(digits) || digits.length >= 15) continue;
    const lineStart = scan.lastIndexOf("\n", start) + 1;
    const before = scan.slice(lineStart, start);
    if (/^\s*(#{1,6}\s*)?\d+\.\s*$/.test(before)) continue;
    if (/^\s*[-*]\s*$/.test(before)) continue;
    found.push({ text, start, end: start + match[0].length });
  }
  return found;
}

export function normalizeNumber(text: string): string {
  return text.replace(/[,\s]/g, "").replace(/％/g, "%").replace(/−/g, "-").toLowerCase();
}

function numberId(text: string, index: number): string {
  return `num-${createHash("sha1")
    .update(`${index}:${normalizeNumber(text)}`)
    .digest("hex")
    .slice(0, 10)}`;
}

function buildNumbers(
  content: string,
  citations: DeliverableCitation[],
  previous: DeliverableNumberRef[] = [],
): DeliverableNumberRef[] {
  const priorByText = new Map<string, DeliverableNumberRef[]>();
  for (const number of previous) {
    const key = normalizeNumber(number.text);
    const list = priorByText.get(key) ?? [];
    list.push(number);
    priorByText.set(key, list);
  }
  return extractNumbers(content).map((item, index) => {
    const key = normalizeNumber(item.text);
    const prior = priorByText.get(key)?.shift();
    // 数字出处必须是规范化后的精确匹配：`10%` 不能命中 `0%`，`1.2 亿` 不能命中 `2 亿`。
    const citation = citations.find((entry) => normalizeNumber(entry.number_text) === key);
    const status =
      prior?.status === "estimate" && !citation ? "estimate" : citation ? "sourced" : "unsourced";
    return {
      id: numberId(item.text, index),
      text: item.text,
      start: item.start,
      end: item.end,
      status,
      citation_id: citation?.id,
      present: true,
    };
  });
}

function splitLines(content: string): string[] {
  return content.split("\n").map((line) => line.trimEnd());
}

/** 行级 LCS diff，足够回答「Agent 改了什么 / 我改了什么」。 */
export function diffDeliverableVersions(
  from: DeliverableVersion,
  to: DeliverableVersion,
): DeliverableDiff {
  const a = splitLines(from.content);
  const b = splitLines(to.content);
  const matrix = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      matrix[i][j] =
        a[i] === b[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }
  const added: string[] = [];
  const removed: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      removed.push(a[i]);
      i += 1;
    } else {
      added.push(b[j]);
      j += 1;
    }
  }
  while (i < a.length) removed.push(a[i++]);
  while (j < b.length) added.push(b[j++]);
  return {
    from_version: from.version,
    to_version: to.version,
    added,
    removed,
    changed: added.length > 0 || removed.length > 0,
  };
}

/* ------------------------------------------------------------------ *
 * 合规规则（本地规则优先，模型复核未配置时如实标注）
 * ------------------------------------------------------------------ */

const PROHIBITED_PATTERNS: { code: string; label: string; pattern: RegExp }[] = [
  {
    code: "return_promise",
    label: "收益承诺",
    pattern: /(保证|承诺|确保|包)[^。\n]{0,8}(收益|回报|盈利|赚钱)|稳赚|包赚|必赚|必涨|翻倍/,
  },
  {
    code: "principal_guarantee",
    label: "保本表述",
    pattern: /保本|保底|无风险|零风险|稳赢|稳赚不赔|risk[- ]?free|guaranteed/i,
  },
  {
    code: "urgency_pressure",
    label: "诱导性表述",
    pattern: /错过不再|最后机会|马上买入|闭眼买|满仓干/,
  },
];

export function detectProhibited(text: string): DeliverableViolation[] {
  const violations: DeliverableViolation[] = [];
  for (const rule of PROHIBITED_PATTERNS) {
    const match = text.match(rule.pattern);
    if (match) {
      const start = Math.max(0, (match.index ?? 0) - 12);
      violations.push({
        code: rule.code,
        label: rule.label,
        excerpt: text.slice(start, Math.min(text.length, start + match[0].length + 24)),
      });
    }
  }
  return violations;
}

const PII_PATTERNS: {
  code: string;
  label: string;
  pattern: RegExp;
  mask: (match: string) => string;
}[] = [
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

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

const ALLOWED_TRANSITIONS: Record<DeliverableStatus, DeliverableStatus[]> = {
  draft: ["in_review", "archived"],
  in_review: ["draft", "approved", "archived"],
  approved: ["in_review", "sent", "archived"],
  sent: ["archived"],
  archived: ["draft"],
};

function newId(prefix: string): string {
  const hex = createHash("sha256")
    .update(`${prefix}:${randomBytes(16).toString("hex")}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** 由任务 id 派生稳定 uuid，保证同一任务重放不会重复落库。 */
function stableId(prefix: string): string {
  const hex = createHash("sha256").update(prefix).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function citationFromInput(input: DeliverableCitationInput, at: string): DeliverableCitation {
  return {
    id: newId("citation"),
    number_text: input.number_text,
    source_url: input.source_url,
    excerpt: input.excerpt,
    fetched_at: input.fetched_at ?? at,
  };
}

function versionFrom(
  deliverable: Pick<Deliverable, "title" | "content">,
  version: number,
  author: DeliverableVersion["author"],
  summary: string,
  at: string,
): DeliverableVersion {
  return {
    id: newId("version"),
    version,
    title: deliverable.title,
    content: deliverable.content,
    author,
    summary,
    created_at: at,
  };
}

function unresolved(deliverable: Deliverable): DeliverableNumberRef[] {
  return deliverable.numbers.filter((number) => number.present && number.status === "unsourced");
}

export class DeliverablesService {
  constructor(
    private readonly db: Store,
    private readonly auditSink?: DeliverableAuditSink,
  ) {}

  async list(
    owner: string,
    filters: {
      status?: DeliverableStatus;
      kind?: DeliverableKind;
      q?: string;
      limit?: number;
    } = {},
  ): Promise<Deliverable[]> {
    let deliverables = await this.db.list<Deliverable>(owner, DELIVERABLES_KIND);
    if (filters.status)
      deliverables = deliverables.filter((item) => item.status === filters.status);
    if (filters.kind) deliverables = deliverables.filter((item) => item.kind === filters.kind);
    if (filters.q) {
      const needle = filters.q.toLowerCase();
      deliverables = deliverables.filter(
        (item) =>
          item.title.toLowerCase().includes(needle) || item.content.toLowerCase().includes(needle),
      );
    }
    return deliverables.slice(0, filters.limit ?? 200);
  }

  async require(owner: string, id: string): Promise<Deliverable> {
    const deliverable = await this.db.get<Deliverable>(owner, DELIVERABLES_KIND, id);
    if (!deliverable) throw new AppError("Deliverable not found", 404);
    return deliverable;
  }

  private async record(
    owner: string,
    deliverable: Deliverable,
    entry: Omit<DeliverableAuditEntry, "id" | "at">,
  ): Promise<Deliverable> {
    const auditEntry: DeliverableAuditEntry = {
      id: newId("audit"),
      at: new Date().toISOString(),
      ...entry,
    };
    deliverable.audit = [...deliverable.audit, auditEntry].slice(-500);
    deliverable.updated_at = auditEntry.at;
    await this.db.put(owner, DELIVERABLES_KIND, deliverable);
    if (this.auditSink)
      await Promise.resolve(
        this.auditSink(owner, {
          deliverable_id: deliverable.id,
          action: entry.action,
          actor: entry.actor,
          detail: entry.detail,
          version: entry.version,
        }),
      ).catch(() => undefined);
    return deliverable;
  }

  async create(owner: string, input: CreateDeliverableInput): Promise<Deliverable> {
    return this.createWithActor(owner, input, "user");
  }

  async createWithActor(
    owner: string,
    input: CreateDeliverableInput,
    actor: DeliverableVersion["author"] = "user",
    stableKey?: string,
  ): Promise<Deliverable> {
    const at = new Date().toISOString();
    const id = stableKey ? stableId(stableKey) : randomUUID();
    const existing = await this.db.get<Deliverable>(owner, DELIVERABLES_KIND, id);
    if (existing) return existing;
    const citations = (input.citations ?? []).map((item) => citationFromInput(item, at));
    const deliverable: Deliverable = {
      id,
      user_id: owner,
      kind: input.kind,
      title: input.title,
      content: input.content,
      status: "draft",
      version: 1,
      citations,
      numbers: buildNumbers(input.content, citations),
      versions: [
        versionFrom(
          { title: input.title, content: input.content },
          1,
          actor,
          stableKey ? "由定时任务自动归档" : "创建草稿",
          at,
        ),
      ],
      source_links: input.source_links ?? [],
      template_id: input.template_id,
      template_version: input.template_version,
      disclaimer: input.disclaimer ?? DEFAULT_DISCLAIMER,
      recipient: input.recipient,
      created_from: input.created_from,
      audit: [],
      created_at: at,
      updated_at: at,
    };
    await this.db.put(owner, DELIVERABLES_KIND, deliverable);
    return this.record(owner, deliverable, {
      actor,
      action: "created",
      detail: stableKey ? "定时任务产出自动进入交付物中心" : "创建交付物",
      version: 1,
    });
  }

  /** 定时任务产出自动落库；同一任务重放时返回已有记录。 */
  async captureFromTask(
    owner: string,
    task: { id: string; title: string },
    input: Omit<CreateDeliverableInput, "kind" | "title" | "created_from"> & {
      kind?: DeliverableKind;
      title?: string;
    },
  ): Promise<Deliverable> {
    return this.createWithActor(
      owner,
      {
        ...input,
        kind: input.kind ?? "BRIEFING",
        title: input.title ?? task.title,
        created_from: { type: "task", id: task.id, label: task.title },
      },
      "agent",
      `deliverable:task:${task.id}`,
    );
  }

  async update(
    owner: string,
    id: string,
    input: UpdateDeliverableInput,
    actor: DeliverableVersion["author"] = "user",
  ): Promise<Deliverable> {
    const deliverable = await this.require(owner, id);
    if (deliverable.status === "sent" || deliverable.status === "archived")
      throw new AppError(
        "Sent or archived deliverables are read-only. Reopen as draft first.",
        409,
      );
    const at = new Date().toISOString();
    const contentChanged = input.content !== undefined && input.content !== deliverable.content;
    const titleChanged = input.title !== undefined && input.title !== deliverable.title;
    const citations =
      input.citations === undefined
        ? deliverable.citations
        : input.citations.map((item) => citationFromInput(item, at));
    const next: Deliverable = {
      ...deliverable,
      title: input.title ?? deliverable.title,
      content: input.content ?? deliverable.content,
      citations,
      source_links: input.source_links ?? deliverable.source_links,
      template_id: input.template_id ?? deliverable.template_id,
      template_version: input.template_version ?? deliverable.template_version,
      disclaimer: input.disclaimer ?? deliverable.disclaimer,
      recipient: input.recipient ?? deliverable.recipient,
    };
    if (contentChanged || titleChanged || input.citations !== undefined) {
      next.version = deliverable.version + 1;
      next.numbers =
        input.content === undefined
          ? buildNumbers(next.content, citations, deliverable.numbers)
          : buildNumbers(next.content, citations, deliverable.numbers);
      next.versions = [
        ...deliverable.versions,
        versionFrom(
          next,
          next.version,
          actor,
          input.change_summary ?? (actor === "agent" ? "Agent 修改" : "人工修改"),
          at,
        ),
      ].slice(-MAX_VERSIONS);
    }
    // 批准后任何正文 / 出处变更都必须重新走审批：退回 draft、清空批准信息并撤销分享。
    const material =
      contentChanged ||
      titleChanged ||
      input.citations !== undefined ||
      input.source_links !== undefined;
    if (material && deliverable.status === "approved")
      Object.assign(next, await this.demoteApproved(owner, next));
    await this.db.put(owner, DELIVERABLES_KIND, next);
    return this.record(owner, next, {
      actor,
      action: "updated",
      detail:
        (input.change_summary ??
          ([
            titleChanged ? "标题" : "",
            contentChanged ? "正文" : "",
            input.citations !== undefined ? "出处" : "",
          ]
            .filter(Boolean)
            .join("、") ||
            "更新元数据")) +
        (material && deliverable.status === "approved" ? "（已退回草稿，需重新审批）" : ""),
      version: next.version,
    });
  }

  /** 已批准的交付物发生实质变更时退回草稿，并让旧分享链接立即失效。 */
  private async demoteApproved(
    owner: string,
    deliverable: Deliverable,
  ): Promise<Partial<Deliverable>> {
    const shares = await this.db.list<DeliverableShare>(owner, DELIVERABLE_SHARES_KIND);
    for (const share of shares) {
      if (share.deliverable_id === deliverable.id && !share.revoked)
        await this.db.put(owner, DELIVERABLE_SHARES_KIND, { ...share, revoked: true });
    }
    return { status: "draft", approved_at: undefined, approved_by: undefined };
  }

  private async transition(
    owner: string,
    id: string,
    to: DeliverableStatus,
    actor: "user" | "agent" | "system",
    detail?: string,
  ): Promise<Deliverable> {
    const deliverable = await this.require(owner, id);
    return this.applyTransition(owner, deliverable, to, actor, detail);
  }

  private async applyTransition(
    owner: string,
    deliverable: Deliverable,
    to: DeliverableStatus,
    actor: "user" | "agent" | "system",
    detail?: string,
  ): Promise<Deliverable> {
    if (!ALLOWED_TRANSITIONS[deliverable.status].includes(to))
      throw new AppError(
        `Cannot move a deliverable from ${deliverable.status} to ${to}`,
        409,
        "invalid_transition",
      );
    const next: Deliverable = { ...deliverable, status: to };
    const at = new Date().toISOString();
    if (to === "approved") {
      const open = unresolved(next);
      if (open.length)
        throw new AppError(
          `Resolve ${open.length} unsourced number(s) before approval: ${open.map((item) => item.text).join("、")}`,
          409,
          "numbers_unresolved",
        );
      next.approved_at = at;
      next.approved_by = actor;
    }
    if (to === "sent") next.sent_at = at;
    if (to === "draft") {
      next.approved_at = undefined;
      next.approved_by = undefined;
    }
    await this.db.put(owner, DELIVERABLES_KIND, next);
    return this.record(owner, next, {
      actor,
      action: to === "in_review" ? "submitted" : to,
      detail: detail ?? `状态变更为 ${to}`,
      version: next.version,
    });
  }

  async submit(owner: string, id: string): Promise<Deliverable> {
    return this.transition(owner, id, "in_review", "user");
  }

  async approve(owner: string, id: string): Promise<Deliverable> {
    return this.transition(owner, id, "approved", "user");
  }

  async returnToDraft(owner: string, id: string, reason?: string): Promise<Deliverable> {
    return this.transition(owner, id, "draft", "user", reason ?? "退回草稿");
  }

  async archive(owner: string, id: string): Promise<Deliverable> {
    return this.transition(owner, id, "archived", "user");
  }

  async resolveNumber(
    owner: string,
    id: string,
    numberIdValue: string,
    input: ResolveNumberInput,
  ): Promise<Deliverable> {
    const deliverable = await this.require(owner, id);
    if (deliverable.status === "sent" || deliverable.status === "archived")
      throw new AppError("Sent or archived deliverables are read-only", 409);
    const number = deliverable.numbers.find((item) => item.id === numberIdValue && item.present);
    if (!number) throw new AppError("Number reference not found", 404);
    const at = new Date().toISOString();
    if (input.resolution === "source") {
      const citation: DeliverableCitation = {
        id: newId("citation"),
        number_text: number.text,
        source_url: input.source_url,
        excerpt: input.excerpt,
        fetched_at: input.fetched_at ?? at,
      };
      const next: Deliverable = {
        ...deliverable,
        citations: [...deliverable.citations, citation],
        numbers: deliverable.numbers.map((item) =>
          item.id === number.id
            ? { ...item, status: "sourced" as const, citation_id: citation.id }
            : item,
        ),
      };
      if (deliverable.status === "approved")
        Object.assign(next, await this.demoteApproved(owner, next));
      await this.db.put(owner, DELIVERABLES_KIND, next);
      return this.record(owner, next, {
        actor: "user",
        action: "number_sourced",
        detail: `为「${number.text}」补充出处`,
        version: next.version,
      });
    }
    if (input.resolution === "estimate") {
      const next: Deliverable = {
        ...deliverable,
        numbers: deliverable.numbers.map((item) =>
          item.id === number.id
            ? { ...item, status: "estimate" as const, citation_id: undefined }
            : item,
        ),
      };
      if (deliverable.status === "approved")
        Object.assign(next, await this.demoteApproved(owner, next));
      await this.db.put(owner, DELIVERABLES_KIND, next);
      return this.record(owner, next, {
        actor: "user",
        action: "number_estimated",
        detail: `将「${number.text}」标记为估算`,
        version: next.version,
      });
    }
    // 删除数字会改写正文，因此生成新版本，保证 diff 里能看到「我删了什么」。
    const content = (
      deliverable.content.slice(0, number.start) + deliverable.content.slice(number.end)
    )
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ +([，。；、！？,.;!?])/g, "$1");
    if (!content.trim()) throw new AppError("Cannot remove the only content", 422);
    const version = deliverable.version + 1;
    const next: Deliverable = {
      ...deliverable,
      content,
      version,
      numbers: buildNumbers(content, deliverable.citations, deliverable.numbers),
      versions: [
        ...deliverable.versions,
        versionFrom(
          { title: deliverable.title, content },
          version,
          "user",
          `删除无源数字「${number.text}」`,
          at,
        ),
      ].slice(-MAX_VERSIONS),
    };
    if (deliverable.status === "approved")
      Object.assign(next, await this.demoteApproved(owner, next));
    await this.db.put(owner, DELIVERABLES_KIND, next);
    return this.record(owner, next, {
      actor: "user",
      action: "number_removed",
      detail: `删除无源数字「${number.text}」`,
      version,
    });
  }

  checkCompliance(deliverable: Deliverable): DeliverableComplianceReport {
    const started = performance.now();
    const violations = detectProhibited(deliverable.content);
    const pii = detectPii(deliverable.content);
    const unsourced = unresolved(deliverable);
    const disclaimerMissing = !deliverable.content.includes(deliverable.disclaimer);
    const passed = violations.length === 0 && unsourced.length === 0;
    return {
      checked_at: new Date().toISOString(),
      duration_ms: Math.max(0, Math.round((performance.now() - started) * 1000) / 1000),
      passed,
      disclaimer: deliverable.disclaimer,
      disclaimer_missing: disclaimerMissing,
      violations,
      pii,
      unsourced_numbers: unsourced.map((item) => item.text),
      rule_engine: "ok",
      model_review: "not_configured",
    };
  }

  async compliance(owner: string, id: string): Promise<DeliverableComplianceReport> {
    return this.checkCompliance(await this.require(owner, id));
  }

  /** approved → sent 的强制合规门：违禁内容阻断；客户信息自动脱敏；免责声明必注入。 */
  async send(
    owner: string,
    id: string,
    input: { recipient?: string; disclaimer?: string } = {},
  ): Promise<Deliverable> {
    let deliverable = await this.require(owner, id);
    if (deliverable.status !== "approved")
      throw new AppError("Only approved deliverables can be sent", 409, "not_approved");
    if (input.disclaimer) deliverable = { ...deliverable, disclaimer: input.disclaimer };
    const report = this.checkCompliance(deliverable);
    if (report.unsourced_numbers.length)
      throw new AppError(
        `Resolve ${report.unsourced_numbers.length} unsourced number(s) before sending`,
        409,
        "numbers_unresolved",
      );
    if (report.violations.length)
      throw new AppError(
        `Compliance gate blocked: ${report.violations.map((item) => item.label).join("、")}`,
        409,
        "compliance_blocked",
      );
    let content = deliverable.content;
    let changed = false;
    if (report.pii.length) {
      content = redactPii(content);
      changed = true;
      deliverable = {
        ...deliverable,
        audit: [
          ...deliverable.audit,
          {
            id: newId("audit"),
            at: new Date().toISOString(),
            actor: "user",
            action: "pii_redacted",
            detail: `合规门自动脱敏 ${report.pii.length} 处客户信息`,
            version: deliverable.version,
          },
        ],
      };
    }
    if (!content.includes(deliverable.disclaimer)) {
      content = `${content.trimEnd()}\n\n---\n\n${deliverable.disclaimer}`;
      changed = true;
      deliverable = {
        ...deliverable,
        audit: [
          ...deliverable.audit,
          {
            id: newId("audit"),
            at: new Date().toISOString(),
            actor: "system",
            action: "disclaimer_injected",
            detail: "发送前自动注入免责声明",
            version: deliverable.version + (changed ? 1 : 0),
          },
        ],
      };
    }
    if (changed) {
      const version = deliverable.version + 1;
      deliverable = {
        ...deliverable,
        content,
        version,
        numbers: buildNumbers(content, deliverable.citations, deliverable.numbers),
        versions: [
          ...deliverable.versions,
          versionFrom(
            { title: deliverable.title, content },
            version,
            "system",
            "合规门处理（脱敏 + 免责声明）",
            new Date().toISOString(),
          ),
        ].slice(-MAX_VERSIONS),
      };
      report.passed = true;
      report.disclaimer_missing = false;
      deliverable.last_compliance = report;
    } else {
      deliverable.last_compliance = report;
    }
    const sent = await this.applyTransition(
      owner,
      {
        ...deliverable,
        recipient: input.recipient ?? deliverable.recipient,
        sent_version: deliverable.version,
      },
      "sent",
      "user",
      `人审后发送${input.recipient ? `给 ${input.recipient}` : ""}`,
    );
    return sent;
  }

  diff(
    owner: string,
    id: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<DeliverableDiff> {
    return this.require(owner, id).then((deliverable) => {
      const from = deliverable.versions.find((item) => item.version === fromVersion);
      const to = deliverable.versions.find((item) => item.version === toVersion);
      if (!from || !to) throw new AppError("Version not found", 404);
      return diffDeliverableVersions(from, to);
    });
  }

  async share(owner: string, id: string): Promise<DeliverableShare> {
    const deliverable = await this.require(owner, id);
    // 分享必须和 send() 走同一道合规门：只有已经合规发送的版本才能生成公开链接。
    if (deliverable.status !== "sent" || !deliverable.sent_version)
      throw new AppError("Only sent deliverables can be shared", 409, "not_sent");
    const share: DeliverableShare = {
      id: randomBytes(12).toString("base64url"),
      deliverable_id: deliverable.id,
      created_at: new Date().toISOString(),
      revoked: false,
      sent_version: deliverable.sent_version,
      disclaimer: deliverable.disclaimer,
    };
    await this.db.put(owner, DELIVERABLE_SHARES_KIND, share);
    await this.record(owner, deliverable, {
      actor: "user",
      action: "shared",
      detail: "生成只读分享链接（含免责声明）",
      version: deliverable.version,
    });
    return share;
  }

  async revokeShare(owner: string, shareId: string): Promise<void> {
    const share = await this.db.get<DeliverableShare>(owner, DELIVERABLE_SHARES_KIND, shareId);
    if (!share) throw new AppError("Share not found", 404);
    await this.db.put(owner, DELIVERABLE_SHARES_KIND, { ...share, revoked: true });
  }

  /** 公开只读视图：只给已分享、未撤销的交付物，且只读发送时锁定的版本快照。 */
  async publicView(shareId: string): Promise<{
    id: string;
    title: string;
    content: string;
    kind: DeliverableKind;
    disclaimer: string;
    created_at: string;
    version: number;
  } | null> {
    const found = (await this.db.getByKindAndId<DeliverableShare>(DELIVERABLE_SHARES_KIND, shareId))
      ?.value;
    if (!found || found.revoked) return null;
    const ownerRecord = await this.db.getByKindAndId<Deliverable>(
      DELIVERABLES_KIND,
      found.deliverable_id,
    );
    if (!ownerRecord) return null;
    const deliverable = ownerRecord.value;
    if (deliverable.status !== "sent") return null;
    if (deliverable.sent_version !== found.sent_version) return null;
    const snapshot = deliverable.versions.find((item) => item.version === found.sent_version);
    if (!snapshot) return null;
    return {
      id: deliverable.id,
      title: snapshot.title,
      content: snapshot.content,
      kind: deliverable.kind,
      disclaimer: found.disclaimer,
      created_at: snapshot.created_at,
      version: snapshot.version,
    };
  }

  /** 审计日志导出：谁、何时、改了什么、谁批准、发给了谁。 */
  async auditCsv(owner: string, deliverableId?: string): Promise<string> {
    const list = deliverableId
      ? [await this.require(owner, deliverableId)]
      : await this.list(owner, { limit: 500 });
    const header = "deliverable_id,title,at,actor,action,version,detail";
    const rows = list.flatMap((deliverable) =>
      deliverable.audit.map((entry) =>
        [
          deliverable.id,
          deliverable.title,
          entry.at,
          entry.actor,
          entry.action,
          entry.version ?? "",
          entry.detail ?? "",
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(","),
      ),
    );
    return [header, ...rows].join("\n");
  }
}
