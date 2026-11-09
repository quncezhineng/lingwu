import { type ReactNode, useState } from "react";
import { Linking, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import Markdown from "react-native-markdown-renderer";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import type { AgentDefinition, AgentSkill } from "./agent-space-model";
import { Text, TextInput } from "./app-text";
import { assistantMarkdown } from "./assistant-markdown";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Brain,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Download,
  Globe2,
  Hand,
  type IconComponent,
  Link2,
  Mail,
  Plus,
  Puzzle,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  X,
} from "./icons";
import { instructionsMarkdownStyle } from "./instructions-markdown";
import { ModalOverlay } from "./modal-overlay";
import { type SkillCatalogEntry, type SkillCategory, skillCatalog } from "./skill-catalog";
import { SkillEditor } from "./skill-editor";
import { deleteSkillEverywhere, skillHolderAgentIds, toggleSkillShare } from "./skill-sharing";
import { StatusBadge, type StatusTone } from "./status-badge";
import { breakpoints, radius } from "./theme";
import { appBrands, Button, Chip, colors, Empty, fonts, Sheet, s, serviceBrands } from "./ui";
import { useWorkspace } from "./workspace";

type CapabilityType = "plugins" | "skills" | "connectors";
type ConfigSheet = "openbot";
/** 「我的技能」条目：账户级技能库里的一份自建技能，与 Agent 是否持有无关。 */
type MySkillEntry = { skill: AgentSkill };
type CapabilityCategoryId =
  | "research"
  | "analysis"
  | "writing"
  | "monitoring"
  | "connections"
  | "workspace";
type CategoryId = "all" | CapabilityCategoryId | SkillCategory;
type CatalogTag = Exclude<CategoryId, "all">;
type CapabilityState = "ready" | "connected" | "available" | "open";
type CategoryOption = { id: CategoryId; labelKey: TranslationKey };

type CatalogItem = {
  id: string;
  type: CapabilityType;
  tags: CatalogTag[];
  title: string;
  detail: string;
  icon: IconComponent;
  iconColor: string;
  iconSurface: string;
  source: string;
  state: CapabilityState;
  searchText?: string;
  onPress: () => void;
  /** 技能卡片右下角的快捷动作：把技能带入对话输入区，不经过详情弹层。 */
  onUse?: () => void;
};

type Shortcut = {
  id: CapabilityType;
  title: string;
  detail: string;
  icon: IconComponent;
  onPress: () => void;
};

const CAPABILITY_CATEGORY_OPTIONS: CategoryOption[] = [
  { id: "all", labelKey: "agent.hubCategoryAll" },
  { id: "research", labelKey: "agent.hubCategoryResearch" },
  { id: "analysis", labelKey: "agent.hubCategoryAnalysis" },
  { id: "writing", labelKey: "agent.hubCategoryWriting" },
  { id: "monitoring", labelKey: "agent.hubCategoryMonitoring" },
  { id: "connections", labelKey: "agent.hubCategoryConnections" },
  { id: "workspace", labelKey: "agent.hubCategoryWorkspace" },
];

const SKILL_CATEGORY_OPTIONS: CategoryOption[] = [
  { id: "all", labelKey: "agent.hubCategoryAll" },
  { id: "market-macro", labelKey: "agent.hubSkillCategoryMarketMacro" },
  { id: "company-fundamentals", labelKey: "agent.hubSkillCategoryCompanyFundamentals" },
  { id: "valuation-modeling", labelKey: "agent.hubSkillCategoryValuationModeling" },
  { id: "portfolio-trading", labelKey: "agent.hubSkillCategoryPortfolioTrading" },
  { id: "deals-private-capital", labelKey: "agent.hubSkillCategoryDealsPrivateCapital" },
  { id: "wealth-risk", labelKey: "agent.hubSkillCategoryWealthRisk" },
  { id: "research-tools", labelKey: "agent.hubSkillCategoryResearchTools" },
];

const CATEGORY_OPTIONS_BY_TYPE: Record<CapabilityType, CategoryOption[]> = {
  plugins: CAPABILITY_CATEGORY_OPTIONS,
  skills: SKILL_CATEGORY_OPTIONS,
  connectors: CAPABILITY_CATEGORY_OPTIONS,
};

const FILLER_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

/** 空状态容器：与卡片同描边、同圆角的纸面框，目录与「我的技能」共用。 */
const EMPTY_STATE_BOX = {
  minHeight: 230,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: radius.card,
  backgroundColor: colors.paper,
} as const;

const TYPE_LABELS: Record<CapabilityType, TranslationKey> = {
  plugins: "agent.pluginsHeading",
  skills: "agent.skillsHeading",
  connectors: "agent.connectorsHeading",
};

const HUB_SEARCH_LABELS: Record<CapabilityType, TranslationKey> = {
  plugins: "agent.hubSearchPlugins",
  skills: "agent.hubSearchSkills",
  connectors: "agent.hubSearchConnectors",
};

const HUB_COUNT_LABELS: Record<CapabilityType, TranslationKey> = {
  plugins: "agent.hubPluginCount",
  skills: "agent.hubSkillCount",
  connectors: "agent.hubConnectorCount",
};

const HUB_EMPTY_TITLE_LABELS: Record<CapabilityType, TranslationKey> = {
  plugins: "agent.hubPluginNoMatchTitle",
  skills: "agent.hubSkillNoMatchTitle",
  connectors: "agent.hubConnectorNoMatchTitle",
};

const SKILL_CATEGORY_LABELS: Record<SkillCategory, TranslationKey> = {
  "market-macro": "agent.hubSkillCategoryMarketMacro",
  "company-fundamentals": "agent.hubSkillCategoryCompanyFundamentals",
  "valuation-modeling": "agent.hubSkillCategoryValuationModeling",
  "portfolio-trading": "agent.hubSkillCategoryPortfolioTrading",
  "deals-private-capital": "agent.hubSkillCategoryDealsPrivateCapital",
  "wealth-risk": "agent.hubSkillCategoryWealthRisk",
  "research-tools": "agent.hubSkillCategoryResearchTools",
};

const SKILL_CATEGORY_APPEARANCE: Record<
  SkillCategory,
  {
    icon: IconComponent;
    color: string;
    surface: string;
  }
