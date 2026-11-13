/**
 * OPT-04 交付物中心 + OPT-05 溯源合规门。
 *
 * 手机端只做「看关键改动 → 批准 → 发送」：列表里可直接批准无风险草稿，
 * 详情里逐条处理无源数字，发送前展示合规门结果与免责声明。
 */
import { useEffect, useMemo, useState } from "react";
import { Linking, Platform, Pressable, Share, useWindowDimensions, View } from "react-native";
import { Text, TextInput } from "./app-text";
import {
  approveDeliverable,
  archiveDeliverable,
  canApprove,
  createDeliverable,
  DELIVERABLE_KINDS,
  DELIVERABLE_STATUSES,
  type Deliverable,
  type DeliverableComplianceReport,
  type DeliverableDiff,
  type DeliverableKind,
  type DeliverableNumberRef,
  type DeliverableStatus,
  exportDeliverableAudit,
  loadDeliverableCompliance,
  loadDeliverableDiff,
  loadDeliverables,
  numberSummary,
  reopenDeliverable,
  resolveDeliverableNumber,
  sendDeliverable,
  shareDeliverable,
  submitDeliverable,
  unresolvedNumbers,
  updateDeliverable,
  useDeliverablesState,
} from "./deliverables";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import { AlertTriangle, ArrowUpRight, Clock3, FileText, Link2, Plus, ShieldCheck } from "./icons";
import { createTemplateFromDeliverable } from "./templates";
import { breakpoints, radius, space } from "./theme";
import {
  Button,
  Card,
  Chip,
  colors,
  Empty,
  ErrorNotice,
  Field,
  SectionHeading,
  Sheet,
  s,
} from "./ui";
import { useWorkspace } from "./workspace";

const KIND_KEYS: Record<DeliverableKind, TranslationKey> = {
  BRIEFING: "deliverables.kindBriefing",
  REPORT: "deliverables.kindReport",
  MINUTES: "deliverables.kindMinutes",
  ONE_PAGER: "deliverables.kindOnePager",
  REVIEW: "deliverables.kindReview",
  TABLE: "deliverables.kindTable",
  CUSTOM: "deliverables.kindCustom",
};

const STATUS_KEYS: Record<DeliverableStatus, TranslationKey> = {
  draft: "deliverables.statusDraft",
  in_review: "deliverables.statusInReview",
  approved: "deliverables.statusApproved",
  sent: "deliverables.statusSent",
  archived: "deliverables.statusArchived",
};

const NUMBER_KEYS: Record<DeliverableNumberRef["status"], TranslationKey> = {
  sourced: "deliverables.numberSourced",
  unsourced: "deliverables.numberUnsourced",
  estimate: "deliverables.numberEstimate",
  removed: "deliverables.numberRemoved",
};

function statusTint(status: DeliverableStatus) {
  if (status === "approved") return colors.green;
  if (status === "sent") return colors.sky;
  if (status === "in_review") return colors.alertVolume;
  if (status === "archived") return colors.surface;
  return colors.surfaceSoft;
}

function StatusChip({ status }: { status: DeliverableStatus }) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        borderRadius: radius.full,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: statusTint(status),
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text }}>
        {t(STATUS_KEYS[status])}
      </Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 64, gap: 2 }}>
      <Text style={[s.small, { fontSize: 10, color: colors.faint }]}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>{value}</Text>
    </View>
  );
}

