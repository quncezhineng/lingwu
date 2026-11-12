import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
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
import { AgentSettingsScreen, type AgentSettingsTab } from "./agent-settings-screen";
import {
  AgentMoreContent,
  type AgentPanel,
  AgentSheets,
  AgentSkillInspectSheet,
} from "./agent-sheets";
import { AgentSideDrawer } from "./agent-side-drawer";
import { useAgentSpace } from "./agent-space";
import {
  type AgentDefinition,
  onboardingPreferenceContext,
  onboardingSummary,
} from "./agent-space-model";
import { IdeasScreen } from "./agent-ui";
import { AgentWorkList } from "./agent-work-dialog";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { CapabilityHubScreen } from "./capability-hub";
import { ChatScreen, WorkspaceTools } from "./chat";
import { ColumnResizeHandle } from "./column-resize-handle";
import { ComputerScreen } from "./computer";
import { type ThreadHistoryPage, threadHistoryPagePath } from "./conversation-history";
import { columnMaxWidth, desktopColumns } from "./desktop-columns";
import { Details, SettingsScreen } from "./details";
import { useTranslation } from "./i18n";
import { LOCALE_LABELS } from "./i18n/types";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Languages,
  Lightbulb,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from "./icons";
import { IosStack } from "./ios-stack";
import { type BotPreview, botHasUnread, latestBotPreview } from "./mobile-bots";
import { MobileBotsHome } from "./mobile-bots-home";
import { ModalOverlay } from "./modal-overlay";
import { unreadCount } from "./notification-actions";
import { delegatedSectionTitle } from "./plan-card";
import { PreferencesScreen } from "./preferences-screen";
import { BrowserScreen, CalendarScreen, FilesScreen, MailScreen } from "./screens";
import { GlobalSearchSheet } from "./search-sheet";
import { TaskHubScreen } from "./task-hub";
import { breakpoints } from "./theme";
import { Toast, type ToastState } from "./toast";
import {
  Button,
  colors,
  ErrorNotice,
  fonts,
  HoverPressable,
  IconButton,
  radius,
  Sheet,
  s,
  semantic,
  shadow,
  space,
  typography,
} from "./ui";
import { useDesktopColumns } from "./use-desktop-columns";
import { WatchlistHubScreen } from "./watchlist-hub";
import { type ComposerPrompt, type Detail, useWorkspace } from "./workspace";

/** 行尾「更多」按钮的锚点：用窗口坐标把菜单贴在按钮下方，滚出边界也能正常展示。 */
type AgentMenuAnchor = {
  agent: AgentDefinition;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** 菜单行：置顶 / 取消置顶、进入设置、删除。 */
function AgentMenuRow({
  icon: Icon,
  label,
  onPress,
  danger = false,
}: {
  icon: typeof Settings2;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <HoverPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed, hovered }) => ({
        minHeight: 34,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 9,
        paddingVertical: 6,
        borderRadius: radius.badge,
        backgroundColor: pressed
          ? danger
            ? colors.errorSoft
            : colors.overlay2
          : hovered
            ? danger
              ? colors.errorSoft
              : colors.overlay1
            : "transparent",
      })}
    >
      <Icon size={14} strokeWidth={1.7} color={danger ? colors.danger : colors.muted} />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: "500",
          color: danger ? colors.danger : colors.text,
        }}
      >
        {label}
      </Text>
    </HoverPressable>
  );
}

/**
 * Agent 行的操作菜单。
 *
 * 用透明 Modal 承载：左侧栏是可滚动的，行内绝对定位的浮层会被裁掉；
 * 也没有整屏遮罩，点空白处即关闭，接近桌面端的下拉菜单手感。
 */
