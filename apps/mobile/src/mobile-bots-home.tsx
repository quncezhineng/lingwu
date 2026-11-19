import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import {
  type Channel,
  type ChannelMessage,
  normalizeChannelAvatar,
} from "../../../packages/domain/src/channel";
import { AccountAvatar } from "./account-avatar";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import type { AgentDefinition } from "./agent-space-model";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { useChannels } from "./channels";
import { type ThreadHistoryPage, threadHistoryPagePath } from "./conversation-history";
import { useTranslation } from "./i18n";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Bot,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "./icons";
import { type BotPreview, latestBotPreview, latestReplyPreview } from "./mobile-bots";
import {
  attachWebRubberBand,
  edgeFadeMask,
  MOBILE_CONTROL,
  mobileGlassStyle,
} from "./mobile-chrome";
import { unreadCount } from "./notification-actions";
import { GlobalSearchSheet } from "./search-sheet";
import { colors, fonts, radius, shadow, space } from "./theme";
import { useWorkspace } from "./workspace";

type MobileHomeEntry =
  | { id: string; kind: "agent"; agent: AgentDefinition; at?: string }
  | { id: string; kind: "channel"; channel: Channel; at?: string };

type CreateEntryAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AgentMenuAnchor = CreateEntryAnchor & {
  agent: AgentDefinition;
};

type ChannelMenuAnchor = CreateEntryAnchor & {
  channel: Channel;
};

