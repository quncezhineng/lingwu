import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { ActionProposal, Artifact } from "../../../packages/domain/src";
import type { AgentTask } from "../../../packages/domain/src/agent";
import { activeLocaleTag, localizeAgentName, statusLabel, useTranslation } from "./i18n";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleX,
  Mail,
  ShieldAlert,
} from "./icons";
import { Button, colors, ErrorNotice } from "./ui";

interface PreviewRow {
  label: string;
  value: string;
}

function textOf(value: unknown): string {
  return typeof value === "string"
    ? value
    : value === undefined || value === null
      ? ""
      : String(value);
}

function listOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => textOf(item)).filter((item) => item.length > 0)
    : [];
}

function dateTimeOf(value: unknown, allDay: boolean, timeZone: string): string {
  const raw = textOf(value);
  if (!raw || allDay) return raw;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat(activeLocaleTag(), {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timeZone || undefined,
    }).format(date);
  } catch {
    return raw;
  }
}

function summaryOf(action: ActionProposal, t: ReturnType<typeof useTranslation>["t"]): string {
  const data = action.data;
  if (action.kind === "email.send") {
    const subject = textOf(data.subject);
    return subject
      ? t("tools.approvalEmailSummary", { subject })
      : t("tools.approvalEmailSummaryGeneric");
  }
  const title = textOf(data.title);
  if (action.kind === "calendar.delete")
    return title
      ? t("tools.approvalDeleteEventSummary", { title })
      : t("tools.approvalDeleteEventGeneric");
  if (action.kind === "calendar.update")
    return title
      ? t("tools.approvalUpdateEventSummary", { title })
      : t("tools.approvalUpdateEventGeneric");
  return title
    ? t("tools.approvalCreateEventSummary", { title })
    : t("tools.approvalCreateEventGeneric");
}

function destinationOf(
  action: ActionProposal,
  t: ReturnType<typeof useTranslation>["t"],
): string | null {
  if (action.kind === "email.send") {
    const recipients = listOf(action.data.to);
    return recipients.length
      ? t("tools.approvalRecipients", { recipients: recipients.join(", ") })
      : null;
  }
  return t("tools.approvalCalendarDestination", {
    calendar: textOf(action.data.calendarId) || t("tools.approvalPrimaryCalendar"),
  });
}

function previewRows(
  action: ActionProposal,
  files: Artifact[],
  t: ReturnType<typeof useTranslation>["t"],
): PreviewRow[] {
  const data = action.data;
  if (action.kind === "email.send") {
    const to = listOf(data.to);
    const cc = listOf(data.cc);
    const bcc = listOf(data.bcc);
    const attachmentIds = listOf(data.attachmentIds);
    return [
      { label: t("details.to"), value: to.join(", ") || t("details.none") },
      ...(cc.length ? [{ label: t("details.cc"), value: cc.join(", ") }] : []),
      ...(bcc.length ? [{ label: t("details.bcc"), value: bcc.join(", ") }] : []),
      { label: t("details.subject"), value: textOf(data.subject) },
      ...(attachmentIds.length
        ? [
            {
              label: t("details.attachments"),
              value: attachmentIds
                .map((id) => files.find((file) => file.id === id)?.name || id)
                .join(", "),
            },
          ]
        : []),
      { label: t("details.message"), value: textOf(data.body) },
    ];
  }

  const title = textOf(data.title);
  const calendar = textOf(data.calendarId) || t("tools.approvalPrimaryCalendar");
  if (action.kind === "calendar.delete") {
    return [
      { label: t("details.eventLabel"), value: title },
      { label: t("tools.approvalCalendar"), value: calendar },
    ];
  }
  const allDay = data.allDay === true;
  const timeZone = textOf(data.timeZone);
  const attendees = listOf(data.attendees);
  return [
    { label: t("details.eventLabel"), value: title },
    { label: t("details.starts"), value: dateTimeOf(data.start, allDay, timeZone) },
    { label: t("details.ends"), value: dateTimeOf(data.end, allDay, timeZone) },
    ...(allDay ? [] : [{ label: t("details.timeZone"), value: timeZone }]),
    { label: t("details.locationLabel"), value: textOf(data.location) || t("details.none") },
    {
      label: t("details.attendees"),
      value: attendees.length ? attendees.join(", ") : t("details.justYou"),
    },
    ...(textOf(data.description)
      ? [{ label: t("details.notes"), value: textOf(data.description) }]
      : []),
    { label: t("tools.approvalCalendar"), value: calendar },
  ];
}

