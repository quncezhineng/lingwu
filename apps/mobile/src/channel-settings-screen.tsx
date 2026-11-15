import { type ComponentType, useMemo, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import type { AgentTask } from "../../../packages/domain/src/agent";
import {
  CHANNEL_AVATARS,
  type Channel,
  type ChannelAvatarId,
} from "../../../packages/domain/src/channel";
import { agentLayout } from "./agent-layout";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import { AGENT_CAPABILITY_LABELS } from "./agent-space-model";
import { useAgentWorkspace } from "./agent-workspace";
import { Text, TextInput } from "./app-text";
import { AssistantResponse } from "./assistant-response";
import { useChannels } from "./channels";
import { activeLocaleTag, type TranslationKey, useTranslation } from "./i18n";
import { statusLabel } from "./i18n/translate";
import { Brain, Clock3, Settings2, Terminal, Users } from "./icons";
import { StatusBadge, taskStatusTone } from "./status-badge";
import { breakpoints, colors, radius, shadow, space, typography } from "./theme";
import { Button, Field, HoverPressable, s } from "./ui";
import { useWorkspace } from "./workspace";

/** 频道详情页的左栏分区。 */
type ChannelSettingsTab = "profile" | "instructions" | "skills" | "tasks";

const TABS: ReadonlyArray<{
  id: ChannelSettingsTab;
  icon: ComponentType<{ size?: number; color?: string }>;
  labelKey: TranslationKey;
}> = [
  { id: "profile", icon: Settings2, labelKey: "channels.settingsProfile" },
  { id: "instructions", icon: Terminal, labelKey: "channels.settingsInstructions" },
  { id: "skills", icon: Brain, labelKey: "channels.settingsSkills" },
  { id: "tasks", icon: Clock3, labelKey: "channels.settingsTasks" },
];

/**
 * 频道详情页：与 Agent 详情页同级的独立设置页。
 *
 * 左栏是功能分区，右栏渲染对应设置内容：资料（头像/昵称/目标/成员）、
 * 指令（频道级共享指令）、技能（成员能力并集，只读）、任务（频道投研历史）。
 */
export function ChannelSettingsScreen({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { updateChannel } = useChannels();
  const { notify } = useWorkspace();
  const { width: windowWidth } = useWindowDimensions();
  const [tab, setTab] = useState<ChannelSettingsTab>("profile");
  const [width, setWidth] = useState(windowWidth);
  const stacked = width < breakpoints.mobile;
  const narrowViewport = windowWidth < breakpoints.mobile;
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];

  // 资料页的本地编辑态：头像、昵称、研究目标。
  const [avatar, setAvatar] = useState<ChannelAvatarId>(channel.avatar ?? "orb");
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  // 指令页的本地编辑态。
  const [instructions, setInstructions] = useState(channel.instructions ?? "");

  const saveProfile = () => {
    void updateChannel(channel.id, {
      name: name.trim() || channel.name,
      avatar,
      description: description.trim() || undefined,
    });
    notify(t("agentSpace.changesSaved"));
  };
  const saveInstructions = () => {
    void updateChannel(channel.id, { instructions: instructions.trim() });
    notify(t("agentSpace.changesSaved"));
  };

  const content = (() => {
    switch (tab) {
      case "instructions":
        return (
          <View style={{ gap: space.sm }}>
            <Text style={[s.muted, { lineHeight: 21 }]}>{t("channels.instructionsHint")}</Text>
            <TextInput
              accessibilityLabel={t("channels.settingsInstructions")}
              value={instructions}
              onChangeText={setInstructions}
              placeholder={t("agentSpace.instructionsPlaceholder")}
              placeholderTextColor={colors.faint}
              maxLength={4000}
              multiline
              textAlignVertical="top"
              style={[s.input, { minHeight: 300, fontSize: 15, lineHeight: 23, padding: 14 }]}
            />
            <Button primary onPress={saveInstructions}>
              {t("agentSpace.saveInstructions")}
            </Button>
          </View>
        );
      case "skills":
        return <ChannelSkillsPanel channel={channel} />;
      case "tasks":
        return <ChannelTasksPanel channel={channel} />;
      default:
        return (
          <View style={{ gap: 2 }}>
            <View style={{ alignItems: "center", marginBottom: 8 }}>
              <AgentOrb avatar={avatar} size={62} />
            </View>
            <Text style={[s.small, { color: colors.faint, marginBottom: 8 }]}>
              {t("agentSpace.avatar")}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {CHANNEL_AVATARS.map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: avatar === item }}
                  onPress={() => setAvatar(item)}
                  style={{
                    width: 43,
                    height: 43,
                    borderRadius: radius.full,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: avatar === item ? colors.primary : colors.line,
                    backgroundColor: avatar === item ? colors.sky : colors.paper,
                  }}
                >
                  <AgentOrb avatar={item} size={30} />
                </Pressable>
              ))}
            </View>
            <Field
              label={t("channels.nameLabel")}
              value={name}
              onChangeText={setName}
              maxLength={60}
            />
            <Field
              label={t("channels.descriptionLabel")}
              value={description}
              onChangeText={setDescription}
              placeholder={t("channels.descriptionPlaceholder")}
              maxLength={500}
              multiline
            />
            <View style={{ marginTop: space.sm }}>
              <ChannelMembersPanel channel={channel} />
            </View>
            <Button
              primary
              style={{ marginTop: space.md }}
              disabled={!name.trim()}
              onPress={saveProfile}
            >
              {t("agentSpace.savePersona")}
            </Button>
          </View>
        );
    }
  })();

  return (
    <View
      style={{ flex: 1, minHeight: 0 }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          maxWidth: agentLayout.pageMaxWidth,
          alignSelf: "center",
          paddingHorizontal: narrowViewport ? space.pageMobile : space.page,
          paddingTop: stacked ? space.sm : space.md,
          paddingBottom: space.sm,
          flexDirection: stacked ? "column" : "row",
          gap: stacked ? space.sm : space.lg,
        }}
      >
        {stacked ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 7, paddingVertical: 2 }}
            style={{ flexGrow: 0, flexShrink: 0 }}
          >
            {TABS.map((item) => {
              const selected = item.id === tab;
              const Icon = item.icon;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setTab(item.id)}
                  style={{
                    minHeight: 38,
                    paddingHorizontal: 13,
                    borderRadius: radius.full,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 7,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.line,
                    backgroundColor: selected ? colors.sky : colors.paper,
                  }}
                >
                  <Icon size={15} color={selected ? colors.primaryStrong : colors.muted} />
                  <Text
                    style={{
                      fontSize: 12,
                      lineHeight: 18,
                      fontWeight: selected ? "600" : "500",
                      color: selected ? colors.primaryStrong : colors.muted,
                    }}
                  >
                    {t(item.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <View style={{ width: 180, flexShrink: 0, gap: space.sm }}>
            <View
              style={{
                padding: 13,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.paper,
                flexDirection: "row",
                alignItems: "center",
                gap: 11,
                ...shadow.card,
              }}
            >
              <AgentOrb avatar={channel.avatar ?? "orb"} size={38} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={[s.text, { fontSize: 13, fontWeight: "600" }]}>
                  {channel.name}
                </Text>
                <Text numberOfLines={1} style={[s.small, { fontSize: 11, color: colors.faint }]}>
                  {t("channels.memberCount", { count: channel.agentIds.length })}
                </Text>
              </View>
            </View>
            <View accessibilityRole="tablist" style={{ gap: 3 }}>
              {TABS.map((item) => {
                const selected = item.id === tab;
                const Icon = item.icon;
                return (
                  <HoverPressable
                    key={item.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => setTab(item.id)}
                    style={({ pressed, hovered }) => ({
                      minHeight: 42,
                      paddingHorizontal: 11,
                      borderRadius: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      backgroundColor: selected
                        ? colors.sky
                        : pressed
                          ? colors.overlay2
                          : hovered
                            ? colors.overlay1
                            : "transparent",
                    })}
                  >
                    <Icon size={16} color={selected ? colors.primaryStrong : colors.muted} />
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 13,
                        lineHeight: 19,
                        fontWeight: selected ? "600" : "500",
                        color: selected ? colors.primaryStrong : colors.text,
                      }}
                    >
                      {t(item.labelKey)}
                    </Text>
                  </HoverPressable>
                );
              })}
            </View>
          </View>
        )}

        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ gap: space.sm, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ gap: 3 }}>
            <Text style={[typography.heading, { fontSize: 19 }]}>{t(active.labelKey)}</Text>
            {stacked && <Text style={s.small}>{channel.name}</Text>}
          </View>
          <View
            style={{
              padding: stacked ? space.md : space.lg,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.paper,
            }}
          >
            {content}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

