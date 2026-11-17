import { useMemo, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { type Channel, normalizeChannelAvatar } from "../../../packages/domain/src/channel";
import { AgentOrb } from "./agent-orb";
import { type AgentPanel, WorkspacePanelButtons } from "./agent-sheets";
import { useAgentSpace } from "./agent-space";
import { AGENT_CAPABILITY_LABELS } from "./agent-space-model";
import { RAIL_WORK_PREVIEW_LIMIT, RailWorkGroups } from "./agent-work-dialog";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { railWorkItems } from "./automation-task-rail";
import type { ChannelSettingsTab } from "./channel-settings-screen";
import { useTranslation } from "./i18n";
import { Brain, Settings2, X } from "./icons";
import { breakpoints, colors, fonts, radius, semantic, typography } from "./theme";
import { Button, HoverPressable, s } from "./ui";

/**
 * 频道右侧栏是否渲染「技能 / 能力」卡片区。
 *
 * 需求是隐藏而不是删除：区块 JSX、`skills` 数据与进设置页的跳转都留在原处，
 * 只是不参与渲染；需要恢复时改回 true 即可。显式标注 boolean，
 * 避免 TS 把条件收窄成常量后报不可达代码。
 */
const CHANNEL_RAIL_CAPABILITIES_VISIBLE: boolean = false;

/**
 * 频道右侧栏底部「设置」入口是否渲染。
 *
 * 需求是隐藏而不是删除：JSX 与 `onOpenSettings("profile")` 都留在原处，
 * 只是不参与渲染；需要恢复时改回 true 即可。
 */
const CHANNEL_RAIL_SETTINGS_ENTRY_VISIBLE: boolean = false;

/**
 * 频道的右侧详情栏：与 Agent 的 CapabilityRail 同构。
 *
 * 差别只在数据来源 —— 身份是频道而不是单个 Agent，任务按 input.channelId 过滤，
 * 技能取成员能力并集；点头像/任意分区都会进频道设置页的对应分区。
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
  /**
   * 工作区四项（市场简报 / 自选与组合 / 资料 / 记忆）都是全局资源，
   * 直接复用 Agent 右侧栏的弹层，由外层面板栈负责打开。
   */
  onOpenPanel: (panel: AgentPanel) => void;
  onCollapse?: () => void;
  /** 窄屏全屏页：去掉左描边，关闭交给页眉返回。 */
  page?: boolean;
}) {
  const { t, locale } = useTranslation();
  const { width } = useWindowDimensions();
  const { agents } = useAgentSpace();
  const { data } = useAgentWorkspace();
  const [hovered, setHovered] = useState(false);
  const narrow = width < breakpoints.mobile;

  const members = useMemo(
    () =>
      channel.agentIds
        .map((id) => agents.find((agent) => agent.id === id))
        .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent)),
    [agents, channel.agentIds],
  );
  const skills = useMemo(() => {
    const unique = new Set<string>();
    for (const member of members) for (const skill of member.skills) unique.add(skill);
    return [...unique].sort((a, b) => a.localeCompare(b)).slice(0, 4);
  }, [members]);
  const tasks = useMemo(
    () =>
      (data?.tasks ?? []).filter(
        (task) => typeof task.input?.channelId === "string" && task.input.channelId === channel.id,
      ),
    [data?.tasks, channel.id],
  );
  /** 频道的自动化：挂在这个频道任务上的监控，与 Agent 侧栏口径一致。 */
  const monitors = useMemo(() => {
    const taskIds = new Set(tasks.map((task) => task.id));
    return (data?.monitors ?? []).filter((monitor) => taskIds.has(monitor.taskId));
  }, [data?.monitors, tasks]);
  // 与 Agent 侧栏同一套数据整形：只留运行中的自动化与可见任务，按时间倒序。
  const work = useMemo(() => railWorkItems(tasks, monitors), [monitors, tasks]);

  const skillLabel = (id: string) => {
    const label = AGENT_CAPABILITY_LABELS[id];
    return label ? (locale === "zh-Hans" ? label.zh : label.en) : id;
  };

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
        {/* 头像 → 频道设置；与 Agent 右侧栏点头像进详情的行为一致。 */}
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
                  }}
                >
                  <Text style={{ fontSize: 12, lineHeight: 18, color: colors.text }}>
                    {t("channels.openSettings")}
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
            {channel.name}
            <Text style={{ fontSize: 14, color: colors.faint, fontWeight: "400" }}>
              {`（ ${members.length} ）`}
            </Text>
          </Text>
          <Text style={[s.small, { color: colors.faint, marginTop: -6 }]}>
            {t("channels.memberCount", { count: channel.agentIds.length })}
          </Text>
        </View>

        <Text style={{ ...delegatedTitle, paddingHorizontal: 6 }}>
          {t("agentSpace.delegatedWork")}
        </Text>
        <View testID="channel-rail-tasks" style={{ marginTop: 10 }}>
          {/* 与 Agent 侧栏共用同一份渲染：按天分组 + 图标行，不再单独显示时间与状态徽标。 */}
          <RailWorkGroups
            items={work}
            limit={RAIL_WORK_PREVIEW_LIMIT}
            emptyText={t("channels.tasksEmpty")}
          />
        </View>
        <View style={{ marginTop: 12 }}>
          <Button
            variant="outline"
            style={{ alignSelf: "stretch" }}
            // 与 Agent 侧栏一致：不是全局任务中心，而是本频道的完整任务列表
            // （频道详情 →「任务」分区）。
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
            fontFamily: fonts.serif,
            fontWeight: "600",
            color: colors.text,
          }}
        >
          {t("agentSpace.more")}
        </Text>
        {/*
         * 工作区与 Agent 右侧栏保持一致：市场简报 / 自选与组合 / 资料 / 记忆，
         * 四项都是全局（账户级）资源，因此共用 WorkspacePanelButtons 这一份实现。
         * 频道专属的「技能 / 成员 / 指令」收进底部「设置」入口里，不再占这里的位置。
         */}
        <WorkspacePanelButtons onPanel={onOpenPanel} compact={false} />

        {/*
         * 频道能力区（成员技能并集）按需求隐藏：只控制渲染，数据查询与跳转逻辑保留，
         * 把 CHANNEL_RAIL_CAPABILITIES_VISIBLE 改回 true 即可恢复。
         */}
        {CHANNEL_RAIL_CAPABILITIES_VISIBLE && !!skills.length && (
          <>
            <Text
              style={{
                marginTop: 18,
                marginBottom: 8,
                paddingHorizontal: 8,
                fontSize: 12,
                fontWeight: "600",
                color: colors.muted,
              }}
            >
              {t("channels.settingsSkills")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {skills.map((skill) => (
                <HoverPressable
                  key={skill}
                  accessibilityRole="button"
                  onPress={() => onOpenSettings("skills")}
                  style={({ pressed }) => ({
                    width: narrow ? "100%" : "47%",
                    minHeight: 60,
                    padding: 10,
                    borderRadius: radius.card,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: pressed ? colors.surface : colors.paper,
                    gap: 8,
                  })}
                >
                  <Brain size={15} color={colors.primary} />
                  <Text style={[s.text, { fontSize: 13, fontWeight: "600" }]} numberOfLines={2}>
                    {skillLabel(skill)}
                  </Text>
                </HoverPressable>
              ))}
            </View>
          </>
        )}
        {/*
         * 底部「设置」入口按需求隐藏：只控制渲染，跳转逻辑保留。
         * 频道设置仍可从左侧栏频道行的「…」菜单、或点频道头像进入，
         * 恢复时把 CHANNEL_RAIL_SETTINGS_ENTRY_VISIBLE 改回 true 即可。
         */}
        {CHANNEL_RAIL_SETTINGS_ENTRY_VISIBLE && (
          <HoverPressable
            accessibilityRole="button"
            onPress={() => onOpenSettings("profile")}
            style={({ pressed }) => ({
              minHeight: 43,
              marginTop: 10,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: colors.lineStrong,
              borderRadius: radius.card,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: pressed ? colors.overlay1 : "transparent",
            })}
          >
            <Settings2 size={16} color={colors.muted} />
            <Text style={[s.small, { color: colors.muted }]}>{t("channels.openSettings")}</Text>
          </HoverPressable>
        )}
      </ScrollView>
    </View>
  );
}

const delegatedTitle = {
  fontSize: 15,
  fontFamily: fonts.serif,
  fontWeight: "600" as const,
  color: colors.text,
};
