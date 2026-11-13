/**
 * OPT-04 / OPT-05 交付物中心。
 *
 * 一个页面覆盖纵向切片：草稿编辑 → 送审 → 批准（无源数字拦截）→
 * 发送（免责声明 + 违禁表述检查）→ 归档，并展示版本 diff、来源回链与审计。
 */
import { useEffect, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { Text } from "./app-text";
import { saveDeliverableExport } from "./deliverable-export";
import {
  canEditDeliverable,
  createDeliverable,
  DELIVERABLE_KINDS,
  type Deliverable,
  type DeliverableCitation,
  type DeliverableDiff,
  type DeliverableDraft,
  type DeliverableKind,
  type DeliverableListItem,
  type DeliverableSource,
  type DeliverableSourceType,
  type DeliverableStatus,
  draftDeliverable,
  KIND_LABEL_KEYS,
  loadDeliverable,
  loadDeliverableAudit,
  loadDeliverableDiff,
  loadDeliverables,
  nextDeliverableTransition,
  STATUS_LABEL_KEYS,
  sendDeliverable,
  transitionDeliverable,
  updateDeliverable,
  useDeliverablesState,
  validateDeliverableDraft,
} from "./deliverables";
import type { TranslationKey } from "./i18n";
import { useTranslation } from "./i18n";
import { Archive, Check, Download, FileText, Link2, Plus, Send, ShieldCheck } from "./icons";
import { Button, Card, Chip, colors, Empty, ErrorNotice, Field, SectionHeading, s } from "./ui";
import { useWorkspace } from "./workspace";

const STATUS_FILTERS: Array<DeliverableStatus | "all"> = [
  "all",
  "draft",
  "in_review",
  "approved",
  "sent",
  "archived",
];

const SOURCE_TYPES: DeliverableSourceType[] = [
  "task",
  "symbol",
  "thesis",
  "minutes",
  "artifact",
  "manual",
];

type Mode = "list" | "create" | "detail";

function kindLabel(kind: DeliverableKind) {
  return KIND_LABEL_KEYS[kind] as TranslationKey;
}

function statusLabel(status: DeliverableStatus) {
  return STATUS_LABEL_KEYS[status] as TranslationKey;
}

function statusTint(status: DeliverableStatus) {
  if (status === "approved") return colors.green;
  if (status === "in_review") return colors.orange;
  if (status === "sent") return colors.sky;
  return undefined;
}

/** diff 行键：用累计字符偏移，避免把数组下标当 key。 */
function diffRows(diff: DeliverableDiff) {
  let offset = 0;
  return diff.lines.map((line) => {
    const key = `${offset}:${line.type}`;
    offset += line.text.length + 1;
    return { key, line };
  });
}

/** 把服务端的合规门错误翻译成可操作的提示。 */
function complianceMessage(error: unknown, t: (key: TranslationKey) => string) {
  const message = error instanceof Error ? error.message : String(error);
  if (/unsourced numbers/i.test(message)) return t("screens.deliverableUnsourcedError");
  if (/prohibited wording/i.test(message)) return t("screens.deliverableProhibitedError");
  if (/invalid_transition|Only .* can be/i.test(message))
    return t("screens.deliverableInvalidTransition");
  return message;
}

export function DeliverablesScreen() {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const state = useDeliverablesState();
  const [mode, setMode] = useState<Mode>("list");
  const [filter, setFilter] = useState<DeliverableStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void loadDeliverables(api, true);
  }, [api]);

  const items =
    filter === "all" ? state.items : state.items.filter((item) => item.status === filter);

  function openDetail(id: string) {
    setSelectedId(id);
    setMode("detail");
    setError(undefined);
  }

  if (mode === "create") {
    return (
      <CreateDeliverablePanel
        onCancel={() => setMode("list")}
        onCreated={(note) => {
          openDetail(note.id);
          notify(t("screens.deliverableCreated"));
        }}
      />
    );
  }

  if (mode === "detail" && selectedId) {
    return (
      <DeliverableDetail
        id={selectedId}
        onBack={() => {
          setMode("list");
          setSelectedId(undefined);
          setError(undefined);
        }}
      />
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={[s.between, { gap: 12, flexWrap: "wrap" }]}>
        <View>
          <Text style={[s.heading, { fontSize: 18 }]}>{t("screens.deliverableTitle")}</Text>
          <Text style={s.small}>{t("screens.deliverableSubtitle")}</Text>
        </View>
        <Button icon={Plus} onPress={() => setMode("create")}>
          {t("screens.deliverableCreate")}
        </Button>
      </View>

      <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
        {STATUS_FILTERS.map((status) => (
          <Pressable
            key={status}
            accessibilityRole="button"
            onPress={() => setFilter(status)}
            style={({ pressed }) => ({
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: filter === status ? colors.primary : colors.line,
              backgroundColor:
                filter === status ? colors.sky : pressed ? colors.overlay1 : "transparent",
            })}
          >
            <Text
              style={{
                fontSize: 12,
                color: filter === status ? colors.primaryStrong : colors.muted,
                fontWeight: filter === status ? "600" : "400",
              }}
            >
              {status === "all" ? t("screens.deliverableFilterAll") : t(statusLabel(status))}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <ErrorNotice error={error} /> : null}
      {state.status === "error" ? (
        <View style={{ gap: 10 }}>
          <ErrorNotice error={t("screens.deliverableLoadFailed")} />
          <Button small onPress={() => void loadDeliverables(api, true)}>
            {t("screens.deliverableRetry")}
          </Button>
        </View>
      ) : state.status === "loading" && !state.items.length ? (
        <Text style={s.muted}>{t("common.loading")}</Text>
      ) : items.length === 0 ? (
        <Card>
          <Empty
            icon={FileText}
            title={t("screens.deliverableEmptyTitle")}
            detail={t("screens.deliverableEmptyDetail")}
          />
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {items.map((item) => (
            <DeliverableRow key={item.id} item={item} onPress={() => openDetail(item.id)} />
          ))}
        </View>
      )}
    </View>
  );
}

function DeliverableRow({ item, onPress }: { item: DeliverableListItem; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        { gap: 8, backgroundColor: pressed ? colors.overlay1 : colors.paper },
      ]}
    >
      <View style={[s.between, { gap: 10 }]}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }} numberOfLines={1}>
          {item.title}
        </Text>
        <Chip tint={statusTint(item.status)}>{t(statusLabel(item.status))}</Chip>
      </View>
      <Text style={s.small} numberOfLines={2}>
        {item.excerpt || t("screens.deliverableNoContent")}
      </Text>
      <View style={[s.row, { gap: 10 }]}>
        <Text style={s.small}>{t(kindLabel(item.kind))}</Text>
        <Text style={s.small}>v{item.version}</Text>
        <Text style={s.small}>
          {t("screens.deliverableSourceCount", { count: item.sources.length })}
        </Text>
      </View>
    </Pressable>
  );
}

