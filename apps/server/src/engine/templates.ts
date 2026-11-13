/**
 * OPT-03 我的模板（口径沉淀）。
 *
 * 用户模板与内置能力（184 条只读技能）严格分开：
 * - 内置能力只存在于客户端目录，不写入本服务；
 * - 用户模板从一次真实产出反推结构 / 字段 / 口径 / 反例，可编辑、可分享。
 *
 * 硬口径：
 * - 每个模板带版本号，历史交付物记录 template_id + template_version；
 * - 复用后的改动率只统计真实交付物对比模板样例的差异，不用前端展示数据代替；
 * - 命中理由必须可解释；用户「不是这个」会真实降低该模板的命中准确率。
 */
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  Deliverable,
  DeliverableKind,
  TemplateCounterexample,
  TemplateField,
  TemplateMatch,
  TemplateSection,
  TemplateUsageRecord,
  TemplateVersion,
  TemplateVoice,
  UserTemplate,
} from "../../../../packages/domain/src/agent.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";
import { diffDeliverableVersions } from "./deliverables.ts";

export const TEMPLATES_KIND = "user-templates";
const MAX_STRUCTURE = 40;
const MAX_FIELDS = 40;
const MAX_COUNTEREXAMPLES = 20;
const MAX_CONTENT = 200_000;

const sectionSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(120),
  order: z.number().int().min(0).max(100).optional(),
  required: z.boolean().optional(),
  instructions: z.string().trim().max(500).optional(),
});

const fieldSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(80),
  required: z.boolean().optional(),
  unit: z.string().trim().max(30).optional(),
});

const voiceSchema = z.object({
  tone: z.enum(["formal", "direct", "concise"]).optional(),
  language: z.enum(["zh", "en", "mixed"]).optional(),
  units: z.array(z.string().trim().max(20)).max(30).optional(),
  conventions: z.array(z.string().trim().max(240)).max(20).optional(),
});

const counterexampleSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  text: z.string().trim().min(1).max(500),
  reason: z.enum(["removed", "rewritten"]).optional(),
  preferred: z.string().trim().max(500).optional(),
});

export const fromDeliverableSchema = z.object({
  deliverable_id: z.string().uuid(),
  name: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
});

export const updateTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    structure: z.array(sectionSchema).max(MAX_STRUCTURE).optional(),
    fields: z.array(fieldSchema).max(MAX_FIELDS).optional(),
    voice: voiceSchema.optional(),
    counterexamples: z.array(counterexampleSchema).max(MAX_COUNTEREXAMPLES).optional(),
    sample_content: z.string().trim().max(MAX_CONTENT).optional(),
    summary: z.string().trim().max(200).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.structure !== undefined ||
      value.fields !== undefined ||
      value.voice !== undefined ||
      value.counterexamples !== undefined ||
      value.sample_content !== undefined,
    { message: "Provide at least one template field to update" },
  );
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const matchTemplateSchema = z.object({
  kind: z.enum(["BRIEFING", "REPORT", "MINUTES", "ONE_PAGER", "REVIEW", "TABLE", "CUSTOM"]),
  title: z.string().trim().max(200).optional(),
  prompt: z.string().trim().max(2000).optional(),
  limit: z.number().int().min(1).max(5).optional(),
});
export type MatchTemplateInput = z.infer<typeof matchTemplateSchema>;

export const feedbackSchema = z.object({
  kind: z.enum(["BRIEFING", "REPORT", "MINUTES", "ONE_PAGER", "REVIEW", "TABLE", "CUSTOM"]),
  title: z.string().trim().max(200).optional(),
  prompt: z.string().trim().max(2000).optional(),
});

