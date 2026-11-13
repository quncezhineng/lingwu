import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native";
import type {
  Artifact,
  BrowserSession,
  CalendarEvent,
  EmailDraft,
} from "../../../packages/domain/src";
import { useAgentSpace } from "./agent-space";
import { ArtifactCard } from "./agent-ui";
import { useAgentWorkspace } from "./agent-workspace";
import { Text, TextInput } from "./app-text";
import { MarketBriefingCard } from "./briefing-card";
import { browserAddress } from "./browser-address";
import { localDateTime, startOfZonedDay, zonedInstant } from "./date-time";
import { DeliverableScreen } from "./deliverable-screen";
import { loadDeliverables, unresolvedNumbers, useDeliverablesState } from "./deliverables";
import { saveRemoteFile, shareRemoteFile } from "./file-export";
import { fileBadge, fileExtension, fileKind } from "./file-kind";
import {
  buildFileLibrary,
  type FileFormatFilter,
  type FileSourceFilter,
  fileSourceBucket,
  fileSourceLabel,
  filterArtifacts,
  filterFileLibrary,
  groupArtifactsByAgent,
} from "./file-library";
import { pickAndUploadFile } from "./file-upload";
import { activeLocaleTag, useTranslation } from "./i18n";
import { runtimeLabel, statusLabel } from "./i18n/translate";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Cpu,
  FileText,
  Folder,
  Globe2,
  Inbox,
  Link2,
  Mail,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
} from "./icons";
import { InsightCard } from "./insight-card";
import { workbenchInsightView } from "./insight-view";
import { loadMonitor, requestMonitorTab } from "./monitor";
import { MonitorTodayCard } from "./monitor-screen";
import {
  type InvestmentNote,
  loadNotes,
  setNotesIntent,
  type thesisReviewPriority,
  thesisReviewQueue,
  useNotesState,
} from "./notes";
import { NotesScreen } from "./notes-screen";
import { PageHeader } from "./page-header";
import { toggleSavedInsight, useSavedInsightIds } from "./saved-insights";
import { StatusBadge, type StatusTone } from "./status-badge";
import { breakpoints, fonts, radius, space } from "./theme";
import {
  Button,
  Card,
  Chip,
  colors,
  dateLabel,
  Empty,
  ErrorNotice,
  IconButton,
  LinkRow,
  Mascot,
  relativeDate,
  resultSummary,
  SectionHeading,
  Sheet,
  s,
  serviceBrands,
  timeLabel,
} from "./ui";
import { useWorkspace } from "./workspace";

/**
 * 首页 Today 里暂不展示的版块。
 * 日历版块已恢复，目前只隐藏邮件；只隐藏渲染入口，页面、统计与数据逻辑全部保留；
 * 需要恢复时清空这个集合即可。
 */
const HIDDEN_TODAY_SECTIONS = new Set<string>(["mail", "calendar"]);