function AgentMenu({
  anchor,
  onClose,
  onSettings,
  onTogglePin,
  onDelete,
}: {
  anchor: AgentMenuAnchor;
  onClose: () => void;
  onSettings: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const menuWidth = Math.min(160, width - 24);
  const rows = anchor.agent.system ? 1 : 3;
  const menuHeight = 10 + rows * 34 + (anchor.agent.system ? 0 : 7);
  // 默认贴按钮右下方展开；底部空间不够就翻到上方。
  const left = Math.max(12, Math.min(anchor.x + anchor.width - menuWidth, width - menuWidth - 12));
  const below = anchor.y + anchor.height + 6;
  const top = below + menuHeight > height - 12 ? Math.max(12, anchor.y - menuHeight - 6) : below;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ui.closeDetails")}
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <View
          style={{
            position: "absolute",
            top,
            left,
            width: menuWidth,
            padding: 4,
            gap: 1,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.card,
            backgroundColor: colors.paper,
            ...shadow.sheet,
          }}
        >
          {!anchor.agent.system && (
            <AgentMenuRow
              icon={anchor.agent.pinned ? ArrowDown : ArrowUp}
              label={anchor.agent.pinned ? t("agentSpace.unpinAgent") : t("agentSpace.pinAgent")}
              onPress={onTogglePin}
            />
          )}
          <AgentMenuRow icon={Settings2} label={t("details.settingsTitle")} onPress={onSettings} />
          {!anchor.agent.system && (
            <>
              <View style={{ height: 1, marginVertical: 3, backgroundColor: colors.line }} />
              <AgentMenuRow
                danger
                icon={Trash2}
                label={t("agentSpace.deleteAgent")}
                onPress={onDelete}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function AgentListItem({
  agent,
  active,
  preview,
  unread = false,
  detailed = false,
  onPress,
  onOpenMenu,
}: {
  agent: AgentDefinition;
  active: boolean;
  preview?: string;
  unread?: boolean;
  /** 电脑侧栏用手机首页的两行样式。抽屉里的紧凑列表保持单行。 */
  detailed?: boolean;
  onPress: () => void;
  onOpenMenu: (anchor: AgentMenuAnchor) => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const moreRef = useRef<View>(null);
  const openMenu = () => {
    moreRef.current?.measureInWindow((x, y, width, height) => {
      onOpenMenu({ agent, x, y, width, height });
    });
  };
  const label = agent.role ? `${agent.name} · ${agent.role}` : agent.name;
  if (detailed) {
    return (
      <View
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={{
          borderRadius: radius.sheet,
          backgroundColor: active ? colors.sky : hovered ? colors.overlay1 : "transparent",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected: active }}
          onPress={onPress}
          style={{
            minHeight: 68,
            paddingVertical: 10,
            paddingLeft: space.xs,
            paddingRight: space.xl,
            borderRadius: radius.sheet,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <AgentOrb avatar={agent.avatar} size={44} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={1} style={{ ...typography.agentName, color: colors.text }}>
              {label}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontSize: 13, lineHeight: 20, color: colors.muted }}
              >
                {preview || t("agentSpace.noBotMessages")}
              </Text>
              {unread && !hovered && (
                <View
                  accessibilityLabel={t("agentSpace.newNotifications")}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: radius.full,
                    backgroundColor: colors.primary,
                  }}
                />
              )}
            </View>
          </View>
        </Pressable>
        <Pressable
          ref={moreRef}
          accessibilityRole="button"
          accessibilityLabel={t("ui.moreActions")}
          accessibilityHint={agent.name}
          hitSlop={4}
          pointerEvents={hovered ? "auto" : "none"}
          onPress={openMenu}
          style={({ pressed }) => ({
            position: "absolute",
            top: 10,
            right: space.md,
            width: 26,
            height: 26,
            borderRadius: radius.badge,
            alignItems: "center",
            justifyContent: "center",
            opacity: hovered ? 1 : 0,
            backgroundColor: pressed ? colors.overlay2 : "transparent",
          })}
        >
          <MoreHorizontal
            size={16}
            strokeWidth={1.8}
            color={active || hovered ? colors.muted : colors.faint}
          />
        </Pressable>
      </View>
    );
  }
  return (
    <View
      // 整行悬停底色：让「切换对话」与右侧「更多」读起来是同一行。
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderRadius: radius.control,
        backgroundColor: active ? colors.sky : hovered ? colors.overlay1 : "transparent",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={agent.name}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1,
          minWidth: 0,
          minHeight: 44,
          paddingLeft: 9,
          paddingRight: 4,
          paddingVertical: 5,
          borderRadius: radius.control,
          backgroundColor: pressed ? colors.overlay1 : "transparent",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        })}
      >
        <AgentOrb avatar={agent.avatar} size={30} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 13,
              lineHeight: 17,
              fontWeight: active ? "600" : "500",
              color: active ? colors.primaryStrong : colors.text,
            }}
          >
            {agent.name}
          </Text>
        </View>
      </Pressable>
      <Pressable
        ref={moreRef}
        accessibilityRole="button"
        accessibilityLabel={t("ui.moreActions")}
        accessibilityHint={agent.name}
        hitSlop={4}
        onPress={openMenu}
        style={({ pressed }) => ({
          width: 26,
          height: 26,
          marginRight: 4,
          borderRadius: radius.badge,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? colors.overlay2 : "transparent",
        })}
      >
        <MoreHorizontal
          size={16}
          strokeWidth={1.8}
          color={active || hovered ? colors.muted : colors.faint}
        />
      </Pressable>
    </View>
  );
}

function AccountMenuRow({
  icon: Icon,
  title,
  detail,
  onPress,
}: {
  icon: typeof Settings2;
  title: string;
  detail?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 40,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: radius.control,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: pressed ? colors.overlay1 : "transparent",
      })}
    >
      <View
        style={{
          width: 30,
          height: 30,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          backgroundColor: colors.surfaceSoft,
        }}
      >
        <Icon size={16} color={colors.text} strokeWidth={1.7} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: "500", color: colors.text }}>{title}</Text>
        {!!detail && (
          <Text numberOfLines={1} style={[s.small, { fontSize: 10, lineHeight: 15 }]}>
            {detail}
          </Text>
        )}
      </View>
      <ChevronRight size={14} color={colors.faint} />
    </Pressable>
  );
}

/**
 * 语言项：点击后在行右侧（抽屉里为下方）浮出语言小窗，选中即刻生效，
 * 不再跳转到设置里的语言子页面；悬停不展开、也不给悬停底色。
 */
