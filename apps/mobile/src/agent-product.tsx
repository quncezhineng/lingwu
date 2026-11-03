import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountScreen } from "./account";
import { AccountAvatar } from "./account-avatar";
import { AgentFloatingHeader, floatingHeaderClearance } from "./agent-floating-header";
import { agentLayout } from "./agent-layout";
import { AgentOnboarding } from "./agent-onboarding";
import { AgentOrb } from "./agent-orb";
import { AgentMoreContent, type AgentPanel, AgentSheets } from "./agent-sheets";
import { AgentSideDrawer } from "./agent-side-drawer";
import { useAgentSpace } from "./agent-space";
import {
  type AgentDefinition,
  onboardingPreferenceContext,
  onboardingSummary,
} from "./agent-space-model";
import { Text } from "./app-text";
import { CapabilityHubScreen } from "./capability-hub";
import { ChatScreen, WorkspaceTools } from "./chat";
import { ColumnResizeHandle } from "./column-resize-handle";
import { columnMaxWidth, desktopColumns } from "./desktop-columns";
import { Details } from "./details";
import { useTranslation } from "./i18n";
import { ChevronLeft, ChevronRight, Plus, X } from "./icons";
import { PreferencesScreen } from "./preferences-screen";
import { BrowserScreen, CalendarScreen, FilesScreen, MailScreen } from "./screens";
import { TaskHubScreen } from "./task-hub";
import { breakpoints } from "./theme";
import { Toast, type ToastState } from "./toast";
import { Button, colors, ErrorNotice, fonts, radius, s, space, typography } from "./ui";
import { useDesktopColumns } from "./use-desktop-columns";
import { WatchlistHubScreen } from "./watchlist-hub";
import { WatchlistRail } from "./watchlist-rail";
import { type Detail, useWorkspace } from "./workspace";

function AgentListItem({
  agent,
  active,
  onPress,
}: {
  agent: AgentDefinition;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 72,
        paddingHorizontal: 11,
        paddingVertical: 13,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: active ? colors.accentLine : "transparent",
        backgroundColor: active ? colors.sky : pressed ? colors.overlay1 : "transparent",
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
      })}
    >
      <AgentOrb avatar={agent.avatar} size={34} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 13,
            lineHeight: 19,
            fontWeight: active ? "600" : "500",
            color: active ? colors.primaryStrong : colors.text,
          }}
        >
          {agent.name}
        </Text>
        <Text numberOfLines={1} style={[s.small, { fontSize: 10, color: colors.faint }]}>
          {agent.role}
        </Text>
      </View>
    </Pressable>
  );
}