function MobileMenuRow({
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: space.tight,
        borderRadius: radius.control,
        flexDirection: "row",
        alignItems: "center",
        gap: space.tight,
        backgroundColor: pressed ? (danger ? colors.errorSoft : colors.overlay1) : "transparent",
      })}
    >
      <Icon size={16} color={danger ? colors.danger : colors.text} />
      <Text
        style={{
          flex: 1,
          fontSize: 13,
          fontWeight: "500",
          color: danger ? colors.danger : colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MobileAgentMenu({
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
  const menuWidth = Math.min(180, width - 24);
  const rows = anchor.agent.system ? 1 : 3;
  const menuHeight = 10 + rows * 34 + (anchor.agent.system ? 0 : 7);
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
            padding: space.xxs,
            gap: space.hairline,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.card,
            backgroundColor: colors.paper,
            ...shadow.sheet,
          }}
        >
          {!anchor.agent.system && (
            <MobileMenuRow
              icon={anchor.agent.pinned ? ArrowDown : ArrowUp}
              label={anchor.agent.pinned ? t("agentSpace.unpinAgent") : t("agentSpace.pinAgent")}
              onPress={onTogglePin}
            />
          )}
          <MobileMenuRow icon={Settings2} label={t("details.settingsTitle")} onPress={onSettings} />
          {!anchor.agent.system && (
            <>
              <View style={{ height: 1, marginVertical: 3, backgroundColor: colors.line }} />
              <MobileMenuRow
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

function MobileChannelMenu({
  anchor,
  onClose,
  onSettings,
  onTogglePin,
  onDelete,
}: {
  anchor: ChannelMenuAnchor;
  onClose: () => void;
  onSettings: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const menuWidth = Math.min(180, width - 24);
  const menuHeight = 10 + 3 * 34 + 7;
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
            padding: space.xxs,
            gap: space.hairline,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.card,
            backgroundColor: colors.paper,
            ...shadow.sheet,
          }}
        >
          <MobileMenuRow
            icon={anchor.channel.pinned ? ArrowDown : ArrowUp}
            label={anchor.channel.pinned ? t("channels.unpinChannel") : t("channels.pinChannel")}
            onPress={onTogglePin}
          />
          <MobileMenuRow icon={Settings2} label={t("channels.openSettings")} onPress={onSettings} />
          <View style={{ height: 1, marginVertical: 3, backgroundColor: colors.line }} />
          <MobileMenuRow
            danger
            icon={Trash2}
            label={t("channels.deleteTitle")}
            onPress={onDelete}
          />
        </View>
      </View>
    </Modal>
  );
}

function MobileCreateEntryMenu({
  anchor,
  onClose,
  onCreateAgent,
  onCreateChannel,
}: {
  anchor: CreateEntryAnchor;
  onClose: () => void;
  onCreateAgent: () => void;
  onCreateChannel: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const menuWidth = Math.min(180, width - 24);
  const menuHeight = 10 + 2 * 34 + 7;
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
          testID="mobile-bots-create-menu"
          style={{
            position: "absolute",
            top,
            left,
            width: menuWidth,
            padding: space.xxs,
            gap: space.hairline,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.card,
            backgroundColor: colors.paper,
            ...shadow.sheet,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("agentSpace.createAgent")}
            onPress={onCreateAgent}
            style={({ pressed }) => ({
              minHeight: 34,
              paddingHorizontal: 8,
              borderRadius: radius.control,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: pressed ? colors.overlay1 : "transparent",
            })}
          >
            <Bot size={16} color={colors.text} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: colors.text }}>
              {t("agentSpace.createAgent")}
            </Text>
          </Pressable>
          <View style={{ height: 1, marginVertical: 3, backgroundColor: colors.line }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("channels.create")}
            onPress={onCreateChannel}
            style={({ pressed }) => ({
              minHeight: 34,
              paddingHorizontal: 8,
              borderRadius: radius.control,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: pressed ? colors.overlay1 : "transparent",
            })}
          >
            <MessageCircle size={16} color={colors.text} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: colors.text }}>
              {t("channels.create")}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * 手机宽度的 bots 首页。电脑版不走这里。
 * 最近一条消息来自现有的对话历史接口；未读点只反映挂在该 bot 任务上的未读通知。
 */
export function MobileBotsHome({
  onOpenBot,
  onOpenChannel,
  onCreateAgent,
  onCreateChannel,
  onAccount,
  onNotifications,
  onConnections,
}: {
  onOpenBot: (agent: AgentDefinition) => void;
  onOpenChannel: (channel: Channel) => void;
  onCreateAgent: () => void;
  onCreateChannel: () => void;
  onAccount: () => void;
  onNotifications: () => void;
  onConnections: () => void;
}) {
  const { t } = useTranslation();
  const { api, workspace, navigate } = useWorkspace();
  const { agents, selectAgent, deleteAgent, setAgentPinned } = useAgentSpace();
  const { channels, deleteChannel, updateChannel, selectChannel } = useChannels();
  const { data } = useAgentWorkspace();
  const scroller = useRef<ScrollView>(null);
  const createButtonRef = useRef<View>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createMenuAnchor, setCreateMenuAnchor] = useState<CreateEntryAnchor>();
  const [agentMenuAnchor, setAgentMenuAnchor] = useState<AgentMenuAnchor>();
  const [channelMenuAnchor, setChannelMenuAnchor] = useState<ChannelMenuAnchor>();
  const [pendingDeleteAgent, setPendingDeleteAgent] = useState<AgentDefinition>();
  const [pendingDeleteChannel, setPendingDeleteChannel] = useState<Channel>();
  const [previews, setPreviews] = useState<Record<string, BotPreview | null>>({});
  const [channelPreviews, setChannelPreviews] = useState<Record<string, BotPreview | null>>({});
  const agentKey = agents.map((agent) => agent.id).join("|");
  const channelKey = channels.map((channel) => channel.id).join("|");

  useEffect(() => {
    let active = true;
    for (const agent of agents) {
      void api
        .request<ThreadHistoryPage>(threadHistoryPagePath(agent.threadId))
        .then((page) => {
          if (!active) return;
          setPreviews((current) => ({
            ...current,
            [agent.id]: latestBotPreview(page.messages),
          }));
        })
        .catch(() => {
          if (!active) return;
          setPreviews((current) => ({ ...current, [agent.id]: null }));
        });
    }
    return () => {
      active = false;
    };
  }, [api, agentKey]);

  useEffect(() => {
    let active = true;
    for (const channel of channels) {
      void api
        .request<ChannelMessage[]>(`/api/channels/${encodeURIComponent(channel.id)}/messages`)
        .then((messages) => {
          if (!active) return;
          setChannelPreviews((current) => ({
            ...current,
            [channel.id]: latestReplyPreview(messages, ["member"]),
          }));
        })
        .catch(() => {
          if (!active) return;
          setChannelPreviews((current) => ({ ...current, [channel.id]: null }));
        });
    }
    return () => {
      active = false;
    };
  }, [api, channelKey]);

  useEffect(() => {
    const node = (
      scroller.current as { getScrollableNode?: () => HTMLElement } | null
    )?.getScrollableNode?.();
    if (!node || typeof node.addEventListener !== "function") return;
    return attachWebRubberBand(node);
  }, []);

  const rows = useMemo(() => {
    const ranked: MobileHomeEntry[] = [
      ...agents.map((agent) => ({
        id: `agent:${agent.id}`,
        kind: "agent" as const,
        agent,
        at: previews[agent.id]?.at,
      })),
      ...channels.map((channel) => ({
        id: `channel:${channel.id}`,
        kind: "channel" as const,
        channel,
        at: channelPreviews[channel.id]?.at,
      })),
    ];
    ranked.sort((left, right) => {
      const leftSystem = left.kind === "agent" && left.agent.system;
      const rightSystem = right.kind === "agent" && right.agent.system;
      if (leftSystem !== rightSystem) return leftSystem ? -1 : 1;
      const leftPinned =
        left.kind === "agent"
          ? Number(!!left.agent.pinned && !left.agent.system)
          : Number(!!left.channel.pinned);
      const rightPinned =
        right.kind === "agent"
          ? Number(!!right.agent.pinned && !right.agent.system)
          : Number(!!right.channel.pinned);
      if (leftPinned !== rightPinned) return rightPinned - leftPinned;
      if (left.at && right.at && left.at !== right.at) return right.at.localeCompare(left.at);
      if (left.at !== right.at) return left.at ? -1 : 1;
      return left.id.localeCompare(right.id);
    });
    return ranked;
  }, [agents, channels, previews, channelPreviews]);
  const nickname = workspace.profile.name.trim() || t("agentSpace.account");
  const unreadNotifications = unreadCount(data?.notifications);
  const edge = 16;
  const floatGap = 14;
  // 遮罩比按钮区再长一截，第一行停在完全不透明的位置，滚上去才开始变淡。
  const fade = edge + MOBILE_CONTROL + floatGap + 22;

  return (
    <View testID="mobile-bots-home" style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View pointerEvents="box-none" style={[{ flex: 1 }, edgeFadeMask(fade, fade)]}>
        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            minHeight: "100%",
            paddingTop: fade,
            paddingBottom: fade,
            paddingHorizontal: 8,
          }}
        >
          {rows.length === 0 ? (
            <Text style={{ padding: 24, textAlign: "center", color: colors.muted, fontSize: 14 }}>
              {t("agentSpace.noBotMessages")}
            </Text>
          ) : (
            rows.map((entry) => {
              if (entry.kind === "agent") {
                const { agent } = entry;
                const preview = previews[agent.id];
                const label = agent.name;
                const menuRef = { current: null as View | null };
                return (
                  <View key={entry.id} style={{ position: "relative" }}>
                    <Pressable
                      testID={`mobile-bot-${agent.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      onPress={() => onOpenBot(agent)}
                      style={({ pressed }) => ({
                        minHeight: 72,
                        paddingLeft: space.xs,
                        paddingRight: 44,
                        paddingVertical: space.sm,
                        borderRadius: radius.card,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: space.sm,
                        backgroundColor: pressed ? colors.overlay1 : "transparent",
                      })}
                    >
                      <AgentOrb avatar={agent.avatar} size={44} />
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text
                            numberOfLines={1}
                            style={{
                              flex: 1,
                              fontFamily: fonts.serif,
                              fontSize: 16,
                              lineHeight: 22,
                              fontWeight: "600",
                              color: colors.text,
                            }}
                          >
                            {label}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text
                            numberOfLines={1}
                            style={{ flex: 1, fontSize: 13, lineHeight: 20, color: colors.muted }}
                          >
                            {preview?.text || t("agentSpace.noBotMessages")}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                    <Pressable
                      ref={(node) => {
                        menuRef.current = node;
                      }}
                      testID={`mobile-bot-more-${agent.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={t("ui.moreActions")}
                      accessibilityHint={agent.name}
                      hitSlop={4}
                      onPress={(event) => {
                        event.stopPropagation();
                        menuRef.current?.measureInWindow((x, y, width, height) => {
                          setAgentMenuAnchor({ agent, x, y, width, height });
                        });
                      }}
                      style={({ pressed }) => ({
                        position: "absolute",
                        top: 10,
                        right: 8,
                        width: 28,
                        height: 28,
                        borderRadius: radius.badge,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: pressed ? colors.overlay2 : "transparent",
                      })}
                    >
                      <MoreHorizontal size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                );
              }
              const { channel } = entry;
              const preview = channelPreviews[channel.id];
              const label = `${channel.name} (${channel.agentIds.length})`;
              const menuRef = { current: null as View | null };
              return (
                <View key={entry.id} style={{ position: "relative" }}>
                  <Pressable
                    testID={`mobile-channel-${channel.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={channel.name}
                    onPress={() => onOpenChannel(channel)}
                    style={({ pressed }) => ({
                      minHeight: 72,
                      paddingLeft: space.xs,
                      paddingRight: 44,
                      paddingVertical: space.sm,
                      borderRadius: radius.card,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space.sm,
                      backgroundColor: pressed ? colors.overlay1 : "transparent",
                    })}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: radius.full,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.sky,
                      }}
                    >
                      <AgentOrb avatar={normalizeChannelAvatar(channel.avatar)} size={31} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            flex: 1,
                            fontFamily: fonts.serif,
                            fontSize: 16,
                            lineHeight: 22,
                            fontWeight: "600",
                            color: colors.text,
                          }}
                        >
                          {label}
                        </Text>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{ flex: 1, fontSize: 13, lineHeight: 20, color: colors.muted }}
                      >
                        {preview?.text || t("agentSpace.noBotMessages")}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    ref={(node) => {
                      menuRef.current = node;
                    }}
                    testID={`mobile-channel-more-${channel.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={t("ui.moreActions")}
                    accessibilityHint={channel.name}
                    hitSlop={4}
                    onPress={(event) => {
                      event.stopPropagation();
                      menuRef.current?.measureInWindow((x, y, width, height) => {
                        setChannelMenuAnchor({ channel, x, y, width, height });
                      });
                    }}
                    style={({ pressed }) => ({
                      position: "absolute",
                      top: 10,
                      right: 8,
                      width: 28,
                      height: 28,
                      borderRadius: radius.badge,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: pressed ? colors.overlay2 : "transparent",
                    })}
                  >
                    <MoreHorizontal size={16} color={colors.muted} />
                  </Pressable>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: edge,
          left: edge,
          right: edge,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Pressable
          testID="mobile-bots-account"
          accessibilityRole="button"
          accessibilityLabel={t("agentSpace.personalCenter")}
          onPress={onAccount}
          style={({ pressed }) => ({
            borderRadius: radius.full,
            opacity: pressed ? 0.86 : 1,
            ...shadow.composer,
          })}
        >
          <AccountAvatar
            avatarUrl={workspace.profile.avatarUrl}
            name={nickname}
            size={MOBILE_CONTROL}
            borderRadius={MOBILE_CONTROL / 2}
          />
        </Pressable>
        <View pointerEvents="none" style={{ flex: 1 }} />
        <View ref={createButtonRef}>
          <Pressable
            testID="mobile-bots-create"
            accessibilityRole="button"
            accessibilityLabel={t("agentSpace.createEntry")}
            onPress={() =>
              createButtonRef.current?.measureInWindow((x, y, width, height) => {
                setCreateMenuAnchor({ x, y, width, height });
              })
            }
            style={({ pressed }) => [
              mobileGlassStyle(pressed),
              floatingControl,
              { borderRadius: radius.full },
            ]}
          >
            <Plus size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: edge,
          right: edge,
          bottom: edge,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Pressable
          testID="mobile-bots-notifications"
          accessibilityRole="button"
          accessibilityLabel={t("app.notificationsLabel", { count: unreadNotifications })}
          onPress={onNotifications}
          style={({ pressed }) => [
            mobileGlassStyle(pressed),
            floatingControl,
            { borderRadius: radius.full },
          ]}
        >
          <View>
            <Bell size={20} color={colors.text} />
            {unreadNotifications > 0 && (
              <View
                accessibilityLabel={t("agentSpace.newNotifications")}
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  width: 8,
                  height: 8,
                  borderRadius: radius.full,
                  backgroundColor: colors.primary,
                }}
              />
            )}
          </View>
        </Pressable>
        <Pressable
          testID="mobile-bots-search"
          accessibilityRole="button"
          accessibilityLabel={t("agentSpace.searchBots")}
          onPress={() => setSearchOpen(true)}
          style={({ pressed }) => [
            mobileGlassStyle(pressed),
            floatingControl,
            { borderRadius: radius.full },
          ]}
        >
          <Search size={18} color={colors.text} />
        </Pressable>
        <Pressable
          testID="mobile-bots-connections"
          accessibilityRole="button"
          accessibilityLabel={t("agentSpace.connectApps")}
          onPress={onConnections}
          style={({ pressed }) => [
            mobileGlassStyle(pressed),
            {
              flex: 1,
              height: MOBILE_CONTROL,
              paddingHorizontal: 14,
              borderRadius: radius.full,
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
        >
          <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 20, fontWeight: "600" }}>
            {t("agentSpace.connectApps")}
          </Text>
        </Pressable>
      </View>
      {searchOpen && <GlobalSearchSheet onClose={() => setSearchOpen(false)} />}
      {createMenuAnchor && (
        <MobileCreateEntryMenu
          anchor={createMenuAnchor}
          onClose={() => setCreateMenuAnchor(undefined)}
          onCreateAgent={() => {
            setCreateMenuAnchor(undefined);
            onCreateAgent();
          }}
          onCreateChannel={() => {
            setCreateMenuAnchor(undefined);
            onCreateChannel();
          }}
        />
      )}
      {agentMenuAnchor && (
        <MobileAgentMenu
          anchor={agentMenuAnchor}
          onClose={() => setAgentMenuAnchor(undefined)}
          onTogglePin={() => {
            setAgentPinned(agentMenuAnchor.agent.id, !agentMenuAnchor.agent.pinned);
            setAgentMenuAnchor(undefined);
          }}
          onSettings={() => {
            const target = agentMenuAnchor.agent;
            setAgentMenuAnchor(undefined);
            selectChannel(null);
            selectAgent(target.id);
            navigate("agent");
          }}
          onDelete={() => {
            setPendingDeleteAgent(agentMenuAnchor.agent);
            setAgentMenuAnchor(undefined);
          }}
        />
      )}
      {channelMenuAnchor && (
        <MobileChannelMenu
          anchor={channelMenuAnchor}
          onClose={() => setChannelMenuAnchor(undefined)}
          onTogglePin={() => {
            const target = channelMenuAnchor.channel;
            setChannelMenuAnchor(undefined);
            void updateChannel(target.id, { pinned: !target.pinned });
          }}
          onSettings={() => {
            const target = channelMenuAnchor.channel;
            setChannelMenuAnchor(undefined);
            selectChannel(target.id);
            navigate("channel");
          }}
          onDelete={() => {
            setPendingDeleteChannel(channelMenuAnchor.channel);
            setChannelMenuAnchor(undefined);
          }}
        />
      )}
      {pendingDeleteAgent && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setPendingDeleteAgent(undefined)}
        >
          <Pressable
            onPress={() => setPendingDeleteAgent(undefined)}
            style={{
              flex: 1,
              padding: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(17,17,17,0.22)",
            }}
          >
            <Pressable
              accessibilityViewIsModal
              onPress={(event) => event.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 360,
                padding: 22,
                gap: 10,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.paper,
                ...shadow.sheet,
              }}
            >
              <Text style={{ fontSize: 18, lineHeight: 24, fontWeight: "600", color: colors.text }}>
                {t("agentSpace.deleteConfirmTitle")}
              </Text>
              <Text style={{ fontSize: 14, lineHeight: 22, color: colors.muted }}>
                {t("agentSpace.deleteAgentNote")}
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("common.cancel")}
                  onPress={() => setPendingDeleteAgent(undefined)}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 44,
                    borderRadius: radius.control,
                    borderWidth: 1,
                    borderColor: colors.line,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed ? colors.overlay1 : colors.paper,
                  })}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
                    {t("common.cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("agentSpace.deleteConfirmAction")}
                  onPress={() => {
                    deleteAgent(pendingDeleteAgent.id);
                    setPendingDeleteAgent(undefined);
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 44,
                    borderRadius: radius.control,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed ? colors.danger : colors.danger,
                    opacity: pressed ? 0.86 : 1,
                  })}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.paper }}>
                    {t("agentSpace.deleteConfirmAction")}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {pendingDeleteChannel && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setPendingDeleteChannel(undefined)}
        >
          <Pressable
            onPress={() => setPendingDeleteChannel(undefined)}
            style={{
              flex: 1,
              padding: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(17,17,17,0.22)",
            }}
          >
            <Pressable
              accessibilityViewIsModal
              onPress={(event) => event.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 360,
                padding: 22,
                gap: 10,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.paper,
                ...shadow.sheet,
              }}
            >
              <Text style={{ fontSize: 18, lineHeight: 24, fontWeight: "600", color: colors.text }}>
                {t("channels.deleteTitle")}
              </Text>
              <Text style={{ fontSize: 14, lineHeight: 22, color: colors.muted }}>
                {t("channels.deleteConfirm")}
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("common.cancel")}
                  onPress={() => setPendingDeleteChannel(undefined)}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 44,
                    borderRadius: radius.control,
                    borderWidth: 1,
                    borderColor: colors.line,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed ? colors.overlay1 : colors.paper,
                  })}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
                    {t("common.cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("channels.deleteAction")}
                  onPress={() => {
                    void deleteChannel(pendingDeleteChannel.id);
                    setPendingDeleteChannel(undefined);
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 44,
                    borderRadius: radius.control,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed ? colors.danger : colors.danger,
                    opacity: pressed ? 0.86 : 1,
                  })}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.paper }}>
                    {t("channels.deleteAction")}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const floatingControl = {
  width: MOBILE_CONTROL,
  height: MOBILE_CONTROL,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