function LanguageMenuRow({ compact }: { compact: boolean }) {
  const { locale, locales, setLocale, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = LOCALE_LABELS[locale];

  return (
    <View style={{ zIndex: 20 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.language")}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => ({
          minHeight: 40,
          paddingHorizontal: 8,
          paddingVertical: 6,
          borderRadius: radius.control,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: pressed ? colors.overlay1 : "transparent",
        })}
      >
        <View
          style={{
            width: 30,
            height: 30,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            backgroundColor: colors.surfaceSoft,
          }}
        >
          <Languages size={16} color={colors.text} strokeWidth={1.7} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13, fontWeight: "500", color: colors.text }}>
            {t("common.language")}
          </Text>
          <Text numberOfLines={1} style={[s.small, { fontSize: 10, lineHeight: 15 }]}>
            {current.native}
          </Text>
        </View>
        <ChevronRight size={14} color={colors.faint} />
      </Pressable>
      {open && (
        <View
          style={{
            position: "absolute",
            // 桌面窄栏时菜单左侧还有横向空间，小窗贴在行右侧浮出，避免遮住下面的设置项；
            // 抽屉里空间不足，改为覆盖在下方选项上。
            ...(compact ? { top: 44, left: 6 } : { top: 0, left: "100%" as const }),
            width: 160,
            padding: 4,
            gap: 1,
            zIndex: 30,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.card,
            backgroundColor: colors.paper,
            ...shadow.sheet,
          }}
        >
          {locales.map((item) => {
            const meta = LOCALE_LABELS[item];
            const selected = item === locale;
            return (
              <HoverPressable
                key={item}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={meta.english}
                onPress={() => {
                  setLocale(item);
                  setOpen(false);
                }}
                style={({ pressed, hovered }) => ({
                  minHeight: 32,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 9,
                  paddingVertical: 6,
                  borderRadius: radius.badge,
                  backgroundColor: selected
                    ? colors.sky
                    : pressed
                      ? colors.overlay2
                      : hovered
                        ? colors.overlay1
                        : "transparent",
                })}
              >
                <Text
                  style={{
                    flex: 1,
                    fontSize: 12,
                    fontWeight: selected ? "600" : "500",
                    color: colors.text,
                  }}
                >
                  {meta.native}
                </Text>
                {selected && <Check size={13} color={colors.primary} />}
              </HoverPressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function AccountMenu({
  name,
  email,
  avatarUrl,
  compact,
  anchor,
  onClose,
  onProfile,
  onSettings,
  onSignOut,
}: {
  name: string;
  email: string;
  avatarUrl?: string;
  compact: boolean;
  /** 手机首页把头像菜单贴在左上角圆钮下方。不传时仍贴在底栏头像上方。 */
  anchor?: { top: number; left: number };
  onClose: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const menuWidth = Math.min(compact ? 300 : 286, width - 32);
  return (
    <ModalOverlay transition="fade" backdrop="subtle" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ui.closeDetails")}
          onPress={onClose}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }}
        />
        <View
          testID="account-menu"
          accessibilityViewIsModal
          style={{
            position: "absolute",
            ...(anchor
              ? { top: anchor.top, left: anchor.left }
              : { left: compact ? 16 : 14, bottom: compact ? 72 : 58 }),
            width: menuWidth,
            padding: 6,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.card,
            backgroundColor: colors.paper,
            ...shadow.sheet,
          }}
        >
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 9,
              flexDirection: "row",
              alignItems: "center",
              gap: 11,
            }}
          >
            <AccountAvatar avatarUrl={avatarUrl} name={name} size={40} borderRadius={999} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
              >
                {name}
              </Text>
              <Text numberOfLines={1} style={[s.small, { fontSize: 10, lineHeight: 15 }]}>
                {email || t("app.profileUnset")}
              </Text>
            </View>
          </View>
          <View style={{ height: 1, marginVertical: 6, backgroundColor: colors.line }} />
          <AccountMenuRow
            icon={CircleUserRound}
            title={t("app.profileDetails")}
            onPress={onProfile}
          />
          <LanguageMenuRow compact={compact} />
          <AccountMenuRow
            icon={Settings2}
            title={t("details.settingsTitle")}
            onPress={onSettings}
          />
          <View style={{ height: 1, marginVertical: 6, backgroundColor: colors.line }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("app.signOutLabel")}
            onPress={onSignOut}
            style={({ pressed }) => ({
              minHeight: 40,
              paddingHorizontal: 8,
              borderRadius: radius.control,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: pressed ? colors.errorSoft : "transparent",
            })}
          >
            <LogOut size={16} color={colors.danger} strokeWidth={1.7} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: colors.danger }}>
              {t("app.signOutLabel")}
            </Text>
          </Pressable>
        </View>
      </View>
    </ModalOverlay>
  );
}

function AgentRail({
  onOpen,
  onSearch,
  onSignOut,
  onClose,
  compact = false,
}: {
  onOpen: (panel: AgentPanel) => void;
  onSearch: () => void;
  onSignOut: () => void;
  onClose?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  /** 待删除的 Agent：菜单里点删除后弹出确认弹窗，确认才真正移除。 */
  const [pendingDelete, setPendingDelete] = useState<AgentDefinition>();
  const [menuAnchor, setMenuAnchor] = useState<AgentMenuAnchor>();
  const { agents, current, selectAgent, deleteAgent, setAgentPinned } = useAgentSpace();
  // 排序规则：系统内置默认 Agent 永远置顶 → 用户置顶的 → 其余（同组内保持创建顺序）。
  const orderedAgents = useMemo(
    () =>
      [...agents].sort((a, b) => {
        if (a.system !== b.system) return a.system ? -1 : 1;
        const pinnedDiff = Number(!!b.pinned) - Number(!!a.pinned);
        if (pinnedDiff !== 0) return pinnedDiff;
        return 0;
      }),
    [agents],
  );
  // 列表分块：置顶区（系统默认 + 用户置顶）用底色区分于普通区。
  const { pinnedAgents, restAgents } = useMemo(() => {
    const pinned: AgentDefinition[] = [];
    const rest: AgentDefinition[] = [];
    for (const agent of orderedAgents) {
      (agent.system || agent.pinned ? pinned : rest).push(agent);
    }
    return { pinnedAgents: pinned, restAgents: rest };
  }, [orderedAgents]);
  const { navigate, open, workspace, api } = useWorkspace();
  const [previews, setPreviews] = useState<Record<string, BotPreview | null>>({});
  const agentKey = agents.map((agent) => agent.id).join("|");
  useEffect(() => {
    if (compact) return;
    let alive = true;
    for (const agent of agents) {
      void api
        .request<ThreadHistoryPage>(threadHistoryPagePath(agent.threadId))
        .then((page) => {
          if (!alive) return;
          setPreviews((current) => ({
            ...current,
            [agent.id]: latestBotPreview(page.messages),
          }));
        })
        .catch(() => {
          if (!alive) return;
          setPreviews((current) => ({ ...current, [agent.id]: null }));
        });
    }
    return () => {
      alive = false;
    };
  }, [api, agentKey, compact]);
  const { data: agentData } = useAgentWorkspace();
  const unreadNotifications = unreadCount(agentData?.notifications);
  const accountNickname = workspace.profile.name.trim() || t("agentSpace.account");
  const choose = (agent: AgentDefinition) => {
    selectAgent(agent.id);
    navigate("chat");
    onClose?.();
  };
  /** 进入某个 Agent 的设置页：先切换 current，设置页才读得到它。 */
  const openAgentSettings = (agent: AgentDefinition) => {
    selectAgent(agent.id);
    navigate("agent");
    onClose?.();
  };
  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        paddingHorizontal: compact ? 20 : 14,
        paddingTop: compact ? 44 : 18,
        paddingBottom: compact ? 14 : 18,
        borderRightWidth: compact ? 0 : 1,
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
            style={{ width: 28, height: 28, flexShrink: 0 }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 17,
                lineHeight: 26,
                fontWeight: "600",
                letterSpacing: 1.6,
                fontFamily: fonts.serif,
              }}
            >
              {t("common.agentName")}
            </Text>
          </View>
        </Pressable>
        <HoverPressable
          accessibilityRole="button"
          accessibilityLabel={t("app.notificationsLabel", { count: unreadNotifications })}
          onPress={() => {
            onClose?.();
            open({ type: "notifications" });
          }}
          style={({ pressed, hovered }) => ({
            width: 34,
            height: 34,
            borderRadius: radius.control,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? colors.overlay3 : hovered ? colors.overlay2 : "transparent",
          })}
        >
          <View>
            <Bell size={16} strokeWidth={1.7} color={colors.muted} />
            {unreadNotifications > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: colors.primary,
                }}
              />
            )}
          </View>
        </HoverPressable>
        <IconButton
          icon={Search}
          label={t("search.title")}
          onPress={() => {
            onClose?.();
            onSearch();
          }}
        />
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
        style={{ flex: 1, marginTop: 18 }}
        contentContainerStyle={{ gap: 4, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {pinnedAgents.length > 0 && (
          <View
            style={{
              gap: 2,
              ...(compact
                ? {
                    padding: 4,
                    borderRadius: radius.control,
                    backgroundColor: colors.overlay1,
                  }
                : null),
            }}
          >
            {pinnedAgents.map((agent) => (
              <AgentListItem
                key={agent.id}
                agent={agent}
                active={agent.id === current.id}
                detailed={!compact}
                preview={previews[agent.id]?.text}
                unread={botHasUnread(
                  agent.threadId,
                  agent.system,
                  agentData?.tasks ?? [],
                  agentData?.notifications ?? [],
                )}
                onPress={() => choose(agent)}
                onOpenMenu={setMenuAnchor}
              />
            ))}
          </View>
        )}
        {restAgents.map((agent) => (
          <AgentListItem
            key={agent.id}
            agent={agent}
            active={agent.id === current.id}
            detailed={!compact}
            preview={previews[agent.id]?.text}
            unread={botHasUnread(
              agent.threadId,
              agent.system,
              agentData?.tasks ?? [],
              agentData?.notifications ?? [],
            )}
            onPress={() => choose(agent)}
            onOpenMenu={setMenuAnchor}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpen("create")}
          style={({ pressed }) => ({
            minHeight: 40,
            paddingLeft: compact ? 9 : space.xs,
            paddingRight: compact ? 9 : space.sm,
            borderRadius: radius.control,
            backgroundColor: pressed ? colors.overlay1 : "transparent",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 2,
          })}
        >
          <Plus size={16} color={colors.primaryStrong} />
          <Text style={{ fontSize: 12, color: colors.primaryStrong, fontWeight: "500" }}>
            {t("agentSpace.createAgent")}
          </Text>
        </Pressable>
      </ScrollView>
      {compact ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <HoverPressable
            accessibilityRole="button"
            accessibilityLabel={t("agentSpace.personalCenter")}
            onPress={() => setAccountMenuOpen(true)}
            style={({ pressed, hovered }) => ({
              flex: 1,
              minWidth: 0,
              paddingVertical: 8,
              paddingLeft: 6,
              paddingRight: 4,
              borderRadius: radius.control,
              backgroundColor: pressed
                ? colors.overlay3
                : hovered
                  ? colors.overlay2
                  : "transparent",
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
            })}
          >
            <AccountAvatar
              avatarUrl={workspace.profile.avatarUrl}
              name={accountNickname}
              size={30}
              borderRadius={8}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.text, { fontSize: 12, fontWeight: "500" }]}>{accountNickname}</Text>
              <Text style={[s.small, { fontSize: 9, color: colors.faint }]}>
                {t("agentSpace.account")}
              </Text>
            </View>
          </HoverPressable>
          <HoverPressable
            accessibilityRole="button"
            accessibilityLabel={t("app.settingsLabel")}
            onPress={() => {
              onClose?.();
              navigate("settings");
            }}
            style={({ pressed, hovered }) => ({
              width: 36,
              height: 36,
              borderRadius: radius.control,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed
                ? colors.overlay3
                : hovered
                  ? colors.overlay2
                  : "transparent",
            })}
          >
            <Settings2 size={17} strokeWidth={1.7} color={colors.muted} />
          </HoverPressable>
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <HoverPressable
            testID="account-avatar-button"
            accessibilityRole="button"
            accessibilityLabel={t("agentSpace.personalCenter")}
            onPress={() => setAccountMenuOpen(true)}
            style={({ pressed, hovered }) => ({
              width: 32,
              height: 32,
              borderRadius: radius.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed
                ? colors.overlay2
                : hovered
                  ? colors.overlay1
                  : "transparent",
            })}
          >
            <AccountAvatar
              avatarUrl={workspace.profile.avatarUrl}
              name={accountNickname}
              size={32}
              borderRadius={radius.full}
            />
          </HoverPressable>
          <HoverPressable
            testID="skills-connections-entry"
            accessibilityRole="button"
            accessibilityLabel={t("app.navApps")}
            onPress={() => {
              onClose?.();
              navigate("apps");
            }}
            style={({ pressed, hovered }) => ({
              flex: 1,
              minHeight: 32,
              paddingHorizontal: space.sm,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: colors.line,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? colors.overlay2 : hovered ? colors.overlay1 : colors.paper,
            })}
          >
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
              {t("app.navApps")}
            </Text>
          </HoverPressable>
        </View>
      )}
      {accountMenuOpen && (
        <AccountMenu
          name={accountNickname}
          email={workspace.profile.email}
          avatarUrl={workspace.profile.avatarUrl}
          compact={compact}
          onClose={() => setAccountMenuOpen(false)}
          onProfile={() => {
            setAccountMenuOpen(false);
            onClose?.();
            navigate("account");
          }}
          onSettings={() => {
            setAccountMenuOpen(false);
            onClose?.();
            navigate("settings");
          }}
          onSignOut={() => {
            setAccountMenuOpen(false);
            onClose?.();
            onSignOut();
          }}
        />
      )}
      {menuAnchor && (
        <AgentMenu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(undefined)}
          onSettings={() => {
            const target = menuAnchor.agent;
            setMenuAnchor(undefined);
            openAgentSettings(target);
          }}
          onTogglePin={() => {
            setAgentPinned(menuAnchor.agent.id, !menuAnchor.agent.pinned);
            setMenuAnchor(undefined);
          }}
          onDelete={() => {
            setPendingDelete(menuAnchor.agent);
            setMenuAnchor(undefined);
          }}
        />
      )}
      {/* 删除 Agent 确认弹窗：不可恢复，需用户显式确认。 */}
      {pendingDelete && (
        <ModalOverlay visible onRequestClose={() => setPendingDelete(undefined)}>
          <Pressable onPress={() => setPendingDelete(undefined)} style={s.modalShade}>
            <Pressable
              accessibilityViewIsModal
              onPress={(event) => event.stopPropagation()}
              style={[s.card, { maxWidth: 360, width: "100%", padding: 22, gap: 10 }]}
            >
              <Text style={s.heading}>{t("agentSpace.deleteConfirmTitle")}</Text>
              <Text style={s.muted}>{t("agentSpace.deleteAgentNote")}</Text>
              <View style={[s.row, { gap: 10, marginTop: 8 }]}>
                <Button
                  style={{ flex: 1, minHeight: 44 }}
                  onPress={() => setPendingDelete(undefined)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  danger
                  style={{ flex: 1, minHeight: 44 }}
                  onPress={() => {
                    deleteAgent(pendingDelete.id);
                    setPendingDelete(undefined);
                  }}
                >
                  {t("agentSpace.deleteConfirmAction")}
                </Button>
              </View>
            </Pressable>
          </Pressable>
        </ModalOverlay>
      )}
    </View>
  );
}

