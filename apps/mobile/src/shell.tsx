/**
 * 应用外壳。
 *
 * 桌面端是 232px 文本侧栏 + 主工作区，信息架构对齐 Demo：
 * 工作台、对话、自选、动态、灵感、盯盘、资料、投资偏好和应用。
 * 进入对话时额外显示会话列表栏，保留完整的历史会话管理与切换能力。
 */
import { useThreads } from "@copilotkit/react-native/headless";
import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import type { Section } from "../../../packages/domain/src";
import { useAgentWorkspace } from "./agent-workspace";
import type { AccountProfile } from "./api";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import {
  Archive,
  Bell,
  Check,
  CircleUserRound,
  FileText,
  Heart,
  type IconComponent,
  Lightbulb,
  ListChecks,
  MessageCircle,
  MoreHorizontal,
  PanelsTopLeft,
  Pencil,
  Plus,
  Search,
  Settings2,
  Shapes,
  Sparkles,
  Target,
  Trash2,
  X,
} from "./icons";
import { relativeDate } from "./relative-date";
import { layout } from "./theme";
import { useLingWuThread } from "./threads";
import { Button, colors, ErrorNotice, fonts, Mascot, radius, s, shadow } from "./ui";
import { useWorkspace } from "./workspace";

/** 侧栏中的导航项：都对应一个页面，点击切换到对应 section。 */
export type NavItem = { id: Section; labelKey: TranslationKey; icon: IconComponent };

/** 桌面侧栏的主要页面。 */
export const SECTION_NAV: NavItem[] = [
  { id: "today", labelKey: "app.navToday", icon: PanelsTopLeft },
  { id: "chat", labelKey: "app.navChat", icon: MessageCircle },
  { id: "activity", labelKey: "app.navActivity", icon: ListChecks },
  { id: "watchlist", labelKey: "app.navWatchlist", icon: Target },
  { id: "goals", labelKey: "app.navGoals", icon: Bell },
  { id: "ideas", labelKey: "app.navIdeas", icon: Lightbulb },
  { id: "files", labelKey: "app.navFiles", icon: FileText },
  { id: "preferences", labelKey: "app.navPreferences", icon: Heart },
  { id: "apps", labelKey: "app.navApps", icon: Shapes },
];

/** 移动端底部导航：保留高频主路径与灵感快捷入口。 */
export const MOBILE_NAV: NavItem[] = [
  { id: "today", labelKey: "app.navToday", icon: Sparkles },
  { id: "watchlist", labelKey: "app.navWatchlistShort", icon: Target },
  { id: "activity", labelKey: "app.navActivity", icon: ListChecks },
  { id: "goals", labelKey: "app.navGoalsShort", icon: Bell },
  { id: "ideas", labelKey: "app.navIdeas", icon: Lightbulb },
];

/** 侧栏底部的「我的」页面项。 */
export const ACCOUNT_NAV: NavItem = {
  id: "account",
  labelKey: "app.navAccount",
  icon: CircleUserRound,
};

export const SIDEBAR_WIDTH = layout.sidebar;
/** 兼容仍在引用的旧常量名。 */
export const RAIL_WIDTH = SIDEBAR_WIDTH;
export const CHATS_WIDTH = layout.chats;

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function SidebarNavItem({
  icon: Icon,
  label,
  active,
  badge,
  onPress,
}: {
  icon: IconComponent;
  label: string;
  active: boolean;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: "100%",
        minHeight: 42,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 8,
        backgroundColor: active ? colors.skyStrong : pressed ? colors.overlay1 : "transparent",
      })}
    >
      <Icon
        size={18}
        strokeWidth={active ? 1.9 : 1.7}
        color={active ? colors.primary : colors.muted}
      />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 14,
          lineHeight: 20,
          fontWeight: active ? "600" : "500",
          color: active ? colors.primaryStrong : colors.text,
          fontFamily: fonts.sans,
        }}
      >
        {label}
      </Text>
      {!!badge && badge > 0 && (
        <View
          style={{
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            paddingHorizontal: 5,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.primaryAction,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "700", color: colors.onPrimary }}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** 品牌 Logo（四瓣花图形已替换为 logo.png 静态资产）。 */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <Image
      source={require("../assets/logo.png")}
      resizeMode="contain"
      style={{ width: size, height: size, flexShrink: 0 }}
      accessible={false}
    />
  );
}

