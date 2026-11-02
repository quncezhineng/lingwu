import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AccountScreen } from "./account";
import { AgentOnboarding } from "./agent-onboarding";
import { AgentOrb } from "./agent-orb";
import { type AgentPanel, AgentSheets } from "./agent-sheets";
import { useAgentSpace } from "./agent-space";
import { AGENT_CAPABILITY_LABELS, type AgentDefinition } from "./agent-space-model";
import { AgentStatus } from "./agent-ui";
import { useAgentWorkspace } from "./agent-workspace";
import { CapabilityHubScreen } from "./capability-hub";
import { ChatScreen, WorkspaceTools } from "./chat";
import { Details } from "./details";
import { useTranslation } from "./i18n";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Menu,
  type MessageCircle,
  MoreHorizontal,
  Plus,
  Settings2,
  Sparkles,
  Star,
  X,
} from "./icons";
import { PreferencesScreen } from "./preferences-screen";
import { BrowserScreen, CalendarScreen, FilesScreen, MailScreen } from "./screens";
import { TaskHubScreen } from "./task-hub";
import { breakpoints } from "./theme";
import { Toast, type ToastState } from "./toast";
import { Button, colors, ErrorNotice, fonts, radius, s, space, typography } from "./ui";
import { WatchlistHubScreen } from "./watchlist-hub";
import { type Detail, useWorkspace } from "./workspace";

const RAIL_WIDTH = 258;
const CONTEXT_WIDTH = 296;

function railCapabilityLabel(capability: string, locale: "en" | "zh-Hans") {
  const labels = AGENT_CAPABILITY_LABELS[capability];
  return labels ? labels[locale === "zh-Hans" ? "zh" : "en"] : capability;
}

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
        minHeight: 62,
        paddingHorizontal: 10,
        paddingVertical: 9,
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
      {agent.system && <Sparkles size={13} color={colors.primary} />}
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
  const { agents, current, selectAgent, preferences } = useAgentSpace();
  const { navigate } = useWorkspace();
  const choose = (agent: AgentDefinition) => {
    selectAgent(agent.id);
    navigate("chat");
    onClose?.();
  };
  return (
    <View
      style={{
        width: compact ? "100%" : RAIL_WIDTH,
        height: "100%",
        paddingHorizontal: compact ? 18 : 18,
        paddingTop: compact ? 26 : 24,
        paddingBottom: 18,
        borderRightWidth: compact ? 0 : 1,
        borderRightColor: colors.line,
        backgroundColor: colors.sidebar,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 }}>
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

      <View style={{ marginTop: 29, gap: 7 }}>
        <Text
          style={[
            typography.eyebrow,
            { color: colors.faint, fontSize: 9, marginLeft: 8, marginBottom: 3 },
          ]}
        >
          {t("agentSpace.myAgents")}
        </Text>
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
      </View>

      <View style={{ flex: 1 }} />
      <Pressable
        accessibilityRole="button"
        onPress={() => onOpen("preferences")}
        style={({ pressed }) => ({
          paddingVertical: 13,
          borderRadius: 13,
          paddingHorizontal: 10,
          backgroundColor: pressed ? colors.overlay1 : "transparent",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 6,
        })}
      >
        <Settings2 size={17} color={colors.muted} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.text, { fontSize: 12, fontWeight: "500" }]}>
            {t("agentSpace.preferences")}
          </Text>
          <Text style={[s.small, { fontSize: 9, color: colors.faint }]}>
            {preferences.name || t("agentSpace.preferencesDetail")}
          </Text>
        </View>
        <ChevronRight size={14} color={colors.faint} />
      </Pressable>
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
        <View
          style={{
            width: 31,
            height: 31,
            borderRadius: 10,
            backgroundColor: colors.tertiary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>
            {(preferences.name || "L").charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.text, { fontSize: 12, fontWeight: "500" }]}>
            {preferences.name || t("agentSpace.account")}
          </Text>
          <Text style={[s.small, { fontSize: 9, color: colors.faint }]}>
            {t("agentSpace.account")}
          </Text>
        </View>
        <ChevronRight size={14} color={colors.faint} />
      </Pressable>
    </View>
  );
}