/** 展开后的关闭按钮：圆形描边，只有一个关闭图形。 */
function RailCloseButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <HoverPressable
      testID="agent-rail-close"
      accessibilityRole="button"
      accessibilityLabel={t("agentSpace.closeRail")}
      onPress={onPress}
      style={({ pressed, hovered }) => ({
        width: 32,
        height: 32,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: semantic.controlBorder,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.overlay2 : hovered ? colors.surface : colors.paper,
      })}
    >
      <X size={15} color={colors.muted} />
    </HoverPressable>
  );
}

function RailIdentity({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation();
  const { current } = useAgentSpace();
  const [hovered, setHovered] = useState(false);
  const label = current.role ? `${current.name} · ${current.role}` : current.name;
  return (
    <View
      style={{ width: "100%", alignItems: "center", paddingTop: 6, paddingBottom: 20, gap: 12 }}
    >
      <View style={{ width: "100%", alignItems: "center" }}>
        <HoverPressable
          testID="agent-rail-avatar"
          accessibilityRole="button"
          accessibilityLabel={t("agentSpace.editAvatar")}
          onPress={onEdit}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          style={({ pressed }) => ({
            borderRadius: radius.full,
            opacity: pressed ? 0.88 : 1,
          })}
        >
          <AgentOrb avatar={current.avatar} size={72} editing={hovered} />
        </HoverPressable>
        {hovered && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 62,
              left: 0,
              right: 0,
              zIndex: 3,
              alignItems: "center",
            }}
          >
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: colors.lineSoft,
                backgroundColor: colors.paper,
                ...shadow.card,
              }}
            >
              <Text style={{ fontSize: 12, lineHeight: 18, color: colors.text }}>
                {t("agentSpace.editAvatar")}
              </Text>
            </View>
          </View>
        )}
      </View>
      <Text
        style={{
          ...typography.agentName,
          textAlign: "center",
          paddingHorizontal: 28,
          color: colors.text,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function CapabilityRail({
  onOpen,
  onCollapse,
  onOpenAgentSkills,
  onNavigateAway,
  page = false,
}: {
  onOpen: (panel: AgentPanel) => void;
  onCollapse?: () => void;
  onOpenAgentSkills: () => void;
  /** 从全屏页跳走之前先把它收起来。 */
  onNavigateAway?: () => void;
  /** 手机全屏页：去掉左描边，关闭交给页眉的返回。 */
  page?: boolean;
}) {
  const { t } = useTranslation();
  const { navigate } = useWorkspace();
  const [inspectSkillId, setInspectSkillId] = useState<string | null>(null);
  const leave = () => onNavigateAway?.();
  const editAgent = () => {
    leave();
    navigate("agent");
  };
  return (
    <>
      <View
        testID="agent-rail"
        style={{
          flex: 1,
          minHeight: 0,
          backgroundColor: colors.surfaceRaised,
          borderLeftWidth: page ? 0 : 1,
          borderLeftColor: colors.line,
        }}
      >
        {onCollapse && (
          <View style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }}>
            <RailCloseButton onPress={onCollapse} />
          </View>
        )}
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: page ? 20 : 14,
            paddingTop: 20,
            paddingBottom: 24,
          }}
        >
          <RailIdentity onEdit={editAgent} />
          <Text
            style={{
              ...delegatedSectionTitle,
              paddingHorizontal: 6,
            }}
          >
            {t("agentSpace.delegatedWork")}
          </Text>
          <View testID="agent-rail-tasks" style={{ marginTop: 10 }}>
            <AgentWorkList />
          </View>
          <View testID="agent-rail-more-tasks" style={{ marginTop: 12 }}>
            <Button
              variant="outline"
              style={{ alignSelf: "stretch" }}
              onPress={() => onOpen("tasks")}
            >
              {t("agentSpace.moreDelegated")}
            </Button>
          </View>
          <Text
            style={{
              marginTop: 26,
              marginBottom: 14,
              paddingHorizontal: 6,
              fontSize: 15,
              fontFamily: fonts.serif,
              fontWeight: "600",
              color: colors.text,
            }}
          >
            {t("agentSpace.more")}
          </Text>
          <AgentMoreContent
            onPanel={onOpen}
            compact={false}
            onInspectSkill={setInspectSkillId}
            onOpenApps={() => {
              leave();
              navigate("apps");
            }}
            onOpenAgentSkills={() => {
              leave();
              onOpenAgentSkills();
            }}
          />
        </ScrollView>
      </View>
      {inspectSkillId && (
        <AgentSkillInspectSheet skillId={inspectSkillId} onClose={() => setInspectSkillId(null)} />
      )}
    </>
  );
}