function uniqueId(prefix: string): string {
  return `${prefix}-${createHash("sha1").update(`${prefix}:${randomUUID()}`).digest("hex").slice(0, 12)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ *
 * 自动抽取（纯函数）
 * ------------------------------------------------------------------ */

export function extractStructure(content: string): TemplateSection[] {
  const headings: { title: string; order: number }[] = [];
  for (const match of content.matchAll(/^(#{1,4})\s+(.+?)\s*$/gm)) {
    const title = match[2]?.trim();
    if (title) headings.push({ title, order: headings.length });
  }
  if (!headings.length)
    return [{ id: uniqueId("section"), title: "正文", order: 0, required: true }];
  return headings.map((heading) => ({
    id: uniqueId("section"),
    title: heading.title.slice(0, 120),
    order: heading.order,
    required: true,
  }));
}

export function extractFields(content: string): TemplateField[] {
  const labels = new Map<string, TemplateField>();
  for (const match of content.matchAll(/^([\p{L}\p{N}_\- ]{2,16})\s*[:：]\s*(.*)$/gmu)) {
    const label = match[1]?.trim();
    if (!label || /^https?$/i.test(label) || /^(注|说明|来源)$/i.test(label)) continue;
    const value = match[2]?.trim() ?? "";
    if (!labels.has(label))
      labels.set(label, {
        id: uniqueId("field"),
        label,
        required: /必填/.test(value) || value.length === 0,
      });
  }
  for (const match of content.matchAll(/[，,；;]\s*([\p{L}\p{N}_-]{2,8})\s*[:：]/gu)) {
    const label = match[1]?.trim();
    if (!label || labels.has(label)) continue;
    labels.set(label, { id: uniqueId("field"), label, required: false });
  }
  for (const match of content.matchAll(/\{\{\s*([\p{L}\p{N}_-]{2,20})\s*\}\}/gu)) {
    const label = match[1]?.trim();
    if (!label || labels.has(label)) continue;
    labels.set(label, { id: uniqueId("field"), label, required: true });
  }
  return [...labels.values()].slice(0, MAX_FIELDS);
}

export function extractVoice(content: string): TemplateVoice {
  const cjk = (content.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (content.match(/[A-Za-z]/g) ?? []).length;
  const language: TemplateVoice["language"] =
    cjk > latin * 0.5 ? "zh" : latin > cjk * 3 ? "en" : "mixed";
  const sentences = content
    .replace(/#{1,4}\s+/g, "")
    .split(/[。！？!?.\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const average =
    sentences.reduce((total, line) => total + line.length, 0) / Math.max(1, sentences.length);
  const tone: TemplateVoice["tone"] = /[！!]/.test(content)
    ? "direct"
    : average <= 32
      ? "concise"
      : "formal";
  const units = [
    ...new Set(content.match(/%(?=\s|$)|亿元|万元|亿|万|美元|港元|人民币|元|bps|bp|倍/g) ?? []),
  ].slice(0, 20);
  const conventions = content
    .split("\n")
    .map((line) => line.replace(/^[-*\s>]+/, "").trim())
    .filter((line) => /口径|单位|截至|数据来源|统计区间|币种/.test(line))
    .map((line) => line.slice(0, 240))
    .slice(0, 4);
  return { tone, language, units, conventions };
}

export function extractCounterexamples(deliverable: Deliverable): TemplateCounterexample[] {
  if (deliverable.versions.length < 2) return [];
  const previous = deliverable.versions.at(-2);
  const latest = deliverable.versions.at(-1);
  if (!previous || !latest) return [];
  const diff = diffDeliverableVersions(previous, latest);
  const removed = diff.removed.filter((line) => line.trim());
  return removed.slice(0, MAX_COUNTEREXAMPLES).map((text) => ({
    id: uniqueId("counter"),
    text: text.slice(0, 500),
    reason: "removed" as const,
  }));
}

/**
 * 行级改动字符占比：removed + added 字符数 / 实际正文总字符数。
 * 不用前端展示数据替代；同一模板的所有复用都从这里计算。
 */
export function humanEditRatio(
  reference: string,
  actual: string,
): {
  ratio: number;
  edited: number;
  total: number;
} {
  const a = reference.split("\n").map((line) => line.trimEnd());
  const b = actual.split("\n").map((line) => line.trimEnd());
  const matrix = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      matrix[i][j] =
        a[i] === b[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }
  let edited = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      edited += a[i]?.length ?? 0;
      i += 1;
    } else {
      edited += b[j]?.length ?? 0;
      j += 1;
    }
  }
  while (i < a.length) edited += a[i++]?.length ?? 0;
  while (j < b.length) edited += b[j++]?.length ?? 0;
  const total = actual.replace(/\s/g, "").length;
  return { ratio: clamp(edited / Math.max(1, total), 0, 1), edited, total };
}

function emptyMetrics(): UserTemplate["metrics"] {
  return {
    reuse_count: 0,
    needs_clarification: false,
    match_total: 0,
    accepted: 0,
    rejections: 0,
    match_accuracy: 1,
  };
}

function recomputeMetrics(template: UserTemplate): UserTemplate["metrics"] {
  const usage = [...template.usage].sort((a, b) => a.at.localeCompare(b.at));
  const first = usage[0]?.edit_ratio;
  const latest = usage.at(-1)?.edit_ratio;
  const total = template.metrics.match_total;
  return {
    ...template.metrics,
    reuse_count: usage.length,
    first_edit_ratio: first,
    latest_edit_ratio: latest,
    needs_clarification: latest !== undefined && latest > 0.3,
    match_accuracy:
      template.metrics.accepted + template.metrics.rejections > 0
        ? template.metrics.accepted / (template.metrics.accepted + template.metrics.rejections)
        : 1,
    match_total: total,
  };
}

function versionFrom(
  template: Pick<
    UserTemplate,
    "name" | "description" | "structure" | "fields" | "voice" | "counterexamples"
  >,
  version: number,
  summary: string,
  at: string,
): TemplateVersion {
  return {
    id: uniqueId("template-version"),
    version,
    name: template.name,
    description: template.description,
    structure: template.structure,
    fields: template.fields,
    voice: template.voice,
    counterexamples: template.counterexamples,
    summary,
    created_at: at,
  };
}

function normalizeSections(input: z.infer<typeof sectionSchema>[]): TemplateSection[] {
  return input.map((item, index) => ({
    id: item.id ?? uniqueId("section"),
    title: item.title,
    order: item.order ?? index,
    required: item.required ?? true,
    instructions: item.instructions,
  }));
}

function normalizeFields(input: z.infer<typeof fieldSchema>[]): TemplateField[] {
  return input.map((item) => ({
    id: item.id ?? uniqueId("field"),
    label: item.label,
    required: item.required ?? false,
    unit: item.unit,
  }));
}

function normalizeCounterexamples(
  input: z.infer<typeof counterexampleSchema>[],
): TemplateCounterexample[] {
  return input.map((item) => ({
    id: item.id ?? uniqueId("counter"),
    text: item.text,
    reason: item.reason ?? "removed",
    preferred: item.preferred,
  }));
}

/**
 * 团队共享只暴露结构 / 口径：用章节骨架替代原始正文，
 * 避免把来源交付物里的客户信息带出所有者边界。
 */
export function templateSkeleton(template: Pick<UserTemplate, "structure" | "fields">): string {
  const sections = [...template.structure]
    .sort((a, b) => a.order - b.order)
    .map((section) =>
      section.required ? `## ${section.title}\n\n` : `<!-- 可选章节：${section.title} -->\n`,
    );
  const required = template.fields
    .filter((field) => field.required)
    .map((field) => `${field.label}${field.unit ? `（${field.unit}）` : ""}`);
  if (required.length) sections.push(`> 必填字段：${required.join("、")}\n`);
  return sections.join("\n").trim();
}

