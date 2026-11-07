import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, useWindowDimensions, View } from "react-native";
import type { Monitor } from "../../../packages/domain/src/agent";
import {
  AgentStatus,
  GOAL_CATEGORIES,
  GoalCard,
  GoalForm,
  MonitorCard,
  MonitorForm,
  REMINDER_TEMPLATES,
  type ReminderTemplate,
  TASK_TEMPLATES,
  TrackingRow,
} from "./agent-ui";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { activeLocaleTag, type TranslationKey, useTranslation } from "./i18n";
import { statusLabel } from "./i18n/translate";
import { Bell, CalendarDays, ChevronRight, type IconComponent, Plus, Target } from "./icons";
import { monitorScheduleText } from "./monitor-text";
import { PageHeader } from "./page-header";
import { breakpoints, colors, fonts, radius } from "./theme";
import {
  type AttentionAction,
  type AttentionReason,
  buildTrackingView,
  type GoalTrack,
} from "./tracking-view";
import { Button, Card, CardGrid, Chip, Empty, SectionHeading, Sheet, s } from "./ui";
import { type PriceReminderIntent, useWorkspace } from "./workspace";

type TrackingFilter = "all" | "goal" | "reminder";
type ComposerStep =
  | { kind: "picker" }
  | { kind: "goalCategories" }
  | { kind: "goalForm"; category: string }
  | { kind: "reminderOptions"; goalId?: string; milestoneId?: string }
  | {
      kind: "reminderForm";
      template?: ReminderTemplate;
      priceReminder?: PriceReminderIntent;
      goalId?: string;
      milestoneId?: string;
    };

const REASON_KEYS: Record<AttentionReason, TranslationKey> = {
  task_input: "agent.attentionTaskInput",
  task_review: "agent.attentionTaskReview",
  task_failed: "agent.attentionTaskFailed",
  task_running: "agent.attentionTaskRunning",
  monitor_error: "agent.attentionMonitorError",
  monitor_due: "agent.attentionMonitorDue",
  monitor_active: "agent.attentionMonitorActive",
  monitor_paused: "agent.attentionMonitorPaused",
  goal_plan: "agent.attentionGoalPlan",
  goal_milestone: "agent.attentionGoalMilestone",
  goal_review: "agent.attentionGoalReview",
};

const ACTION_KEYS: Record<AttentionAction, TranslationKey> = {
  add_details: "agent.nextUpActionInput",
  review: "agent.nextUpActionReview",
  retry: "agent.nextUpActionRetry",
  continue: "agent.continueTask",
  fix_reminder: "agent.nextUpActionFixReminder",
  view_reminder: "agent.nextUpActionViewReminder",
  plan_next: "agent.planNextSteps",
  view_goal: "agent.goalTrackViewGoal",
};

const goalTrackKey = (track: GoalTrack) => track.goal.id;
const reminderKey = (monitor: Monitor) => monitor.id;

function useStableOrder<T>(items: readonly T[], key: (item: T) => string) {
  const signature = items
    .map(key)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
  const order = useRef({ signature: "", ids: [] as string[] });
  return useMemo(() => {
    if (order.current.signature !== signature) {
      order.current = { signature, ids: items.map(key) };
      return [...items];
    }
    const byKey = new Map(items.map((item) => [key(item), item] as const));
    return order.current.ids.map((id) => byKey.get(id)).filter((item): item is T => Boolean(item));
  }, [items, key, signature]);
}

function relativeWhen(value?: string) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const diff = timestamp - Date.now();
  const absolute = Math.abs(diff);
  const units: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
  ];
  const formatter = new Intl.RelativeTimeFormat(activeLocaleTag(), { numeric: "auto" });
  for (const [unit, size] of units) {
    if (absolute >= size || unit === "minute") {
      const amount = Math.sign(diff) * Math.max(1, Math.round(absolute / size));
      return formatter.format(amount, unit);
    }
  }
  return "";
}

