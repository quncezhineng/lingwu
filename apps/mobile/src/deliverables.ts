/**
 * OPT-04 / OPT-05 交付物中心数据层。
 *
 * 后端契约（/api/deliverables）：
 * - GET    /                         → { deliverables }
 * - POST   /                         → 201 Deliverable
 * - PUT    /:id                      → Deliverable（新版本）
 * - POST   /:id/submit|approve|send|reopen|archive
 * - POST   /:id/numbers/:numberId/resolve { resolution: source|estimate|remove }
 * - GET    /:id/diff?from&to、./:id/compliance、./:id/audit
 * - POST   /:id/share、DELETE /shares/:id
 * - GET    /audit/export?deliverable_id
 */
import { useSyncExternalStore } from "react";
import type { LingWuApi } from "./api";

export type DeliverableKind =
  | "BRIEFING"
  | "REPORT"
  | "MINUTES"
  | "ONE_PAGER"
  | "REVIEW"
  | "TABLE"
  | "CUSTOM";
export type DeliverableStatus = "draft" | "in_review" | "approved" | "sent" | "archived";
export type DeliverableNumberStatus = "sourced" | "unsourced" | "estimate" | "removed";

export interface DeliverableCitation {
  id: string;
  numberText: string;
  sourceUrl: string;
  excerpt: string;
  fetchedAt: string;
}

export interface DeliverableNumberRef {
  id: string;
  text: string;
  start: number;
  end: number;
  status: DeliverableNumberStatus;
  citationId?: string;
  present: boolean;
}

export interface DeliverableSourceLink {
  type: "task" | "briefing" | "symbol" | "thesis" | "note" | "artifact" | "deliverable" | "url";
  id: string;
  label?: string;
  url?: string;
}

export interface DeliverableVersion {
  id: string;
  version: number;
  title: string;
  content: string;
  author: "agent" | "user" | "system";
  summary: string;
  createdAt: string;
}

export interface DeliverableAuditEntry {
  id: string;
  at: string;
  actor: "agent" | "user" | "system";
  action: string;
  detail?: string;
  version?: number;
}

export interface DeliverableComplianceReport {
  checkedAt: string;
  durationMs: number;
  passed: boolean;
  disclaimer: string;
  disclaimerMissing: boolean;
  violations: { code: string; label: string; excerpt: string }[];
  pii: { code: string; label: string; excerpt: string; redacted: string }[];
  unsourcedNumbers: string[];
  ruleEngine: "ok";
  modelReview: "not_configured";
}

export interface Deliverable {
  id: string;
  kind: DeliverableKind;
  title: string;
  content: string;
  status: DeliverableStatus;
  version: number;
  citations: DeliverableCitation[];
  numbers: DeliverableNumberRef[];
  versions: DeliverableVersion[];
  sourceLinks: DeliverableSourceLink[];
  templateVersion?: string;
  disclaimer: string;
  recipient?: string;
  lastCompliance?: DeliverableComplianceReport;
  approvedAt?: string;
  approvedBy?: string;
  sentAt?: string;
  createdFrom?: DeliverableSourceLink;
  audit: DeliverableAuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface DeliverableDiff {
  fromVersion: number;
  toVersion: number;
  added: string[];
  removed: string[];
  changed: boolean;
}

export const DELIVERABLE_STATUSES: DeliverableStatus[] = [
  "draft",
  "in_review",
  "approved",
  "sent",
  "archived",
];
export const DELIVERABLE_KINDS: DeliverableKind[] = [
  "BRIEFING",
  "REPORT",
  "MINUTES",
  "ONE_PAGER",
  "REVIEW",
  "TABLE",
  "CUSTOM",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function kindOf(value: unknown): DeliverableKind | undefined {
  return DELIVERABLE_KINDS.includes(value as DeliverableKind)
    ? (value as DeliverableKind)
    : undefined;
}

function statusOf(value: unknown): DeliverableStatus | undefined {
  return DELIVERABLE_STATUSES.includes(value as DeliverableStatus)
    ? (value as DeliverableStatus)
    : undefined;
}

function numberStatusOf(value: unknown): DeliverableNumberStatus | undefined {
  return value === "sourced" || value === "unsourced" || value === "estimate" || value === "removed"
    ? value
    : undefined;
}

function parseCitation(value: unknown): DeliverableCitation | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const numberText = str(value.number_text) ?? str(value.numberText);
  const sourceUrl = str(value.source_url) ?? str(value.sourceUrl);
  const excerpt = str(value.excerpt);
  const fetchedAt = str(value.fetched_at) ?? str(value.fetchedAt);
  if (!id || !numberText || !sourceUrl || !excerpt || !fetchedAt) return undefined;
  return { id, numberText, sourceUrl, excerpt, fetchedAt };
}

function parseNumber(value: unknown): DeliverableNumberRef | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const text = str(value.text);
  const start = num(value.start);
  const end = num(value.end);
  const status = numberStatusOf(value.status);
  if (!id || !text || start === undefined || end === undefined || !status) return undefined;
  return {
    id,
    text,
    start,
    end,
    status,
    citationId: str(value.citation_id) ?? str(value.citationId),
    present: value.present !== false,
  };
}