function DeliverableCard({
  item,
  busy,
  onOpen,
  onApprove,
}: {
  item: Deliverable;
  busy: boolean;
  onOpen: () => void;
  onApprove: () => void;
}) {
  const { t } = useTranslation();
  const numbers = numberSummary(item);
  const total = numbers.sourced + numbers.estimate + numbers.unsourced;
  return (
    <Card style={{ padding: 14, gap: 9 }}>
      <View style={[s.between, { gap: 8 }]}>
        <View style={[s.row, { gap: 6, flexWrap: "wrap", flex: 1 }]}>
          <Chip>{t(KIND_KEYS[item.kind])}</Chip>
          <StatusChip status={item.status} />
          <Text style={[s.small, { fontSize: 11, color: colors.faint }]}>v{item.version}</Text>
        </View>
        <Text style={[s.small, { fontSize: 11, color: colors.faint }]}>
          {new Date(item.updatedAt).toLocaleDateString()}
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onOpen} style={{ gap: 6 }}>
        <Text style={[s.text, { fontSize: 15, fontWeight: "600" }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={s.small} numberOfLines={2}>
          {item.content.replace(/[#*_>`-]/g, "").slice(0, 160)}
        </Text>
      </Pressable>
      <View style={[s.row, { gap: 14, flexWrap: "wrap" }]}>
        <Metric
          label={t("deliverables.metricNumbers")}
          value={total ? `${numbers.sourced}/${total}` : "0"}
        />
        <Metric
          label={t("deliverables.metricSources")}
          value={String(item.sourceLinks.length + item.citations.length)}
        />
        {!!numbers.unsourced && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 7,
              paddingVertical: 3,
              borderRadius: radius.full,
              backgroundColor: colors.alertVolume,
            }}
          >
            <AlertTriangle size={11} color={colors.alertVolumeText} />
            <Text style={{ fontSize: 11, color: colors.alertVolumeText, fontWeight: "600" }}>
              {t("deliverables.unsourcedCount", { count: numbers.unsourced })}
            </Text>
          </View>
        )}
      </View>
      <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
        <Button small style={{ minHeight: 40 }} onPress={onOpen}>
          {t("deliverables.open")}
        </Button>
        {canApprove(item) && (
          <Button small primary busy={busy} style={{ minHeight: 40 }} onPress={onApprove}>
            {t("deliverables.approve")}
          </Button>
        )}
        {unresolvedNumbers(item).length > 0 && item.status !== "sent" && (
          <Button small style={{ minHeight: 40 }} onPress={onOpen}>
            {t("deliverables.fixNumbers")}
          </Button>
        )}
      </View>
    </Card>
  );
}

function ResolutionSheet({
  number,
  busy,
  onClose,
  onResolve,
}: {
  number: DeliverableNumberRef;
  busy: boolean;
  onClose: () => void;
  onResolve: (
    input:
      | { resolution: "source"; source_url: string; excerpt: string }
      | { resolution: "estimate" }
      | { resolution: "remove" },
  ) => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [error, setError] = useState("");
  function submitSource() {
    if (!/^https?:\/\//i.test(url.trim())) {
      setError(t("deliverables.sourceUrlInvalid"));
      return;
    }
    if (!excerpt.trim()) {
      setError(t("deliverables.sourceExcerptRequired"));
      return;
    }
    setError("");
    onResolve({ resolution: "source", source_url: url.trim(), excerpt: excerpt.trim() });
  }
  return (
    <Sheet title={t("deliverables.resolveTitle", { number: number.text })} onClose={onClose} small>
      <View style={{ gap: space.sm }}>
        <Text style={s.small}>{t("deliverables.resolveHint")}</Text>
        <ErrorNotice error={error} />
        <Card style={{ padding: 12, gap: 8 }}>
          <Text style={[s.text, { fontWeight: "600" }]}>{t("deliverables.addSource")}</Text>
          <Field
            label={t("deliverables.sourceUrl")}
            value={url}
            onChangeText={setUrl}
            placeholder="https://…"
            autoCapitalize="none"
          />
          <Field
            label={t("deliverables.sourceExcerpt")}
            value={excerpt}
            onChangeText={setExcerpt}
            multiline
            placeholder={t("deliverables.sourceExcerptPlaceholder")}
          />
          <Button primary busy={busy} onPress={submitSource}>
            {t("deliverables.saveSource")}
          </Button>
        </Card>
        <Button busy={busy} onPress={() => onResolve({ resolution: "estimate" })}>
          {t("deliverables.markEstimate")}
        </Button>
        <Button busy={busy} onPress={() => onResolve({ resolution: "remove" })}>
          {t("deliverables.removeNumber")}
        </Button>
      </View>
    </Sheet>
  );
}

function CompliancePanel({ report }: { report?: DeliverableComplianceReport }) {
  const { t } = useTranslation();
  if (!report) return <Text style={s.small}>{t("deliverables.compliancePending")}</Text>;
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          padding: 9,
          borderRadius: radius.card,
          backgroundColor: report.passed ? colors.green : colors.alertVolume,
        }}
      >
        {report.passed ? (
          <ShieldCheck size={16} color={colors.primaryStrong} />
        ) : (
          <AlertTriangle size={16} color={colors.alertVolumeText} />
        )}
        <Text style={[s.text, { flex: 1, fontSize: 13, fontWeight: "600" }]}>
          {report.passed ? t("deliverables.compliancePassed") : t("deliverables.complianceBlocked")}
        </Text>
        <Text style={[s.small, { fontSize: 10 }]}>
          {t("deliverables.complianceLatency", { ms: report.durationMs })}
        </Text>
      </View>
      {report.violations.map((item) => (
        <Text key={item.code} style={[s.small, { color: colors.alertVolumeText }]}>
          {item.label}：{item.excerpt}
        </Text>
      ))}
      {report.unsourcedNumbers.length > 0 && (
        <Text style={[s.small, { color: colors.alertVolumeText }]}>
          {t("deliverables.unsourcedList", { list: report.unsourcedNumbers.join("、") })}
        </Text>
      )}
      {report.pii.length > 0 && (
        <Text style={s.small}>{t("deliverables.piiNote", { count: report.pii.length })}</Text>
      )}
      <Text style={[s.small, { fontSize: 11, color: colors.faint }]}>
        {t("deliverables.modelReviewNote")}
      </Text>
    </View>
  );
}