function FilterPill({
  active,
  label,
  count,
  onPress,
}: {
  active: boolean;
  label: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
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
        {label}
      </Text>
      <Text style={[s.metric, { fontSize: 10, color: active ? colors.primary : colors.faint }]}>
        {count}
      </Text>
    </Pressable>
  );
}

function OptionCard({
  icon: Icon,
  title,
  detail,
  onPress,
}: {
  icon: typeof Target;
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

/**
 * 任务模板与目标分类共用同一张卡片：图标 + 标题 +（可选）说明。
 * 右上角统一用 chevron 表示「进入下一步」；分类没有说明时自然收成更矮的卡片。
 */
function TemplateCard({
  icon: Icon,
  title,
  detail,
  accessibilityLabel,
  onPress,
}: {
  icon: IconComponent;
  title: string;
  detail?: string;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        gap: 8,
        padding: 14,
        borderWidth: 1,
        borderColor: pressed ? colors.lineStrong : colors.line,
        borderRadius: radius.card,
        backgroundColor: pressed ? colors.overlay1 : colors.paper,
      })}
    >
      <View style={[s.between, { alignItems: "flex-start" }]}>
        <View style={[s.iconBox, { width: 30, height: 30, backgroundColor: colors.sky }]}>
          <Icon size={16} color={colors.primary} />
        </View>
        <ChevronRight size={16} color={colors.faint} />
      </View>
      <View style={{ gap: 3 }}>
        <Text style={[s.heading, { fontSize: 14 }]} numberOfLines={1}>
          {title}
        </Text>
        {!!detail && (
          <Text style={[s.small, { lineHeight: 18 }]} numberOfLines={2}>
            {detail}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function GoalTrackCard({
  track,
  onOpenGoal,
  onOpenTask,
  onOpenMonitor,
  onEditMonitor,
  onCreateReminder,
}: {
  track: GoalTrack;
  onOpenGoal: () => void;
  onOpenTask: (taskId: string) => void;
  onOpenMonitor: (monitorId: string) => void;
  onEditMonitor: (monitorId: string) => void;
  onCreateReminder: (milestoneId?: string) => void;
}) {
  const { t } = useTranslation();
  const { goal, nextAction, reminders, dailyActivities } = track;
  const done = goal.milestones.filter((milestone) => milestone.done).length;
  const moreReminders = Math.max(0, reminders.length - 2);
  const pausedWithGoal = goal.status === "paused";
  const nextLabel = nextAction ? t(ACTION_KEYS[nextAction.action]) : t("agent.planNextSteps");
  const firstReminder = reminders[0];
  const dailySummary = {
    tasks: dailyActivities.filter((activity) => activity.source === "task").length,
    reminders: dailyActivities.filter((activity) => activity.source === "monitor").length,
    milestones: dailyActivities.filter((activity) => activity.source === "milestone").length,
  };

  function runNext() {
    if (!nextAction || nextAction.action === "plan_next" || nextAction.action === "view_goal") {
      onOpenGoal();
      return;
    }
    if (nextAction.taskId) {
      onOpenTask(nextAction.taskId);
      return;
    }
    if (nextAction.monitorId) onOpenMonitor(nextAction.monitorId);
  }

  return (
    <Card style={{ gap: 12, flex: 1 }}>
      <View style={{ gap: 4 }}>
        <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
          <Text
            numberOfLines={2}
            style={{
              flexShrink: 1,
              color: colors.text,
              fontFamily: fonts.sans,
              fontSize: 16,
              lineHeight: 23,
              fontWeight: "600",
            }}
          >
            {goal.title}
          </Text>
          <Chip tint={goal.status === "active" ? colors.sky : colors.surface}>
            {statusLabel(goal.status)}
          </Chip>
        </View>
        <Text style={[s.small, s.metric]}>
          {goal.milestones.length
            ? t("agent.milestoneProgress", { done, total: goal.milestones.length })
            : t("agent.goalTrackNoMilestones")}
        </Text>
      </View>

      {/* 下一步整块可点，替掉原来块内那个全宽主按钮（与底部「查看目标」重复）。 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        onPress={runNext}
        style={({ pressed }) => ({
          gap: 5,
          padding: 12,
          borderRadius: 10,
          backgroundColor: pressed ? colors.overlay1 : colors.surfaceSoft,
        })}
      >
        <View style={[s.between, { gap: 8 }]}>
          <Text style={[s.small, { color: colors.faint }]}>{t("agent.goalTrackNextLabel")}</Text>
          <ChevronRight size={15} color={colors.faint} />
        </View>
        <Text numberOfLines={2} style={[s.text, { fontWeight: "600" }]}>
          {nextAction?.title ?? t("agent.goalTrackNoNext")}
        </Text>
        {nextAction && (
          <Text numberOfLines={1} style={[s.small, { color: colors.primaryStrong }]}>
            {t(REASON_KEYS[nextAction.reason])}
          </Text>
        )}
      </Pressable>

      <View style={{ gap: 5 }}>
        <Text style={[s.small, { color: colors.faint }]}>{t("agent.goalTrackRhythmLabel")}</Text>
        {!reminders.length && <Text style={s.small}>{t("agent.goalTrackNoReminder")}</Text>}
        {reminders.slice(0, 2).map((monitor) => (
          <Pressable
            key={monitor.id}
            accessibilityRole="button"
            accessibilityLabel={t("agent.openTrackingLabel", { title: monitor.title })}
            onPress={() => onOpenMonitor(monitor.id)}
            style={({ pressed }) => [
              s.row,
              { gap: 8, minHeight: 34, paddingVertical: 3, borderRadius: 8 },
              pressed && { backgroundColor: colors.overlay1 },
            ]}
          >
            <CalendarDays size={15} color={colors.muted} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[s.small, { color: colors.text }]}>
                {monitor.title}
              </Text>
              <Text numberOfLines={1} style={[s.small, s.metric]}>
                {monitorScheduleText(monitor, t)} · {relativeWhen(monitor.nextCheckAt)}
              </Text>
            </View>
            {pausedWithGoal && monitor.status === "active" ? (
              <Chip tint={colors.surface}>{t("agent.goalTrackPausedWithGoal")}</Chip>
            ) : monitor.status !== "active" ? (
              <Chip tint={colors.surface}>{statusLabel(monitor.status)}</Chip>
            ) : null}
          </Pressable>
        ))}
        {moreReminders > 0 && (
          <Text style={[s.small, { color: colors.faint }]}>
            {t("agent.goalTrackReminderMore", { count: moreReminders })}
          </Text>
        )}
      </View>

      {/* 最近 7 天只留今日计数一行，完整时间线在「查看目标」的目标详情里。 */}
      <View style={{ gap: 4 }}>
        <Text style={[s.small, { color: colors.faint }]}>{t("agent.goalTrackRecentLabel")}</Text>
        <Text numberOfLines={2} style={[s.small, { color: colors.primaryStrong }]}>
          {dailyActivities.length
            ? t("agent.goalTrackDailySummary", {
                tasks: String(dailySummary.tasks),
                reminders: String(dailySummary.reminders),
                milestones: String(dailySummary.milestones),
              })
            : t("agent.goalTrackNoRecent")}
        </Text>
      </View>

      <View style={[s.row, { gap: 8, flexWrap: "wrap", marginTop: "auto" }]}>
        <Button small onPress={onOpenGoal}>
          {t("agent.goalTrackViewGoal")}
        </Button>
        {firstReminder ? (
          <Button small onPress={() => onEditMonitor(firstReminder.id)}>
            {t("agent.goalTrackAdjustReminder")}
          </Button>
        ) : (
          <Button small onPress={() => onCreateReminder()}>
            {t("agent.goalTrackCreateReminder")}
          </Button>
        )}
      </View>
    </Card>
  );
}

/**
 * 追踪页：目标轨道 + 独立提醒。
 * 分组和排序全部来自 `tracking-view`，这里只负责交互与现有详情组件编排。
 */
export function TrackingScreen({
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
  const [showResting, setShowResting] = useState(false);
  const [showCompletedReminders, setShowCompletedReminders] = useState(false);

  const view = useMemo(() => (data ? buildTrackingView(data) : undefined), [data]);
  const orderedGoalTracks = useStableOrder(view?.goalTracks ?? [], goalTrackKey);
  const orderedReminders = useStableOrder(view?.reminders ?? [], reminderKey);
  const orderedStandalone = useStableOrder(view?.standaloneReminders ?? [], reminderKey);
  const goal = data?.goals.find((item) => item.id === selectedGoal);
  const monitor = data?.monitors.find((item) => item.id === selectedMonitor);
  const monitorToEdit = data?.monitors.find((item) => item.id === editingMonitor);

  useEffect(() => {
    if (!reminderIntent) return;
    setComposer({ kind: "reminderForm", priceReminder: reminderIntent });
    onReminderIntentHandled?.();
  }, [onReminderIntentHandled, reminderIntent]);

  if (!data || !view) {
    return (
      <View style={{ gap: 16 }}>
        <AgentStatus />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const activeTracks = orderedGoalTracks.filter((track) => track.goal.status === "active");
  const completedReminderTracks = orderedGoalTracks.filter(
    (track) => track.goal.status === "completed" && track.reminders.length > 0,
  );
  const restingTracks = orderedGoalTracks.filter(
    (track) =>
      track.goal.status === "paused" ||
      (track.goal.status === "completed" && !track.reminders.length),
  );
  const tracksWithReminders = orderedGoalTracks.filter(
    (track) => track.goal.status !== "completed" && track.reminders.length,
  );
  const filters = [
    { id: "all", label: t("agent.trackingFilterAll"), count: view.counts.tracking },
    {
      id: "goal",
      label: t("agent.goalsTab"),
      count: orderedGoalTracks.filter((track) => track.goal.status !== "completed").length,
    },
    { id: "reminder", label: t("agent.remindersTab"), count: orderedReminders.length },
  ] as const;
  const hasAny =
    filter === "goal"
      ? orderedGoalTracks.length > 0
      : filter === "reminder"
        ? orderedReminders.length > 0
        : activeTracks.length +
            restingTracks.length +
            completedReminderTracks.length +
            orderedStandalone.length >
          0;
  const backTo: ComposerStep | undefined = !composer
    ? undefined
    : composer.kind === "goalCategories" || composer.kind === "reminderOptions"
      ? { kind: "picker" }
      : composer.kind === "goalForm"
        ? { kind: "goalCategories" }
        : composer.kind === "reminderForm" && !composer.priceReminder
          ? {
              kind: "reminderOptions",
              goalId: composer.goalId,
              milestoneId: composer.milestoneId,
            }
          : undefined;
  const composerTitle =
    !composer || composer.kind === "picker"
      ? t("agent.newTrackingTitle")
      : composer.kind === "reminderOptions"
        ? t("agent.reminderTemplates")
        : composer.kind === "reminderForm"
          ? t("agent.addReminder")
          : t("agent.createGoal");
  const composerSubtitle =
    composer?.kind === "goalCategories"
      ? t("agent.newGoalSubtitle")
      : composer?.kind === "reminderOptions"
        ? t("agent.newReminderSubtitle")
        : undefined;

  function openReminderForGoal(goalId: string, milestoneId?: string) {
    setSelectedGoal(undefined);
    setComposer({ kind: "reminderForm", goalId, milestoneId });
  }

  function renderGoalTrack(track: GoalTrack) {
    return (
      <GoalTrackCard
        track={track}
        onOpenGoal={() => setSelectedGoal(track.goal.id)}
        onOpenTask={(taskId) => open({ type: "task", taskId })}
        onOpenMonitor={setSelectedMonitor}
        onEditMonitor={setEditingMonitor}
        onCreateReminder={(milestoneId) => openReminderForGoal(track.goal.id, milestoneId)}
      />
    );
  }

  function renderReminderRows(tracks: readonly GoalTrack[]) {
    return (
      <View style={{ gap: 14 }}>
        {tracks.map((track) => (
          <View key={track.goal.id} style={{ gap: 8 }}>
            <SectionHeading title={track.goal.title} count={track.reminders.length} />
            <Text style={[s.small, { color: colors.link }]}>
              {t("agent.taskGoalContext", { goal: track.goal.title })}
            </Text>
            <CardGrid
              items={track.reminders}
              minColumnWidth={340}
              getKey={(item) => item.id}
              render={(item) => (
                <TrackingRow
                  monitor={item}
                  onOpen={() => setSelectedMonitor(item.id)}
                  onEdit={() => setEditingMonitor(item.id)}
                />
              )}
            />
          </View>
        ))}
        {!!orderedStandalone.length && (
          <View style={{ gap: 8 }}>
            <SectionHeading title={t("agent.standaloneRemindersHeading")} />
            <CardGrid
              items={orderedStandalone}
              minColumnWidth={340}
              getKey={(item) => item.id}
              render={(item) => (
                <TrackingRow
                  monitor={item}
                  onOpen={() => setSelectedMonitor(item.id)}
                  onEdit={() => setEditingMonitor(item.id)}
                />
              )}
            />
          </View>
        )}
      </View>
    );
  }

  const completedReminderCount = completedReminderTracks.reduce(
    (count, track) => count + track.reminders.length,
    0,
  );
  const completedReminders = completedReminderTracks.length ? (
    <View style={{ gap: 10 }}>
      <SectionHeading
        title={t("agent.completedGoalRemindersHeading")}
        count={completedReminderCount}
      />
      <Text style={s.small}>{t("agent.completedGoalRemindersHint")}</Text>
      <View style={{ alignItems: "flex-start" }}>
        <Button small onPress={() => setShowCompletedReminders(!showCompletedReminders)}>
          {showCompletedReminders
            ? t("agent.showLess")
            : t("agent.showMore", { count: completedReminderTracks.length })}
        </Button>
      </View>
      {showCompletedReminders &&
        completedReminderTracks.map((track) => (
          <View key={track.goal.id} style={{ gap: 8 }}>
            <Text numberOfLines={2} style={[s.heading, { fontSize: 15 }]}>
              {track.goal.title}
            </Text>
            <CardGrid
              items={track.reminders}
              minColumnWidth={340}
              getKey={(item) => item.id}
              render={(item) => (
                <TrackingRow
                  monitor={item}
                  onOpen={() => setSelectedMonitor(item.id)}
                  onEdit={() => setEditingMonitor(item.id)}
                />
              )}
            />
          </View>
        ))}
    </View>
  ) : null;

  return (
    <View style={{ gap: 20 }}>
      {!embedded && (
        <PageHeader
          title={t("agent.monitorsHeroTitle")}
          description={t("agent.monitorsHeroDescription")}
          compact={width < breakpoints.desktop}
          actions={
            <Button small primary icon={Plus} onPress={() => setComposer({ kind: "picker" })}>
              {t("agent.newTracking")}
            </Button>
          }
          style={{ marginBottom: 0 }}
        />
      )}
      <AgentStatus />

      <View style={[s.between, { gap: 10, flexWrap: "wrap" }]}>
        <View accessibilityRole="tablist" style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
          {filters.map((item) => (
            <FilterPill
              key={item.id}
              active={filter === item.id}
              label={item.label}
              count={item.count}
              onPress={() => setFilter(item.id)}
            />
          ))}
        </View>
        {embedded && (
          <Button small primary icon={Plus} onPress={() => setComposer({ kind: "picker" })}>
            {t("agent.newTracking")}
          </Button>
        )}
      </View>

      {!hasAny ? (
        <Empty
          icon={Target}
          title={t("agent.trackingEmptyTitle")}
          detail={t("agent.trackingEmptyDetail")}
        >
          <Button small primary icon={Plus} onPress={() => setComposer({ kind: "picker" })}>
            {t("agent.newTracking")}
          </Button>
        </Empty>
      ) : filter === "reminder" ? (
        renderReminderRows(tracksWithReminders)
      ) : filter === "goal" ? (
        <View style={{ gap: 12 }}>
          {!!activeTracks.length && (
            <View style={{ gap: 10 }}>
              <SectionHeading title={t("agent.goalTracksHeading")} count={activeTracks.length} />
              <CardGrid
                items={activeTracks}
                minColumnWidth={340}
                getKey={(track) => track.goal.id}
                render={renderGoalTrack}
              />
            </View>
          )}
          {!!restingTracks.length && (
            <View style={{ gap: 10 }}>
              <Button small onPress={() => setShowResting(!showResting)}>
                {showResting
                  ? t("agent.showLess")
                  : t("agent.goalTracksShowResting", { count: restingTracks.length })}
              </Button>
              {showResting && (
                <CardGrid
                  items={restingTracks}
                  minColumnWidth={340}
                  getKey={(track) => track.goal.id}
                  render={renderGoalTrack}
                />
              )}
            </View>
          )}
        </View>
      ) : (
        <View style={{ gap: 18 }}>
          {!!activeTracks.length && (
            <View style={{ gap: 10 }}>
              <SectionHeading title={t("agent.goalTracksHeading")} count={activeTracks.length} />
              <CardGrid
                items={activeTracks}
                minColumnWidth={340}
                getKey={(track) => track.goal.id}
                render={renderGoalTrack}
              />
            </View>
          )}
          {!!restingTracks.length && (
            <View style={{ gap: 10 }}>
              <SectionHeading title={t("agent.goalTracksResting")} count={restingTracks.length} />
              <View style={{ alignItems: "flex-start" }}>
                <Button small onPress={() => setShowResting(!showResting)}>
                  {showResting
                    ? t("agent.showLess")
                    : t("agent.showMore", { count: restingTracks.length })}
                </Button>
              </View>
              {showResting && (
                <CardGrid
                  items={restingTracks}
                  minColumnWidth={340}
                  getKey={(track) => track.goal.id}
                  render={renderGoalTrack}
                />
              )}
            </View>
          )}
          {!!orderedStandalone.length && (
            <View style={{ gap: 10 }}>
              <SectionHeading
                title={t("agent.standaloneRemindersHeading")}
                count={orderedStandalone.length}
              />
              <CardGrid
                items={orderedStandalone}
                minColumnWidth={340}
                getKey={(item) => item.id}
                render={(item) => (
                  <TrackingRow
                    monitor={item}
                    onOpen={() => setSelectedMonitor(item.id)}
                    onEdit={() => setEditingMonitor(item.id)}
                  />
                )}
              />
            </View>
          )}
        </View>
      )}
      {completedReminders}

      {goal && (
        <Sheet title={goal.title} onClose={() => setSelectedGoal(undefined)}>
          <GoalCard
            goal={goal}
            onOpenTask={() => setSelectedGoal(undefined)}
            onCreateReminder={(milestoneId) => openReminderForGoal(goal.id, milestoneId)}
          />
        </Sheet>
      )}
      {monitor && (
        <Sheet title={monitor.title} onClose={() => setSelectedMonitor(undefined)}>
          <MonitorCard monitor={monitor} onOpenTask={() => setSelectedMonitor(undefined)} />
        </Sheet>
      )}
      {monitorToEdit && (
        <Sheet title={t("agent.editReminder")} onClose={() => setEditingMonitor(undefined)}>
          <MonitorForm monitor={monitorToEdit} onDone={() => setEditingMonitor(undefined)} />
        </Sheet>
      )}

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
              <OptionCard
                icon={Target}
                title={t("agent.newGoalOption")}
                detail={t("agent.newGoalOptionDetail")}
                onPress={() => setComposer({ kind: "goalCategories" })}
              />
              <OptionCard
                icon={Bell}
                title={t("agent.newReminderOption")}
                detail={t("agent.newReminderOptionDetail")}
                onPress={() => setComposer({ kind: "reminderOptions" })}
              />
            </View>
          )}
          {composer.kind === "goalCategories" && (
            <View style={{ gap: 16 }}>
              <View style={{ gap: 10 }}>
                <SectionHeading title={t("agent.taskTemplates")} />
                <CardGrid
                  items={TASK_TEMPLATES}
                  minColumnWidth={240}
                  getKey={(template) => template.kind}
                  render={(template) => (
                    <TemplateCard
                      icon={template.icon}
                      title={t(template.titleKey)}
                      detail={t(template.detailKey)}
                      onPress={() => {
                        setComposer(undefined);
                        open({ type: "delegate", kind: template.kind });
                      }}
                    />
                  )}
                />
              </View>
              <View style={{ gap: 10 }}>
                <SectionHeading title={t("agent.goalCategoriesHeading")} />
                <CardGrid
                  items={GOAL_CATEGORIES}
                  minColumnWidth={200}
                  getKey={(item) => item.name}
                  render={(item) => (
                    <TemplateCard
                      icon={item.icon}
                      title={t(item.labelKey)}
                      accessibilityLabel={t("agent.createGoalA11y", {
                        category: t(item.labelKey),
                      })}
                      onPress={() => setComposer({ kind: "goalForm", category: item.name })}
                    />
                  )}
                />
              </View>
            </View>
          )}
          {composer.kind === "goalForm" && (
            <GoalForm
              category={composer.category}
              onDone={() => {
                setFilter("goal");
                setComposer(undefined);
              }}
            />
          )}
          {composer.kind === "reminderOptions" && (
            <View style={{ gap: 12 }}>
              {/* 标题栏已经写了「提醒模板」，副标题也说明了用法，这里不再重复小标题。 */}
              <CardGrid
                items={REMINDER_TEMPLATES}
                minColumnWidth={200}
                maxColumns={3}
                getKey={(template) => template.id}
                render={(template) => (
                  <TemplateCard
                    icon={template.icon}
                    title={t(template.titleKey)}
                    detail={t(template.detailKey)}
                    onPress={() =>
                      setComposer({
                        kind: "reminderForm",
                        template,
                        goalId: composer.goalId,
                        milestoneId: composer.milestoneId,
                      })
                    }
                  />
                )}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("agent.customReminder")}
                onPress={() =>
                  setComposer({
                    kind: "reminderForm",
                    goalId: composer.goalId,
                    milestoneId: composer.milestoneId,
                  })
                }
                style={({ pressed }) => ({
                  minHeight: 43,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: colors.lineStrong,
                  borderRadius: radius.card,
                  backgroundColor: pressed ? colors.overlay1 : "transparent",
                })}
              >
                <Plus size={16} color={colors.faint} />
                <Text style={{ fontSize: 13, color: colors.faint }}>
                  {t("agent.customReminder")}
                </Text>
              </Pressable>
            </View>
          )}
          {composer.kind === "reminderForm" && (
            <MonitorForm
              template={composer.template}
              priceReminder={composer.priceReminder}
              goalId={composer.goalId}
              milestoneId={composer.milestoneId}
              onDone={() => {
                setFilter("reminder");
                setComposer(undefined);
              }}
            />
          )}
        </Sheet>
      )}
    </View>
  );
}