function AgentRail({
  onOpen,
  onClose,
  compact = false,
}: {
  onOpen: (panel: AgentPanel) => void;
  onClose?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { agents, current, selectAgent } = useAgentSpace();
  const { navigate, workspace } = useWorkspace();
  const accountNickname = workspace.profile.name.trim() || t("agentSpace.account");
  const choose = (agent: AgentDefinition) => {
    selectAgent(agent.id);
    navigate("chat");
    onClose?.();
  };
  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        paddingHorizontal: compact ? 22 : 18,
        paddingTop: compact ? 44 : 20,
        paddingBottom: 18,
        borderRightWidth: 0,
        borderRightColor: colors.line,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("agentSpace.backToChat")}
          onPress={() => {
            navigate("chat");
            onClose?.();
          }}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <Image
            source={require("../assets/logo.png")}
            resizeMode="contain"
            accessible={false}
            style={{ width: 34, height: 34, flexShrink: 0 }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 21,
                lineHeight: 38,
                fontWeight: "600",
                letterSpacing: 2,
                fontFamily: fonts.serif,
              }}
            >
              {t("common.agentName")}
            </Text>
          </View>
        </Pressable>
        {compact && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("ui.closeDetails")}
            onPress={onClose}
            style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center" }}
          >
            <X size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        style={{ flex: 1, marginTop: 24 }}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {agents.map((agent) => (
          <AgentListItem
            key={agent.id}
            agent={agent}
            active={agent.id === current.id}
            onPress={() => choose(agent)}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpen("create")}
          style={({ pressed }) => ({
            minHeight: 46,
            paddingHorizontal: 12,
            borderRadius: 13,
            backgroundColor: pressed ? colors.skyStrong : colors.sky,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
            marginTop: 3,
          })}
        >
          <Plus size={17} color={colors.primaryStrong} />
          <Text style={{ fontSize: 12, color: colors.primaryStrong, fontWeight: "600" }}>
            {t("agentSpace.createAgent")}
          </Text>
        </Pressable>
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        onPress={() => onOpen("account")}
        style={({ pressed }) => ({
          paddingVertical: 13,
          borderRadius: 13,
          paddingHorizontal: 10,
          backgroundColor: pressed ? colors.overlay1 : "transparent",
          borderTopWidth: 1,
          borderTopColor: colors.line,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        })}
      >
        <AccountAvatar
          avatarUrl={workspace.profile.avatarUrl}
          name={accountNickname}
          size={31}
          borderRadius={10}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.text, { fontSize: 12, fontWeight: "500" }]}>{accountNickname}</Text>
          <Text style={[s.small, { fontSize: 9, color: colors.faint }]}>
            {t("agentSpace.account")}
          </Text>
        </View>
        <ChevronRight size={14} color={colors.faint} />
      </Pressable>
    </View>
  );
}

function CapabilityRail({
  onClose,
  onOpen,
  compact = false,
}: {
  onClose?: () => void;
  onOpen: (panel: AgentPanel) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { top: safeTop } = useSafeAreaInsets();
  const drawerTop = Math.max(safeTop, 12);
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.surfaceRaised }}>
      {compact && (
        <View
          style={{
            minHeight: drawerTop + 44,
            paddingTop: drawerTop,
            paddingHorizontal: 18,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          {onClose && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("ui.closeDetails")}
              onPress={onClose}
              style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center" }}
            >
              <X size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
      )}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingTop: 20,
          paddingBottom: 24,
        }}
      >
        <WatchlistRail
          onViewAll={() => onOpen("watchlist")}
          onAdd={() => onOpen("watchlist-add")}
          beforeOpenSymbol={onClose}
        />
        <Text
          style={{
            marginTop: 30,
            marginBottom: 18,
            fontSize: 17,
            fontFamily: fonts.serif,
            fontWeight: "600",
            color: colors.text,
          }}
        >
          {t("agentSpace.more")}
        </Text>
        <AgentMoreContent onPanel={onOpen} compact={compact} showWatchlistLink={false} />
      </ScrollView>
    </View>
  );
}

