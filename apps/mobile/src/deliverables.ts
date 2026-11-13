/**
 * OPT-04 / OPT-05 移动端数据层：交付物状态机、版本、来源与合规门。
 *
 * 后端契约：
 * - GET    /api/deliverables[?status=&kind=&sourceType=&sourceId=]
 * - POST   /api/deliverables
 * - GET    /api/deliverables/:id
 * - PUT    /api/deliverables/:id
 * - POST   /api/deliverables/:id/submit|approve|archive
 * - POST   /api/deliverables/:id/send
 * - GET    /api/deliverables/:id/versions|diff|audit|export
 */
import { useSyncExternalStore } from "react";
import type { LingWuApi } from "./api";

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
export type DeliverableStatus = "draft" | "in_review" | "approved" | "sent" | "archived";
export type DeliverableSourceType =
  | "task"
  | "symbol"
  | "thesis"
  | "minutes"
  | "artifact"
  | "manual";

export interface DeliverableSource {
  type: DeliverableSourceType;
  id: string;
  title?: string;
  url?: string;
}

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
  editor: "user" | "agent" | "system";
  at: string;
  addedLines: number;
  removedLines: number;
}

export interface Deliverable {
  id: string;
  kind: DeliverableKind;
  title: string;
  content: string;
  status: DeliverableStatus;
  version: number;
  versions: DeliverableVersion[];
  sources: DeliverableSource[];
  citations: DeliverableCitation[];
  disclaimer: string;
  submittedAt?: string;
  approvedAt?: string;
  sentAt?: string;
  recipients?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DeliverableListItem {
  id: string;
  kind: DeliverableKind;
  title: string;
  status: DeliverableStatus;
  version: number;
  excerpt: string;
  sources: DeliverableSource[];
  submittedAt?: string;
  updatedAt: string;
}

export interface DeliverableAudit {
  id: string;
  action: string;
  actor: string;
  at: string;
  version: number;
  detail?: string;
}

export interface DeliverableDiff {
  from: number;
  to: number;
  addedLines: number;
  removedLines: number;
  lines: { type: "context" | "added" | "removed"; text: string }[];
}

export interface DeliverableDraft {
  kind: DeliverableKind;
  title: string;
  content: string;
  sources: DeliverableSource[];
}

export type DeliverableTransition = "submit" | "approve" | "archive";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown) {
  return typeof value === "string" && value.length ? value : undefined;
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return typeof value === "string" && (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function parseSources(value: unknown): DeliverableSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const type = oneOf(item.type, [
      "task",
      "symbol",
      "thesis",
      "minutes",
      "artifact",
      "manual",
    ] as const);
    const id = text(item.id);
    if (!type || !id) return [];
    return [
      {
        type,
        id,
        ...(text(item.title) ? { title: text(item.title) } : {}),
        ...(text(item.url) ? { url: text(item.url) } : {}),
      },
    ];
  });
}

function parseCitations(value: unknown): DeliverableCitation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = text(item.id);
    const match = text(item.match);
    if (!id || !match) return [];
    return [
      {
        id,
        match,
        occurrence: num(item.occurrence) ?? 1,
        ...(text(item.url) ? { url: text(item.url) } : {}),
        ...(text(item.fetchedAt) ? { fetchedAt: text(item.fetchedAt) } : {}),
        ...(text(item.excerpt) ? { excerpt: text(item.excerpt) } : {}),
        ...(text(item.sourceId) ? { sourceId: text(item.sourceId) } : {}),
        ...(item.estimated === true ? { estimated: true } : {}),
      },
    ];
  });
}

function parseVersions(value: unknown): DeliverableVersion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const version = num(item.version);
    if (version === undefined) return [];
    return [
      {
        version,
        title: text(item.title) ?? "",
        editor: oneOf(item.editor, ["user", "agent", "system"] as const) ?? "user",
        at: text(item.at) ?? "",
        addedLines: num(item.addedLines) ?? 0,
        removedLines: num(item.removedLines) ?? 0,
      },
    ];
  });
}

export function parseDeliverable(value: unknown): Deliverable | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const kind = oneOf(value.kind, DELIVERABLE_KINDS);
  const title = text(value.title);
  const status = oneOf(value.status, [
    "draft",
    "in_review",
    "approved",
    "sent",
    "archived",
  ] as const);
  if (!id || !kind || !title || !status) return undefined;
  const review = isRecord(value.review) ? value.review : {};
  const send = isRecord(value.send) ? value.send : {};
  return {
    id,
    kind,
    title,
    content: text(value.content) ?? "",
    status,
    version: num(value.version) ?? 1,
    versions: parseVersions(value.versions),
    sources: parseSources(value.sources),
    citations: parseCitations(value.citations),
    disclaimer: text(value.disclaimer) ?? "",
    ...(text(review.submittedAt) ? { submittedAt: text(review.submittedAt) } : {}),
    ...(text(review.approvedAt) ? { approvedAt: text(review.approvedAt) } : {}),
    ...(text(send.sentAt) ? { sentAt: text(send.sentAt) } : {}),
    ...(Array.isArray(send.recipients)
      ? { recipients: send.recipients.filter((item): item is string => typeof item === "string") }
      : {}),
    createdAt: text(value.createdAt) ?? "",
    updatedAt: text(value.updatedAt) ?? "",
  };
}

