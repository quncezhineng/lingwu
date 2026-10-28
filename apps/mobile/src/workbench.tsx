import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Polyline } from "react-native-svg";
import type { AgentTask } from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import { MarketBriefingCard } from "./briefing-card";
import { activeLocaleTag, localizeAgentName, useTranslation } from "./i18n";
import { statusLabel } from "./i18n/translate";
import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  CircleX,
  Clock3,
  Heart,
  ListChecks,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
} from "./icons";
import { activeWatchlist, loadWatchlists, useWatchlistState } from "./market";
import { availabilityFromQuote, useQuotes } from "./quotes";
import { Button, colors, fonts, marketDirectionColor, Sheet, s } from "./ui";
import { useWorkspace } from "./workspace";

function greetingKey(hour: number) {
  if (hour < 11) return "workbench.greetingMorning" as const;
  if (hour < 18) return "workbench.greetingAfternoon" as const;
  return "workbench.greetingEvening" as const;
}

function shortName(value: string | undefined) {
  if (!value?.trim()) return "";
  const trimmed = value.trim();
  return trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
}

function taskStatusColor(task: AgentTask) {
  if (task.status === "waiting_approval" || task.status === "waiting_input")
    return colors.alertVolumeText;
  if (task.status === "running" || task.status === "queued") return colors.primary;
  if (task.status === "succeeded") return colors.success;
  if (task.status === "failed") return colors.danger;
  return colors.muted;
}

function taskTime(task: AgentTask) {
  return new Date(task.updatedAt).toLocaleTimeString(activeLocaleTag(), {
    hour: "numeric",
    minute: "2-digit",
  });
}