function AgentHeader({
  onMenu,
  onManage,
  onMore,
  persistentNavigation = false,
}: {
  onMenu: () => void;
  onManage: () => void;
  onMore: () => void;
  persistentNavigation?: boolean;
}) {
  const { t } = useTranslation();
  const { current } = useAgentSpace();
  const { section, navigate } = useWorkspace();
  if (section === "chat")
    return (
      <AgentFloatingHeader
        name={current.name}
        role={current.role}
        avatar={current.avatar}
        persistentNavigation={persistentNavigation}
        onMenu={onMenu}
        onManage={onManage}
        onMore={onMore}
      />
    );
  const sectionTitle =
    section === "account"
      ? t("app.navAccount")
      : section === "preferences"
        ? t("agentSpace.preferences")
        : section === "files"
          ? t("app.navFiles")
          : section === "notes"
            ? t("app.titleNotes")
            : section === "watchlist" || section === "portfolio"
              ? t("app.navWatchlist")
              : section === "activity" || section === "goals"
                ? t("app.navActivity")
                : section === "mail"
                  ? t("app.titleMail")
                  : section === "calendar"
                    ? t("app.titleCalendar")
                    : section === "browser"
                      ? t("app.titleBrowser")
                      : section === "apps" || section === "connections"
                        ? t("app.navApps")
                        : t("app.navChat");
  return (
    <View
      style={{
        height: agentLayout.headerHeight,
        width: "100%",
        maxWidth: agentLayout.columnMaxWidth,
        alignSelf: "center",
        paddingHorizontal: 17,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.canvas,
      }}
    >
      <View style={{ width: 48 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("agentSpace.backToChat")}
          onPress={() => navigate("chat")}
          style={({ pressed }) => ({
            width: 43,
            height: 43,
            borderRadius: radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? colors.overlay1 : colors.paper,
            borderWidth: 1,
            borderColor: colors.lineSoft,
          })}
        >
          <ChevronLeft size={20} color={colors.text} />
        </Pressable>
      </View>
      <View style={{ flex: 1, alignItems: "center" }}>
        <Text style={[typography.heading, { fontSize: 16 }]}>{sectionTitle}</Text>
        <Text style={[s.small, { fontSize: 9, color: colors.faint }]}>
          {t("agentSpace.globalNote")}
        </Text>
      </View>
      <View style={{ width: 48 }} />
    </View>
  );
}

function SecondarySection({
  onOpen,
  onSignOut,
}: {
  onOpen: (panel: AgentPanel) => void;
  onSignOut: () => void;
}) {
  const { section } = useWorkspace();
  const { t } = useTranslation();
  const content = (() => {
    switch (section) {
      case "account":
        return (
          <AccountScreen onSignOut={onSignOut} onOpenPreferences={() => onOpen("preferences")} />
        );
      case "preferences":
        return <PreferencesScreen />;
      case "watchlist":
      case "portfolio":
        return <WatchlistHubScreen />;
      case "files":
      case "notes":
        return <FilesScreen initialSection={section === "notes" ? "notes" : "files"} />;
      case "activity":
      case "goals":
        return <TaskHubScreen />;
      case "apps":
      case "connections":
        return <CapabilityHubScreen />;
      case "mail":
        return <MailScreen />;
      case "calendar":
        return <CalendarScreen />;
      case "browser":
        return <BrowserScreen />;
      default:
        return (
          <View style={{ alignItems: "center", padding: 40, gap: 14 }}>
            <Text style={s.muted}>{t("agentSpace.noTasks")}</Text>
            <Button onPress={() => onOpen("tasks")}>{t("agentSpace.tasks")}</Button>
          </View>
        );
    }
  })();
  return (
    <ScrollView
      contentContainerStyle={{
        width: "100%",
        maxWidth: 1050,
        alignSelf: "center",
        paddingHorizontal: space.pageMobile,
        paddingTop: 22,
        paddingBottom: 46,
      }}
    >
      {content}
    </ScrollView>
  );
}

export function AgentProductShell({
  detail,
  toast,
  clearToast,
  error,
  prompt,
  onSignOut,
}: {
  detail?: Detail;
  toast?: ToastState;
  clearToast: () => void;
  error: string;
  prompt?: { id: number; text: string; attachmentIds?: readonly string[] };
  onSignOut: () => void;
}) {
  const { width } = useWindowDimensions();
  const desktop = width >= breakpoints.desktop;
  const [containerWidth, setContainerWidth] = useState(width);
  const availableWidth = Math.floor(Math.min(width, containerWidth));
  const threeColumns = Platform.OS === "web" && availableWidth >= desktopColumns.breakpoint;
  const { widths: columnWidths, resize: resizeColumn } = useDesktopColumns(availableWidth);
  const { t } = useTranslation();
  const { section, close } = useWorkspace();
  const { agents, current, preferences, selection, loading, needsOnboarding, markThreadUsed } =
    useAgentSpace();
  const [panelStack, setPanelStack] = useState<AgentPanel[]>([]);
  const panel = panelStack.at(-1);
  const closePanel = useCallback(() => setPanelStack((stack) => stack.slice(0, -1)), []);
  const dismissPanels = useCallback(() => setPanelStack([]), []);
  const pushPanel = useCallback(
    (next: AgentPanel) =>
      setPanelStack((stack) => (stack.at(-1) === next ? stack : [...stack, next])),
    [],
  );
  const [drawer, setDrawer] = useState<"agents" | "capabilities" | null>(null);
  const [mountedIds, setMountedIds] = useState<string[]>([current.id]);

  useEffect(() => {
    setMountedIds((ids) => (ids.includes(current.id) ? ids : [...ids, current.id]));
  }, [current.id]);

  useEffect(() => {
    if (threeColumns) setDrawer(null);
  }, [threeColumns]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Each Modal owns Escape, including nested resource editors.
      if (panel) return;
      else if (drawer) setDrawer(null);
      else if (detail) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, detail, drawer, panel]);

  const mounted = useMemo(
    () =>
      mountedIds
        .map((id) => agents.find((agent) => agent.id === id))
        .filter((agent): agent is AgentDefinition => Boolean(agent)),
    [agents, mountedIds],
  );

  const firstRunWelcome = useMemo(() => {
    if (!current.system || !preferences.goal) return undefined;
    const summary = onboardingSummary(preferences);
    const primary =
      preferences.goal === "持续跟踪重点标的"
        ? {
            label: t("agentSpace.firstRunTrackLabel"),
            prompt: t("agentSpace.firstRunTrackPrompt", { focus: summary.focus }),
          }
        : preferences.goal === "为长期积累做准备"
          ? {
              label: t("agentSpace.firstRunLongTermLabel"),
              prompt: t("agentSpace.firstRunLongTermPrompt", { focus: summary.focus }),
            }
          : preferences.goal === "建立投资习惯"
            ? {
                label: t("agentSpace.firstRunHabitLabel"),
                prompt: t("agentSpace.firstRunHabitPrompt", { focus: summary.focus }),
              }
            : preferences.goal === "先学习，再做判断"
              ? {
                  label: t("agentSpace.firstRunLearnLabel"),
                  prompt: t("agentSpace.firstRunLearnPrompt", { focus: summary.focus }),
                }
              : {
                  label: t("agentSpace.firstRunFollowLabel"),
                  prompt: t("agentSpace.firstRunFollowPrompt", { focus: summary.focus }),
                };
    return {
      greeting: t("agentSpace.firstRunGreeting", {
        name: summary.name,
        agent: current.name,
      }),
      summary: t("agentSpace.firstRunMemory", {
        risk: summary.risk,
        focus: summary.focus,
        goal: summary.goal,
      }),
      horizon: summary.horizon
        ? t("agentSpace.firstRunHorizon", { horizon: summary.horizon })
        : undefined,
      closing: t("agentSpace.firstRunClosing"),
      actions: [
        primary,
        {
          label: t("agentSpace.firstRunBriefLabel"),
          prompt: t("agentSpace.firstRunBriefPrompt", { focus: summary.focus }),
        },
      ],
    };
  }, [current.name, current.system, preferences, t]);

  const openPanel = (next: AgentPanel) => {
    setDrawer(null);
    setPanelStack([next]);
  };

  // Account initialization is a separate screen: no navigation, chat or task controls
  // mount until the first Agent is ready. Wait for saved progress before choosing a screen.
  if (loading || needsOnboarding) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={s.muted}>{t("common.loading")}</Text>
          </View>
        ) : (
          <AgentOnboarding />
        )}
      </SafeAreaView>
    );
  }

  return (
    <>
      <WorkspaceTools />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
        <View
          onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
          style={{ flex: 1, flexDirection: "row", minHeight: 0 }}
        >
          {threeColumns && (
            <>
              <View style={{ width: columnWidths.left, flexShrink: 0, minHeight: 0 }}>
                <AgentRail onOpen={openPanel} />
              </View>
              <ColumnResizeHandle
                side="left"
                width={columnWidths.left}
                min={desktopColumns.left.min}
                max={columnMaxWidth(availableWidth, columnWidths, "left")}
                label={t("agentSpace.resizeAgentList")}
                hint={t("agentSpace.resizeColumnHint")}
                onResize={(value, finished) => resizeColumn("left", value, finished)}
              />
            </>
          )}
          <View testID="agent-main-column" style={{ flex: 1, minWidth: 0, position: "relative" }}>
            <AgentHeader
              onMenu={() => setDrawer("agents")}
              onManage={() => openPanel("manage")}
              onMore={() => setDrawer("capabilities")}
              persistentNavigation={threeColumns}
            />
            <View style={{ flex: 1, minHeight: 0 }}>
              {section === "chat" ? (
                <>
                  <ErrorNotice error={error} />
                  {mounted.map((agent) => {
                    const active = agent.id === current.id;
                    return (
                      <View
                        key={agent.id}
                        style={{
                          display: active ? "flex" : "none",
                          flex: 1,
                          minHeight: 0,
                          paddingHorizontal: threeColumns ? 18 : desktop ? 24 : 17,
                        }}
                      >
                        <ChatScreen
                          thread={
                            active
                              ? selection
                              : {
                                  id: agent.threadId,
                                  existing: agent.system || agent.threadExists,
                                }
                          }
                          active={active && section === "chat"}
                          prompt={active ? prompt : undefined}
                          hideHeader
                          contentTopInset={floatingHeaderClearance()}
                          agentContext={{
                            name: agent.name,
                            role: agent.role,
                            persona: agent.persona,
                            avatar: agent.avatar,
                            userPreferences: onboardingPreferenceContext(preferences),
                          }}
                          firstRunWelcome={agent.system ? firstRunWelcome : undefined}
                          emptyEyebrow={t("agentSpace.welcomeEyebrow")}
                          emptyTitleLead={t("agentSpace.welcomeTitle")}
                          emptyTitleTail={t("agentSpace.welcomeTail")}
                          emptySubtitle={t("agentSpace.welcomeSubtitle", {
                            name: agent.name,
                          })}
                          composerPlaceholder={t("agentSpace.composer", {
                            name: agent.name,
                          })}
                          onThreadUsed={() => markThreadUsed(agent.id)}
                        />
                      </View>
                    );
                  })}
                </>
              ) : (
                <SecondarySection onOpen={openPanel} onSignOut={onSignOut} />
              )}
            </View>
          </View>
          {threeColumns && (
            <>
              <ColumnResizeHandle
                side="right"
                width={columnWidths.right}
                min={desktopColumns.right.min}
                max={columnMaxWidth(availableWidth, columnWidths, "right")}
                label={t("agentSpace.resizeCapabilities")}
                hint={t("agentSpace.resizeColumnHint")}
                onResize={(value, finished) => resizeColumn("right", value, finished)}
              />
              <View style={{ width: columnWidths.right, flexShrink: 0, minHeight: 0 }}>
                <CapabilityRail onOpen={openPanel} />
              </View>
            </>
          )}
        </View>
        <Toast toast={toast} onDismiss={clearToast} />
        {!threeColumns && drawer && (
          <AgentSideDrawer
            key={drawer}
            side={drawer === "agents" ? "left" : "right"}
            onClose={() => setDrawer(null)}
            closeLabel={t("ui.closeDetails")}
          >
            {drawer === "agents" ? (
              <AgentRail compact onOpen={openPanel} onClose={() => setDrawer(null)} />
            ) : (
              <CapabilityRail compact onOpen={openPanel} onClose={() => setDrawer(null)} />
            )}
          </AgentSideDrawer>
        )}
        <AgentSheets
          key={`${current.id}:${panel}`}
          panel={panel}
          onClose={closePanel}
          onDismiss={dismissPanels}
          onPanel={pushPanel}
          onSignOut={onSignOut}
        />
        {detail && <Details detail={detail} />}
      </SafeAreaView>
    </>
  );
}
