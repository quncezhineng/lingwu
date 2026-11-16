import { useMemo, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import type { Channel } from "../../../packages/domain/src/channel";
import { AgentOrb } from "./agent-orb";
import { PanelButton } from "./agent-sheets";
import { useAgentSpace } from "./agent-space";
import { AGENT_CAPABILITY_LABELS } from "./agent-space-model";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import type { ChannelSettingsTab } from "./channel-settings-screen";
import { useTranslation } from "./i18n";
import { statusLabel } from "./i18n/translate";
import { Brain, FolderOpen, Heart, Settings2, Terminal, Users, X } from "./icons";
import { StatusBadge, taskStatusTone } from "./status-badge";
import { breakpoints, colors, fonts, radius, semantic, typography } from "./theme";
import { Button, HoverPressable, s } from "./ui";
import { useWorkspace } from "./workspace";

/**
 * 频道的右侧详情栏：与 Agent 的 CapabilityRail 同构。
 *
 * 差别只在数据来源 —— 身份是频道而不是单个 Agent，任务按 input.channelId 过滤，
 * 技能取成员能力并集；点头像/任意分区都会进频道设置页的对应分区。
 */
export function ChannelRail({
  channel,
  onOpenSettings,
  onCollapse,
  page = false,
}: {
  channel: Channel;
  onOpenSettings: (tab: ChannelSettingsTab) => void;
  onCollapse?: () => void;
  /** 窄屏全屏页：去掉左描边，关闭交给页眉返回。 */
  page?: boolean;
}) {
  const { t, locale } = useTranslation();
  const { width } = useWindowDimensions();
  const { open } = useWorkspace();
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
      (data?.tasks ?? [])
        .filter(
          (task) =>
            typeof task.input?.channelId === "string" && task.input.channelId === channel.id,
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 3),
    [data?.tasks, channel.id],
  );

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
              <AgentOrb avatar={channel.avatar ?? "orb"} size={72} editing={hovered} />
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
          </Text>
          <Text style={[s.small, { color: colors.faint, marginTop: -6 }]}>
            {t("channels.memberCount", { count: channel.agentIds.length })}
          </Text>
        </View>

        <Text style={{ ...delegatedTitle, paddingHorizontal: 6 }}>
          {t("agentSpace.delegatedWork")}
        </Text>
        <View testID="channel-rail-tasks" style={{ marginTop: 10 }}>
          {tasks.length ? (
            tasks.map((task) => (
              <HoverPressable
                key={task.id}
                accessibilityRole="button"
                accessibilityLabel={task.title}
                onPress={() => open({ type: "task", taskId: task.id })}
                style={({ pressed, hovered: taskHovered }) => ({
                  minHeight: 56,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 8,
                  borderRadius: radius.card,
                  backgroundColor: pressed
                    ? colors.overlay2
                    : taskHovered
                      ? colors.overlay1
                      : "transparent",
                })}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
                  >
                    {task.title}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.faint }}>
                    {new Date(task.updatedAt).toLocaleString(
                      locale === "zh-Hans" ? "zh-CN" : "en-US",
                      {
                        month: "numeric",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      },
                    )}
                  </Text>
                </View>
                <StatusBadge tone={taskStatusTone(task.status)} label={statusLabel(task.status)} />
              </HoverPressable>
            ))
          ) : (
            <Text style={[s.muted, { paddingHorizontal: 8 }]}>{t("channels.tasksEmpty")}</Text>
          )}
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
            fontFamily: fonts.serif,
            fontWeight: "600",
            color: colors.text,
          }}
        >
          {t("agentSpace.more")}
        </Text>
        <View style={{ gap: 6 }}>
          <PanelButton
            compact={false}
            icon={FolderOpen}
            title={t("app.navFiles")}
            detail={t("app.destFilesDetail")}
            onPress={() => onOpenSettings("files")}
          />
          <PanelButton
            compact={false}
            icon={Heart}
            title={t("app.navPreferences")}
            detail={t("details.settingsPreferencesDetail")}
            onPress={() => onOpenSettings("memory")}
          />
          <PanelButton
            compact={false}
            icon={Brain}
            title={t("channels.settingsSkills")}
            detail={t("channels.skillsHint")}
            onPress={() => onOpenSettings("skills")}
          />
          <PanelButton
            compact={false}
            icon={Users}
            title={t("channels.membersLabel")}
            detail={members.map((member) => member.name).join(" · ")}
            onPress={() => onOpenSettings("profile")}
          />
          <PanelButton
            compact={false}
            icon={Terminal}
            title={t("channels.settingsInstructions")}
            detail={t("channels.instructionsHint")}
            onPress={() => onOpenSettings("instructions")}
          />
        </View>

        {!!skills.length && (
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
