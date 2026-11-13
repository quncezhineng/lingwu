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
    | "sent"
    | "archived"
    | "compliance_blocked";
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