function MiniTrend({ change }: { change: number }) {
  const positive = change >= 0;
  const points = positive
    ? "1,17 7,14 12,15 18,10 23,12 29,8 34,10 40,4"
    : "1,5 7,8 12,6 18,12 23,10 29,15 34,13 40,19";
  return (
    <Svg
      accessibilityElementsHidden
      width={41}
      height={22}
      viewBox="0 0 41 22"
      style={{ flexShrink: 0 }}
    >
      <Polyline
        points={points}
        fill="none"
        stroke={positive ? colors.marketUp : colors.marketDown}
        strokeWidth={1.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function WatchlistRail() {
  const { t, locale } = useTranslation();
  const { api, navigate, open } = useWorkspace();
  const watchState = useWatchlistState();
  const list = activeWatchlist();
  const symbols = useMemo(
    () => (list?.symbols ?? []).slice(0, 4).map((item) => item.symbol.code),
    [list],
  );
  const { quotes } = useQuotes(api, symbols, { refreshMs: 60_000 });

  useEffect(() => {
    void loadWatchlists(api, locale);
  }, [api, locale]);

  return (
    <View style={{ gap: 10 }}>
      <View style={s.between}>
        <View style={[s.row, { gap: 7 }]}>
          <Text style={[s.heading, { fontSize: 15 }]}>{t("workbench.myWatchlist")}</Text>
          {!!list?.symbols.length && (
            <Text style={{ fontSize: 11, color: colors.faint }}>{list.symbols.length}</Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigate("watchlist")}
          style={[s.row, { gap: 3 }]}
        >
          <Text style={{ fontSize: 11, color: colors.muted }}>{t("workbench.viewAll")}</Text>
          <ChevronRight size={12} strokeWidth={1.7} color={colors.faint} />
        </Pressable>
      </View>

      {watchState.status === "loading" && !list ? (
        <View style={[s.card, { paddingVertical: 24, alignItems: "center" }]}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : list?.symbols.length ? (
        <View>
          {list.symbols.slice(0, 4).map((item, index) => {
            const availability = quotes[item.symbol.code] ?? availabilityFromQuote(item.quote);
            const quote = availability.status === "ready" ? availability.quote : undefined;
            const change = quote?.changePercent ?? item.quote?.changePercent ?? 0;
            const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
            return (
              <Pressable
                key={item.symbol.code}
                accessibilityRole="button"
                accessibilityLabel={`${item.symbol.name} ${item.symbol.code}`}
                onPress={() =>
                  open({
                    type: "symbol",
                    symbol: item.symbol,
                    quote: item.quote,
                    watchlist: list ? { id: list.id, name: list.name } : undefined,
                  })
                }
                style={({ pressed }) => ({
                  minHeight: 55,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 9,
                  paddingHorizontal: 9,
                  marginHorizontal: -9,
                  borderRadius: 7,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: colors.line,
                  backgroundColor: pressed ? colors.overlay1 : "transparent",
                })}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 12.5, fontWeight: "500", color: colors.text }}
                  >
                    {item.symbol.name}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 10.5, color: colors.faint }}>
                    {item.symbol.code} · {item.symbol.market}
                  </Text>
                </View>
                <MiniTrend change={change} />
                <Text
                  style={[
                    s.metric,
                    {
                      width: 51,
                      textAlign: "right",
                      fontSize: 11.5,
                      color: marketDirectionColor(direction),
                    },
                  ]}
                >
                  {change > 0 ? "+" : ""}
                  {change.toFixed(2)}%
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={() => navigate("watchlist")}
            style={({ pressed }) => ({
              minHeight: 36,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 6,
              marginTop: 9,
              borderWidth: 1,
              borderColor: colors.lineStrong,
              borderStyle: "dashed",
              borderRadius: 7,
              backgroundColor: pressed ? colors.overlay1 : "transparent",
            })}
          >
            <Plus size={13} strokeWidth={1.8} color={colors.muted} />
            <Text style={{ fontSize: 11, color: colors.muted }}>{t("workbench.addWatch")}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[s.card, { gap: 10, padding: 14 }]}>
          <Text style={[s.small, { lineHeight: 18 }]}>{t("workbench.watchlistEmpty")}</Text>
          <Button small icon={Plus} onPress={() => navigate("watchlist")}>
            {t("workbench.addWatch")}
          </Button>
        </View>
      )}
    </View>
  );
}

function ApprovalCard() {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { open, navigate } = useWorkspace();
  const task = data?.tasks.find(
    (item) => item.status === "waiting_approval" || item.status === "waiting_input",
  );
  if (!task) {
    return (
      <View style={[s.card, { gap: 11, padding: 14, backgroundColor: colors.surface }]}>
        <View style={[s.row, { gap: 7 }]}>
          <Bell size={14} strokeWidth={1.7} color={colors.muted} />
          <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.text }}>
            {t("workbench.noPendingTitle")}
          </Text>
        </View>
        <Text style={[s.small, { lineHeight: 18 }]}>{t("workbench.noPendingDetail")}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigate("goals")}
          style={[s.between, { paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.line }]}
        >
          <Text style={{ fontSize: 11.5, color: colors.text }}>{t("workbench.setupAlert")}</Text>
          <ChevronRight size={13} strokeWidth={1.7} color={colors.faint} />
        </Pressable>
      </View>
    );
  }
  return (
    <View style={[s.card, { gap: 9, padding: 14 }]}>
      <View style={[s.row, { gap: 7 }]}>
        <ShieldCheck size={14} strokeWidth={1.7} color={colors.primary} />
        <Text style={{ fontSize: 11, color: colors.muted }}>{t("workbench.waitingEyebrow")}</Text>
      </View>
      <Text
        numberOfLines={2}
        style={{ fontSize: 13.5, lineHeight: 20, fontWeight: "600", color: colors.text }}
      >
        {task.title}
      </Text>
      <Text numberOfLines={2} style={[s.small, { lineHeight: 18 }]}>
        {task.question ||
          task.plan.find((step) => step.status === "waiting")?.detail ||
          t("workbench.waitingDetail")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => open({ type: "task", taskId: task.id })}
        style={[s.between, { paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }]}
      >
        <Text style={{ fontSize: 11.5, color: colors.text }}>{t("workbench.viewAndConfirm")}</Text>
        <ChevronRight size={13} strokeWidth={1.7} color={colors.faint} />
      </Pressable>
    </View>
  );
}

function PreferenceRail() {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { navigate } = useWorkspace();
  const memories = data?.memories.slice(0, 2) ?? [];
  return (
    <View style={{ gap: 9 }}>
      <View style={[s.row, { gap: 7 }]}>
        <Heart size={14} strokeWidth={1.7} color={colors.muted} />
        <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.text }}>
          {t("workbench.remembers")}
        </Text>
      </View>
      {memories.length ? (
        memories.map((memory) => (
          <Text
            key={memory.id}
            numberOfLines={2}
            style={{ fontSize: 12.5, lineHeight: 20, color: colors.muted }}
          >
            “{memory.text}”
          </Text>
        ))
      ) : (
        <Text style={[s.small, { lineHeight: 18 }]}>{t("workbench.preferencesEmpty")}</Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() => navigate("preferences")}
        style={[s.row, { gap: 3 }]}
      >
        <Text style={{ fontSize: 11, color: colors.muted }}>{t("workbench.viewPreferences")}</Text>
        <ChevronRight size={12} strokeWidth={1.7} color={colors.faint} />
      </Pressable>
      <View style={[s.row, { gap: 6, marginTop: 4 }]}>
        <ShieldCheck size={13} strokeWidth={1.6} color={colors.faint} />
        <Text style={{ fontSize: 10.5, color: colors.faint }}>{t("workbench.privacy")}</Text>
      </View>
    </View>
  );
}

