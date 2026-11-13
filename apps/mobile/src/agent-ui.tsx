import { useEffect, useMemo, useRef, useState } from "react";
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
import { goalsEnabled } from "../../../packages/domain/src/features";
import { resolveMonitorCurrency } from "../../../packages/domain/src/monitor-currency";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { assistantMarkdown, isSafeAssistantUrl } from "./assistant-markdown";
import { AssistantResponse } from "./assistant-response";
import { CardGrid } from "./card-grid";
import { fileTypeName } from "./file-kind";
import { activeLocaleTag, type TranslationFn, type TranslationKey, useTranslation } from "./i18n";
import { runtimeLabel, statusLabel, tr } from "./i18n/translate";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Brain,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FilePlus2,
  FileText,
  Funnel,
  Globe2,
  Heart,
  type IconComponent,
  IdCard,
  Lightbulb,
  Link2,
  ListChecks,
  MessageCircleQuestion,
  Newspaper,
  PanelsTopLeft,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Tag,
  Target,
  Users,
  X,
} from "./icons";
import { monitorConditionText, monitorScheduleText, WEEKDAYS } from "./monitor-text";
import { notificationExcerpt } from "./notification-text";
import { buildNotificationGroups } from "./notification-view";
import { PageHeader } from "./page-header";
import { StatusBadge, taskStatusTone } from "./status-badge";
import { localizedSymbolName } from "./symbol-names";
import {
  hasInternalTaskText,
  listedWorkTasks,
  presentTask,
  taskRequiresSetup,
} from "./task-presentation";
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
import { useNotificationActions } from "./use-notification-actions";
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
  stacked = false,
  onOpen,
  showGoal = goalsEnabled,
}: {
  task: AgentTask;
  compact?: boolean;
  /** 纵向布局（图标在上、文字在下），用于双列网格；默认横向布局用于窄列表。 */
  stacked?: boolean;
  onOpen?: () => void;
  showGoal?: boolean;
}) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { open } = useWorkspace();
  const view = presentTask(task);
  const goal =
    showGoal && task.goalId ? data?.goals.find((item) => item.id === task.goalId) : undefined;
  const milestone = goal?.milestones.find((item) => item.id === task.milestoneId);
  const Icon = task.kind === "monitor" ? Bell : task.kind === "research" ? Sparkles : ListChecks;
  const title = (
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
  );
  const status = view.attention ? (
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
  );
  const stampText = (
    <Text style={{ color: colors.faint, fontSize: 11, lineHeight: 18 }}>
      {stamp(view.updatedAt)}
    </Text>
  );
  const goalLink =
    goal &&
    (milestone
      ? t("agent.taskGoalMilestoneContext", {
          goal: goal.title,
          milestone: milestone.title,
        })
      : t("agent.taskGoalContext", { goal: goal.title }));
  const iconBox = (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 11,
        backgroundColor: colors.surfaceRaised,
        alignItems: "center",
        justifyContent: "center",
        marginTop: stacked ? 0 : 1,
      }}
    >
      <Icon size={17} color={colors.primary} />
    </View>
  );
  const chevron = <ChevronRight size={15} color={colors.faint} />;
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
        flex: 1,
        padding: compact ? 12 : 14,
        gap: 10,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 14,
        backgroundColor: pressed ? colors.surfaceRaised : colors.paper,
      })}
    >
      {stacked ? (
        <View style={{ gap: 10 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            {iconBox}
            {chevron}
          </View>
          {title}
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            {status}
            {stampText}
          </View>
          {goal && (
            <Text
              accessibilityRole="link"
              accessibilityLabel={t("agent.openGoalLabel", { title: goal.title })}
              numberOfLines={1}
              onPress={(event) => {
                event.stopPropagation();
                onOpen?.();
                open({ type: "goal", goalId: goal.id });
              }}
              style={[s.small, { color: colors.link }]}
            >
              {goalLink}
            </Text>
          )}
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 11 }}>
          {iconBox}
          <View style={{ flex: 1, minWidth: 0, gap: 9 }}>
            {title}
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              {status}
              {stampText}
            </View>
            {goal && (
              <Text
                accessibilityRole="link"
                accessibilityLabel={t("agent.openGoalLabel", { title: goal.title })}
                numberOfLines={1}
                onPress={(event) => {
                  event.stopPropagation();
                  onOpen?.();
                  open({ type: "goal", goalId: goal.id });
                }}
                style={[s.small, { color: colors.link }]}
              >
                {goalLink}
              </Text>
            )}
          </View>
          {chevron}
        </View>
      )}
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
  // 任务页只列一次性工作。监控任务由「自动化」页的规则代表。
  const all = listedWorkTasks(data?.tasks ?? []).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
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
      <CardGrid
        items={tasks}
        // 任务卡按双列网格展示：单栏下限放宽到 320，窄屏仍自动退化为单列。
        minColumnWidth={320}
        getKey={(task) => task.id}
        render={(task) => <TaskCard task={task} stacked />}
      />
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
  const goal =
    goalsEnabled && task?.goalId ? data?.goals.find((item) => item.id === task.goalId) : undefined;
  const milestone = goal?.milestones.find((item) => item.id === task?.milestoneId);
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
          {goal && (
            <Text
              accessibilityRole="link"
              accessibilityLabel={t("agent.openGoalLabel", { title: goal.title })}
              onPress={(event) => {
                event.stopPropagation();
                open({ type: "goal", goalId: goal.id });
              }}
              style={[s.small, { color: colors.link }]}
            >
              {milestone
                ? t("agent.taskGoalMilestoneContext", {
                    goal: goal.title,
                    milestone: milestone.title,
                  })
                : t("agent.taskGoalContext", { goal: goal.title })}
            </Text>
          )}
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
  // 分享 / 导出收纳在详情页工具栏里，卡片本身不重复放置动作按钮。
  return (
    <View
      style={{
        width: "100%",
        maxWidth: 520,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.paper,
        overflow: "hidden",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={artifact.title}
        onPress={() => open({ type: "artifact", artifact })}
        style={({ pressed }) => [
          { padding: 12, gap: 6 },
          pressed && { backgroundColor: colors.overlay1 },
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
    </View>
  );
}
export function DelegateSheet({
  goalId,
  milestoneId,
  initialKind,
}: {
  goalId?: string;
  milestoneId?: string;
  initialKind?: AgentTask["kind"];
}) {
  const { t } = useTranslation();
  const { workspace, close, open } = useWorkspace();
  const { data, delegate } = useAgentWorkspace();
  const linkedGoalId = goalsEnabled ? goalId : undefined;
  const linkedMilestoneId = goalsEnabled ? milestoneId : undefined;
  const goal = data?.goals.find((item) => item.id === linkedGoalId);
  const milestone = goal?.milestones.find((item) => item.id === linkedMilestoneId);
  const submission = useRef<{ input: string; id: string } | null>(null);
  const submitting = useRef(false);
  const [kind, setKind] = useState<AgentTask["kind"]>(initialKind ?? "plan");
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
        ...(linkedGoalId ? { goalId: linkedGoalId, milestoneId: linkedMilestoneId } : {}),
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
      {linkedMilestoneId && (
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
          Boolean(linkedMilestoneId && !milestone) ||
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
  {
    titleKey: "agent.templateQualityTitle",
    descriptionKey: "agent.templateQualityDescription",
    promptKey: "agent.templateQualityPrompt",
    icon: ShieldAlert,
  },
  {
    titleKey: "agent.templateCallTitle",
    descriptionKey: "agent.templateCallDescription",
    promptKey: "agent.templateCallPrompt",
    icon: MessageCircleQuestion,
  },
  {
    titleKey: "agent.templateRiskTitle",
    descriptionKey: "agent.templateRiskDescription",
    promptKey: "agent.templateRiskPrompt",
    icon: AlertTriangle,
  },
  {
    titleKey: "agent.templateHoldersTitle",
    descriptionKey: "agent.templateHoldersDescription",
    promptKey: "agent.templateHoldersPrompt",
    icon: Users,
  },
  {
    titleKey: "agent.templateTargetPriceTitle",
    descriptionKey: "agent.templateTargetPriceDescription",
    promptKey: "agent.templateTargetPricePrompt",
    icon: Tag,
  },
  {
    titleKey: "agent.templateEtfTitle",
    descriptionKey: "agent.templateEtfDescription",
    promptKey: "agent.templateEtfPrompt",
    icon: PanelsTopLeft,
  },
  {
    titleKey: "agent.templateBondTitle",
    descriptionKey: "agent.templateBondDescription",
    promptKey: "agent.templateBondPrompt",
    icon: IdCard,
  },
  {
    titleKey: "agent.templateTradeReviewTitle",
    descriptionKey: "agent.templateTradeReviewDescription",
    promptKey: "agent.templateTradeReviewPrompt",
    icon: RotateCcw,
  },
  {
    titleKey: "agent.templateMacroTitle",
    descriptionKey: "agent.templateMacroDescription",
    promptKey: "agent.templateMacroPrompt",
    icon: CalendarClock,
  },
  {
    titleKey: "agent.templateFxTitle",
    descriptionKey: "agent.templateFxDescription",
    promptKey: "agent.templateFxPrompt",
    icon: RefreshCw,
  },
  {
    titleKey: "agent.templateMemoTitle",
    descriptionKey: "agent.templateMemoDescription",
    promptKey: "agent.templateMemoPrompt",
    icon: Newspaper,
  },
  {
    titleKey: "agent.templateIpoTitle",
    descriptionKey: "agent.templateIpoDescription",
    promptKey: "agent.templateIpoPrompt",
    icon: FilePlus2,
  },
  {
    titleKey: "agent.templateScreenerTitle",
    descriptionKey: "agent.templateScreenerDescription",
    promptKey: "agent.templateScreenerPrompt",
    icon: Funnel,
  },
  {
    titleKey: "agent.templateCrossMarketTitle",
    descriptionKey: "agent.templateCrossMarketDescription",
    promptKey: "agent.templateCrossMarketPrompt",
    icon: Link2,
  },
  {
    titleKey: "agent.templateWeeklyMoversTitle",
    descriptionKey: "agent.templateWeeklyMoversDescription",
    promptKey: "agent.templateWeeklyMoversPrompt",
    icon: Search,
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
  const visibleIdeas = (data?.ideas ?? []).filter(
    (idea) => goalsEnabled || (idea.kind !== "plan" && typeof idea.input.goalId !== "string"),
  );
  const ideas = visibleIdeas.filter((idea) => idea.status === "new");
  const threeColumns = width >= 720;
  return (
    <View style={{ gap: 18 }}>
      <AgentStatus />
      <View style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
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
                  minHeight: threeColumns ? 152 : 196,
                  gap: threeColumns ? 10 : 12,
                  padding: threeColumns ? 14 : 12,
                  borderRadius: radius.card,
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
      {visibleIdeas
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
    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("agent.viewIdeaLabel", { title: idea.title })}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        // 可点击行按压态用 overlay1，圆角与控件体系一致。
        style={({ pressed }) => [
          { flexDirection: "row", gap: 10, borderRadius: radius.control },
          pressed && { backgroundColor: colors.overlay1 },
        ]}
      >
        <View style={{ width: 30, alignItems: "center", justifyContent: "center" }}>
          <IdeaIcon size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[s.heading, { fontSize: 14, lineHeight: 21 }]}>{idea.title}</Text>
          <Text style={s.muted}>{idea.reason}</Text>
        </View>
      </Pressable>
      {expanded && (
        <View style={{ gap: 12, marginTop: 10, paddingLeft: 40 }}>
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
type TrackingFilter = "all" | "goal" | "monitor";
/** 目标与提醒在视图层聚合成统一列表项；领域模型与接口保持不变。 */
type TrackingItem =
  | { kind: "goal"; id: string; sortAt: string; goal: Goal }
  | { kind: "monitor"; id: string; sortAt: string; monitor: Monitor };
export type ReminderTemplate = (typeof REMINDER_TEMPLATES)[number];
/** 新建流程的层级状态，取代原先用字符串混用的 adding。 */
type ComposerStep =
  | { kind: "picker" }
  | { kind: "goalCategories" }
  | { kind: "goalForm"; category: string }
  | { kind: "reminderOptions" }
  | { kind: "reminderForm"; template?: ReminderTemplate; priceReminder?: PriceReminderIntent };
/** 目标分类：内部类目名与 GOAL_TEMPLATES 的分组 key 保持一致。 */
export const GOAL_CATEGORIES = [
  { name: "Health", labelKey: "agent.categoryHealth", icon: Heart },
  { name: "Relationships", labelKey: "agent.categoryRelationships", icon: Users },
  { name: "Finances", labelKey: "agent.categoryFinances", icon: CircleDollarSign },
  { name: "Something else", labelKey: "agent.categorySomethingElse", icon: Target },
] as const satisfies ReadonlyArray<{ name: string; labelKey: TranslationKey; icon: IconComponent }>;
const trackingKey = (item: { kind: TrackingItem["kind"]; id: string }) => `${item.kind}:${item.id}`;
/**
 * 目标与提醒的统一工作台。
 *
 * 两者在数据层仍是 Goal / Monitor 两条独立数据流，这里只在视图层合流：
 * 一排筛选胶囊切换 全部 / 目标 / 提醒，一个「新建」入口按类型分两级引导。
 */
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
  const [filter, setFilter] = useState<TrackingFilter>("all");
  const [composer, setComposer] = useState<ComposerStep>();
  const [selectedGoal, setSelectedGoal] = useState<string>();
  const [selectedMonitor, setSelectedMonitor] = useState<string>();
  const [editingMonitor, setEditingMonitor] = useState<string>();
  const goal = data?.goals.find((item) => item.id === selectedGoal);
  const monitor = data?.monitors.find((item) => item.id === selectedMonitor);
  const monitorToEdit = data?.monitors.find((item) => item.id === editingMonitor);
  useEffect(() => {
    if (!reminderIntent) return;
    // 其它页面发起的「设置股价提醒」直接落到提醒表单，跳过两级引导。
    setComposer({ kind: "reminderForm", priceReminder: reminderIntent });
    onReminderIntentHandled?.();
  }, [onReminderIntentHandled, reminderIntent]);
  // 已停止的盯盘不再出现在列表里（服务端无删除接口，停止即视为移除）。
  const monitors = (data?.monitors || []).filter((item) => item.status !== "stopped");
  const items = useMemo<TrackingItem[]>(() => {
    const goals: TrackingItem[] = goalsEnabled
      ? (data?.goals ?? []).map((item) => ({
          kind: "goal" as const,
          id: item.id,
          sortAt: item.createdAt,
          goal: item,
        }))
      : [];
    const reminders: TrackingItem[] = (data?.monitors ?? [])
      .filter((item) => item.status !== "stopped")
      .map((item) => ({
        kind: "monitor",
        id: item.id,
        sortAt: item.lastCheckedAt ?? item.nextCheckAt,
        monitor: item,
      }));
    // 最近活跃的在前：目标用创建时间，提醒用上次检查 / 下次检查时间。
    return [...goals, ...reminders].sort((a, b) => (b.sortAt || "").localeCompare(a.sortAt || ""));
  }, [data?.goals, data?.monitors]);
  // 3 秒轮询会刷新 lastCheckedAt；顺序只在成员（集合）变化时重算，避免列表随刷新跳动。
  const signature = items
    .map(trackingKey)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
  const order = useMemo(() => items.map(trackingKey), [signature]);
  const byKey = new Map(items.map((item) => [trackingKey(item), item] as const));
  const sorted = order
    .map((key) => byKey.get(key))
    .filter((item): item is TrackingItem => Boolean(item));
  const visible = filter === "all" ? sorted : sorted.filter((item) => item.kind === filter);
  const filters: Array<{ id: TrackingFilter; label: string; count: number }> = [
    {
      id: "all",
      label: t("agent.trackingFilterAll"),
      count: goalsEnabled ? sorted.length : monitors.length,
    },
    ...(goalsEnabled
      ? [{ id: "goal" as const, label: t("agent.goalsTab"), count: data?.goals.length ?? 0 }]
      : []),
    { id: "monitor", label: t("agent.remindersTab"), count: monitors.length },
  ];
  // 层级返回：picker ← 分类 / 模板 ← 表单；个股页直达的表单没有返回层。
  const backTo: ComposerStep | undefined = !composer
    ? undefined
    : composer.kind === "goalCategories" || composer.kind === "reminderOptions"
      ? { kind: "picker" }
      : composer.kind === "goalForm"
        ? { kind: "goalCategories" }
        : composer.kind === "reminderForm" && !composer.priceReminder
          ? { kind: "reminderOptions" }
          : undefined;
  const composerTitle =
    !composer || composer.kind === "picker"
      ? t("agent.newTrackingTitle")
      : composer.kind === "reminderOptions" || composer.kind === "reminderForm"
        ? t("agent.addReminder")
        : t("agent.createGoal");
  const composerSubtitle =
    composer?.kind === "goalCategories"
      ? t("agent.newGoalSubtitle")
      : composer?.kind === "reminderOptions"
        ? t("agent.newReminderSubtitle")
        : undefined;
  const emptyState = !visible.length ? (
    filter === "goal" ? (
      <Empty icon={Square} title={t("agent.goalsEmptyTitle")} detail={t("agent.goalsEmpty")}>
        <Button small primary icon={Plus} onPress={() => setComposer({ kind: "goalCategories" })}>
          {t("agent.createGoal")}
        </Button>
      </Empty>
    ) : filter === "monitor" ? (
      <Empty
        icon={Bell}
        title={t("agent.remindersEmptyTitle")}
        detail={t("agent.remindersEmptyDetail")}
      >
        <Button small primary icon={Plus} onPress={() => setComposer({ kind: "reminderOptions" })}>
          {t("agent.addFirstReminder")}
        </Button>
      </Empty>
    ) : (
      <Empty
        icon={Target}
        title={goalsEnabled ? t("agent.trackingEmptyTitle") : t("agent.automationsEmptyTitle")}
        detail={goalsEnabled ? t("agent.trackingEmptyDetail") : t("agent.automationsEmptyDetail")}
      >
        <Button
          small
          primary
          icon={Plus}
          onPress={() =>
            setComposer(goalsEnabled ? { kind: "picker" } : { kind: "reminderOptions" })
          }
        >
          {t("agent.newTracking")}
        </Button>
      </Empty>
    )
  ) : null;
  return (
    <View style={{ gap: 20 }}>
      {!embedded && (
        <PageHeader
          title={goalsEnabled ? t("agent.monitorsHeroTitle") : t("agent.automationsHeroTitle")}
          description={
            goalsEnabled
              ? t("agent.monitorsHeroDescription")
              : t("agent.automationsHeroDescription")
          }
          compact={width < breakpoints.desktop}
          actions={
            <Button
              small
              primary
              icon={Plus}
              onPress={() =>
                setComposer(goalsEnabled ? { kind: "picker" } : { kind: "reminderOptions" })
              }
            >
              {t("agent.newTracking")}
            </Button>
          }
          style={{ marginBottom: 0 }}
        />
      )}
      <AgentStatus />
      <View style={{ gap: 14 }}>
        {(goalsEnabled || embedded) && (
          <View
            style={[
              s.row,
              {
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: goalsEnabled ? "space-between" : "flex-end",
              },
            ]}
          >
            {goalsEnabled && (
              <View accessibilityRole="tablist" style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                {filters.map((item) => {
                  const active = filter === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="tab"
                      accessibilityLabel={item.label}
                      accessibilityState={{ selected: active }}
                      onPress={() => setFilter(item.id)}
                      // 胶囊筛选：选中态用浅蓝底 + 主色描边，宽度随内容自然收放。
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        minHeight: 34,
                        paddingHorizontal: 13,
                        borderRadius: radius.full,
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.line,
                        backgroundColor: active ? colors.sky : colors.paper,
                        opacity: pressed ? 0.72 : 1,
                      })}
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
                      <Text
                        style={[
                          s.metric,
                          { fontSize: 10, color: active ? colors.primary : colors.faint },
                        ]}
                      >
                        {item.count}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {/* 内嵌（任务中心一级 Tab）时不渲染 PageHeader，新建入口放在这一行右侧。 */}
            {embedded && (
              <Button
                small
                primary
                icon={Plus}
                onPress={() =>
                  setComposer(goalsEnabled ? { kind: "picker" } : { kind: "reminderOptions" })
                }
              >
                {t("agent.newTracking")}
              </Button>
            )}
          </View>
        )}
        <View style={{ gap: 10 }}>
          {visible.map((item) =>
            item.kind === "goal" ? (
              <GoalTrackingRow
                key={trackingKey(item)}
                goal={item.goal}
                onOpen={() => setSelectedGoal(item.id)}
              />
            ) : (
              <TrackingRow
                key={trackingKey(item)}
                monitor={item.monitor}
                onOpen={() => setSelectedMonitor(item.id)}
                onEdit={() => setEditingMonitor(item.id)}
              />
            ),
          )}
          {emptyState}
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: colors.line }} />
      {/* 委派任务：交办一项成果，由灵悟保存计划并持续执行（原来的边栏入口，用户要求移入这里）。 */}
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
        <Text style={[s.text, { flex: 1, color: colors.muted }]}>{t("threads.delegateTask")}</Text>
        <ChevronRight size={18} color={colors.muted} />
      </Pressable>
      {composer && (
        <Sheet
          title={composerTitle}
          subtitle={composerSubtitle}
          headerAction={
            backTo ? (
              <Button small onPress={() => setComposer(backTo)}>
                {t("common.back")}
              </Button>
            ) : undefined
          }
          small={composer.kind === "picker"}
          onClose={() => setComposer(undefined)}
        >
          {composer.kind === "picker" && (
            <View style={{ gap: 10 }}>
              {goalsEnabled && (
                <OptionCard
                  icon={Target}
                  title={t("agent.newGoalOption")}
                  detail={t("agent.newGoalOptionDetail")}
                  onPress={() => setComposer({ kind: "goalCategories" })}
                />
              )}
              <OptionCard
                icon={Bell}
                title={t("agent.newReminderOption")}
                detail={t("agent.newReminderOptionDetail")}
                onPress={() => setComposer({ kind: "reminderOptions" })}
              />
            </View>
          )}
          {goalsEnabled && composer.kind === "goalCategories" && (
            <View style={{ gap: 4 }}>
              {GOAL_CATEGORIES.map((item) => (
                <Pressable
                  key={item.name}
                  accessibilityRole="button"
                  accessibilityLabel={t("agent.createGoalA11y", { category: t(item.labelKey) })}
                  onPress={() => setComposer({ kind: "goalForm", category: item.name })}
                  style={({ pressed }) => [
                    s.row,
                    { gap: 12, minHeight: 46, borderRadius: 10, paddingHorizontal: 2 },
                    pressed && { backgroundColor: colors.overlay1 },
                  ]}
                >
                  <item.icon size={20} color={colors.muted} />
                  <Text style={[s.text, { flex: 1 }]}>{t(item.labelKey)}</Text>
                  <ChevronRight size={18} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          )}
          {goalsEnabled && composer.kind === "goalForm" && (
            <GoalForm
              category={composer.category}
              onDone={() => {
                // 创建后切到对应筛选，避免新建项落在当前视图之外。
                setFilter("goal");
                setComposer(undefined);
              }}
            />
          )}
          {composer.kind === "reminderOptions" && (
            <View style={{ gap: 16 }}>
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
                  <Text style={[s.heading, { fontSize: 15 }]}>
                    {t("agent.monitorContextTitle")}
                  </Text>
                  <Text style={[s.muted, { lineHeight: 21 }]}>
                    {t("agent.monitorContextDetail")}
                  </Text>
                </View>
              </Card>
              <View style={{ gap: 12 }}>
                <SectionHeading title={t("agent.reminderTemplates")} />
                <View style={{ flexDirection: width < 760 ? "column" : "row", gap: 12 }}>
                  {REMINDER_TEMPLATES.map((template) => {
                    const Icon = template.icon;
                    return (
                      <Pressable
                        key={template.id}
                        accessibilityRole="button"
                        accessibilityLabel={t(template.titleKey)}
                        onPress={() => setComposer({ kind: "reminderForm", template })}
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
                          <View style={[s.iconBox, { width: 34, height: 34 }]}>
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
              <OptionCard
                icon={Plus}
                title={t("agent.customReminder")}
                detail={t("agent.customReminderDetail")}
                onPress={() => setComposer({ kind: "reminderForm" })}
              />
            </View>
          )}
          {composer.kind === "reminderForm" && (
            <MonitorForm
              template={composer.template}
              priceReminder={composer.priceReminder}
              onDone={() => {
                setFilter("monitor");
                setComposer(undefined);
              }}
            />
          )}
        </Sheet>
      )}
      {monitorToEdit && (
        <Sheet title={t("agent.editReminder")} onClose={() => setEditingMonitor(undefined)}>
          <MonitorForm monitor={monitorToEdit} onDone={() => setEditingMonitor(undefined)} />
        </Sheet>
      )}
      {goalsEnabled && goal && (
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
/**
 * 新建引导里的选项卡：图标 + 标题 + 一句说明 + 进入箭头。
 * 用于第一级选择（建立目标 / 设置提醒）与「自定义提醒」入口。
 */
function OptionCard({
  icon: Icon,
  title,
  detail,
  onPress,
}: {
  icon: IconComponent;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        minHeight: 76,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: pressed ? colors.lineStrong : colors.line,
        borderRadius: 11,
        backgroundColor: pressed ? colors.overlay1 : colors.paper,
      })}
    >
      <View style={[s.iconBox, { width: 38, height: 38, backgroundColor: colors.sky }]}>
        <Icon size={19} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[s.heading, { fontSize: 15 }]}>{title}</Text>
        <Text style={s.small}>{detail}</Text>
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
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
  if (!goalsEnabled) return null;
  async function save() {
    if (!goalsEnabled) return;
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
export function GoalCard({
  goal,
  onOpenTask,
  onCreateReminder,
}: {
  goal: Goal;
  onOpenTask?: () => void;
  onCreateReminder?: (milestoneId?: string) => void;
}) {
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
            <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
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
              {onCreateReminder && (
                <Button
                  small
                  disabled={goal.status !== "active"}
                  onPress={() => onCreateReminder(milestone.id)}
                >
                  {t("agent.goalTrackCreateReminder")}
                </Button>
              )}
            </View>
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
        {onCreateReminder && goal.status === "active" && (
          <Button small onPress={() => onCreateReminder()}>
            {t("agent.goalTrackCreateReminder")}
          </Button>
        )}
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

export const TASK_TEMPLATES: ReadonlyArray<{
  kind: "plan" | "document" | "finance" | "agent";
  titleKey: TranslationKey;
  detailKey: TranslationKey;
  icon: IconComponent;
}> = [
  {
    kind: "plan",
    titleKey: "agent.taskTemplatePlanTitle",
    detailKey: "agent.taskTemplatePlanDetail",
    icon: ListChecks,
  },
  {
    kind: "document",
    titleKey: "agent.taskTemplateDocumentTitle",
    detailKey: "agent.taskTemplateDocumentDetail",
    icon: FileText,
  },
  {
    kind: "finance",
    titleKey: "agent.taskTemplateFinanceTitle",
    detailKey: "agent.taskTemplateFinanceDetail",
    icon: CircleDollarSign,
  },
  {
    kind: "agent",
    titleKey: "agent.taskTemplateGeneralTitle",
    detailKey: "agent.taskTemplateGeneralDetail",
    icon: Sparkles,
  },
];

export const REMINDER_TEMPLATES: ReadonlyArray<{
  id: string;
  titleKey: TranslationKey;
  detailKey: TranslationKey;
  icon: IconComponent;
  schedule: ReminderSchedule;
  timeOfDay: string;
  weekday?: number;
}> = [
  {
    id: "close-review",
    titleKey: "agent.reminderTplCloseTitle",
    detailKey: "agent.reminderTplCloseDetail",
    icon: CalendarDays,
    schedule: "daily",
    timeOfDay: "15:30",
  },
  {
    id: "filing-watch",
    titleKey: "agent.reminderTplFilingTitle",
    detailKey: "agent.reminderTplFilingDetail",
    icon: Bell,
    schedule: "daily",
    timeOfDay: "09:00",
  },
  {
    id: "premarket-brief",
    titleKey: "agent.reminderTplPremarketTitle",
    detailKey: "agent.reminderTplPremarketDetail",
    icon: Clock3,
    schedule: "daily",
    timeOfDay: "08:30",
  },
  {
    id: "earnings-watch",
    titleKey: "agent.reminderTplEarningsTitle",
    detailKey: "agent.reminderTplEarningsDetail",
    icon: FileText,
    schedule: "daily",
    timeOfDay: "20:00",
  },
  {
    id: "weekly-review",
    titleKey: "agent.reminderTplWeeklyTitle",
    detailKey: "agent.reminderTplWeeklyDetail",
    icon: RefreshCw,
    schedule: "weekly",
    timeOfDay: "18:00",
    weekday: 5,
  },
  {
    id: "policy-watch",
    titleKey: "agent.reminderTplPolicyTitle",
    detailKey: "agent.reminderTplPolicyDetail",
    icon: Globe2,
    schedule: "weekly",
    timeOfDay: "09:00",
    weekday: 1,
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
  goalId,
  milestoneId,
  onDone,
}: {
  monitor?: Monitor;
  template?: ReminderTemplate;
  priceReminder?: PriceReminderIntent;
  goalId?: string;
  milestoneId?: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { workspace } = useWorkspace();
  const { data, mutate } = useAgentWorkspace();
  const [linkedGoalId, setLinkedGoalId] = useState(goalId ?? monitor?.goalId);
  const linkedGoal = linkedGoalId
    ? data?.goals.find((goal) => goal.id === linkedGoalId)
    : undefined;
  const linkableGoals = (data?.goals ?? []).filter(
    (goal) => goal.status !== "completed" || goal.id === linkedGoalId,
  );
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
  const [linkedMilestoneId, setLinkedMilestoneId] = useState(milestoneId ?? monitor?.milestoneId);
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
        ...(goalsEnabled
          ? {
              goalId: linkedGoalId ?? null,
              milestoneId: linkedGoalId && linkedMilestoneId ? linkedMilestoneId : null,
            }
          : {}),
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
      {goalsEnabled && (
        <>
          <View style={{ gap: 9, marginBottom: 16 }}>
            <Text style={s.small}>{t("agent.reminderGoalLabel")}</Text>
            <View style={[s.row, { gap: 7, flexWrap: "wrap" }]}>
              <Button
                small
                primary={!linkedGoalId}
                onPress={() => {
                  setLinkedGoalId(undefined);
                  setLinkedMilestoneId(undefined);
                }}
              >
                {t("agent.standaloneRemindersHeading")}
              </Button>
              {linkableGoals.map((goal) => (
                <Button
                  small
                  primary={linkedGoalId === goal.id}
                  key={goal.id}
                  onPress={() => {
                    setLinkedGoalId(goal.id);
                    setLinkedMilestoneId(undefined);
                  }}
                >
                  {goal.title}
                </Button>
              ))}
            </View>
          </View>
          {linkedGoal && (
            <View style={{ gap: 10, marginBottom: 16 }}>
              <View
                style={[
                  s.row,
                  {
                    gap: 8,
                    padding: 11,
                    borderRadius: 8,
                    backgroundColor: colors.sky,
                  },
                ]}
              >
                <Target size={16} color={colors.primaryStrong} />
                <Text style={[s.small, { flex: 1, color: colors.primaryStrong }]}>
                  {t("agent.reminderGoalContext", { goal: linkedGoal.title })}
                </Text>
              </View>
              {linkedGoal.milestones.length > 0 && (
                <View style={{ gap: 9 }}>
                  <Text style={s.small}>{t("agent.reminderMilestoneLabel")}</Text>
                  <View style={[s.row, { gap: 7, flexWrap: "wrap" }]}>
                    <Button
                      small
                      primary={!linkedMilestoneId}
                      onPress={() => setLinkedMilestoneId(undefined)}
                    >
                      {t("agent.reminderGoalWhole")}
                    </Button>
                    {linkedGoal.milestones.map((milestone) => (
                      <Button
                        small
                        primary={linkedMilestoneId === milestone.id}
                        key={milestone.id}
                        onPress={() => setLinkedMilestoneId(milestone.id)}
                      >
                        {milestone.title}
                      </Button>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </>
      )}
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
 * 统一追踪行：目标与提醒共用同一版式（图标 + 标题 + 一行说明 + 类型标签）。
 * 提醒额外保留启停开关与行内编辑；停止 / 立即检查等操作下沉到详情浮层，
 * 合并后列表不再挂「上次检查 + 停止」底栏，视觉噪音更低。
 */
export function TrackingRow({
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

  return (
    <Card style={{ gap: 6, borderRadius: 11, padding: 14, flex: 1 }}>
      <View style={[s.row, { gap: 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("agent.openTrackingLabel", { title: monitor.title })}
          onPress={onOpen}
          style={({ pressed }) => [
            s.row,
            { flex: 1, minWidth: 0, gap: 12 },
            pressed && { opacity: 0.82 },
          ]}
        >
          <View style={[s.glyph, { width: 38, height: 38 }]}>
            {monitor.schedule === "daily" || monitor.schedule === "weekly" ? (
              <CalendarDays size={18} color={colors.muted} />
            ) : monitor.condition === "contains" ? (
              <Bell size={18} color={colors.muted} />
            ) : (
              <Clock3 size={18} color={colors.muted} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <View style={[s.row, { gap: 8 }]}>
              <Text numberOfLines={1} style={[s.heading, { fontSize: 15, flexShrink: 1 }]}>
                {monitor.title}
              </Text>
              <Chip tint={colors.sky}>{t("agent.remindersTab")}</Chip>
            </View>
            <Text numberOfLines={1} style={s.small}>
              {monitor.description?.trim() || monitorConditionText(monitor, t)}
            </Text>
            <Text numberOfLines={1} style={[s.small, s.metric]}>
              {monitorScheduleText(monitor, t)}
            </Text>
          </View>
        </Pressable>
        <View style={[s.row, { gap: 0 }]}>
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
              { width: 30, height: 44, alignItems: "center", justifyContent: "center" },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Pencil size={16} color={colors.muted} />
          </Pressable>
        </View>
      </View>
      <ErrorNotice error={error} />
    </Card>
  );
}
/** 目标行：与提醒行同一版式，辅助信息换成分类与里程碑进度。 */
function GoalTrackingRow({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const { t } = useTranslation();
  const done = goal.milestones.filter((item) => item.done).length;
  const categoryKey = GOAL_CATEGORIES.find((item) => item.name === goal.category)?.labelKey;
  const meta = [
    categoryKey ? t(categoryKey) : "",
    goal.milestones.length
      ? t("agent.milestoneProgress", { done, total: goal.milestones.length })
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card style={{ gap: 6, borderRadius: 11, padding: 14 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("agent.openGoalLabel", { title: goal.title })}
        onPress={onOpen}
        style={({ pressed }) => [s.row, { gap: 12 }, pressed && { opacity: 0.82 }]}
      >
        <View
          style={[
            s.glyph,
            {
              width: 38,
              height: 38,
              backgroundColor: goal.status === "completed" ? colors.green : colors.surface,
            },
          ]}
        >
          <Square
            size={18}
            color={goal.status === "completed" ? colors.success : colors.muted}
            // 完成态用实心成功色填充，避免半透明语义底几乎不可见。
            fill={goal.status === "completed" ? colors.success : "none"}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={[s.row, { gap: 8 }]}>
            <Text numberOfLines={1} style={[s.heading, { fontSize: 15, flexShrink: 1 }]}>
              {goal.title}
            </Text>
            <Chip>{t("agent.goalsTab")}</Chip>
            {goal.status !== "active" && (
              <Chip tint={goal.status === "completed" ? colors.green : colors.tertiary}>
                {statusLabel(goal.status)}
              </Chip>
            )}
          </View>
          <Text numberOfLines={1} style={s.small}>
            {goal.description || statusLabel(goal.status)}
          </Text>
          {!!meta && (
            <Text numberOfLines={1} style={[s.small, s.metric]}>
              {meta}
            </Text>
          )}
        </View>
        <ChevronRight size={18} color={colors.muted} />
      </Pressable>
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
export function NotificationsSheet({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { close, open } = useWorkspace();
  const { unreadCount, error, busy, readAll, openNotification } = useNotificationActions();
  const groups = useMemo(
    () => (data ? buildNotificationGroups(goalsEnabled ? data : { ...data, goals: [] }) : []),
    [data],
  );
  const body = (
    <View style={{ gap: 20 }}>
      <ErrorNotice error={error} />
      {groups.map((group) => (
        <View key={group.id} style={{ gap: 9 }}>
          <View style={[s.between, { gap: 10, alignItems: "flex-start" }]}>
            <View style={[s.row, { flex: 1, minWidth: 0, gap: 9 }]}>
              {group.goal ? (
                <Target size={17} color={colors.primary} />
              ) : (
                <Bell size={17} color={colors.muted} />
              )}
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text numberOfLines={2} style={[s.heading, { fontSize: 15 }]}>
                  {group.goal?.title ?? t("agent.notificationGroupStandalone")}
                </Text>
                <Text style={[s.small, s.metric]}>
                  {t("agent.notificationGroupCount", {
                    count: String(group.notifications.length),
                  })}
                  {group.unread
                    ? ` · ${t("agent.notificationGroupUnread", { count: String(group.unread) })}`
                    : ""}
                </Text>
              </View>
            </View>
            {group.goalId ? (
              <Button
                small
                onPress={() => {
                  if (group.goalId) open({ type: "goal", goalId: group.goalId });
                }}
              >
                {t("agent.goalTrackViewGoal")}
              </Button>
            ) : null}
          </View>
          <View style={{ gap: 10 }}>
            {group.notifications.map((item) => (
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
                    {runtimeLabel(item.title)}
                  </Text>
                  {!item.read && <Chip>{t("agent.newChip")}</Chip>}
                </View>
                {!!item.body.trim() && (
                  <Text numberOfLines={2} style={s.small}>
                    {runtimeLabel(notificationExcerpt(item.body))}
                  </Text>
                )}
                <View style={[s.between, { gap: 10 }]}>
                  <Text style={[s.small, s.metric]}>{stamp(item.createdAt)}</Text>
                  <Button small onPress={() => void openNotification(item)}>
                    {item.taskId
                      ? t("agent.viewTask")
                      : item.read
                        ? t("agent.read")
                        : t("agent.markRead")}
                  </Button>
                </View>
              </Card>
            ))}
          </View>
        </View>
      ))}
      {!data?.notifications.length && (
        <Empty
          icon={Bell}
          title={t("agent.allCaughtUp")}
          detail={t("agent.notificationsEmptyDetail")}
        />
      )}
    </View>
  );
  if (embedded) return body;
  return (
    <Sheet
      title={t("agent.notificationsTitle")}
      subtitle={t("agent.notificationsSubtitle")}
      headerAction={
        <Button
          small
          quietBusy
          busy={busy}
          disabled={!unreadCount || busy}
          onPress={() => void readAll()}
        >
          {t("agent.markAllRead")}
        </Button>
      }
      onClose={close}
    >
      {body}
    </Sheet>
  );
}
