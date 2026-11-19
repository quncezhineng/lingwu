import { type ComponentType, type ReactNode, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import type { Artifact } from "../../../packages/domain/src";
import {
  CHANNEL_AVATARS,
  type Channel,
  type ChannelAvatarId,
  type ChannelMessage,
  normalizeChannelAvatar,
} from "../../../packages/domain/src/channel";
import { agentLayout } from "./agent-layout";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import type { AgentSkill } from "./agent-space-model";
import { ArtifactCard, TaskCard } from "./agent-ui";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { AssistantResponse } from "./assistant-response";
import { useAppConnectors } from "./app-connectors";
import { BotInlineBack } from "./bot-pages/shared";
import { MySkillDetailSheet, SkillDetailSheet } from "./capability-hub";
import { allConnectorOptions, connectorOptions, type ConnectorOption } from "./capability-picker";
import { CardGrid } from "./card-grid";
import { useChannels } from "./channels";
import { ConnectorLibraryPanel, ConnectorRemoveButton } from "./connector-library-panel";
import { saveRemoteFile, shareRemoteFile } from "./file-export";
import { type TranslationKey, useTranslation } from "./i18n";
import {
  ArrowDownToLine,
  Brain,
  CircleMinus,
  FileText,
  FolderOpen,
  Heart,
  Link2,
  ListChecks,
  Plus,
  Settings2,
  Share2,
  Terminal,
  Users,
} from "./icons";
import { InstructionsEditor } from "./instructions-editor";
import { ModalOverlay } from "./modal-overlay";
import { PreferencesScreen } from "./preferences-screen";
import { type SkillCatalogEntry, skillCatalog } from "./skill-catalog";
import { SkillLibraryPanel, SkillRemoveButton } from "./skill-library-panel";
import { SkillSectionCard } from "./skill-section-card";
import { StatusBadge } from "./status-badge";
import { breakpoints, colors, radius, shadow, space, typography } from "./theme";
import {
  Button,
  CheckRow,
  ErrorNotice,
  Field,
  HoverPressable,
  IconButton,
  LinkRow,
  SectionHeading,
  Sheet,
  s,
} from "./ui";
import { useWorkspace } from "./workspace";

/** 频道详情页的左栏分区（右侧栏可带分区意图直接跳进来）。 */
export type ChannelSettingsTab =
  | "profile"
  | "instructions"
  | "skills"
  | "connectors"
  | "files"
  | "tasks"
  | "memory";

const TABS: ReadonlyArray<{
  id: ChannelSettingsTab;
  icon: ComponentType<{ size?: number; color?: string }>;
  labelKey: TranslationKey;
}> = [
  { id: "profile", icon: Settings2, labelKey: "channels.settingsProfile" },
  // 「任务」紧跟基本信息，放在指令之前，与 Agent 详情页的分区顺序保持一致。
  // 图标与右侧栏「任务与自动化」一致，都是 ListChecks（勾选清单）。
  { id: "tasks", icon: ListChecks, labelKey: "channels.settingsTasks" },
  { id: "instructions", icon: Terminal, labelKey: "channels.settingsInstructions" },
  { id: "skills", icon: Brain, labelKey: "channels.settingsSkills" },
  // 「连接」紧跟「技能」：都是把账户里已有的能力挂到这个频道上，成员共享。
  { id: "connectors", icon: Link2, labelKey: "channels.settingsConnectors" },
  { id: "files", icon: FolderOpen, labelKey: "channels.settingsFiles" },
  { id: "memory", icon: Heart, labelKey: "channels.settingsMemory" },
];

/**
 * 频道详情页：与 Agent 详情页同级的独立设置页。
 *
 * 左栏是功能分区，右栏渲染对应设置内容：资料（头像/昵称/目标/成员）、
 * 指令（频道级共享指令）、技能（频道自己的技能，成员共享）、任务（频道投研历史）。
 */
export function ChannelSettingsScreen({
  channel,
  tabIntent,
  onTabIntentConsumed,
}: {
  channel: Channel;
  /** 从右侧栏 / 菜单跳进来时指定要打开的分区。 */
  tabIntent?: ChannelSettingsTab | null;
  onTabIntentConsumed?: () => void;
}) {
  const { t } = useTranslation();
  const { updateChannel, deleteChannel } = useChannels();
  const { notify } = useWorkspace();
  const { width: windowWidth } = useWindowDimensions();
  const [tab, setTab] = useState<ChannelSettingsTab>("profile");
  useEffect(() => {
    if (!tabIntent) return;
    setTab(tabIntent);
    onTabIntentConsumed?.();
  }, [tabIntent, onTabIntentConsumed]);
  const [width, setWidth] = useState(windowWidth);
  const stacked = width < breakpoints.mobile;
  const narrowViewport = windowWidth < breakpoints.mobile;
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];

  // 资料页的本地编辑态：头像、昵称、研究目标。
  const [avatar, setAvatar] = useState<ChannelAvatarId>(normalizeChannelAvatar(channel.avatar));
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  // 指令页的本地编辑态。
  const [instructions, setInstructions] = useState(channel.instructions ?? "");
  // 删除频道二次确认：不可恢复，需用户显式确认。
  const [confirmDelete, setConfirmDelete] = useState(false);

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
            {/* 与 Agent 详情「指令」页同一套编辑器：可编辑、Markdown 预览、保存。 */}
            <InstructionsEditor
              value={instructions}
              onChange={setInstructions}
              accessibilityLabel={t("channels.settingsInstructions")}
              onSave={saveInstructions}
            />
          </View>
        );
      case "skills":
        return <ChannelSkillsPanel channel={channel} />;
      case "connectors":
        return <ChannelConnectorsPanel channel={channel} />;
      case "files":
        return <ChannelFilesPanel channel={channel} />;
      case "tasks":
        return <ChannelTasksPanel channel={channel} />;
      case "memory":
        return <ChannelMemoryPanel channel={channel} />;
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
            {/* 双列等宽：左「保存频道信息」，右「删除频道」（danger 色区分）。 */}
            <View style={[s.row, { gap: 10, marginTop: space.md, alignItems: "stretch" }]}>
              <View style={{ flex: 1 }}>
                <Button primary disabled={!name.trim()} onPress={saveProfile}>
                  {t("channels.saveChannel")}
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button danger onPress={() => setConfirmDelete(true)}>
                  {t("channels.deleteTitle")}
                </Button>
              </View>
            </View>
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
              <AgentOrb avatar={normalizeChannelAvatar(channel.avatar)} size={38} />
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

      {/* 删除频道确认弹窗：智能体本身会保留，但频道不可恢复。 */}
      {confirmDelete && (
        <ModalOverlay visible onRequestClose={() => setConfirmDelete(false)}>
          <Pressable onPress={() => setConfirmDelete(false)} style={s.modalShade}>
            <Pressable
              accessibilityViewIsModal
              onPress={(event) => event.stopPropagation()}
              style={[s.card, { maxWidth: 360, width: "100%", padding: 22, gap: 10 }]}
            >
              <Text style={s.heading}>{t("channels.deleteTitle")}</Text>
              <Text style={s.muted}>{t("channels.deleteConfirm")}</Text>
              <View style={[s.row, { gap: 10, marginTop: 8 }]}>
                <Button style={{ flex: 1, minHeight: 44 }} onPress={() => setConfirmDelete(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  danger
                  style={{ flex: 1, minHeight: 44 }}
                  onPress={() => {
                    void deleteChannel(channel.id);
                    setConfirmDelete(false);
                  }}
                >
                  {t("channels.deleteAction")}
                </Button>
              </View>
            </Pressable>
          </Pressable>
        </ModalOverlay>
      )}
    </View>
  );
}