function AgentHeader({
  onMenu,
  onIdentity,
  onBack,
  persistentNavigation = false,
  railCollapsed = false,
  onExpandRail,
}: {
  onMenu: () => void;
  onIdentity: () => void;
  /** 手机 bot 页返回 bots 首页。电脑版不传。 */
  onBack?: () => void;
  persistentNavigation?: boolean;
  /** 右侧栏收起后，非对话页没有悬浮头像，用同一颗头像把栏展开。 */
  railCollapsed?: boolean;
  onExpandRail?: () => void;
}) {
  const { t } = useTranslation();
  const { current } = useAgentSpace();
  const { section, back } = useWorkspace();
  const { width } = useWindowDimensions();
  // 与页面正文同一条判定：< mobile 用窄边距，其余用桌面边距。
  const stacked = width < breakpoints.mobile;
  if (section === "chat")
    return (
      <AgentFloatingHeader
        name={current.name}
        role={current.role}
        avatar={current.avatar}
        persistentNavigation={persistentNavigation}
        onMenu={onMenu}
        onBack={onBack}
        onIdentity={onIdentity}
      />
    );
  const sectionTitle =
    section === "agent"
      ? t("agentSpace.agentDetails")
      : section === "account"
        ? t("app.titleAccount")
        : section === "memories"
          ? t("app.titleMemories")
          : section === "files"
            ? t("app.navFiles")
            : section === "notes"
              ? t("app.titleNotes")
              : section === "watchlist" || section === "portfolio"
                ? t("app.navWatchlist")
                : section === "ideas"
                  ? t("agentSpace.openIdeasPage")
                  : section === "activity" || section === "goals"
                    ? t("app.navActivity")
                    : section === "mail"
                      ? t("app.titleMail")
                      : section === "calendar"
                        ? t("app.titleCalendar")
                        : section === "browser"
                          ? t("app.titleBrowser")
                          : section === "computer"
                            ? t("threads.agentComputer")
                            : section === "apps" || section === "connections"
                              ? t("app.titleApps")
                              : section === "settings"
                                ? t("details.settingsTitle")
                                : t("app.navChat");
  return (
    <View
      style={{
        height: stacked ? agentLayout.headerHeight : 64,
        width: "100%",
        // 与二级页正文共用同一列宽与内距：主列变宽/变窄时两者同步，
        // 返回按钮始终贴住正文左边缘，标题也始终居中在正文列上。
        maxWidth: agentLayout.pageMaxWidth,
        alignSelf: "center",
        paddingHorizontal: stacked ? space.pageMobile : space.page,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.canvas,
      }}
    >
      <View style={{ width: 40 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          onPress={onBack ?? back}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: radius.control,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? colors.overlay1 : "transparent",
          })}
        >
          <ChevronLeft size={18} color={colors.muted} />
        </Pressable>
      </View>
      <View style={{ flex: 1, alignItems: "center" }}>
        <Text style={[typography.heading, { fontSize: 15 }]}>{sectionTitle}</Text>
      </View>
      <View style={{ width: 40, alignItems: "flex-end" }}>
        {railCollapsed && onExpandRail && (
          <Pressable
            testID="agent-rail-expand-avatar"
            accessibilityRole="button"
            accessibilityLabel={t("agentSpace.expandRail")}
            onPress={onExpandRail}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: radius.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? colors.overlay1 : "transparent",
            })}
          >
            <AgentOrb avatar={current.avatar} size={28} />
          </Pressable>
        )}
      </View>
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
  const { width } = useWindowDimensions();
  const stacked = width < breakpoints.mobile;
  const content = (() => {
    switch (section) {
      case "account":
        // 「称呼与投资偏好」= PreferencesSheet（称呼 / 投资风格 / 投资时间 / 关注方向），
        // 不是 memories 分区的记忆页；入口挂在 onOpenPreferences 上，不传整块不渲染。
        return (
          <AccountScreen onSignOut={onSignOut} onOpenPreferences={() => onOpen("preferences")} />
        );
      case "memories":
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
      case "settings":
        return <SettingsScreen />;
      case "mail":
        return <MailScreen />;
      case "calendar":
        return <CalendarScreen />;
      case "browser":
        return <BrowserScreen />;
      case "computer":
        return <ComputerScreen />;
      case "ideas":
        return <IdeasScreen />;
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
        // 与 AgentHeader 共用 agentLayout.pageMaxWidth 与同一套横向内距，
        // 顶栏的返回按钮才会与正文左边缘对齐。
        maxWidth: agentLayout.pageMaxWidth,
        alignSelf: "center",
        paddingHorizontal: stacked ? space.pageMobile : space.page,
        paddingTop: 20,
        paddingBottom: 48,
      }}
    >
      {content}
    </ScrollView>
  );
}