function TaskRow({ task }: { task: AgentTask }) {
  const { t } = useTranslation();
  const { open } = useWorkspace();
  const done = task.plan.filter((step) => step.status === "succeeded").length;
  const progress = task.plan.length ? done / task.plan.length : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("workbench.openTask", { title: task.title })}
      onPress={() => open({ type: "task", taskId: task.id })}
      style={({ pressed }) => ({
        minHeight: 72,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: pressed ? colors.overlay1 : "transparent",
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
        }}
      >
        {task.status === "running" || task.status === "queued" ? (
          <Sparkles size={16} strokeWidth={1.7} color={colors.primary} />
        ) : task.status === "waiting_approval" || task.status === "waiting_input" ? (
          <Clock3 size={16} strokeWidth={1.7} color={colors.alertVolumeText} />
        ) : task.status === "failed" || task.status === "cancelled" ? (
          <CircleX size={16} strokeWidth={1.8} color={colors.danger} />
        ) : (
          <Check size={16} strokeWidth={1.9} color={colors.success} />
        )}
      </View>
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: "600", color: colors.text }}>
          {task.title}
        </Text>
        <View style={s.between}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: colors.muted }}>
            {task.plan.find((step) => step.status === "running")?.title ||
              task.error ||
              statusLabel(task.status)}
          </Text>
          <Text style={{ fontSize: 10.5, color: colors.faint }}>{taskTime(task)}</Text>
        </View>
        {!!task.plan.length && (
          <View style={{ height: 2, borderRadius: 2, backgroundColor: colors.line }}>
            <View
              style={{
                width: `${Math.max(3, Math.round(progress * 100))}%`,
                height: 2,
                borderRadius: 2,
                backgroundColor: taskStatusColor(task),
              }}
            />
          </View>
        )}
      </View>
      <View
        style={{
          paddingHorizontal: 7,
          paddingVertical: 3,
          borderRadius: 5,
          backgroundColor:
            task.status === "waiting_approval" || task.status === "waiting_input"
              ? colors.orange
              : task.status === "failed"
                ? colors.errorSoft
                : colors.surface,
        }}
      >
        <Text style={{ fontSize: 10.5, color: taskStatusColor(task) }}>
          {statusLabel(task.status)}
        </Text>
      </View>
    </Pressable>
  );
}