function parseSourceLink(value: unknown): DeliverableSourceLink | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const type = str(value.type);
  if (
    !id ||
    !type ||
    !["task", "briefing", "symbol", "thesis", "note", "artifact", "deliverable", "url"].includes(
      type,
    )
  )
    return undefined;
  return {
    type: type as DeliverableSourceLink["type"],
    id,
    label: str(value.label),
    url: str(value.url),
  };
}

function parseVersion(value: unknown): DeliverableVersion | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const version = num(value.version);
  const content = typeof value.content === "string" ? value.content : undefined;
  const createdAt = str(value.created_at) ?? str(value.createdAt);
  if (!id || version === undefined || content === undefined || !createdAt) return undefined;
  const author =
    value.author === "agent" || value.author === "system" ? value.author : ("user" as const);
  return {
    id,
    version,
    title: str(value.title) ?? "",
    content,
    author,
    summary: str(value.summary) ?? "",
    createdAt,
  };
}

function parseAudit(value: unknown): DeliverableAuditEntry | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const at = str(value.at);
  const action = str(value.action);
  if (!id || !at || !action) return undefined;
  return {
    id,
    at,
    action,
    actor: value.actor === "agent" || value.actor === "system" ? value.actor : "user",
    detail: str(value.detail),
    version: num(value.version),
  };
}

function parseCompliance(value: unknown): DeliverableComplianceReport | undefined {
  if (!isRecord(value)) return undefined;
  const checkedAt = str(value.checked_at) ?? str(value.checkedAt);
  if (!checkedAt) return undefined;
  const violations = Array.isArray(value.violations)
    ? value.violations.flatMap((item) => {
        if (!isRecord(item)) return [];
        const code = str(item.code);
        const label = str(item.label);
        if (!code || !label) return [];
        return [{ code, label, excerpt: str(item.excerpt) ?? "" }];
      })
    : [];
  const pii = Array.isArray(value.pii)
    ? value.pii.flatMap((item) => {
        if (!isRecord(item)) return [];
        const code = str(item.code);
        const label = str(item.label);
        if (!code || !label) return [];
        return [
          {
            code,
            label,
            excerpt: str(item.excerpt) ?? "",
            redacted: str(item.redacted) ?? "",
          },
        ];
      })
    : [];
  return {
    checkedAt,
    durationMs: num(value.duration_ms) ?? num(value.durationMs) ?? 0,
    passed: value.passed === true,
    disclaimer: str(value.disclaimer) ?? "",
    disclaimerMissing: value.disclaimer_missing === true || value.disclaimerMissing === true,
    violations,
    pii,
    unsourcedNumbers: Array.isArray(value.unsourced_numbers)
      ? value.unsourced_numbers.filter((item): item is string => typeof item === "string")
      : [],
    ruleEngine: "ok",
    modelReview: "not_configured",
  };
}