/** 资料页的成员列表：频道成员 Agent 的头像 + 名称 + 角色。 */
function ChannelMembersPanel({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { agents } = useAgentSpace();
  const members = useMemo(
    () =>
      channel.agentIds
        .map((id) => agents.find((a) => a.id === id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [agents, channel.agentIds],
  );
  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.heading, { fontSize: 14 }]}>{t("channels.membersLabel")}</Text>
      {members.map((member) => (
        <View key={member.id} style={[s.row, { gap: 10, alignItems: "center" }]}>
          <AgentOrb avatar={member.avatar} size={30} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.text, { fontWeight: "600" }]}>{member.name}</Text>
            <Text style={[s.small, { color: colors.faint }]}>{member.role}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** 技能页：成员能力并集（只读）。频道的能力由其成员 Agent 的能力决定。 */
function ChannelSkillsPanel({ channel }: { channel: Channel }) {
  const { t, locale } = useTranslation();
  const { agents } = useAgentSpace();
  const zh = locale === "zh-Hans";
  const members = useMemo(
    () =>
      channel.agentIds
        .map((id) => agents.find((a) => a.id === id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [agents, channel.agentIds],
  );
  // 并集：收集所有成员的技能，记录「哪个成员具备哪项技能」。
  const bySkill = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const member of members) {
      for (const skill of member.skills) {
        const holders = map.get(skill) ?? new Set<string>();
        holders.add(member.name);
        map.set(skill, holders);
      }
    }
    return map;
  }, [members]);
  const entries = [...bySkill.entries()].sort(([a], [b]) => a.localeCompare(b));
  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.muted, { lineHeight: 20 }]}>{t("channels.skillsHint")}</Text>
      {entries.length ? (
        <View style={{ gap: 6 }}>
          {entries.map(([skill, holders]) => {
            const label = AGENT_CAPABILITY_LABELS[skill];
            return (
              <View
                key={skill}
                style={[
                  s.row,
                  {
                    gap: 10,
                    minHeight: 40,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: radius.field,
                    backgroundColor: colors.paper,
                  },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.text, { fontSize: 13, fontWeight: "600" }]}>
                    {label ? (zh ? label.zh : label.en) : skill}
                  </Text>
                  <Text numberOfLines={1} style={[s.small, { color: colors.faint }]}>
                    {[...holders].join(" · ")}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={[s.muted, { paddingVertical: 18 }]}>{t("channels.skillsEmpty")}</Text>
      )}
    </View>
  );
}

function taskTime(task: AgentTask) {
  return new Date(task.updatedAt).toLocaleTimeString(activeLocaleTag(), {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** 任务页：这个频道的投研任务历史（input.channelId 关联）。 */
function ChannelTasksPanel({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { open } = useWorkspace();
  const tasks = useMemo(() => {
    const all = data?.tasks ?? [];
    return all
      .filter(
        (task) => typeof task.input?.channelId === "string" && task.input.channelId === channel.id,
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [data?.tasks, channel.id]);

  if (tasks.length === 0) {
    return (
      <View style={{ gap: 8, alignItems: "center", paddingVertical: 18 }}>
        <Users size={28} color={colors.faint} />
        <Text style={[s.muted, { textAlign: "center" }]}>{t("channels.tasksEmpty")}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 4 }}>
      {tasks.map((task) => {
        const tone = taskStatusTone(task.status);
        return (
          <Pressable
            key={task.id}
            accessibilityRole="button"
            accessibilityLabel={task.title}
            onPress={() => open({ type: "task", taskId: task.id })}
            style={({ pressed }) => ({
              minHeight: 60,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderTopColor: colors.line,
              backgroundColor: pressed ? colors.overlay1 : "transparent",
            })}
          >
            <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
              >
                {task.title}
              </Text>
              <View style={s.between}>
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  {task.plan.find((step) => step.status === "running")?.title || ""}
                </Text>
                <Text style={{ fontSize: 10, color: colors.faint }}>{taskTime(task)}</Text>
              </View>
            </View>
            <StatusBadge tone={tone} label={statusLabel(task.status)} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** 渲染频道共享指令的只读预览（供指令页在非编辑场景复用，此处保留以备扩展）。 */
export function ChannelInstructionsPreview({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  return (channel.instructions ?? "").trim() ? (
    <AssistantResponse content={channel.instructions ?? ""} />
  ) : (
    <Text style={s.muted}>{t("channels.instructionsEmpty")}</Text>
  );
}
