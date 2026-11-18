import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import type { Channel } from "../../../../packages/domain/src/channel";
import { useAgentSpace } from "../agent-space";
import { type AgentDefinition, type AgentSkill, heldCustomSkills } from "../agent-space-model";
import { Text } from "../app-text";
import { MySkillDetailSheet, SkillDetailSheet } from "../capability-hub";
import { CardGrid } from "../card-grid";
import { useChannels } from "../channels";
import { useTranslation } from "../i18n";
import { Brain, Plus } from "../icons";
import { type SkillCatalogEntry, skillCatalog } from "../skill-catalog";
import { SkillEditor } from "../skill-editor";
import { SkillLibraryPanel, SkillRemoveButton } from "../skill-library-panel";
import { findSkillCopy, skillHolderAgentIds, toggleSkillShare } from "../skill-sharing";
import { Button, colors, s } from "../ui";
import { useWorkspace } from "../workspace";
import { BotInlineBack, BotPage, type BotPageProps } from "./shared";

export function BotSkillsPage({ onClose, embedded }: BotPageProps) {
  const { t, locale } = useTranslation();
  const {
    agents: agentList,
    current,
    deleteSkill,
    setSkillRef,
    setSkillInstalled,
    skillLibrary,
  } = useAgentSpace();
  const { channels, updateChannel } = useChannels();
  const { notify } = useWorkspace();
  /** 只用于编辑已有自建技能；创建入口统一收在「应用与能力 → 技能」。 */
  const [editingSkill, setEditingSkill] = useState<AgentSkill>();
  const [adding, setAdding] = useState(false);
  /** 自建技能详情：与「应用与能力 → 我的技能」共用同一版式。 */
  const [viewingCustom, setViewingCustom] = useState<AgentSkill>();
  /** 技能库技能详情：与「应用与能力 → 技能市场」共用版式及「添加到智能体」。 */
  const [viewingCatalog, setViewingCatalog] = useState<SkillCatalogEntry>();
  const zh = locale === "zh-Hans";
  const installedEntries = current.installedSkills
    .map((id) => skillCatalog.find((skill) => skill.id === id))
    .filter((skill): skill is (typeof skillCatalog)[number] => Boolean(skill));

  /** 「添加到智能体」展示全部 Agent，含当前 Agent（技能创建于它，天然已添加）。 */
  const shareAddedIds = viewingCustom ? skillHolderAgentIds(agentList, viewingCustom) : [];
  const shareAddedChannelIds = viewingCustom
    ? channels
        .filter((channel) => (channel.skillRefs ?? []).includes(viewingCustom.id))
        .map((channel) => channel.id)
    : [];

  /**
   * 「添加到智能体」：与「应用与能力 → 我的技能」共用同一套判定与切换逻辑。
   * 此处不做只读保护，所有智能体（含当前 Agent）都可以自由安装或移除；
   * 删除技能仍走卡片上的删除入口。
   */
  const toggleSkillInAgent = (agent: AgentDefinition) => {
    if (!viewingCustom) return;
    const action = toggleSkillShare({ setSkillRef, deleteSkill }, agent, viewingCustom);
    notify(
      t(action === "added" ? "agent.skillInstalledToast" : "agent.skillUninstalledToast", {
        title: viewingCustom.name,
        agent: agent.name,
      }),
    );
  };

  const toggleSkillInChannel = (channel: Channel) => {
    if (!viewingCustom) return;
    const installed = (channel.skillRefs ?? []).includes(viewingCustom.id);
    void updateChannel(channel.id, {
      skillRefs: installed
        ? (channel.skillRefs ?? []).filter((id) => id !== viewingCustom.id)
        : [...new Set([...(channel.skillRefs ?? []), viewingCustom.id])],
    });
    notify(
      t(installed ? "agent.skillUninstalledToast" : "agent.skillInstalledToast", {
        title: viewingCustom.name,
        agent: channel.name,
      }),
    );
  };

  /**
   * 技能库技能的「添加到智能体」：按智能体逐一开关安装状态，
   * 与「应用与能力 → 技能市场」的详情弹层共用同一套判定与提示。
   */
  const toggleCatalogSkillInstall = (agent: AgentDefinition) => {
    if (!viewingCatalog) return;
    const installed = agent.installedSkills.includes(viewingCatalog.id);
    setSkillInstalled(agent.id, viewingCatalog.id, !installed);
    notify(
      t(installed ? "agent.skillUninstalledToast" : "agent.skillInstalledToast", {
        title: zh ? viewingCatalog.titleZh : viewingCatalog.titleEn,
        agent: agent.name,
      }),
    );
  };

  const toggleCatalogSkillInstallInChannel = (channel: Channel) => {
    if (!viewingCatalog) return;
    const installed = (channel.installedSkills ?? []).includes(viewingCatalog.id);
    void updateChannel(channel.id, {
      installedSkills: installed
        ? (channel.installedSkills ?? []).filter((id) => id !== viewingCatalog.id)
        : [...new Set([...(channel.installedSkills ?? []), viewingCatalog.id])],
    });
    notify(
      t(installed ? "agent.skillUninstalledToast" : "agent.skillInstalledToast", {
        title: zh ? viewingCatalog.titleZh : viewingCatalog.titleEn,
        agent: channel.name,
      }),
    );
  };

  /**
   * 卡片上的「移除」：只是把这份技能从**当前智能体的能力**里摘掉，点击即生效、不弹确认。
   *
   * 走 `deleteSkill`（= `detachSkillFromAgent`），只删当前 Agent 的副本：
   * 「应用与能力 → 我的技能」里的技能库原件、以及其它智能体上的副本都不受影响，
   * 需要时随时可以用「添加技能」把它重新挂回来。提示文案特意点明这一点。
   */
  const removeCustomSkill = (skill: AgentSkill) => {
    setViewingCustom(undefined);
    setSkillRef(current.id, skill.id, false);
    if (current.customSkills.some((item) => item.id === skill.id))
      deleteSkill(current.id, skill.id);
    notify(t("agent.skillDetachedToast", { title: skill.name, agent: current.name }));
  };
  const customSkills = heldCustomSkills(current, skillLibrary);

  /**
   * 卡片上的「移除」：目录技能只取消当前 Agent 的安装状态，技能本身仍留在技能库，
   * 其它智能体不受影响，随时可用「添加技能」重新装回来，同样点击即生效。
   */
  const removeCatalogSkill = (skill: SkillCatalogEntry) => {
    setSkillInstalled(current.id, skill.id, false);
    notify(
      t("agent.skillUninstalledToast", {
        title: zh ? skill.titleZh : skill.titleEn,
        agent: current.name,
      }),
    );
  };

  if (editingSkill)
    return (
      <BotPage
        title={t("agentSpace.editSkill")}
        onClose={() => setEditingSkill(undefined)}
        embedded={embedded}
      >
        {embedded && (
          <BotInlineBack label={t("common.back")} onPress={() => setEditingSkill(undefined)} />
        )}
        <SkillEditor
          library={skillLibrary.some((skill) => skill.id === editingSkill.id)}
          skill={editingSkill}
          onClose={() => setEditingSkill(undefined)}
        />
      </BotPage>
    );
  if (adding)
    return (
      <BotPage title={t("agentSpace.addSkill")} onClose={onClose} embedded={embedded}>
        {embedded && (
          <BotInlineBack
            label={t("common.back")}
            onPress={() => {
              setViewingCatalog(undefined);
              setViewingCustom(undefined);
              setAdding(false);
            }}
          />
        )}
        <SkillLibraryPanel
          installedCatalogIds={current.installedSkills}
          isCustomInstalled={(skill) =>
            current.skillRefs.includes(skill.id) || Boolean(findSkillCopy(current, skill))
          }
          onToggleCatalog={(skill, installed) => setSkillInstalled(current.id, skill.id, installed)}
          onToggleCustom={(skill) => {
            const action = toggleSkillShare({ setSkillRef, deleteSkill }, current, skill);
            if (action === "blocked") return;
            notify(
              t(action === "added" ? "agent.skillInstalledToast" : "agent.skillUninstalledToast", {
                title: skill.name,
                agent: current.name,
              }),
            );
          }}
          onViewCatalogDetail={setViewingCatalog}
          onViewCustomDetail={setViewingCustom}
        />
        {/* 详情图标 / 长按打开完整说明：内置技能与自建技能各自的详情弹层。 */}
        {viewingCatalog && (
          <SkillDetailSheet
            skill={viewingCatalog}
            agents={agentList}
            channels={channels}
            onToggleInstallAgent={toggleCatalogSkillInstall}
            onToggleInstallChannel={toggleCatalogSkillInstallInChannel}
            onClose={() => setViewingCatalog(undefined)}
          />
        )}
        {viewingCustom && (
          <MySkillDetailSheet
            title={viewingCustom.name}
            skill={viewingCustom}
            onClose={() => setViewingCustom(undefined)}
          />
        )}
      </BotPage>
    );
  // 自建技能与从技能库安装的技能同列展示，合并成一个列表交给两列网格。
  const skillCards: { key: string; node: ReactNode }[] = [
    ...customSkills.map((skill) => ({
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
            {/* 用户自建的技能不再提供启停开关，右侧直接给出移除入口。 */}
            <SkillRemoveButton skillName={skill.name} onRemove={() => removeCustomSkill(skill)} />
          </View>
          <Text style={s.small}>{skill.purpose || t("agentSpace.skillInstructions")}</Text>
        </Pressable>
      ),
    })),
    ...installedEntries.map((skill) => {
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
              <SkillRemoveButton skillName={title} onRemove={() => removeCatalogSkill(skill)} />
            </View>
            <Text numberOfLines={2} style={s.small}>
              {zh ? skill.descriptionZh : skill.descriptionEn}
            </Text>
          </Pressable>
        ),
      };
    }),
  ];
  return (
    <BotPage title={t("agentSpace.skills")} onClose={onClose} embedded={embedded}>
      <View style={{ gap: 8 }}>
        <View style={{ alignItems: "flex-end", marginBottom: 5 }}>
          <Button small icon={Plus} onPress={() => setAdding(true)}>
            {t("agentSpace.addSkill")}
          </Button>
        </View>
        <View
          // 外层不再套卡片样式：去掉外框线，技能卡自带描边，间距与层级不受影响。
          style={{ padding: 20, borderRadius: 18 }}
        >
          {skillCards.length ? (
            <CardGrid
              items={skillCards}
              minColumnWidth={300}
              getKey={(card) => card.key}
              render={(card) => card.node}
            />
          ) : (
            <View style={{ gap: 8, alignItems: "center", paddingVertical: 24 }}>
              <Brain size={28} color={colors.faint} />
              <Text style={[s.muted, { textAlign: "center", lineHeight: 22 }]}>
                {t("agentSpace.skillEmpty")}
              </Text>
            </View>
          )}
        </View>
      </View>
      {viewingCustom && (
        <MySkillDetailSheet
          title={viewingCustom.name}
          skill={viewingCustom}
          agents={agentList}
          channels={channels}
          addedAgentIds={shareAddedIds}
          addedChannelIds={shareAddedChannelIds}
          onToggleAddAgent={toggleSkillInAgent}
          onToggleAddChannel={toggleSkillInChannel}
          onClose={() => setViewingCustom(undefined)}
          footer={
            <Button
              primary
              onPress={() => {
                const target = viewingCustom;
                setViewingCustom(undefined);
                setEditingSkill(target);
              }}
            >
              {t("agentSpace.editSkill")}
            </Button>
          }
        />
      )}
      {viewingCatalog && (
        <SkillDetailSheet
          skill={viewingCatalog}
          agents={agentList}
          channels={channels}
          onToggleInstallAgent={toggleCatalogSkillInstall}
          onToggleInstallChannel={toggleCatalogSkillInstallInChannel}
          onClose={() => setViewingCatalog(undefined)}
        />
      )}
    </BotPage>
  );
}