export function parseDeliverable(value: unknown): Deliverable | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const kind = kindOf(value.kind);
  const title = str(value.title);
  const content = typeof value.content === "string" ? value.content : undefined;
  const status = statusOf(value.status);
  if (!id || !kind || !title || content === undefined || !status) return undefined;
  const numbers = Array.isArray(value.numbers)
    ? value.numbers.flatMap((item) => {
        const parsed = parseNumber(item);
        return parsed ? [parsed] : [];
      })
    : [];
  const citations = Array.isArray(value.citations)
    ? value.citations.flatMap((item) => {
        const parsed = parseCitation(item);
        return parsed ? [parsed] : [];
      })
    : [];
  const versions = Array.isArray(value.versions)
    ? value.versions.flatMap((item) => {
        const parsed = parseVersion(item);
        return parsed ? [parsed] : [];
      })
    : [];
  const sourceLinks = Array.isArray(value.source_links)
    ? value.source_links.flatMap((item) => {
        const parsed = parseSourceLink(item);
        return parsed ? [parsed] : [];
      })
    : [];
  const audit = Array.isArray(value.audit)
    ? value.audit.flatMap((item) => {
        const parsed = parseAudit(item);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    id,
    kind,
    title,
    content,
    status,
    version: num(value.version) ?? versions.at(-1)?.version ?? 1,
    citations,
    numbers,
    versions,
    sourceLinks,
    templateVersion: str(value.template_version) ?? str(value.templateVersion),
    disclaimer: str(value.disclaimer) ?? "",
    recipient: str(value.recipient),
    lastCompliance: parseCompliance(value.last_compliance ?? value.lastCompliance),
    approvedAt: str(value.approved_at) ?? str(value.approvedAt),
    approvedBy: str(value.approved_by) ?? str(value.approvedBy),
    sentAt: str(value.sent_at) ?? str(value.sentAt),
    createdFrom: parseSourceLink(value.created_from ?? value.createdFrom),
    audit,
    createdAt: str(value.created_at) ?? str(value.createdAt) ?? new Date().toISOString(),
    updatedAt: str(value.updated_at) ?? str(value.updatedAt) ?? new Date().toISOString(),
  };
}

export function parseDeliverables(value: unknown): Deliverable[] {
  if (!isRecord(value) || !Array.isArray(value.deliverables)) return [];
  return value.deliverables.flatMap((item) => {
    const parsed = parseDeliverable(item);
    return parsed ? [parsed] : [];
  });
}

export function parseDiff(value: unknown): DeliverableDiff | undefined {
  if (!isRecord(value)) return undefined;
  const from = num(value.from_version) ?? num(value.fromVersion);
  const to = num(value.to_version) ?? num(value.toVersion);
  if (from === undefined || to === undefined) return undefined;
  const lines = (input: unknown) =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];
  return {
    fromVersion: from,
    toVersion: to,
    added: lines(value.added),
    removed: lines(value.removed),
    changed: value.changed === true,
  };
}

/** 待处理的无源数字；只有这些会拦截 approved。 */
export function unresolvedNumbers(deliverable: Deliverable): DeliverableNumberRef[] {
  return deliverable.numbers.filter((item) => item.present && item.status === "unsourced");
}

export function numberSummary(deliverable: Deliverable): {
  sourced: number;
  estimate: number;
  unsourced: number;
} {
  const count = { sourced: 0, estimate: 0, unsourced: 0 };
  for (const number of deliverable.numbers) {
    if (!number.present) continue;
    if (
      number.status === "sourced" ||
      number.status === "estimate" ||
      number.status === "unsourced"
    )
      count[number.status] += 1;
  }
  return count;
}