> = {
  "market-macro": {
    icon: Activity,
    color: appBrands.report.fg,
    surface: appBrands.report.surface,
  },
  "company-fundamentals": {
    icon: Brain,
    color: appBrands.portfolioReview.fg,
    surface: appBrands.portfolioReview.surface,
  },
  "valuation-modeling": {
    icon: CircleDollarSign,
    color: appBrands.earnings.fg,
    surface: appBrands.earnings.surface,
  },
  "portfolio-trading": {
    icon: Target,
    color: appBrands.monitoring.fg,
    surface: appBrands.monitoring.surface,
  },
  "deals-private-capital": {
    icon: Hand,
    color: appBrands.dailyReview.fg,
    surface: appBrands.dailyReview.surface,
  },
  "wealth-risk": {
    icon: ShieldCheck,
    color: appBrands.notes.fg,
    surface: appBrands.notes.surface,
  },
  "research-tools": {
    icon: Sparkles,
    color: colors.primaryStrong,
    surface: colors.sky,
  },
};

function skillCategory(skill: SkillCatalogEntry): SkillCategory {
  return skill.categories[0] ?? "company-fundamentals";
}

function chunk<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function ShortcutCard({
  item,
  active,
  compact,
}: {
  item: Shortcut;
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title} · ${item.detail}`}
      accessibilityState={{ selected: active }}
      onPress={item.onPress}
      style={({ pressed }) => [
        {
          minHeight: 90,
          paddingHorizontal: 14,
          paddingVertical: 13,
          gap: 9,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: active ? colors.accentLine : colors.line,
          backgroundColor: active ? colors.sky : pressed ? colors.surfaceSoft : colors.paper,
          flex: compact ? undefined : 1,
          width: compact ? 176 : undefined,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: radius.control,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: active ? colors.paper : colors.surfaceSoft,
          }}
        >
          <item.icon size={17} color={active ? colors.primary : colors.text} />
        </View>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 13,
            lineHeight: 18,
            fontWeight: "600",
            fontFamily: fonts.sans,
          }}
        >
          {item.title}
        </Text>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: active ? colors.primary : colors.tertiary,
          }}
        >
          <ChevronRight
            size={13}
            strokeWidth={1.9}
            color={active ? colors.onPrimary : colors.faint}
          />
        </View>
      </View>
      <Text
        numberOfLines={1}
        style={{
          color: colors.faint,
          fontSize: 11,
          lineHeight: 17,
          fontFamily: fonts.sans,
        }}
      >
        {item.detail}
      </Text>
    </Pressable>
  );
}

function CapabilityCard({ item }: { item: CatalogItem }) {
  const { t } = useTranslation();
  /** 连接器卡片右下角展示真实连接状态，未接通时不暗示「可用」。 */
  const connectorStatus =
    item.type === "connectors"
      ? item.state === "connected"
        ? { tone: "done" as StatusTone, label: t("agent.hubConnectorStateConnected") }
        : { tone: "paused" as StatusTone, label: t("agent.hubConnectorStateDisconnected") }
      : undefined;

  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 160,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.paper,
        overflow: "hidden",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title} · ${item.detail}`}
        onPress={item.onPress}
        style={({ pressed }) => ({
          flex: 1,
          paddingTop: 14,
          paddingHorizontal: 14,
          backgroundColor: pressed ? colors.surfaceSoft : colors.paper,
        })}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: radius.control,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: item.iconSurface,
            }}
          >
            <item.icon size={19} color={item.iconColor} />
          </View>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: colors.text,
              fontSize: 14,
              lineHeight: 20,
              fontWeight: "500",
              fontFamily: fonts.sans,
            }}
          >
            {item.title}
          </Text>
          <ArrowUpRight size={14} strokeWidth={1.7} color={colors.disabled} />
        </View>
        <Text
          numberOfLines={3}
          style={{
            flex: 1,
            marginTop: 10,
            color: colors.muted,
            fontSize: 13,
            lineHeight: 18,
            fontFamily: fonts.sans,
          }}
        >
          {item.detail}
        </Text>
      </Pressable>
      <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
        <View
          style={[
            s.between,
            {
              gap: 8,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: colors.line,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              minWidth: 0,
              color: colors.faint,
              fontSize: 11,
              lineHeight: 16,
              fontFamily: fonts.sans,
            }}
          >
            {item.source}
          </Text>
          {connectorStatus && (
            <StatusBadge
              tone={connectorStatus.tone}
              label={connectorStatus.label}
              style={{
                alignSelf: "center",
                borderRadius: 6,
                paddingHorizontal: 7,
                paddingVertical: 3,
              }}
            />
          )}
          {item.onUse && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t("agent.skillDetailUse")} · ${item.title}`}
              hitSlop={6}
              onPress={item.onUse}
              style={({ pressed }) => ({
                height: 24,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 9,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: colors.accentLine,
                backgroundColor: pressed ? colors.skyStrong : colors.sky,
              })}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: colors.primaryStrong,
                  fontSize: 11,
                  lineHeight: 16,
                  fontWeight: "500",
                  fontFamily: fonts.sans,
                }}
              >
                {t("agent.skillDetailUse")}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

/** 安装面板里的一行智能体：已安装的用底色 + 徽标区分，未安装保留空选中圈。 */
function AgentInstallRow({
  agent,
  installed,
  first,
  locked,
  onPress,
}: {
  agent: AgentDefinition;
  installed: boolean;
  first: boolean;
  /** 库化前「来源 Agent / 最后一份副本」的只读行；账户级技能库下当前 UI 不再传入。 */
  locked?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const installedLabel = locked ? t("agent.skillShareLocked") : t("agent.skillInstallInstalled");
  return (
    <Pressable
      disabled={locked}
      accessibilityRole="checkbox"
      accessibilityLabel={`${agent.name} · ${
        installed ? installedLabel : t("agent.skillInstallAction")
      }`}
      accessibilityState={{ checked: installed, disabled: locked }}
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        {
          gap: 11,
          minHeight: 58,
          paddingHorizontal: 12,
          paddingVertical: 10,
          opacity: locked ? 0.72 : 1,
          borderTopWidth: first ? 0 : 1,
          borderTopColor: colors.line,
          backgroundColor: installed ? colors.sky : pressed ? colors.surfaceSoft : colors.paper,
        },
      ]}
    >
      <AgentOrb avatar={agent.avatar} size={30} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{
            color: colors.text,
            fontSize: 13,
            lineHeight: 18,
            fontWeight: "600",
            fontFamily: fonts.sans,
          }}
        >
          {agent.name}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: colors.faint,
            fontSize: 11,
            lineHeight: 16,
            fontFamily: fonts.sans,
          }}
        >
          {agent.role}
        </Text>
      </View>
      {installed ? (
        <StatusBadge
          tone="done"
          label={installedLabel}
          style={{
            alignSelf: "center",
            borderRadius: 6,
            paddingHorizontal: 7,
            paddingVertical: 3,
          }}
        />
      ) : (
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.lineStrong,
            backgroundColor: colors.paper,
          }}
        />
      )}
    </Pressable>
  );
}

/**
 * 智能体选择面板：技能详情弹层的「添加到智能体」视图。
 *
 * 目录技能（安装到智能体）与自建技能（添加到智能体）共用这一版式，
 * 两者都展示全部智能体，只有「是否已持有」的判定方式不同，由调用方通过 `isAdded` 传入。
 */
function AgentPickerPanel({
  agents,
  isAdded,
  lockedAgentIds,
  onToggle,
}: {
  agents: AgentDefinition[];
  isAdded: (agent: AgentDefinition) => boolean;
  /** 兼容旧数据的只读 Agent 列表；账户级技能库下当前 UI 不再传入。 */
  lockedAgentIds?: string[];
  onToggle: (agent: AgentDefinition) => void;
}) {
  const { t } = useTranslation();
  // 只有真正传入锁定列表的面板才提示「不可移除」，避免无锁定视图出现误导性说明。
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.small}>
        {t(lockedAgentIds ? "agent.skillInstallHint" : "agent.skillInstallHintNoLock")}
      </Text>
      {agents.length ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.field,
            overflow: "hidden",
          }}
        >
          {agents.map((agent, index) => {
            const installed = isAdded(agent);
            return (
              <AgentInstallRow
                key={agent.id}
                agent={agent}
                installed={installed}
                first={index === 0}
                locked={installed && (lockedAgentIds ?? []).includes(agent.id)}
                onPress={() => onToggle(agent)}
              />
            );
          })}
        </View>
      ) : (
        <Text style={s.small}>{t("agent.skillShareNoTargets")}</Text>
      )}
      <Text style={[s.small, { color: colors.faint }]}>
        {t("agent.skillInstallSummary", { count: agents.filter(isAdded).length })}
      </Text>
    </View>
  );
}

/**
 * 技能目录条目的详情弹层。
 *
 * 传入 `agents` 与 `onToggleInstall` 时才提供「安装到智能体」入口；
 * 技能市场与 Agent 详情技能页都传入，只传 `skill` 时退化为只读详情。
 */
export function SkillDetailSheet({
  skill,
  agents,
  onClose,
  onUse,
  onToggleInstall,
}: {
  skill: SkillCatalogEntry;
  /** 传入即展示「安装到智能体」面板；不传则为只读详情。 */
  agents?: AgentDefinition[];
  onClose: () => void;
  /** 传入即展示「使用此技能」操作；不传则隐藏该区域。 */
  onUse?: () => void;
  /** 切换某个智能体的安装状态（已安装则移除）。 */
  onToggleInstall?: (agent: AgentDefinition) => void;
}) {
  const { t, locale } = useTranslation();
  const [installing, setInstalling] = useState(false);
  const appearance = SKILL_CATEGORY_APPEARANCE[skillCategory(skill)];
  const primaryTitle = locale === "zh-Hans" ? skill.titleZh : skill.titleEn;
  const secondaryTitle = locale === "zh-Hans" ? skill.titleEn : skill.titleZh;
  const installable = Boolean(agents && onToggleInstall);

  return (
    <Sheet
      title={installable && installing ? t("agent.skillInstallTitle") : primaryTitle}
      subtitle={installable && installing ? primaryTitle : secondaryTitle}
      onClose={onClose}
      narrow
      headerAction={
        installable ? (
          <Button
            small
            icon={installing ? ArrowLeft : Download}
            onPress={() => setInstalling((value) => !value)}
          >
            {installing ? t("common.back") : t("agent.skillInstallAction")}
          </Button>
        ) : undefined
      }
    >
      {installable && installing ? (
        <AgentPickerPanel
          agents={agents ?? []}
          isAdded={(agent) => agent.installedSkills.includes(skill.id)}
          onToggle={(agent) => onToggleInstall?.(agent)}
        />
      ) : (
        <View style={{ gap: 18 }}>
          <View style={[s.row, { gap: 11 }]}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: radius.field,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: appearance.surface,
              }}
            >
              <appearance.icon size={21} color={appearance.color} />
            </View>
            <View style={{ flex: 1, gap: 7 }}>
              <Text style={s.label}>{t("agent.skillDetailCategory")}</Text>
              <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
                {skill.categories.map((category) => (
                  <Chip key={category} tint={colors.sky}>
                    {t(SKILL_CATEGORY_LABELS[category])}
                  </Chip>
                ))}
              </View>
            </View>
          </View>

          <View style={{ gap: 7 }}>
            <Text style={s.label}>{t("agent.skillDetailChinese")}</Text>
            <Text selectable style={s.text}>
              {skill.descriptionZh}
            </Text>
          </View>

          <View style={{ height: 1, backgroundColor: colors.line }} />

          <View style={{ gap: 7 }}>
            <Text style={s.label}>{t("agent.skillDetailEnglish")}</Text>
            <Text selectable style={s.text}>
              {skill.descriptionEn}
            </Text>
          </View>

          <View
            style={{
              gap: 5,
              padding: 12,
              borderRadius: radius.field,
              backgroundColor: colors.surfaceSoft,
            }}
          >
            <Text style={s.label}>{t("agent.skillDetailSource")}</Text>
            <Text selectable style={s.small}>
              {skill.sourceFolder}
            </Text>
          </View>

          {onUse && (
            <View style={{ gap: 10 }}>
              <Button primary icon={Sparkles} onPress={onUse}>
                {t("agent.skillDetailUse")}
              </Button>
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}

/**
 * 用户自建技能的只读详情。
 *
 * 「应用与能力 → 我的技能」与 Agent 详情的技能页共用这一版式，
 * 传入 `footer` 可追加场景专属操作（如编辑）；
 * 传入 `agents` 与 `onToggleAdd` 时在右上角提供「添加到智能体」。
 */
export function MySkillDetailSheet({
  title,
  subtitle,
  skill,
  footer,
  agents,
  addedAgentIds,
  lockedAgentIds,
  onToggleAdd,
  onClose,
}: {
  title: string;
  subtitle?: string;
  skill: Pick<AgentSkill, "name" | "purpose" | "instructions" | "outputFormat" | "version">;
  footer?: ReactNode;
  /** 可选的智能体（全部，含技能来源 Agent）。传入即展示「添加到智能体」入口。 */
  agents?: AgentDefinition[];
  /** 已持有该技能的智能体 id，用于行内「已添加」标记与计数。 */
  addedAgentIds?: string[];
  /** 兼容旧数据：需保留的副本所在智能体 id；账户级技能库下当前 UI 不再传入。 */
  lockedAgentIds?: string[];
  /** 切换某个智能体是否持有该技能。 */
  onToggleAdd?: (agent: AgentDefinition) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const shareable = Boolean(agents && onToggleAdd);
  return (
    <Sheet
      title={shareable && adding ? t("agent.skillInstallTitle") : title}
      subtitle={shareable && adding ? title : subtitle}
      onClose={onClose}
      narrow
      headerAction={
        shareable ? (
          <Button
            small
            icon={adding ? ArrowLeft : Download}
            onPress={() => setAdding((value) => !value)}
          >
            {adding ? t("common.back") : t("agent.skillInstallAction")}
          </Button>
        ) : undefined
      }
    >
      {shareable && adding ? (
        <AgentPickerPanel
          agents={agents ?? []}
          isAdded={(agent) => (addedAgentIds ?? []).includes(agent.id)}
          lockedAgentIds={lockedAgentIds}
          onToggle={(agent) => onToggleAdd?.(agent)}
        />
      ) : (
        <View style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <Text style={s.label}>{t("agentSpace.skillPurpose")}</Text>
            <Text style={s.text}>{skill.purpose}</Text>
          </View>
          <View style={{ gap: 4 }}>
            <Text style={s.label}>{t("agentSpace.skillInstructions")}</Text>
            <Markdown markdownit={assistantMarkdown} style={instructionsMarkdownStyle}>
              {skill.instructions}
            </Markdown>
          </View>
          <View style={{ gap: 4 }}>
            <Text style={s.label}>{t("agentSpace.skillOutput")}</Text>
            <Text style={s.text}>{skill.outputFormat}</Text>
          </View>
          <Text style={s.small}>
            {t("agentSpace.skillVersion", {
              version: skill.version,
            })}
          </Text>
          {footer}
        </View>
      )}
    </Sheet>
  );
}

function CategoryRail({
  category,
  counts,
  onChange,
  options,
  horizontal,
}: {
  category: CategoryId;
  counts: Record<CategoryId, number>;
  onChange: (next: CategoryId) => void;
  options: CategoryOption[];
  horizontal?: boolean;
}) {
  const { t } = useTranslation();

  if (horizontal) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{ alignItems: "center", gap: 8, paddingVertical: 1 }}
      >
        {options.map((option) => {
          const active = category === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(option.id)}
              style={({ pressed }) => ({
                height: 34,
                alignSelf: "center",
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                paddingHorizontal: 11,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: active ? colors.accentLine : colors.line,
                backgroundColor: active ? colors.sky : pressed ? colors.surfaceSoft : colors.paper,
              })}
            >
              <Text
                style={{
                  color: active ? colors.primaryStrong : colors.text,
                  fontSize: 12,
                  lineHeight: 17,
                  fontWeight: active ? "600" : "400",
                  fontFamily: fonts.sans,
                }}
              >
                {t(option.labelKey)}
              </Text>
              <Text
                style={{
                  color: active ? colors.primary : colors.faint,
                  fontSize: 10,
                  lineHeight: 15,
                  fontFamily: fonts.sans,
                }}
              >
                {counts[option.id]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <View style={{ width: 180, gap: 2 }}>
      {options.map((option) => {
        const active = category === option.id;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.id)}
            style={({ pressed }) => ({
              minHeight: 32,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: radius.control,
              backgroundColor: active ? colors.sky : pressed ? colors.surfaceSoft : "transparent",
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                color: active ? colors.primaryStrong : colors.muted,
                fontSize: 13,
                lineHeight: 18,
                fontWeight: active ? "500" : "400",
                fontFamily: fonts.sans,
              }}
            >
              {t(option.labelKey)}
            </Text>
            <Text
              style={{
                color: active ? colors.primary : colors.faint,
                fontSize: 11,
                lineHeight: 16,
                fontFamily: fonts.sans,
              }}
            >
              {counts[option.id]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * 「技能市场 / 我的技能」二级标签页：横向并排，切换内容区。
 *
 * 与上方的能力类型索引（插件 / 技能 / 连接器 / 资料）是两层维度：
 * 上面切能力类型，这里切同一类型下的「目录」与「我创建的」两个视角。
 */
function HubTabBar<T extends string>({
  tabs,
  active,
  onChange,
  action,
}: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  /** 标签行右侧的操作区，例如「创建技能」按钮。 */
  action?: ReactNode;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        alignItems: "center",
        // 窄屏放不下时，右侧操作按钮换到下一行而不是被挤出屏幕。
        flexWrap: "wrap",
        gap: 24,
        minHeight: 40,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.id)}
            style={{ justifyContent: "center", minHeight: 40 }}
          >
            <Text
              style={{
                color: selected ? colors.primaryStrong : colors.muted,
                fontSize: 14,
                lineHeight: 20,
                fontWeight: selected ? "600" : "400",
                fontFamily: fonts.sans,
              }}
            >
              {tab.label}
            </Text>
            {selected && (
              <View
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: -1,
                  left: 0,
                  height: 2,
                  backgroundColor: colors.primary,
                }}
              />
            )}
          </Pressable>
        );
      })}
      {action && <View style={{ marginLeft: "auto", flexShrink: 0 }}>{action}</View>}
    </View>
  );
}

/**
 * 我的技能列表：所有 Agent 自建技能的汇总，自适应分栏网格，点击卡片查看详情。
 *
 * 技能不按 Agent 归类——同一份技能在不同 Agent 下只出现一次，
 * 因此行内不显示来源 Agent；删除入口在卡片右上角（Trash2），点击打开确认层，
 * 详情弹层里也保留同一删除按钮。
 */
function MySkillsList({
  entries,
  onSelect,
  onRequestDelete,
}: {
  entries: MySkillEntry[];
  onSelect: (entry: MySkillEntry) => void;
  /** 卡片右上角删除按钮：点击后由外层打开确认层，不在卡片内直接删。 */
  onRequestDelete?: (entry: MySkillEntry) => void;
}) {
  const { t } = useTranslation();
  /** 用 onLayout 实测容器宽度换算卡片宽度，首帧用单列兜底，避免按窗口宽度估算造成错位。 */
  const [containerWidth, setContainerWidth] = useState(0);
  const columns = containerWidth >= 640 ? 3 : containerWidth >= 400 ? 2 : 1;
  const gap = 10;
  const itemWidth =
    columns > 1 ? Math.floor((containerWidth - gap * (columns - 1)) / columns) : containerWidth;
  return (
    <View
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", flexWrap: "wrap", gap }}
    >
      {entries.map(({ skill }) => (
        <View key={skill.id} style={{ width: itemWidth }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t("agent.mySkills")} · ${skill.name}`}
            onPress={() => onSelect({ skill })}
            style={({ pressed }) => ({
              width: "100%",
              gap: 6,
              paddingVertical: 12,
              paddingHorizontal: 13,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: pressed ? colors.surfaceSoft : colors.paper,
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                color: colors.text,
                fontSize: 13,
                lineHeight: 18,
                fontWeight: "600",
                fontFamily: fonts.sans,
                paddingRight: 26,
              }}
            >
              {skill.name}
            </Text>
            <Text
              numberOfLines={2}
              style={{
                color: colors.faint,
                fontSize: 11,
                lineHeight: 16,
                fontFamily: fonts.sans,
              }}
            >
              {skill.purpose}
            </Text>
          </Pressable>
          {/* 删除按钮与卡片互为兄弟节点：绝对定位盖在右上角，避免在卡片 Pressable 内嵌套交互组件。 */}
          {onRequestDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t("agent.mySkillDeleteAction")} · ${skill.name}`}
              onPress={() => onRequestDelete({ skill })}
              hitSlop={8}
              style={({ pressed }) => ({
                position: "absolute",
                top: 5,
                right: 5,
                zIndex: 2,
                padding: 6,
                borderRadius: radius.control,
                backgroundColor: pressed ? colors.overlay1 : "transparent",
              })}
            >
              <Trash2 size={14} color={colors.faint} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * 删除自建技能前的二次确认弹层。
 *
 * 「应用与能力 → 我的技能」与 Agent 详情的技能页共用：前者删掉所有 Agent 上的副本，
 * 后者只删当前 Agent 的那一份，因此说明文案由调用方传入。
 */
export function SkillDeleteConfirm({
  title,
  detail,
  onCancel,
  onConfirm,
}: {
  title: string;
  detail: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ModalOverlay visible onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={s.modalShade}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[s.card, { maxWidth: 360, width: "100%", padding: 22, gap: 10 }]}
        >
          <Text style={s.heading}>{title}</Text>
          <Text style={s.muted}>{detail}</Text>
          <View style={[s.row, { gap: 10, marginTop: 8 }]}>
            <Button style={{ flex: 1, minHeight: 44 }} onPress={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button danger style={{ flex: 1, minHeight: 44 }} onPress={onConfirm}>
              {t("agentSpace.deleteConfirmAction")}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </ModalOverlay>
  );
}

export function CapabilityHubScreen() {
  const { t, locale } = useTranslation();
  const { width } = useWindowDimensions();
  const { navigate, workspace, api, refresh, notify, open, prefillPrompt } = useWorkspace();
  const {
    agents: agentList,
    setSkillInstalled,
    saveSkill,
    deleteSkill,
    skillLibrary,
    deleteLibrarySkill,
  } = useAgentSpace();
  const [category, setCategory] = useState<CategoryId>("all");
  const [typeFilter, setTypeFilter] = useState<CapabilityType>("plugins");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [configSheet, setConfigSheet] = useState<ConfigSheet>();
  const [googleConnectingId, setGoogleConnectingId] = useState<"gmail" | "calendar">();
  const [selectedSkillId, setSelectedSkillId] = useState<string>();
  /** 详情弹窗中正在查看的「我的技能」条目。 */
  const [selectedMySkill, setSelectedMySkill] = useState<MySkillEntry>();
  /** 「我的技能」里正在创建新技能。 */
  const [creatingSkill, setCreatingSkill] = useState(false);
  /** 「我的技能」里正在编辑库中的技能（编辑不产生 Agent 副本）。 */
  const [editingMySkill, setEditingMySkill] = useState<AgentSkill>();
  /** 技能 tab 的二级视角：「技能市场」技能目录 / 「我的技能」。 */
  const [skillTab, setSkillTab] = useState<"all" | "mine">("all");
  /** 删除前二次确认：待删除的「我的技能」条目。 */
  const [deletingMySkill, setDeletingMySkill] = useState<MySkillEntry>();

  const desktop = width >= breakpoints.desktop;
  const railWidth = desktop ? 232 : 0;
  const pagePadding = desktop ? 84 : 44;
  const contentWidth = Math.max(0, Math.min(width - railWidth, 1340) - pagePadding);
  const useCategoryRail = contentWidth >= 760;
  const gridWidth = contentWidth - (useCategoryRail ? 220 : 0);
  const gridColumns = gridWidth >= 660 ? 3 : gridWidth >= 430 ? 2 : 1;
  const shortcutsAsCarousel = contentWidth < 680;

  const googleConnected = workspace.connections.some(
    (connection) =>
      connection.id === "google" &&
      (connection.status === "connected" || connection.status === "sample"),
  );
  const browserConnected = workspace.connections.some(
    (connection) => connection.id === "browser" && connection.status === "connected",
  );
  const builtInSource = t("agent.hubSourceLingwu");
  const workspaceSource = t("agent.hubSourceWorkspace");
  const skillSource = t("agent.hubSourceLingwu");
  const skillItems: CatalogItem[] = skillCatalog.map((skill) => {
    const id = `skill:${skill.id}`;
    const appearance = SKILL_CATEGORY_APPEARANCE[skillCategory(skill)];
    return {
      id,
      type: "skills",
      tags: [...skill.categories],
      title: locale === "zh-Hans" ? skill.titleZh : skill.titleEn,
      detail: locale === "zh-Hans" ? skill.descriptionZh : skill.descriptionEn,
      icon: appearance.icon,
      iconColor: appearance.color,
      iconSurface: appearance.surface,
      source: skillSource,
      state: "ready",
      searchText: [
        skill.id,
        skill.titleZh,
        skill.titleEn,
        skill.descriptionZh,
        skill.descriptionEn,
      ].join(" "),
      onPress: () => setSelectedSkillId(skill.id),
      onUse: () => startSelectedSkill(skill),
    };
  });
  const selectedSkill = selectedSkillId
    ? skillCatalog.find((skill) => skill.id === selectedSkillId)
    : undefined;
  /**
   * 我的技能：账户级技能库里的自建技能，与是否被某个 Agent 持有无关。
   * 创建技能只入库，是否挂到智能体由详情里的「添加到智能体」决定。
   */
  const mySkills: MySkillEntry[] = skillLibrary.map((skill) => ({ skill }));
  /** 「添加到智能体」按内容指纹标记已持有该技能副本的 Agent。 */
  const mySkillAddedAgentIds = selectedMySkill
    ? skillHolderAgentIds(agentList, selectedMySkill.skill)
    : [];

  async function openGoogleConnector(id: "gmail" | "calendar") {
    if (googleConnectingId) return;
    if (googleConnected) {
      navigate(id === "gmail" ? "mail" : "calendar");
      return;
    }
    setGoogleConnectingId(id);
    try {
      const result = await api.request<{ url: string | null }>("/api/google/connect", {
        capability: "read",
      });
      if (result.url) {
        await Linking.openURL(result.url);
        notify(t("screens.connectionsNotifyFinish"));
      } else {
        await refresh();
        notify(t("screens.connectionsNotifyLocalReady"));
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    } finally {
      setGoogleConnectingId(undefined);
    }
  }

  /**
   * 只把技能预选进对话输入区（chip 形式），不发起任何分析：
   * 用户看过说明、自己描述问题后再决定是否发送。
   */
  function startSelectedSkill(skill: SkillCatalogEntry) {
    const title = locale === "zh-Hans" ? skill.titleZh : skill.titleEn;
    prefillPrompt("", undefined, [skill.id]);
    setSelectedSkillId(undefined);
    notify(t("agent.skillAddedToChat", { title }));
  }

  /**
   * 库技能的「添加到智能体」：把库里的技能复制一份到目标 Agent，已有副本则移除。
   * 库里始终保留原件，因此不再需要「最后一份副本」只读保护；删除请走列表里的删除入口。
   */
  function toggleMySkillInAgent(agent: AgentDefinition) {
    if (!selectedMySkill) return;
    const action = toggleSkillShare({ saveSkill, deleteSkill }, agent, selectedMySkill.skill);
    notify(
      t(action === "added" ? "agent.skillInstalledToast" : "agent.skillUninstalledToast", {
        title: selectedMySkill.skill.name,
        agent: agent.name,
      }),
    );
  }

  /** 点卡片删除只打开确认层，确认后才真正删除。 */
  function requestDeleteMySkill(entry: MySkillEntry) {
    setSelectedMySkill(undefined);
    setDeletingMySkill(entry);
  }

  /**
   * 删除「我的技能」：从账户级技能库删掉原件，并按内容指纹清掉所有 Agent 上的副本，
   * 否则删完库里的条目后，Agent 上的副本仍会以「已添加」状态留在各自的技能页里。
   */
  function deleteMySkill(entry: MySkillEntry) {
    deleteSkillEverywhere({ deleteSkill }, agentList, entry.skill);
    deleteLibrarySkill(entry.skill.id);
    setDeletingMySkill(undefined);
    setSelectedMySkill(undefined);
    notify(t("agent.mySkillDeletedToast", { title: entry.skill.name }));
  }

  /** 安装面板按智能体逐一开关，已安装的再次点击即移除。 */
  function toggleSkillInstall(agent: AgentDefinition) {
    if (!selectedSkill) return;
    const installed = agent.installedSkills.includes(selectedSkill.id);
    setSkillInstalled(agent.id, selectedSkill.id, !installed);
    notify(
      t(installed ? "agent.skillUninstalledToast" : "agent.skillInstalledToast", {
        title: locale === "zh-Hans" ? selectedSkill.titleZh : selectedSkill.titleEn,
        agent: agent.name,
      }),
    );
  }

  const items: CatalogItem[] = [
    ...skillItems,
    {
      id: "mail",
      type: "plugins",
      tags: ["workspace", "connections"],
      title: t("app.titleMail"),
      detail: t("agent.shortcutMailDetail"),
      icon: Mail,
      iconColor: serviceBrands.gmail.fg,
      iconSurface: serviceBrands.gmail.surface,
      source: workspaceSource,
      state: "open",
      onPress: () => navigate("mail"),
    },
    {
      id: "calendar-workspace",
      type: "plugins",
      tags: ["workspace", "connections"],
      title: t("app.titleCalendar"),
      detail: t("agent.shortcutCalendarDetail"),
      icon: CalendarDays,
      iconColor: serviceBrands.googleCalendar.fg,
      iconSurface: serviceBrands.googleCalendar.surface,
      source: workspaceSource,
      state: "open",
      onPress: () => navigate("calendar"),
    },
    {
      id: "browser",
      type: "plugins",
      tags: ["connections", "research"],
      title: t("threads.agentComputer"),
      detail: t("agent.hubBrowserDetail"),
      icon: Globe2,
      iconColor: serviceBrands.browser.fg,
      iconSurface: serviceBrands.browser.surface,
      source: builtInSource,
      state: browserConnected ? "connected" : "available",
      onPress: () => open({ type: "computer" }),
    },
    {
      id: "gmail",
      type: "connectors",
      tags: ["connections", "workspace"],
      title: "Gmail",
      detail: t("agent.hubGmailDetail"),
      icon: Mail,
      iconColor: serviceBrands.gmail.fg,
      iconSurface: serviceBrands.gmail.surface,
      source: "@Google",
      state: googleConnected ? "connected" : "available",
      onPress: () => void openGoogleConnector("gmail"),
    },
    {
      id: "calendar",
      type: "connectors",
      tags: ["connections", "workspace"],
      title: "Google Calendar",
      detail: t("agent.hubCalendarDetail"),
      icon: CalendarDays,
      iconColor: serviceBrands.googleCalendar.fg,
      iconSurface: serviceBrands.googleCalendar.surface,
      source: "@Google",
      state: googleConnected ? "connected" : "available",
      onPress: () => void openGoogleConnector("calendar"),
    },
    {
      id: "openbot",
      type: "connectors",
      tags: ["connections"],
      title: "OpenBot",
      detail: t("agent.hubOpenBotDetail"),
      icon: Sparkles,
      iconColor: serviceBrands.openbot.fg,
      iconSurface: serviceBrands.openbot.surface,
      source: "@OpenBot",
      state: workspace.runtime.openbotConfigured ? "connected" : "available",
      onPress: () => setConfigSheet("openbot"),
    },
  ];

  const selectType = (next: CapabilityType) => {
    setCategory("all");
    setQuery("");
    setTypeFilter(next);
  };

  const shortcuts: Shortcut[] = [
    {
      id: "plugins",
      title: t("agent.pluginsHeading"),
      detail: t("agent.hubPluginsDetail"),
      icon: Puzzle,
      onPress: () => selectType("plugins"),
    },
    {
      id: "skills",
      title: t("agent.skillsHeading"),
      detail: t("agent.hubSkillsDetail"),
      icon: Brain,
      onPress: () => selectType("skills"),
    },
    {
      id: "connectors",
      title: t("agent.connectorsHeading"),
      detail: t("agent.hubConnectorsShortDetail"),
      icon: Link2,
      onPress: () => selectType("connectors"),
    },
  ];
  /**
   * 快捷卡列数上限取「屏宽档位」与「快捷卡数量」的较小值。
   * 宽屏档位是 4 列，但快捷卡目前只有 3 张 —— 按 4 列排会剩下一个空列，
   * 三张卡各自只占 1/4 宽、右边缘与下方内容对不齐。取 min 后三张卡等分整行。
   */
  const shortcutColumns = Math.min(
    Math.max(shortcuts.length, 1),
    contentWidth >= 1000 ? 4 : contentWidth >= 680 ? 3 : 2,
  );

  const scopedItems = items.filter((item) => item.type === typeFilter);
  const cardsForCategory = (item: CatalogItem, nextCategory: CategoryId) =>
    nextCategory === "all" || item.tags.includes(nextCategory as CatalogTag);
  const baseCategoryOptions = CATEGORY_OPTIONS_BY_TYPE[typeFilter];
  const categoryOptions = baseCategoryOptions.filter(
    (option) =>
      option.id === "all" ||
      scopedItems.some((item) => item.tags.includes(option.id as CatalogTag)),
  );
  const counts = categoryOptions.reduce(
    (result, option) => {
      result[option.id] = scopedItems.filter((item) => cardsForCategory(item, option.id)).length;
      return result;
    },
    {} as Record<CategoryId, number>,
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = scopedItems.filter((item) => {
    if (!cardsForCategory(item, category)) return false;
    if (!normalizedQuery) return true;
    return [
      item.title,
      item.detail,
      item.source,
      item.searchText ?? "",
      t(TYPE_LABELS[item.type]),
      ...item.tags.map((tag) => {
        const option = baseCategoryOptions.find((candidate) => candidate.id === tag);
        return option ? t(option.labelKey) : "";
      }),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const visibleRows = chunk(visibleItems, gridColumns);
  const activeCategoryLabel =
    categoryOptions.find((option) => option.id === category)?.labelKey ?? "agent.hubAllCategories";

  const searchField = (
    <View
      style={{
        minHeight: 40,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 11,
        borderRadius: radius.field,
        borderWidth: 1,
        borderColor: searchFocused ? colors.primary : colors.line,
        backgroundColor: colors.paper,
      }}
    >
      <Search size={14} strokeWidth={1.7} color={colors.faint} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        placeholder={t(HUB_SEARCH_LABELS[typeFilter])}
        placeholderTextColor={colors.faint}
        accessibilityLabel={t(HUB_SEARCH_LABELS[typeFilter])}
        style={{
          flex: 1,
          minWidth: 0,
          paddingVertical: 0,
          color: colors.text,
          fontSize: 13,
          lineHeight: 18,
          fontFamily: fonts.sans,
        }}
      />
      {!!query && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={() => setQuery("")}
          hitSlop={8}
        >
          <X size={13} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={{ gap: 22 }}>
      {shortcutsAsCarousel ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingBottom: 2 }}
        >
          {shortcuts.map((shortcut) => (
            <ShortcutCard
              key={shortcut.id}
              item={shortcut}
              active={shortcut.id === typeFilter}
              compact
            />
          ))}
        </ScrollView>
      ) : (
        <View style={{ gap: 12 }}>
          {chunk(shortcuts, shortcutColumns).map((row) => (
            <View key={row[0].id} style={{ flexDirection: "row", gap: 12 }}>
              {row.map((shortcut) => (
                <ShortcutCard
                  key={shortcut.id}
                  item={shortcut}
                  active={shortcut.id === typeFilter}
                />
              ))}
              {FILLER_KEYS.slice(0, shortcutColumns - row.length).map((key) => (
                <View key={key} style={{ flex: 1 }} />
              ))}
            </View>
          ))}
        </View>
      )}

      <View>
        <View style={{ gap: 14 }}>
          {/* 技能 tab 的二级标签页：技能市场 / 我的技能，切换时整块内容替换。 */}
          {typeFilter === "skills" && (
            <HubTabBar
              tabs={[
                { id: "all", label: t("agent.skillMarketAll") },
                { id: "mine", label: t("agent.mySkills") },
              ]}
              active={skillTab}
              onChange={setSkillTab}
              action={
                <Button small icon={Plus} onPress={() => setCreatingSkill(true)}>
                  {t("agentSpace.createSkill")}
                </Button>
              }
            />
          )}
          {typeFilter === "skills" && skillTab === "mine" ? (
            <View style={{ gap: 12 }}>
              {mySkills.length ? (
                <MySkillsList
                  entries={mySkills}
                  onSelect={setSelectedMySkill}
                  onRequestDelete={requestDeleteMySkill}
                />
              ) : (
                <View style={EMPTY_STATE_BOX}>
                  <Empty
                    icon={Sparkles}
                    title={t("agent.mySkills")}
                    detail={t("agent.mySkillsEmpty")}
                  />
                </View>
              )}
            </View>
          ) : (
            <>
              {!useCategoryRail && searchField}

              <View style={{ flexDirection: useCategoryRail ? "row" : "column", gap: 20 }}>
                {useCategoryRail && (
                  <View style={{ width: 180, gap: 10 }}>
                    {searchField}
                    <CategoryRail
                      category={category}
                      counts={counts}
                      onChange={setCategory}
                      options={categoryOptions}
                    />
                  </View>
                )}
                {!useCategoryRail && (
                  <CategoryRail
                    category={category}
                    counts={counts}
                    onChange={setCategory}
                    options={categoryOptions}
                    horizontal
                  />
                )}

                <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
                  <View style={[s.between, { minHeight: 21 }]}>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 14,
                        lineHeight: 20,
                        fontWeight: "500",
                        fontFamily: fonts.sans,
                      }}
                    >
                      {t(activeCategoryLabel)}
                    </Text>
                    <Text
                      style={{
                        color: colors.faint,
                        fontSize: 11,
                        lineHeight: 16,
                        fontFamily: fonts.sans,
                      }}
                    >
                      {t(HUB_COUNT_LABELS[typeFilter], { count: visibleItems.length })}
                    </Text>
                  </View>

                  {visibleRows.length ? (
                    <View style={{ gap: 12 }}>
                      {visibleRows.map((row) => (
                        <View
                          key={row[0].id}
                          style={{ flexDirection: "row", gap: 12, alignItems: "stretch" }}
                        >
                          {row.map((item) => (
                            <CapabilityCard key={item.id} item={item} />
                          ))}
                          {FILLER_KEYS.slice(0, gridColumns - row.length).map((key) => (
                            <View key={key} style={{ flex: 1 }} />
                          ))}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={EMPTY_STATE_BOX}>
                      <Empty
                        icon={Search}
                        title={t(HUB_EMPTY_TITLE_LABELS[typeFilter])}
                        detail={t("agent.hubNoMatchDetail")}
                      />
                    </View>
                  )}
                </View>
              </View>
            </>
          )}
        </View>
      </View>

      {configSheet && (
        <Sheet
          title="OpenBot"
          subtitle={t("screens.connectionsOpenBotSubtitle")}
          onClose={() => setConfigSheet(undefined)}
        >
          <View style={{ gap: 14 }}>
            <Text style={s.text}>{t("screens.connectionsOpenBotNotice")}</Text>
            <Text style={s.muted}>{t("screens.connectionsOpenBotDetail")}</Text>
          </View>
        </Sheet>
      )}

      {creatingSkill && (
        <Sheet title={t("agentSpace.createSkill")} onClose={() => setCreatingSkill(false)} narrow>
          <SkillEditor
            library
            onClose={() => setCreatingSkill(false)}
            onSaved={() => setSkillTab("mine")}
          />
        </Sheet>
      )}

      {/* 库里的技能编辑同样只改原件，不会自动挂到任何 Agent。 */}
      {editingMySkill && (
        <Sheet
          title={t("agentSpace.editSkill")}
          onClose={() => setEditingMySkill(undefined)}
          narrow
        >
          <SkillEditor
            library
            skill={editingMySkill}
            onClose={() => setEditingMySkill(undefined)}
          />
        </Sheet>
      )}

      {selectedMySkill && (
        <MySkillDetailSheet
          title={selectedMySkill.skill.name}
          skill={selectedMySkill.skill}
          agents={agentList}
          addedAgentIds={mySkillAddedAgentIds}
          onToggleAdd={toggleMySkillInAgent}
          onClose={() => setSelectedMySkill(undefined)}
          footer={
            <View style={[s.row, { gap: 10 }]}>
              <Button
                style={{ flex: 1 }}
                onPress={() => {
                  setEditingMySkill(selectedMySkill.skill);
                  setSelectedMySkill(undefined);
                }}
              >
                {t("agentSpace.editSkill")}
              </Button>
              <Button
                danger
                style={{ flex: 1 }}
                onPress={() => requestDeleteMySkill(selectedMySkill)}
              >
                {t("agent.mySkillDeleteAction")}
              </Button>
            </View>
          }
        />
      )}

      {selectedSkill && (
        <SkillDetailSheet
          skill={selectedSkill}
          agents={agentList}
          onClose={() => setSelectedSkillId(undefined)}
          onUse={() => startSelectedSkill(selectedSkill)}
          onToggleInstall={toggleSkillInstall}
        />
      )}

      {deletingMySkill && (
        <SkillDeleteConfirm
          title={t("agent.mySkillDeleteConfirmTitle", { title: deletingMySkill.skill.name })}
          detail={t("agent.mySkillDeleteConfirmNoteAll")}
          onCancel={() => setDeletingMySkill(undefined)}
          onConfirm={() => deleteMySkill(deletingMySkill)}
        />
      )}
    </View>
  );
}
