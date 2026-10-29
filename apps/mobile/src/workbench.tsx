import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  Text,
  type TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Polyline } from "react-native-svg";
import type { AgentTask } from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import { MarketBriefingCard } from "./briefing-card";
import { ComposerAttachments, FilePickerSheet } from "./file-picker";
import { pickAndUploadFile } from "./file-upload";
import { greetingKeyForHour, userLocalHour } from "./greeting";
import { activeLocaleTag, localizeAgentName, useTranslation } from "./i18n";
import { statusLabel } from "./i18n/translate";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Clock3,
  FolderOpen,
  Heart,
  ListChecks,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
} from "./icons";
import { InsightCard } from "./insight-card";
import { latestWorkbenchInsights, moveInsightIndex, workbenchInsightView } from "./insight-view";
import { activeWatchlist, loadWatchlists, useWatchlistState } from "./market";
import { PromptComposer } from "./prompt-composer";
import { availabilityFromQuote, useQuotes } from "./quotes";
import { toggleSavedInsight, useSavedInsightIds } from "./saved-insights";
import { StatusBadge, statusToneColors, taskStatusTone } from "./status-badge";
import { breakpoints } from "./theme";
import {
  Button,
  colors,
  IconButton,
  marketDirectionColor,
  radius,
  SectionHeading,
  Sheet,
  s,
  typography,
} from "./ui";

import { useWorkspace } from "./workspace";

function shortName(value: string | undefined) {
  if (!value?.trim()) return "";
  const trimmed = value.trim();
  return trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
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
      <SectionHeading
        title={t("workbench.myWatchlist")}
        count={list?.symbols.length}
        action={t("workbench.viewAll")}
        onPress={() => navigate("watchlist")}
        style={{ marginBottom: 0 }}
      />

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
                    style={{ fontSize: 12, fontWeight: "500", color: colors.text }}
                  >
                    {item.symbol.name}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 10, color: colors.faint }}>
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
                      fontSize: 11,
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
            <Plus size={13} color={colors.muted} />
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
          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text }}>
            {t("workbench.noPendingTitle")}
          </Text>
        </View>
        <Text style={[s.small, { lineHeight: 18 }]}>{t("workbench.noPendingDetail")}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigate("goals")}
          style={[s.between, { paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.line }]}
        >
          <Text style={{ fontSize: 11, color: colors.text }}>{t("workbench.setupAlert")}</Text>
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
        style={{ fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.text }}
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
        <Text style={{ fontSize: 11, color: colors.text }}>{t("workbench.viewAndConfirm")}</Text>
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
        <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text }}>
          {t("workbench.remembers")}
        </Text>
      </View>
      {memories.length ? (
        memories.map((memory) => (
          <Text
            key={memory.id}
            numberOfLines={2}
            style={{ fontSize: 12, lineHeight: 20, color: colors.muted }}
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
        <ShieldCheck size={13} color={colors.faint} />
        <Text style={{ fontSize: 10, color: colors.faint }}>{t("workbench.privacy")}</Text>
      </View>
    </View>
  );
}

function TaskRow({ task }: { task: AgentTask }) {
  const { t } = useTranslation();
  const { open } = useWorkspace();
  const done = task.plan.filter((step) => step.status === "succeeded").length;
  const progress = task.plan.length ? done / task.plan.length : 0;
  const tone = taskStatusTone(task.status);
  const toneColor = statusToneColors[tone].foreground;
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
          width: 36,
          height: 39,
          borderRadius: radius.field,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
        }}
      >
        {task.status === "running" || task.status === "queued" ? (
          <Sparkles size={16} strokeWidth={1.7} color={colors.primary} />
        ) : task.status === "waiting_approval" || task.status === "waiting_input" ? (
          <Clock3 size={16} strokeWidth={1.7} color={statusToneColors.waiting.foreground} />
        ) : task.status === "failed" || task.status === "cancelled" ? (
          <CircleX size={16} color={colors.danger} />
        ) : (
          <Check size={16} strokeWidth={1.9} color={colors.success} />
        )}
      </View>
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
          {task.title}
        </Text>
        <View style={s.between}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: colors.muted }}>
            {task.plan.find((step) => step.status === "running")?.title || task.error || ""}
          </Text>
          <Text style={{ fontSize: 10, color: colors.faint }}>{taskTime(task)}</Text>
        </View>
        {!!task.plan.length && (
          <View style={{ height: 2, borderRadius: radius.full, backgroundColor: colors.line }}>
            <View
              style={{
                width: `${Math.max(3, Math.round(progress * 100))}%`,
                height: 2,
                borderRadius: radius.full,
                // 等待态不需要抢注意力：用中性描边色，避免深色条比「进行中」更重
                backgroundColor: tone === "waiting" ? colors.lineStrong : toneColor,
              }}
            />
          </View>
        )}
      </View>
      <StatusBadge tone={tone} label={statusLabel(task.status)} />
    </Pressable>
  );
}

