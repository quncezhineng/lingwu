import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  type ActionProposal,
  type Artifact,
  type BrowserSession,
  type CalendarEvent,
  type EmailDraft,
  type EventDraft,
  emailDraftSchema,
  eventDraftSchema,
  type Mail,
  type ProposalInput,
} from "../../../packages/domain/src";
import type { AgentArtifact } from "../../../packages/domain/src/agent";
import { AgentPersonalitySheet, DelegateSheet, NotificationsSheet, TaskDetail } from "./agent-ui";
import { artifactHasHtmlPreview, renderArtifactHtml } from "./artifact-html";
import BrowserConsole from "./BrowserConsole";
import { browserAddress, browserSite } from "./browser-address";
import { ComputerSheet } from "./computer";
import DateTimeEditor from "./DateTimeEditor";
import { localDateTime, zonedInstant } from "./date-time";
import { fileExtension, fileKind, fileMimeType } from "./file-kind";
import HtmlPreview from "./HtmlPreview";
import { activeLocaleTag, useTranslation } from "./i18n";
import { statusLabel } from "./i18n/translate";
import {
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  Clock3,
  Cpu,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Globe2,
  Heart,
  Mail as MailIcon,
  Pencil,
  Plus,
  Reply,
  RotateCw,
  Save,
  Send,
  Shapes,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
} from "./icons";
import { workbenchInsightView } from "./insight-view";
import {
  activeWatchlist,
  addSymbols,
  normalizeCode,
  searchSymbols,
  useWatchlistState,
} from "./market";
import { ModelSettingsSheet } from "./model-settings";
import { NoteEditorSheet } from "./note-ui";
import { markdownPreviewDocument } from "./open-html-document";
import PdfReader from "./PdfReader";
import { toggleSavedInsight, useSavedInsightIds } from "./saved-insights";
import { SymbolDetailSheet } from "./symbol-detail";
import {
  Button,
  Card,
  CheckRow,
  Chip,
  colors,
  dateLabel,
  Empty,
  ErrorNotice,
  Field,
  LinkRow,
  radius,
  resultSummary,
  SectionHeading,
  Sheet,
  s,
  timeLabel,
  typography,
} from "./ui";
import { WatchlistSymbolSheet } from "./watchlist-symbol";
import { type Detail, useWorkspace } from "./workspace";
export function Details({ detail }: { detail: Detail }) {
  const { t } = useTranslation();
  const { close, navigate } = useWorkspace();
  if (detail.type === "computer") return <ComputerSheet />;
  if (detail.type === "task") return <TaskDetail taskId={detail.taskId} />;
  if (detail.type === "delegate")
    return (
      <DelegateSheet
        key={`${detail.goalId}:${detail.milestoneId}`}
        goalId={detail.goalId}
        milestoneId={detail.milestoneId}
      />
    );
  if (detail.type === "notifications") return <NotificationsSheet />;
  if (detail.type === "personality") return <AgentPersonalitySheet />;
  if (detail.type === "settings") return <SettingsSheet />;
  if (detail.type === "model-settings") return <ModelSettingsSheet />;
  if (detail.type === "mail") return <MailDetail mail={detail.mail} />;
  if (detail.type === "email") return <EmailEditor draft={detail.draft} />;
  if (detail.type === "event")
    return <EventEditor event={detail.event} draft={detail.draft} neighbors={detail.neighbors} />;
  if (detail.type === "file") return <FileDetail file={detail.file} />;
  if (detail.type === "artifact") return <ArtifactDetail artifact={detail.artifact} />;
  if (detail.type === "insight") return <InsightDetail artifact={detail.artifact} />;
  if (detail.type === "symbol")
    return (
      <SymbolDetailSheet
        symbol={detail.symbol}
        quote={detail.quote}
        watchlist={detail.watchlist}
        initialAlertForm={detail.focus === "alerts"}
      />
    );
  if (detail.type === "watchlist-symbol")
    return (
      <WatchlistSymbolSheet
        symbol={detail.symbol}
        quote={detail.quote}
        watchlist={detail.watchlist}
      />
    );
  if (detail.type === "review") return <ReviewDetail initial={detail.action} />;
  if (detail.type === "browser") return <BrowserDetail initial={detail.browser} />;
  return (
    <Sheet
      title={t("threads.sheetSubtitleSample")}
      subtitle={t("details.workspaceSubtitle")}
      onClose={close}
    >
      {[
        { section: "mail" as const, title: t("app.titleMail"), icon: MailIcon },
        { section: "calendar" as const, title: t("app.titleCalendar"), icon: CalendarDays },
        { section: "browser" as const, title: t("app.titleBrowser"), icon: Globe2 },
        { section: "files" as const, title: t("app.titleFiles"), icon: FileText },
        { section: "activity" as const, title: t("app.titleActivity"), icon: Clock3 },
        { section: "connections" as const, title: t("details.connections"), icon: ShieldCheck },
      ].map((item) => (
        <LinkRow
          key={item.section}
          title={item.title}
          icon={item.icon}
          onPress={() => {
            navigate(item.section);
            close();
          }}
        />
      ))}
    </Sheet>
  );
}
function SettingsSheet() {
  const { t } = useTranslation();
  const { close, open, navigate } = useWorkspace();
  return (
    <Sheet
      title={t("details.settingsTitle")}
      subtitle={t("details.settingsSubtitle")}
      onClose={close}
    >
      <View style={{ gap: 20 }}>
        <View style={{ gap: 8 }}>
          <Text style={s.label}>{t("details.settingsAgentHeading")}</Text>
          <Card style={{ paddingVertical: 6 }}>
            <LinkRow
              icon={Cpu}
              title={t("modelSettings.title")}
              detail={t("modelSettings.subtitle")}
              onPress={() => {
                navigate("account");
                open({ type: "model-settings" });
              }}
            />
            <LinkRow
              icon={Bot}
              title={t("agent.personalityMemory")}
              detail={t("details.settingsPersonalityDetail")}
              onPress={() => open({ type: "personality" })}
            />
          </Card>
        </View>
        <View style={{ gap: 8 }}>
          <Text style={s.label}>{t("details.settingsWorkspaceHeading")}</Text>
          <Card style={{ paddingVertical: 6 }}>
            <LinkRow
              icon={Heart}
              title={t("app.navPreferences")}
              detail={t("details.settingsPreferencesDetail")}
              onPress={() => {
                navigate("preferences");
                close();
              }}
            />
            <LinkRow
              icon={Shapes}
              title={t("app.navApps")}
              detail={t("details.settingsAppsDetail")}
              onPress={() => {
                navigate("apps");
                close();
              }}
            />
            <LinkRow
              icon={CircleUserRound}
              title={t("details.settingsAccountTitle")}
              detail={t("details.settingsAccountDetail")}
              onPress={() => {
                navigate("account");
                close();
              }}
            />
          </Card>
        </View>
        <Text style={s.small}>{t("details.settingsPrivacy")}</Text>
      </View>
    </Sheet>
  );
}
function MailDetail({ mail: m }: { mail: Mail }) {
  const { t } = useTranslation();
  const { workspace: w, api, refresh, open, close } = useWorkspace();
  const [error, setError] = useState("");
  const [importing, setImporting] = useState("");
  async function importAttachment(reference: string) {
    setError("");
    setImporting(reference);
    try {
      const file = await api.request<Artifact>("/api/mail/import-attachment", { reference });
      await refresh();
      open({ type: "file", file });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting("");
    }
  }
  const [thread, setThread] = useState<Mail[]>([m]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api
      .request<Mail[]>(`/api/mail/threads/${encodeURIComponent(m.threadId)}`)
      .then((items) => {
        if (active) setThread(items.sort((a, b) => a.date.localeCompare(b.date)));
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, m.threadId, retry]);
  return (
    <Sheet
      title={m.subject}
      subtitle={t(
        thread.length === 1 ? "details.messageInConversation" : "details.messagesInConversation",
        { count: thread.length },
      )}
      onClose={close}
    >
      {loading && (
        <View style={[s.row, { gap: 10, paddingBottom: 16 }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={s.muted}>{t("details.loadingConversation")}</Text>
        </View>
      )}
      {thread.map((message) => (
        <Card key={message.id} style={{ marginBottom: 12 }}>
          <View style={[s.between, { gap: 12 }]}>
            <View style={{ gap: 4, flex: 1 }}>
              <Text style={s.heading}>{message.sender}</Text>
              <Text style={s.small}>{message.from}</Text>
              <Text style={s.small}>
                {t("details.toLine", { recipients: message.to.join(", ") })}
              </Text>
            </View>
            <Text style={[s.small, s.metric]}>
              {dateLabel(message.date)} · {timeLabel(message.date)}
            </Text>
          </View>
          <View style={s.divider} />
          <Text selectable style={s.text}>
            {message.body}
          </Text>
          {message.attachments.map((id) => {
            const file = w.files.find((f) => f.id === id);
            return file ? (
              <LinkRow
                key={id}
                title={file.name}
                detail={
                  fileKind(file) === "html"
                    ? t("screens.filesWebPage")
                    : t("details.pdfAttachment", { pages: file.pageCount })
                }
                icon={FileText}
                onPress={() => open({ type: "file", file })}
              />
            ) : (
              <Button
                key={id}
                busy={importing === id}
                icon={FileText}
                onPress={() => void importAttachment(id)}
              >
                {decodeURIComponent(id.split(":").slice(2).join(":")) ||
                  t("details.openAttachment")}
              </Button>
            );
          })}
        </Card>
      ))}
      <ErrorNotice error={error} />
      {!!error && (
        <Button onPress={() => setRetry(retry + 1)}>{t("details.reloadConversation")}</Button>
      )}
      <Button
        primary
        icon={Reply}
        style={{ alignSelf: "flex-start" }}
        onPress={() =>
          open({
            type: "email",
            draft: {
              to: [m.from],
              subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
              body: "",
              cc: [],
              bcc: [],
              attachmentIds: [],
              threadId: m.threadId,
              replyToMessageId: m.id,
            },
          })
        }
      >
        {t("details.writeReply")}
      </Button>
    </Sheet>
  );
}
function EmailEditor({ draft }: { draft?: Partial<EmailDraft> & { id?: string } }) {
  const { t } = useTranslation();
  const { workspace: w, api, refresh, open, close, notify } = useWorkspace();
  const [to, setTo] = useState(draft?.to?.join(", ") || "");
  const [cc, setCc] = useState(draft?.cc?.join(", ") || "");
  const [bcc, setBcc] = useState(draft?.bcc?.join(", ") || "");
  const [subject, setSubject] = useState(draft?.subject || "");
  const [body, setBody] = useState(draft?.body || "");
  const [attachments, setAttachments] = useState(draft?.attachmentIds || []);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  function emails(value: string) {
    return value
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  async function save(review: boolean) {
    setBusy(review ? "review" : "draft");
    setError("");
    try {
      const parsed = emailDraftSchema.safeParse({
        to: emails(to),
        cc: emails(cc),
        bcc: emails(bcc),
        subject,
        body,
        attachmentIds: attachments,
        threadId: draft?.threadId,
        replyToMessageId: draft?.replyToMessageId,
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"),
        );
      if (review) {
        const action = await api.request<ActionProposal>("/api/actions", {
          kind: "email.send",
          data: parsed.data,
        });
        await refresh();
        open({ type: "review", action });
      } else {
        await api.request("/api/drafts", {
          ...parsed.data,
          ...(draft?.id ? { id: draft.id } : {}),
        });
        await refresh();
        notify(t("details.draftSaved"));
        close();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <Sheet
      title={draft?.threadId ? t("details.writeReply") : t("details.newMessage")}
      subtitle={t("details.emailFrom", { email: w.profile.email })}
      onClose={close}
    >
      <Field
        label={t("details.to")}
        value={to}
        onChangeText={setTo}
        placeholder={t("details.toPlaceholder")}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field
            label={t("details.cc")}
            value={cc}
            onChangeText={setCc}
            placeholder={t("details.optional")}
            autoCapitalize="none"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={t("details.bcc")}
            value={bcc}
            onChangeText={setBcc}
            placeholder={t("details.optional")}
            autoCapitalize="none"
          />
        </View>
      </View>
      <Field
        label={t("details.subject")}
        value={subject}
        onChangeText={setSubject}
        placeholder={t("details.subjectPlaceholder")}
      />
      <Field
        label={t("details.message")}
        value={body}
        onChangeText={setBody}
        multiline
        placeholder={t("details.messagePlaceholder")}
        style={{ minHeight: 210 }}
      />
      {w.files.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <Text style={[s.heading, { fontSize: 13, marginBottom: 4 }]}>
            {t("details.attachments")}
          </Text>
          {w.files.map((f) => (
            <CheckRow
              key={f.id}
              checked={attachments.includes(f.id)}
              label={t("details.fileSizeLabel", {
                name: f.name,
                size: Math.max(1, Math.round(f.size / 1024)),
              })}
              onPress={() =>
                setAttachments(
                  attachments.includes(f.id)
                    ? attachments.filter((id) => id !== f.id)
                    : [...attachments, f.id],
                )
              }
            />
          ))}
        </Card>
      )}
      <ErrorNotice error={error} />
      <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
        <Button
          primary
          icon={ShieldCheck}
          busy={busy === "review"}
          disabled={!!busy}
          onPress={() => void save(true)}
        >
          {t("details.reviewEmail")}
        </Button>
        <Button
          icon={Save}
          busy={busy === "draft"}
          disabled={!!busy}
          onPress={() => void save(false)}
        >
          {t("details.saveDraft")}
        </Button>
      </View>
      <Text style={[s.small, { marginTop: 13 }]}>{t("details.reviewNote")}</Text>
    </Sheet>
  );
}
function EventEditor({
  event: e,
  draft,
  neighbors,
}: {
  event?: CalendarEvent;
  draft?: EventDraft;
  neighbors?: CalendarEvent[];
}) {
  const { t } = useTranslation();
  const seed = e || draft;
  const { workspace: w, api, open, close, refresh } = useWorkspace();
  const initialStart = new Date();
  initialStart.setMinutes(0, 0, 0);
  initialStart.setHours(initialStart.getHours() + 1);
  const [title, setTitle] = useState(seed?.title || "");
  const [start, setStart] = useState(seed?.start || initialStart.toISOString());
  const [end, setEnd] = useState(
    seed?.end || new Date(initialStart.getTime() + 3600000).toISOString(),
  );
  const [allDay, setAllDay] = useState(seed?.allDay || false);
  const [zone, setZone] = useState(
    seed?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [location, setLocation] = useState(seed?.location || "");
  const [description, setDescription] = useState(seed?.description || "");
  const [attendees, setAttendees] = useState(seed?.attendees.join(", ") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const conflicts = (neighbors || w.events).filter(
    (item) =>
      item.id !== e?.id &&
      Date.parse(start) < Date.parse(item.end) &&
      Date.parse(end) > Date.parse(item.start),
  );
  async function propose(remove = false) {
    setBusy(true);
    setError("");
    try {
      let data: ProposalInput;
      if (remove && e) {
        data = {
          kind: "calendar.delete",
          data: { eventId: e.id, calendarId: e.calendarId, title: e.title },
        };
      } else {
        const parsed = eventDraftSchema.safeParse({
          calendarId: e?.calendarId || draft?.calendarId || "primary",
          title,
          start,
          end,
          allDay,
          timeZone: zone,
          location,
          description,
          attendees: attendees
            .split(/[,;\n]/)
            .map((a) => a.trim())
            .filter(Boolean),
        });
        if (!parsed.success)
          throw new Error(
            parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"),
          );
        data = e
          ? { kind: "calendar.update", data: { ...parsed.data, eventId: e.id } }
          : { kind: "calendar.create", data: parsed.data };
      }
      const action = await api.request<ActionProposal>("/api/actions", data);
      await refresh();
      open({ type: "review", action });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={e ? t("details.editEventTitle") : t("details.newEventTitle")}
      subtitle={e ? t("details.editEventSubtitle") : t("details.newEventSubtitle")}
      onClose={close}
    >
      <Field
        label={t("details.eventTitle")}
        value={title}
        onChangeText={setTitle}
        placeholder={t("details.eventTitlePlaceholder")}
      />
      <CheckRow
        label={t("details.allDayEvent")}
        checked={allDay}
        onPress={() => {
          try {
            if (!allDay) {
              const local = localDateTime(start, zone);
              const endDay = new Date(`${local.date}T12:00:00Z`);
              endDay.setUTCDate(endDay.getUTCDate() + 1);
              setStart(local.date);
              setEnd(endDay.toISOString().slice(0, 10));
            } else {
              setStart(zonedInstant(start, "09:00", zone));
              setEnd(zonedInstant(start, "10:00", zone));
            }
            setAllDay(!allDay);
            setError("");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        }}
      />
      <DateTimeEditor
        label={t("details.starts")}
        value={start}
        onChange={setStart}
        timeZone={zone}
        allDay={allDay}
      />
      <DateTimeEditor
        label={t("details.ends")}
        value={end}
        onChange={setEnd}
        timeZone={zone}
        allDay={allDay}
      />
      {allDay && <Text style={[s.small, { marginBottom: 15 }]}>{t("details.allDayNote")}</Text>}
      <Field
        label={t("details.timeZone")}
        value={zone}
        onChangeText={setZone}
        placeholder={t("details.timeZonePlaceholder")}
      />
      <Field
        label={t("details.locationLabel")}
        value={location}
        onChangeText={setLocation}
        placeholder={t("details.optional")}
      />
      <Field
        label={t("details.attendees")}
        value={attendees}
        onChangeText={setAttendees}
        placeholder={t("details.attendeesPlaceholder")}
      />
      <Field
        label={t("details.notes")}
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder={t("details.notesPlaceholder")}
      />
      {!!conflicts.length && (
        <Card style={{ backgroundColor: colors.orange, padding: 16, marginBottom: 16 }}>
          <Text style={s.heading}>{t("details.timeOverlap")}</Text>
          {conflicts.map((c) => (
            <Text key={c.id} style={s.muted}>
              {c.title} · {timeLabel(c.start, c.timeZone)}–{timeLabel(c.end, c.timeZone)}
            </Text>
          ))}
        </Card>
      )}
      <ErrorNotice error={error} />
      <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
        <Button primary icon={ShieldCheck} busy={busy} onPress={() => void propose()}>
          {e ? t("details.reviewChanges") : t("details.reviewEvent")}
        </Button>
        {e && (
          <Button icon={Trash2} disabled={busy} danger onPress={() => void propose(true)}>
            {t("details.reviewDeletion")}
          </Button>
        )}
      </View>
    </Sheet>
  );
}
function ReviewDetail({ initial }: { initial: ActionProposal }) {
  const { t } = useTranslation();
  const { workspace: w, api, refresh, close, open } = useWorkspace();
  const [local, setLocal] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const action =
    local.status !== initial.status ? local : w.actions.find((a) => a.id === initial.id) || local;
  const d = action.data;
  const pending = action.status === "awaiting_review";
  async function decide(decision: "approve" | "deny") {
    setBusy(true);
    setError("");
    try {
      const result = await api.request<ActionProposal>(`/api/actions/${action.id}/decide`, {
        decision,
        hash: action.hash,
      });
      setLocal(result);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function edit() {
    setBusy(true);
    setError("");
    try {
      let next: Detail;
      if (action.kind === "email.send")
        next = { type: "email", draft: emailDraftSchema.parse(action.data) };
      else {
        const draft = eventDraftSchema.parse(action.data);
        if (action.kind === "calendar.update") {
          const eventId = action.data.eventId;
          if (typeof eventId !== "string" || !eventId)
            throw new Error("The event reference is missing. Open the event in Calendar again.");
          next = { type: "event", event: { ...draft, id: eventId } };
        } else next = { type: "event", draft };
      }
      await api.request(`/api/actions/${action.id}/decide`, {
        decision: "deny",
        hash: action.hash,
      });
      await refresh();
      open(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const email = action.kind === "email.send";
  return (
    <Sheet
      title={pending ? t("details.oneLastLook") : action.title}
      subtitle={w.mode === "sample" ? t("details.sampleActionNote") : t("details.reviewActionNote")}
      onClose={close}
    >
      <View style={[s.row, { gap: 13, marginBottom: 21 }]}>
        <View style={[s.iconBox, { backgroundColor: colors.surface }]}>
          <ShieldCheck size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.heading}>{action.title}</Text>
          <Text style={s.small}>{action.kind.replace(".", " · ")}</Text>
        </View>
        <Chip tint={pending ? colors.surface : colors.green}>{statusLabel(action.status)}</Chip>
      </View>
      <Card style={{ gap: 13 }}>
        <ReviewLine label={t("details.account")} value={action.account || w.profile.email} />
        {email ? (
          <>
            <ReviewLine label={t("details.to")} value={arrayText(d.to)} />
            <ReviewLine label={t("details.cc")} value={arrayText(d.cc) || t("details.none")} />
            <ReviewLine label={t("details.bcc")} value={arrayText(d.bcc) || t("details.none")} />
            <ReviewLine label={t("details.subject")} value={String(d.subject || "")} />
            <View style={s.divider} />
            <Text selectable style={[s.text, { lineHeight: 25 }]}>
              {String(d.body || "")}
            </Text>
            <View style={s.divider} />
            <Text style={s.label}>{t("details.attachments")}</Text>
            {Array.isArray(d.attachmentIds) && d.attachmentIds.length ? (
              d.attachmentIds.map((id) => {
                const file = w.files.find((f) => f.id === id);
                return (
                  <Text key={String(id)} style={s.text}>
                    {t("details.attachmentVersion", {
                      name: file?.name || String(id),
                      version: String(id).slice(-8),
                    })}
                  </Text>
                );
              })
            ) : (
              <Text style={s.muted}>{t("details.noAttachments")}</Text>
            )}
          </>
        ) : (
          <>
            <ReviewLine label={t("details.eventLabel")} value={String(d.title || "")} />
            {action.kind !== "calendar.delete" && (
              <>
                <ReviewLine
                  label={t("details.starts")}
                  value={
                    d.allDay
                      ? String(d.start || "")
                      : `${dateLabel(String(d.start || ""), { year: "numeric", month: "short", day: "numeric", timeZone: String(d.timeZone || "UTC") })} · ${timeLabel(String(d.start || ""), String(d.timeZone || "UTC"))}`
                  }
                />
                <ReviewLine
                  label={t("details.ends")}
                  value={
                    d.allDay
                      ? t("details.endExclusive", { date: String(d.end || "") })
                      : `${dateLabel(String(d.end || ""), { year: "numeric", month: "short", day: "numeric", timeZone: String(d.timeZone || "UTC") })} · ${timeLabel(String(d.end || ""), String(d.timeZone || "UTC"))}`
                  }
                />
                <ReviewLine label={t("details.timeZone")} value={String(d.timeZone || "")} />
                <ReviewLine
                  label={t("details.allDay")}
                  value={d.allDay ? t("details.yes") : t("details.no")}
                />
                <ReviewLine
                  label={t("details.location")}
                  value={String(d.location || t("details.none"))}
                />
                <ReviewLine
                  label={t("details.attendees")}
                  value={arrayText(d.attendees) || t("details.justYou")}
                />
                <ReviewLine
                  label={t("details.notes")}
                  value={String(d.description || t("details.none"))}
                />
              </>
            )}
            <ReviewLine label={t("app.titleCalendar")} value={String(d.calendarId || "primary")} />
            <Text style={s.small}>
              {action.kind === "calendar.delete"
                ? t("details.deleteEventNote")
                : t("details.updateEventNote")}
            </Text>
          </>
        )}
      </Card>
      <ErrorNotice error={error || action.error} />
      {!!action.result && (
        <Card style={{ marginTop: 16, backgroundColor: colors.green, padding: 18 }}>
          <Text selectable style={s.text}>
            {resultSummary(action.result)}
          </Text>
        </Card>
      )}
      {pending ? (
        <>
          <Text style={[s.small, { marginVertical: 17 }]}>
            {t("details.reviewExpires", {
              date: new Date(action.expiresAt).toLocaleString(activeLocaleTag(), {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              }),
            })}
          </Text>
          <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
            <Button primary icon={Check} busy={busy} onPress={() => void decide("approve")}>
              {w.mode === "sample"
                ? t("details.approveLocally")
                : email
                  ? t("details.approveAndSend")
                  : t("details.approveChange")}
            </Button>
            {action.kind !== "calendar.delete" && (
              <Button icon={Edit3} disabled={busy} onPress={() => void edit()}>
                {t("details.editDetails")}
              </Button>
            )}
            <Button icon={X} disabled={busy} onPress={() => void decide("deny")}>
              {t("details.dontProceed")}
            </Button>
          </View>
        </>
      ) : (
        <Button style={{ alignSelf: "flex-start", marginTop: 19 }} onPress={close}>
          {t("details.done")}
        </Button>
      )}
    </Sheet>
  );
}
function arrayText(value: unknown) {
  return Array.isArray(value) ? value.map(String).join(", ") : "";
}
function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <Text selectable style={s.text}>
        {value}
      </Text>
    </View>
  );
}
function FileDetail({ file: f }: { file: Artifact }) {
  const { t } = useTranslation();
  const { api, refresh, open, close } = useWorkspace();
  const kind = fileKind(f);
  const extension = fileExtension(f);
  const textPreview = kind === "markdown" || kind === "text" || extension === "csv";
  const [content, setContent] = useState<string | undefined>();
  const [contentError, setContentError] = useState("");
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      (f.fields || [])
        .filter((field) => field.type !== "unsupported")
        .map((field) => [
          field.name,
          field.type === "checkbox" ? field.value === "true" || field.value === "Yes" : field.value,
        ]),
    ),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = api.url(f.url || `/api/files/${f.id}/content`);
  useEffect(() => {
    if (kind !== "html" && !textPreview) return;
    let active = true;
    setContent(undefined);
    setContentError("");
    void api
      .text(`/api/files/${f.id}/content`)
      .then((text) => {
        if (active) setContent(text);
      })
      .catch((e) => {
        if (active) setContentError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [api, f.id, kind, textPreview]);
  async function fill() {
    setBusy(true);
    setError("");
    try {
      const file = await api.request<Artifact>(`/api/files/${f.id}/fill`, { fields: values });
      await refresh();
      open({ type: "file", file });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    setError("");
    try {
      if (Platform.OS === "web") {
        await Linking.openURL(url);
        return;
      }
      const fallbackExtension =
        kind === "html"
          ? "html"
          : kind === "markdown"
            ? "md"
            : kind === "image"
              ? "png"
              : kind === "word"
                ? "docx"
                : kind === "excel"
                  ? "xlsx"
                  : kind === "ppt"
                    ? "pptx"
                    : kind === "text"
                      ? "txt"
                      : "pdf";
      const shareExtension = extension || fallbackExtension;
      const target = `${FileSystem.cacheDirectory}${f.id}.${shareExtension}`;
      await FileSystem.downloadAsync(url, target, {
        headers: { Authorization: `Bearer ${api.token}` },
      });
      if (await Sharing.isAvailableAsync()) {
        const uti =
          kind === "pdf"
            ? "com.adobe.pdf"
            : kind === "html"
              ? "public.html"
              : kind === "image"
                ? "public.image"
                : kind === "text" || kind === "markdown"
                  ? "public.plain-text"
                  : undefined;
        await Sharing.shareAsync(target, {
          mimeType: fileMimeType(f),
          ...(uti ? { UTI: uti } : {}),
        });
      } else throw new Error("Sharing is not available on this device.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const typeLabel =
    kind === "html"
      ? t("screens.filesKindHtml")
      : kind === "markdown"
        ? t("screens.filesKindMarkdown")
        : kind === "image"
          ? t("screens.filesKindImage")
          : kind === "word"
            ? t("screens.filesKindWord")
            : kind === "excel"
              ? extension === "csv"
                ? "CSV"
                : t("screens.filesKindExcel")
              : kind === "ppt"
                ? t("screens.filesKindPpt")
                : kind === "text"
                  ? t("screens.filesKindText")
                  : t("screens.filesKindOther");
  if (kind === "html")
    return (
      <Sheet
        title={f.name}
        subtitle={t("details.htmlSubtitle", {
          size: Math.max(1, Math.round(f.size / 1024)),
          source: f.source,
        })}
        onClose={close}
        fullscreen
      >
        {contentError ? (
          <ErrorNotice error={contentError} />
        ) : content === undefined ? (
          <View style={{ flex: 1, minHeight: 240, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <HtmlPreview html={content} title={f.name} interactive />
        )}
        <View style={[s.row, { gap: 10, marginVertical: 18, flexWrap: "wrap" }]}>
          <Button icon={Download} onPress={() => void share()}>
            {Platform.OS === "web" ? t("details.openDownload") : t("details.saveOrShare")}
          </Button>
          <Button
            icon={Send}
            onPress={() => open({ type: "email", draft: { attachmentIds: [f.id] } })}
          >
            {t("details.attachToEmail")}
          </Button>
        </View>
        <ErrorNotice error={error} />
        <Text style={[s.small, { marginTop: 15 }]}>
          {t("details.addedFile", { date: dateLabel(f.createdAt) })}
        </Text>
      </Sheet>
    );
  const previewText = content && content.length > 200_000 ? content.slice(0, 200_000) : content;
  const previewTruncated = !!content && content.length > 200_000;
  return (
    <Sheet
      title={f.name}
      subtitle={
        kind === "pdf"
          ? t("details.fileSubtitle", {
              pages: f.pageCount,
              size: Math.max(1, Math.round(f.size / 1024)),
              source: f.source,
            })
          : t("details.fileSubtitleByType", {
              type: typeLabel,
              size: Math.max(1, Math.round(f.size / 1024)),
              source: f.source,
            })
      }
      onClose={close}
      wide
    >
      {kind === "pdf" ? (
        <PdfReader url={url} token={api.token} pageCount={f.pageCount} />
      ) : kind === "image" ? (
        <Image
          source={{ uri: url }}
          resizeMode="contain"
          accessibilityLabel={f.name}
          style={{
            width: "100%",
            height: 460,
            borderRadius: radius.card,
            backgroundColor: colors.surface,
          }}
        />
      ) : kind === "markdown" ? (
        contentError ? (
          <ErrorNotice error={contentError} />
        ) : previewText === undefined ? (
          <View style={{ minHeight: 280, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={{ height: 560, minHeight: 0 }}>
            <HtmlPreview html={markdownPreviewDocument(previewText, f.name)} title={f.name} />
          </View>
        )
      ) : textPreview ? (
        contentError ? (
          <ErrorNotice error={contentError} />
        ) : previewText === undefined ? (
          <View style={{ minHeight: 240, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <Card>
            <Text selectable style={s.text}>
              {previewText}
            </Text>
            {previewTruncated && (
              <Text style={[s.small, { marginTop: 12 }]}>{t("details.textPreviewTruncated")}</Text>
            )}
          </Card>
        )
      ) : (
        <Card>
          <SectionHeading title={typeLabel} />
          <Text style={s.muted}>{t("details.officePreviewUnavailable")}</Text>
          <Text style={[s.small, { marginTop: 8 }]}>{t("details.officePreviewHint")}</Text>
        </Card>
      )}
      <View style={[s.row, { gap: 10, marginVertical: 18, flexWrap: "wrap" }]}>
        <Button icon={Download} onPress={() => void share()}>
          {Platform.OS === "web" ? t("details.openDownload") : t("details.saveOrShare")}
        </Button>
        <Button
          icon={Send}
          onPress={() => open({ type: "email", draft: { attachmentIds: [f.id] } })}
        >
          {t("details.attachToEmail")}
        </Button>
      </View>
      {f.fields && f.fields.length > 0 && (
        <Card>
          <SectionHeading title={t("details.fillForm")} />
          <Text style={[s.muted, { marginBottom: 18 }]}>{t("details.fillFormNote")}</Text>
          {f.fields.map((field) =>
            field.type === "unsupported" ? (
              <Text key={field.name} style={s.muted}>
                {t("details.unsupportedField", { name: field.name })}
              </Text>
            ) : field.type === "checkbox" ? (
              <CheckRow
                key={field.name}
                checked={!!values[field.name]}
                label={field.name.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase())}
                onPress={() => setValues({ ...values, [field.name]: !values[field.name] })}
              />
            ) : (
              <Field
                key={field.name}
                label={field.name.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase())}
                value={String(values[field.name] || "")}
                onChangeText={(value) => setValues({ ...values, [field.name]: value })}
              />
            ),
          )}
          <Button primary icon={Save} busy={busy} onPress={() => void fill()}>
            {t("details.saveFilledCopy")}
          </Button>
        </Card>
      )}
      <ErrorNotice error={error} />
      <Text style={[s.small, { marginTop: 15 }]}>
        {t(f.parentId ? "details.addedFilledCopy" : "details.addedFile", {
          date: dateLabel(f.createdAt),
        })}
      </Text>
    </Sheet>
  );
}

/**
 * 今日领悟专用阅读浮层。
 *
 * 与通用研究产物详情不同，这里先呈现可快速阅读的结论、依据和行动，
 * 完整 HTML 报告仍从对话、资料库或搜索结果进入 `ArtifactDetail`。
 */
function InsightDetail({ artifact }: { artifact: AgentArtifact }) {
  const { api, ask, close, navigate, notify, open } = useWorkspace();
  const { t } = useTranslation();
  useWatchlistState();
  const savedInsightIds = useSavedInsightIds();
  const view = workbenchInsightView(artifact);
  const saved = savedInsightIds.includes(artifact.id);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [plainOpen, setPlainOpen] = useState(false);
  const [disagreeOpen, setDisagreeOpen] = useState(false);
  const [disagreement, setDisagreement] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [addingSymbol, setAddingSymbol] = useState(false);
  const [symbolError, setSymbolError] = useState("");
  const watchlist = activeWatchlist();
  const code = view.code ? normalizeCode(view.code) : "";
  const watched = code
    ? watchlist?.symbols.find((item) => item.symbol.code === code)?.symbol
    : undefined;
  const evidence = [
    { label: t("ui.insightBasis"), value: view.basis },
    { label: t("ui.insightLimits"), value: view.limits },
    { label: t("ui.insightRevisit"), value: view.revisit },
  ].filter((item) => !!item.value);
  const noteContent = [
    view.takeaway,
    view.basis ? `${t("ui.insightBasis")}: ${view.basis}` : undefined,
    view.limits ? `${t("ui.insightLimits")}: ${view.limits}` : undefined,
    view.revisit ? `${t("ui.insightRevisit")}: ${view.revisit}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");

  const explainSimply = () => {
    if (view.plain) {
      setPlainOpen((current) => !current);
      return;
    }
    ask(t("workbench.insightSimplifyPrompt", { title: view.title }));
    close();
  };

  const addToWatchlist = async () => {
    if (!watchlist || !code || addingSymbol) return;
    setAddingSymbol(true);
    setSymbolError("");
    try {
      const matches = await searchSymbols(api, code, 20);
      const exact = matches.find((item) => {
        const candidate = normalizeCode(item.code);
        return candidate === code || (!code.includes(".") && candidate.split(".")[0] === code);
      });
      if (!exact) {
        setSymbolError(t("workbench.insightSymbolNotFound"));
        return;
      }
      addSymbols(api, watchlist.id, [exact]);
      notify(t("workbench.insightAddedWatchlist", { name: exact.name }));
    } catch (error) {
      setSymbolError(error instanceof Error ? error.message : String(error));
    } finally {
      setAddingSymbol(false);
    }
  };

  return (
    <>
      <Sheet title={t("workbench.insightCard")} onClose={close} narrow>
        <View style={{ gap: 18 }}>
          <View style={[s.between, { gap: 12, alignItems: "flex-start" }]}>
            <Text style={s.label}>{view.category || statusLabel(artifact.kind)}</Text>
            <Text style={[s.small, s.metric, { textAlign: "right" }]}>
              {dateLabel(artifact.createdAt)} · {statusLabel(artifact.kind)}
            </Text>
          </View>

          <Text
            selectable
            style={[
              typography.insightTitle,
              { fontSize: 22, lineHeight: 34, color: colors.heading },
            ]}
          >
            {view.title}
          </Text>

          {!!view.takeaway && (
            <Text selectable style={[s.muted, { marginTop: -7 }]}>
              {view.takeaway}
            </Text>
          )}

          {(view.symbolName || view.code) && (
            <Pressable
              accessibilityRole={watched ? "button" : undefined}
              disabled={!watched}
              onPress={() => {
                if (!watched || !watchlist) return;
                open({
                  type: "symbol",
                  symbol: watched,
                  watchlist: { id: watchlist.id, name: watchlist.name },
                });
              }}
              style={({ pressed }) => ({
                minHeight: 34,
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 10,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: pressed && watched ? colors.surface : colors.paper,
              })}
            >
              <Text style={{ fontSize: 12, color: colors.text }}>
                {[view.symbolName, view.code].filter(Boolean).join(" · ")}
              </Text>
              {!!watched && <ChevronDown size={13} color={colors.faint} />}
            </Pressable>
          )}

          {evidence.length > 0 && (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: evidenceOpen }}
                onPress={() => setEvidenceOpen((current) => !current)}
                style={{
                  minHeight: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <Text style={[s.text, { fontSize: 13, fontWeight: "600" }]}>
                  {t("workbench.insightEvidenceHeading")}
                </Text>
                {evidenceOpen ? (
                  <ChevronUp size={15} color={colors.faint} />
                ) : (
                  <ChevronDown size={15} color={colors.faint} />
                )}
              </Pressable>
              {evidenceOpen && (
                <View
                  style={{
                    gap: 13,
                    padding: 13,
                    borderRadius: radius.card,
                    backgroundColor: colors.surfaceSoft,
                  }}
                >
                  {evidence.map((item) => (
                    <View key={item.label} style={{ gap: 4 }}>
                      <Text style={s.label}>{item.label}</Text>
                      <Text selectable style={s.muted}>
                        {item.value}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={[s.row, { flexWrap: "wrap", gap: 20 }]}>
            <Pressable
              accessibilityRole="button"
              onPress={explainSimply}
              style={[s.row, { minHeight: 32, gap: 5 }]}
            >
              <Sparkles size={13} color={colors.link} />
              <Text style={[s.small, { color: colors.link }]}>
                {t(plainOpen ? "ui.showLess" : "ui.insightSimplify")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: disagreeOpen }}
              onPress={() => setDisagreeOpen((current) => !current)}
              style={[s.row, { minHeight: 32, gap: 5 }]}
            >
              <Edit3 size={13} color={colors.link} />
              <Text style={[s.small, { color: colors.link }]}>{t("ui.insightDisagree")}</Text>
            </Pressable>
          </View>

          {plainOpen && view.plain && (
            <View
              style={{
                gap: 5,
                padding: 13,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.card,
                backgroundColor: colors.surfaceSoft,
              }}
            >
              <Text style={s.label}>{t("ui.insightSimplify")}</Text>
              <Text selectable style={s.muted}>
                {view.plain}
              </Text>
            </View>
          )}

          {disagreeOpen && (
            <View style={[s.card, { gap: 10, backgroundColor: colors.surfaceSoft }]}>
              <Text style={s.heading}>{t("workbench.insightDisagreeTitle")}</Text>
              <TextInput
                value={disagreement}
                onChangeText={(value) => setDisagreement(value.slice(0, 1000))}
                multiline
                placeholder={t("workbench.insightDisagreePlaceholder")}
                placeholderTextColor={colors.faint}
                accessibilityLabel={t("workbench.insightDisagreeTitle")}
                style={[s.input, { minHeight: 96, textAlignVertical: "top", paddingTop: 9 }]}
              />
              <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                <Button
                  primary
                  small
                  disabled={!disagreement.trim()}
                  onPress={() => {
                    ask(
                      `${t("workbench.insightDisagreePrompt", {
                        title: view.title,
                      })}\n\n${disagreement.trim()}`,
                    );
                    close();
                  }}
                >
                  {t("workbench.insightDisagreeSubmit")}
                </Button>
                <Button small onPress={() => setDisagreeOpen(false)}>
                  {t("workbench.insightCancel")}
                </Button>
              </View>
            </View>
          )}

          <ErrorNotice error={symbolError} />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
              paddingTop: 15,
              borderTopWidth: 1,
              borderTopColor: colors.line,
            }}
          >
            <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
              <Button
                small
                icon={saved ? Check : Star}
                style={{
                  backgroundColor: saved ? colors.sky : colors.surface,
                  borderColor: saved ? colors.accentLine : colors.line,
                }}
                onPress={() => {
                  toggleSavedInsight(artifact.id);
                  notify(
                    t(saved ? "workbench.insightUnsavedNotice" : "workbench.insightSavedNotice"),
                  );
                }}
              >
                {t(saved ? "workbench.insightSavedLabel" : "ui.saveInsight")}
              </Button>
              {watchlist && code && watched && (
                <Button
                  small
                  icon={ExternalLink}
                  onPress={() => {
                    close();
                    navigate("watchlist");
                  }}
                >
                  {t("workbench.insightViewWatchlist")}
                </Button>
              )}
              {watchlist && code && !watched && (
                <Button small icon={Plus} busy={addingSymbol} onPress={() => void addToWatchlist()}>
                  {t("workbench.insightAddWatchlist")}
                </Button>
              )}
              <Button
                small
                icon={ExternalLink}
                onPress={() => open({ type: "artifact", artifact })}
              >
                {t("agent.artifactOpenDetail")}
              </Button>
            </View>
            <Button primary small icon={Pencil} onPress={() => setNoteOpen(true)}>
              {t("workbench.insightWriteNote")}
            </Button>
          </View>
        </View>
      </Sheet>
      {noteOpen && (
        <NoteEditorSheet
          api={api}
          defaultSymbol={code || undefined}
          defaultTitle={view.title}
          defaultContent={noteContent}
          onClose={() => setNoteOpen(false)}
          onSaved={() => {
            setNoteOpen(false);
            notify(t("workbench.insightNoteSaved"));
          }}
        />
      )}
    </>
  );
}
/**
 * 研究产物详情：把 `AgentArtifact` 的标题/摘要/全部数据渲染成一张自包含
 * 的 HTML 网页。Web 端用 iframe(`srcDoc`) 展示、原生端用 WebView 展示，
 * 与「对话里只显示标题提示、点击弹出网页详情」的交互保持一致。
 */
function ArtifactDetail({ artifact }: { artifact: AgentArtifact }) {
  const { ask, close, notify } = useWorkspace();
  const { t } = useTranslation();
  const savedInsightIds = useSavedInsightIds();
  const [plainOpen, setPlainOpen] = useState(false);
  const html = useMemo(() => renderArtifactHtml(artifact), [artifact]);
  const hasHtmlPreview = useMemo(() => artifactHasHtmlPreview(artifact), [artifact]);
  // 三段与浅释只在 artifact.data 明确提供时展示，不用模板内容补造结论。
  const view = workbenchInsightView(artifact);
  const sections = [
    { label: t("ui.insightBasis"), value: view.basis },
    { label: t("ui.insightLimits"), value: view.limits },
    { label: t("ui.insightRevisit"), value: view.revisit },
  ].filter((item) => !!item.value);
  const saved = savedInsightIds.includes(artifact.id);

  const explainSimply = () => {
    if (view.plain) {
      setPlainOpen((current) => !current);
      return;
    }
    ask(t("workbench.insightSimplifyPrompt", { title: view.title }));
    close();
  };

  const disagree = () => {
    ask(t("workbench.insightDisagreePrompt", { title: view.title }));
    close();
  };

  return (
    <Sheet
      title={artifact.title}
      subtitle={`${statusLabel(artifact.kind)} · ${dateLabel(artifact.createdAt)}`}
      onClose={close}
      fullscreen
    >
      <View style={[s.row, { flexWrap: "wrap", gap: 8, marginBottom: 16 }]}>
        <Button
          small
          icon={Star}
          onPress={() => {
            toggleSavedInsight(artifact.id);
            notify(t(saved ? "workbench.insightUnsavedNotice" : "workbench.insightSavedNotice"));
          }}
        >
          {t(saved ? "ui.unsaveInsight" : "ui.saveInsight")}
        </Button>
        <Button small onPress={explainSimply}>
          {t(plainOpen ? "ui.showLess" : "ui.insightSimplify")}
        </Button>
        <Button small onPress={disagree}>
          {t("ui.insightDisagree")}
        </Button>
      </View>
      {plainOpen && view.plain && (
        <View
          style={{
            gap: 5,
            marginBottom: 16,
            padding: 13,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 8,
            backgroundColor: colors.surfaceSoft,
          }}
        >
          <Text style={s.label}>{t("ui.insightSimplify")}</Text>
          <Text style={s.muted}>{view.plain}</Text>
        </View>
      )}
      {sections.length > 0 && (
        <View style={{ gap: 12, marginBottom: 16 }}>
          {sections.map((item) => (
            <View key={item.label} style={{ gap: 3 }}>
              <Text style={s.label}>{item.label}</Text>
              <Text style={s.muted}>{item.value}</Text>
            </View>
          ))}
        </View>
      )}
      <HtmlPreview html={html} title={artifact.title} interactive={hasHtmlPreview} />
    </Sheet>
  );
}
function BrowserDetail({ initial }: { initial: BrowserSession }) {
  const { t } = useTranslation();
  const { workspace: w, api, refresh, close, notify } = useWorkspace();
  const [local, setLocal] = useState(initial);
  const [url, setUrl] = useState(initial.url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const latest = w.browsers.find((b) => b.id === initial.id);
  const browser = {
    ...(latest && latest.updatedAt > local.updatedAt ? latest : local),
    consoleUrl: local.consoleUrl,
    previewUrl: local.previewUrl,
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api
      .request<BrowserSession>(`/api/browsers/${initial.id}`)
      .then((session) => {
        if (active) {
          setLocal(session);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [api, initial.id, retry]);
  async function importDownloads() {
    setBusy(true);
    setError("");
    try {
      const result = await api.request<{
        files: Artifact[];
        failures: { name: string; message: string }[];
      }>(`/api/browsers/${browser.id}/import-downloads`, {});
      await refresh();
      if (result.failures.length)
        setError(
          result.failures.map((failure) => `${failure.name}: ${failure.message}`).join("\n"),
        );
      const files = result.files;
      notify(
        files.length
          ? t(files.length === 1 ? "details.pdfDownloadAdded" : "details.pdfDownloadsAdded", {
              count: files.length,
            })
          : t("details.noNewPdfDownloads"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function mutate(end = false) {
    if (busy || loading) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.request<BrowserSession>(
        `/api/browsers/${browser.id}/${end ? "close" : browser.status === "closed" ? "reopen" : "navigate"}`,
        end ? {} : { url: browserAddress(url) },
      );
      setLocal(result);
      setUrl(result.url);
      await refresh();
      if (end) close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={browserSite(browser.url)}
      subtitle={t("details.browserSubtitle", {
        status: browser.status,
        time: timeLabel(browser.updatedAt),
      })}
      onClose={close}
      wide
    >
      <View style={[s.row, { gap: 10, marginBottom: 16 }]}>
        <View style={{ flex: 1 }}>
          <Field
            label={t("details.websiteAddress")}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
            onSubmitEditing={() => void mutate()}
          />
        </View>
        <Button primary busy={busy} disabled={loading || !url.trim()} onPress={() => void mutate()}>
          {browser.status === "closed"
            ? t("details.reopen")
            : browser.status === "error"
              ? t("details.reconnect")
              : t("details.go")}
        </Button>
      </View>
      <ErrorNotice error={error} />
      {loading ? (
        <View style={[s.row, { gap: 10, paddingVertical: 24 }]}>
          {error ? (
            <Button onPress={() => setRetry(retry + 1)}>{t("details.retryConnection")}</Button>
          ) : (
            <>
              <ActivityIndicator color={colors.primary} />
              <Text style={s.muted}>{t("details.connectingBrowser")}</Text>
            </>
          )}
        </View>
      ) : browser.status === "active" && browser.consoleUrl ? (
        <BrowserConsole url={api.url(browser.consoleUrl)} />
      ) : browser.status === "active" && browser.previewUrl ? (
        <Image
          source={{ uri: api.url(browser.previewUrl) }}
          style={{ width: "100%", height: 450, backgroundColor: colors.paper }}
          resizeMode="contain"
        />
      ) : (
        <Empty
          icon={Globe2}
          title={
            browser.status === "closed"
              ? t("details.sessionClosed")
              : t("details.previewUnavailable")
          }
          detail={
            browser.status === "closed"
              ? t("details.sessionClosedDetail")
              : t("details.previewUnavailableDetail")
          }
        />
      )}
      <View style={[s.row, { gap: 10, marginTop: 18, flexWrap: "wrap" }]}>
        {!loading && browser.status === "active" && browser.consoleUrl && (
          <Button
            icon={ExternalLink}
            onPress={() => void Linking.openURL(api.url(browser.consoleUrl || ""))}
          >
            {t("details.openBrowserWindow")}
          </Button>
        )}
        {!loading && (
          <Button icon={RotateCw} disabled={busy} onPress={() => setRetry(retry + 1)}>
            {t("details.refreshConnection")}
          </Button>
        )}
        {!loading && browser.status !== "closed" && (
          <Button icon={Download} busy={busy} onPress={() => void importDownloads()}>
            {t("details.importPdfDownloads")}
          </Button>
        )}
        {!loading && browser.status !== "closed" && (
          <Button icon={X} danger busy={busy} onPress={() => void mutate(true)}>
            {t("details.closeSession")}
          </Button>
        )}
      </View>
    </Sheet>
  );
}