function AgentDrawer({
  visible,
  onClose,
  onOpen,
}: {
  visible: boolean;
  onClose: () => void;
  onOpen: (panel: AgentPanel) => void;
}) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.modalShade, flexDirection: "row" }}>
        <View
          style={{ width: "88%", maxWidth: 330, height: "100%", backgroundColor: colors.sidebar }}
        >
          <AgentRail compact onClose={onClose} onOpen={onOpen} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ flex: 1 }}
        />
      </View>
    </Modal>
  );
}

function AgentHeader({
  desktop,
  onMenu,
  onManage,
  onMore,
}: {
  desktop: boolean;
  onMenu: () => void;
  onManage: () => void;
  onMore: () => void;
}) {
  const { t } = useTranslation();
  const { current } = useAgentSpace();
  const { section, navigate } = useWorkspace();
  const isChat = section === "chat";
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
        height: desktop ? 82 : 74,
        paddingHorizontal: desktop ? 34 : 17,
        flexDirection: "row",
        alignItems: "center",
        borderBottomWidth: 1,
        borderBottomColor: colors.lineSoft,
        backgroundColor: `${colors.canvas}F7`,
      }}
    >
      <View style={{ width: desktop ? 52 : 48, alignItems: "flex-start" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isChat && desktop
              ? t("agentSpace.createAgent")
              : isChat
                ? t("agentSpace.chooseAgent")
                : t("agentSpace.backToChat")
          }
          onPress={() => (isChat ? onMenu() : navigate("chat"))}
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
          {isChat && desktop ? (
            <Plus size={20} color={colors.text} />
          ) : isChat ? (
            <Menu size={20} color={colors.text} />
          ) : (
            <ChevronLeft size={20} color={colors.text} />
          )}
        </Pressable>
      </View>
      <View style={{ flex: 1, alignItems: "center" }}>
        {isChat ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("agentSpace.manageAgent")}
            onPress={onManage}
            style={({ pressed }) => ({
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              backgroundColor: pressed ? colors.overlay1 : "transparent",
            })}
          >
            <AgentOrb avatar={current.avatar} size={33} />
            <View style={{ gap: 2 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 15,
                  lineHeight: 20,
                  fontWeight: "600",
                  color: colors.text,
                  letterSpacing: 0.4,
                }}
              >
                {current.name}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 10, lineHeight: 14, color: colors.faint }}>
                {current.role}
              </Text>
            </View>
          </Pressable>
        ) : (
          <View style={{ alignItems: "center" }}>
            <Text style={[typography.heading, { fontSize: 16 }]}>{sectionTitle}</Text>
            <Text style={[s.small, { fontSize: 9, color: colors.faint }]}>
              {t("agentSpace.globalNote")}
            </Text>
          </View>
        )}
      </View>
      <View style={{ width: desktop ? 52 : 48, alignItems: "flex-end" }}>
        {isChat && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("agentSpace.more")}
            onPress={onMore}
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
            <MoreHorizontal size={21} color={colors.text} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function ContextButton({
  icon: Icon,
  title,
  detail,
  badge,
  onPress,
}: {
  icon: typeof MessageCircle;
  title: string;
  detail?: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 53,
        paddingHorizontal: 9,
        paddingVertical: 9,
        borderRadius: 12,
        backgroundColor: pressed ? colors.overlay1 : "transparent",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      })}
    >
      <View
        style={{
          width: 33,
          height: 33,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
        }}
      >
        <Icon size={16} color={colors.muted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.text, fontWeight: "500" }}>
          {title}
        </Text>
        {!!detail && (
          <Text numberOfLines={1} style={{ fontSize: 9, color: colors.faint }}>
            {detail}
          </Text>
        )}
      </View>
      {badge ? (
        <View
          style={{
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.tertiary,
          }}
        >
          <Text style={{ fontSize: 9, color: colors.muted }}>{badge}</Text>
        </View>
      ) : (
        <ChevronRight size={13} color={colors.faint} />
      )}
    </Pressable>
  );
}