export function WorkbenchScreen() {
  const { workspace, ask, navigate, open } = useWorkspace();
  const { data } = useAgentWorkspace();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [draft, setDraft] = useState("");
  const [briefingOpen, setBriefingOpen] = useState(false);
  const composerRef = useRef<TextInput>(null);
  const sideBySide = width >= 1180;
  const now = new Date();
  const name =
    shortName(workspace.profile.name) || shortName(workspace.profile.email) || t("workbench.there");
  const agentName = localizeAgentName(data?.identity.name);
  const tasks = [...(data?.tasks ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const activeTasks = tasks.filter(
    (task) => !["succeeded", "failed", "cancelled"].includes(task.status),
  );
  const visibleTasks = activeTasks.length ? activeTasks : tasks;
  const insight = [...(data?.artifacts ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];
  const dateLine = now.toLocaleDateString(activeLocaleTag(), {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const submit = () => {
    const prompt = draft.trim();
    if (!prompt) return;
    setDraft("");
    ask(prompt);
  };

  const quickPrompts = [
    { icon: Target, label: t("workbench.analyzeStock"), prompt: t("workbench.analyzeStockPrompt") },
    {
      icon: ListChecks,
      label: t("workbench.compareFunds"),
      prompt: t("workbench.compareFundsPrompt"),
    },
    {
      icon: Sparkles,
      label: t("workbench.analyzeWatchlist"),
      prompt: t("workbench.analyzeWatchlistPrompt"),
    },
  ] as const;

  return (
    <>
      <View
        style={{
          flexDirection: sideBySide ? "row" : "column",
          gap: sideBySide ? 40 : 26,
          alignItems: "flex-start",
        }}
      >
        <View style={{ flex: 1, minWidth: 0, width: sideBySide ? undefined : "100%", gap: 26 }}>
          <View style={{ gap: 18 }}>
            <View style={[s.between, { alignItems: "flex-start", gap: 16 }]}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontSize: 11, color: colors.faint, letterSpacing: 0.2 }}>
                  {dateLine} · {t("workbench.marketContext")}
                </Text>
                <Text
                  style={{
                    fontSize: sideBySide ? 36 : 30,
                    lineHeight: sideBySide ? 47 : 40,
                    color: colors.text,
                    fontWeight: "500",
                    letterSpacing: -1.1,
                    fontFamily: fonts.serif,
                  }}
                >
                  {t(greetingKey(now.getHours()), { name })}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("workbench.briefing")}
                onPress={() => setBriefingOpen(true)}
                style={({ pressed }) => ({
                  width: 180,
                  minHeight: 62,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 11,
                  paddingHorizontal: 13,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 10,
                  backgroundColor: pressed ? colors.surface : colors.paper,
                })}
              >
                <View
                  style={{
                    width: 31,
                    height: 31,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.sky,
                  }}
                >
                  <Sparkles size={15} strokeWidth={1.7} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }}>
                    {t("workbench.briefing")}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 10.5, color: colors.muted }}>
                    {t("workbench.briefingDetail")}
                  </Text>
                </View>
                <ChevronRight size={14} strokeWidth={1.7} color={colors.faint} />
              </Pressable>
            </View>

            <View
              style={{
                minHeight: 162,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 12,
                backgroundColor: colors.paper,
                padding: 18,
                justifyContent: "space-between",
              }}
            >
              <TextInput
                ref={composerRef}
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={submit}
                multiline
                placeholder={t("workbench.askPlaceholder")}
                placeholderTextColor={colors.faint}
                accessibilityLabel={t("workbench.askPlaceholder")}
                style={{
                  minHeight: 68,
                  maxHeight: 150,
                  padding: 0,
                  color: colors.text,
                  fontSize: 15,
                  lineHeight: 24,
                  textAlignVertical: "top",
                  fontFamily: fonts.sans,
                }}
              />
              <View style={[s.between, { marginTop: 12 }]}>
                <View style={[s.row, { gap: 8 }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("workbench.attachMaterial")}
                    onPress={() => navigate("chat")}
                    style={({ pressed }) => ({
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: pressed ? colors.overlay1 : "transparent",
                    })}
                  >
                    <Upload size={16} strokeWidth={1.7} color={colors.muted} />
                  </Pressable>
                  <View
                    style={[
                      s.row,
                      {
                        gap: 5,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor: colors.sky,
                      },
                    ]}
                  >
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: colors.primary,
                      }}
                    />
                    <Text style={{ fontSize: 10.5, color: colors.primaryAction }}>
                      {t("workbench.depthAnalysis")}
                    </Text>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("workbench.sendAnalysis")}
                  disabled={!draft.trim()}
                  onPress={submit}
                  style={({ pressed }) => ({
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: draft.trim() ? colors.primary : colors.tertiary,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <ArrowUpRight
                    size={17}
                    strokeWidth={1.9}
                    color={draft.trim() ? colors.onPrimary : colors.faint}
                  />
                </Pressable>
              </View>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {quickPrompts.map((item) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="button"
                  onPress={() => ask(item.prompt)}
                  style={({ pressed }) => ({
                    minHeight: 32,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 7,
                    paddingHorizontal: 10,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: 7,
                    backgroundColor: pressed ? colors.surface : colors.paper,
                  })}
                >
                  <item.icon size={13} strokeWidth={1.7} color={colors.muted} />
                  <Text style={{ fontSize: 11, color: colors.muted }}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <View style={s.between}>
              <View style={[s.row, { gap: 8 }]}>
                <Text style={[s.heading, { fontSize: 15 }]}>{t("workbench.todayInsight")}</Text>
                <Text style={{ fontSize: 10.5, color: colors.faint }}>
                  {insight ? "1 / 1" : "—"}
                </Text>
              </View>
              {!!insight && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => open({ type: "artifact", artifact: insight })}
                  style={[s.row, { gap: 3 }]}
                >
                  <Text style={{ fontSize: 11, color: colors.muted }}>{t("workbench.expand")}</Text>
                  <ChevronRight size={12} strokeWidth={1.7} color={colors.faint} />
                </Pressable>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={insight ? t("workbench.expand") : t("workbench.askPlaceholder")}
              onPress={() =>
                insight
                  ? open({ type: "artifact", artifact: insight })
                  : composerRef.current?.focus()
              }
              style={({ pressed }) => ({
                minHeight: 106,
                padding: 15,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 10,
                backgroundColor: pressed ? colors.surface : colors.paper,
                justifyContent: "space-between",
                gap: 12,
              })}
            >
              <View style={[s.row, { gap: 7 }]}>
                <Sparkles size={14} strokeWidth={1.7} color={colors.primary} />
                <Text style={{ fontSize: 10.5, color: colors.muted }}>
                  {t("workbench.insightCard")} ·{" "}
                  {insight ? statusLabel(insight.kind) : t("workbench.researchNote")}
                </Text>
              </View>
              <Text
                numberOfLines={2}
                style={{
                  fontSize: 17,
                  lineHeight: 24,
                  fontWeight: "600",
                  color: colors.text,
                  fontFamily: fonts.serif,
                }}
              >
                {insight?.summary || insight?.title || t("workbench.insightEmptyTitle")}
              </Text>
              <View style={s.between}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 10.5, color: colors.faint }}>
                  {insight
                    ? `${localizeAgentName(data?.identity.name)} · ${insight.title}`
                    : t("workbench.insightEmptyDetail")}
                </Text>
                {!!insight && <ArrowUpRight size={14} strokeWidth={1.7} color={colors.faint} />}
              </View>
            </Pressable>
          </View>

          <View>
            <View style={[s.between, { marginBottom: 2 }]}>
              <View style={[s.row, { gap: 7 }]}>
                <Text style={[s.heading, { fontSize: 15 }]}>
                  {activeTasks.length
                    ? t("workbench.whatAgentDoing", { name: agentName })
                    : t("workbench.recentAnalyses")}
                </Text>
                <Text style={{ fontSize: 11, color: colors.faint }}>{visibleTasks.length}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => navigate("activity")}
                style={[s.row, { gap: 3 }]}
              >
                <Text style={{ fontSize: 11, color: colors.muted }}>{t("workbench.allTasks")}</Text>
                <ChevronRight size={12} strokeWidth={1.7} color={colors.faint} />
              </Pressable>
            </View>
            {visibleTasks.length ? (
              visibleTasks.slice(0, 3).map((task) => <TaskRow key={task.id} task={task} />)
            ) : (
              <View
                style={[
                  s.card,
                  {
                    marginTop: 10,
                    paddingVertical: 22,
                    alignItems: "center",
                    gap: 8,
                  },
                ]}
              >
                <ListChecks size={24} strokeWidth={1.6} color={colors.faint} />
                <Text style={s.heading}>{t("workbench.noTasksTitle")}</Text>
                <Text style={[s.small, { textAlign: "center" }]}>
                  {t("workbench.noTasksDetail")}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View
          style={{
            width: sideBySide ? 270 : "100%",
            gap: 24,
            paddingLeft: sideBySide ? 28 : 0,
            borderLeftWidth: sideBySide ? 1 : 0,
            borderLeftColor: colors.line,
          }}
        >
          <WatchlistRail />
          <ApprovalCard />
          <PreferenceRail />
        </View>
      </View>

      {briefingOpen && (
        <Sheet title={t("workbench.briefing")} onClose={() => setBriefingOpen(false)}>
          <MarketBriefingCard />
        </Sheet>
      )}
    </>
  );
}