function CreateDeliverablePanel({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (note: Deliverable) => void;
}) {
  const { api } = useWorkspace();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DeliverableDraft>(() => draftDeliverable());
  const [sourceType, setSourceType] = useState<DeliverableSourceType>("task");
  const [sourceId, setSourceId] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState<TranslationKey>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    const invalid = validateDeliverableDraft(draft);
    if (invalid) {
      setError(
        invalid === "title"
          ? "screens.deliverableValidationTitle"
          : "screens.deliverableValidationContent",
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const note = await createDeliverable(api, draft);
      onCreated(note);
    } catch {
      setBusy(false);
      setError("screens.deliverableSaveFailed");
    }
  }

  function addSource() {
    if (!sourceId.trim()) return;
    const source: DeliverableSource = {
      type: sourceType,
      id: sourceId.trim(),
      ...(sourceTitle.trim() ? { title: sourceTitle.trim() } : {}),
      ...(sourceUrl.trim() ? { url: sourceUrl.trim() } : {}),
    };
    setDraft({ ...draft, sources: [...draft.sources, source] });
    setSourceId("");
    setSourceTitle("");
    setSourceUrl("");
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={[s.row, { gap: 10 }]}>
        <Button small onPress={onCancel}>
          {t("screens.deliverableBack")}
        </Button>
        <Text style={[s.heading, { fontSize: 16 }]}>{t("screens.deliverableCreate")}</Text>
      </View>
      <Card style={{ gap: 12 }}>
        <Text style={s.fieldLabel}>{t("screens.deliverableKind")}</Text>
        <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
          {DELIVERABLE_KINDS.map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              onPress={() => setDraft({ ...draft, kind })}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: draft.kind === kind ? colors.primary : colors.line,
                backgroundColor: draft.kind === kind ? colors.sky : "transparent",
              }}
            >
              <Text style={s.small}>{t(kindLabel(kind))}</Text>
            </Pressable>
          ))}
        </View>
        <Field
          label={t("screens.deliverableFieldTitle")}
          value={draft.title}
          onChangeText={(title) => setDraft({ ...draft, title })}
        />
        <Field
          label={t("screens.deliverableFieldContent")}
          value={draft.content}
          onChangeText={(content) => setDraft({ ...draft, content })}
          multiline
        />
        <View style={{ gap: 8 }}>
          <Text style={s.fieldLabel}>{t("screens.deliverableSources")}</Text>
          {draft.sources.map((source) => (
            <Text key={`${source.type}:${source.id}`} style={s.small}>
              {source.type} · {source.title || source.id}
            </Text>
          ))}
          <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
            {SOURCE_TYPES.map((type) => (
              <Pressable
                key={type}
                accessibilityRole="button"
                onPress={() => setSourceType(type)}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  backgroundColor: sourceType === type ? colors.sky : colors.surface,
                }}
              >
                <Text style={s.small}>{type}</Text>
              </Pressable>
            ))}
          </View>
          <Field
            label={t("screens.deliverableSourceId")}
            value={sourceId}
            onChangeText={setSourceId}
          />
          <Field
            label={t("screens.deliverableSourceTitle")}
            value={sourceTitle}
            onChangeText={setSourceTitle}
          />
          <Field
            label={t("screens.deliverableSourceUrl")}
            value={sourceUrl}
            onChangeText={setSourceUrl}
          />
          <Button small icon={Link2} onPress={addSource} disabled={!sourceId.trim()}>
            {t("screens.deliverableAddSource")}
          </Button>
        </View>
        {error ? <ErrorNotice error={t(error)} /> : null}
        <View style={[s.row, { gap: 10 }]}>
          <Button icon={Check} busy={busy} onPress={() => void submit()}>
            {t("screens.deliverableSaveDraft")}
          </Button>
          <Button quietBusy onPress={onCancel}>
            {t("screens.deliverableCancel")}
          </Button>
        </View>
      </Card>
    </View>
  );
}

function DeliverableDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const state = useDeliverablesState();
  const detail = state.detail?.id === id ? state.detail : undefined;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [recipients, setRecipients] = useState("");
  const [citations, setCitations] = useState<DeliverableCitation[]>([]);
  const [citationMatch, setCitationMatch] = useState("");
  const [citationUrl, setCitationUrl] = useState("");
  const [citationExcerpt, setCitationExcerpt] = useState("");
  const [fromVersion, setFromVersion] = useState(1);
  const [toVersion, setToVersion] = useState(1);
  const [diff, setDiff] = useState<DeliverableDiff>();

  useEffect(() => {
    setError(undefined);
    setDiff(undefined);
    void loadDeliverable(api, id).catch((failure) => setError(complianceMessage(failure, t)));
    void loadDeliverableAudit(api, id).catch(() => undefined);
  }, [api, id, t]);

  useEffect(() => {
    if (!detail) return;
    setTitle(detail.title);
    setContent(detail.content);
    setCitations(detail.citations);
    const latest = detail.version;
    setToVersion(latest);
    setFromVersion(Math.max(1, latest - 1));
  }, [detail]);

  async function run(action: "submit" | "approve" | "archive") {
    setBusy(true);
    setError(undefined);
    try {
      await transitionDeliverable(api, id, action);
      notify(
        action === "submit"
          ? t("screens.deliverableSubmitted")
          : action === "approve"
            ? t("screens.deliverableApproved")
            : t("screens.deliverableArchived"),
      );
      await loadDeliverableAudit(api, id);
    } catch (failure) {
      setError(complianceMessage(failure, t));
      await loadDeliverableAudit(api, id).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      await updateDeliverable(api, id, { title, content });
      notify(t("screens.deliverableSaved"));
    } catch (failure) {
      setError(complianceMessage(failure, t));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const list = recipients
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!list.length) {
      setError(t("screens.deliverableValidationRecipients"));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await sendDeliverable(api, id, { recipients: list, channel: "manual" });
      notify(t("screens.deliverableSent"));
      await loadDeliverableAudit(api, id);
    } catch (failure) {
      setError(complianceMessage(failure, t));
      await loadDeliverableAudit(api, id).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function addCitation() {
    if (!citationMatch.trim()) return;
    const next = [
      ...citations,
      {
        match: citationMatch.trim(),
        occurrence: 1,
        ...(citationUrl.trim() ? { url: citationUrl.trim() } : {}),
        ...(citationExcerpt.trim() ? { excerpt: citationExcerpt.trim() } : {}),
        ...(citationUrl.trim() ? { fetchedAt: new Date().toISOString() } : {}),
      },
    ];
    setBusy(true);
    setError(undefined);
    try {
      const note = await updateDeliverable(api, id, {
        citations: next.map((citation) => ({
          match: citation.match,
          occurrence: citation.occurrence,
          ...(citation.url ? { url: citation.url } : {}),
          ...(citation.fetchedAt ? { fetchedAt: citation.fetchedAt } : {}),
          ...(citation.excerpt ? { excerpt: citation.excerpt } : {}),
        })),
      });
      setCitations(note.citations);
      setCitationMatch("");
      setCitationUrl("");
      setCitationExcerpt("");
      notify(t("screens.deliverableCitationAdded"));
    } catch (failure) {
      setError(complianceMessage(failure, t));
    } finally {
      setBusy(false);
    }
  }

  async function compare() {
    setError(undefined);
    try {
      setDiff(await loadDeliverableDiff(api, id, fromVersion, toVersion));
    } catch (failure) {
      setError(complianceMessage(failure, t));
    }
  }

  async function exportAs(format: "markdown" | "html") {
    if (!detail) return;
    setError(undefined);
    try {
      const name = await saveDeliverableExport(api, detail.id, format, detail.title);
      notify(t("screens.deliverableExported", { name }));
    } catch (failure) {
      setError(complianceMessage(failure, t));
    }
  }

  const action = detail ? nextDeliverableTransition(detail.status) : undefined;
  const editable = detail ? canEditDeliverable(detail.status) : false;

  return (
    <View style={{ gap: 16 }}>
      <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
        <Button small onPress={onBack}>
          {t("screens.deliverableBack")}
        </Button>
        {detail ? (
          <>
            <Chip tint={statusTint(detail.status)}>{t(statusLabel(detail.status))}</Chip>
            <Text style={s.small}>v{detail.version}</Text>
            <Text style={s.small}>{t(kindLabel(detail.kind))}</Text>
          </>
        ) : null}
      </View>
      {error ? <ErrorNotice error={error} /> : null}
      {!detail ? (
        <Text style={s.muted}>{t("common.loading")}</Text>
      ) : (
        <>
          <Card style={{ gap: 12 }}>
            {editable ? (
              <>
                <Field
                  label={t("screens.deliverableFieldTitle")}
                  value={title}
                  onChangeText={setTitle}
                />
                <Field
                  label={t("screens.deliverableFieldContent")}
                  value={content}
                  onChangeText={setContent}
                  multiline
                />
                <Button icon={Check} busy={busy} onPress={() => void save()}>
                  {t("screens.deliverableSaveDraft")}
                </Button>
              </>
            ) : (
              <>
                <Text style={[s.heading, { fontSize: 17 }]}>{detail.title}</Text>
                <Text style={[s.text, { lineHeight: 22 }]}>{detail.content}</Text>
              </>
            )}
          </Card>

          <Card style={{ gap: 10 }}>
            <SectionHeading title={t("screens.deliverableActions")} />
            <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
              {action === "submit" ? (
                <Button icon={Send} busy={busy} onPress={() => void run("submit")}>
                  {t("screens.deliverableSubmit")}
                </Button>
              ) : null}
              {action === "approve" ? (
                <Button icon={ShieldCheck} busy={busy} onPress={() => void run("approve")}>
                  {t("screens.deliverableApprove")}
                </Button>
              ) : null}
              {action === "send" ? (
                <>
                  <Field
                    label={t("screens.deliverableRecipients")}
                    value={recipients}
                    onChangeText={setRecipients}
                  />
                  <Button icon={Send} busy={busy} onPress={() => void send()}>
                    {t("screens.deliverableSend")}
                  </Button>
                </>
              ) : null}
              {detail.status !== "archived" ? (
                <Button icon={Archive} quietBusy onPress={() => void run("archive")}>
                  {t("screens.deliverableArchive")}
                </Button>
              ) : null}
            </View>
            <Text style={s.small}>{t("screens.deliverableComplianceHint")}</Text>
          </Card>

          <Card style={{ gap: 10 }}>
            <SectionHeading title={t("screens.deliverableSources")} count={detail.sources.length} />
            {detail.sources.length === 0 ? (
              <Text style={s.small}>{t("screens.deliverableNoSources")}</Text>
            ) : (
              detail.sources.map((source) => (
                <SourceRow key={`${source.type}:${source.id}`} source={source} />
              ))
            )}
          </Card>

          <Card style={{ gap: 10 }}>
            <SectionHeading
              title={t("screens.deliverableCitations")}
              count={detail.citations.length}
            />
            {detail.citations.length === 0 ? (
              <Text style={s.small}>{t("screens.deliverableNoCitations")}</Text>
            ) : (
              detail.citations.map((citation) => (
                <View
                  key={citation.id}
                  style={{
                    gap: 2,
                    paddingVertical: 4,
                    borderBottomWidth: 1,
                    borderColor: colors.lineSoft,
                  }}
                >
                  <Text style={s.text}>{citation.match}</Text>
                  <Text style={s.small}>
                    {citation.url || t("screens.deliverableCitationNoUrl")}
                  </Text>
                </View>
              ))
            )}
            {editable ? (
              <View style={{ gap: 8 }}>
                <Field
                  label={t("screens.deliverableCitationMatch")}
                  value={citationMatch}
                  onChangeText={setCitationMatch}
                />
                <Field
                  label={t("screens.deliverableCitationUrl")}
                  value={citationUrl}
                  onChangeText={setCitationUrl}
                />
                <Field
                  label={t("screens.deliverableCitationExcerpt")}
                  value={citationExcerpt}
                  onChangeText={setCitationExcerpt}
                />
                <Button
                  small
                  icon={Link2}
                  busy={busy}
                  disabled={!citationMatch.trim()}
                  onPress={() => void addCitation()}
                >
                  {t("screens.deliverableAddCitation")}
                </Button>
              </View>
            ) : null}
          </Card>

          <Card style={{ gap: 10 }}>
            <SectionHeading title={t("screens.deliverableVersions")} count={detail.version} />
            <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
              {detail.versions.map((version) => (
                <Text key={version.version} style={s.small}>
                  v{version.version} · {version.editor} · +{version.addedLines}/-
                  {version.removedLines}
                </Text>
              ))}
            </View>
            <View style={[s.row, { gap: 8 }]}>
              <Field
                label={t("screens.deliverableDiffFrom")}
                value={String(fromVersion)}
                onChangeText={(value) => setFromVersion(Number(value) || 1)}
              />
              <Field
                label={t("screens.deliverableDiffTo")}
                value={String(toVersion)}
                onChangeText={(value) => setToVersion(Number(value) || 1)}
              />
              <Button small onPress={() => void compare()}>
                {t("screens.deliverableCompare")}
              </Button>
            </View>
            {diff ? (
              <View style={{ gap: 2 }}>
                {diffRows(diff).map(({ key, line }) => (
                  <Text
                    key={key}
                    style={{
                      fontSize: 12,
                      lineHeight: 18,
                      fontFamily: "monospace",
                      color:
                        line.type === "added"
                          ? colors.success
                          : line.type === "removed"
                            ? colors.danger
                            : colors.muted,
                    }}
                  >
                    {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}
                    {line.text}
                  </Text>
                ))}
              </View>
            ) : null}
          </Card>

          <Card style={{ gap: 10 }}>
            <SectionHeading title={t("screens.deliverableAudit")} count={state.audit.length} />
            {state.audit.length === 0 ? (
              <Text style={s.small}>{t("screens.deliverableNoAudit")}</Text>
            ) : (
              state.audit.map((entry) => (
                <View key={entry.id} style={[s.between, { gap: 8 }]}>
                  <Text style={s.small}>
                    {entry.action} · {entry.actor}
                  </Text>
                  <Text style={s.small}>v{entry.version}</Text>
                </View>
              ))
            )}
          </Card>

          <Card style={{ gap: 10 }}>
            <SectionHeading title={t("screens.deliverableExport")} />
            <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
              <Button icon={Download} onPress={() => void exportAs("markdown")}>
                Markdown
              </Button>
              <Button icon={Download} onPress={() => void exportAs("html")}>
                HTML
              </Button>
            </View>
          </Card>
        </>
      )}
    </View>
  );
}

function SourceRow({ source }: { source: DeliverableSource }) {
  const { t } = useTranslation();
  const label = `${source.type} · ${source.title || source.id}`;
  if (!source.url) return <Text style={s.small}>{label}</Text>;
  const url = source.url;
  return (
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)}>
      <Text style={[s.small, { color: colors.link }]}>{label}</Text>
      <Text style={[s.small, { color: colors.faint }]} numberOfLines={1}>
        {source.url}
      </Text>
      <Text style={[s.small, { color: colors.faint }]}>{t("screens.deliverableOpenSource")}</Text>
    </Pressable>
  );
}