export function WorkbenchScreen() {
  const { api, workspace, refresh, ask, navigate, open, notify } = useWorkspace();
  const { data } = useAgentWorkspace();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const composerRef = useRef<TextInput>(null);
  const sideBySide = width >= breakpoints.desktop;
  // 1024 宽时主列约 380–400，问候（31 号）与 180 简报卡会撞行 → 主列不足 520 时上下分行。
  const narrow = width < 1180;
  const [insightIndex, setInsightIndex] = useState(0);
  const savedInsightIds = useSavedInsightIds();
  const [now, setNow] = useState(() => new Date());
  // 问候语跟随设备时区，并在跨过中午/傍晚时自动更新，无需刷新页面。
  useEffect(() => {
    const updateNow = () => setNow(new Date());
    const timer = setInterval(updateNow, 30_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") updateNow();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  const name =
    shortName(workspace.profile.name) || shortName(workspace.profile.email) || t("workbench.there");
  const agentName = localizeAgentName(data?.identity.name);
  // “动态”与任务活动页保持同一口径：所有状态统一按最近更新时间排序。
  const latestTasks = [...(data?.tasks ?? [])].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  // 今日领悟：最多 3 条真实研究产物，按时间倒序做 1/3 轮播。
  const insights = latestWorkbenchInsights(data?.artifacts ?? []);
  const insightPosition = Math.min(insightIndex, Math.max(0, insights.length - 1));
  const insight = insights[insightPosition];
  const insightView = insight ? workbenchInsightView(insight) : undefined;
  const insightSymbol = [insightView?.symbolName, insightView?.code].filter(Boolean).join(" · ");
  const dateLine = now.toLocaleDateString(activeLocaleTag(), {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  useEffect(() => {
    setInsightIndex((current) => Math.min(current, Math.max(0, insights.length - 1)));
  }, [insights.length]);

  const submitPrompt = (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;
    setDraft("");
    ask(prompt, attachments);
    setAttachments([]);
    setPicking(false);
  };
  const submit = () => submitPrompt(draft);

  async function uploadMaterial() {
    if (uploading) return;
    setUploading(true);
    try {
      const file = await pickAndUploadFile(api);
      if (!file) return;
      await refresh();
      setAttachments((ids) => (ids.includes(file.id) ? ids : [...ids, file.id]));
      setPickerSelection((ids) => (ids.includes(file.id) ? ids : [...ids, file.id]));
      setPicking(false);
      notify(t("chat.uploadMaterialDone", { name: file.name }));
    } catch (e) {
      notify(
        t("chat.uploadMaterialFailed", {
          detail: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setUploading(false);
    }
  }

  function openFilePicker() {
    setPickerSelection(attachments);
    setPicking(true);
  }

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
            <View
              style={[
                narrow ? null : s.between,
                { alignItems: "flex-start", gap: narrow ? 12 : 16 },
              ]}
            >
              <View style={{ flex: 1, gap: 6, width: narrow ? "100%" : undefined }}>
                <Text style={[typography.eyebrow, { color: colors.faint }]}>
                  {dateLine} · {t("workbench.marketContext")}
                </Text>
                <Text
                  style={{
                    ...(sideBySide ? typography.display : typography.displayCompact),
                    color: colors.heading,
                  }}
                >
                  {t(greetingKeyForHour(userLocalHour(now)), { name })}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("workbench.briefing")}
                onPress={() => setBriefingOpen(true)}
                style={({ pressed }) => ({
                  width: narrow ? "100%" : 180,
                  minHeight: 62,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 11,
                  paddingHorizontal: 13,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: radius.field,
                  backgroundColor: pressed ? colors.surface : colors.paper,
                })}
              >
                <View
                  style={{
                    width: 31,
                    height: 31,
                    borderRadius: radius.full,
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
                  <Text numberOfLines={1} style={{ fontSize: 10, color: colors.muted }}>
                    {t("workbench.briefingDetail")}
                  </Text>
                </View>
                <ChevronRight size={14} strokeWidth={1.7} color={colors.faint} />
              </Pressable>
            </View>

            <PromptComposer
              inputRef={composerRef}
              value={draft}
              onChangeText={setDraft}
              onSubmit={submit}
              placeholder={t("workbench.askPlaceholder")}
              accessibilityLabel={t("workbench.askPlaceholder")}
              tools={[
                {
                  key: "upload",
                  icon: Upload,
                  label: t("chat.uploadMaterial"),
                  active: uploading,
                  onPress: () => void uploadMaterial(),
                },
                {
                  key: "files",
                  icon: FolderOpen,
                  label: t("chat.filePickerTool"),
                  active: picking,
                  onPress: openFilePicker,
                },
              ]}
              attachments={
                <ComposerAttachments
                  files={workspace.files}
                  selectedIds={attachments}
                  onRemove={(id) =>
                    setAttachments((ids) => ids.filter((candidate) => candidate !== id))
                  }
                />
              }
              assistantLabel={t("app.agentSettingsLabel", { name: agentName })}
              assistantText={t("workbench.depthAnalysis")}
              onOpenAssistant={() => open({ type: "personality" })}
              sendLabel={t("workbench.sendAnalysis")}
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {quickPrompts.map((item) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => submitPrompt(item.prompt)}
                  style={({ pressed }) => ({
                    minHeight: 32,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 7,
                    paddingHorizontal: 10,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: radius.control,
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
            <SectionHeading
              title={t("workbench.todayInsight")}
              count={insights.length ? `${insightPosition + 1} / ${insights.length}` : undefined}
              actions={
                <View style={[s.row, { gap: 2 }]}>
                  {insights.length > 1 && (
                    <>
                      <IconButton
                        size={28}
                        icon={ChevronLeft}
                        label={t("ui.previous")}
                        disabled={insightPosition === 0}
                        onPress={() =>
                          setInsightIndex((value) => moveInsightIndex(value, -1, insights.length))
                        }
                      />
                      <IconButton
                        size={28}
                        icon={ChevronRight}
                        label={t("ui.next")}
                        disabled={insightPosition >= insights.length - 1}
                        onPress={() =>
                          setInsightIndex((value) => moveInsightIndex(value, 1, insights.length))
                        }
                      />
                    </>
                  )}
                </View>
              }
              style={{ marginBottom: 0 }}
            />
            <InsightCard
              eyebrow={`${t("workbench.insightCard")} · ${
                insight && insightView
                  ? insightView.category || statusLabel(insight.kind)
                  : t("workbench.researchNote")
              }`}
              title={insightView?.title || t("workbench.insightEmptyTitle")}
              basis={insightView?.basis}
              limits={insightView?.limits}
              revisit={insightView?.revisit}
              showSections={false}
              meta={
                insight
                  ? insightSymbol || t("workbench.insightRelatedAnalysis")
                  : t("workbench.insightEmptyDetail")
              }
              saved={!!insight && savedInsightIds.includes(insight.id)}
              savePlacement="header"
              onToggleSave={
                insight
                  ? () => {
                      const wasSaved = savedInsightIds.includes(insight.id);
                      toggleSavedInsight(insight.id);
                      notify(
                        t(
                          wasSaved
                            ? "workbench.insightUnsavedNotice"
                            : "workbench.insightSavedNotice",
                        ),
                      );
                    }
                  : undefined
              }
              actionLabel={insight ? t("workbench.expand") : undefined}
              accessibilityLabel={
                insight
                  ? `${t("workbench.expand")}：${insightView?.title}`
                  : t("workbench.askPlaceholder")
              }
              onPress={() =>
                insight
                  ? open({ type: "insight", artifact: insight })
                  : composerRef.current?.focus()
              }
            />
          </View>

          <View>
            <SectionHeading
              title={t("workbench.latestActivity")}
              count={latestTasks.length}
              action={t("workbench.allActivity")}
              onPress={() => navigate("activity")}
              style={{ marginBottom: 2 }}
            />
            {latestTasks.length ? (
              latestTasks.slice(0, 3).map((task) => <TaskRow key={task.id} task={task} />)
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
                <ListChecks size={24} color={colors.faint} />
                <Text style={s.heading}>{t("workbench.noActivityTitle")}</Text>
                <Text style={[s.small, { textAlign: "center" }]}>
                  {t("workbench.noActivityDetail")}
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
          <MarketBriefingCard plain onRequestClose={() => setBriefingOpen(false)} />
        </Sheet>
      )}
      {picking && (
        <FilePickerSheet
          files={workspace.files}
          selectedIds={pickerSelection}
          onToggle={(id) =>
            setPickerSelection((ids) =>
              ids.includes(id) ? ids.filter((candidate) => candidate !== id) : [...ids, id],
            )
          }
          onConfirm={() => {
            setAttachments(pickerSelection);
            setDraft((current) => (current.trim() ? current : t("chat.filePickerDefaultPrompt")));
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
          onUpload={uploadMaterial}
          onBrowse={() => {
            setPicking(false);
            navigate("files");
          }}
        />
      )}
    </>
  );
}