/** 资料页的成员列表：频道成员 Agent 的头像 + 名称 + 角色，支持再次添加成员。 */
function ChannelMembersPanel({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { agents } = useAgentSpace();
  const { updateChannel } = useChannels();
  const { notify } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const currentLeaderId =
    channel.leaderId && channel.agentIds.includes(channel.leaderId)
      ? channel.leaderId
      : channel.agentIds[0];
  const members = useMemo(() => {
    const orderedIds = [
      currentLeaderId,
      ...channel.agentIds.filter((id) => id !== currentLeaderId),
    ];
    return orderedIds
      .map((id) => agents.find((a) => a.id === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
  }, [agents, channel.agentIds, currentLeaderId]);

  // 候选：尚未加入频道的智能体；频道上限 10 人，已满则不再提供可选项。
  const MAX_MEMBERS = 10;
  const remaining = Math.max(0, MAX_MEMBERS - channel.agentIds.length);
  const candidates = useMemo(
    () => (remaining > 0 ? agents.filter((a) => !channel.agentIds.includes(a.id)) : []),
    [agents, channel.agentIds, remaining],
  );

  const openAdd = () => {
    setSelectedIds([]);
    setError("");
    setAdding(true);
  };
  const toggle = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  async function submit() {
    setError("");
    if (!selectedIds.length) return;
    // 并发 + 上限双保险：合并后不得超过 10 人。
    const merged = [...new Set([...channel.agentIds, ...selectedIds])];
    if (merged.length > MAX_MEMBERS) {
      setError(t("channels.addMembersLimit"));
      return;
    }
    setBusy(true);
    try {
      await updateChannel(channel.id, { agentIds: merged });
      notify(t("channels.addMembersSuccess"));
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // 至少保留 2 位成员（与后端 channelUpdateSchema 的 min(2) 一致）。
  const atMinimum = channel.agentIds.length <= 2;
  const canRemove = (member: { id: string }) => !atMinimum && channel.agentIds.includes(member.id);

  async function confirmRemove() {
    if (!removing) return;
    // 下限双保险：并发场景下再次校验，避免删到只剩 1 人。
    if (channel.agentIds.length <= 2) {
      setError(t("channels.removeMemberMin"));
      setRemoving(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateChannel(channel.id, {
        agentIds: channel.agentIds.filter((id) => id !== removing.id),
      });
      notify(t("channels.removeMemberSuccess"));
      setRemoving(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function setLeader(member: { id: string; name: string }) {
    if (member.id === currentLeaderId) return;
    setBusy(true);
    setError("");
    try {
      await updateChannel(channel.id, { leaderId: member.id });
      notify(t("channels.setLeaderSuccess", { name: member.name }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
        <Text style={[s.heading, { fontSize: 14 }]}>{t("channels.membersLabel")}</Text>
        <Button small icon={Plus} onPress={openAdd}>
          {t("channels.addMembers")}
        </Button>
      </View>
      {members.map((member) => (
        <View key={member.id} style={[s.row, { gap: 10, alignItems: "center" }]}>
          <AgentOrb avatar={member.avatar} size={30} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={[s.row, { gap: 6, alignItems: "center" }]}>
              <Text style={[s.text, { fontWeight: "600" }]}>{member.name}</Text>
              {member.id === currentLeaderId && (
                <Text style={[s.small, { color: colors.primaryStrong, fontWeight: "600" }]}>
                  {t("channels.leader")}
                </Text>
              )}
            </View>
            <Text style={[s.small, { color: colors.faint }]}>{member.role}</Text>
          </View>
          <View style={[s.row, { gap: 8, alignItems: "center" }]}>
            {member.id !== currentLeaderId && (
              <Button small disabled={busy} onPress={() => void setLeader(member)}>
                {t("channels.setLeader")}
              </Button>
            )}
            <Button
              small
              danger
              icon={CircleMinus}
              disabled={!canRemove(member) || busy}
              onPress={() => setRemoving({ id: member.id, name: member.name })}
            >
              {t("channels.removeMember")}
            </Button>
          </View>
        </View>
      ))}
      {atMinimum && (
        <Text style={[s.small, { color: colors.faint }]}>{t("channels.removeMemberMin")}</Text>
      )}

      {adding && (
        <Sheet title={t("channels.addMembersTitle")} onClose={() => setAdding(false)}>
          <View style={{ gap: 12 }}>
            <Text style={[s.small, { color: colors.faint }]}>{t("channels.addMembersHint")}</Text>
            {candidates.length ? (
              <View style={{ gap: 2 }}>
                {candidates.map((agent) => (
                  <View key={agent.id} style={[s.row, { gap: 10, alignItems: "center" }]}>
                    <AgentOrb avatar={agent.avatar} size={28} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <CheckRow
                        label={`${agent.name}${agent.role ? ` · ${agent.role}` : ""}`}
                        checked={selectedIds.includes(agent.id)}
                        onPress={() => toggle(agent.id)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={s.muted}>{t("channels.addMembersNoCandidates")}</Text>
            )}
            <ErrorNotice error={error} />
            <Button
              primary
              busy={busy}
              disabled={!selectedIds.length}
              onPress={() => void submit()}
            >
              {t("channels.addMembers")}
            </Button>
          </View>
        </Sheet>
      )}

      {removing && (
        <ModalOverlay visible onRequestClose={() => setRemoving(null)}>
          <Pressable onPress={() => setRemoving(null)} style={s.modalShade}>
            <Pressable
              accessibilityViewIsModal
              onPress={(event) => event.stopPropagation()}
              style={[s.card, { maxWidth: 360, width: "100%", padding: 22, gap: 10 }]}
            >
              <Text style={s.heading}>{t("channels.removeMember")}</Text>
              <Text style={s.muted}>
                {t("channels.removeMemberConfirm", { name: removing.name })}
              </Text>
              <ErrorNotice error={error} />
              <View style={[s.row, { gap: 10, marginTop: 8 }]}>
                <Button style={{ flex: 1, minHeight: 44 }} onPress={() => setRemoving(null)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  danger
                  busy={busy}
                  style={{ flex: 1, minHeight: 44 }}
                  onPress={() => void confirmRemove()}
                >
                  {t("channels.removeMember")}
                </Button>
              </View>
            </Pressable>
          </Pressable>
        </ModalOverlay>
      )}
    </View>
  );
}

/**
 * 技能页：**这个频道自己的技能**，与成员智能体各自的能力互相独立。
 *
 * 版式与 Agent 详情「技能」页完全一致（右上角「+ 添加技能」+ 自适应卡片网格 +
 * 卡片内「移除」），区别只在归属：技能挂在频道上，添加后对全体成员共享
 * （频道群聊编排时注入到每位成员的提示词），移除也只从频道摘掉。
 */
function ChannelSkillsPanel({ channel }: { channel: Channel }) {
  const { t, locale } = useTranslation();
  const { skillLibrary } = useAgentSpace();
  const { updateChannel } = useChannels();
  const { notify } = useWorkspace();
  /** 技能库视图：点「+ 添加技能」切进来挑选，挑完退回已挂列表。 */
  const [adding, setAdding] = useState(false);
  const [viewingCatalog, setViewingCatalog] = useState<SkillCatalogEntry>();
  const [viewingCustom, setViewingCustom] = useState<AgentSkill>();
  const zh = locale === "zh-Hans";

  // 频道技能全部读自己的两个字段：目录 id 列表 + 账户技能库引用，不看成员 Agent。
  const installedIds = channel.installedSkills ?? [];
  const sharedRefIds = channel.skillRefs ?? [];
  const catalogSkills = installedIds
    .map((id) => skillCatalog.find((skill) => skill.id === id))
    .filter((skill): skill is (typeof skillCatalog)[number] => Boolean(skill));
  const sharedCustomSkills = sharedRefIds
    .map((id) => skillLibrary.find((skill) => skill.id === id))
    .filter((skill): skill is AgentSkill => Boolean(skill));

  /** 写回频道技能：目录技能进 `installedSkills`，自建技能进 `skillRefs`。 */
  const writeSkills = (patch: { installedSkills?: string[]; skillRefs?: string[] }) => {
    void updateChannel(channel.id, patch);
  };
  const toast = (title: string, installed: boolean) =>
    notify(
      t(installed ? "agent.skillInstalledToast" : "agent.skillUninstalledToast", {
        title,
        agent: channel.name,
      }),
    );

  const toggleCatalog = (skill: SkillCatalogEntry, installed: boolean) => {
    writeSkills({
      installedSkills: installed
        ? [...new Set([...installedIds, skill.id])]
        : installedIds.filter((id) => id !== skill.id),
    });
    toast(zh ? skill.titleZh : skill.titleEn, installed);
  };
  const toggleCustom = (skill: AgentSkill, installed: boolean) => {
    writeSkills({
      skillRefs: installed
        ? [...new Set([...sharedRefIds, skill.id])]
        : sharedRefIds.filter((id) => id !== skill.id),
    });
    toast(skill.name, installed);
  };

  /** 卡片上的「移除」：只把技能从这个频道摘掉，Agent 自己的技能与技能库原件都不动。 */
  const removeCatalog = (skill: SkillCatalogEntry) => {
    setViewingCatalog(undefined);
    toggleCatalog(skill, false);
  };
  const removeCustom = (skill: AgentSkill) => {
    setViewingCustom(undefined);
    toggleCustom(skill, false);
  };

  const cards: { key: string; node: ReactNode }[] = [
    ...sharedCustomSkills.map((skill) => ({
      key: `custom:${skill.id}`,
      node: (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={skill.name}
          onPress={() => setViewingCustom(skill)}
          style={({ pressed }) => ({
            flex: 1,
            padding: 14,
            borderRadius: 15,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: pressed ? colors.surface : colors.paper,
            gap: 7,
          })}
        >
          <View style={s.between}>
            <Text style={[s.text, { flex: 1, minWidth: 0, fontWeight: "600" }]}>{skill.name}</Text>
            <SkillRemoveButton skillName={skill.name} onRemove={() => removeCustom(skill)} />
          </View>
          <Text style={s.small}>{skill.purpose || t("agentSpace.skillInstructions")}</Text>
        </Pressable>
      ),
    })),
    ...catalogSkills.map((skill) => {
      const title = zh ? skill.titleZh : skill.titleEn;
      return {
        key: `catalog:${skill.id}`,
        node: (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={title}
            onPress={() => setViewingCatalog(skill)}
            style={({ pressed }) => ({
              flex: 1,
              padding: 14,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: pressed ? colors.surface : colors.paper,
              gap: 7,
            })}
          >
            <View style={s.between}>
              <Text numberOfLines={1} style={[s.text, { flex: 1, minWidth: 0, fontWeight: "600" }]}>
                {title}
              </Text>
              <SkillRemoveButton skillName={title} onRemove={() => removeCatalog(skill)} />
            </View>
            <Text numberOfLines={2} style={s.small}>
              {zh ? skill.descriptionZh : skill.descriptionEn}
            </Text>
          </Pressable>
        ),
      };
    }),
  ];

  // 添加技能视图：与 Agent 详情「技能 → 添加技能」同一版式——
  // 左上角 `‹ 返回` 切回已挂列表，下面直接铺技能库（提示 / 搜索 / 双列格子）。
  if (adding)
    return (
      <View style={{ gap: 2 }}>
        <BotInlineBack label={t("common.back")} onPress={() => setAdding(false)} />
        <SkillLibraryPanel
          installedCatalogIds={installedIds}
          isCustomInstalled={(skill) => sharedRefIds.includes(skill.id)}
          onToggleCatalog={toggleCatalog}
          onToggleCustom={toggleCustom}
          onViewCatalogDetail={setViewingCatalog}
          onViewCustomDetail={setViewingCustom}
        />
        {/* 详情弹层：频道里的技能不提供「安装到某个智能体」，因此只读展示说明。 */}
        {viewingCatalog && (
          <SkillDetailSheet skill={viewingCatalog} onClose={() => setViewingCatalog(undefined)} />
        )}
        {viewingCustom && (
          <MySkillDetailSheet
            title={viewingCustom.name}
            skill={viewingCustom}
            onClose={() => setViewingCustom(undefined)}
          />
        )}
      </View>
    );

  return (
    <View style={{ gap: 8 }}>
      <SkillSectionCard
        description={t("channels.skillsHint")}
        countLabel={t("agentSpace.skillCount", { count: cards.length })}
        emptyTitle={t("agentSpace.skillEmptyTitle")}
        emptyDetail={t("channels.skillsEmpty")}
        addLabel={t("agentSpace.addSkill")}
        onAdd={() => setAdding(true)}
      >
        {cards.length ? (
          <CardGrid
            items={cards}
            minColumnWidth={300}
            getKey={(card) => card.key}
            render={(card) => card.node}
          />
        ) : null}
      </SkillSectionCard>
      {viewingCatalog && (
        <SkillDetailSheet skill={viewingCatalog} onClose={() => setViewingCatalog(undefined)} />
      )}
      {viewingCustom && (
        <MySkillDetailSheet
          title={viewingCustom.name}
          skill={viewingCustom}
          onClose={() => setViewingCustom(undefined)}
        />
      )}
    </View>
  );
}

/**
 * 连接页：**这个频道自己的连接**，与成员智能体各自的连接互相独立。
 *
 * 版式与 Agent 详情「连接」页完全一致（右上角「+ 添加连接」+ 自适应卡片网格 +
 * 卡片内「移除」），区别只在归属：连接挂在频道上，添加后对全体成员共享
 * （频道群聊编排时注入到每位成员的可用连接），移除也只从频道摘掉。
 * 只允许勾选已连接的连接，未连接的连接器置灰，与输入区选择弹层同一套判定。
 */
function ChannelConnectorsPanel({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { workspace, api, notify } = useWorkspace();
  const { updateChannel } = useChannels();
  const appConnectors = useAppConnectors(api);
  /** 连接库视图：点「+ 添加连接」切进来挑选，挑完退回已挂列表。 */
  const [adding, setAdding] = useState(false);
  // 连接库 = 工作区内置连接器 + 账户级应用连接器，按 id 去重、已连接优先。
  const options = allConnectorOptions(connectorOptions(workspace), appConnectors.items);
  const installedIds = channel.installedConnectors ?? [];
  const assigned = installedIds
    .map((id) => options.find((option) => option.id === id))
    .filter((option): option is ConnectorOption => Boolean(option));

  const toggle = (id: string, installed: boolean) => {
    void updateChannel(channel.id, {
      installedConnectors: installed
        ? [...new Set([...installedIds, id])]
        : installedIds.filter((x) => x !== id),
    });
    const option = options.find((item) => item.id === id);
    notify(
      t(installed ? "agent.connectorInstalledToast" : "agent.connectorUninstalledToast", {
        name: option?.name ?? id,
        agent: channel.name,
      }),
    );
  };

  /** 卡片上的「移除」：只把连接从这个频道摘掉，Agent 自己的连接与连接库原件都不动。 */
  const remove = (option: ConnectorOption) => {
    if (!installedIds.includes(option.id)) return;
    toggle(option.id, false);
  };

  // 添加连接视图：与 Agent 详情「连接 → 添加连接」同一版式——
  // 左上角 `‹ 返回` 切回已挂列表，下面直接铺连接库（提示 / 搜索 / 卡片格子）。
  if (adding)
    return (
      <View style={{ gap: 2 }}>
        <BotInlineBack label={t("common.back")} onPress={() => setAdding(false)} />
        <ConnectorLibraryPanel installedIds={installedIds} onToggle={toggle} />
      </View>
    );

  const cards: { key: string; node: ReactNode }[] = assigned.map((option) => ({
    key: option.id,
    // 连接没有详情弹层，卡片只做只读展示：品牌色图标 + 名称 + 说明 + 连接状态 + 移除。
    node: (
      <View
        style={{
          flex: 1,
          padding: 14,
          borderRadius: 15,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.paper,
          gap: 7,
        }}
      >
        <View style={s.between}>
          <View style={[s.row, { flex: 1, minWidth: 0, gap: 10 }]}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: option.iconSurface ?? colors.surfaceSoft,
              }}
            >
              <option.icon size={16} color={option.iconColor ?? colors.muted} />
            </View>
            <Text numberOfLines={1} style={[s.text, { flex: 1, minWidth: 0, fontWeight: "600" }]}>
              {option.name}
            </Text>
          </View>
          <ConnectorRemoveButton name={option.name} onRemove={() => remove(option)} />
        </View>
        <Text numberOfLines={2} style={s.small}>
          {option.detail}
        </Text>
        <View>
          <StatusBadge
            tone={option.connected ? "done" : "paused"}
            label={t(
              option.connected
                ? "agent.hubConnectorStateConnected"
                : "agent.hubConnectorStateDisconnected",
            )}
            style={{ borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}
          />
        </View>
      </View>
    ),
  }));

  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.muted, { lineHeight: 21 }]}>{t("channels.connectorsHint")}</Text>
      <View style={[s.between, { alignItems: "center", marginBottom: 5, gap: 12 }]}>
        <Text style={s.small}>{t("agentSpace.connectorCount", { count: assigned.length })}</Text>
        <Button primary icon={Plus} onPress={() => setAdding(true)}>
          {t("agentSpace.addConnector")}
        </Button>
      </View>
      {assigned.length ? (
        <CardGrid
          items={cards}
          minColumnWidth={300}
          getKey={(card) => card.key}
          render={(card) => card.node}
        />
      ) : (
        <View style={{ gap: 8, alignItems: "center", paddingVertical: 24 }}>
          <Link2 size={28} color={colors.faint} />
          <Text style={[s.muted, { textAlign: "center", lineHeight: 22 }]}>
            {t("channels.connectorsEmpty")}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * 任务页：这个频道的投研任务历史（input.channelId 关联）。
 *
 * 版式与 Agent 详情「任务」页完全一致：同样的自适应卡片网格 + 同一张任务卡，
 * 双列时卡片切纵向版式，状态、时间、目标链接都由 `TaskCard` 统一呈现。
 */
function ChannelTasksPanel({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
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
    <CardGrid
      items={tasks}
      // 与 Agent 详情「任务」页同一档：正文列约 690px，280 的下限才能稳定排成双列。
      minColumnWidth={280}
      getKey={(task) => task.id}
      render={(task, _index, { columns }) => <TaskCard task={task} compact stacked={columns > 1} />}
    />
  );
}

/** 文件页：这个频道投研任务产出的文件与产物（与 Agent 详情「资料」页同一版式）。 */
function ChannelFilesPanel({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { workspace, open, api, notify } = useWorkspace();
  // 同一个资料库里可能连着点开多个文件，忙碌状态按 id 记录，避免互相挡住。
  const [busyId, setBusyId] = useState<string | null>(null);
  const [chatFileIds, setChatFileIds] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void api
      .request<ChannelMessage[]>(`/api/channels/${encodeURIComponent(channel.id)}/messages`)
      .then((messages) => {
        if (!alive) return;
        setChatFileIds([...new Set(messages.flatMap((message) => message.attachmentIds ?? []))]);
      })
      .catch(() => {
        if (alive) setChatFileIds([]);
      });
    return () => {
      alive = false;
    };
  }, [api, channel.id]);

  // 频道范围：对话里附过的文件，以及这个频道任务带上的文件和产物。
  const { files, artifacts } = useMemo(() => {
    const tasks = (data?.tasks ?? []).filter(
      (task) => typeof task.input?.channelId === "string" && task.input.channelId === channel.id,
    );
    const taskIds = new Set(tasks.map((task) => task.id));
    const fileIds = new Set([...tasks.flatMap((task) => task.artifactIds), ...chatFileIds]);
    return {
      files: workspace.files.filter((file) => fileIds.has(file.id)),
      artifacts: (data?.artifacts ?? []).filter((artifact) => taskIds.has(artifact.taskId)),
    };
  }, [chatFileIds, data?.tasks, data?.artifacts, workspace.files, channel.id]);

  async function share(file: Artifact) {
    if (busyId) return;
    setBusyId(file.id);
    try {
      const result = await shareRemoteFile(api, file);
      notify(t(result === "saved" ? "screens.filesShareSaved" : "screens.filesShared"));
    } catch {
      notify(t("screens.filesShareFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function save(file: Artifact) {
    if (busyId) return;
    setBusyId(file.id);
    try {
      await saveRemoteFile(api, file);
      notify(t("screens.filesExported", { name: file.name }));
    } catch {
      notify(t("screens.filesExportFailed"));
    } finally {
      setBusyId(null);
    }
  }

  if (!files.length && !artifacts.length) {
    return (
      <View style={{ gap: 8, alignItems: "center", paddingVertical: 18 }}>
        <FolderOpen size={28} color={colors.faint} />
        <Text style={[s.muted, { textAlign: "center" }]}>{t("channels.filesEmpty")}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {!!files.length && (
        <>
          <SectionHeading title={t("screens.libraryFiles")} count={files.length} />
          <CardGrid
            items={files}
            minColumnWidth={300}
            getKey={(file) => file.id}
            render={(file) => (
              <View style={[s.row, { gap: 2 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <LinkRow
                    icon={FileText}
                    title={file.name}
                    onPress={() => open({ type: "file", file })}
                  />
                </View>
                <IconButton
                  icon={Share2}
                  label={t("screens.filesShare", { name: file.name })}
                  size={32}
                  onPress={() => void share(file)}
                />
                <IconButton
                  icon={ArrowDownToLine}
                  label={t("screens.filesDownload", { name: file.name })}
                  size={32}
                  onPress={() => void save(file)}
                />
              </View>
            )}
          />
        </>
      )}
      {!!artifacts.length && (
        <>
          <SectionHeading title={t("agentSpace.artifacts")} count={artifacts.length} />
          <CardGrid
            items={artifacts}
            minColumnWidth={300}
            getKey={(artifact) => artifact.id}
            render={(artifact) => <ArtifactCard artifact={artifact} />}
          />
        </>
      )}
    </View>
  );
}

/**
 * 记忆页：频道专属记忆。
 *
 * 记忆按 `agentId` 字段隔离，这里复用同一隔离口径、以频道 id 作为作用域键，
 * 因此频道记忆既独立于各 Agent，又能在编排时被成员读到。
 */
function ChannelMemoryPanel({ channel }: { channel: Channel }) {
  return (
    <View style={{ gap: 8 }}>
      {/* channel 标记让简介使用频道专属文案（"这些记忆属于当前频道…"），
          Agent 详情页的记忆简介不受影响。 */}
      <PreferencesScreen embedded channel agentId={channel.id} emptyAdd={false} />
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