function todayDate() {
  return localDateTime(new Date().toISOString(), Intl.DateTimeFormat().resolvedOptions().timeZone)
    .date;
}
function eventDate(event: CalendarEvent) {
  return event.allDay ? event.start : localDateTime(event.start, event.timeZone).date;
}
export function TodayScreen() {
  const { workspace: w, api, navigate, open, prefillPrompt } = useWorkspace();
  const { t } = useTranslation();
  const wide = useWindowDimensions().width > 1180;
  const pending = w.actions.filter((a) => a.status === "awaiting_review");
  const notesState = useNotesState();
  const deliverableState = useDeliverablesState();
  const activeTheses = useMemo(
    () => notesState.notes.filter((note) => note.type === "THESIS" && note.status === "ACTIVE"),
    [notesState.notes],
  );
  const reviewQueue = useMemo(() => thesisReviewQueue(notesState.notes), [notesState.notes]);
  const reviewDeliverables = useMemo(
    () =>
      deliverableState.deliverables.filter(
        (item) => item.status === "in_review" || item.status === "draft",
      ),
    [deliverableState.deliverables],
  );
  useEffect(() => {
    void loadNotes(api);
    void loadMonitor(api);
    void loadDeliverables(api);
  }, [api]);
  const today = todayDate();
  const events = w.events
    .filter((e) => eventDate(e) === today)
    .sort((a, b) => a.start.localeCompare(b.start));
  return (
    <View style={{ gap: 20 }}>
      <View
        style={[
          {
            backgroundColor: colors.paper,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 14,
            padding: 20,
            minHeight: 196,
            overflow: "hidden",
          },
          s.row,
        ]}
      >
        <View style={{ flex: 1, gap: 12, zIndex: 1 }}>
          <View style={[s.row, { gap: 7 }]}>
            <Sparkles size={13} color={colors.primary} />
            <Text
              style={[s.label, { color: colors.primaryStrong, fontSize: 11, letterSpacing: 1.2 }]}
            >
              {t("screens.todayEyebrow")}
            </Text>
          </View>
          <Text
            style={{
              fontSize: wide ? 28 : 24,
              lineHeight: wide ? 34 : 30,
              letterSpacing: 0.5,
              fontWeight: "600",
              color: colors.text,
            }}
          >
            {t("screens.todayHeroTitle")}
          </Text>
          <Text
            style={[s.muted, { maxWidth: 420, color: colors.faint, fontSize: 13, lineHeight: 20 }]}
          >
            {t("screens.todayThesisSummary", {
              review: reviewQueue.length,
              approvals: pending.length,
            })}
          </Text>
          <Button
            onPress={() => prefillPrompt(t("screens.todayPlanDayPrompt"))}
            icon={Sparkles}
            primary
            style={{ alignSelf: "flex-start", marginTop: 5 }}
          >
            {t("screens.todayPlanDay")}
          </Button>
        </View>
        {wide && (
          <View style={{ width: 220, height: 210, alignItems: "center", justifyContent: "center" }}>
            <View
              style={{
                position: "absolute",
                width: 190,
                height: 190,
                borderRadius: 999,
                backgroundColor: colors.surface,
              }}
            />
            <View
              style={{
                position: "absolute",
                width: 145,
                height: 145,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.lineStrong,
              }}
            />
            <Mascot size={94} />
            <View
              style={[
                s.row,
                {
                  position: "absolute",
                  top: 17,
                  left: -19,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  gap: 7,
                  backgroundColor: colors.paper,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 999,
                  transform: [{ rotate: "-7deg" }],
                },
              ]}
            >
              <Check size={14} color={colors.success} />
              <Text style={s.small}>{t("screens.todayLighterDay")}</Text>
            </View>
            <View
              style={[
                s.row,
                {
                  position: "absolute",
                  bottom: 18,
                  right: -8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  gap: 8,
                  backgroundColor: colors.paper,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 999,
                  transform: [{ rotate: "5deg" }],
                },
              ]}
            >
              <CalendarDays size={17} color={colors.primary} />
              <Text style={s.small}>{t("screens.todayEverythingTogether")}</Text>
            </View>
          </View>
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 13, flexWrap: "wrap" }}>
        {[
          {
            label: t("screens.todayStatReviewLabel"),
            value: reviewQueue.length,
            note: t("screens.todayStatReviewNote"),
            icon: Clock3,
            section: "notes" as const,
          },
          {
            label: t("screens.todayStatThesisLabel"),
            value: activeTheses.length,
            note: t("screens.todayStatThesisNote"),
            icon: Target,
            section: "notes" as const,
          },
          {
            label: t("screens.todayStatPendingLabel"),
            value: pending.length,
            note: t("screens.todayStatPendingNote"),
            icon: ShieldCheck,
            section: "activity" as const,
          },
        ]
          .filter((item) => !HIDDEN_TODAY_SECTIONS.has(item.section))
          .map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              onPress={() => navigate(item.section)}
              // 看板小卡片：白底 + 1px 描边分层（不靠阴影），按压态用 overlay1
              style={({ pressed }) => [
                s.card,
                { flex: 1, minWidth: 190, padding: 14, height: 112 },
                pressed && { backgroundColor: colors.overlay1 },
              ]}
            >
              <View style={s.between}>
                {/* 表头式小标签：s.label 风格（11px、加粗、letterSpacing） */}
                <Text style={[s.label, { fontSize: 11, letterSpacing: 1 }]}>{item.label}</Text>
                {/* 图标底座统一用 surface，品牌浅底只留给小面积状态 Chip */}
                <View style={[s.iconBox, { width: 34, height: 34, borderRadius: 10 }]}>
                  <item.icon size={15} color={colors.primary} />
                </View>
              </View>
              <Text
                style={[
                  s.metric,
                  { fontSize: 24, color: colors.text, letterSpacing: 0.5, marginTop: 2 },
                ]}
              >
                {String(item.value).padStart(2, "0")}
              </Text>
              <Text style={[s.small, { marginTop: 3 }]}>{item.note}</Text>
            </Pressable>
          ))}
      </View>
      <Card>
        <SectionHeading
          title={t("screens.todayDeliverablesHeading")}
          action={t("screens.todayDeliverablesAction")}
          onPress={() => navigate("deliverables")}
        />
        {reviewDeliverables.length ? (
          reviewDeliverables.slice(0, 3).map((item) => {
            const unsourced = unresolvedNumbers(item).length;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => navigate("deliverables")}
                style={({ pressed }) => [
                  s.row,
                  {
                    gap: 10,
                    paddingVertical: 10,
                    borderTopWidth: 1,
                    borderTopColor: colors.line,
                    borderRadius: 10,
                  },
                  pressed && { backgroundColor: colors.overlay1 },
                ]}
              >
                <View style={[s.iconBox, { width: 30, height: 30 }]}>
                  <FileText size={14} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.text} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={s.small}>
                    {item.status === "draft"
                      ? t("screens.todayDeliverableDraft")
                      : unsourced
                        ? t("screens.todayDeliverableUnsourced", { count: unsourced })
                        : t("screens.todayDeliverableReady")}
                  </Text>
                </View>
                <ChevronRight size={14} color={colors.faint} />
              </Pressable>
            );
          })
        ) : (
          <Text style={[s.small, { paddingTop: 8 }]}>{t("screens.todayDeliverablesEmpty")}</Text>
        )}
      </Card>
      <MarketBriefingCard />
      <ThesisReviewCard
        items={reviewQueue}
        activeCount={activeTheses.length}
        onOpenAll={() => {
          setNotesIntent({ tab: "theses" });
          navigate("notes");
        }}
      />
      <MonitorTodayCard
        onOpenAll={() => {
          requestMonitorTab();
          navigate("activity");
        }}
      />
      {(!HIDDEN_TODAY_SECTIONS.has("calendar") || !HIDDEN_TODAY_SECTIONS.has("mail")) && (
        <View style={{ flexDirection: wide ? "row" : "column", gap: 16 }}>
          {!HIDDEN_TODAY_SECTIONS.has("calendar") && (
            <Card style={{ flex: 1 }}>
              <SectionHeading
                title={t("screens.todayCalendarHeading")}
                action={t("screens.todayCalendarAction")}
                onPress={() => navigate("calendar")}
              />
              {events.length ? (
                events.slice(0, 3).map((e) => <AgendaRow key={e.id} event={e} />)
              ) : (
                <Empty
                  icon={CalendarDays}
                  title={t("screens.todayCalendarEmptyTitle")}
                  detail={t("screens.todayCalendarEmptyDetail")}
                />
              )}
              <Pressable
                onPress={() => open({ type: "event" })}
                style={({ pressed }) => [
                  s.row,
                  {
                    gap: 8,
                    paddingTop: 12,
                    marginTop: 8,
                    borderTopWidth: 1,
                    borderTopColor: colors.line,
                    borderRadius: 10,
                  },
                  pressed && { backgroundColor: colors.overlay1 },
                ]}
              >
                <Plus size={15} color={colors.muted} />
                <Text style={s.small}>{t("screens.todayMakeTime")}</Text>
              </Pressable>
            </Card>
          )}
          {!HIDDEN_TODAY_SECTIONS.has("mail") && (
            <Card style={{ flex: 1 }}>
              <SectionHeading
                title={t("screens.todayInboxHeading")}
                action={t("screens.todayInboxAction")}
                onPress={() => navigate("mail")}
              />
              {w.mail.length ? (
                w.mail.slice(0, 3).map((m, i) => (
                  <Pressable
                    key={m.id}
                    onPress={() => open({ type: "mail", mail: m })}
                    // 列表行：行圆角 10 + 1px 分隔线，按压态用 overlay1
                    style={({ pressed }) => [
                      s.row,
                      {
                        gap: 10,
                        paddingVertical: 10,
                        borderTopWidth: i ? 1 : 0,
                        borderTopColor: colors.line,
                        borderRadius: 10,
                      },
                      pressed && { backgroundColor: colors.overlay1 },
                    ]}
                  >
                    <Avatar name={m.sender} index={i} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={s.between}>
                        <Text style={[s.text, { fontSize: 12, fontWeight: "600" }]}>
                          {m.sender}
                        </Text>
                        <Text style={[s.small, { fontSize: 10 }, s.metric]}>
                          {timeLabel(m.date)}
                        </Text>
                      </View>
                      <Text numberOfLines={1} style={[s.text, { fontSize: 12, lineHeight: 18 }]}>
                        {m.subject}
                      </Text>
                      <Text numberOfLines={1} style={[s.small, { fontSize: 11 }]}>
                        {m.body.replace(/\n/g, " ")}
                      </Text>
                    </View>
                    {m.unread && (
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 4,
                          backgroundColor: colors.primary,
                        }}
                      />
                    )}
                  </Pressable>
                ))
              ) : (
                <Empty
                  icon={Inbox}
                  title={t("screens.todayInboxEmptyTitle")}
                  detail={t("screens.todayInboxEmptyDetail")}
                />
              )}
            </Card>
          )}
        </View>
      )}
      <View style={{ flexDirection: wide ? "row" : "column", gap: 16 }}>
        <Card style={{ flex: 1 }}>
          <SectionHeading title={t("screens.todayHelpHeading")} />
          <Text style={[s.muted, { marginBottom: 12, fontSize: 13, lineHeight: 20 }]}>
            {t("screens.todayHelpSubtitle")}
          </Text>
          {[
            t("screens.todayPromptAttention"),
            t("screens.todayPromptInbox"),
            t("screens.todayPromptDocuments"),
          ].map((prompt) => (
            <Pressable
              key={prompt}
              onPress={() => prefillPrompt(prompt)}
              style={({ pressed }) => [
                s.between,
                {
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                  paddingVertical: 10,
                  borderRadius: 10,
                },
                pressed && { backgroundColor: colors.overlay1 },
              ]}
            >
              <Text style={[s.text, { fontSize: 12 }]}>{prompt}</Text>
              <ArrowUpRight size={15} color={colors.muted} />
            </Pressable>
          ))}
        </Card>
        <Card style={{ flex: 1 }}>
          <SectionHeading
            title={
              pending.length ? t("screens.todayReviewHeading") : t("screens.todayActivityHeading")
            }
            action={t("screens.todayViewAll")}
            onPress={() => navigate("activity")}
          />
          {pending.length
            ? pending.slice(0, 3).map((a) => (
                <LinkRow
                  key={a.id}
                  title={runtimeLabel(a.title)}
                  detail={t("screens.todayReviewDetail")}
                  onPress={() => open({ type: "review", action: a })}
                  icon={ShieldCheck}
                  // 图标底座回到中性面 surface，品牌浅底只用于小面积状态 Chip
                  tint={colors.surface}
                />
              ))
            : w.activity.slice(0, 3).map((a) => (
                <View key={a.id} style={[s.row, { gap: 12, paddingVertical: 10 }]}>
                  <View
                    style={[
                      s.iconBox,
                      { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.green },
                    ]}
                  >
                    <Check size={14} color={colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.text, { fontSize: 12 }]}>{runtimeLabel(a.title)}</Text>
                    <Text style={s.small}>{relativeDate(a.date)}</Text>
                  </View>
                </View>
              ))}
          {!pending.length && !w.activity.length && (
            <Text style={s.muted}>{t("screens.todayWorkspaceReady")}</Text>
          )}
        </Card>
      </View>
    </View>
  );
}