function tokenize(text: string): string[] {
  const stop = new Set(
    "的了和与在是我你他这那有不就都也很到对及为上中下一这个那个我们你们他们".split(""),
  );
  const tokens = text.toLowerCase().match(/[\u4e00-\u9fff]|[a-z0-9]{2,}/g) ?? [];
  return [...new Set(tokens.filter((token) => token.length > 1 || !stop.has(token)))];
}

/** 可解释的模板命中：类型、标题、结构与历史复用共同计分。 */
export function scoreTemplate(template: UserTemplate, input: MatchTemplateInput): TemplateMatch {
  const reasons: string[] = [];
  let score = 0;
  if (template.kind === input.kind) {
    score += 40;
    reasons.push(`类型匹配：${kindLabel(input.kind)}`);
  }
  const query = `${input.title ?? ""} ${input.prompt ?? ""}`;
  const titleTokens = tokenize(input.title ?? "");
  const nameMatches = titleTokens.filter((token) => normalized(template.name).includes(token));
  if (nameMatches.length) {
    score += Math.min(20, nameMatches.length * 5);
    reasons.push(`名称命中：${nameMatches.slice(0, 4).join("、")}`);
  }
  const searchable = normalized(
    [
      template.name,
      template.description,
      ...template.structure.map((item) => item.title),
      ...template.fields.map((item) => item.label),
      ...template.voice.conventions,
    ].join(" "),
  );
  const queryTokens = tokenize(query);
  const contentMatches = queryTokens.filter((token) => searchable.includes(token));
  if (contentMatches.length) {
    score += Math.min(25, contentMatches.length * 3);
    reasons.push(`口径命中：${contentMatches.slice(0, 5).join("、")}`);
  }
  const structureMatches = template.structure.filter((section) =>
    queryTokens.some((token) => normalized(section.title).includes(token)),
  );
  if (structureMatches.length) {
    score += Math.min(10, structureMatches.length * 5);
    reasons.push(
      `章节命中：${structureMatches
        .map((item) => item.title)
        .slice(0, 3)
        .join("、")}`,
    );
  }
  if (template.metrics.reuse_count) {
    score += Math.min(8, template.metrics.reuse_count * 2);
    reasons.push(`历史复用：${template.metrics.reuse_count} 次`);
  }
  if (template.metrics.needs_clarification) reasons.push("最近一次改动偏大，口径可能需要澄清");
  return {
    template_id: template.id,
    name: template.name,
    version: template.version,
    score,
    reasons,
    sample_content: template.sample_content,
    metrics: template.metrics,
  };
}

