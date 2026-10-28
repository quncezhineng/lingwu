import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import type {
  Artifact,
  BrowserSession,
  CalendarEvent,
  EmailDraft,
} from "../../../packages/domain/src";
import { useAgentWorkspace } from "./agent-workspace";
import { API_URL } from "./api";
import { MarketBriefingCard } from "./briefing-card";
import { browserAddress } from "./browser-address";
import { localDateTime, startOfZonedDay, zonedInstant } from "./date-time";
import { fileKind } from "./file-kind";
import { buildFileLibrary, fileSourceLabel } from "./file-library";
import { activeLocaleTag, useTranslation } from "./i18n";
import { runtimeLabel, statusLabel } from "./i18n/translate";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Cpu,
  FileText,
  Globe2,
  Inbox,
  Link2,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
} from "./icons";
import { InsightCard } from "./insight-card";
import { NotesScreen } from "./notes-screen";
import { PageHeader } from "./page-header";
import { StatusBadge, type StatusTone } from "./status-badge";
import { breakpoints, layout, space } from "./theme";
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

function todayDate() {
  return localDateTime(new Date().toISOString(), Intl.DateTimeFormat().resolvedOptions().timeZone)
    .date;
}
function eventDate(event: CalendarEvent) {
  return event.allDay ? event.start : localDateTime(event.start, event.timeZone).date;
}
export function TodayScreen() {
  const { workspace: w, navigate, open, ask } = useWorkspace();
  const { t } = useTranslation();
  const wide = useWindowDimensions().width > 1180;
  const pending = w.actions.filter((a) => a.status === "awaiting_review");
  const unread = w.mail.filter((m) => m.unread);
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
            {events.length
              ? t("screens.todayEventsCount", { count: events.length })
              : t("screens.todayCalendarRoom")}
            {unread.length ? t("screens.todayUnreadEmails", { count: unread.length }) : ""}.{"\n"}
            {t("screens.todayLetMakeSpace")}
          </Text>
          <Button
            onPress={() => ask(t("screens.todayPlanDayPrompt"))}
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
            label: t("screens.todayStatUnreadLabel"),
            value: unread.length,
            note: t("screens.todayStatUnreadNote"),
            icon: Mail,
            section: "mail" as const,
          },
          {
            label: t("screens.todayStatCalendarLabel"),
            value: events.length,
            note: t("screens.todayStatCalendarNote"),
            icon: CalendarDays,
            section: "calendar" as const,
          },
          {
            label: t("screens.todayStatPendingLabel"),
            value: pending.length,
            note: t("screens.todayStatPendingNote"),
            icon: ShieldCheck,
            section: "activity" as const,
          },
        ].map((item) => (
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
      <MarketBriefingCard />
      <View style={{ flexDirection: wide ? "row" : "column", gap: 16 }}>
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
                    <Text style={[s.text, { fontSize: 12, fontWeight: "600" }]}>{m.sender}</Text>
                    <Text style={[s.small, { fontSize: 10 }, s.metric]}>{timeLabel(m.date)}</Text>
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
      </View>
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
              onPress={() => ask(prompt)}
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
type LibrarySection = "files" | "insights" | "notes";

/** 文件来源标签本地化；未知来源回落原文，避免出现没做完的英文键。 */
export function FilesScreen({ initialSection = "files" }: { initialSection?: LibrarySection }) {
  const { workspace: w, api, refresh, open } = useWorkspace();
  const { data: agent, error: agentError } = useAgentWorkspace();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [section, setSection] = useState<LibrarySection>(initialSection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 收藏态占位：P2-6 契约接入前只在本次会话内生效，不写后端。
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const library = buildFileLibrary(w.files, agent?.artifacts || []);
  // 内容区宽度：桌面扣侧栏与页面 padding，决定资料卡栅格列数（避免单卡右侧大片留白）。
  const contentWidth =
    width >= breakpoints.desktop
      ? width - layout.sidebar - space.page * 2
      : width - space.pageMobile * 2;
  const columns = contentWidth >= 1080 ? 3 : contentWidth >= 700 ? 2 : 1;
  const cardWidth = columns === 1 ? "100%" : columns === 2 ? "48.5%" : "31.8%";

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const sections: ReadonlyArray<{ id: LibrarySection; label: string }> = [
    { id: "files", label: t("screens.libraryFiles") },
    { id: "insights", label: t("screens.libraryInsights") },
    { id: "notes", label: t("screens.libraryNotes") },
  ];
  async function upload() {
    setError("");
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/html"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      let artifact: Artifact;
      if (Platform.OS === "web") {
        const form = new FormData();
        if (!file.file)
          throw new Error("The selected file could not be read. Please choose it again.");
        form.append("file", file.file, file.name);
        artifact = await api.request<Artifact>("/api/files", form);
      } else {
        const result = await FileSystem.uploadAsync(`${API_URL}/api/files`, file.uri, {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: "file",
          mimeType:
            file.mimeType || (/\.html?$/i.test(file.name) ? "text/html" : "application/pdf"),
          headers: { Authorization: `Bearer ${api.token}` },
        });
        const payload = JSON.parse(result.body);
        if (result.status < 200 || result.status >= 300)
          throw new Error(payload.error || "Could not import this file.");
        artifact = payload;
      }
      await refresh();
      open({ type: "file", file: artifact });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 20 }}>
      {/* N4：副标题一行，导入动作收进页头右侧 */}
      <PageHeader
        title={t("app.titleFiles")}
        description={t("screens.filesSubtitle")}
        compact={width < breakpoints.desktop}
        actions={
          section === "files" ? (
            <Button
              primary
              small={width < breakpoints.desktop}
              icon={Upload}
              busy={busy}
              onPress={() => void upload()}
            >
              {t(width < breakpoints.desktop ? "screens.filesImportShort" : "screens.filesImport")}
            </Button>
          ) : undefined
        }
        style={{ marginBottom: 0 }}
      />
      {/* D3：单页三分区，旧「资料/笔记」两页入口都落到这里 */}
      <View
        style={{
          flexDirection: "row",
          alignSelf: "flex-start",
          padding: 4,
          gap: 4,
          borderRadius: 14,
          backgroundColor: colors.surface,
        }}
      >
        {sections.map((item) => {
          const active = item.id === section;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setSection(item.id)}
              style={{
                minHeight: 34,
                paddingHorizontal: 14,
                borderRadius: 9,
                justifyContent: "center",
                backgroundColor: active ? colors.paper : "transparent",
                borderWidth: 1,
                borderColor: active ? colors.line : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: active ? "600" : "500",
                  color: active ? colors.text : colors.muted,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ErrorNotice error={error || agentError} />

      {section === "files" &&
        (library.files.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "stretch" }}>
            {library.files.map((f) => {
              const kind = fileKind(f);
              return (
                <Pressable
                  key={f.id}
                  accessibilityRole="button"
                  accessibilityLabel={f.name}
                  onPress={() => open({ type: "file", file: f })}
                  style={{
                    width: library.files.length === 1 ? Math.min(contentWidth, 520) : cardWidth,
                  }}
                >
                  <Card style={{ padding: 0, overflow: "hidden", width: "100%" }}>
                    {/* L2：封面 175→120，移动端首屏至少露出两张卡 */}
                    <View
                      style={{
                        height: 120,
                        backgroundColor: colors.tertiary,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 64,
                          height: 84,
                          borderRadius: 5,
                          backgroundColor: colors.paper,
                          padding: 9,
                          transform: [{ rotate: "-4deg" }],
                          borderWidth: 1,
                          borderColor: colors.line,
                        }}
                      >
                        <View style={[s.row, { gap: 3, marginBottom: 8 }]}>
                          <FileText size={10} color={colors.primary} />
                          <Text style={{ fontSize: 10, color: colors.primaryStrong }}>
                            {t("screens.filesDocumentBadge")}
                          </Text>
                        </View>
                        {[100, 75, 90, 95, 60].map((barWidth, i) => (
                          <View
                            key={barWidth}
                            style={{
                              height: 2,
                              backgroundColor: i === 0 ? colors.primary : colors.tertiary,
                              width: `${barWidth}%`,
                              marginBottom: 5,
                              borderRadius: 4,
                            }}
                          />
                        ))}
                      </View>
                      <View style={{ position: "absolute", bottom: 10, right: 12 }}>
                        <Chip>{kind === "html" ? "HTML" : "PDF"}</Chip>
                      </View>
                    </View>
                    <View style={{ padding: 14, gap: 6 }}>
                      <Text numberOfLines={1} style={[s.heading, { fontSize: 14 }]}>
                        {f.name}
                      </Text>
                      <Text numberOfLines={1} style={s.small}>
                        {kind === "html"
                          ? t("screens.filesWebPage")
                          : `${f.pageCount} ${t(f.pageCount === 1 ? "screens.filesPage" : "screens.filesPages")}`}{" "}
                        · {Math.max(1, Math.round(f.size / 1024))} KB
                      </Text>
                      <View style={[s.between, { marginTop: 9 }]}>
                        <Chip>{fileSourceLabel(f.source, t)}</Chip>
                        <Text style={s.small}>{dateLabel(f.createdAt)}</Text>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Card>
            <Empty
              icon={FileText}
              title={t("screens.filesEmptyTitle")}
              detail={t("screens.filesEmptyDetail")}
            >
              <Button primary icon={Upload} busy={busy} onPress={() => void upload()}>
                {t("screens.filesImport")}
              </Button>
            </Empty>
          </Card>
        ))}

      {section === "insights" &&
        (library.artifacts.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "stretch" }}>
            {library.artifacts.map((artifact) => (
              <View
                key={artifact.id}
                style={{
                  width: library.artifacts.length === 1 ? Math.min(contentWidth, 760) : cardWidth,
                }}
              >
                <InsightCard
                  eyebrow={`${t("screens.libraryInsights")} · ${statusLabel(artifact.kind)}`}
                  title={artifact.summary || artifact.title}
                  meta={`${artifact.title} · ${dateLabel(artifact.createdAt)}`}
                  saved={saved.has(artifact.id)}
                  onToggleSave={() =>
                    setSaved((current) => {
                      const next = new Set(current);
                      if (next.has(artifact.id)) next.delete(artifact.id);
                      else next.add(artifact.id);
                      return next;
                    })
                  }
                  onPress={() => open({ type: "artifact", artifact })}
                />
              </View>
            ))}
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
                    <Text style={s.small}>{choice.label}</Text>
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