/** 今天递上来的不是「全部论点」，而是需要动作的那几条。 */
function ThesisReviewCard({
  items,
  activeCount,
  onOpenAll,
}: {
  items: { note: InvestmentNote; priority: ReturnType<typeof thesisReviewPriority> }[];
  activeCount: number;
  onOpenAll: () => void;
}) {
  const { t } = useTranslation();
  const priorityLabel: Record<ReturnType<typeof thesisReviewPriority>, string> = {
    confirm: t("screens.todayThesisConfirm"),
    overdue: t("screens.todayThesisOverdue"),
    due_soon: t("screens.todayThesisDueSoon"),
    later: "",
  };
  return (
    <Card>
      <SectionHeading
        title={t("screens.todayThesisHeading")}
        action={t("screens.todayThesisAction")}
        onPress={onOpenAll}
      />
      {items.length ? (
        items.slice(0, 4).map(({ note, priority }, index) => (
          <Pressable
            key={note.id}
            accessibilityRole="button"
            onPress={onOpenAll}
            style={({ pressed }) => [
              s.row,
              {
                gap: 12,
                paddingVertical: 10,
                borderTopWidth: index ? 1 : 0,
                borderTopColor: colors.line,
                borderRadius: 10,
              },
              pressed && { backgroundColor: colors.overlay1 },
            ]}
          >
            <View style={[s.iconBox, { width: 34, height: 34, borderRadius: 10 }]}>
              <Target size={15} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={s.between}>
                <Text style={[s.text, { fontSize: 12, fontWeight: "600" }]}>{note.symbolCode}</Text>
                <Chip>{priorityLabel[priority]}</Chip>
              </View>
              <Text numberOfLines={2} style={[s.small, { fontSize: 12, lineHeight: 18 }]}>
                {note.title ?? note.content}
              </Text>
              {!!note.horizon && (
                <Text style={[s.small, { color: colors.faint, fontSize: 11 }]}>
                  {t("screens.todayThesisHorizon", { date: note.horizon.to })}
                </Text>
              )}
            </View>
          </Pressable>
        ))
      ) : (
        <Empty
          icon={Target}
          title={t("screens.todayThesisEmptyTitle")}
          detail={t("screens.todayThesisEmptyDetail", { count: activeCount })}
        />
      )}
    </Card>
  );
}

