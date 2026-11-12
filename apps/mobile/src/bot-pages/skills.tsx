import { type ReactNode, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useAgentSpace } from "../agent-space";
import { type AgentDefinition, type AgentSkill, heldCustomSkills } from "../agent-space-model";
import { Text, TextInput } from "../app-text";
import { MySkillDetailSheet, SkillDetailSheet } from "../capability-hub";
import { CardGrid } from "../card-grid";
import { useTranslation } from "../i18n";
import { FileText, Plus, Search } from "../icons";
import { type SkillCatalogEntry, skillCatalog } from "../skill-catalog";
import { SkillEditor } from "../skill-editor";
import { findSkillCopy, skillHolderAgentIds, toggleSkillShare } from "../skill-sharing";
import { StatusBadge } from "../status-badge";
import { Button, colors, radius, s } from "../ui";
import { useWorkspace } from "../workspace";
import { BotInlineBack, BotPage, type BotPageProps } from "./shared";

/** 两列网格 / 单列列表各自一次渲染的条数，避免把 180+ 条目录一次铺进页面。 */
const GRID_PAGE_SIZE = 120;
const LIST_PAGE_SIZE = 80;
/** 内容列宽达到该值才排两列，窄屏保持单列以免标题被挤没。 */
const GRID_MIN_WIDTH = 400;
/** 两列时格子之间的间距。 */
const GRID_GAP = 8;

/** 技能库的一条：内置目录技能与用户自建技能统一后的展示与操作数据。 */
type LibraryEntry = {
  key: string;
  title: string;
  description: string;
  installed: boolean;
  catalog?: SkillCatalogEntry;
  custom?: AgentSkill;
};

/**
 * 技能卡片右上角统一的「移除」入口：只从当前 Agent 移除这份技能，
 * 不影响技能本身或其它智能体。stopPropagation 避免同时打开卡片详情。
 */