export function canApprove(deliverable: Deliverable): boolean {
  return deliverable.status === "in_review" && unresolvedNumbers(deliverable).length === 0;
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

type Source = "api" | "none";
interface DeliverablesState {
  status: "loading" | "ready";
  deliverables: Deliverable[];
  source: Source;
  error?: string;
  diff: Record<string, DeliverableDiff | undefined>;
  compliance: Record<string, DeliverableComplianceReport | undefined>;
}

let state: DeliverablesState = {
  status: "loading",
  deliverables: [],
  source: "none",
  diff: {},
  compliance: {},
};
const listeners = new Set<() => void>();
let loadKey = "";
let loadRequest: Promise<void> | undefined;

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

function upsert(updated: Deliverable) {
  const existing = state.deliverables.map((item) => (item.id === updated.id ? updated : item));
  const deliverables = existing.some((item) => item.id === updated.id)
    ? existing
    : [updated, ...existing];
  setState({ deliverables });
}

export function loadDeliverables(api: LingWuApi, force = false): Promise<void> {
  const key = api.token;
  if (!force && state.status === "ready" && loadKey === key) return Promise.resolve();
  if (loadRequest) return loadRequest;
  if (!state.deliverables.length) setState({ status: "loading" });
  const request = (async () => {
    try {
      const payload = await api.request<unknown>("/api/deliverables?limit=200");
      setState({
        status: "ready",
        deliverables: parseDeliverables(payload),
        source: "api",
        error: undefined,
      });
      loadKey = key;
    } catch (error) {
      setState({
        status: "ready",
        source: "none",
        error: error instanceof Error ? error.message : String(error),
      });
      loadKey = key;
    } finally {
      loadRequest = undefined;
    }
  })();
  loadRequest = request;
  return request;
}

export interface CreateDeliverableInput {
  kind: DeliverableKind;
  title: string;
  content: string;
  citations?: {
    number_text: string;
    source_url: string;
    excerpt: string;
    fetched_at?: string;
  }[];
  source_links?: DeliverableSourceLink[];
  template_id?: string;
  template_version?: string;
  disclaimer?: string;
  recipient?: string;
}

export async function createDeliverable(
  api: LingWuApi,
  input: CreateDeliverableInput,
): Promise<Deliverable> {
  const created = parseDeliverable(await api.request<unknown>("/api/deliverables", input));
  if (!created) throw new Error("Unexpected deliverable payload");
  upsert(created);
  return created;
}

export async function updateDeliverable(
  api: LingWuApi,
  id: string,
  input: {
    title?: string;
    content?: string;
    citations?: CreateDeliverableInput["citations"];
    disclaimer?: string;
    recipient?: string;
    change_summary?: string;
  },
): Promise<Deliverable> {
  const updated = parseDeliverable(
    await api.request<unknown>(`/api/deliverables/${encodeURIComponent(id)}`, input, "PUT"),
  );
  if (!updated) throw new Error("Unexpected deliverable payload");
  upsert(updated);
  return updated;
}

async function transition(api: LingWuApi, id: string, action: string): Promise<Deliverable> {
  const updated = parseDeliverable(
    await api.request<unknown>(`/api/deliverables/${encodeURIComponent(id)}/${action}`, {}),
  );
  if (!updated) throw new Error("Unexpected deliverable payload");
  upsert(updated);
  return updated;
}

export const submitDeliverable = (api: LingWuApi, id: string) => transition(api, id, "submit");
export const approveDeliverable = (api: LingWuApi, id: string) => transition(api, id, "approve");
export const archiveDeliverable = (api: LingWuApi, id: string) => transition(api, id, "archive");
export async function reopenDeliverable(
  api: LingWuApi,
  id: string,
  reason?: string,
): Promise<Deliverable> {
  const updated = parseDeliverable(
    await api.request<unknown>(`/api/deliverables/${encodeURIComponent(id)}/reopen`, { reason }),
  );
  if (!updated) throw new Error("Unexpected deliverable payload");
  upsert(updated);
  return updated;
}

export async function sendDeliverable(
  api: LingWuApi,
  id: string,
  input: { recipient?: string; disclaimer?: string },
): Promise<Deliverable> {
  const updated = parseDeliverable(
    await api.request<unknown>(`/api/deliverables/${encodeURIComponent(id)}/send`, input),
  );
  if (!updated) throw new Error("Unexpected deliverable payload");
  upsert(updated);
  return updated;
}

export async function resolveDeliverableNumber(
  api: LingWuApi,
  deliverableId: string,
  numberId: string,
  input:
    | { resolution: "source"; source_url: string; excerpt: string; fetched_at?: string }
    | { resolution: "estimate" }
    | { resolution: "remove" },
): Promise<Deliverable> {
  const updated = parseDeliverable(
    await api.request<unknown>(
      `/api/deliverables/${encodeURIComponent(deliverableId)}/numbers/${encodeURIComponent(numberId)}/resolve`,
      input,
    ),
  );
  if (!updated) throw new Error("Unexpected deliverable payload");
  upsert(updated);
  return updated;
}

export async function loadDeliverableDiff(
  api: LingWuApi,
  id: string,
  from: number,
  to: number,
): Promise<DeliverableDiff | undefined> {
  const diff = parseDiff(
    await api.request<unknown>(
      `/api/deliverables/${encodeURIComponent(id)}/diff?from=${from}&to=${to}`,
    ),
  );
  setState({ diff: { ...state.diff, [id]: diff } });
  return diff;
}

export async function loadDeliverableCompliance(
  api: LingWuApi,
  id: string,
): Promise<DeliverableComplianceReport | undefined> {
  const report = parseCompliance(
    await api.request<unknown>(`/api/deliverables/${encodeURIComponent(id)}/compliance`),
  );
  setState({ compliance: { ...state.compliance, [id]: report } });
  return report;
}

export async function shareDeliverable(
  api: LingWuApi,
  id: string,
): Promise<{ id: string; url: string }> {
  const payload = await api.request<unknown>(
    `/api/deliverables/${encodeURIComponent(id)}/share`,
    {},
  );
  if (!isRecord(payload) || typeof payload.id !== "string" || typeof payload.url !== "string")
    throw new Error("Unexpected share payload");
  return { id: payload.id, url: payload.url };
}

export async function exportDeliverableAudit(api: LingWuApi, id?: string): Promise<string> {
  return api.text(
    `/api/deliverables/audit/export${id ? `?deliverable_id=${encodeURIComponent(id)}` : ""}`,
  );
}