export function parseDeliverableList(value: unknown): DeliverableListItem[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.deliverables)) return undefined;
  return value.deliverables.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = text(item.id);
    const kind = oneOf(item.kind, DELIVERABLE_KINDS);
    const title = text(item.title);
    const status = oneOf(item.status, [
      "draft",
      "in_review",
      "approved",
      "sent",
      "archived",
    ] as const);
    if (!id || !kind || !title || !status) return [];
    return [
      {
        id,
        kind,
        title,
        status,
        version: num(item.version) ?? 1,
        excerpt: text(item.excerpt) ?? "",
        sources: parseSources(item.sources),
        ...(text(item.submitted_at) ? { submittedAt: text(item.submitted_at) } : {}),
        updatedAt: text(item.updated_at) ?? "",
      },
    ];
  });
}

export function parseDeliverableAudit(value: unknown): DeliverableAudit[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.audit)) return undefined;
  return value.audit.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = text(item.id);
    const action = text(item.action);
    if (!id || !action) return [];
    return [
      {
        id,
        action,
        actor: text(item.actor) ?? "user",
        at: text(item.at) ?? "",
        version: num(item.version) ?? 1,
        ...(text(item.detail) ? { detail: text(item.detail) } : {}),
      },
    ];
  });
}

export function parseDeliverableDiff(value: unknown): DeliverableDiff | undefined {
  if (!isRecord(value) || !Array.isArray(value.lines)) return undefined;
  const from = num(value.from);
  const to = num(value.to);
  if (from === undefined || to === undefined) return undefined;
  return {
    from,
    to,
    addedLines: num(value.addedLines) ?? 0,
    removedLines: num(value.removedLines) ?? 0,
    lines: value.lines.flatMap((line) => {
      if (!isRecord(line)) return [];
      const type = oneOf(line.type, ["context", "added", "removed"] as const);
      if (!type) return [];
      return [{ type, text: text(line.text) ?? "" }];
    }),
  };
}

export const STATUS_LABEL_KEYS = {
  draft: "screens.deliverableStatusDraft",
  in_review: "screens.deliverableStatusInReview",
  approved: "screens.deliverableStatusApproved",
  sent: "screens.deliverableStatusSent",
  archived: "screens.deliverableStatusArchived",
} as const;

export const KIND_LABEL_KEYS = {
  BRIEFING: "screens.deliverableKindBriefing",
  REPORT: "screens.deliverableKindReport",
  MINUTES: "screens.deliverableKindMinutes",
  ONE_PAGER: "screens.deliverableKindOnePager",
  REVIEW: "screens.deliverableKindReview",
  TABLE: "screens.deliverableKindTable",
  CUSTOM: "screens.deliverableKindCustom",
} as const;

/** 手机审批路径：按当前状态给出唯一的主操作。 */
export function nextDeliverableTransition(
  status: DeliverableStatus,
): DeliverableTransition | "send" | undefined {
  if (status === "draft") return "submit";
  if (status === "in_review") return "approve";
  if (status === "approved") return "send";
  return undefined;
}

export function canEditDeliverable(status: DeliverableStatus) {
  return status === "draft" || status === "in_review";
}

export function draftDeliverable(note?: Deliverable): DeliverableDraft {
  return {
    kind: note?.kind ?? "CUSTOM",
    title: note?.title ?? "",
    content: note?.content ?? "",
    sources: note?.sources ?? [],
  };
}

export function validateDeliverableDraft(draft: DeliverableDraft): "title" | "content" | undefined {
  if (!draft.title.trim()) return "title";
  if (!draft.content.trim()) return "content";
  return undefined;
}

export interface DeliverablesState {
  status: "idle" | "loading" | "ready" | "error";
  items: DeliverableListItem[];
  detail?: Deliverable;
  detailStatus: "idle" | "loading" | "ready" | "error";
  versions: DeliverableVersion[];
  diff?: DeliverableDiff;
  audit: DeliverableAudit[];
  error?: string;
}

const INITIAL_STATE: DeliverablesState = {
  status: "idle",
  items: [],
  detailStatus: "idle",
  versions: [],
  audit: [],
};

let state: DeliverablesState = INITIAL_STATE;
const listeners = new Set<() => void>();
let loadKey = "";
let listRequest: Promise<void> | undefined;

