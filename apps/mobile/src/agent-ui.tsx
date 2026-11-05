import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  type TextStyle,
  useWindowDimensions,
  View,
} from "react-native";
import Markdown, { type MarkdownStyles, type RenderRules } from "react-native-markdown-renderer";
import type { Artifact, BrowserSession } from "../../../packages/domain/src";
import type {
  AgentArtifact,
  AgentTask,
  Evidence,
  Goal,
  Idea,
  Monitor,
  MonitorCurrency,
} from "../../../packages/domain/src/agent";
import { resolveMonitorCurrency } from "../../../packages/domain/src/monitor-currency";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { assistantMarkdown, isSafeAssistantUrl } from "./assistant-markdown";
import { AssistantResponse } from "./assistant-response";
import { fileTypeName } from "./file-kind";
import { activeLocaleTag, type TranslationFn, type TranslationKey, useTranslation } from "./i18n";
import { statusLabel, tr } from "./i18n/translate";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Brain,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Globe2,
  Heart,
  Lightbulb,
  ListChecks,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Target,
  Users,
  X,
} from "./icons";
import { monitorConditionText, monitorScheduleText, WEEKDAYS } from "./monitor-text";
import { notificationExcerpt } from "./notification-text";
import { PageHeader } from "./page-header";
import { StatusBadge, taskStatusTone } from "./status-badge";
import { localizedSymbolName } from "./symbol-names";
import { hasInternalTaskText, presentTask, taskRequiresSetup } from "./task-presentation";
import { breakpoints, fonts, radius } from "./theme";
import { Toggle } from "./toggle";
import {
  Button,
  Card,
  CheckRow,
  Chip,
  colors,
  Empty,
  ErrorNotice,
  Field,
  LinkRow,
  SectionHeading,
  Sheet,
  s,
} from "./ui";
import { type PriceReminderIntent, useWorkspace } from "./workspace";

/**
 * 领域枚举值 -> 展示文案。
 * 实现见 `i18n/translate.ts` 的 `statusLabel`，这里转发一次以保持调用点简洁。
 */
export { statusLabel };

function stamp(value?: string) {
  return value
    ? new Date(value).toLocaleString(activeLocaleTag(), {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : tr("agent.notCheckedYet");
}
function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
function activeTask(task: AgentTask) {
  return !["succeeded", "failed", "cancelled"].includes(task.status);
}

// 来源摘要的 Markdown 渲染：卡片本身空间很小，正文沿用 s.small 规格（11/17），
// 标题逐级缩小并去掉默认下边框，段落与列表边距压缩，避免小卡片里出现大片留白。
const evidenceMarkdownTextStyle: TextStyle = {
  color: colors.muted,
  fontFamily: fonts.serif,
  fontSize: 11,
  lineHeight: 17,
};
const evidenceMarkdownStyle: Partial<MarkdownStyles> = {
  text: evidenceMarkdownTextStyle,
  paragraph: { marginTop: 0, marginBottom: 2 },
  list: { marginBottom: 2 },
  listUnorderedItem: { marginTop: 1 },
  listOrderedItem: { marginTop: 1 },
  listUnorderedItemIcon: { fontFamily: fonts.serif, marginLeft: 0, marginRight: 4, lineHeight: 17 },
  listOrderedItemIcon: { fontFamily: fonts.serif, marginLeft: 0, marginRight: 4, lineHeight: 17 },
  listUnorderedItemText: { fontSize: 11, lineHeight: 17 },
  listOrderedItemText: { fontSize: 11, lineHeight: 17 },
  headingContainer: { marginTop: 3, marginBottom: 1 },
  heading: { fontFamily: fonts.serif },
  heading1: { fontSize: 12, lineHeight: 17, color: colors.text },
  heading2: { fontSize: 12, lineHeight: 17, color: colors.text },
  heading3: { fontSize: 11, lineHeight: 17, color: colors.text },
  heading1Container: { paddingBottom: 0, borderBottomWidth: 0 },
  heading2Container: { paddingBottom: 0, borderBottomWidth: 0 },
  link: { color: colors.primaryStrong, textDecorationLine: "underline" },
  codeInline: {
    backgroundColor: colors.tertiary,
    color: colors.primaryStrong,
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 0,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 10,
  },
  codeBlock: {
    borderRadius: 5,
    backgroundColor: colors.tertiary,
    color: colors.text,
    fontSize: 10,
    lineHeight: 15,
    padding: 8,
  },
  pre: { marginBottom: 2 },
  blockquote: {
    borderLeftWidth: 2,
    borderLeftColor: colors.line,
    paddingHorizontal: 6,
    marginBottom: 2,
  },
  hr: { backgroundColor: colors.line, height: 1, marginTop: 4, marginBottom: 4 },
};
// 文本节点保持 selectable，来源摘要仍可整段复制。
const evidenceMarkdownRules: RenderRules = {
  textgroup: (node, children) => (
    <Text key={node.key} selectable style={evidenceMarkdownTextStyle}>
      {children}
    </Text>
  ),
};
/** 来源摘要中的链接统一过安全校验后再打开，拦截危险协议与非 HTTP(S) 地址。 */
function openEvidenceLink(url: string): boolean {
  if (!isSafeAssistantUrl(url)) return false;
  void Linking.openURL(url).catch(() => {});
  return false;
}

export function AgentStatus() {
  const { t } = useTranslation();
  const { data, error, refresh } = useAgentWorkspace();
  if (data?.worker.running && !error) return null;
  return (
    <View style={{ gap: 8 }}>
      {!!error && <Text style={s.small}>{t("agent.taskLoadUnavailable")}</Text>}
      {!!error && (
        <Button small onPress={() => void refresh().catch(() => {})}>
          {t("agent.reconnectAgent")}
        </Button>
      )}
      {!data && !error && <ActivityIndicator color={colors.primary} />}
      {data && !data.worker.running && <Text style={s.small}>{t("agent.taskContinueLater")}</Text>}
    </View>
  );
}
function taskDisplayLabel(view: ReturnType<typeof presentTask>, t: TranslationFn) {
  if (view.statusOverride === "notCompleted") return t("agent.taskNotCompleted");
  if (view.statusOverride === "retryWaiting") return t("agent.taskRetryWaiting");
  if (view.statusOverride === "monitoring") return t("agent.taskMonitoring");
  return statusLabel(view.status);
}

function TaskDisplayStatus({ view }: { view: ReturnType<typeof presentTask> }) {
  const { t } = useTranslation();
  return (
    <StatusBadge
      tone={
        view.statusOverride === "monitoring"
          ? "running"
          : view.statusOverride === "retryWaiting"
            ? "waiting"
            : view.statusOverride
              ? "paused"
              : taskStatusTone(view.status)
      }
      label={taskDisplayLabel(view, t)}
      style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
    />
  );
}

function TaskProgress({ view }: { view: ReturnType<typeof presentTask> }) {
  const { t } = useTranslation();
  if (!view.totalSteps) return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={s.between}>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
          {t("agent.taskProgressTitle")}
        </Text>
        <Text style={{ color: colors.faint, fontSize: 12, fontVariant: ["tabular-nums"] }}>
          {t("agent.planStepsProgress", { done: view.completedSteps, total: view.totalSteps })}
        </Text>
      </View>
      <View style={{ height: 4, borderRadius: 4, backgroundColor: colors.lineSoft }}>
        <View
          style={{
            height: 4,
            borderRadius: 4,
            backgroundColor: colors.primary,
            width: `${Math.round((view.completedSteps / view.totalSteps) * 100)}%`,
          }}
        />
      </View>
    </View>
  );
}

export function TaskCard({
  task,
  compact = false,
  onOpen,
}: {
  task: AgentTask;
  compact?: boolean;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const { open } = useWorkspace();
  const view = presentTask(task);
  const Icon = task.kind === "monitor" ? Bell : task.kind === "research" ? Sparkles : ListChecks;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("agent.openTaskLabel", { title: view.title })}
      accessibilityHint={
        view.attention
          ? t(view.attention === "review" ? "agent.reviewRequested" : "agent.inputNeeded")
          : taskDisplayLabel(view, t)
      }
      onPress={() => {
        onOpen?.();
        open({ type: "task", taskId: task.id });
      }}
      style={({ pressed }) => ({
        padding: compact ? 12 : 14,
        gap: 10,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 14,
        backgroundColor: pressed ? colors.surfaceRaised : colors.paper,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 11 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            backgroundColor: colors.surfaceRaised,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          <Icon size={17} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 9 }}>
          <Text
            numberOfLines={2}
            style={{
              color: colors.text,
              fontFamily: fonts.sans,
              fontSize: compact ? 13 : 14,
              lineHeight: 22,
              fontWeight: "600",
            }}
          >
            {view.title}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            {view.attention ? (
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 20,
                  color: colors.primaryStrong,
                  fontWeight: "500",
                }}
              >
                {t(view.attention === "review" ? "agent.reviewRequested" : "agent.inputNeeded")}
              </Text>
            ) : (
              <TaskDisplayStatus view={view} />
            )}
            <Text style={{ color: colors.faint, fontSize: 11, lineHeight: 18 }}>
              {stamp(view.updatedAt)}
            </Text>
          </View>
        </View>
        <ChevronRight size={15} color={colors.faint} />
      </View>
    </Pressable>
  );
}
export function ChatWork() {
  const { data } = useAgentWorkspace();
  const tasks = [...(data?.tasks || [])]
    .filter(activeTask)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 2);
  if (!tasks.length) return null;
  return (
    <View style={{ gap: 10 }}>
      {tasks.map((task) => (
        <TaskCard task={task} key={task.id} compact />
      ))}
    </View>
  );
}
type TaskFilter = "all" | "running" | "waiting" | "finished" | "paused";