function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return (
    <View
      style={{
        width: 35,
        height: 35,
        borderRadius: 10,
        backgroundColor: [colors.surface, colors.tertiary, colors.green, colors.orange][index % 4],
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: "500" }}>
        {name
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")}
      </Text>
    </View>
  );
}
export function AgendaRow({
  event: e,
  neighbors,
}: {
  event: CalendarEvent;
  neighbors?: CalendarEvent[];
}) {
  const { open } = useWorkspace();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => open({ type: "event", event: e, neighbors })}
      // 列表行：行圆角 10，按压态用 overlay1
      style={({ pressed }) => [
        s.row,
        { gap: 12, paddingVertical: 10, borderRadius: 10 },
        pressed && { backgroundColor: colors.overlay1 },
      ]}
    >
      <View style={{ width: 60 }}>
        <Text style={[s.text, { fontSize: 11 }, s.metric]}>
          {e.allDay ? t("screens.agendaAllDay") : timeLabel(e.start, e.timeZone)}
        </Text>
        {!e.allDay && (
          <Text style={[s.small, { fontSize: 10 }, s.metric]}>{timeLabel(e.end, e.timeZone)}</Text>
        )}
      </View>
      <View
        style={{
          width: 3,
          height: 36,
          borderRadius: 4,
          backgroundColor: colors.lineStrong,
        }}
      />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[s.text, { fontSize: 13, fontWeight: "500" }]}>{e.title}</Text>
        <Text numberOfLines={1} style={[s.small, { fontSize: 11 }]}>
          {e.location ||
            (e.attendees.length
              ? t("screens.agendaAttendees", { count: e.attendees.length })
              : t("screens.agendaTimeForYou"))}
        </Text>
      </View>
      <ChevronRight size={14} color={colors.muted} />
    </Pressable>
  );
}
export function MailScreen() {
  const { workspace: w, api, open } = useWorkspace();
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [drafts, setDrafts] = useState<(EmailDraft & { id: string; createdAt: string })[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    void api
      .request<(EmailDraft & { id: string; createdAt: string })[]>("/api/drafts")
      .then((next) => {
        if (active) setDrafts(next);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [api, w]);
  const items = w.mail.filter(
    (m) =>
      (tab !== "unread" || m.unread) &&
      `${m.sender} ${m.subject} ${m.body}`.toLowerCase().includes(query.toLowerCase()),
  );
  const filteredDrafts = drafts.filter((d) =>
    `${d.to.join(" ")} ${d.subject} ${d.body}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <View style={{ gap: 20 }}>
      <View style={[s.between, { gap: 12, flexWrap: "wrap" }]}>
        <View
          style={[
            s.row,
            {
              gap: 9,
              flex: 1,
              minWidth: 200,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 10,
              paddingHorizontal: 12,
            },
          ]}
        >
          <Search size={16} color={colors.muted} />
          <TextInput
            accessibilityLabel={t("screens.mailSearchLabel")}
            placeholder={t("screens.mailSearchPlaceholder")}
            placeholderTextColor={colors.faint}
            value={query}
            onChangeText={setQuery}
            style={{ flex: 1, paddingVertical: 11, fontSize: 13, color: colors.text }}
          />
        </View>
        <Button onPress={() => open({ type: "email" })} primary icon={Plus}>
          {t("screens.mailCompose")}
        </Button>
      </View>
      <ErrorNotice error={error} />
      <Card>
        <View style={[s.row, { gap: 10, marginBottom: 15, flexWrap: "wrap" }]}>
          <Button small primary={tab === "all"} onPress={() => setTab("all")}>
            {t("screens.mailTabAll")}
          </Button>
          <Button small primary={tab === "unread"} onPress={() => setTab("unread")}>
            {t("screens.mailTabUnread", { count: w.mail.filter((m) => m.unread).length })}
          </Button>
          <Button small primary={tab === "drafts"} onPress={() => setTab("drafts")}>
            {t("screens.mailTabDrafts", { count: drafts.length })}
          </Button>
        </View>
        {tab === "drafts" ? (
          filteredDrafts.length ? (
            filteredDrafts.map((d) => (
              <LinkRow
                key={d.id}
                icon={Mail}
                title={d.subject}
                detail={t("screens.mailDraftTo", {
                  to: d.to.join(", "),
                  date: dateLabel(d.createdAt),
                })}
                onPress={() => open({ type: "email", draft: d })}
              />
            ))
          ) : (
            <Empty
              icon={Mail}
              title={t("screens.mailDraftsEmptyTitle")}
              detail={t("screens.mailDraftsEmptyDetail")}
            />
          )
        ) : items.length ? (
          items.map((m, i) => (
            <Pressable
              key={m.id}
              onPress={() => open({ type: "mail", mail: m })}
              // 列表行：行圆角 10 + 1px 分隔线，按压态用 overlay1
              style={({ pressed }) => [
                s.row,
                {
                  gap: 12,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                  borderRadius: 10,
                },
                pressed && { backgroundColor: colors.overlay1 },
              ]}
            >
              <Avatar name={m.sender} index={i} />
              <View style={{ flex: 1, gap: 5 }}>
                <View style={s.between}>
                  <Text style={[s.text, { fontWeight: m.unread ? "600" : "400" }]}>{m.sender}</Text>
                  <Text style={s.small}>{dateLabel(m.date)}</Text>
                </View>
                <Text style={[s.text, { fontWeight: "500", fontSize: 13 }]}>{m.subject}</Text>
                <Text style={s.muted} numberOfLines={1}>
                  {m.body.replace(/\n/g, " ")}
                </Text>
                {!!m.attachments.length && (
                  <View style={[s.row, { gap: 4, marginTop: 2 }]}>
                    <FileText size={13} color={colors.muted} />
                    <Text style={s.small}>
                      {m.attachments.length}{" "}
                      {t(
                        m.attachments.length > 1
                          ? "screens.mailAttachmentMany"
                          : "screens.mailAttachmentOne",
                      )}
                    </Text>
                  </View>
                )}
              </View>
              {m.unread && (
                <View
                  style={{ width: 6, height: 6, borderRadius: 4, backgroundColor: colors.primary }}
                />
              )}
            </Pressable>
          ))
        ) : (
          <Empty
            icon={Inbox}
            title={query ? t("screens.mailNoMatchTitle") : t("screens.mailEmptyTitle")}
            detail={query ? t("screens.mailNoMatchDetail") : t("screens.mailEmptyDetail")}
          />
        )}
      </Card>
    </View>
  );
}
interface CalendarChoice {
  id: string;
  name: string;
  timeZone: string;
  accessRole: string;
}
function plusDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function CalendarScreen() {
  const { workspace: w, api, open } = useWorkspace();
  const { t } = useTranslation();
  const [date, setDate] = useState(todayDate());
  const [all, setAll] = useState(false);
  const [calendars, setCalendars] = useState<CalendarChoice[]>([]);
  const [calendarId, setCalendarId] = useState("primary");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const selected = calendars.find((c) => c.id === calendarId);
  const zone = selected?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const writable = !selected || ["owner", "writer"].includes(selected.accessRole);
  const anchor = new Date(`${date}T12:00:00`);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(anchor);
    day.setDate(anchor.getDate() - anchor.getDay() + i);
    return day;
  });
  useEffect(() => {
    let active = true;
    void api
      .request<CalendarChoice[]>("/api/calendars")
      .then((items) => {
        if (!active) return;
        setCalendars(items);
        setCalendarId((current) =>
          items.some((c) => c.id === current) ? current : items[0]?.id || "primary",
        );
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [api, retry]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void Promise.resolve()
      .then(() => {
        const query = new URLSearchParams({
          calendarId,
          timeMin: startOfZonedDay(date, zone),
          timeMax: startOfZonedDay(plusDays(date, all ? 30 : 1), zone),
        });
        return api.request<CalendarEvent[]>(`/api/calendar/events?${query}`);
      })
      .then((items) => {
        if (active) setEvents(items.sort((a, b) => a.start.localeCompare(b.start)));
      })
      .catch((e) => {
        if (active) {
          setEvents([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, calendarId, date, all, zone, w, retry]);
  function newEvent() {
    open({
      type: "event",
      neighbors: events,
      draft: {
        calendarId,
        title: "",
        start: zonedInstant(date, "09:00", zone),
        end: zonedInstant(date, "10:00", zone),
        allDay: false,
        timeZone: zone,
        location: "",
        description: "",
        attendees: [],
      },
    });
  }
  return (
    <View style={{ gap: 20 }}>
      <View style={[s.between, { gap: 12, flexWrap: "wrap" }]}>
        <View style={[s.row, { gap: 8 }]}>
          <Text style={s.title}>
            {anchor.toLocaleDateString(activeLocaleTag(), { month: "long", year: "numeric" })}
          </Text>
          <IconButton
            icon={ChevronLeft}
            label={t("screens.calendarPrevWeek")}
            onPress={() => setDate(plusDays(date, -7))}
          />
          <IconButton
            icon={ChevronRight}
            label={t("screens.calendarNextWeek")}
            onPress={() => setDate(plusDays(date, 7))}
          />
        </View>
        <Button primary icon={Plus} disabled={!writable} onPress={newEvent}>
          {t("screens.calendarNewEvent")}
        </Button>
      </View>
      {calendars.length > 0 && (
        <View style={{ gap: 9 }}>
          <Text style={[s.label, { fontSize: 11, letterSpacing: 1 }]}>
            {t("screens.calendarYourCalendars")}
          </Text>
          <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
            {calendars.map((c) => (
              <Button
                key={c.id}
                small
                primary={c.id === calendarId}
                onPress={() => setCalendarId(c.id)}
              >
                {c.name}
                {["owner", "writer"].includes(c.accessRole) ? "" : t("screens.calendarReadOnly")}
              </Button>
            ))}
          </View>
        </View>
      )}
      {/* 周历分段控件：容器用 surface 中性面，选中项用 canvas 白底 + 1px 描边（不用品牌浅底做大块底色） */}
      <Card style={{ padding: 8 }}>
        <View
          style={{
            flexDirection: "row",
            gap: 4,
            backgroundColor: colors.surface,
            borderRadius: 14,
            padding: 4,
          }}
        >
          {dates.map((day) => {
            const key = localDateTime(
              day.toISOString(),
              Intl.DateTimeFormat().resolvedOptions().timeZone,
            ).date;
            const selected = key === date;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  setDate(key);
                  setAll(false);
                }}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 10,
                  gap: 6,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: selected ? colors.line : "transparent",
                  backgroundColor: selected ? colors.paper : "transparent",
                }}
              >
                <Text style={s.small}>
                  {day.toLocaleDateString(activeLocaleTag(), { weekday: "short" })}
                </Text>
                <Text
                  style={[
                    s.title,
                    { fontSize: 20, color: selected ? colors.primary : colors.text },
                  ]}
                >
                  {day.getDate()}
                </Text>
                <View
                  style={{
                    height: 4,
                    width: 4,
                    borderRadius: 4,
                    backgroundColor: [...events, ...w.events].some(
                      (e) => e.calendarId === calendarId && eventDate(e) === key,
                    )
                      ? colors.primary
                      : "transparent",
                  }}
                />
              </Pressable>
            );
          })}
        </View>
      </Card>
      <Card>
        <View style={[s.between, { gap: 10, flexWrap: "wrap" }]}>
          <Text style={s.heading}>
            {all
              ? t("screens.calendarNext30Days")
              : dateLabel(`${date}T12:00:00`, { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          <Button small onPress={() => setAll(!all)}>
            {all ? t("screens.calendarSelectedDay") : t("screens.calendarNextDaysAction")}
          </Button>
        </View>
        <Text style={[s.small, { marginTop: 7, marginBottom: 13 }]}>
          {selected?.name || t("screens.calendarYourCalendar")} · {zone}
          {t("screens.calendarZoneNote")}
        </Text>
        <ErrorNotice error={error} />
        {!!error && (
          <Button small onPress={() => setRetry(retry + 1)}>
            {t("common.tryAgain")}
          </Button>
        )}
        {loading ? (
          <View style={[s.row, { gap: 10, paddingVertical: 35, justifyContent: "center" }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={s.muted}>{t("screens.calendarChecking")}</Text>
          </View>
        ) : events.length ? (
          events.map((e) => (
            <View key={e.id}>
              {all && (
                <Text style={[s.label, { marginTop: 16, fontSize: 11, letterSpacing: 1 }]}>
                  {dateLabel(e.start)}
                </Text>
              )}
              <AgendaRow event={e} neighbors={events} />
              <Text style={[s.small, { marginLeft: 84, marginBottom: 8 }]}>{e.timeZone}</Text>
            </View>
          ))
        ) : (
          !error && (
            <Empty
              icon={CalendarDays}
              title={t("screens.calendarEmptyTitle")}
              detail={
                all ? t("screens.calendarEmptyDetail30") : t("screens.calendarEmptyDetailDay")
              }
            >
              {writable && (
                <Button icon={Plus} onPress={newEvent}>
                  {t("screens.calendarAddEvent")}
                </Button>
              )}
            </Empty>
          )
        )}
      </Card>
    </View>
  );
}
export function BrowserScreen() {
  const { workspace: w, api, refresh, open } = useWorkspace();
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setError("");
    setBusy(true);
    try {
      const browser = await api.request<BrowserSession>("/api/browsers", {
        url: browserAddress(url),
      });
      await refresh();
      setUrl("");
      open({ type: "browser", browser });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 22 }}>
      {/* 面板统一白底 + 1px 描边（不用品牌浅底做大块底色） */}
      <Card>
        <View style={[s.row, { gap: 12, marginBottom: 15 }]}>
          <Globe2 size={22} color={colors.primary} />
          <View>
            <Text style={s.heading}>{t("screens.browserHeading")}</Text>
            <Text style={s.muted}>{t("screens.browserSubtitle")}</Text>
          </View>
        </View>
        <View style={[s.row, { gap: 10 }]}>
          <TextInput
            accessibilityLabel={t("screens.browserAddressLabel")}
            value={url}
            onChangeText={setUrl}
            onSubmitEditing={() => void create()}
            autoCapitalize="none"
            placeholder="https://example.com"
            placeholderTextColor={colors.muted}
            style={[s.input, { flex: 1 }]}
          />
          <Button
            primary
            icon={Plus}
            busy={busy}
            disabled={!url.trim()}
            onPress={() => void create()}
          >
            {t("screens.browserOpenSession")}
          </Button>
        </View>
        <ErrorNotice error={error} />
      </Card>
      <Card>
        <SectionHeading title={t("screens.browserSessionsHeading")} />
        {w.browsers.length ? (
          w.browsers.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => open({ type: "browser", browser: b })}
              // 列表行：行圆角 10 + 1px 分隔线，按压态用 overlay1
              style={({ pressed }) => [
                {
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                  paddingVertical: 14,
                  gap: 12,
                  borderRadius: 10,
                },
                pressed && { backgroundColor: colors.overlay1 },
              ]}
            >
              <View style={[s.row, { gap: 14 }]}>
                <View style={s.iconBox}>
                  <Globe2 size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.heading}>{b.title || t("screens.browserSessionFallback")}</Text>
                  <Text style={s.muted} numberOfLines={1}>
                    {b.url}
                  </Text>
                </View>
                <Chip tint={b.status === "active" ? colors.green : colors.paper}>
                  {statusLabel(b.status)}
                </Chip>
                <ArrowUpRight size={17} color={colors.muted} />
              </View>
              {!!b.previewUrl && (
                <Image
                  source={{ uri: api.url(b.previewUrl) }}
                  resizeMode="cover"
                  style={{
                    height: 180,
                    width: "100%",
                    borderRadius: 10,
                    backgroundColor: colors.paper,
                  }}
                />
              )}
            </Pressable>
          ))
        ) : (
          <Empty
            icon={Globe2}
            title={t("screens.browserEmptyTitle")}
            detail={t("screens.browserEmptyDetail")}
          />
        )}
      </Card>
    </View>
  );
}
type LibrarySection = "files" | "insights" | "notes" | "deliverables";

/**
 * 资料库承接三类内容：文件、收藏的领悟卡和个人笔记。
 * 文件区对齐 Demo 的来源/格式筛选与批量投入分析，同时只展示服务端真实文件。
 */
export function FilesScreen({
  initialSection = "files",
  embedded = false,
  onOpenChat,
}: {
  initialSection?: LibrarySection;
  embedded?: boolean;
  /** 预填提示词后回到对话：资料库若挂在弹层里，由调用方负责关闭弹层。 */
  onOpenChat?: () => void;
}) {
  const { workspace: w, api, refresh, open, prefillPrompt, notify } = useWorkspace();
  const { data: agent, error: agentError } = useAgentWorkspace();
  const { agents: agentList } = useAgentSpace();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [section, setSection] = useState<LibrarySection>(initialSection);
  const [sourceFilter, setSourceFilter] = useState<FileSourceFilter>("all");
  const [formatFilter, setFormatFilter] = useState<FileFormatFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // 格式筛选默认收起：首屏只留「所有格式」按钮，避免十几个胶囊把工具栏撑满。
  const [formatsOpen, setFormatsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const savedInsightIds = useSavedInsightIds();
  const library = useMemo(
    () => buildFileLibrary(w.files, agent?.artifacts || []),
    [w.files, agent?.artifacts],
  );
  const savedArtifacts = useMemo(
    () => library.artifacts.filter((artifact) => savedInsightIds.includes(artifact.id)),
    [library.artifacts, savedInsightIds],
  );
  const fileCounts = useMemo(() => {
    // 智能体分析产出的报告不是「文件」记录，但用户期望在「分析生成」里看到它们。
    const counts = {
      all: library.files.length + library.artifacts.length,
      analysis: library.artifacts.length,
      upload: 0,
    };
    for (const file of library.files) counts[fileSourceBucket(file)] += 1;
    return counts;
  }, [library.files, library.artifacts]);
  const visibleFiles = useMemo(
    () => filterFileLibrary(library.files, { source: sourceFilter, format: formatFilter, query }),
    [library.files, sourceFilter, formatFilter, query],
  );
  /**
   * 分析生成的产物按「生成它的智能体」分组展示。
   * 「我的上传」只看上传件；格式筛选针对文件扩展名，产物没有扩展名，一并隐藏以免误读。
   */
  const artifactGroups = useMemo(() => {
    if (sourceFilter === "upload" || formatFilter !== "all") return [];
    return groupArtifactsByAgent(
      filterArtifacts(library.artifacts, { query }),
      agent?.tasks ?? [],
      agentList,
      t("screens.filesAgentUnassigned"),
    );
  }, [sourceFilter, formatFilter, query, library.artifacts, agent?.tasks, agentList, t]);
  const visibleArtifactCount = artifactGroups.reduce(
    (total, group) => total + group.artifacts.length,
    0,
  );
  const selectedFiles = library.files.filter((file) => selectedIds.has(file.id));
  const filtersActive = sourceFilter !== "all" || formatFilter !== "all" || query.trim().length > 0;
  const compact = width < breakpoints.mobile;
  // 资料库可能是整页、也可能挂在全屏浮层里，两种容器宽度不同：用实测宽度决定栅格列数。
  const [contentWidth, setContentWidth] = useState(0);
  const insightColumns = contentWidth >= 840 ? 3 : contentWidth >= 560 ? 2 : 1;
  const insightCardWidth = insightColumns === 3 ? "31.8%" : insightColumns === 2 ? "48.5%" : "100%";

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const sections: ReadonlyArray<{ id: LibrarySection; label: string }> = [
    { id: "files", label: t("screens.libraryFiles") },
    { id: "insights", label: t("screens.libraryInsights") },
    { id: "notes", label: t("screens.libraryNotes") },
    { id: "deliverables", label: t("screens.libraryDeliverables") },
  ];
  const sourceFilters: ReadonlyArray<{ id: FileSourceFilter; label: string; count: number }> = [
    { id: "all", label: t("screens.filesFilterAll"), count: fileCounts.all },
    { id: "analysis", label: t("screens.filesFilterAnalysis"), count: fileCounts.analysis },
    { id: "upload", label: t("screens.filesFilterUpload"), count: fileCounts.upload },
  ];
  const formatFilters: ReadonlyArray<{ id: FileFormatFilter; label: string }> = [
    { id: "all", label: t("screens.filesFormatAll") },
    { id: "pdf", label: "PDF" },
    { id: "word", label: t("screens.filesKindWord") },
    { id: "excel", label: t("screens.filesKindExcel") },
    { id: "ppt", label: t("screens.filesKindPpt") },
    { id: "markdown", label: t("screens.filesKindMarkdown") },
    { id: "image", label: t("screens.filesKindImage") },
    { id: "html", label: "HTML" },
    { id: "text", label: t("screens.filesKindText") },
    { id: "other", label: t("screens.filesKindOther") },
  ];

  function changeSection(next: LibrarySection) {
    setSection(next);
    setSelectedIds(new Set());
  }

  function clearFilters() {
    setSourceFilter("all");
    setFormatFilter("all");
    setQuery("");
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** 投入分析只把文件与提示词预填进对话框，是否开始由用户确认。 */
  function analyzeFiles(files: readonly Artifact[]) {
    if (!files.length) return;
    prefillPrompt(
      t("screens.filesAnalyzePrompt"),
      files.map((file) => file.id),
    );
    setSelectedIds(new Set());
    onOpenChat?.();
  }

  /**
   * 保存到本地：带鉴权取回文件内容再落盘（原生端交给系统分享面板保存）。
   * 以前直接 `openURL` 在 Web 上只会新开一个标签页，真正想留档还得另存一次。
   */
  async function download(file: Artifact) {
    setError("");
    try {
      await saveRemoteFile(api, file);
      notify(t("screens.filesExported", { name: file.name }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      notify(t("screens.filesExportFailed"));
    }
  }

  /** 分享文件本身：浏览器支持 Web Share 时直接发文件，否则降级为保存。 */
  async function share(file: Artifact) {
    setError("");
    try {
      const result = await shareRemoteFile(api, file);
      notify(t(result === "saved" ? "screens.filesShareSaved" : "screens.filesShared"));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      notify(t("screens.filesShareFailed"));
    }
  }

  async function upload() {
    setError("");
    setBusy(true);
    try {
      const artifact = await pickAndUploadFile(api);
      if (!artifact) return;
      await refresh();
      clearFilters();
      open({ type: "file", file: artifact });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View
      style={{ gap: 20 }}
      onLayout={(event) => setContentWidth(Math.round(event.nativeEvent.layout.width))}
    >
      {embedded ? (
        <View
          style={{
            flexDirection: compact ? "column" : "row",
            alignItems: compact ? "stretch" : "center",
            gap: 12,
          }}
        >
          <Text style={[s.small, { flex: 1, lineHeight: 20 }]}>{t("screens.filesSubtitle")}</Text>
        </View>
      ) : (
        <PageHeader
          title={t("app.titleFiles")}
          description={t("screens.filesSubtitle")}
          compact={width < breakpoints.desktop}
          style={{ marginBottom: 0 }}
        />
      )}

      <View
        style={{
          flexDirection: "row",
          gap: compact ? 20 : 30,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
        }}
      >
        {sections.map((item) => {
          const active = item.id === section;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => changeSection(item.id)}
              style={{
                minHeight: 42,
                justifyContent: "center",
                paddingBottom: 11,
                borderBottomWidth: 2,
                borderBottomColor: active ? colors.primary : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: active ? "600" : "500",
                  color: active ? colors.primaryStrong : colors.muted,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ErrorNotice error={error || agentError} />

      {section === "files" && (
        <View style={{ gap: space.md }}>
          {/* 筛选收进一张工具卡：来源切换 + 搜索 + 格式下拉，首屏只占两行 */}
          <View
            style={{
              gap: space.sm,
              padding: space.sm,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.paper,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                gap: space.xs,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  gap: 2,
                  padding: 3,
                  borderRadius: radius.full,
                  backgroundColor: colors.surface,
                }}
              >
                {sourceFilters.map((item) => {
                  const active = item.id === sourceFilter;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      onPress={() => setSourceFilter(item.id)}
                      style={{
                        minHeight: compact ? 36 : 32,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 12,
                        borderRadius: radius.full,
                        backgroundColor: active ? colors.paper : "transparent",
                        borderWidth: 1,
                        borderColor: active ? colors.line : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: active ? "600" : "500",
                          color: active ? colors.text : colors.muted,
                        }}
                      >
                        {item.label}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.faint }}>{item.count}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[s.small, { marginLeft: "auto", color: colors.faint }]}>
                {t("screens.filesVisibleCount", {
                  count: visibleFiles.length + visibleArtifactCount,
                })}
              </Text>
            </View>

            <View
              style={{
                flexDirection: compact ? "column" : "row",
                alignItems: compact ? "stretch" : "center",
                gap: space.xs,
              }}
            >
              <View
                style={[
                  s.row,
                  {
                    flex: 1,
                    minHeight: 40,
                    gap: 9,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: radius.field,
                    backgroundColor: colors.surfaceSoft,
                  },
                ]}
              >
                <Search size={15} color={colors.faint} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t("screens.filesSearchPlaceholder")}
                  placeholderTextColor={colors.faint}
                  accessibilityLabel={t("screens.filesSearchLabel")}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 38,
                    paddingVertical: 0,
                    borderWidth: 0,
                    color: colors.text,
                    fontSize: 13,
                    fontFamily: fonts.sans,
                  }}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("screens.filesFormatFilter")}
                accessibilityState={{ expanded: formatsOpen }}
                onPress={() => setFormatsOpen((open) => !open)}
                style={{
                  minHeight: 40,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingHorizontal: 12,
                  borderRadius: radius.field,
                  borderWidth: 1,
                  borderColor: formatFilter === "all" ? colors.lineStrong : colors.accentLine,
                  backgroundColor: formatFilter === "all" ? colors.paper : colors.sky,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "500",
                    color: formatFilter === "all" ? colors.muted : colors.primaryStrong,
                  }}
                >
                  {formatFilters.find((item) => item.id === formatFilter)?.label}
                </Text>
                {formatsOpen ? (
                  <ChevronUp size={13} color={colors.faint} />
                ) : (
                  <ChevronDown size={13} color={colors.faint} />
                )}
              </Pressable>
            </View>

            {formatsOpen && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 2 }}>
                {formatFilters.map((item) => {
                  const active = item.id === formatFilter;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setFormatFilter(item.id)}
                      style={{
                        minHeight: 32,
                        justifyContent: "center",
                        paddingHorizontal: 11,
                        borderRadius: radius.full,
                        borderWidth: 1,
                        borderColor: active ? colors.accentLine : colors.line,
                        backgroundColor: active ? colors.sky : colors.paper,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: active ? "600" : "500",
                          color: active ? colors.primaryStrong : colors.muted,
                        }}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* 上传入口放在筛选卡之后、文件列表之前：上传是文件库的主入口，放页面底部会被长列表淹没，用户难以发现 */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("screens.filesUploadAreaTitle")}
            disabled={busy}
            onPress={() => void upload()}
            style={({ pressed }) => [
              s.row,
              {
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: colors.lineStrong,
                borderRadius: radius.field,
                backgroundColor: pressed ? colors.surface : "transparent",
                opacity: busy ? 0.7 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Upload size={18} color={colors.muted} />
            )}
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[s.text, { fontSize: 12, fontWeight: "600" }]}>
                {t("screens.filesUploadAreaTitle")}
              </Text>
              <Text numberOfLines={compact ? 2 : 1} style={[s.small, { color: colors.faint }]}>
                {t("screens.filesUploadAreaDetail")}
              </Text>
            </View>
            {!compact && <Plus size={15} color={colors.faint} />}
          </Pressable>

          {!!selectedFiles.length && (
            <View
              style={[
                s.row,
                {
                  flexWrap: "wrap",
                  gap: space.xs,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: radius.card,
                  backgroundColor: colors.sky,
                  borderWidth: 1,
                  borderColor: colors.accentLine,
                },
              ]}
            >
              <Text style={[s.text, { fontSize: 13, fontWeight: "500", flex: 1, minWidth: 140 }]}>
                {t("screens.filesSelectedCount", { count: selectedFiles.length })}
              </Text>
              <Button
                small
                style={{ minHeight: compact ? 44 : 34 }}
                onPress={() => setSelectedIds(new Set())}
              >
                {t("screens.filesClearSelection")}
              </Button>
              <Button
                primary
                small
                icon={Sparkles}
                style={{ minHeight: compact ? 44 : 34 }}
                onPress={() => analyzeFiles(selectedFiles)}
              >
                {t("screens.filesAttachSelected")}
              </Button>
            </View>
          )}

          {visibleFiles.length > 0 && (
            // 文件改为一张卡内的分行列表：共用描边、行间 1px 分隔，去掉表头与逐行卡片
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {visibleFiles.map((file, index) => {
                const kind = fileKind(file);
                const extension = fileExtension(file);
                const selected = selectedIds.has(file.id);
                const fileMeta = (() => {
                  if (kind === "pdf")
                    return `${file.pageCount} ${t(
                      file.pageCount === 1 ? "screens.filesPage" : "screens.filesPages",
                    )}`;
                  if (kind === "excel" && extension === "csv") return "CSV";
                  return {
                    html: t("screens.filesKindHtml"),
                    markdown: t("screens.filesKindMarkdown"),
                    image: t("screens.filesKindImage"),
                    word: t("screens.filesKindWord"),
                    excel: t("screens.filesKindExcel"),
                    ppt: t("screens.filesKindPpt"),
                    text: t("screens.filesKindText"),
                    other: t("screens.filesKindOther"),
                  }[kind];
                })();
                return (
                  <View
                    key={file.id}
                    style={{
                      flexDirection: compact ? "column" : "row",
                      alignItems: compact ? "stretch" : "center",
                      gap: compact ? space.xs : space.sm,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      borderTopWidth: index ? 1 : 0,
                      borderTopColor: colors.line,
                      backgroundColor: selected ? colors.sky : "transparent",
                    }}
                  >
                    <View style={[s.row, { flex: 1, minWidth: 0, gap: 10 }]}>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityLabel={t("screens.filesSelectLabel", { name: file.name })}
                        accessibilityState={{ checked: selected }}
                        onPress={() => toggleSelection(file.id)}
                        style={{
                          width: 32,
                          height: 40,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: radius.badge,
                            borderWidth: 1,
                            borderColor: selected ? colors.primary : colors.lineStrong,
                            backgroundColor: selected ? colors.primary : colors.paper,
                          }}
                        >
                          {selected && <Check size={12} color={colors.onPrimary} />}
                        </View>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("screens.filesOpenLabel", { name: file.name })}
                        onPress={() => open({ type: "file", file })}
                        style={({ pressed }) => [
                          s.row,
                          { flex: 1, minWidth: 0, gap: 10 },
                          pressed && { opacity: 0.72 },
                        ]}
                      >
                        <View
                          style={{
                            width: 36,
                            height: 40,
                            flexShrink: 0,
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: radius.control,
                            borderWidth: 1,
                            borderColor: colors.line,
                            backgroundColor: colors.surface,
                          }}
                        >
                          <Text style={{ fontSize: 9, fontWeight: "600", color: colors.muted }}>
                            {fileBadge(file)}
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Text
                            numberOfLines={1}
                            style={[s.text, { fontSize: 14, lineHeight: 21, fontWeight: "500" }]}
                          >
                            {file.name}
                          </Text>
                          <Text numberOfLines={1} style={[s.small, { color: colors.faint }]}>
                            {Math.max(1, Math.round(file.size / 1024))} KB · {fileMeta} ·{" "}
                            {fileSourceLabel(file.source, t)} · {dateLabel(file.createdAt)}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 6,
                        marginLeft: compact ? 32 : 0,
                      }}
                    >
                      <IconButton
                        icon={Share2}
                        label={t("screens.filesShare", { name: file.name })}
                        size={compact ? 40 : 34}
                        onPress={() => void share(file)}
                      />
                      <IconButton
                        icon={ArrowDownToLine}
                        label={t("screens.filesDownload", { name: file.name })}
                        size={compact ? 40 : 34}
                        onPress={() => void download(file)}
                      />
                      <Button
                        small
                        icon={Sparkles}
                        style={{ minHeight: compact ? 40 : 32 }}
                        onPress={() => analyzeFiles([file])}
                      >
                        {t("screens.filesAnalyze")}
                      </Button>
                    </View>
                  </View>
                );
              })}
            </Card>
          )}

          {/* 分析产物按智能体分组：同一张卡里先给智能体名，再列它产出的报告 */}
          {artifactGroups.map((group) => (
            <View key={group.agentId} style={{ gap: space.xs }}>
              <View style={[s.between, { gap: space.xs, flexWrap: "wrap" }]}>
                <Text style={[s.label, { fontSize: 11, letterSpacing: 1 }]}>{group.agentName}</Text>
                <Text style={[s.small, s.metric, { color: colors.faint }]}>
                  {t("screens.libraryItemCount", { count: group.artifacts.length })}
                </Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {group.artifacts.map((artifact) => (
                  <View key={artifact.id} style={{ flexGrow: 1, flexBasis: 260, maxWidth: 520 }}>
                    <ArtifactCard artifact={artifact} />
                  </View>
                ))}
              </View>
            </View>
          ))}

          {!visibleFiles.length && visibleArtifactCount === 0 && (
            <Card>
              <Empty
                icon={
                  filtersActive && library.files.length + library.artifacts.length > 0
                    ? Folder
                    : FileText
                }
                title={t(
                  filtersActive && library.files.length + library.artifacts.length > 0
                    ? "screens.filesNoMatchTitle"
                    : "screens.filesEmptyTitle",
                )}
                detail={t(
                  filtersActive && library.files.length + library.artifacts.length > 0
                    ? "screens.filesNoMatchDetail"
                    : "screens.filesEmptyDetail",
                )}
              >
                {filtersActive && library.files.length + library.artifacts.length > 0 && (
                  <Button icon={Search} onPress={clearFilters}>
                    {t("screens.filesClearFilters")}
                  </Button>
                )}
              </Empty>
            </Card>
          )}
        </View>
      )}

      {section === "insights" &&
        (savedArtifacts.length ? (
          <View style={{ gap: space.md }}>
            <View style={[s.between, { gap: space.xs, flexWrap: "wrap" }]}>
              <Text style={[s.small, { flex: 1, minWidth: 200 }]}>
                {t("screens.libraryInsightsHint")}
              </Text>
              <Text style={[s.small, s.metric, { color: colors.faint }]}>
                {t("screens.libraryItemCount", { count: savedArtifacts.length })}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: space.md,
                alignItems: "stretch",
              }}
            >
              {savedArtifacts.map((artifact) => {
                const view = workbenchInsightView(artifact);
                const symbol = [view.symbolName, view.code].filter(Boolean).join(" · ");
                const date = dateLabel(artifact.createdAt);
                return (
                  <View key={artifact.id} style={{ width: insightCardWidth }}>
                    <InsightCard
                      // 分类做眉标、标题保留两行，再用一句结论/依据补齐卡片信息量
                      eyebrow={view.category || statusLabel(artifact.kind)}
                      title={view.title}
                      detail={view.takeaway || view.basis}
                      showSections={false}
                      meta={symbol ? `${symbol} · ${date}` : date}
                      saved={true}
                      artifact={artifact}
                      savePlacement="header"
                      onToggleSave={() => {
                        toggleSavedInsight(artifact.id);
                        notify(t("workbench.insightUnsavedNotice"));
                      }}
                      actionLabel={t("workbench.expand")}
                      accessibilityLabel={`${t("workbench.expand")}：${view.title}`}
                      onPress={() => open({ type: "insight", artifact })}
                      style={{ height: "100%", minHeight: 168 }}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <Card>
            <Empty
              icon={Sparkles}
              title={t("screens.libraryInsightsEmptyTitle")}
              detail={t("screens.libraryInsightsEmptyDetail")}
            />
          </Card>
        ))}

      {section === "notes" && <NotesScreen />}
      {section === "deliverables" && <DeliverableScreen />}
    </View>
  );
}
export function ActivityScreen() {
  const { workspace: w, open } = useWorkspace();
  const { t } = useTranslation();
  // 审批记录只作为「已完成」分区的追溯资料：不再自带第二套筛选。
  const actions = [...w.actions].sort(
    (a, b) =>
      Number(b.status === "awaiting_review") - Number(a.status === "awaiting_review") ||
      b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <Card style={{ gap: 0 }}>
      {/* 审批与时间线是同一条回执的两个维度，合并为一张卡、1px 分隔 */}
      <SectionHeading title={t("screens.activityActionsHeading")} style={{ marginBottom: 6 }} />
      {actions.length ? (
        actions.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => open({ type: "review", action: a })}
            // 列表行：行圆角 10 + 1px 分隔线，按压态用 overlay1
            style={({ pressed }) => [
              s.row,
              {
                gap: 14,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: colors.line,
                borderRadius: 10,
              },
              pressed && { backgroundColor: colors.overlay1 },
            ]}
          >
            <View
              style={[
                s.iconBox,
                {
                  // 图标底座用中性面；品牌浅底只留给下面的小面积状态 Chip
                  backgroundColor: a.status === "awaiting_review" ? colors.surface : colors.green,
                },
              ]}
            >
              {a.status === "awaiting_review" ? (
                <ShieldCheck size={18} color={colors.primary} />
              ) : (
                <CheckCheck size={18} color={colors.text} />
              )}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.text}>{runtimeLabel(a.title)}</Text>
              <Text style={s.small}>{relativeDate(a.createdAt)}</Text>
            </View>
            <Chip
              tint={
                a.status === "failed"
                  ? colors.errorSoft
                  : a.status === "awaiting_review"
                    ? colors.sky
                    : colors.paper
              }
            >
              {statusLabel(a.status)}
            </Chip>
            <ChevronRight size={16} color={colors.muted} />
          </Pressable>
        ))
      ) : (
        <Text style={s.small}>{t("screens.activityCaughtUpTitle")}</Text>
      )}
      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 14 }} />
      <SectionHeading title={t("screens.activityTimelineHeading")} style={{ marginBottom: 6 }} />
      {w.activity.length ? (
        w.activity.map((a, i) => (
          <View
            key={a.id}
            style={[
              s.row,
              {
                alignItems: "flex-start",
                gap: 14,
                paddingVertical: 12,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: colors.line,
              },
            ]}
          >
            <View style={[s.iconBox, { height: 34, width: 34, backgroundColor: colors.paper }]}>
              <Clock3 size={16} color={colors.muted} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.text}>{runtimeLabel(a.title)}</Text>
              <Text style={s.muted}>{resultSummary(a.detail)}</Text>
              <Text style={s.small}>
                {dateLabel(a.date)} · {timeLabel(a.date)}
              </Text>
            </View>
            <Chip>{statusLabel(a.status)}</Chip>
          </View>
        ))
      ) : (
        <Text style={s.small}>{t("screens.activityEmptyDetail")}</Text>
      )}
    </Card>
  );
}
export function ConnectionsScreen({ query = "" }: { query?: string }) {
  const { workspace: w, api, refresh, notify, open } = useWorkspace();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 连接四态：未连接 / 授权中 / 已连接 / 失败（按分组记录进行中与失败）
  const [pendingId, setPendingId] = useState<"google" | "model">();
  const [failedId, setFailedId] = useState<"google" | "model">();
  async function connect(capability: "read" | "write") {
    setBusy(true);
    setError("");
    setPendingId("google");
    setFailedId(undefined);
    try {
      const result = await api.request<{ url: string | null; connected?: boolean }>(
        "/api/google/connect",
        { capability },
      );
      if (result.url) {
        await Linking.openURL(result.url);
        notify(t("screens.connectionsNotifyFinish"));
      } else {
        await refresh();
        notify(t("screens.connectionsNotifyLocalReady"));
      }
    } catch (e) {
      setFailedId("google");
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingId(undefined);
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError("");
    setPendingId("google");
    setFailedId(undefined);
    try {
      await api.request("/api/google/disconnect", {});
      await refresh();
      notify(t("screens.connectionsNotifyDisconnected"));
    } catch (e) {
      setFailedId("google");
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingId(undefined);
      setBusy(false);
    }
  }
  async function switchModel(model: string) {
    setBusy(true);
    setError("");
    setPendingId("model");
    setFailedId(undefined);
    try {
      await api.request("/api/model", { model });
      await refresh();
      notify(t("screens.connectionsModelSwitched", { model: shortModel(model) }));
    } catch (e) {
      setFailedId("model");
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingId(undefined);
      setBusy(false);
    }
  }
  const google = w.connections.find((c) => c.id === "google");
  const connected = google?.status === "connected" || google?.status === "sample";
  const modelOptions = w.runtime.modelOptions ?? [];
  // `brand` 指向 serviceBrands：第三方服务保留各自品牌色用于识别，
  // 没有 brand 的行（LingWu 自身模型）继续使用品牌紫。
  const rows = [
    {
      id: "model",
      name: t("screens.connectionsModelLabel"),
      icon: Cpu,
      brand: undefined,
      connected: Boolean(w.runtime.model),
      group: "model",
    },
    {
      id: "gmail",
      name: "Gmail",
      icon: Mail,
      brand: "gmail" as const,
      connected,
      group: "google",
    },
    {
      id: "calendar",
      name: "Google Calendar",
      icon: CalendarDays,
      brand: "googleCalendar" as const,
      connected,
      group: "google",
    },
    {
      id: "browser",
      name: t("threads.agentComputer"),
      icon: Globe2,
      brand: "browser" as const,
      connected: w.connections.some((c) => c.id === "browser" && c.status === "connected"),
      group: "browser",
    },
    {
      id: "openbot",
      name: "OpenBot",
      icon: Sparkles,
      brand: "openbot" as const,
      connected: false,
      group: "openbot",
    },
  ].filter((row) => `${row.name} ${row.group}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <View style={{ gap: 22 }}>
      {[true, false].map((isConnected) => {
        const group = rows.filter((row) => row.connected === isConnected);
        if (!group.length) return null;
        return (
          <View key={String(isConnected)} style={{ gap: 8 }}>
            {/* 表头：s.label 风格小字（11px、加粗、letterSpacing） */}
            <Text style={[s.label, { marginLeft: 2, fontSize: 11, letterSpacing: 1 }]}>
              {isConnected
                ? w.mode === "sample"
                  ? t("screens.connectionsYourConnections")
                  : t("screens.connectionsConnected")
                : t("screens.connectionsAvailable")}
            </Text>
            {/* 表格面板：白底 + 1px 描边 + 14px 圆角，靠边框分层 */}
            <View
              style={{
                paddingHorizontal: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.paper,
                overflow: "hidden",
              }}
            >
              {group.map((row, index) => {
                const key = row.group === "google" || row.group === "model" ? row.group : undefined;
                const state =
                  key && pendingId === key
                    ? "connecting"
                    : key && failedId === key
                      ? "failed"
                      : row.connected
                        ? "connected"
                        : "idle";
                const badge =
                  state === "connecting"
                    ? {
                        tone: "running" as StatusTone,
                        label: t("screens.connectionsStateConnecting"),
                      }
                    : state === "failed"
                      ? {
                          tone: "failed" as StatusTone,
                          label: t("screens.connectionsStateFailed"),
                        }
                      : state === "connected"
                        ? {
                            tone: "done" as StatusTone,
                            label: t("screens.connectionsStateConnected"),
                          }
                        : {
                            tone: "paused" as StatusTone,
                            label: t("screens.connectionsStateIdle"),
                          };
                return (
                  <Pressable
                    key={row.id}
                    accessibilityRole="button"
                    accessibilityLabel={t("screens.connectionsManage", { name: row.name })}
                    onPress={() =>
                      row.group === "browser" ? open({ type: "computer" }) : setSelected(row.group)
                    }
                    // 数据表行：行圆角 10 + 1px 分隔线，按压态用 overlay1
                    style={({ pressed }) => [
                      s.row,
                      {
                        gap: 12,
                        minHeight: 56,
                        borderBottomWidth: index < group.length - 1 ? 1 : 0,
                        borderBottomColor: colors.line,
                        borderRadius: 10,
                      },
                      pressed && { backgroundColor: colors.overlay1 },
                    ]}
                  >
                    <View
                      style={{
                        width: 29,
                        height: 29,
                        borderRadius: 7,
                        backgroundColor: row.brand
                          ? serviceBrands[row.brand].surface
                          : colors.surface,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <row.icon
                        size={23}
                        color={row.brand ? serviceBrands[row.brand].fg : colors.primary}
                      />
                    </View>
                    <Text style={[s.text, { flex: 1 }]}>{row.name}</Text>
                    {row.connected && row.group === "model" && w.runtime.model && (
                      <Text style={s.small}>{shortModel(w.runtime.model)}</Text>
                    )}
                    <StatusBadge tone={badge.tone} label={badge.label} />
                    <ChevronRight size={18} color={colors.faint} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      {!rows.length && <Text style={s.muted}>{t("screens.connectionsNoMatch")}</Text>}
      {selected && (
        <Sheet
          title={
            selected === "google"
              ? t("screens.connectionsGoogleTitle")
              : selected === "model"
                ? t("screens.connectionsModelLabel")
                : "OpenBot"
          }
          subtitle={
            selected === "google"
              ? google?.account
              : selected === "model"
                ? t("screens.connectionsModelSubtitle")
                : t("screens.connectionsOpenBotSubtitle")
          }
          onClose={() => setSelected(undefined)}
        >
          {selected === "google" ? (
            <View style={{ gap: 18 }}>
              <Text style={s.muted}>{t("screens.connectionsGoogleDescription")}</Text>
              <ErrorNotice error={error} />
              <Button busy={busy} primary icon={Link2} onPress={() => void connect("read")}>
                {t("screens.connectionsConnectGoogle")}
              </Button>
              <Button busy={busy} onPress={() => void connect("write")}>
                {t("screens.connectionsEnableSending")}
              </Button>
              {connected && (
                <Button busy={busy} danger onPress={() => void disconnect()}>
                  {t("screens.connectionsDisconnectGoogle")}
                </Button>
              )}
              <SettingsLine
                label={t("screens.connectionsEnvironmentLabel")}
                value={
                  w.mode === "sample"
                    ? t("screens.connectionsEnvSample")
                    : t("screens.connectionsEnvLive")
                }
              />
              <SettingsLine
                label={t("screens.connectionsAssistantLabel")}
                value={
                  w.runtime.provider === "sample"
                    ? t("screens.connectionsAssistantGuided")
                    : w.runtime.configured
                      ? t("screens.connectionsAssistantConnected")
                      : t("screens.connectionsAssistantNotConfigured")
                }
              />
              <SettingsLine
                label={t("screens.connectionsRichThreads")}
                value={
                  w.runtime.richThreads
                    ? "CopilotKit Intelligence"
                    : t("screens.connectionsNotConnected")
                }
              />
              <Button
                small
                icon={ArrowDownToLine}
                onPress={() => void refresh().catch((e) => setError(String(e)))}
              >
                {t("screens.connectionsRefresh")}
              </Button>
            </View>
          ) : selected === "model" ? (
            <View style={{ gap: 18 }}>
              {modelOptions.length ? (
                modelOptions.map((choice) => (
                  <View key={choice.provider} style={{ gap: 8 }}>
                    <Text style={s.small}>
                      {choice.provider === "custom"
                        ? t("modelSettings.customProvider")
                        : choice.label}
                    </Text>
                    <View style={[s.row, { gap: 7, flexWrap: "wrap" }]}>
                      {choice.models.map((spec) => {
                        const current = spec === w.runtime.model;
                        return (
                          <Pressable
                            key={spec}
                            accessibilityRole="button"
                            accessibilityState={{ selected: current, disabled: busy || current }}
                            disabled={busy || current}
                            onPress={() => void switchModel(spec)}
                            style={[s.row, { gap: 4, opacity: busy ? 0.5 : 1 }]}
                          >
                            <Chip tint={current ? colors.sky : undefined}>{shortModel(spec)}</Chip>
                            {current && <Check size={13} color={colors.primary} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={s.muted}>{t("screens.connectionsModelEmpty")}</Text>
              )}
              <ErrorNotice error={error} />
              <SettingsLine
                label={t("screens.connectionsModelCurrent")}
                value={w.runtime.model ?? t("screens.connectionsNotConnected")}
              />
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              <Text style={s.text}>{t("screens.connectionsOpenBotNotice")}</Text>
              <Text style={s.muted}>{t("screens.connectionsOpenBotDetail")}</Text>
            </View>
          )}
        </Sheet>
      )}
    </View>
  );
}
function SettingsLine({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={[
        s.between,
        { gap: 15, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
      ]}
    >
      <Text style={s.muted}>{label}</Text>
      <Text style={[s.text, { fontSize: 12, flexShrink: 1, textAlign: "right" }]}>{value}</Text>
    </View>
  );
}

/** `deepseek/deepseek-flash` reads better as the model id alone inside the picker. */
function shortModel(spec: string) {
  return spec.split("/").slice(1).join("/") || spec;
}
