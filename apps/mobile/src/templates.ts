/**
 * OPT-03 我的模板数据层。
 *
 * 后端契约（/api/templates）：
 * - GET  /、/shared
 * - POST /from-deliverable、/match、/:id/accept、/:id/reject
 * - PUT  /:id、/:id/shared
 *
 * 内置能力（184 条技能）不进入这个 store：由 `skill-catalog.ts` 只读展示，
 * 与用户模板在 UI 上分表呈现，避免混排。
 */
import { useSyncExternalStore } from "react";
import type { LingWuApi } from "./api";
import type { DeliverableKind } from "./deliverables";

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
  createdAt: string;
}

export interface TemplateUsageRecord {
  deliverableId: string;
  version: number;
  editRatio: number;
  editedChars: number;
  totalChars: number;
  at: string;
}

export interface TemplateMetrics {
  reuseCount: number;
  firstEditRatio?: number;
  latestEditRatio?: number;
  needsClarification: boolean;
  matchTotal: number;
  accepted: number;
  rejections: number;
  matchAccuracy: number;
}

export interface UserTemplate {
  id: string;
  name: string;
  description: string;
  kind: DeliverableKind;
  version: number;
  structure: TemplateSection[];
  fields: TemplateField[];
  voice: TemplateVoice;
  counterexamples: TemplateCounterexample[];
  sampleContent: string;
  createdFrom?: { type: string; id: string; label?: string };
  versions: TemplateVersion[];
  usage: TemplateUsageRecord[];
  metrics: TemplateMetrics;
  shared: boolean;
  sharedAt?: string;
  builtIn: false;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateMatch {
  templateId: string;
  name: string;
  version: number;
  score: number;
  reasons: string[];
  sampleContent: string;
  metrics: TemplateMetrics;
}

const KINDS: DeliverableKind[] = [
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
  return KINDS.includes(value as DeliverableKind) ? (value as DeliverableKind) : undefined;
}

function parseSection(value: unknown): TemplateSection | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const title = str(value.title);
  if (!id || !title) return undefined;
  return {
    id,
    title,
    order: num(value.order) ?? 0,
    required: value.required !== false,
    instructions: str(value.instructions),
  };
}

function parseField(value: unknown): TemplateField | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const label = str(value.label);
  if (!id || !label) return undefined;
  return {
    id,
    label,
    required: value.required === true,
    unit: str(value.unit),
  };
}

function parseVoice(value: unknown): TemplateVoice {
  const record = isRecord(value) ? value : {};
  const tone =
    record.tone === "formal" || record.tone === "direct" || record.tone === "concise"
      ? record.tone
      : "direct";
  const language =
    record.language === "zh" || record.language === "en" || record.language === "mixed"
      ? record.language
      : "zh";
  return {
    tone,
    language,
    units: Array.isArray(record.units)
      ? record.units.filter((item): item is string => typeof item === "string")
      : [],
    conventions: Array.isArray(record.conventions)
      ? record.conventions.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function parseCounterexample(value: unknown): TemplateCounterexample | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const text = str(value.text);
  if (!id || !text) return undefined;
  return {
    id,
    text,
    reason: value.reason === "rewritten" ? "rewritten" : "removed",
    preferred: str(value.preferred),
  };
}

function parseMetrics(value: unknown): TemplateMetrics {
  const record = isRecord(value) ? value : {};
  return {
    reuseCount: num(record.reuse_count) ?? num(record.reuseCount) ?? 0,
    firstEditRatio: num(record.first_edit_ratio) ?? num(record.firstEditRatio),
    latestEditRatio: num(record.latest_edit_ratio) ?? num(record.latestEditRatio),
    needsClarification: record.needs_clarification === true || record.needsClarification === true,
    matchTotal: num(record.match_total) ?? num(record.matchTotal) ?? 0,
    accepted: num(record.accepted) ?? 0,
    rejections: num(record.rejections) ?? 0,
    matchAccuracy: num(record.match_accuracy) ?? num(record.matchAccuracy) ?? 1,
  };
}

function parseUsage(value: unknown): TemplateUsageRecord | undefined {
  if (!isRecord(value)) return undefined;
  const deliverableId = str(value.deliverable_id) ?? str(value.deliverableId);
  const at = str(value.at);
  if (!deliverableId || !at) return undefined;
  return {
    deliverableId,
    version: num(value.version) ?? 1,
    editRatio: num(value.edit_ratio) ?? num(value.editRatio) ?? 0,
    editedChars: num(value.edited_chars) ?? num(value.editedChars) ?? 0,
    totalChars: num(value.total_chars) ?? num(value.totalChars) ?? 0,
    at,
  };
}

function parseVersion(value: unknown): TemplateVersion | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const version = num(value.version);
  const createdAt = str(value.created_at) ?? str(value.createdAt);
  if (!id || version === undefined || !createdAt) return undefined;
  return {
    id,
    version,
    name: str(value.name) ?? "",
    description: str(value.description) ?? "",
    structure: Array.isArray(value.structure)
      ? value.structure.flatMap((item) => {
          const parsed = parseSection(item);
          return parsed ? [parsed] : [];
        })
      : [],
    fields: Array.isArray(value.fields)
      ? value.fields.flatMap((item) => {
          const parsed = parseField(item);
          return parsed ? [parsed] : [];
        })
      : [],
    voice: parseVoice(value.voice),
    counterexamples: Array.isArray(value.counterexamples)
      ? value.counterexamples.flatMap((item) => {
          const parsed = parseCounterexample(item);
          return parsed ? [parsed] : [];
        })
      : [],
    summary: str(value.summary) ?? "",
    createdAt,
  };
}

