import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { type Channel, normalizeChannelAvatar } from "../../../packages/domain/src/channel";
import { AgentOrb } from "./agent-orb";
import { type AgentPanel, WorkspacePanelButtons } from "./agent-sheets";
import { useAgentSpace } from "./agent-space";
import { RAIL_WORK_PREVIEW_LIMIT, RailWorkGroups } from "./agent-work-dialog";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { railWorkItems } from "./automation-task-rail";
import type { ChannelSettingsTab } from "./channel-settings-screen";
import { useTranslation } from "./i18n";
import { X } from "./icons";
import { colors, fonts, radius, semantic, typography } from "./theme";
import { Button, HoverPressable } from "./ui";

/**
 * 频道右侧栏：恢复成「最近任务 + 全局工作区」结构。
 *
 * 顶部仍保留频道身份信息；中间显示这个频道最近的投研任务；
 * 底部复用全局工作区入口，和 Agent 右侧栏保持一致。
 */
export function ChannelRail({
  channel,
  onOpenSettings,
  onOpenPanel,
  onCollapse,
  page = false,
}: {
  channel: Channel;
  onOpenSettings: (tab: ChannelSettingsTab) => void;
  onOpenPanel: (panel: AgentPanel) => void;
  onCollapse?: () => void;
  /** 窄屏全屏页：去掉左描边，关闭交给页眉返回。 */
  page?: boolean;
}) {
  const { t } = useTranslation();
  const { agents } = useAgentSpace();
  const { data } = useAgentWorkspace();
  const [hovered, setHovered] = useState(false);
  const members = useMemo(
    () =>
      channel.agentIds
        .map((id) => agents.find((agent) => agent.id === id))
        .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent)),
    [agents, channel.agentIds],
  );
  const tasks = useMemo(
    () =>
      (data?.tasks ?? []).filter(
        (task) => typeof task.input?.channelId === "string" && task.input.channelId === channel.id,
      ),
    [data?.tasks, channel.id],
  );
  const monitors = useMemo(() => {
    const taskIds = new Set(tasks.map((task) => task.id));
    return (data?.monitors ?? []).filter((monitor) => taskIds.has(monitor.taskId));
  }, [data?.monitors, tasks]);
  const work = useMemo(() => railWorkItems(tasks, monitors), [tasks, monitors]);

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
          <Text
            style={{
              fontSize: 13,
              lineHeight: 20,
              color: colors.faint,
              marginTop: -2,
            }}
          >
            {t("channels.memberCount", { count: members.length })}
          </Text>
        </View>

        <Text
          style={{
            marginBottom: 10,
            paddingHorizontal: 6,
            fontSize: 15,
            lineHeight: 22,
            fontFamily: fonts.serif,
            fontWeight: "600",
            color: colors.text,
          }}
        >
          {t("agentSpace.delegatedWork")}
        </Text>
        <View testID="channel-rail-tasks">
          <RailWorkGroups
            items={work}
            limit={RAIL_WORK_PREVIEW_LIMIT}
            emptyText={t("channels.railTasksEmpty")}
          />
        </View>
        <View style={{ marginTop: 12 }}>
          <Button
            variant="outline"
            style={{ alignSelf: "stretch" }}
            onPress={() => onOpenSettings("tasks")}
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
            lineHeight: 22,
            fontFamily: fonts.serif,
            fontWeight: "600",
            color: colors.text,
          }}
        >
          {t("agentSpace.more")}
        </Text>
        <View style={{ marginTop: -4 }}>
          <WorkspacePanelButtons onPanel={onOpenPanel} compact={false} />
        </View>
      </ScrollView>
    </View>
  );
}