function kindLabel(kind: DeliverableKind): string {
  const labels: Record<DeliverableKind, string> = {
    BRIEFING: "晨报",
    REPORT: "研报",
    MINUTES: "纪要",
    ONE_PAGER: "一页纸",
    REVIEW: "复盘",
    TABLE: "表格",
    CUSTOM: "自定义",
  };
  return labels[kind];
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export class TemplatesService {
  constructor(private readonly db: Store) {}

  async list(owner: string): Promise<UserTemplate[]> {
    return this.db.list<UserTemplate>(owner, TEMPLATES_KIND);
  }

  async listShared(owner: string): Promise<UserTemplate[]> {
    const all = await this.db.scan<UserTemplate>(TEMPLATES_KIND);
    return all
      .filter((entry) => entry.owner !== owner && entry.value.shared)
      .map((entry) => ({
        ...entry.value,
        // 共享模板不带原始正文与复用记录：只保留结构与口径。
        sample_content: templateSkeleton(entry.value),
        usage: [],
      }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async require(owner: string, id: string): Promise<UserTemplate> {
    const template = await this.db.get<UserTemplate>(owner, TEMPLATES_KIND, id);
    if (!template) throw new AppError("Template not found", 404);
    return template;
  }

  /**
   * 解析一个可复用的模板：自己的模板优先，其次是别人主动共享的模板。
   * 返回模板真实归属，复用记录要写回模板所有者，质量分才对共享者可见。
   */
  async resolveUsable(
    owner: string,
    id: string,
  ): Promise<{ template: UserTemplate; owner: string }> {
    const own = await this.db.get<UserTemplate>(owner, TEMPLATES_KIND, id);
    if (own) return { template: own, owner };
    const all = await this.db.scan<UserTemplate>(TEMPLATES_KIND);
    const shared = all.find((entry) => entry.value.id === id && entry.value.shared);
    if (!shared) throw new AppError("Template not found", 404);
    return { template: shared.value, owner: shared.owner };
  }

  async createFromDeliverable(
    owner: string,
    deliverable: Deliverable,
    input: { name?: string; description?: string },
  ): Promise<UserTemplate> {
    const existing = (await this.list(owner)).find(
      (item) =>
        item.created_from?.type === "deliverable" && item.created_from.id === deliverable.id,
    );
    if (existing) return existing;
    const at = new Date().toISOString();
    const structure = extractStructure(deliverable.content);
    const fields = extractFields(deliverable.content);
    const voice = extractVoice(deliverable.content);
    const counterexamples = extractCounterexamples(deliverable);
    const template: UserTemplate = {
      id: randomUUID(),
      user_id: owner,
      name: input.name?.trim() || `${kindLabel(deliverable.kind)} · ${deliverable.title}`,
      description:
        input.description?.trim() || `从交付物「${deliverable.title}」反推的结构与口径。`,
      kind: deliverable.kind,
      version: 1,
      structure,
      fields,
      voice,
      counterexamples,
      sample_content: deliverable.content,
      created_from: { type: "deliverable", id: deliverable.id, label: deliverable.title },
      versions: [
        {
          id: uniqueId("template-version"),
          version: 1,
          name: input.name?.trim() || `${kindLabel(deliverable.kind)} · ${deliverable.title}`,
          description: `从交付物「${deliverable.title}」反推`,
          structure,
          fields,
          voice,
          counterexamples,
          summary: "从产出反推",
          created_at: at,
        },
      ],
      usage: [],
      metrics: emptyMetrics(),
      shared: false,
      built_in: false,
      created_at: at,
      updated_at: at,
    };
    await this.db.put(owner, TEMPLATES_KIND, template);
    return template;
  }

  async update(owner: string, id: string, input: UpdateTemplateInput): Promise<UserTemplate> {
    const template = await this.require(owner, id);
    const at = new Date().toISOString();
    const next: UserTemplate = {
      ...template,
      name: input.name ?? template.name,
      description: input.description ?? template.description,
      structure:
        input.structure === undefined ? template.structure : normalizeSections(input.structure),
      fields: input.fields === undefined ? template.fields : normalizeFields(input.fields),
      voice: { ...template.voice, ...input.voice },
      counterexamples:
        input.counterexamples === undefined
          ? template.counterexamples
          : normalizeCounterexamples(input.counterexamples),
      sample_content: input.sample_content ?? template.sample_content,
      version: template.version + 1,
      updated_at: at,
    };
    next.versions = [
      ...template.versions,
      versionFrom(next, next.version, input.summary ?? "更新模板口径", at),
    ].slice(-40);
    await this.db.put(owner, TEMPLATES_KIND, next);
    return next;
  }

  async setShared(owner: string, id: string, shared: boolean): Promise<UserTemplate> {
    const template = await this.require(owner, id);
    const next: UserTemplate = {
      ...template,
      shared,
      shared_at: shared ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    };
    await this.db.put(owner, TEMPLATES_KIND, next);
    return next;
  }

  async match(owner: string, input: MatchTemplateInput): Promise<TemplateMatch[]> {
    const templates = await this.list(owner);
    return templates
      .map((template) => scoreTemplate(template, input))
      .filter((match) => match.score >= 20)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit ?? 3);
  }

  async accept(
    owner: string,
    id: string,
    _input: { kind: DeliverableKind; title?: string; prompt?: string },
  ): Promise<UserTemplate> {
    const template = await this.require(owner, id);
    const next: UserTemplate = {
      ...template,
      metrics: {
        ...template.metrics,
        match_total: template.metrics.match_total + 1,
        accepted: template.metrics.accepted + 1,
      },
      updated_at: new Date().toISOString(),
    };
    next.metrics = recomputeMetrics(next);
    await this.db.put(owner, TEMPLATES_KIND, next);
    return next;
  }

  async reject(
    owner: string,
    id: string,
    _input: { kind: DeliverableKind; title?: string; prompt?: string },
  ): Promise<UserTemplate> {
    const template = await this.require(owner, id);
    const next: UserTemplate = {
      ...template,
      metrics: {
        ...template.metrics,
        match_total: template.metrics.match_total + 1,
        rejections: template.metrics.rejections + 1,
      },
      updated_at: new Date().toISOString(),
    };
    next.metrics = recomputeMetrics(next);
    await this.db.put(owner, TEMPLATES_KIND, next);
    return next;
  }

  /** 记录一次真实交付物复用；同一交付物重复保存只更新最后一条记录。 */
  async recordUsage(
    owner: string,
    templateId: string,
    deliverableId: string,
    version: number,
    content: string,
    actorOwner?: string,
  ): Promise<UserTemplate> {
    const template = await this.require(owner, templateId);
    // 共享模板对使用者只暴露骨架，改动率也以骨架为基准，避免用隐藏原文误判。
    const base =
      actorOwner && actorOwner !== owner ? templateSkeleton(template) : template.sample_content;
    const result = humanEditRatio(base, content);
    const at = new Date().toISOString();
    const record: TemplateUsageRecord = {
      deliverable_id: deliverableId,
      version,
      edit_ratio: result.ratio,
      edited_chars: result.edited,
      total_chars: result.total,
      at,
    };
    const usage = template.usage.filter((item) => item.deliverable_id !== deliverableId);
    usage.push(record);
    const next: UserTemplate = { ...template, usage: usage.slice(-100), updated_at: at };
    next.metrics = recomputeMetrics(next);
    await this.db.put(owner, TEMPLATES_KIND, next);
    return next;
  }
}