function IdeasOverlay({ onClose }: { onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const { t } = useTranslation();
  const desktop = width >= breakpoints.desktop;
  const panelWidth = Math.min(1180, Math.floor(width * (desktop ? 0.8 : 0.92)));
  const panelHeight = Math.min(900, Math.floor(height * (desktop ? 0.8 : 0.9)));
  return (
    <ModalOverlay transition="fade" backdrop="subtle" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: desktop ? 24 : 12,
        }}
      >
        <View
          style={{
            width: panelWidth,
            height: panelHeight,
            maxWidth: "100%",
            maxHeight: "100%",
            overflow: "hidden",
            borderRadius: radius.sheet,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.canvas,
            ...shadow.sheet,
          }}
        >
          <View
            style={{
              height: 54,
              flexShrink: 0,
              paddingHorizontal: 18,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
              backgroundColor: colors.paper,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: radius.control,
                backgroundColor: colors.sky,
              }}
            >
              <Lightbulb size={17} color={colors.primary} />
            </View>
            <Text style={[typography.heading, { flex: 1, fontSize: 16 }]}>
              {t("agentSpace.openIdeasPage")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("ui.closeDetails")}
              onPress={onClose}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: radius.full,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? colors.overlay1 : "transparent",
              })}
            >
              <X size={18} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: desktop ? 26 : 18,
              paddingTop: 22,
              paddingBottom: 34,
            }}
          >
            <IdeasScreen onUsePrompt={onClose} />
          </ScrollView>
        </View>
      </View>
    </ModalOverlay>
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
  prompt?: ComposerPrompt;
  onSignOut: () => void;
}) {
  const { width } = useWindowDimensions();
  const desktop = width >= breakpoints.desktop;
  const [containerWidth, setContainerWidth] = useState(width);
  const availableWidth = Math.floor(Math.min(width, containerWidth));
  const threeColumns = Platform.OS === "web" && availableWidth >= desktopColumns.breakpoint;
  const {
    widths: columnWidths,
    resize: resizeColumn,
    railCollapsed,
    toggleRail,
    expandRail,
  } = useDesktopColumns(availableWidth);
  const { t } = useTranslation();
  const { section, close, back, reminderIntent, navigate, open, workspace } = useWorkspace();
  const insets = useSafeAreaInsets();
  const [mobileAccountMenu, setMobileAccountMenu] = useState(false);
  const {
    agents,
    current,
    selectAgent,
    preferences,
    selection,
    loading,
    needsOnboarding,
    markThreadUsed,
  } = useAgentSpace();
  const [panelStack, setPanelStack] = useState<AgentPanel[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [appsSheet, setAppsSheet] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const panel = panelStack.at(-1);
  const closePanel = useCallback(() => setPanelStack((stack) => stack.slice(0, -1)), []);
  const dismissPanels = useCallback(() => setPanelStack([]), []);
  const pushPanel = useCallback(
    (next: AgentPanel) =>
      setPanelStack((stack) => (stack.at(-1) === next ? stack : [...stack, next])),
    [],
  );
  const [drawer, setDrawer] = useState<"agents" | null>(null);
  const [sidePage, setSidePage] = useState(false);
  const phone = width < breakpoints.mobile;
  const [botOpen, setBotOpen] = useState(false);
  // 「解锁更多的能力」跳转到 Agent 详情时携带的分区意图：让详情页直接定位到「技能」。
  // 需要在页面可能已挂载的情况下响应，因此交给 AgentSettingsScreen 用 effect 消费后清除。
  const [agentTabIntent, setAgentTabIntent] = useState<AgentSettingsTab | null>(null);
  const [mountedIds, setMountedIds] = useState<string[]>([current.id]);

  useEffect(() => {
    setMountedIds((ids) => (ids.includes(current.id) ? ids : [...ids, current.id]));
  }, [current.id]);

  useEffect(() => {
    if (threeColumns) {
      setDrawer(null);
      setSidePage(false);
    }
  }, [threeColumns]);

  useEffect(() => {
    if (!reminderIntent) return;
    setPanelStack([]);
    setDrawer(null);
  }, [reminderIntent]);

  // 预填意图代表「回到对话框」：先收起 Agent 弹层、抽屉和浮层，
  // 否则资料/自选等面板会继续盖在对话页上，看起来像没有跳转。
  useEffect(() => {
    if (!prompt?.draft) return;
    setPanelStack([]);
    setDrawer(null);
    setSidePage(false);
    setSearchOpen(false);
    setIdeasOpen(false);
    setAppsSheet(false);
  }, [prompt]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Each Modal owns Escape, including nested resource editors.
      if (panel) return;
      else if (sidePage) setSidePage(false);
      else if (drawer) setDrawer(null);
      else if (detail) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, detail, drawer, panel, sidePage]);

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

  // 「解锁更多的能力」：收起浮层/抽屉，进入当前 Agent 详情设置的「技能」分区。
  // navigate 对相同 Section 是无操作的，桌面端已停留在详情页时只更新分区意图。
  const popTop = useCallback(() => {
    if (sidePage) {
      setSidePage(false);
      return true;
    }
    if (section !== "chat") {
      back();
      return true;
    }
    if (botOpen) {
      setBotOpen(false);
      return true;
    }
    return false;
  }, [back, botOpen, section, sidePage]);
  const requestPop = useCallback(() => {
    if (
      Platform.OS === "web" &&
      typeof history !== "undefined" &&
      (history.state as { lingwuMobile?: number } | null)?.lingwuMobile &&
      ((history.state as { lingwuMobile?: number }).lingwuMobile ?? 1) > 1
    ) {
      history.back();
      return;
    }
    popTop();
  }, [popTop]);
  const mobileDepth = 1 + (botOpen ? 1 : 0) + (section !== "chat" ? 1 : 0) + (sidePage ? 1 : 0);
  const depthRef = useRef(mobileDepth);
  const historyPop = useRef(false);
  useEffect(() => {
    if (!phone || Platform.OS !== "web") return;
    const state = history.state as { lingwuMobile?: number } | null;
    if (!state?.lingwuMobile) history.replaceState({ lingwuMobile: 1 }, "");
    const onPopState = () => {
      historyPop.current = true;
      if (!popTop()) historyPop.current = false;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [phone, popTop]);
  useEffect(() => {
    if (!phone || Platform.OS !== "web") return;
    if (historyPop.current) {
      historyPop.current = false;
      depthRef.current = mobileDepth;
      return;
    }
    if (mobileDepth > depthRef.current) history.pushState({ lingwuMobile: mobileDepth }, "");
    depthRef.current = mobileDepth;
  }, [mobileDepth, phone]);
  const openAgentSkills = useCallback(() => {
    setDrawer(null);
    setPanelStack([]);
    setAgentTabIntent("skills");
    navigate("agent");
  }, [navigate]);

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

  const chatPane = (
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
                tone: agent.tone,
                communication: agent.communication,
                instructions: agent.instructions,
                userPreferences: onboardingPreferenceContext(preferences),
              }}
              firstRunWelcome={agent.system ? firstRunWelcome : undefined}
              emptyEyebrow={t("agentSpace.welcomeEyebrow")}
              emptyTitleLead={t("agentSpace.welcomeTitle")}
              emptyTitleTail={t("agentSpace.welcomeTail")}
              emptySubtitle={null}
              composerPlaceholder={t("agentSpace.composer", {
                name: agent.name,
              })}
              showIdeasShortcut
              onOpenIdeas={() => setIdeasOpen(true)}
              onThreadUsed={() => markThreadUsed(agent.id)}
            />
          </View>
        );
      })}
    </>
  );
  const sectionPane =
    section === "agent" ? (
      <AgentSettingsScreen
        tabIntent={agentTabIntent}
        onTabIntentConsumed={() => setAgentTabIntent(null)}
      />
    ) : (
      <SecondarySection onOpen={openPanel} onSignOut={onSignOut} />
    );
  const framedPage = (pane: React.ReactNode) => (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.canvas }}>
      <AgentHeader
        onMenu={() => setDrawer("agents")}
        onBack={phone ? requestPop : undefined}
        onIdentity={() => (threeColumns ? expandRail() : setSidePage(true))}
        persistentNavigation={threeColumns}
        railCollapsed={threeColumns && railCollapsed}
        onExpandRail={expandRail}
      />
      <View style={{ flex: 1, minHeight: 0 }}>{pane}</View>
    </View>
  );

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
                <AgentRail
                  onOpen={openPanel}
                  onSearch={() => setSearchOpen(true)}
                  onSignOut={onSignOut}
                />
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
            {phone ? (
              <IosStack
                onPop={requestPop}
                screens={[
                  {
                    id: "bots",
                    node: (
                      <MobileBotsHome
                        onOpenBot={(agent) => {
                          selectAgent(agent.id);
                          setBotOpen(true);
                        }}
                        onCreate={() => openPanel("create")}
                        onAccount={() => setMobileAccountMenu(true)}
                        onNotifications={() => open({ type: "notifications" })}
                        onConnections={() => setAppsSheet(true)}
                      />
                    ),
                  },
                  ...(botOpen ? [{ id: "bot", node: framedPage(chatPane) }] : []),
                  ...(section !== "chat"
                    ? [{ id: `section-${section}`, node: framedPage(sectionPane) }]
                    : []),
                  ...(sidePage
                    ? [
                        {
                          id: "side",
                          node: (
                            <View
                              testID="agent-side-page"
                              style={{ flex: 1, backgroundColor: colors.canvas }}
                            >
                              <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
                                <View
                                  style={{
                                    height: 52,
                                    paddingHorizontal: 12,
                                    flexDirection: "row",
                                    alignItems: "center",
                                  }}
                                >
                                  <Pressable
                                    testID="agent-side-back"
                                    accessibilityRole="button"
                                    accessibilityLabel={t("common.back")}
                                    onPress={requestPop}
                                    style={({ pressed }) => ({
                                      width: 36,
                                      height: 36,
                                      borderRadius: radius.full,
                                      alignItems: "center",
                                      justifyContent: "center",
                                      backgroundColor: pressed ? colors.overlay1 : "transparent",
                                    })}
                                  >
                                    <ChevronLeft size={18} color={colors.muted} />
                                  </Pressable>
                                </View>
                                <CapabilityRail
                                  page
                                  onOpen={openPanel}
                                  onNavigateAway={() => setSidePage(false)}
                                  onOpenAgentSkills={openAgentSkills}
                                />
                              </SafeAreaView>
                            </View>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            ) : (
              <>
                <AgentHeader
                  onMenu={() => setDrawer("agents")}
                  onIdentity={() => (threeColumns ? expandRail() : setSidePage(true))}
                  persistentNavigation={threeColumns}
                  railCollapsed={threeColumns && railCollapsed}
                  onExpandRail={expandRail}
                />
                <View style={{ flex: 1, minHeight: 0 }}>
                  {section === "chat" ? chatPane : sectionPane}
                </View>
              </>
            )}
          </View>
          {threeColumns && !railCollapsed && (
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
                <CapabilityRail
                  onOpen={openPanel}
                  onCollapse={toggleRail}
                  onOpenAgentSkills={openAgentSkills}
                />
              </View>
            </>
          )}
        </View>
        <Toast toast={toast} onDismiss={clearToast} />
        {!threeColumns && drawer === "agents" && (
          <AgentSideDrawer
            side="left"
            onClose={() => setDrawer(null)}
            closeLabel={t("ui.closeDetails")}
          >
            <AgentRail
              compact
              onOpen={openPanel}
              onSearch={() => setSearchOpen(true)}
              onSignOut={onSignOut}
              onClose={() => setDrawer(null)}
            />
          </AgentSideDrawer>
        )}
        {sidePage && !threeColumns && !phone && (
          <View
            testID="agent-side-page"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 40,
              backgroundColor: colors.canvas,
            }}
          >
            <SafeAreaView
              style={{ flex: 1, backgroundColor: colors.canvas }}
              edges={["top", "bottom"]}
            >
              <View
                style={{
                  height: 52,
                  paddingHorizontal: 12,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Pressable
                  testID="agent-side-back"
                  accessibilityRole="button"
                  accessibilityLabel={t("common.back")}
                  onPress={() => setSidePage(false)}
                  style={({ pressed }) => ({
                    width: 36,
                    height: 36,
                    borderRadius: radius.full,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed ? colors.overlay1 : "transparent",
                  })}
                >
                  <ChevronLeft size={18} color={colors.muted} />
                </Pressable>
              </View>
              <CapabilityRail
                page
                onOpen={openPanel}
                onNavigateAway={() => setSidePage(false)}
                onOpenAgentSkills={openAgentSkills}
              />
            </SafeAreaView>
          </View>
        )}
        {phone && mobileAccountMenu && (
          <AccountMenu
            name={workspace.profile.name.trim() || t("agentSpace.account")}
            email={workspace.profile.email}
            avatarUrl={workspace.profile.avatarUrl}
            compact
            anchor={{ top: insets.top + 16 + 44 + 10, left: 16 }}
            onClose={() => setMobileAccountMenu(false)}
            onProfile={() => {
              setMobileAccountMenu(false);
              openPanel("account");
            }}
            onSettings={() => {
              setMobileAccountMenu(false);
              navigate("settings");
            }}
            onSignOut={() => {
              setMobileAccountMenu(false);
              onSignOut();
            }}
          />
        )}
        <AgentSheets
          key={`${current.id}:${panel}`}
          panel={panel}
          onClose={closePanel}
          onDismiss={dismissPanels}
          onPanel={pushPanel}
          onSignOut={onSignOut}
          onOpenAgentSkills={openAgentSkills}
        />
        {searchOpen && <GlobalSearchSheet onClose={() => setSearchOpen(false)} />}
        {appsSheet && (
          <Sheet botLayout title={t("app.titleApps")} onClose={() => setAppsSheet(false)}>
            <CapabilityHubScreen />
          </Sheet>
        )}
        {ideasOpen && <IdeasOverlay onClose={() => setIdeasOpen(false)} />}
        {detail && <Details detail={detail} />}
      </SafeAreaView>
    </>
  );
}