function SidebarAccountAvatar({ avatarUrl, name }: { avatarUrl?: string; name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.paper,
      }}
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          resizeMode="cover"
          accessible={false}
          style={{ width: 28, height: 28 }}
        />
      ) : (
        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primaryStrong }}>
          {initial}
        </Text>
      )}
    </View>
  );
}

/**
 * 桌面文本侧栏。导航上方是品牌与新建分析，底部保留助手状态、设置和账户入口。
 * 分析记录统一留在工作台和分析任务页，不在侧栏重复展示。
 */
export function Rail({ name }: { name: string }) {
  const { section, navigate, open, api, workspace } = useWorkspace();
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const [accountAvatarUrl, setAccountAvatarUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    void api
      .request<AccountProfile>("/api/auth/me")
      .then((profile) => {
        if (active) setAccountAvatarUrl(profile.avatarUrl ?? undefined);
      })
      .catch(() => {
        // The account page owns the visible error state; the sidebar keeps its fallback.
      });
    return () => {
      active = false;
    };
  }, [api]);

  const activeCount = (data?.tasks ?? []).filter(
    (task) => !["succeeded", "failed", "cancelled"].includes(task.status),
  ).length;
  const activeMonitorCount = (data?.monitors ?? []).filter(
    (monitor) => monitor.status === "active",
  ).length;
  const accountLabel = workspace.profile.name.trim() || t(ACCOUNT_NAV.labelKey);
  const monitorStatus =
    activeMonitorCount > 0
      ? t("app.activeMonitors", { count: activeMonitorCount })
      : t("app.noActiveMonitors");

  return (
    <View
      style={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        zIndex: 20,
        borderRightWidth: 1,
        borderRightColor: colors.line,
        backgroundColor: colors.sidebar,
        paddingHorizontal: 20,
        paddingTop: 22,
        paddingBottom: 18,
      }}
    >
      <View style={[s.row, { gap: 10, paddingHorizontal: 2 }]}>
        <BrandMark size={29} />
        <Text
          style={{
            fontSize: 22,
            lineHeight: 29,
            fontWeight: "600",
            color: colors.text,
            letterSpacing: 2.4,
            fontFamily: fonts.serif,
          }}
        >
          {t("common.agentName")}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("app.newAnalysis")}
        onPress={() => navigate("chat")}
        style={({ pressed }) => ({
          marginTop: 28,
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 9,
          paddingHorizontal: 13,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: colors.lineStrong,
          backgroundColor: pressed ? colors.overlay1 : colors.paper,
        })}
      >
        <Plus size={16} strokeWidth={1.9} color={colors.text} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.text }}>
          {t("app.newAnalysis")}
        </Text>
        <Text style={{ fontSize: 11, color: colors.faint }}>⌘ J</Text>
      </Pressable>

      <ScrollView
        style={{ flex: 1, marginHorizontal: -8, marginTop: 14 }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 2 }}>
          {SECTION_NAV.map((item) => (
            <SidebarNavItem
              key={item.id}
              icon={item.icon}
              label={t(item.labelKey)}
              active={
                section === item.id ||
                (item.id === "watchlist" && section === "portfolio") ||
                (item.id === "files" && section === "notes")
              }
              badge={item.id === "activity" && activeCount ? activeCount : undefined}
              onPress={() => navigate(item.id)}
            />
          ))}
        </View>
      </ScrollView>

      <View
        style={{
          width: "100%",
          gap: 10,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: colors.line,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("app.agentSettingsLabel", { name })}
          onPress={() => open({ type: "personality" })}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginHorizontal: -4,
            paddingHorizontal: 8,
            paddingVertical: 8,
            borderRadius: radius.control,
            backgroundColor: pressed ? colors.overlay1 : "transparent",
          })}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.paper,
            }}
          >
            <Mascot size={24} variant={data?.identity.avatar} background={colors.paper} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }}>
              {t("app.agentWatching", { name })}
            </Text>
            <View style={[s.row, { gap: 5 }]}>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: activeMonitorCount > 0 ? colors.primary : colors.disabled,
                }}
              />
              <Text style={{ fontSize: 10, color: colors.muted }}>{monitorStatus}</Text>
            </View>
          </View>
        </Pressable>
        <View style={[s.row, { gap: 6, paddingHorizontal: 2, paddingBottom: 4 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accountLabel}
            accessibilityState={{ selected: section === ACCOUNT_NAV.id }}
            onPress={() => navigate(ACCOUNT_NAV.id)}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              minHeight: 38,
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              paddingHorizontal: 10,
              borderRadius: radius.control,
              backgroundColor:
                section === ACCOUNT_NAV.id
                  ? colors.skyStrong
                  : pressed
                    ? colors.overlay1
                    : "transparent",
            })}
          >
            <SidebarAccountAvatar avatarUrl={accountAvatarUrl} name={accountLabel} />
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: section === ACCOUNT_NAV.id ? colors.primaryStrong : colors.text,
                }}
              >
                {accountLabel}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 10, color: colors.muted }}>
                {t("app.personalSpace")}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("app.settingsLabel")}
            onPress={() => open({ type: "settings" })}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.control,
              backgroundColor: pressed ? colors.overlay1 : "transparent",
            })}
          >
            <Settings2 size={17} strokeWidth={1.7} color={colors.muted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * 小窗里的一个操作行：图标 + 文案，可标记危险色。
 * 整行是一个独立按钮，不嵌套在其他交互组件内，避免 react-native-web 冒泡问题。
 */
function MenuAction({
  icon: Icon,
  label,
  danger,
  onPress,
}: {
  icon: IconComponent;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const color = danger ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 6,
        borderRadius: 10,
        backgroundColor: pressed ? colors.overlay1 : "transparent",
      })}
    >
      <Icon size={16} color={color} />
      <Text style={{ fontSize: 14, fontWeight: "500", color }}>{label}</Text>
    </Pressable>
  );
}

