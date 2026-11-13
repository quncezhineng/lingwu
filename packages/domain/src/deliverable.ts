import { z } from "zod";

/** 交付物类型；本轮只做投研交付物，不引入客户信息模型。 */
export const DELIVERABLE_KINDS = [
  "BRIEFING",
  "REPORT",
  "MINUTES",
  "ONE_PAGER",
  "REVIEW",
  "TABLE",
  "CUSTOM",
] as const;
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

export const DELIVERABLE_STATUSES = ["draft", "in_review", "approved", "sent", "archived"] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const DELIVERABLE_SOURCE_TYPES = [
  "task",
  "symbol",
  "thesis",
  "minutes",
  "artifact",
  "manual",
] as const;
export type DeliverableSourceType = (typeof DELIVERABLE_SOURCE_TYPES)[number];

/** 回链到生成交付物的任务 / 标的 / 论点 / 纪要 / 文件。 */
export interface DeliverableSource {
  type: DeliverableSourceType;
  id: string;
  title?: string;
  url?: string;
}

/**
 * 数字级引用。`match` 是正文中的数字 token（如 `14%`），`occurrence`
 * 表示它是该 token 的第几次出现（从 1 开始）。`estimated` 为 true 表示
 * 用户明确把该数字标为估算，视同已处理，不要求 URL。
 */
export interface DeliverableCitation {
  id: string;
  match: string;
  occurrence: number;
  url?: string;
  fetchedAt?: string;
  excerpt?: string;
  sourceId?: string;
  estimated?: boolean;
}

export interface DeliverableVersion {
  version: number;
  title: string;
  content: string;
  editor: "user" | "agent" | "system";
  at: string;
  /** 相对上一版新增/删除的行数，便于列表直接展示“改了多少”。 */
  addedLines: number;
  removedLines: number;
}

export interface DeliverableReview {
  submittedAt?: string;
  submittedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
}

export interface DeliverableSend {
  sentAt: string;
  sentBy?: string;
  recipients: string[];
  channel: "manual" | "email" | "share";
  /** 发送时锁定的版本；分享链接只读这个快照。 */
  sentVersion?: number;
}

/** 客户信息规则检测结果；脱敏后的值只用于预览，不写入交付物正文。 */
export interface DeliverablePiiFinding {
  code: "phone" | "id_card" | "email" | "bank_account" | "client_name";
  label: string;
  excerpt: string;
  redacted: string;
  /** rule = 本地规则库；model = 模型复核钩子。发送时只对 model 命中项应用 redacted。 */
  source?: "rule" | "model";
}

export interface DeliverableViolation {
  code: string;
  label: string;
  excerpt: string;
}

/**
 * 合规检查报告。`model_review` 如实标注模型复核是否配置，
 * 未配置时不伪造「双检通过」。
 */
export interface DeliverableComplianceReport {
  checkedAt: string;
  passed: boolean;
  disclaimer: string;
  disclaimerMissing: boolean;
  violations: DeliverableViolation[];
  pii: DeliverablePiiFinding[];
  unsourcedNumbers: string[];
  ruleEngine: "ok";
  modelReview: "ok" | "flagged" | "not_configured";
}

/** 只读分享链接：锁定发送版本，撤销后立即失效。 */
export interface DeliverableShare {
  id: string;
  deliverableId: string;
  ownerId: string;
  createdAt: string;
  revoked: boolean;
  revokedReason?: string;
  sentVersion: number;
  disclaimer: string;
}

export interface Deliverable {
  id: string;
  ownerId: string;
  kind: DeliverableKind;
  title: string;
  content: string;
  status: DeliverableStatus;
  version: number;
  versions: DeliverableVersion[];
  sources: DeliverableSource[];
  citations: DeliverableCitation[];
  disclaimer: string;
  review: DeliverableReview;
  send?: DeliverableSend;
  /** 最近一次合规检查结果（发送时落库）。 */
  compliance?: DeliverableComplianceReport;
  /** 由定时任务自动落库时的任务 id，用于幂等重放。 */
  sourceTaskId?: string;
  /** 模板契约（为 #25 的模板中心预留）。 */
  template_id?: string;
  template_version?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
}