export function parseTemplate(value: unknown): UserTemplate | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  const name = str(value.name);
  const kind = kindOf(value.kind);
  if (!id || !name || !kind) return undefined;
  const createdFrom = isRecord(value.created_from)
    ? {
        type: str(value.created_from.type) ?? "deliverable",
        id: str(value.created_from.id) ?? "",
        label: str(value.created_from.label),
      }
    : undefined;
  return {
    id,
    name,
    description: str(value.description) ?? "",
    kind,
    version: num(value.version) ?? 1,
    structure: Array.isArray(value.structure)
      ? value.structure.flatMap((item) => {
          const parsed = parseSection(item);
          return parsed ? [parsed] : [];
        })
      : [],
    fields: Array.isArray(value.fields)
      ? value.fields.flatMap((item) => {
          const parsed = parseField(item);
          return parsed ? [parsed] : [];
        })
      : [],
    voice: parseVoice(value.voice),
    counterexamples: Array.isArray(value.counterexamples)
      ? value.counterexamples.flatMap((item) => {
          const parsed = parseCounterexample(item);
          return parsed ? [parsed] : [];
        })
      : [],
    sampleContent: str(value.sample_content) ?? str(value.sampleContent) ?? "",
    createdFrom,
    versions: Array.isArray(value.versions)
      ? value.versions.flatMap((item) => {
          const parsed = parseVersion(item);
          return parsed ? [parsed] : [];
        })
      : [],
    usage: Array.isArray(value.usage)
      ? value.usage.flatMap((item) => {
          const parsed = parseUsage(item);
          return parsed ? [parsed] : [];
        })
      : [],
    metrics: parseMetrics(value.metrics),
    shared: value.shared === true,
    sharedAt: str(value.shared_at) ?? str(value.sharedAt),
    builtIn: false,
    createdAt: str(value.created_at) ?? str(value.createdAt) ?? new Date().toISOString(),
    updatedAt: str(value.updated_at) ?? str(value.updatedAt) ?? new Date().toISOString(),
  };
}

export function parseTemplates(value: unknown): UserTemplate[] {
  if (!isRecord(value) || !Array.isArray(value.templates)) return [];
  return value.templates.flatMap((item) => {
    const parsed = parseTemplate(item);
    return parsed ? [parsed] : [];
  });
}

export function parseMatch(value: unknown): TemplateMatch | undefined {
  if (!isRecord(value)) return undefined;
  const templateId = str(value.template_id) ?? str(value.templateId);
  const name = str(value.name);
  if (!templateId || !name) return undefined;
  return {
    templateId,
    name,
    version: num(value.version) ?? 1,
    score: num(value.score) ?? 0,
    reasons: Array.isArray(value.reasons)
      ? value.reasons.filter((item): item is string => typeof item === "string")
      : [],
    sampleContent: str(value.sample_content) ?? str(value.sampleContent) ?? "",
    metrics: parseMetrics(value.metrics),
  };
}

export function parseMatches(value: unknown): TemplateMatch[] {
  if (!isRecord(value) || !Array.isArray(value.matches)) return [];
  return value.matches.flatMap((item) => {
    const parsed = parseMatch(item);
    return parsed ? [parsed] : [];
  });
}