function DeliverableDetail({
  item,
  onClose,
  onChanged,
}: {
  item: Deliverable;
  onClose: () => void;
  onChanged: (next: Deliverable) => void;
}) {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const state = useDeliverablesState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [draftContent, setDraftContent] = useState(item.content);
  const [recipient, setRecipient] = useState(item.recipient ?? "");
  const [sendOpen, setSendOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [resolveTarget, setResolveTarget] = useState<DeliverableNumberRef>();
  const [diff, setDiff] = useState<DeliverableDiff>();
  const report = state.compliance[item.id] ?? item.lastCompliance;
  const unresolved = unresolvedNumbers(item);

  useEffect(() => {
    void loadDeliverableCompliance(api, item.id).catch(() => undefined);
  }, [api, item.id, item.version]);

  async function run<T>(work: () => Promise<T>, done?: string): Promise<T | undefined> {
    setBusy(true);
    setError("");
    try {
      const result = await work();
      if (done) notify(done);
      return result;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function compareVersions() {
    const [from, to] = [item.version - 1, item.version];
    if (from < 1) return;
    const result = await run(() => loadDeliverableDiff(api, item.id, from, to));
    if (result) setDiff(result);
  }

  async function exportAudit() {
    const csv = await run(() => exportDeliverableAudit(api, item.id));
    if (!csv) return;
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `deliverable-audit-${item.id}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      notify(t("deliverables.auditExported"));
    } else {
      await Share.share({ message: csv, title: t("deliverables.auditTitle") });
    }
  }

  return (
    <Sheet
      title={item.title}
      subtitle={`${t(KIND_KEYS[item.kind])} · v${item.version}`}
      onClose={onClose}
      fullscreen
      headerAction={<StatusChip status={item.status} />}
    >
      <View style={{ gap: space.md }}>
        <ErrorNotice error={error || state.error} />
        {item.templateVersion && (
          <Chip>{t("deliverables.usedTemplate", { version: item.templateVersion })}</Chip>
        )}

        <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
          {item.status === "draft" && (
            <Button
              primary
              busy={busy}
              onPress={() =>
                void run(() => submitDeliverable(api, item.id), t("deliverables.submitted")).then(
                  (next) => next && onChanged(next),
                )
              }
            >
              {t("deliverables.submitReview")}
            </Button>
          )}
          {item.status === "in_review" && (
            <Button
              primary
              busy={busy}
              disabled={unresolved.length > 0}
              onPress={() =>
                void run(() => approveDeliverable(api, item.id), t("deliverables.approved")).then(
                  (next) => next && onChanged(next),
                )
              }
            >
              {unresolved.length
                ? t("deliverables.resolveFirst", { count: unresolved.length })
                : t("deliverables.approve")}
            </Button>
          )}
          {item.status === "approved" && (
            <Button primary busy={busy} onPress={() => setSendOpen(true)}>
              {t("deliverables.sendWithGate")}
            </Button>
          )}
          {item.status === "sent" && (
            <Button
              busy={busy}
              onPress={() =>
                void run(() => shareDeliverable(api, item.id)).then((share) => {
                  if (!share) return;
                  setShareUrl(share.url);
                  notify(t("deliverables.shareReady"));
                })
              }
            >
              {t("deliverables.share")}
            </Button>
          )}
          {(item.status === "in_review" || item.status === "approved") && (
            <Button
              busy={busy}
              onPress={() =>
                void run(
                  () => reopenDeliverable(api, item.id, "退回修改"),
                  t("deliverables.reopened"),
                ).then((next) => next && onChanged(next))
              }
            >
              {t("deliverables.backToDraft")}
            </Button>
          )}
          {item.status !== "archived" && (
            <Button
              busy={busy}
              onPress={() =>
                void run(() => archiveDeliverable(api, item.id), t("deliverables.archived")).then(
                  (next) => next && onChanged(next),
                )
              }
            >
              {t("deliverables.archive")}
            </Button>
          )}
          <Button
            busy={busy}
            onPress={() =>
              void run(
                () => createTemplateFromDeliverable(api, item.id),
                t("deliverables.savedAsTemplate"),
              )
            }
          >
            {t("deliverables.saveAsTemplate")}
          </Button>
          {item.status === "archived" && (
            <Button
              busy={busy}
              onPress={() =>
                void run(() => reopenDeliverable(api, item.id), t("deliverables.reopened")).then(
                  (next) => next && onChanged(next),
                )
              }
            >
              {t("deliverables.reopen")}
            </Button>
          )}
          <Button busy={busy} onPress={() => void exportAudit()}>
            {t("deliverables.exportAudit")}
          </Button>
        </View>

        {!!shareUrl && (
          <Card style={{ padding: 10, gap: 4 }}>
            <Text style={[s.small, { fontWeight: "600" }]}>{t("deliverables.shareLink")}</Text>
            <Text selectable style={[s.small, { color: colors.primaryStrong }]}>
              {shareUrl}
            </Text>
            <Text style={[s.small, { fontSize: 11 }]}>{t("deliverables.shareReadonlyNote")}</Text>
          </Card>
        )}

        <Card style={{ gap: 8 }}>
          <View style={[s.between, { gap: 8 }]}>
            <SectionHeading title={t("deliverables.contentTitle")} style={{ marginBottom: 0 }} />
            {(item.status === "draft" || item.status === "in_review") && (
              <Button small onPress={() => setEditing((value) => !value)}>
                {editing ? t("deliverables.cancelEdit") : t("deliverables.edit")}
              </Button>
            )}
          </View>
          {editing ? (
            <View style={{ gap: 8 }}>
              <Field
                label={t("deliverables.titleLabel")}
                value={draftTitle}
                onChangeText={setDraftTitle}
              />
              <Field
                label={t("deliverables.contentLabel")}
                value={draftContent}
                onChangeText={setDraftContent}
                multiline
              />
              <Button
                primary
                busy={busy}
                onPress={() =>
                  void run(
                    () =>
                      updateDeliverable(api, item.id, {
                        title: draftTitle,
                        content: draftContent,
                        change_summary: "人工修改",
                      }),
                    t("deliverables.savedVersion"),
                  ).then((next) => {
                    if (!next) return;
                    setEditing(false);
                    setDiff(undefined);
                    onChanged(next);
                  })
                }
              >
                {t("deliverables.saveVersion")}
              </Button>
            </View>
          ) : (
            <Text style={[s.text, { fontSize: 14, lineHeight: 23 }]} selectable>
              {item.content}
            </Text>
          )}
          {!!item.disclaimer && (
            <Text style={[s.small, { fontSize: 11, color: colors.faint }]}>{item.disclaimer}</Text>
          )}
        </Card>

        <Card style={{ gap: 8 }}>
          <SectionHeading title={t("deliverables.numbersTitle")} style={{ marginBottom: 0 }} />
          <Text style={s.small}>{t("deliverables.numbersHint")}</Text>
          {item.numbers.length ? (
            <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
              {item.numbers.map((number) => (
                <Pressable
                  key={number.id}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: number.status !== "unsourced" }}
                  onPress={() =>
                    number.status === "unsourced" ? setResolveTarget(number) : undefined
                  }
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: radius.full,
                    backgroundColor:
                      number.status === "sourced"
                        ? colors.green
                        : number.status === "estimate"
                          ? colors.sky
                          : colors.alertVolume,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600" }}>{number.text}</Text>
                  <Text style={{ fontSize: 10, color: colors.muted }}>
                    {t(NUMBER_KEYS[number.status])}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={s.small}>{t("deliverables.noNumbers")}</Text>
          )}
          {unresolved.length > 0 && (
            <Text style={[s.small, { color: colors.alertVolumeText }]}>
              {t("deliverables.fixNumbersHint", { count: unresolved.length })}
            </Text>
          )}
        </Card>

        <Card style={{ gap: 8 }}>
          <SectionHeading title={t("deliverables.sourcesTitle")} style={{ marginBottom: 0 }} />
          {item.citations.length ? (
            item.citations.map((citation) => (
              <Pressable
                key={citation.id}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(citation.sourceUrl)}
                style={{ gap: 2, paddingVertical: 4 }}
              >
                <View style={[s.row, { gap: 5 }]}>
                  <Link2 size={13} color={colors.primaryStrong} />
                  <Text style={[s.small, { color: colors.primaryStrong, fontWeight: "600" }]}>
                    {citation.numberText}
                  </Text>
                  <ArrowUpRight size={12} color={colors.faint} />
                </View>
                <Text style={[s.small, { fontSize: 11 }]} numberOfLines={2}>
                  {citation.excerpt}
                </Text>
                <Text style={[s.small, { fontSize: 10, color: colors.faint }]}>
                  {t("deliverables.fetchedAt", {
                    date: new Date(citation.fetchedAt).toLocaleString(),
                  })}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={s.small}>{t("deliverables.noCitations")}</Text>
          )}
          {item.sourceLinks.length > 0 && (
            <View style={{ gap: 4 }}>
              <Text style={[s.small, { fontWeight: "600" }]}>{t("deliverables.backlinks")}</Text>
              {item.sourceLinks.map((link) => (
                <Text key={`${link.type}:${link.id}`} style={[s.small, { fontSize: 11 }]}>
                  {link.label ?? link.id}（{link.type}）
                </Text>
              ))}
            </View>
          )}
        </Card>

        <Card style={{ gap: 8 }}>
          <View style={[s.between]}>
            <SectionHeading title={t("deliverables.versionsTitle")} style={{ marginBottom: 0 }} />
            {item.version > 1 && (
              <Button small busy={busy} onPress={() => void compareVersions()}>
                {t("deliverables.compareLast")}
              </Button>
            )}
          </View>
          {[...item.versions]
            .reverse()
            .slice(0, 5)
            .map((version) => (
              <View key={version.id} style={{ gap: 2, paddingVertical: 3 }}>
                <View style={[s.row, { gap: 6 }]}>
                  <Text style={[s.small, { fontWeight: "600" }]}>
                    v{version.version} · {version.author}
                  </Text>
                  <Text style={[s.small, { fontSize: 10, color: colors.faint }]}>
                    {new Date(version.createdAt).toLocaleString()}
                  </Text>
                </View>
                <Text style={[s.small, { fontSize: 11 }]}>{version.summary}</Text>
              </View>
            ))}
          {diff && (
            <View style={{ gap: 3, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
              <Text style={[s.small, { fontWeight: "600" }]}>
                {t("deliverables.diffTitle", {
                  from: diff.fromVersion,
                  to: diff.toVersion,
                })}
              </Text>
              {diff.added.map((line) => (
                <Text key={`a-${line}`} style={{ fontSize: 11, color: colors.primaryStrong }}>
                  + {line}
                </Text>
              ))}
              {diff.removed.map((line) => (
                <Text key={`r-${line}`} style={{ fontSize: 11, color: colors.faint }}>
                  − {line}
                </Text>
              ))}
              {!diff.changed && <Text style={s.small}>{t("deliverables.diffEmpty")}</Text>}
            </View>
          )}
        </Card>

        <Card style={{ gap: 8 }}>
          <SectionHeading title={t("deliverables.complianceTitle")} style={{ marginBottom: 0 }} />
          <CompliancePanel report={report} />
        </Card>

        <Card style={{ gap: 6 }}>
          <SectionHeading title={t("deliverables.auditTitle")} style={{ marginBottom: 0 }} />
          {[...item.audit]
            .reverse()
            .slice(0, 12)
            .map((entry) => (
              <View key={entry.id} style={{ gap: 1, paddingVertical: 3 }}>
                <View style={[s.row, { gap: 6 }]}>
                  <Clock3 size={11} color={colors.faint} />
                  <Text style={[s.small, { fontSize: 11, fontWeight: "600" }]}>
                    {entry.action} · {entry.actor}
                  </Text>
                  <Text style={[s.small, { fontSize: 10, color: colors.faint }]}>
                    {new Date(entry.at).toLocaleString()}
                  </Text>
                </View>
                {!!entry.detail && <Text style={[s.small, { fontSize: 11 }]}>{entry.detail}</Text>}
              </View>
            ))}
        </Card>
      </View>

      {resolveTarget && (
        <ResolutionSheet
          number={resolveTarget}
          busy={busy}
          onClose={() => setResolveTarget(undefined)}
          onResolve={(input) =>
            void run(() => resolveDeliverableNumber(api, item.id, resolveTarget.id, input)).then(
              (next) => {
                if (!next) return;
                setResolveTarget(undefined);
                setDiff(undefined);
                onChanged(next);
              },
            )
          }
        />
      )}

      {sendOpen && (
        <Sheet title={t("deliverables.sendTitle")} onClose={() => setSendOpen(false)} small>
          <View style={{ gap: space.sm }}>
            <Text style={s.small}>{t("deliverables.sendHint")}</Text>
            <Field
              label={t("deliverables.recipient")}
              value={recipient}
              onChangeText={setRecipient}
              placeholder={t("deliverables.recipientPlaceholder")}
            />
            <CompliancePanel report={report} />
            <Button
              primary
              busy={busy}
              disabled={!!report && !report.passed}
              onPress={() =>
                void run(
                  () =>
                    sendDeliverable(api, item.id, {
                      recipient: recipient.trim() || undefined,
                    }),
                  t("deliverables.sent"),
                ).then((next) => {
                  if (!next) return;
                  setSendOpen(false);
                  onChanged(next);
                })
              }
            >
              {t("deliverables.confirmSend")}
            </Button>
          </View>
        </Sheet>
      )}
    </Sheet>
  );
}

function CreateDeliverableSheet({ onClose }: { onClose: () => void }) {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const [kind, setKind] = useState<DeliverableKind>("REPORT");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!title.trim() || !content.trim()) {
      setError(t("deliverables.createRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createDeliverable(api, {
        kind,
        title: title.trim(),
        content: content.trim(),
      });
      notify(t("deliverables.created"));
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("deliverables.createTitle")} onClose={onClose} small>
      <View style={{ gap: space.sm }}>
        <ErrorNotice error={error} />
        <View style={[s.row, { gap: 5, flexWrap: "wrap" }]}>
          {DELIVERABLE_KINDS.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === item }}
              onPress={() => setKind(item)}
              style={{
                paddingHorizontal: 9,
                paddingVertical: 5,
                borderRadius: radius.full,
                backgroundColor: kind === item ? colors.sky : colors.surfaceSoft,
                borderWidth: 1,
                borderColor: kind === item ? colors.accentLine : "transparent",
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: kind === item ? "600" : "500" }}>
                {t(KIND_KEYS[item])}
              </Text>
            </Pressable>
          ))}
        </View>
        <Field
          label={t("deliverables.titleLabel")}
          value={title}
          onChangeText={setTitle}
          placeholder={t("deliverables.titlePlaceholder")}
        />
        <Field
          label={t("deliverables.contentLabel")}
          value={content}
          onChangeText={setContent}
          multiline
          placeholder={t("deliverables.contentPlaceholder")}
        />
        <Button primary busy={busy} onPress={() => void create()}>
          {t("deliverables.create")}
        </Button>
      </View>
    </Sheet>
  );
}

export function DeliverableScreen() {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const state = useDeliverablesState();
  const [filter, setFilter] = useState<DeliverableStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Deliverable>();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState("");
  const compact = width < breakpoints.mobile;

  useEffect(() => {
    void loadDeliverables(api);
  }, [api]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.deliverables.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!needle) return true;
      return `${item.title} ${item.content}`.toLowerCase().includes(needle);
    });
  }, [state.deliverables, filter, query]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: state.deliverables.length };
    for (const status of DELIVERABLE_STATUSES) result[status] = 0;
    for (const item of state.deliverables) result[item.status] += 1;
    return result;
  }, [state.deliverables]);

  async function approve(item: Deliverable) {
    setBusyId(item.id);
    try {
      const next = await approveDeliverable(api, item.id);
      notify(t("deliverables.approved"));
      if (selected?.id === next.id) setSelected(next);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId("");
    }
  }

  const columns = width >= 1120 ? 3 : width >= 720 ? 2 : 1;
  const cardWidth = columns === 3 ? "32%" : columns === 2 ? "48.8%" : "100%";

  return (
    <View style={{ gap: space.md }}>
      <Card style={{ gap: 10 }}>
        <View style={[s.between, { gap: 8, flexWrap: "wrap" }]}>
          <View style={{ gap: 3, flex: 1, minWidth: 220 }}>
            <Text style={[s.text, { fontSize: 16, fontWeight: "600" }]}>
              {t("deliverables.title")}
            </Text>
            <Text style={s.small}>{t("deliverables.subtitle")}</Text>
          </View>
          <Button primary icon={Plus} onPress={() => setCreating(true)}>
            {t("deliverables.create")}
          </Button>
        </View>
        <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("deliverables.search")}
            placeholderTextColor={colors.faint}
            accessibilityLabel={t("deliverables.search")}
            style={[s.input, { flex: 1, minWidth: 180 }]}
          />
        </View>
        <View style={[s.row, { gap: 5, flexWrap: "wrap" }]}>
          {(["all", ...DELIVERABLE_STATUSES] as const).map((status) => {
            const label = status === "all" ? t("deliverables.filterAll") : t(STATUS_KEYS[status]);
            const selectedFilter = filter === status;
            return (
              <Pressable
                key={status}
                accessibilityRole="tab"
                accessibilityState={{ selected: selectedFilter }}
                onPress={() => setFilter(status)}
                style={{
                  minHeight: 34,
                  justifyContent: "center",
                  paddingHorizontal: 10,
                  borderRadius: radius.full,
                  backgroundColor: selectedFilter ? colors.sky : colors.surfaceSoft,
                  borderWidth: 1,
                  borderColor: selectedFilter ? colors.accentLine : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: selectedFilter ? "600" : "500",
                    color: selectedFilter ? colors.primary : colors.muted,
                  }}
                >
                  {label} {counts[status] ?? 0}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <ErrorNotice error={state.error} />
      {state.status === "loading" ? (
        <Text style={s.small}>{t("deliverables.loading")}</Text>
      ) : visible.length ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: compact ? 8 : 12,
            alignItems: "stretch",
          }}
        >
          {visible.map((item) => (
            <View key={item.id} style={{ width: cardWidth }}>
              <DeliverableCard
                item={item}
                busy={busyId === item.id}
                onOpen={() => setSelected(item)}
                onApprove={() => void approve(item)}
              />
            </View>
          ))}
        </View>
      ) : (
        <Card>
          <Empty
            icon={FileText}
            title={t("deliverables.emptyTitle")}
            detail={t("deliverables.emptyDetail")}
          >
            <Button primary style={{ marginTop: 8 }} onPress={() => setCreating(true)}>
              {t("deliverables.create")}
            </Button>
          </Empty>
        </Card>
      )}

      {selected && (
        <DeliverableDetail
          item={state.deliverables.find((item) => item.id === selected.id) ?? selected}
          onClose={() => setSelected(undefined)}
          onChanged={(next) => setSelected(next)}
        />
      )}
      {creating && <CreateDeliverableSheet onClose={() => setCreating(false)} />}
    </View>
  );
}