const TASK_FILTERS: ReadonlyArray<{ id: TaskFilter; labelKey: TranslationKey }> = [
  { id: "all", labelKey: "agent.filterAll" },
  { id: "running", labelKey: "agent.filterInProgress" },
  { id: "waiting", labelKey: "agent.filterWaiting" },
  { id: "finished", labelKey: "agent.filterFinished" },
  { id: "paused", labelKey: "agent.filterPaused" },
];

/** 五态筛选：全部 / 进行中 / 待确认 / 已完成 / 已暂停。 */
function matchesTaskFilter(task: AgentTask, filter: TaskFilter) {
  switch (filter) {
    case "running":
      return ["queued", "running", "scheduled"].includes(task.status);
    case "waiting":
      return ["waiting_input", "waiting_approval"].includes(task.status);
    case "finished":
      return ["succeeded", "failed", "cancelled"].includes(task.status);
    case "paused":
      return task.status === "paused";
    default:
      return true;
  }
}

export function AgentActivityScreen() {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const [filter, setFilter] = useState<TaskFilter>("all");
  // 任务为全局视图：汇总所有 Agent 的全部任务。
  const all = [...(data?.tasks ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const counts = Object.fromEntries(
    TASK_FILTERS.map(({ id }) => [id, all.filter((task) => matchesTaskFilter(task, id)).length]),
  ) as Record<TaskFilter, number>;
  const tasks = all.filter((task) => matchesTaskFilter(task, filter));
  return (
    <View style={{ gap: 10 }}>
      <AgentStatus />
      {/* 五个状态筛选在窄屏自然换行，避免横向滚动隐藏“已暂停”等选项。 */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 4 }}>
        {TASK_FILTERS.map(({ id, labelKey }) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={`${t(labelKey)} ${counts[id]}`}
            accessibilityState={{ selected: filter === id }}
            onPress={() => setFilter(id)}
            style={({ pressed }) => ({
              minHeight: 34,
              paddingHorizontal: 8,
              paddingVertical: 7,
              borderRadius: 9,
              backgroundColor:
                filter === id ? colors.sky : pressed ? colors.surface : "transparent",
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            })}
          >
            <Text
              style={{
                fontFamily: fonts.sans,
                fontSize: 12,
                lineHeight: 18,
                fontWeight: filter === id ? "600" : "400",
                color: filter === id ? colors.primaryStrong : colors.muted,
              }}
            >
              {t(labelKey)}
            </Text>
            <Text
              style={{
                fontSize: 11,
                lineHeight: 18,
                color: filter === id ? colors.primaryStrong : colors.faint,
                fontVariant: ["tabular-nums"],
              }}
            >
              {counts[id]}
            </Text>
          </Pressable>
        ))}
      </View>
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
      {!tasks.length && (
        <Empty
          icon={ListChecks}
          title={t(filter === "all" ? "agent.activityEmptyTitle" : "agent.activityEmptyFiltered")}
          detail={t("agent.activityEmptyDetail")}
        />
      )}
    </View>
  );
}
export function EvidenceList({ items }: { items: Evidence[] }) {
  const { t } = useTranslation();
  const { workspace, open } = useWorkspace();
  const [error, setError] = useState("");
  return (
    <View style={{ gap: 10 }}>
      {items.map((item) => (
        <View
          key={item.id}
          // 证据条目用左侧品牌色竖线做层级标记，强调色统一为 colors.primary。
          style={{ borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: 12, gap: 4 }}
        >
          <Text style={[s.small, { color: colors.text, fontWeight: "600" }]}>{item.title}</Text>
          <Markdown
            markdownit={assistantMarkdown}
            style={evidenceMarkdownStyle}
            rules={evidenceMarkdownRules}
            onLinkPress={openEvidenceLink}
          >
            {item.excerpt}
          </Markdown>
          {item.url && /^https?:\/\//i.test(item.url) && (
            <Button
              small
              onPress={() =>
                void Linking.openURL(item.url || "").catch((e) => setError(errorText(e)))
              }
            >
              {t("agent.openSource")}
            </Button>
          )}
          {item.kind === "mail" && workspace.mail.some((mail) => mail.id === item.id) && (
            <Button
              small
              onPress={() => {
                const mail = workspace.mail.find((m) => m.id === item.id);
                if (mail) open({ type: "mail", mail });
              }}
            >
              {t("agent.viewEmail")}
            </Button>
          )}
          {item.kind === "file" && workspace.files.some((file) => file.id === item.id) && (
            <Button
              small
              onPress={() => {
                const file = workspace.files.find((f) => f.id === item.id);
                if (file) open({ type: "file", file });
              }}
            >
              {t("agent.viewFile")}
            </Button>
          )}
        </View>
      ))}
      <ErrorNotice error={error} />
    </View>
  );
}
export function TaskDetail({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const { api, workspace, close, open, refresh: refreshWorkspace } = useWorkspace();
  const { data, mutate } = useAgentWorkspace();
  const [detail, setDetail] = useState<{
    task: AgentTask;
    artifacts: AgentArtifact[];
    files: Artifact[];
    browsers: BrowserSession[];
  }>();
  const [error, setError] = useState<"load" | "action" | "setup" | "">("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [fields, setFields] = useState<Record<string, string | boolean>>({});
  const task = data?.tasks.find((item) => item.id === taskId) || detail?.task;
  const view = task ? presentTask(task) : undefined;
  const needsSetup =
    task && (task.status === "paused" || task.status === "failed")
      ? taskRequiresSetup(task, data?.monitors)
      : false;
  useEffect(() => {
    let active = true;
    void api
      .request<NonNullable<typeof detail>>(`/api/agent/tasks/${taskId}`)
      .then((result) => {
        if (active) {
          setDetail(result);
          setError("");
        }
      })
      .catch(() => {
        if (active) setError("load");
      });
    return () => {
      active = false;
    };
  }, [api, taskId, task?.updatedAt]);
  async function act(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await mutate(`/tasks/${taskId}/${path}`, body);
      if (path === "input") {
        setAnswer("");
        setFields({});
      }
    } catch (error) {
      setError(
        typeof error === "object" &&
          error &&
          "code" in error &&
          error.code === "TASK_SETUP_REQUIRED"
          ? "setup"
          : "action",
      );
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    setBusy(true);
    setError("");
    try {
      await refreshWorkspace();
      const snapshot = await api.request<typeof workspace>("/api/workspace");
      const action = snapshot.actions.find((item) => item.id === task?.actionId);
      if (!action) {
        setError("action");
        return;
      }
      open({ type: "review", action });
    } catch {
      setError("action");
    } finally {
      setBusy(false);
    }
  }
  const missing = Array.isArray(task?.state.missingFields) ? task.state.missingFields : [];
  const fieldNames = missing
    .map((field) =>
      typeof field === "string"
        ? field
        : typeof field === "object" && field && "name" in field
          ? String(field.name)
          : "",
    )
    .filter(Boolean);
  const artifacts = (data?.artifacts ?? detail?.artifacts ?? []).filter(
    (artifact) => artifact.taskId === taskId && !hasInternalTaskText(artifact.title),
  );
  const files = detail?.files ?? [];
  return (
    <Sheet botLayout title={view?.title || t("agent.taskTitle")} onClose={close}>
      {(needsSetup || !!error) && (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.muted, fontSize: 13, lineHeight: 21, marginBottom: 12 }}
        >
          {t(
            needsSetup || error === "setup"
              ? "agent.taskSetupRequired"
              : error === "load"
                ? "agent.taskLoadUnavailable"
                : "agent.taskActionUnavailable",
          )}
        </Text>
      )}
      {!task || !view ? (
        !error && <ActivityIndicator color={colors.primary} />
      ) : (
        <View style={{ gap: 18 }}>
          <View style={s.between}>
            <TaskDisplayStatus view={view} />
            <Text style={{ color: colors.faint, fontSize: 11, lineHeight: 18 }}>
              {stamp(view.updatedAt)}
            </Text>
          </View>
          {(activeTask(task) || task.status === "failed") && (
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {["queued", "running", "scheduled", "waiting_input", "waiting_approval"].includes(
                task.status,
              ) && (
                <Button
                  small
                  icon={Pause}
                  busy={busy}
                  onPress={() => void act("control", { action: "pause" })}
                >
                  {t("agent.pause")}
                </Button>
              )}
              {task.status === "paused" && (
                <Button
                  small
                  icon={Play}
                  busy={busy}
                  disabled={needsSetup || error === "setup"}
                  onPress={() => void act("control", { action: "resume" })}
                >
                  {t("agent.resume")}
                </Button>
              )}
              {task.status === "failed" && (
                <Button
                  small
                  primary
                  icon={RefreshCw}
                  busy={busy}
                  disabled={needsSetup || error === "setup"}
                  onPress={() => void act("control", { action: "retry" })}
                >
                  {t("agent.retryTask")}
                </Button>
              )}
              {activeTask(task) && (
                <Button
                  small
                  icon={X}
                  busy={busy}
                  onPress={() => void act("control", { action: "cancel" })}
                >
                  {t("agent.cancelTask")}
                </Button>
              )}
            </View>
          )}
          {!!view.totalSteps && (
            <Card style={{ borderRadius: 14, padding: 14, backgroundColor: colors.surfaceRaised }}>
              <TaskProgress view={view} />
            </Card>
          )}
          {task.status === "waiting_approval" && (
            <Card style={{ gap: 10, borderRadius: 14, padding: 14 }}>
              <Text
                style={{
                  color: colors.primaryStrong,
                  fontSize: 14,
                  lineHeight: 22,
                  fontWeight: "600",
                }}
              >
                {t("agent.readyForReview")}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 22 }}>
                {t("agent.reviewBeforeProceed")}
              </Text>
              <Button primary busy={busy} onPress={() => void review()}>
                {t("agent.reviewAction")}
              </Button>
            </Card>
          )}
          {task.status === "waiting_input" && (
            <Card style={{ gap: 12, borderRadius: 14, padding: 14 }}>
              <Text
                style={{
                  color: colors.primaryStrong,
                  fontSize: 14,
                  lineHeight: 22,
                  fontWeight: "600",
                }}
              >
                {t("agent.inputNeeded")}
              </Text>
              <AssistantResponse
                content={view.question || t("agent.taskInputDescription")}
                compact
              />
              {fieldNames.map((name) =>
                missing.some(
                  (field) =>
                    typeof field === "object" &&
                    field &&
                    field.name === name &&
                    field.type === "checkbox",
                ) ? (
                  <CheckRow
                    key={name}
                    label={name.replace(/_/g, " ")}
                    checked={Boolean(fields[name])}
                    onPress={() => setFields((current) => ({ ...current, [name]: !current[name] }))}
                  />
                ) : (
                  <Field
                    key={name}
                    label={name.replace(/_/g, " ")}
                    value={String(fields[name] ?? "")}
                    onChangeText={(value) =>
                      setFields((current) => ({ ...current, [name]: value }))
                    }
                  />
                ),
              )}
              {!fieldNames.length && (
                <Field
                  label={t("agent.yourAnswer")}
                  value={answer}
                  onChangeText={setAnswer}
                  multiline
                  placeholder={t("agent.addMissingDetails")}
                />
              )}
              <Button
                primary
                busy={busy}
                disabled={!answer.trim() && !Object.keys(fields).length}
                onPress={() =>
                  void act("input", { answer: answer.trim() || t("agent.providedFields"), fields })
                }
              >
                {t("agent.continueTask")}
              </Button>
            </Card>
          )}
          {!!view.result && (
            <View style={{ gap: 10 }}>
              <Text
                style={{ color: colors.heading, fontSize: 14, lineHeight: 22, fontWeight: "600" }}
              >
                {t("agent.taskResultsTitle")}
              </Text>
              <Card style={{ borderRadius: 14, padding: 14 }}>
                <AssistantResponse
                  content={view.result}
                  files={files.length ? files : workspace.files}
                  onOpenFile={(file) => open({ type: "file", file })}
                />
              </Card>
            </View>
          )}
          {(!!files.length || !!artifacts.length) && (
            <View style={{ gap: 10 }}>
              {!view.result && (
                <Text
                  style={{ color: colors.heading, fontSize: 14, lineHeight: 22, fontWeight: "600" }}
                >
                  {t("agent.taskResultsTitle")}
                </Text>
              )}
              {files.map((file) => (
                <LinkRow
                  key={file.id}
                  title={file.name}
                  detail={fileTypeName(file)}
                  icon={FileText}
                  onPress={() => open({ type: "file", file })}
                />
              ))}
              {artifacts.map((artifact) => (
                <ArtifactCard key={artifact.id} artifact={artifact} />
              ))}
            </View>
          )}
          {detail?.browsers
            ?.filter((browser) => browser.status === "active")
            .map((browser) => (
              <Card key={browser.id} style={{ gap: 10, borderRadius: 14, padding: 14 }}>
                <Text style={{ fontSize: 14, lineHeight: 22, color: colors.heading }}>
                  {t("agent.openBrowser")}
                </Text>
                {!!browser.previewUrl && (
                  <Image
                    accessibilityLabel={t("agent.agentBrowserPreview")}
                    source={{ uri: api.url(browser.previewUrl) }}
                    style={{ width: "100%", aspectRatio: 1.6, borderRadius: 10 }}
                  />
                )}
                <Button
                  small
                  busy={busy}
                  onPress={() => {
                    setBusy(true);
                    void (async () => {
                      try {
                        if (["running", "scheduled", "queued"].includes(task.status))
                          await mutate(`/tasks/${taskId}/control`, { action: "pause" });
                        open({ type: "browser", browser });
                      } catch {
                        setError("action");
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  {t(
                    ["running", "scheduled", "queued"].includes(task.status)
                      ? "agent.pauseAndOpenBrowser"
                      : "agent.openBrowser",
                  )}
                </Button>
              </Card>
            ))}
        </View>
      )}
    </Sheet>
  );
}
export function ArtifactCard({ artifact }: { artifact: AgentArtifact }) {
  const { t } = useTranslation();
  const { open } = useWorkspace();
  const Icon = artifact.kind === "finance" ? CircleDollarSign : FileText;
  // 产物卡：独立的「文件产物」视觉，与洞察卡（衬线标题）、计划卡（步骤）、审批卡区分开。
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={artifact.title}
      onPress={() => open({ type: "artifact", artifact })}
      style={({ pressed }) => [
        {
          width: "100%",
          maxWidth: 520,
          padding: 12,
          gap: 6,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: pressed ? colors.overlay1 : colors.paper,
        },
      ]}
    >
      <View style={[s.row, { gap: 10 }]}>
        <View style={[s.glyph, { width: 34, height: 34, backgroundColor: colors.surface }]}>
          <Icon size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontSize: 10, lineHeight: 14, color: colors.faint }}>
            {`${statusLabel(artifact.kind)} · ${t("agent.artifactOpenDetail")}`}
          </Text>
          <Text numberOfLines={2} style={[s.heading, { fontSize: 15 }]}>
            {artifact.title}
          </Text>
        </View>
        <ArrowUpRight size={15} color={colors.faint} />
      </View>
    </Pressable>
  );
}
export function DelegateSheet({ goalId, milestoneId }: { goalId?: string; milestoneId?: string }) {
  const { t } = useTranslation();
  const { workspace, close, open } = useWorkspace();
  const { data, delegate } = useAgentWorkspace();
  const goal = data?.goals.find((item) => item.id === goalId);
  const milestone = goal?.milestones.find((item) => item.id === milestoneId);
  const submission = useRef<{ input: string; id: string } | null>(null);
  const submitting = useRef(false);
  const [kind, setKind] = useState<AgentTask["kind"]>("plan");
  const [title] = useState(milestone?.title);
  const [prompt, setPrompt] = useState(
    milestone && goal
      ? t("agent.milestonePromptSeed", {
          title: milestone.title,
          goalTitle: goal.title,
          goalDescription: goal.description,
        })
      : "",
  );
  const [messageId, setMessageId] = useState("");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const input = {
        title,
        prompt: prompt.trim(),
        kind,
        goalId,
        milestoneId,
        input: kind === "finance" ? { csv } : kind === "document" ? { messageId } : {},
      };
      const serialized = JSON.stringify(input);
      if (submission.current?.input !== serialized)
        submission.current = {
          input: serialized,
          id: `delegate-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
      const task = await delegate(input, submission.current.id);
      open({ type: "task", taskId: task.id });
    } catch (e) {
      setError(errorText(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Sheet title={t("agent.delegateTitle")} subtitle={t("agent.delegateSubtitle")} onClose={close}>
      {milestoneId && (
        <Text style={[s.muted, { marginBottom: 16 }]}>
          {milestone
            ? t("agent.delegateMilestoneNote", {
                goal: goal?.title ?? "",
                milestone: milestone.title,
              })
            : t("agent.milestoneNoLongerAvailable")}
        </Text>
      )}
      <View style={[s.row, { flexWrap: "wrap", gap: 8, marginBottom: 20 }]}>
        {(["plan", "document", "finance", "agent"] as const).map((item) => (
          <Button small primary={kind === item} key={item} onPress={() => setKind(item)}>
            {item === "agent" ? t("agent.generalTask") : statusLabel(item)}
          </Button>
        ))}
      </View>
      <Field
        label={t("agent.whatDone")}
        value={prompt}
        onChangeText={setPrompt}
        multiline
        placeholder={
          kind === "document"
            ? t("agent.promptDocumentPlaceholder")
            : kind === "finance"
              ? t("agent.promptFinancePlaceholder")
              : t("agent.promptPlanPlaceholder")
        }
      />
      {kind === "document" && (
        <View style={{ gap: 8, marginBottom: 16 }}>
          <Text style={s.heading}>{t("agent.chooseEmailPdf")}</Text>
          {workspace.mail
            .filter((mail) => mail.attachments.length)
            .map((mail) => (
              <CheckRow
                key={mail.id}
                checked={mail.id === messageId}
                label={`${mail.subject} · ${mail.sender}`}
                onPress={() => setMessageId(mail.id)}
              />
            ))}
          {!workspace.mail.some((mail) => mail.attachments.length) && (
            <Text style={s.muted}>{t("agent.connectMailPdf")}</Text>
          )}
        </View>
      )}
      {kind === "finance" && (
        <>
          <Field
            label={t("agent.transactionCsv")}
            value={csv}
            onChangeText={setCsv}
            multiline
            autoCapitalize="none"
            placeholder={"date,description,amount,category\n2026-09-01,Groceries,54.20,Food"}
          />
          {workspace.mode === "sample" && (
            <Button
              onPress={() =>
                setCsv(
                  "date,description,amount,category\n2026-09-01,Salary,-4200,Income\n2026-09-02,Groceries,84.50,Food\n2026-09-03,Subscription,19.99,Subscriptions\n2026-09-04,Coffee,6.50,Food",
                )
              }
            >
              {t("agent.tryExampleTransactions")}
            </Button>
          )}
          <Text style={[s.small, { marginVertical: 12 }]}>{t("agent.financeCsvNote")}</Text>
        </>
      )}
      {kind === "agent" && !workspace.runtime.configured && (
        <Text style={[s.muted, { marginBottom: 16 }]}>{t("agent.generalTaskRequiresModel")}</Text>
      )}
      <ErrorNotice error={error} />
      <Button
        primary
        busy={busy}
        disabled={
          Boolean(milestoneId && !milestone) ||
          !prompt.trim() ||
          (kind === "document" && !messageId) ||
          (kind === "finance" && !csv.trim())
        }
        onPress={() => void submit()}
      >
        {t("threads.delegateTask")}
      </Button>
    </Sheet>
  );
}
/*
 * 目标表单的投研模板：按目标分类（对应 GoalsScreen 传入的内部类目名）提供预设，
 * 点击后自动填入标题、成功标准与里程碑，用户仍可继续编辑再创建。
 */
type GoalTemplate = {
  titleKey: TranslationKey;
  descKey: TranslationKey;
  milestoneKeys: TranslationKey[];
};
const GOAL_TEMPLATES: Record<string, GoalTemplate[]> = {
  Health: [
    {
      titleKey: "agent.tplBriefingTitle",
      descKey: "agent.tplBriefingDesc",
      milestoneKeys: [
        "agent.tplBriefingMilestone1",
        "agent.tplBriefingMilestone2",
        "agent.tplBriefingMilestone3",
      ],
    },
    {
      titleKey: "agent.tplRateTitle",
      descKey: "agent.tplRateDesc",
      milestoneKeys: [
        "agent.tplRateMilestone1",
        "agent.tplRateMilestone2",
        "agent.tplRateMilestone3",
      ],
    },
  ],
  Relationships: [
    {
      titleKey: "agent.tplStockDeepTitle",
      descKey: "agent.tplStockDeepDesc",
      milestoneKeys: [
        "agent.tplStockDeepMilestone1",
        "agent.tplStockDeepMilestone2",
        "agent.tplStockDeepMilestone3",
      ],
    },
    {
      titleKey: "agent.tplEarningsTitle",
      descKey: "agent.tplEarningsDesc",
      milestoneKeys: [
        "agent.tplEarningsMilestone1",
        "agent.tplEarningsMilestone2",
        "agent.tplEarningsMilestone3",
      ],
    },
  ],
  Finances: [
    {
      titleKey: "agent.tplPortfolioTitle",
      descKey: "agent.tplPortfolioDesc",
      milestoneKeys: [
        "agent.tplPortfolioMilestone1",
        "agent.tplPortfolioMilestone2",
        "agent.tplPortfolioMilestone3",
      ],
    },
    {
      titleKey: "agent.tplNotesTitle",
      descKey: "agent.tplNotesDesc",
      milestoneKeys: [
        "agent.tplNotesMilestone1",
        "agent.tplNotesMilestone2",
        "agent.tplNotesMilestone3",
      ],
    },
  ],
  "Something else": [
    {
      titleKey: "agent.tplBusinessTitle",
      descKey: "agent.tplBusinessDesc",
      milestoneKeys: [
        "agent.tplBusinessMilestone1",
        "agent.tplBusinessMilestone2",
        "agent.tplBusinessMilestone3",
      ],
    },
    {
      titleKey: "agent.tplIndustryTitle",
      descKey: "agent.tplIndustryDesc",
      milestoneKeys: [
        "agent.tplIndustryMilestone1",
        "agent.tplIndustryMilestone2",
        "agent.tplIndustryMilestone3",
      ],
    },
  ],
};

/* 灵感页的预置和云端建议都作为提示词进入当前 Agent 对话。 */
type ResearchTemplate = {
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  promptKey: TranslationKey;
  icon: typeof Target;
};
const RESEARCH_TEMPLATES: ResearchTemplate[] = [
  {
    titleKey: "chat.suggestionHackerNews",
    descriptionKey: "agent.templateTrendDescription",
    promptKey: "agent.templateTrendPrompt",
    icon: Target,
  },
  {
    titleKey: "chat.suggestionSummarize",
    descriptionKey: "agent.templateEarningsDescription",
    promptKey: "agent.tplIdeaEarningsPrompt",
    icon: FileText,
  },
  {
    titleKey: "chat.suggestionDeepDive",
    descriptionKey: "agent.templateDeepDiveDescription",
    promptKey: "agent.tplIdeaStockPrompt",
    icon: Sparkles,
  },
  {
    titleKey: "chat.suggestionBriefing",
    descriptionKey: "agent.templateBriefingDescription",
    promptKey: "agent.tplIdeaBriefingPrompt",
    icon: Lightbulb,
  },
  {
    titleKey: "chat.suggestionPeerCompare",
    descriptionKey: "agent.templatePeerDescription",
    promptKey: "agent.tplIdeaPeerPrompt",
    icon: ListChecks,
  },
  {
    titleKey: "chat.suggestionWatchWebsite",
    descriptionKey: "agent.templateWatchDescription",
    promptKey: "agent.templateWatchPrompt",
    icon: Bell,
  },
  {
    titleKey: "agent.templateRatesTitle",
    descriptionKey: "agent.templateRatesDescription",
    promptKey: "agent.templateRatesPrompt",
    icon: CircleDollarSign,
  },
  {
    titleKey: "agent.templateDividendTitle",
    descriptionKey: "agent.templateDividendDescription",
    promptKey: "agent.templateDividendPrompt",
    icon: Star,
  },
  {
    titleKey: "agent.templateFlowTitle",
    descriptionKey: "agent.templateFlowDescription",
    promptKey: "agent.templateFlowPrompt",
    icon: Activity,
  },
  {
    titleKey: "agent.templatePortfolioTitle",
    descriptionKey: "agent.templatePortfolioDescription",
    promptKey: "agent.templatePortfolioPrompt",
    icon: Heart,
  },
  {
    titleKey: "agent.templateMoatTitle",
    descriptionKey: "agent.templateMoatDescription",
    promptKey: "agent.templateMoatPrompt",
    icon: ShieldCheck,
  },
  {
    titleKey: "agent.templateIndustryTitle",
    descriptionKey: "agent.templateIndustryDescription",
    promptKey: "agent.templateIndustryPrompt",
    icon: Globe2,
  },
  {
    titleKey: "agent.templatePlanTitle",
    descriptionKey: "agent.templatePlanDescription",
    promptKey: "agent.templatePlanPrompt",
    icon: CalendarDays,
  },
  {
    titleKey: "agent.templateNotesTitle",
    descriptionKey: "agent.templateNotesDescription",
    promptKey: "agent.templateNotesPrompt",
    icon: Brain,
  },
  {
    titleKey: "agent.templateCatalystTitle",
    descriptionKey: "agent.templateCatalystDescription",
    promptKey: "agent.templateCatalystPrompt",
    icon: Clock3,
  },
] as const;

export function IdeasScreen({ onUsePrompt }: { onUsePrompt?: () => void } = {}) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { prefillPrompt, navigate } = useWorkspace();
  const { width } = useWindowDimensions();
  /** 模板只预填输入框，用户确认后再发送，避免一点就自动开跑。 */
  function fillPromptForAgent(prompt: string) {
    prefillPrompt(prompt);
    navigate("chat");
    onUsePrompt?.();
  }
  const ideas = data?.ideas.filter((idea) => idea.status === "new") || [];
  const threeColumns = width >= 720;
  return (
    <View style={{ gap: 18 }}>
      <AgentStatus />
      <View style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <SectionHeading title={t("agent.researchTemplates")} />
          <Text style={s.muted}>{t("agent.researchTemplatesDetail")}</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {RESEARCH_TEMPLATES.map((template, index) => {
            const Icon = template.icon;
            return (
              <Pressable
                key={template.titleKey}
                accessibilityRole="button"
                accessibilityLabel={t("agent.useResearchTemplate", {
                  title: t(template.titleKey),
                })}
                onPress={() => {
                  fillPromptForAgent(t(template.promptKey));
                }}
                style={({ pressed }) => ({
                  flexBasis: threeColumns ? "31.5%" : "47%",
                  flexGrow: threeColumns ? 1 : 0,
                  minHeight: threeColumns ? 164 : 208,
                  gap: threeColumns ? 10 : 12,
                  padding: threeColumns ? 14 : 12,
                  borderRadius: 17,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: pressed ? colors.surfaceRaised : colors.paper,
                })}
              >
                <View style={[s.between, { alignItems: "center" }]}>
                  <View
                    style={{
                      width: threeColumns ? 36 : 34,
                      height: threeColumns ? 36 : 34,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: radius.control,
                      backgroundColor: colors.sky,
                    }}
                  >
                    <Icon size={threeColumns ? 18 : 17} color={colors.primary} />
                  </View>
                  <Text style={[s.metric, { color: colors.faint, fontSize: 10 }]}>
                    {String(index + 1).padStart(2, "0")}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text
                    style={[
                      s.heading,
                      {
                        fontSize: threeColumns ? 14 : 13,
                        lineHeight: threeColumns ? 20 : 18,
                      },
                    ]}
                  >
                    {t(template.titleKey)}
                  </Text>
                  <Text
                    style={[
                      s.muted,
                      {
                        fontSize: threeColumns ? 12 : 11,
                        lineHeight: threeColumns ? 18 : 17,
                      },
                    ]}
                  >
                    {t(template.descriptionKey)}
                  </Text>
                </View>
                <View style={[s.row, { justifyContent: "flex-end", gap: 5 }]}>
                  <Text
                    style={{
                      color: colors.primaryStrong,
                      fontSize: 11,
                      fontWeight: "600",
                      lineHeight: 17,
                    }}
                  >
                    {t("agent.useTemplateAction")}
                  </Text>
                  <ArrowUpRight size={12} color={colors.primaryStrong} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      {!!ideas.length && (
        <View style={{ gap: 6 }}>
          <SectionHeading title={t("agent.ideasForYou")} />
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} onUsePrompt={onUsePrompt} />
          ))}
        </View>
      )}
      {(data?.ideas || [])
        .filter((idea) => idea.status === "accepted")
        .map((idea) => (
          <Card key={idea.id} style={{ gap: 7 }}>
            <Text style={s.heading}>{idea.title}</Text>
            <Chip tint={colors.green}>{t("agent.started")}</Chip>
            {!!idea.taskId && <TaskLink taskId={idea.taskId} />}
          </Card>
        ))}
    </View>
  );
}
function TaskLink({ taskId, onOpen }: { taskId: string; onOpen?: () => void }) {
  const { t } = useTranslation();
  const { open } = useWorkspace();
  return (
    <Button
      small
      icon={ArrowRight}
      onPress={() => {
        onOpen?.();
        open({ type: "task", taskId });
      }}
    >
      {t("agent.viewTask")}
    </Button>
  );
}
function IdeaCard({ idea, onUsePrompt }: { idea: Idea; onUsePrompt?: () => void }) {
  const { t } = useTranslation();
  const { mutate } = useAgentWorkspace();
  const { ask, navigate } = useWorkspace();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(idea.prompt);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action: "accept" | "dismiss") {
    if (action === "accept") {
      ask(prompt.trim());
      navigate("chat");
      onUsePrompt?.();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await mutate<Idea>(`/ideas/${idea.id}`, { action });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  // 灵感类别图标：按标题关键词挑选线性图标，取代早前的 emoji 字符。
  const IdeaIcon = /document|permission|form/i.test(idea.title)
    ? FileText
    : /money|spend|saving/i.test(idea.title)
      ? CircleDollarSign
      : /goal|plan|training/i.test(idea.title)
        ? Target
        : /dinner|table/i.test(idea.title)
          ? CalendarDays
          : Lightbulb;
  return (
    // 灵感列表行：紧凑内边距 + 底部描边分隔，整行可点击展开。
    <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("agent.viewIdeaLabel", { title: idea.title })}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        // 可点击行按压态用 overlay1，圆角 10 与控件体系一致。
        style={({ pressed }) => [
          { flexDirection: "row", gap: 12, borderRadius: 10 },
          pressed && { backgroundColor: colors.overlay1 },
        ]}
      >
        <View style={{ width: 34, alignItems: "center", justifyContent: "center" }}>
          <IdeaIcon size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[s.heading, { fontSize: 15, lineHeight: 21 }]}>{idea.title}</Text>
          <Text style={s.muted}>{idea.reason}</Text>
        </View>
      </Pressable>
      {expanded && (
        <View style={{ gap: 12, marginTop: 12, paddingLeft: 46 }}>
          <EvidenceList items={idea.evidence} />
          {editing && (
            <Field
              label={t("agent.whatShouldLingWuDo")}
              value={prompt}
              onChangeText={setPrompt}
              multiline
            />
          )}
          <ErrorNotice error={error} />
          <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
            <Button
              primary
              busy={busy}
              disabled={!prompt.trim()}
              onPress={() => void act("accept")}
            >
              {t("agent.startThis")}
            </Button>
            <Button disabled={busy} onPress={() => setEditing(!editing)}>
              {editing ? t("agent.keepEdits") : t("agent.edit")}
            </Button>
            <Button disabled={busy} onPress={() => void act("dismiss")}>
              {t("agent.dismiss")}
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
export function GoalsScreen({
  embedded = false,
  reminderIntent,
  onReminderIntentHandled,
}: {
  embedded?: boolean;
  reminderIntent?: PriceReminderIntent;
  onReminderIntentHandled?: () => void;
}) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { open } = useWorkspace();
  const { width } = useWindowDimensions();
  const [adding, setAdding] = useState<string>();
  const [selectedGoal, setSelectedGoal] = useState<string>();
  const [selectedMonitor, setSelectedMonitor] = useState<string>();
  const [editingMonitor, setEditingMonitor] = useState<string>();
  const [reminderTemplate, setReminderTemplate] = useState<(typeof REMINDER_TEMPLATES)[number]>();
  const [priceReminder, setPriceReminder] = useState<PriceReminderIntent>();
  const [showAll, setShowAll] = useState(false);
  const [activeTab, setActiveTab] = useState<"goals" | "reminders">(
    embedded ? "reminders" : "goals",
  );
  const goal = data?.goals.find((item) => item.id === selectedGoal);
  const monitor = data?.monitors.find((item) => item.id === selectedMonitor);
  const monitorToEdit = data?.monitors.find((item) => item.id === editingMonitor);
  useEffect(() => {
    if (!reminderIntent) return;
    setActiveTab("reminders");
    setReminderTemplate(undefined);
    setEditingMonitor(undefined);
    setSelectedMonitor(undefined);
    setPriceReminder(reminderIntent);
    setAdding("Reminder");
    onReminderIntentHandled?.();
  }, [onReminderIntentHandled, reminderIntent]);
  // 已停止的盯盘不再出现在列表里（服务端无删除接口，停止即视为移除）。
  const monitors = (data?.monitors || []).filter((item) => item.status !== "stopped");
  return (
    <View style={{ gap: 20 }}>
      {!embedded && (
        <PageHeader
          title={t("agent.monitorsHeroTitle")}
          description={t("agent.monitorsHeroDescription")}
          compact={width < breakpoints.desktop}
          actions={
            activeTab === "reminders" ? (
              <Button
                small
                primary
                icon={Plus}
                onPress={() => {
                  setReminderTemplate(undefined);
                  setPriceReminder(undefined);
                  setAdding("Reminder");
                }}
              >
                {t("agent.addReminder")}
              </Button>
            ) : undefined
          }
          style={{ marginBottom: 0 }}
        />
      )}
      <AgentStatus />
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
        }}
      >
        {(
          [
            { id: "goals", label: t("agent.goalsTab"), count: data?.goals.length ?? 0 },
            { id: "reminders", label: t("agent.remindersTab"), count: monitors.length },
          ] as const
        ).map((item) => {
          const active = activeTab === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              onPress={() => setActiveTab(item.id)}
              style={({ pressed }) => ({
                flex: width < 600 ? 1 : undefined,
                minWidth: width < 600 ? 0 : 120,
                minHeight: 44,
                justifyContent: "center",
                marginRight: width < 600 ? 0 : 28,
                paddingHorizontal: 2,
                borderBottomWidth: 2,
                borderBottomColor: active ? colors.primary : "transparent",
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <View
                style={[s.row, { gap: 6, justifyContent: width < 600 ? "center" : "flex-start" }]}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: active ? "600" : "500",
                    color: active ? colors.primaryStrong : colors.muted,
                  }}
                >
                  {item.label}
                </Text>
                <Text style={{ fontSize: 10, color: active ? colors.primary : colors.faint }}>
                  {item.count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {activeTab === "reminders" ? (
        <View style={{ gap: 20 }}>
          <Card
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 14,
              padding: 18,
              backgroundColor: colors.sky,
              borderColor: colors.accentLine,
            }}
          >
            <View
              style={[
                s.iconBox,
                {
                  width: 38,
                  height: 38,
                  backgroundColor: colors.paper,
                  borderWidth: 1,
                  borderColor: colors.accentLine,
                },
              ]}
            >
              <Sparkles size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={[s.heading, { fontSize: 15 }]}>{t("agent.monitorContextTitle")}</Text>
              <Text style={[s.muted, { lineHeight: 21 }]}>{t("agent.monitorContextDetail")}</Text>
            </View>
          </Card>
          <View style={{ gap: 12 }}>
            <SectionHeading title={t("agent.reminderTemplates")} />
            <View
              style={{
                flexDirection: width < 760 ? "column" : "row",
                gap: 12,
              }}
            >
              {REMINDER_TEMPLATES.map((template) => {
                const Icon =
                  template.id === "close-review"
                    ? CalendarDays
                    : template.id === "filing-watch"
                      ? Bell
                      : RefreshCw;
                return (
                  <Pressable
                    key={template.id}
                    accessibilityRole="button"
                    accessibilityLabel={t(template.titleKey)}
                    onPress={() => {
                      setReminderTemplate(template);
                      setPriceReminder(undefined);
                      setAdding("Reminder");
                    }}
                    style={({ pressed }) => ({
                      flex: 1,
                      minHeight: 132,
                      gap: 10,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: pressed ? colors.lineStrong : colors.line,
                      borderRadius: 11,
                      backgroundColor: pressed ? colors.overlay1 : colors.paper,
                    })}
                  >
                    <View style={[s.between, { alignItems: "flex-start" }]}>
                      <View
                        style={[
                          s.iconBox,
                          {
                            width: 34,
                            height: 34,
                            backgroundColor: colors.surface,
                          },
                        ]}
                      >
                        <Icon size={17} color={colors.primary} />
                      </View>
                      <ArrowUpRight size={16} color={colors.muted} />
                    </View>
                    <View style={{ gap: 4 }}>
                      <Text style={[s.heading, { fontSize: 15 }]}>{t(template.titleKey)}</Text>
                      <Text style={[s.small, { lineHeight: 19 }]}>{t(template.detailKey)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ gap: 10 }}>
            <SectionHeading title={t("agent.remindersHeading")} count={monitors.length} />
            {(showAll ? monitors : monitors.slice(0, 3)).map((item) => (
              <MonitorRow
                key={item.id}
                monitor={item}
                onOpen={() => setSelectedMonitor(item.id)}
                onEdit={() => setEditingMonitor(item.id)}
              />
            ))}
            {!monitors.length && (
              <Empty
                icon={Bell}
                title={t("agent.remindersEmptyTitle")}
                detail={t("agent.remindersEmptyDetail")}
              >
                <Button
                  small
                  primary
                  icon={Plus}
                  onPress={() => {
                    setReminderTemplate(undefined);
                    setPriceReminder(undefined);
                    setAdding("Reminder");
                  }}
                >
                  {t("agent.addFirstReminder")}
                </Button>
              </Empty>
            )}
            {monitors.length > 3 && (
              <Button small onPress={() => setShowAll(!showAll)}>
                {showAll
                  ? t("agent.showLess")
                  : t("agent.showMore", { count: monitors.length - 3 })}
              </Button>
            )}
          </View>
        </View>
      ) : (
        <View style={{ gap: 20 }}>
          <View style={{ gap: 8 }}>
            <SectionHeading title={t("agent.goalsHeading")} count={data?.goals.length ?? 0} />
            {data?.goals.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={t("agent.openGoalLabel", { title: item.title })}
                onPress={() => setSelectedGoal(item.id)}
                // 可点击列表行：紧凑内边距 + overlay1 按压态 + 10px 圆角。
                style={({ pressed }) => [
                  s.row,
                  { gap: 12, paddingVertical: 12, borderRadius: 10 },
                  pressed && { backgroundColor: colors.overlay1 },
                ]}
              >
                <Square
                  size={21}
                  color={colors.muted}
                  // 完成态用实心成功色填充，避免半透明语义底几乎不可见。
                  fill={item.status === "completed" ? colors.success : "none"}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.text}>{item.title}</Text>
                  <Text numberOfLines={2} style={s.muted}>
                    {item.description || statusLabel(item.status)}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.muted} />
              </Pressable>
            ))}
            {!data?.goals.length && (
              <Text style={[s.muted, { paddingVertical: 10 }]}>{t("agent.goalsEmpty")}</Text>
            )}
          </View>
          <View style={{ height: 1, backgroundColor: colors.line }} />
          <Text style={s.heading}>{t("agent.createGoal")}</Text>
          {(
            [
              { key: "agent.categoryHealth", name: "Health", icon: Heart },
              { key: "agent.categoryRelationships", name: "Relationships", icon: Users },
              { key: "agent.categoryFinances", name: "Finances", icon: CircleDollarSign },
              { key: "agent.categorySomethingElse", name: "Something else", icon: Target },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.name}
              accessibilityRole="button"
              accessibilityLabel={t("agent.createGoalA11y", { category: t(item.key) })}
              onPress={() => setAdding(item.name)}
              // 可点击行：overlay1 按压态 + 10px 圆角。
              style={({ pressed }) => [
                s.row,
                { gap: 12, minHeight: 38, borderRadius: 10 },
                pressed && { backgroundColor: colors.overlay1 },
              ]}
            >
              <item.icon size={23} color={colors.muted} />
              <Text style={[s.text, { flex: 1, color: colors.muted }]}>{t(item.key)}</Text>
              <Plus size={18} color={colors.muted} />
            </Pressable>
          ))}
          <View style={{ height: 1, backgroundColor: colors.line }} />
          {/* 委派任务：交办一项成果，由灵悟保存计划并持续执行（原来的边栏入口，用户要求移入目标页面）。 */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("threads.delegateTask")}
            onPress={() => open({ type: "delegate" })}
            // 可点击行：overlay1 按压态 + 10px 圆角。
            style={({ pressed }) => [
              s.row,
              { gap: 12, minHeight: 38, borderRadius: 10 },
              pressed && { backgroundColor: colors.overlay1 },
            ]}
          >
            <Send size={23} color={colors.muted} />
            <Text style={[s.text, { flex: 1, color: colors.muted }]}>
              {t("threads.delegateTask")}
            </Text>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
        </View>
      )}
      {adding && (
        <Sheet
          title={adding === "Reminder" ? t("agent.addReminder") : t("agent.createGoal")}
          onClose={() => {
            setAdding(undefined);
            setReminderTemplate(undefined);
            setPriceReminder(undefined);
          }}
        >
          {adding === "Reminder" ? (
            <MonitorForm
              template={reminderTemplate}
              priceReminder={priceReminder}
              onDone={() => {
                setAdding(undefined);
                setReminderTemplate(undefined);
                setPriceReminder(undefined);
              }}
            />
          ) : (
            <GoalForm category={adding} onDone={() => setAdding(undefined)} />
          )}
        </Sheet>
      )}
      {monitorToEdit && (
        <Sheet title={t("agent.editReminder")} onClose={() => setEditingMonitor(undefined)}>
          <MonitorForm monitor={monitorToEdit} onDone={() => setEditingMonitor(undefined)} />
        </Sheet>
      )}
      {goal && (
        <Sheet title={goal.title} onClose={() => setSelectedGoal(undefined)}>
          <GoalCard goal={goal} onOpenTask={() => setSelectedGoal(undefined)} />
        </Sheet>
      )}
      {monitor && (
        <Sheet title={monitor.title} onClose={() => setSelectedMonitor(undefined)}>
          <MonitorCard monitor={monitor} onOpenTask={() => setSelectedMonitor(undefined)} />
        </Sheet>
      )}
    </View>
  );
}
export function GoalForm({ onDone, category }: { onDone: () => void; category?: string }) {
  const { t } = useTranslation();
  const { mutate } = useAgentWorkspace();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [milestones, setMilestones] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await mutate("/goals", {
        title: title.trim(),
        category,
        description,
        milestones: milestones
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      });
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      {!!category && !!GOAL_TEMPLATES[category]?.length && (
        <View style={{ gap: 8 }}>
          <Text style={s.small}>{t("agent.templateExamples")}</Text>
          {GOAL_TEMPLATES[category].map((template) => (
            <Button
              small
              key={template.titleKey}
              onPress={() => {
                setTitle(t(template.titleKey));
                setDescription(t(template.descKey));
                setMilestones(template.milestoneKeys.map((key) => t(key)).join("\n"));
              }}
            >
              {t(template.titleKey)}
            </Button>
          ))}
        </View>
      )}
      <Field
        label={t("agent.yourGoal")}
        value={title}
        onChangeText={setTitle}
        placeholder={t("agent.yourGoalPlaceholder")}
      />
      <Field
        label={t("agent.successLookLike")}
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <Field
        label={t("agent.milestonesPerLine")}
        value={milestones}
        onChangeText={setMilestones}
        multiline
      />
      <ErrorNotice error={error} />
      <Button primary disabled={!title.trim()} busy={busy} onPress={() => void save()}>
        {t("agent.createGoalButton")}
      </Button>
    </Card>
  );
}
export function GoalCard({ goal, onOpenTask }: { goal: Goal; onOpenTask?: () => void }) {
  const { t } = useTranslation();
  const { data, mutate, delegate } = useAgentWorkspace();
  const { open } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const done = goal.milestones.filter((item) => item.done).length;
  async function update(body: unknown, milestoneId?: string) {
    setBusy(true);
    setError("");
    try {
      await mutate(`/goals/${goal.id}${milestoneId ? `/milestones/${milestoneId}` : ""}`, body);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function plan() {
    setBusy(true);
    setError("");
    try {
      const task = await delegate({
        title: t("agent.planTaskTitle", { title: goal.title }),
        prompt: t("agent.planTaskPrompt", { title: goal.title, description: goal.description }),
        kind: "plan",
        goalId: goal.id,
        input: {},
      });
      onOpenTask?.();
      open({ type: "task", taskId: task.id });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 12 }}>
      <View style={s.between}>
        <Text style={[s.heading, { flex: 1 }]}>{goal.title}</Text>
        <Chip tint={goal.status === "completed" ? colors.green : colors.sky}>
          {statusLabel(goal.status)}
        </Chip>
      </View>
      <Text style={s.muted}>{goal.description}</Text>
      <Text style={[s.small, s.metric]}>
        {t("agent.milestonesProgress", { done, total: goal.milestones.length })}
      </Text>
      {goal.milestones.map((milestone) => (
        <View key={milestone.id} style={{ gap: 8 }}>
          <CheckRow
            checked={milestone.done}
            label={milestone.title}
            onPress={() => {
              if (!busy) void update({ done: !milestone.done }, milestone.id);
            }}
          />
          {!milestone.done && (
            <Button
              small
              disabled={goal.status !== "active"}
              onPress={() => {
                onOpenTask?.();
                open({ type: "delegate", goalId: goal.id, milestoneId: milestone.id });
              }}
            >
              {t("agent.delegate")}
            </Button>
          )}
          {data?.tasks
            .filter((task) => task.goalId === goal.id && task.milestoneId === milestone.id)
            .map((task) => (
              <TaskCard key={task.id} task={task} compact onOpen={onOpenTask} />
            ))}
        </View>
      ))}
      <ErrorNotice error={error} />
      <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
        <Button
          small
          busy={busy}
          onPress={() => void update({ status: goal.status === "active" ? "paused" : "active" })}
        >
          {goal.status === "active" ? t("agent.pause") : t("agent.resume")}
        </Button>
        {goal.status !== "completed" && (
          <Button small busy={busy} onPress={() => void update({ status: "completed" })}>
            {t("agent.completeGoal")}
          </Button>
        )}
        <Button small primary busy={busy} onPress={() => void plan()}>
          {t("agent.planNextSteps")}
        </Button>
      </View>
      {data?.tasks
        .filter(
          (task) =>
            task.goalId === goal.id &&
            (!task.milestoneId || !goal.milestones.some((m) => m.id === task.milestoneId)),
        )
        .map((task) => (
          <TaskCard key={task.id} task={task} compact onOpen={onOpenTask} />
        ))}
    </Card>
  );
}
/** 按间隔检查的 3 档预设（分钟）；每天/每周由独立调度字段承载。 */
const MONITOR_SCHEDULES = [
  { minutes: 15, labelKey: "agent.scheduleEvery15m" },
  { minutes: 60, labelKey: "agent.scheduleHourly" },
  { minutes: 360, labelKey: "agent.scheduleEvery6h" },
] as const satisfies ReadonlyArray<{ minutes: number; labelKey: TranslationKey }>;

type ReminderSchedule = NonNullable<Monitor["schedule"]>;

const REMINDER_TEMPLATES: ReadonlyArray<{
  id: string;
  titleKey: TranslationKey;
  detailKey: TranslationKey;
  schedule: ReminderSchedule;
  timeOfDay: string;
  weekday?: number;
}> = [
  {
    id: "close-review",
    titleKey: "agent.reminderTplCloseTitle",
    detailKey: "agent.reminderTplCloseDetail",
    schedule: "daily",
    timeOfDay: "15:30",
  },
  {
    id: "filing-watch",
    titleKey: "agent.reminderTplFilingTitle",
    detailKey: "agent.reminderTplFilingDetail",
    schedule: "daily",
    timeOfDay: "09:00",
  },
  {
    id: "weekly-review",
    titleKey: "agent.reminderTplWeeklyTitle",
    detailKey: "agent.reminderTplWeeklyDetail",
    schedule: "weekly",
    timeOfDay: "18:00",
    weekday: 5,
  },
];

function resolvePriceReminderCurrency({ symbol, quote }: PriceReminderIntent): MonitorCurrency {
  const quoted = quote?.currency?.trim().toUpperCase();
  if (quoted === "CNY" || quoted === "RMB" || quoted === "CNH") return "CNY";
  if (quoted === "HKD") return "HKD";
  if (quoted === "USD") return "USD";
  const code = symbol.code.toUpperCase();
  if (code.endsWith(".HK")) return "HKD";
  if (code.endsWith(".SS") || code.endsWith(".SZ")) return "CNY";
  if (symbol.market === "HK") return "HKD";
  if (symbol.market === "US") return "USD";
  return "CNY";
}

export function MonitorForm({
  monitor,
  template,
  priceReminder,
  onDone,
}: {
  monitor?: Monitor;
  template?: (typeof REMINDER_TEMPLATES)[number];
  priceReminder?: PriceReminderIntent;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { workspace } = useWorkspace();
  const { mutate } = useAgentWorkspace();
  const priceReminderUrl = priceReminder
    ? `https://finance.yahoo.com/quote/${encodeURIComponent(priceReminder.symbol.code)}`
    : "";
  const priceReminderCurrency = priceReminder
    ? resolvePriceReminderCurrency(priceReminder)
    : undefined;
  const priceReminderName = priceReminder ? localizedSymbolName(priceReminder.symbol) : "";
  const priceReminderValue = priceReminder?.quote
    ? (priceReminder.quote.price * 0.95).toFixed(priceReminder.quote.price < 1 ? 4 : 2)
    : "";
  const [title, setTitle] = useState(
    monitor?.title ??
      (priceReminder
        ? t("agent.priceReminderTitle", { name: priceReminderName })
        : template
          ? t(template.titleKey)
          : ""),
  );
  const [description, setDescription] = useState(
    monitor?.description ??
      (priceReminder
        ? t("agent.priceReminderDescription", {
            name: priceReminderName,
            code: priceReminder.symbol.code,
          })
        : template
          ? t(template.detailKey)
          : ""),
  );
  const [url, setUrl] = useState(
    monitor && !monitor.url.startsWith("sample:") ? monitor.url : priceReminderUrl,
  );
  const [condition, setCondition] = useState<Monitor["condition"]>(
    monitor?.condition ?? (priceReminder ? "price_below" : "change"),
  );
  const [value, setValue] = useState(monitor?.value ?? priceReminderValue);
  const [currency, setCurrency] = useState<MonitorCurrency | undefined>(
    monitor ? resolveMonitorCurrency(monitor) : (priceReminderCurrency ?? "CNY"),
  );
  const [interval, setInterval] = useState(String(monitor?.intervalMinutes ?? 15));
  const [schedule, setSchedule] = useState<ReminderSchedule>(
    monitor?.schedule ?? template?.schedule ?? "interval",
  );
  const [timeOfDay, setTimeOfDay] = useState(monitor?.timeOfDay ?? template?.timeOfDay ?? "15:30");
  const [weekday, setWeekday] = useState(monitor?.weekday ?? template?.weekday ?? 5);
  const [sample, setSample] = useState(
    monitor?.url.startsWith("sample:") ??
      (!!template && !priceReminder && workspace.mode === "sample"),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const minutes =
        schedule === "daily" ? 1440 : schedule === "weekly" ? 10080 : Number(interval);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080)
        throw new Error(t("agent.invalidMonitorInterval"));
      if (schedule !== "interval" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeOfDay))
        throw new Error(t("agent.invalidReminderTime"));
      if (!sample && !/^https?:\/\//i.test(url.trim()))
        throw new Error(t("agent.invalidMonitorUrl"));
      await mutate(monitor ? `/monitors/${monitor.id}` : "/monitors", {
        title: title.trim(),
        description: description.trim(),
        url: sample ? "sample://availability" : url.trim(),
        condition,
        value,
        ...(condition === "price_below" ? { currency } : {}),
        intervalMinutes: minutes,
        schedule,
        ...(schedule === "interval" ? {} : { timeOfDay }),
        ...(schedule === "weekly" ? { weekday } : {}),
      });
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 2 }}>
      <Field
        label={t("agent.reminderName")}
        value={title}
        onChangeText={setTitle}
        placeholder={t("agent.watchingPlaceholder")}
      />
      <Field
        label={t("agent.reminderDescription")}
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 82 }}
        placeholder={t("agent.reminderDescriptionPlaceholder")}
      />
      {workspace.mode === "sample" && (
        <CheckRow
          checked={sample}
          label={t("agent.tryBuiltInPage")}
          onPress={() => setSample(!sample)}
        />
      )}
      {!sample && (
        <Field
          label={t("agent.monitorPageLabel")}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          placeholder="https://example.com/product"
        />
      )}
      <Text style={[s.small, { marginBottom: 10 }]}>{t("agent.notifyMeWhen")}</Text>
      <View style={[s.row, { gap: 7, flexWrap: "wrap", marginBottom: 16 }]}>
        {(["change", "contains", "price_below"] as const).map((item) => (
          <Button small primary={condition === item} key={item} onPress={() => setCondition(item)}>
            {item === "change"
              ? t("agent.conditionPageChanges")
              : item === "contains"
                ? t("agent.conditionTextAppears")
                : t("agent.conditionPriceBelow")}
          </Button>
        ))}
      </View>
      {condition !== "change" && (
        <Field
          label={condition === "contains" ? t("agent.textToLookFor") : t("agent.targetPrice")}
          value={value}
          onChangeText={setValue}
        />
      )}
      {condition === "price_below" && (
        <View style={{ gap: 9, marginBottom: 16 }}>
          <Text style={s.small}>{t("agent.monitorCurrency")}</Text>
          <View style={[s.row, { gap: 7, flexWrap: "wrap" }]}>
            {(
              [
                { value: "CNY", label: "agent.currencyCny" },
                { value: "HKD", label: "agent.currencyHkd" },
                { value: "USD", label: "agent.currencyUsd" },
              ] as const
            ).map((item) => (
              <Button
                key={item.value}
                small
                primary={currency === item.value}
                onPress={() => setCurrency(item.value)}
              >
                {t(item.label)}
              </Button>
            ))}
          </View>
          <Text style={s.small}>{t("agent.monitorCurrencyHint")}</Text>
        </View>
      )}
      <Text style={[s.small, { marginBottom: 10 }]}>{t("agent.reminderTiming")}</Text>
      <View style={[s.row, { gap: 7, flexWrap: "wrap", marginBottom: 16 }]}>
        {(
          [
            { value: "interval", labelKey: "agent.scheduleInterval" },
            { value: "daily", labelKey: "agent.scheduleDaily" },
            { value: "weekly", labelKey: "agent.scheduleWeekly" },
          ] as const
        ).map((item) => (
          <Button
            small
            primary={schedule === item.value}
            key={item.value}
            onPress={() => setSchedule(item.value)}
          >
            {t(item.labelKey)}
          </Button>
        ))}
      </View>
      {schedule === "interval" ? (
        <View style={[s.row, { gap: 7, flexWrap: "wrap", marginBottom: 16 }]}>
          {MONITOR_SCHEDULES.map((item) => (
            <Button
              small
              primary={interval === String(item.minutes)}
              key={item.minutes}
              onPress={() => setInterval(String(item.minutes))}
            >
              {t(item.labelKey)}
            </Button>
          ))}
        </View>
      ) : (
        <>
          {schedule === "weekly" && (
            <>
              <Text style={[s.small, { marginBottom: 10 }]}>{t("agent.reminderWeekday")}</Text>
              <View style={[s.row, { gap: 6, flexWrap: "wrap", marginBottom: 16 }]}>
                {WEEKDAYS.map((item) => (
                  <Button
                    small
                    primary={weekday === item.value}
                    key={item.value}
                    onPress={() => setWeekday(item.value)}
                  >
                    {t(item.labelKey)}
                  </Button>
                ))}
              </View>
            </>
          )}
          <Field
            label={t("agent.reminderTime")}
            value={timeOfDay}
            onChangeText={setTimeOfDay}
            autoCapitalize="none"
            placeholder="15:30"
          />
        </>
      )}
      <View
        style={[
          s.row,
          {
            gap: 8,
            padding: 11,
            marginBottom: 14,
            borderRadius: 8,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Bell size={16} color={colors.muted} />
        <Text style={s.small}>{t("agent.reminderChannelInApp")}</Text>
      </View>
      <Text style={[s.small, { marginBottom: 14 }]}>
        {sample ? t("agent.samplePageNote") : t("agent.monitorServerNote")}
      </Text>
      <ErrorNotice error={error} />
      <Button
        primary
        busy={busy}
        disabled={
          !title.trim() ||
          (!sample && !url.trim()) ||
          (condition !== "change" && !value.trim()) ||
          (condition === "price_below" && !currency) ||
          (schedule !== "interval" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeOfDay))
        }
        onPress={() => void save()}
      >
        {monitor ? t("agent.saveChanges") : t("agent.startTracking")}
      </Button>
    </Card>
  );
}
/**
 * 盯盘卡片：图标 + 标题 + 条件 + 调度 + 开关 + 编辑/停止。
 * 开关直接暂停/恢复；停止需二次确认，停止后从列表移除（服务端暂无 DELETE）。
 */