function AgentContextRail({ onOpen }: { onOpen: (panel: AgentPanel) => void }) {
  const { t, locale } = useTranslation();
  const { current } = useAgentSpace();
  const { data } = useAgentWorkspace();
  const activeTasks = (data?.tasks ?? []).filter(
    (task) => !["succeeded", "failed", "cancelled"].includes(task.status),
  ).length;
  const agentTasks = (data?.tasks ?? []).filter(
    (task) => task.threadId === current.threadId || (!task.threadId && current.system),
  );
  return (
    <View
      style={{
        width: CONTEXT_WIDTH,
        borderLeftWidth: 1,
        borderLeftColor: colors.line,
        backgroundColor: colors.surfaceRaised,
        paddingHorizontal: 15,
        paddingTop: 25,
        paddingBottom: 20,
      }}
    >
      <Text style={[typography.eyebrow, { color: colors.faint, marginLeft: 9, marginBottom: 7 }]}>
        {t("agentSpace.globalArea")}
      </Text>
      <ContextButton
        icon={Star}
        title={t("agentSpace.marketBrief")}
        detail={t("agentSpace.marketBriefDetail")}
        onPress={() => onOpen("brief")}
      />
      <ContextButton
        icon={Sparkles}
        title={t("agentSpace.insights")}
        detail={t("agentSpace.insightsDetail")}
        onPress={() => onOpen("insights")}
      />
      <ContextButton
        icon={Star}
        title={t("agentSpace.watchlist")}
        detail={t("agentSpace.watchlistDetail")}
        onPress={() => onOpen("watchlist")}
      />
      <ContextButton
        icon={Clock3}
        title={t("agentSpace.tasks")}
        detail={t("agentSpace.tasksDetail")}
        badge={activeTasks}
        onPress={() => onOpen("tasks")}
      />

      <View
        style={{
          height: 1,
          backgroundColor: colors.line,
          marginHorizontal: 8,
          marginVertical: 17,
        }}
      />
      <Text style={[typography.eyebrow, { color: colors.faint, marginLeft: 9, marginBottom: 7 }]}>
        {t("agentSpace.agentLearned", { name: current.name })}
      </Text>
      <ContextButton
        icon={Bell}
        title={t("agentSpace.scheduledTasks")}
        detail={`${data?.monitors.filter((monitor) => monitor.status === "active").length ?? 0} · ${current.name}`}
        onPress={() => onOpen("manage")}
      />
      <ContextButton
        icon={Clock3}
        title={t("agentSpace.taskHistory")}
        detail={`${agentTasks.length} · ${current.name}`}
        onPress={() => onOpen("tasks")}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 6 }}>
        {current.skills.slice(0, 4).map((capability) => (
          <Pressable
            key={capability}
            accessibilityRole="button"
            onPress={() => onOpen("capabilities")}
            style={({ pressed }) => ({
              width: "47.5%",
              minHeight: 62,
              padding: 9,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.lineSoft,
              backgroundColor: pressed ? colors.paper : "transparent",
              gap: 6,
            })}
          >
            <Sparkles size={14} color={colors.primary} />
            <Text
              numberOfLines={2}
              style={{ fontSize: 10, lineHeight: 15, color: colors.muted, fontWeight: "500" }}
            >
              {railCapabilityLabel(capability, locale)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => onOpen("capabilities")}
        style={{
          minHeight: 34,
          marginTop: 7,
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
        }}
      >
        <Text style={{ fontSize: 10, color: colors.primaryStrong }}>
          {t("agentSpace.allCapabilities")}
        </Text>
        <ChevronRight size={12} color={colors.primary} />
      </Pressable>
      <View style={{ flex: 1 }} />
      <Text style={{ fontSize: 9, lineHeight: 16, color: colors.faint }}>
        {t("agentSpace.globalNote")}
      </Text>
    </View>
  );
}

function GlobalTaskPill({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const active = (data?.tasks ?? []).filter(
    (task) => !["succeeded", "failed", "cancelled"].includes(task.status),
  ).length;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => ({
        alignSelf: "center",
        minHeight: 30,
        marginTop: 6,
        paddingHorizontal: 11,
        borderRadius: radius.full,
        backgroundColor: pressed ? colors.overlay1 : colors.surfaceRaised,
        borderWidth: 1,
        borderColor: colors.lineSoft,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      })}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: active ? colors.primary : colors.success,
        }}
      />
      <Text style={{ fontSize: 9, color: colors.muted }}>
        {active ? t("agentSpace.activeTasks", { count: active }) : t("agentSpace.noActiveTasks")}
      </Text>
    </Pressable>
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
        return <AccountScreen onSignOut={onSignOut} />;
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
  const showContext = width >= 1180;
  const { t } = useTranslation();
  const { section, close } = useWorkspace();
  const { agents, current, selection, needsOnboarding, markThreadUsed } = useAgentSpace();
  const [panel, setPanel] = useState<AgentPanel>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mountedIds, setMountedIds] = useState<string[]>([current.id]);

  useEffect(() => {
    setMountedIds((ids) => (ids.includes(current.id) ? ids : [...ids, current.id]));
  }, [current.id]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (panel) setPanel(undefined);
      else if (drawerOpen) setDrawerOpen(false);
      else if (detail) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, detail, drawerOpen, panel]);

  const mounted = useMemo(
    () =>
      mountedIds
        .map((id) => agents.find((agent) => agent.id === id))
        .filter((agent): agent is AgentDefinition => Boolean(agent)),
    [agents, mountedIds],
  );

  const openPanel = (next: AgentPanel) => {
    setDrawerOpen(false);
    setPanel(next);
  };

  return (
    <>
      <WorkspaceTools />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
        <View style={{ flex: 1, flexDirection: "row", minHeight: 0 }}>
          {desktop && <AgentRail onOpen={openPanel} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <AgentHeader
              desktop={desktop}
              onMenu={() => (desktop ? openPanel("create") : setDrawerOpen(true))}
              onManage={() => openPanel("manage")}
              onMore={() => openPanel("more")}
            />
            {section === "chat" && <GlobalTaskPill onOpen={() => openPanel("tasks")} />}
            <View style={{ flex: 1, minHeight: 0 }}>
              {section === "chat" ? (
                needsOnboarding ? (
                  <AgentOnboarding />
                ) : (
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
                            paddingHorizontal: desktop ? 24 : 17,
                          }}
                        >
                          <AgentStatus />
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
                            agentContext={{
                              name: agent.name,
                              role: agent.role,
                              persona: agent.persona,
                            }}
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
                )
              ) : (
                <SecondarySection onOpen={openPanel} onSignOut={onSignOut} />
              )}
            </View>
          </View>
          {desktop && showContext && section === "chat" && <AgentContextRail onOpen={openPanel} />}
        </View>
        <Toast toast={toast} onDismiss={clearToast} />
        <AgentDrawer
          visible={drawerOpen && !desktop}
          onClose={() => setDrawerOpen(false)}
          onOpen={openPanel}
        />
        <AgentSheets
          panel={panel}
          onClose={() => setPanel(undefined)}
          onPanel={setPanel}
          onSignOut={onSignOut}
        />
        {detail && <Details detail={detail} />}
      </SafeAreaView>
    </>
  );
}