/** 复用后改动率相对首次下降多少；没有可比数据时返回 undefined。 */
export function editReduction(metrics: TemplateMetrics): number | undefined {
  if (metrics.firstEditRatio === undefined || metrics.latestEditRatio === undefined)
    return undefined;
  if (metrics.firstEditRatio <= 0) return undefined;
  return Math.max(
    -1,
    Math.min(1, (metrics.firstEditRatio - metrics.latestEditRatio) / metrics.firstEditRatio),
  );
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

interface TemplatesState {
  status: "loading" | "ready";
  templates: UserTemplate[];
  shared: UserTemplate[];
  error?: string;
}

let state: TemplatesState = { status: "loading", templates: [], shared: [] };
const listeners = new Set<() => void>();
let loadKey = "";
let loadRequest: Promise<void> | undefined;

function setState(next: Partial<TemplatesState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTemplatesState() {
  return useSyncExternalStore(subscribe, () => state);
}

export function templatesSnapshot() {
  return state;
}

function upsert(template: UserTemplate) {
  const templates = state.templates.some((item) => item.id === template.id)
    ? state.templates.map((item) => (item.id === template.id ? template : item))
    : [template, ...state.templates];
  setState({ templates });
}

export function loadTemplates(api: LingWuApi, force = false): Promise<void> {
  const key = api.token;
  if (!force && state.status === "ready" && loadKey === key) return Promise.resolve();
  if (loadRequest) return loadRequest;
  if (!state.templates.length) setState({ status: "loading" });
  const request = (async () => {
    try {
      const [own, shared] = await Promise.all([
        api.request<unknown>("/api/templates"),
        api.request<unknown>("/api/templates/shared"),
      ]);
      setState({
        status: "ready",
        templates: parseTemplates(own),
        shared: parseTemplates(shared),
        error: undefined,
      });
      loadKey = key;
    } catch (error) {
      setState({
        status: "ready",
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

export async function createTemplateFromDeliverable(
  api: LingWuApi,
  deliverableId: string,
  input: { name?: string; description?: string } = {},
): Promise<UserTemplate> {
  const template = parseTemplate(
    await api.request<unknown>("/api/templates/from-deliverable", {
      deliverable_id: deliverableId,
      ...input,
    }),
  );
  if (!template) throw new Error("Unexpected template payload");
  upsert(template);
  return template;
}

export interface TemplateUpdateInput {
  name?: string;
  description?: string;
  structure?: { id?: string; title: string; required?: boolean; instructions?: string }[];
  fields?: { id?: string; label: string; required?: boolean; unit?: string }[];
  voice?: Partial<TemplateVoice>;
  counterexamples?: {
    id?: string;
    text: string;
    reason?: "removed" | "rewritten";
    preferred?: string;
  }[];
  sample_content?: string;
  summary?: string;
}

export async function updateTemplate(
  api: LingWuApi,
  id: string,
  input: TemplateUpdateInput,
): Promise<UserTemplate> {
  const template = parseTemplate(
    await api.request<unknown>(`/api/templates/${encodeURIComponent(id)}`, input, "PUT"),
  );
  if (!template) throw new Error("Unexpected template payload");
  upsert(template);
  return template;
}

export async function setTemplateShared(
  api: LingWuApi,
  id: string,
  shared: boolean,
): Promise<UserTemplate> {
  const template = parseTemplate(
    await api.request<unknown>(
      `/api/templates/${encodeURIComponent(id)}/shared`,
      { shared },
      "PUT",
    ),
  );
  if (!template) throw new Error("Unexpected template payload");
  upsert(template);
  return template;
}

export async function matchTemplates(
  api: LingWuApi,
  input: { kind: DeliverableKind; title?: string; prompt?: string; limit?: number },
): Promise<TemplateMatch[]> {
  return parseMatches(await api.request<unknown>("/api/templates/match", input));
}

export async function acceptTemplate(
  api: LingWuApi,
  id: string,
  input: { kind: DeliverableKind; title?: string; prompt?: string },
): Promise<void> {
  const template = parseTemplate(
    await api.request<unknown>(`/api/templates/${encodeURIComponent(id)}/accept`, input),
  );
  if (template) upsert(template);
}

export async function rejectTemplate(
  api: LingWuApi,
  id: string,
  input: { kind: DeliverableKind; title?: string; prompt?: string },
): Promise<void> {
  const template = parseTemplate(
    await api.request<unknown>(`/api/templates/${encodeURIComponent(id)}/reject`, input),
  );
  if (template) upsert(template);
}