/**
 * 旁聊操作下拉菜单：点击铅笔图标后在按钮旁弹出，提供「重命名 / 归档 / 删除」。
 * 无标题栏，按 anchor 坐标紧贴按钮定位；删除为不可恢复操作，先进入确认步骤，确认后才真正删除。
 */
/** 下拉菜单锚点：记录铅笔按钮的点击坐标与目标线程 id，用于紧贴按钮定位。 */
type MenuAnchor = { x: number; y: number; id: string };

function ThreadActionsMenu({
  anchor,
  onRename,
  onArchive,
  onDelete,
  onClose,
}: {
  anchor: MenuAnchor;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [confirming, setConfirming] = useState(false);
  // 菜单紧贴按钮下方展开，超出右/下边缘时向回夹紧，避免溢出屏幕。
  const menuWidth = 160;
  const card = {
    position: "absolute" as const,
    left: Math.max(8, Math.min(anchor.x - menuWidth + 28, width - menuWidth - 8)),
    top: anchor.y + 10,
    width: menuWidth,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    padding: 6,
    ...shadow.card,
  } as const;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      {/* 透明背板：点击菜单外任意处关闭菜单 */}
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "transparent" }}>
        {/* 菜单面板：自身拦截点击，避免面板内点击冒泡到背板导致误关 */}
        <Pressable
          accessibilityViewIsModal
          onPress={(e) => e.stopPropagation()}
          style={[card, { gap: 4 }]}
        >
          {confirming ? (
            <>
              <Text
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  fontSize: 13,
                  lineHeight: 18,
                  color: colors.text,
                }}
              >
                {t("threads.deleteConfirmTitle")}
              </Text>
              <Text
                style={{
                  paddingHorizontal: 10,
                  paddingBottom: 8,
                  fontSize: 12,
                  lineHeight: 17,
                  color: colors.muted,
                }}
              >
                {t("threads.deleteConfirmNote")}
              </Text>
              <MenuAction
                icon={Trash2}
                label={t("threads.permanentlyDelete")}
                danger
                onPress={onDelete}
              />
              <MenuAction icon={X} label={t("common.cancel")} onPress={onClose} />
            </>
          ) : (
            <>
              <MenuAction icon={Pencil} label={t("threads.rename")} onPress={onRename} />
              <MenuAction icon={Archive} label={t("threads.archive")} onPress={onArchive} />
              <MenuAction
                icon={Trash2}
                label={t("threads.delete")}
                danger
                onPress={() => setConfirming(true)}
              />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 对话列表里的一行：名字一行、说明一行，选中时用品牌浅蓝底。 */
function ThreadRow({
  title,
  detail,
  active,
  onPress,
  editing,
  draft,
  onDraftChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
}: {
  title: string;
  detail: string;
  active: boolean;
  onPress: () => void;
  editing?: boolean;
  draft?: string;
  onDraftChange?: (value: string) => void;
  // onStartEdit 传递铅笔按钮的点击坐标（pageX/pageY），供下拉菜单紧贴按钮定位。
  onStartEdit?: (x: number, y: number) => void;
  onCommitEdit?: () => void;
  onCancelEdit?: () => void;
}) {
  const { t } = useTranslation();
  // 整行按钮负责「选中对话」；操作入口是右侧一枚独立的铅笔图标，不能嵌套在按钮里。
  // 原因：react-native-web 的 PressResponder 在 onClick 里调用 stopPropagation，
  // 内层可点元素会把点击吞掉，导致外层 `select` 永远触发不了（点击按钮没反应）。
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={editing ? t("app.renameChatPlaceholder") : title}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        disabled={editing}
        style={({ pressed }) => ({
          flex: 1,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: active ? colors.line : "transparent",
          backgroundColor: active ? colors.paper : pressed ? colors.overlay1 : "transparent",
        })}
      >
        {editing ? (
          <TextInput
            value={draft}
            onChangeText={onDraftChange}
            onSubmitEditing={onCommitEdit}
            onBlur={onCancelEdit}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            accessibilityLabel={t("app.renameChatPlaceholder")}
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text,
              paddingVertical: 0,
              borderBottomWidth: 1,
              borderBottomColor: colors.primary,
            }}
          />
        ) : (
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "500", color: colors.text }}>
            {title}
          </Text>
        )}
        <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 16, color: colors.muted }}>
          {detail}
        </Text>
      </Pressable>
      {onStartEdit != null && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editing ? t("threads.saveName") : t("threads.actions")}
          onPress={(e) => {
            if (editing) {
              onCommitEdit?.();
              return;
            }
            const { pageX, pageY } = e.nativeEvent;
            onStartEdit?.(pageX, pageY);
          }}
          hitSlop={8}
          style={({ pressed }) => ({
            marginRight: 8,
            padding: 6,
            borderRadius: 10,
            backgroundColor: pressed ? colors.overlay1 : "transparent",
          })}
        >
          {editing ? (
            <Check size={15} strokeWidth={1.9} color={colors.primary} />
          ) : (
            <MoreHorizontal size={15} strokeWidth={1.9} color={colors.muted} />
          )}
        </Pressable>
      )}
    </View>
  );
}