function statusText(
  status: ActionProposal["status"],
  t: ReturnType<typeof useTranslation>["t"],
): string {
  switch (status) {
    case "executing":
      return t("tools.approvalExecuting");
    case "succeeded":
      return t("tools.approvalSucceeded");
    case "failed":
      return t("tools.approvalFailed");
    case "outcome_unknown":
      return t("tools.approvalOutcomeUnknown");
    case "denied":
      return t("tools.approvalDenied");
    case "cancelled":
      return t("tools.approvalCancelled");
    case "expired":
      return t("tools.approvalExpired");
    default:
      return statusLabel(status);
  }
}

function requestTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(activeLocaleTag(), {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

export function ApprovalCard({
  action: incoming,
  task,
  agentName,
  agentNameCustomized,
  files = [],
  onDecide,
  onOpenDetails,
}: {
  action: ActionProposal;
  task?: AgentTask;
  agentName?: string;
  agentNameCustomized?: boolean;
  files?: Artifact[];
  onDecide: (action: ActionProposal, decision: "approve" | "deny") => Promise<ActionProposal>;
  onOpenDetails: (action: ActionProposal) => void;
}) {
  const { t } = useTranslation();
  const [local, setLocal] = useState<ActionProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  // Keep the decision response while the workspace snapshot is still stale, but let a later
  // server update take over. Otherwise an "executing" local copy would never advance to
  // "succeeded" after the background worker finishes.
  const localIsAhead =
    local?.id === incoming.id &&
    local.status !== "awaiting_review" &&
    incoming.status === "awaiting_review";
  const action = localIsAhead ? local : incoming;
  const pending = action.status === "awaiting_review";
  const destructive = action.kind === "calendar.delete";
  const sensitive = destructive || action.kind === "email.send";
  const summary = summaryOf(action, t);
  const destination = destinationOf(action, t);
  const rows = previewRows(action, files, t);
  const canExpand =
    rows.length > 4 ||
    rows.some((row) => row.value.length > 180 || row.value.split("\n").length > 4);
  const Icon = action.kind === "email.send" ? Mail : CalendarDays;
  const StatusIcon = action.status === "succeeded" ? Check : CircleX;
  const name = localizeAgentName(agentName, agentNameCustomized);

  async function decide(decision: "approve" | "deny") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await onDecide(action, decision);
      setLocal(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  // 决议后折叠为一行结果，不再占用整卡（预览与按钮只在 pending 时需要）。
  if (!pending) {
    return (
      <View style={styles.wrap}>
        <View style={styles.resolvedCard}>
          {action.status === "executing" ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : (
            <StatusIcon
              size={15}
              color={action.status === "succeeded" ? colors.success : colors.muted}
            />
          )}
          <Text numberOfLines={1} style={styles.resolvedSummary}>
            {summary}
          </Text>
          <Text
            style={[styles.statusText, action.status === "succeeded" && styles.statusSucceeded]}
          >
            {statusText(action.status, t)}
          </Text>
          <Text style={styles.time}>{requestTime(action.createdAt)}</Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onOpenDetails(action)}
            style={({ pressed }) => [pressed && styles.detailsPressed, { borderRadius: 7 }]}
          >
            <Text style={styles.detailsLink}>{t("tools.approvalDetailsShort")}</Text>
          </Pressable>
        </View>
        {!!(error || action.error) && <ErrorNotice error={error || action.error} />}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, pending && sensitive && styles.sensitiveCard]}>
        <View style={styles.header}>
          <View style={[styles.iconBox, sensitive && pending && styles.sensitiveIconBox]}>
            {sensitive && pending ? (
              <ShieldAlert size={22} color={colors.danger} />
            ) : (
              <Icon size={22} color={colors.primary} />
            )}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>{t("tools.approvalWantsTo", { name })}</Text>
            <Text style={styles.summary}>{summary}</Text>
            {!!destination && (
              <View style={styles.destination}>
                {action.kind === "email.send" ? (
                  <Mail size={13} color={colors.muted} />
                ) : (
                  <CalendarDays size={13} color={colors.muted} />
                )}
                <Text numberOfLines={1} style={styles.destinationText}>
                  {destination}
                </Text>
              </View>
            )}
            {!!task?.prompt && (
              <Text numberOfLines={2} style={styles.purpose}>
                {task.prompt}
              </Text>
            )}
          </View>
        </View>

        {pending && sensitive && (
          <View style={styles.warning}>
            <AlertTriangle size={13} color={colors.danger} />
            <Text style={styles.warningText}>
              {destructive ? t("tools.approvalDeleteWarning") : t("tools.approvalEmailWarning")}
            </Text>
          </View>
        )}

        <View style={styles.previewOuter}>
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>{t("tools.approvalExactContent")}</Text>
            <View style={!expanded && canExpand ? styles.previewCollapsed : undefined}>
              {rows.map((row) => (
                <View key={row.label} style={styles.previewRow}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text selectable numberOfLines={expanded ? undefined : 4} style={styles.rowValue}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          {canExpand && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((value) => !value)}
              hitSlop={8}
              // 展开/收起是文字按钮，按压态用 overlay1，圆角 10。
              style={({ pressed }) => [styles.more, pressed && styles.morePressed]}
            >
              {expanded ? (
                <ChevronDown size={13} color={colors.muted} />
              ) : (
                <ChevronRight size={13} color={colors.muted} />
              )}
              <Text style={styles.moreText}>
                {expanded ? t("tools.approvalShowLess") : t("tools.approvalShowAll")}
              </Text>
            </Pressable>
          )}
        </View>

        {pending ? (
          <View style={styles.actions}>
            <Button
              primary
              busy={busy}
              onPress={() => void decide("approve")}
              style={styles.fullButton}
            >
              {t("tools.approvalAllowOnce")}
            </Button>
            <Button disabled={busy} onPress={() => void decide("deny")} style={styles.fullButton}>
              {t("tools.approvalDeny")}
            </Button>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onOpenDetails(action)}
              style={({ pressed }) => [styles.detailsButton, pressed && styles.detailsPressed]}
            >
              <Text style={styles.detailsText}>{t("tools.approvalViewDetails")}</Text>
            </Pressable>
            <Text style={styles.onceNote}>{t("tools.approvalOneAtATime")}</Text>
          </View>
        ) : (
          <View style={styles.statusRow}>
            {action.status === "executing" ? (
              <ActivityIndicator size="small" color={colors.muted} />
            ) : (
              <StatusIcon
                size={15}
                color={action.status === "succeeded" ? colors.success : colors.muted}
              />
            )}
            <Text
              style={[styles.statusText, action.status === "succeeded" && styles.statusSucceeded]}
            >
              {statusText(action.status, t)}
            </Text>
            <Text style={styles.time}>{requestTime(action.createdAt)}</Text>
          </View>
        )}

        {!!(error || action.error) && (
          <View style={styles.errorWrap}>
            <ErrorNotice error={error || action.error} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-start", width: "100%", maxWidth: 600 },
  /** 审批卡：白底 + 1px 描边 + 11px 圆角，靠边框分层而不是阴影。 */
  card: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 11,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sensitiveCard: { borderColor: colors.errorSoft },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    paddingBottom: 10,
  },
  iconBox: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    // 图标底座走中性面（surface），敏感操作才切到语义浅底。
    backgroundColor: colors.surface,
  },
  sensitiveIconBox: { backgroundColor: colors.errorSoft },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: "500" },
  summary: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  destination: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  destinationText: { flexShrink: 1, color: colors.muted, fontSize: 13, lineHeight: 18 },
  purpose: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  warningText: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 17 },
  previewOuter: { paddingHorizontal: 14, paddingBottom: 10 },
  /** 明细区：次级面填充 + 10px 圆角，与主卡形成面阶梯。 */
  preview: {
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewLabel: { color: colors.muted, fontSize: 11, fontWeight: "600", marginBottom: 5 },
  previewCollapsed: { maxHeight: 180, overflow: "hidden" },
  previewRow: { paddingVertical: 4, gap: 1 },
  rowLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  // 明细值用等宽数字对齐（tabular-nums），避免逐行参差。
  rowValue: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    fontVariant: ["tabular-nums"] as const,
  },
  more: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  morePressed: { backgroundColor: colors.overlay1 },
  moreText: { color: colors.text, fontSize: 12, fontWeight: "500" },
  actions: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 14, gap: 8 },
  fullButton: { width: "100%", minHeight: 38, borderRadius: 999 },
  detailsButton: {
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  detailsPressed: { backgroundColor: colors.overlay1 },
  // 链接型强调文字统一用品牌深紫（colors.primary）。
  detailsText: { color: colors.primaryStrong, fontSize: 12, fontWeight: "500" },
  onceNote: { color: colors.faint, fontSize: 12, lineHeight: 16, textAlign: "center" },
  /** 决议后的一行结果：只保留标题、状态与时间。 */
  resolvedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  resolvedSummary: { flex: 1, color: colors.muted, fontSize: 13 },
  /** 折叠态的「详情」文字链。 */
  detailsLink: { color: colors.link, fontSize: 11, lineHeight: 16 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  statusText: { color: colors.muted, fontSize: 13, fontWeight: "500" },
  statusSucceeded: { color: colors.success },
  time: {
    marginLeft: "auto",
    color: colors.muted,
    fontSize: 12,
    fontVariant: ["tabular-nums"] as const,
  },
  errorWrap: { paddingHorizontal: 14, paddingBottom: 12 },
});