function setState(next: Partial<DeliverablesState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDeliverablesState() {
  return useSyncExternalStore(subscribe, () => state);
}

export function deliverablesSnapshot() {
  return state;
}

export function resetDeliverablesStore() {
  state = INITIAL_STATE;
  loadKey = "";
  listRequest = undefined;
  for (const listener of listeners) listener();
}

export function loadDeliverables(api: LingWuApi, force = false): Promise<void> {
  const key = api.token;
  if (!force && state.status === "ready" && loadKey === key) return Promise.resolve();
  if (listRequest) return listRequest;
  if (!state.items.length) setState({ status: "loading" });
  const request = (async () => {
    try {
      const items = parseDeliverableList(await api.request<unknown>("/api/deliverables"));
      if (!items) throw new Error("Unexpected deliverables payload");
      loadKey = key;
      setState({ status: "ready", items, error: undefined });
    } catch (error) {
      setState({
        status: state.items.length ? "ready" : "error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      listRequest = undefined;
    }
  })();
  listRequest = request;
  return request;
}

export async function loadDeliverable(api: LingWuApi, id: string): Promise<Deliverable> {
  setState({ detailStatus: "loading" });
  try {
    const detail = parseDeliverable(
      await api.request<unknown>(`/api/deliverables/${encodeURIComponent(id)}`),
    );
    if (!detail) throw new Error("Unexpected deliverable payload");
    setState({ detail, detailStatus: "ready", versions: detail.versions, error: undefined });
    return detail;
  } catch (error) {
    setState({
      detailStatus: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function requireDeliverable(payload: unknown): Deliverable {
  const detail = parseDeliverable(payload);
  if (!detail) throw new Error("Unexpected deliverable payload");
  return detail;
}

function upsertItem(items: DeliverableListItem[], note: Deliverable): DeliverableListItem[] {
  const next: DeliverableListItem = {
    id: note.id,
    kind: note.kind,
    title: note.title,
    status: note.status,
    version: note.version,
    excerpt: note.content.replace(/\s+/g, " ").trim().slice(0, 160),
    sources: note.sources,
    ...(note.submittedAt ? { submittedAt: note.submittedAt } : {}),
    updatedAt: note.updatedAt,
  };
  return [next, ...items.filter((item) => item.id !== note.id)];
}

export async function createDeliverable(
  api: LingWuApi,
  input: DeliverableDraft,
): Promise<Deliverable> {
  const note = requireDeliverable(await api.request<unknown>("/api/deliverables", input, "POST"));
  setState({ items: upsertItem(state.items, note), detail: note, detailStatus: "ready" });
  return note;
}

export async function updateDeliverable(
  api: LingWuApi,
  id: string,
  patch: {
    title?: string;
    content?: string;
    sources?: DeliverableSource[];
    citations?: Array<{
      match: string;
      occurrence?: number;
      url?: string;
      fetchedAt?: string;
      excerpt?: string;
      estimated?: boolean;
    }>;
    editor?: "user" | "agent";
  },
): Promise<Deliverable> {
  const note = requireDeliverable(
    await api.request<unknown>(`/api/deliverables/${encodeURIComponent(id)}`, patch, "PUT"),
  );
  setState({
    detail: note,
    detailStatus: "ready",
    versions: note.versions,
    items: upsertItem(state.items, note),
  });
  return note;
}

export async function transitionDeliverable(
  api: LingWuApi,
  id: string,
  action: DeliverableTransition,
): Promise<Deliverable> {
  const note = requireDeliverable(
    await api.request<unknown>(
      `/api/deliverables/${encodeURIComponent(id)}/${action}`,
      { actor: "user" },
      "POST",
    ),
  );
  setState({
    detail: note,
    detailStatus: "ready",
    versions: note.versions,
    items: upsertItem(state.items, note),
  });
  return note;
}

export async function sendDeliverable(
  api: LingWuApi,
  id: string,
  input: { recipients: string[]; channel?: "manual" | "email" | "share" },
): Promise<Deliverable> {
  const note = requireDeliverable(
    await api.request<unknown>(
      `/api/deliverables/${encodeURIComponent(id)}/send`,
      { ...input, actor: "user" },
      "POST",
    ),
  );
  setState({
    detail: note,
    detailStatus: "ready",
    versions: note.versions,
    items: upsertItem(state.items, note),
  });
  return note;
}

export async function loadDeliverableVersions(
  api: LingWuApi,
  id: string,
): Promise<DeliverableVersion[]> {
  const payload = await api.request<unknown>(
    `/api/deliverables/${encodeURIComponent(id)}/versions`,
  );
  const versions =
    isRecord(payload) && Array.isArray(payload.versions) ? parseVersions(payload.versions) : [];
  setState({ versions });
  return versions;
}

export async function loadDeliverableDiff(
  api: LingWuApi,
  id: string,
  from: number,
  to: number,
): Promise<DeliverableDiff> {
  const diff = parseDeliverableDiff(
    await api.request<unknown>(
      `/api/deliverables/${encodeURIComponent(id)}/diff?from=${from}&to=${to}`,
    ),
  );
  if (!diff) throw new Error("Unexpected deliverable diff payload");
  setState({ diff });
  return diff;
}

export async function loadDeliverableAudit(
  api: LingWuApi,
  id: string,
): Promise<DeliverableAudit[]> {
  const audit = parseDeliverableAudit(
    await api.request<unknown>(`/api/deliverables/${encodeURIComponent(id)}/audit`),
  );
  if (!audit) throw new Error("Unexpected deliverable audit payload");
  setState({ audit });
  return audit;
}

export async function deliverableExportText(
  api: LingWuApi,
  id: string,
  format: "markdown" | "html",
): Promise<string> {
  return api.text(`/api/deliverables/${encodeURIComponent(id)}/export?format=${format}`);
}
