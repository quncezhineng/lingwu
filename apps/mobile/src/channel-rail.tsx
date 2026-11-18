import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { type Channel, normalizeChannelAvatar } from "../../../packages/domain/src/channel";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import type { AgentPanel } from "./agent-sheets";
import type { ChannelSettingsTab } from "./channel-settings-screen";
import { useTranslation } from "./i18n";
import { X } from "./icons";
import { colors, radius, semantic, typography } from "./theme";
import { Text } from "./app-text";
import { HoverPressable, s } from "./ui";

/**
 * 频道右侧栏：只放成员列表，并标出组长。
 * 组长在聊天里用 @ 指定，这里不能改。
 */
export function ChannelRail({
  channel,
  onOpenSettings,
  onOpenPanel: _onOpenPanel,
  onCollapse,
  page = false,
}: {
  channel: Channel;
  onOpenSettings: (tab: ChannelSettingsTab) => void;
  /** 保留参数，避免调用方改签名。工作区不再从这里打开。 */
  onOpenPanel: (panel: AgentPanel) => void;
  onCollapse?: () => void;
  /** 窄屏全屏页：去掉左描边，关闭交给页眉返回。 */
  page?: boolean;
}) {
  const { t } = useTranslation();
  const { agents } = useAgentSpace();
  const [hovered, setHovered] = useState(false);
  const members = useMemo(
    () =>
      channel.agentIds
        .map((id) => agents.find((agent) => agent.id === id))
        .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent)),
    [agents, channel.agentIds],
  );
  const leaderId =
    channel.leaderId && channel.agentIds.includes(channel.leaderId)
      ? channel.leaderId
      : channel.agentIds[0];

  return (
    <View
      testID="channel-rail"
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
          <HoverPressable
            testID="channel-rail-close"
            accessibilityRole="button"
            accessibilityLabel={t("agentSpace.closeRail")}
            onPress={onCollapse}
            style={({ pressed, hovered: closeHovered }) => ({
              width: 32,
              height: 32,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: semantic.controlBorder,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed
                ? colors.overlay2
                : closeHovered
                  ? colors.surface
                  : colors.paper,
            })}
          >
            <X size={15} color={colors.muted} />
          </HoverPressable>
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
        <View
          style={{ width: "100%", alignItems: "center", paddingTop: 6, paddingBottom: 20, gap: 12 }}
        >
          <View style={{ width: "100%", alignItems: "center" }}>
            <HoverPressable
              testID="channel-rail-avatar"
              accessibilityRole="button"
              accessibilityLabel={t("channels.openSettings")}
              onPress={() => onOpenSettings("profile")}
              onHoverIn={() => setHovered(true)}
              onHoverOut={() => setHovered(false)}
              style={({ pressed }) => ({ borderRadius: radius.full, opacity: pressed ? 0.88 : 1 })}
            >
              <AgentOrb
                avatar={normalizeChannelAvatar(channel.avatar)}
                size={72}
                editing={hovered}
              />
            </HoverPressable>
          </View>
          <Text
            style={{
              ...typography.agentName,
              textAlign: "center",
              paddingHorizontal: 28,
              color: colors.text,
            }}
          >
            {channel.name}
          </Text>
        </View>

        <Text style={[s.small, { color: colors.faint, paddingHorizontal: 6, marginBottom: 8 }]}>
          {t("channels.membersLabel")}
        </Text>
        <View testID="channel-rail-members" style={{ gap: 4 }}>
          {members.map((member) => {
            const leader = member.id === leaderId;
            return (
              <View
                key={member.id}
                testID={leader ? "channel-rail-leader" : undefined}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 8,
                  paddingVertical: 8,
                  borderRadius: radius.card,
                }}
              >
                <AgentOrb avatar={member.avatar} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[s.text, { fontWeight: "600" }]} numberOfLines={1}>
                      {member.name}
                    </Text>
                    {leader && (
                      <Text
                        style={{
                          fontSize: 11,
                          lineHeight: 16,
                          color: colors.primaryStrong,
                          fontWeight: "600",
                        }}
                      >
                        {t("channels.leader")}
                      </Text>
                    )}
                  </View>
                  {!!member.role && (
                    <Text style={[s.small, { color: colors.faint }]} numberOfLines={1}>
                      {member.role}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