function SkillRemoveButton({ skillName, onRemove }: { skillName: string; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t("agentSpace.removeSkill")} ${skillName}`}
      hitSlop={6}
      onPress={(event) => {
        event.stopPropagation();
        onRemove();
      }}
      style={({ pressed }) => ({
        height: 24,
        justifyContent: "center",
        paddingHorizontal: 9,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.errorSoft,
        backgroundColor: pressed ? colors.errorSoft : colors.paper,
      })}
    >
      <Text style={[s.small, { color: colors.danger, fontWeight: "600" }]}>
        {t("agentSpace.removeSkill")}
      </Text>
    </Pressable>
  );
}

/**
 * 技能库条目：宽屏两列只留标题 + 状态，窄屏单列补一行说明。
 * 点击安装 / 再次点击移除；长按打开详情看完整说明。
 */
function SkillLibraryItem({
  title,
  description,
  installed,
  custom,
  grid,
  cellWidth,
  onToggle,
  onViewDetail,
}: {
  title: string;
  description: string;
  installed: boolean;
  /** 用户自建技能：标题前加「自建」小标签，与内置目录技能区分。 */
  custom?: boolean;
  grid: boolean;
  cellWidth: number;
  onToggle: () => void;
  onViewDetail: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={custom ? `${t("agentSpace.addSkillCustomTag")} · ${title}` : title}
      accessibilityHint={t("agentSpace.addSkillDetailHint")}
      accessibilityState={{ checked: installed }}
      onPress={onToggle}
      onLongPress={onViewDetail}
      style={({ pressed }) => [
        s.row,
        {
          gap: 6,
          minHeight: grid ? 38 : 44,
          width: grid ? cellWidth : undefined,
          paddingHorizontal: 10,
          paddingVertical: grid ? 7 : 6,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.field,
          backgroundColor: installed ? colors.sky : pressed ? colors.surfaceSoft : colors.paper,
        },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <View style={[s.row, { gap: 5 }]}>
          {custom && (
            <View
              style={{
                paddingHorizontal: 4,
                paddingVertical: 1,
                borderWidth: 1,
                borderColor: colors.lineStrong,
                borderRadius: 4,
                backgroundColor: colors.surfaceSoft,
              }}
            >
              <Text style={[s.small, { fontSize: 10, lineHeight: 14 }]}>
                {t("agentSpace.addSkillCustomTag")}
              </Text>
            </View>
          )}
          <Text
            numberOfLines={1}
            style={[
              s.text,
              { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, fontWeight: "600" },
            ]}
          >
            {title}
          </Text>
        </View>
        {!grid && (
          <Text numberOfLines={1} style={[s.small, { lineHeight: 15 }]}>
            {description}
          </Text>
        )}
      </View>
      <View style={[s.row, { gap: 6 }]}>
        {/* 桌面端给一个看得见的详情入口；触摸端还可长按整格打开。 */}
        {grid && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("agentSpace.addSkillDetailHint")}
            hitSlop={4}
            onPress={(event) => {
              event.stopPropagation();
              onViewDetail();
            }}
            style={({ pressed }) => ({ padding: 2, opacity: pressed ? 0.6 : 1 })}
          >
            <FileText size={13} color={colors.faint} />
          </Pressable>
        )}
        {installed ? (
          <StatusBadge
            tone="done"
            label={t("agent.skillInstallInstalled")}
            style={{ borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}
          />
        ) : (
          <Plus size={13} color={colors.muted} />
        )}
      </View>
    </Pressable>
  );
}

/**
 * 技能库：内置目录技能 + 用户自建技能合并后，挑技能安装到当前 Agent。
 *
 * 自建技能跨 Agent 按内容去重后置顶，避免被 180+ 条内置目录淹没；
 * 宽屏排两列、窄屏单列补一行说明；描述不占版面但仍参与搜索。
 */
function SkillLibraryPanel({
  onViewCatalogDetail,
  onViewCustomDetail,
}: {
  onViewCatalogDetail: (skill: SkillCatalogEntry) => void;
  onViewCustomDetail: (skill: AgentSkill) => void;
}) {
  const { t, locale } = useTranslation();
  const { current, deleteSkill, setSkillRef, setSkillInstalled, skillLibrary } = useAgentSpace();
  const { notify } = useWorkspace();
  const { width: windowWidth } = useWindowDimensions();
  // 三栏布局下列宽远小于窗口宽，用 onLayout 的真实列宽决定单双列。
  const [width, setWidth] = useState(windowWidth);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const zh = locale === "zh-Hans";
  const keyword = query.trim().toLowerCase();
  const matches = (...values: string[]) =>
    !keyword || values.some((value) => value.toLowerCase().includes(keyword));

  // 自建技能来自账户级技能库：创建后即使没有任何 Agent 持有，也能在这里被添加到当前智能体。
  const customEntries: LibraryEntry[] = skillLibrary
    .filter((skill) => matches(skill.name, skill.purpose, skill.instructions, skill.outputFormat))
    .map((skill) => ({
      key: `custom:${skill.id}`,
      title: skill.name,
      description: skill.purpose || skill.instructions,
      installed: current.skillRefs.includes(skill.id) || Boolean(findSkillCopy(current, skill)),
      custom: skill,
    }));
  const catalogEntries: LibraryEntry[] = skillCatalog
    .filter((skill) =>
      matches(skill.titleZh, skill.titleEn, skill.descriptionZh, skill.descriptionEn, skill.id),
    )
    .map((skill) => ({
      key: `catalog:${skill.id}`,
      title: zh ? skill.titleZh : skill.titleEn,
      description: zh ? skill.descriptionZh : skill.descriptionEn,
      installed: current.installedSkills.includes(skill.id),
      catalog: skill,
    }));
  const filtered = [...customEntries, ...catalogEntries];
  const grid = width >= GRID_MIN_WIDTH;
  const visible = filtered.slice(0, grid ? GRID_PAGE_SIZE : LIST_PAGE_SIZE);
  const hidden = filtered.length - visible.length;
  const cellWidth = grid ? (width - GRID_GAP) / 2 : width;

  return (
    <View style={{ gap: 8 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Text style={[s.small, { lineHeight: 17 }]}>{t("agentSpace.addSkillHint")}</Text>
      <View
        style={[
          s.row,
          {
            gap: 8,
            minHeight: 36,
            paddingHorizontal: 11,
            borderWidth: 1,
            borderColor: focused ? colors.primary : colors.line,
            borderRadius: radius.field,
            backgroundColor: colors.paper,
          },
        ]}
      >
        <Search size={14} strokeWidth={1.7} color={colors.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t("agentSpace.addSkillSearch")}
          placeholderTextColor={colors.faint}
          accessibilityLabel={t("agentSpace.addSkillSearch")}
          style={{ flex: 1, minWidth: 0, paddingVertical: 0, color: colors.text, fontSize: 13 }}
        />
      </View>
      {visible.length ? (
        <View style={grid ? { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP } : { gap: 6 }}>
          {visible.map((entry) => (
            <SkillLibraryItem
              key={entry.key}
              title={entry.title}
              description={entry.description}
              installed={entry.installed}
              custom={Boolean(entry.custom)}
              grid={grid}
              cellWidth={cellWidth}
              onToggle={() => {
                if (entry.catalog) {
                  setSkillInstalled(current.id, entry.catalog.id, !entry.installed);
                  return;
                }
                if (!entry.custom) return;
                const action = toggleSkillShare(
                  { setSkillRef, deleteSkill },
                  current,
                  entry.custom,
                );
                if (action === "blocked") return;
                notify(
                  t(
                    action === "added"
                      ? "agent.skillInstalledToast"
                      : "agent.skillUninstalledToast",
                    { title: entry.custom.name, agent: current.name },
                  ),
                );
              }}
              onViewDetail={() => {
                if (entry.catalog) onViewCatalogDetail(entry.catalog);
                else if (entry.custom) onViewCustomDetail(entry.custom);
              }}
            />
          ))}
        </View>
      ) : (
        <Text style={[s.muted, { paddingVertical: 18 }]}>{t("agentSpace.addSkillEmpty")}</Text>
      )}
      {hidden > 0 && (
        <Text style={[s.small, { color: colors.faint }]}>
          {t("agentSpace.addSkillMore", { count: hidden })}
        </Text>
      )}
    </View>
  );
}

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
          onViewCatalogDetail={setViewingCatalog}
          onViewCustomDetail={setViewingCustom}
        />
        {/* 详情图标 / 长按打开完整说明：内置技能与自建技能各自的详情弹层。 */}
        {viewingCatalog && (
          <SkillDetailSheet
            skill={viewingCatalog}
            agents={agentList}
            onToggleInstall={toggleCatalogSkillInstall}
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
        {/* 右对齐的「+ 添加技能」：直接打开技能库，不再提供创建技能入口。 */}
        <View style={{ alignItems: "flex-end", marginBottom: 5 }}>
          <Button small icon={Plus} onPress={() => setAdding(true)}>
            {t("agentSpace.addSkill")}
          </Button>
        </View>
        {customSkills.length || installedEntries.length ? (
          <CardGrid
            items={skillCards}
            minColumnWidth={300}
            getKey={(card) => card.key}
            render={(card) => card.node}
          />
        ) : (
          <Text style={[s.muted, { paddingVertical: 18 }]}>{t("agentSpace.skillEmpty")}</Text>
        )}
      </View>
      {viewingCustom && (
        <MySkillDetailSheet
          title={viewingCustom.name}
          skill={viewingCustom}
          agents={agentList}
          addedAgentIds={shareAddedIds}
          onToggleAdd={toggleSkillInAgent}
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
          onToggleInstall={toggleCatalogSkillInstall}
          onClose={() => setViewingCatalog(undefined)}
        />
      )}
    </BotPage>
  );
}