export interface DeliverableAuditEntry {
  id: string;
  deliverableId: string;
  ownerId: string;
  action:
    | "created"
    | "updated"
    | "submitted"
    | "approved"
    | "returned"
    | "sent"
    | "archived"
    | "compliance_blocked"
    | "number_sourced"
    | "number_estimated"
    | "number_removed"
    | "pii_redacted"
    | "shared"
    | "share_revoked";
  actor: "user" | "agent" | "system";
  actorId?: string;
  at: string;
  version: number;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export const deliverableSourceSchema = z.object({
  type: z.enum(DELIVERABLE_SOURCE_TYPES),
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).optional(),
  url: z.string().trim().url().max(1000).optional(),
});

export const deliverableCitationSchema = z
  .object({
    id: z.string().trim().min(1).max(100).optional(),
    match: z.string().trim().min(1).max(80),
    occurrence: z.number().int().min(1).max(1000).default(1),
    url: z.string().trim().url().max(1000).optional(),
    fetchedAt: z.iso.datetime({ offset: true }).optional(),
    excerpt: z.string().trim().min(1).max(500).optional(),
    sourceId: z.string().trim().min(1).max(200).optional(),
    estimated: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.estimated) return;
    if (!value.url)
      ctx.addIssue({ code: "custom", message: "Sourced citations need a URL", path: ["url"] });
    if (!value.fetchedAt)
      ctx.addIssue({
        code: "custom",
        message: "Sourced citations need a fetchedAt timestamp",
        path: ["fetchedAt"],
      });
    if (!value.excerpt)
      ctx.addIssue({
        code: "custom",
        message: "Sourced citations need an excerpt",
        path: ["excerpt"],
      });
  });

export type DeliverableSourceInput = z.infer<typeof deliverableSourceSchema>;
export type DeliverableCitationInput = z.infer<typeof deliverableCitationSchema>;

/* ------------------------------------------------------------------ *
 * OPT-03 我的模板：从产出反推口径
 * ------------------------------------------------------------------ */

export interface TemplateSection {
  id: string;
  title: string;
  order: number;
  required: boolean;
  instructions?: string;
}

export interface TemplateField {
  id: string;
  label: string;
  required: boolean;
  unit?: string;
}

export interface TemplateVoice {
  tone: "formal" | "direct" | "concise";
  language: "zh" | "en" | "mixed";
  units: string[];
  conventions: string[];
}

export interface TemplateCounterexample {
  id: string;
  text: string;
  reason: "removed" | "rewritten";
  preferred?: string;
}

export interface TemplateVersion {
  id: string;
  version: number;
  name: string;
  description: string;
  structure: TemplateSection[];
  fields: TemplateField[];
  voice: TemplateVoice;
  counterexamples: TemplateCounterexample[];
  summary: string;
  created_at: string;
}

/** 一次模板复用；同一交付物重复保存只更新最后一条记录。 */
export interface TemplateUsageRecord {
  deliverable_id: string;
  version: number;
  edit_ratio: number;
  edited_chars: number;
  total_chars: number;
  at: string;
}

export interface TemplateMetrics {
  reuse_count: number;
  first_edit_ratio?: number;
  latest_edit_ratio?: number;
  /** 复用后人工改动超过 30%，提示口径可能不清晰。 */
  needs_clarification: boolean;
  match_total: number;
  accepted: number;
  rejections: number;
  /** accepted / (accepted + rejections)；没有反馈时为 1。 */
  match_accuracy: number;
}

export interface TemplateSourceLink {
  type: "deliverable";
  id: string;
  label?: string;
}

export interface UserTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string;
  kind: DeliverableKind;
  version: number;
  structure: TemplateSection[];
  fields: TemplateField[];
  voice: TemplateVoice;
  counterexamples: TemplateCounterexample[];
  /** 从产出反推时保留的正文样例，用于「用这个模板」预填与改动率计算。 */
  sample_content: string;
  created_from?: TemplateSourceLink;
  versions: TemplateVersion[];
  usage: TemplateUsageRecord[];
  metrics: TemplateMetrics;
  shared: boolean;
  shared_at?: string;
  /** 内置能力单独展示，用户模板永远为 false。 */
  built_in: false;
  created_at: string;
  updated_at: string;
}

export interface TemplateMatch {
  template_id: string;
  name: string;
  version: number;
  score: number;
  reasons: string[];
  sample_content: string;
  metrics: TemplateMetrics;
}