/**
 * 对话列表栏：搜索框、按「主要聊天 / 旁聊」分组的会话列表，底部新建旁聊。
 *
 * 新建时线程由运行时懒创建，名字先记在本地（draftNames），等它出现在会话列表里再改名。
 */
export function ChatsColumn() {
  const { t } = useTranslation();
  const { notify } = useWorkspace();
  const { selection, visited, mainId, select, start, enabled, loading, error, retry } =
    useLingWuThread();
  const threads = useThreads({ agentId: "default", enabled, includeArchived: false, limit: 20 });
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  // 内联重命名：editingId 为当前正在改名的线程（服务端已存在的旁聊才算数）。
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState("");
  // 旁聊操作下拉菜单：menuAnchor 记录铅笔按钮点击坐标与目标线程 id。
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor>();

  // 侧边对话懒创建：名字先留在本地，等它第一次出现在服务端列表里再改名。
  const renameThread = threads.renameThread;
  useEffect(() => {
    if (!enabled) return;
    const ready = Object.entries(draftNames).filter(([id]) =>
      threads.threads.some((saved) => saved.id === id),
    );
    if (!ready.length) return;
    setDraftNames((map) => {
      const next = { ...map };
      for (const [id] of ready) delete next[id];
      return next;
    });
    for (const [id, name] of ready) {
      void renameThread(id, name).catch((e) => notify(errorText(e)));
    }
  }, [draftNames, enabled, notify, renameThread, threads.threads]);

  // 提交内联重命名；名字为空则视为取消。
  const commitRename = (id: string) => {
    const name = draft.trim();
    setEditingId(undefined);
    if (!name || threads.isMutating) return;
    void renameThread(id, name)
      .then(() => setEditingId(undefined))
      .catch((e) => notify(errorText(e)));
  };

  // 下拉菜单「重命名」：关闭菜单并进入内联改名。
  const renameFromMenu = () => {
    const thread = menuAnchor
      ? threads.threads.find((saved) => saved.id === menuAnchor.id)
      : undefined;
    if (!thread) return;
    setMenuAnchor(undefined);
    setEditingId(thread.id);
    setDraft(thread.name || "");
  };

  // 下拉菜单「归档」：成功后若选中的正是它，回主对话；失败保留菜单便于重试。
  const archiveFromMenu = () => {
    const id = menuAnchor?.id;
    if (!id || threads.isMutating) return;
    void threads
      .archiveThread(id)
      .then(() => {
        setMenuAnchor(undefined);
        if (selection.id === id) select({ id: mainId, existing: true });
        notify(t("threads.archivedNotice"));
      })
      .catch((e) => notify(errorText(e)));
  };

  // 下拉菜单「删除」：不可恢复，前端已二次确认；成功后若选中的正是它，回主对话。
  const deleteFromMenu = () => {
    const id = menuAnchor?.id;
    if (!id || threads.isMutating) return;
    void threads
      .deleteThread(id)
      .then(() => {
        setMenuAnchor(undefined);
        if (selection.id === id) select({ id: mainId, existing: true });
      })
      .catch((e) => notify(errorText(e)));
  };

  const q = query.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);

  const mainThread = threads.threads.find((saved) => saved.id === mainId);
  const mainName = t("app.mainChatsHeading");
  // 下拉菜单弹出时从最新线程列表里取到当前目标，避免依赖快照状态。
  const menuThread = menuAnchor
    ? threads.threads.find((saved) => saved.id === menuAnchor.id)
    : undefined;
  // CopilotKit 运行时会在列表首屏直出服务端线程（含平台随机生成的 slug id），
  // 曾短暂返回同 id 两条记录；且一个本地待建的旁聊首次上线服务端列表时，同一 id
  // 会同时出现在 sideThreads 与 pendingThreads（同父级兄弟节点，key 必须互斥），
  // 因此两列表各自按 id 去重之外，还要跨列表排除，避免 React 重复 key 告警。
  const seenSideIds = new Set<string>();
  const sideThreads = threads.threads.filter((saved) => {
    if (saved.id === mainId || !matches(saved.name || "") || seenSideIds.has(saved.id))
      return false;
    seenSideIds.add(saved.id);
    return true;
  });
  const seenPendingIds = new Set<string>();
  const pendingThreads = visited.filter((item) => {
    if (
      item.id === mainId ||
      seenSideIds.has(item.id) ||
      threads.threads.some((saved) => saved.id === item.id) ||
      !matches(draftNames[item.id] ?? t("threads.untitledConversation")) ||
      seenPendingIds.has(item.id)
    )
      return false;
    seenPendingIds.add(item.id);
    return true;
  });

  const create = (name?: string) => {
    const id = start();
    const trimmed = (name ?? "").trim();
    if (trimmed) setDraftNames((map) => ({ ...map, [id]: trimmed }));
    setTitle("");
  };

  return (
    <View
      style={{
        width: CHATS_WIDTH,
        flexShrink: 0,
        borderRightWidth: 1,
        borderRightColor: colors.line,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 }}>
        <Text
          style={{
            paddingHorizontal: 4,
            fontSize: 15,
            fontWeight: "600",
            color: colors.text,
            letterSpacing: 0,
          }}
        >
          {t("app.chatsColumnTitle")}
        </Text>
        <View
          style={[
            s.row,
            {
              gap: 9,
              marginTop: 8,
              height: 38,
              paddingHorizontal: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.paper,
            },
          ]}
        >
          <Search size={15} color={colors.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("app.searchChatsPlaceholder")}
            placeholderTextColor={colors.faint}
            accessibilityLabel={t("app.searchChatsPlaceholder")}
            style={{ flex: 1, minWidth: 0, fontSize: 13, color: colors.text, paddingVertical: 0 }}
          />
          {!!query && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              onPress={() => setQuery("")}
            >
              <X size={14} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12, gap: 2 }}
        keyboardShouldPersistTaps="handled"
      >
        {enabled && loading && (
          <Text style={[s.small, { paddingHorizontal: 12, paddingVertical: 8 }]}>
            {t("app.openingWorkspace")}
          </Text>
        )}
        <ErrorNotice error={error} />
        {!!error && (
          <Button small onPress={retry} style={{ marginHorizontal: 12 }}>
            {t("app.retryMainChat")}
          </Button>
        )}

        <Text style={columnHeading}>{mainName}</Text>
        <ThreadRow
          title={t("app.mainChatName")}
          detail={
            mainThread
              ? relativeDate(mainThread.lastRunAt ?? mainThread.updatedAt)
              : t("threads.mainChatDetail")
          }
          active={selection.id === mainId}
          onPress={() => select({ id: mainId, existing: true })}
        />

        {enabled ? (
          <>
            <View style={[s.between, { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 2 }]}>
              <Text style={columnHeadingCompact}>{t("app.sideChatsHeading")}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("app.newSideChatPlaceholder")}
                onPress={() => create()}
                style={({ pressed }) => ({
                  width: 24,
                  height: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  backgroundColor: pressed ? colors.overlay1 : "transparent",
                })}
              >
                <Plus size={15} color={colors.muted} />
              </Pressable>
            </View>

            {sideThreads.map((thread) => (
              <ThreadRow
                key={thread.id}
                title={thread.name || t("threads.untitledConversation")}
                detail={relativeDate(thread.lastRunAt ?? thread.updatedAt)}
                active={selection.id === thread.id}
                onPress={() => select({ id: thread.id, existing: true })}
                editing={editingId === thread.id}
                draft={draft}
                onDraftChange={setDraft}
                onStartEdit={(x, y) => {
                  setMenuAnchor({ x, y, id: thread.id });
                  setEditingId(undefined);
                }}
                onCommitEdit={() => commitRename(thread.id)}
                onCancelEdit={() => setEditingId(undefined)}
              />
            ))}
            {pendingThreads.map((item, index) => (
              <ThreadRow
                key={item.id}
                title={draftNames[item.id] || t("threads.sideChatNumber", { index: index + 1 })}
                detail={t("threads.openInThisApp")}
                active={selection.id === item.id}
                onPress={() => select(item)}
              />
            ))}
            {!sideThreads.length && !pendingThreads.length && (
              <Text style={[s.small, { paddingHorizontal: 12, paddingVertical: 8 }]}>
                {t("threads.emptyActive")}
              </Text>
            )}
          </>
        ) : (
          <Text style={[s.small, { paddingHorizontal: 12, paddingVertical: 8 }]}>
            {t("threads.workspaceSavedNote")}
          </Text>
        )}
      </ScrollView>

      <View
        style={[s.row, { gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.line }]}
      >
        <TextInput
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={() => create(title)}
          placeholder={t("app.newSideChatPlaceholder")}
          placeholderTextColor={colors.faint}
          accessibilityLabel={t("app.newSideChatPlaceholder")}
          style={{
            flex: 1,
            minWidth: 0,
            height: 36,
            paddingHorizontal: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.paper,
            fontSize: 13,
            color: colors.text,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("app.createSideChatLabel")}
          onPress={() => create(title)}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            backgroundColor: colors.primary,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Plus size={17} strokeWidth={1.9} color={colors.onPrimary} />
        </Pressable>
      </View>
      {menuThread && menuAnchor && (
        <ThreadActionsMenu
          anchor={menuAnchor}
          onRename={renameFromMenu}
          onArchive={archiveFromMenu}
          onDelete={deleteFromMenu}
          onClose={() => setMenuAnchor(undefined)}
        />
      )}
    </View>
  );
}

const columnHeading = {
  fontSize: 11,
  fontWeight: "600" as const,
  letterSpacing: 0.6,
  color: colors.muted,
  paddingHorizontal: 10,
  paddingTop: 10,
  paddingBottom: 4,
};

const columnHeadingCompact = { ...columnHeading, paddingHorizontal: 0, paddingTop: 0 };