export function MonitorRow({
  monitor,
  onOpen,
  onEdit,
}: {
  monitor: Monitor;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const { mutate } = useAgentWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  // 开关先本地反馈，失败回退到服务端状态。
  const [optimistic, setOptimistic] = useState<boolean>();
  const active = optimistic ?? monitor.status === "active";

  async function toggle(next: boolean) {
    setOptimistic(next);
    setBusy(true);
    setError("");
    try {
      await mutate(`/monitors/${monitor.id}/control`, { action: next ? "resume" : "pause" });
      setOptimistic(undefined);
    } catch (e) {
      setOptimistic(undefined);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError("");
    try {
      await mutate(`/monitors/${monitor.id}/control`, { action: "stop" });
      setConfirming(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 10, borderRadius: 11, padding: 16 }}>
      <View style={[s.row, { gap: 12, alignItems: "flex-start" }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("agent.openTrackingLabel", { title: monitor.title })}
          onPress={onOpen}
          style={({ pressed }) => [
            s.row,
            { flex: 1, minWidth: 0, gap: 12, alignItems: "flex-start" },
            pressed && { opacity: 0.82 },
          ]}
        >
          <View style={[s.glyph, { width: 40, height: 40, backgroundColor: colors.surface }]}>
            {monitor.schedule === "daily" || monitor.schedule === "weekly" ? (
              <CalendarDays size={18} color={colors.muted} />
            ) : monitor.condition === "contains" ? (
              <Bell size={18} color={colors.muted} />
            ) : (
              <Clock3 size={18} color={colors.muted} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text numberOfLines={2} style={s.heading}>
              {monitor.title}
            </Text>
            <Text numberOfLines={2} style={s.small}>
              {monitor.description?.trim() || monitorConditionText(monitor, t)}
            </Text>
            <Text numberOfLines={1} style={[s.small, s.metric]}>
              {monitorScheduleText(monitor, t)} · {t("agent.reminderChannelInAppShort")}
            </Text>
          </View>
        </Pressable>
        <View style={[s.row, { gap: 4 }]}>
          <Toggle
            label={t("agent.openTrackingLabel", { title: monitor.title })}
            value={active}
            disabled={busy}
            onValueChange={(next) => void toggle(next)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("agent.editReminderLabel", { title: monitor.title })}
            hitSlop={8}
            onPress={onEdit}
            style={({ pressed }) => [
              { width: 36, height: 44, alignItems: "center", justifyContent: "center" },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Pencil size={16} color={colors.muted} />
          </Pressable>
        </View>
      </View>
      <View style={[s.between, { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line }]}>
        <Text numberOfLines={1} style={[s.small, { flex: 1, marginRight: 8 }]}>
          {t("agent.monitorLastCheck", { time: stamp(monitor.lastCheckedAt) })}
        </Text>
        <View style={[s.row, { gap: 12 }]}>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onOpen}>
            <Text style={[s.small, { color: colors.link }]}>{t("agent.viewDetails")}</Text>
          </Pressable>
          {confirming ? (
            <>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setConfirming(false)}
              >
                <Text style={s.small}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void stop()}>
                <Text style={[s.small, { color: colors.danger, fontWeight: "600" }]}>
                  {t("agent.stopConfirm")}
                </Text>
              </Pressable>
            </>
          ) : (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setConfirming(true)}>
              <Text style={s.small}>{t("agent.stopTracking")}</Text>
            </Pressable>
          )}
        </View>
      </View>
      <ErrorNotice error={error} />
    </Card>
  );
}

export function MonitorCard({
  monitor,
  onOpenTask,
}: {
  monitor: Monitor;
  onOpenTask?: () => void;
}) {
  const { t } = useTranslation();
  const { mutate } = useAgentWorkspace();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action: string) {
    setBusy(true);
    setError("");
    try {
      await mutate(`/monitors/${monitor.id}/control`, { action });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function changeSample() {
    setBusy(true);
    setError("");
    try {
      await mutate("/sample-page", {
        text: `Availability: a table is available. Updated ${new Date().toISOString()}`,
      });
      await mutate(`/monitors/${monitor.id}/control`, { action: "check" });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 12 }}>
      <View style={s.between}>
        <Text style={[s.heading, { flex: 1 }]}>{monitor.title}</Text>
        <Chip tint={colors.sky}>{statusLabel(monitor.status)}</Chip>
      </View>
      <Text selectable style={s.small}>
        {monitor.url.startsWith("sample:") ? t("agent.builtInAvailabilityPage") : monitor.url}
      </Text>
      <Text style={s.text}>{monitor.description?.trim() || monitorConditionText(monitor, t)}</Text>
      <Text style={[s.small, s.metric]}>
        {monitorScheduleText(monitor, t)} · {t("agent.reminderChannelInAppShort")}
      </Text>
      <Text style={s.small}>
        {t("agent.monitorLastCheck", { time: stamp(monitor.lastCheckedAt) })}
        {monitor.status === "active"
          ? t("agent.monitorNextCheck", { time: stamp(monitor.nextCheckAt) })
          : ""}
      </Text>
      {!!monitor.lastValue && (
        <Text selectable numberOfLines={5} style={s.muted}>
          {monitor.lastValue}
        </Text>
      )}
      <ErrorNotice error={error || monitor.error} />
      {monitor.status !== "stopped" && (
        <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
          <Button
            small
            busy={busy}
            onPress={() => void act(monitor.status === "active" ? "pause" : "resume")}
          >
            {monitor.status === "active" ? t("agent.pause") : t("agent.resume")}
          </Button>
          <Button small busy={busy} onPress={() => void act("check")}>
            {t("agent.checkNow")}
          </Button>
          <Button small danger busy={busy} onPress={() => void act("stop")}>
            {t("agent.stopTracking")}
          </Button>
        </View>
      )}
      {monitor.url.startsWith("sample:") && monitor.status !== "stopped" && (
        <Button small busy={busy} onPress={() => void changeSample()}>
          {t("agent.changeAvailability")}
        </Button>
      )}
      <TaskLink taskId={monitor.taskId} onOpen={onOpenTask} />
    </Card>
  );
}
export function NotificationsSheet() {
  const { t } = useTranslation();
  const { data, mutate } = useAgentWorkspace();
  const { close, open } = useWorkspace();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function read(id: string, taskId?: string) {
    try {
      await mutate(`/notifications/${id}/read`, {});
      if (taskId) open({ type: "task", taskId });
    } catch (e) {
      setError(errorText(e));
    }
  }
  const unread = data?.notifications.filter((item) => !item.read).length || 0;
  async function readAll() {
    if (!unread || busy) return;
    setBusy(true);
    try {
      await mutate("/notifications/read-all", {});
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={t("agent.notificationsTitle")}
      subtitle={t("agent.notificationsSubtitle")}
      headerAction={
        <Button small quietBusy busy={busy} disabled={!unread} onPress={() => void readAll()}>
          {t("agent.markAllRead")}
        </Button>
      }
      onClose={close}
    >
      <View style={{ gap: 10 }}>
        <ErrorNotice error={error} />
        {data?.notifications.map((item) => (
          <Card
            key={item.id}
            style={{
              gap: 6,
              padding: 14,
              // 未读通知用品牌浅蓝色底提示，已读回到白底。
              backgroundColor: item.read ? colors.paper : colors.sky,
              borderColor: item.read ? colors.line : colors.lineStrong,
            }}
          >
            <View style={[s.between, { gap: 10 }]}>
              <Text numberOfLines={2} style={s.heading}>
                {item.title}
              </Text>
              {!item.read && <Chip>{t("agent.newChip")}</Chip>}
            </View>
            {!!item.body.trim() && (
              <Text numberOfLines={2} style={s.small}>
                {notificationExcerpt(item.body)}
              </Text>
            )}
            <View style={[s.between, { gap: 10 }]}>
              <Text style={[s.small, s.metric]}>{stamp(item.createdAt)}</Text>
              <Button small onPress={() => void read(item.id, item.taskId)}>
                {item.taskId
                  ? t("agent.viewTask")
                  : item.read
                    ? t("agent.read")
                    : t("agent.markRead")}
              </Button>
            </View>
          </Card>
        ))}
        {!data?.notifications.length && (
          <Empty
            icon={Bell}
            title={t("agent.allCaughtUp")}
            detail={t("agent.notificationsEmptyDetail")}
          />
        )}
      </View>
    </Sheet>
  );
}
