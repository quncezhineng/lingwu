import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import Markdown from "react-native-markdown-renderer";
import { type Channel, normalizeChannelAvatar } from "../../../packages/domain/src/channel";
import {
  BUILTIN_MARKET_AGENTS,
  builtinMarketEntries,
  type MarketAgentCategory,
  type MarketAgentEntry,
  type RemoteMarketAgent,
  remoteMarketEntries,
  userMarketEntries,
} from "./agent-market";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import type { AgentAvatarId, AgentDefinition, AgentSkill } from "./agent-space-model";
import { AppConnectorSheet, type AppConnectorView, useAppConnectors } from "./app-connectors";
import { Text, TextInput } from "./app-text";
import { assistantMarkdown } from "./assistant-markdown";
import { allConnectorOptions, connectorOptions } from "./capability-picker";
import { useChannels } from "./channels";
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
  FileText,
  FolderOpen,
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
  Terminal,
  Trash2,
  Upload,
  Users,
  X,
} from "./icons";
import { instructionsMarkdownStyle } from "./instructions-markdown";
import { ModalOverlay } from "./modal-overlay";
import { SkillDropzone } from "./SkillDropzone";
import { type SkillCatalogEntry, type SkillCategory, skillCatalog } from "./skill-catalog";
import { SkillEditor } from "./skill-editor";
import type { PickedSkillFile } from "./skill-file";
import { parseSkillMarkdown, skillNameFromFile } from "./skill-markdown";
import { deleteSkillEverywhere, skillHolderAgentIds, toggleSkillShare } from "./skill-sharing";
import { StatusBadge, type StatusTone } from "./status-badge";
import { breakpoints, radius, sizing, space, textScale, typography } from "./theme";
import { appBrands, Button, Chip, colors, Empty, fonts, Sheet, s, serviceBrands } from "./ui";
import { useWorkspace } from "./workspace";

/**
 * 从智能体市场「导入」一份智能体所需的最小内容。
 * 内置智能体带技能目录 id；其他用户公开的智能体带发布方公开的目录技能 id、
 * 自建技能快照与连接器引用 id（账户级资产，仅复制 id 引用，连接本体随导入方账户走）。
 */
type MarketImportTarget = {
  name: string;
  role: string;
  persona: string;
  avatar: AgentAvatarId;
  detail: string;
  installedSkills?: string[];
  instructions?: string;
  /** 发布方公开的自建技能完整快照（跨用户时导入方直接复制内容）。 */
  customSkills?: AgentSkill[];
  /** 发布方公开的连接器引用 id。 */
  connectors?: string[];
  /** 来自其他用户公开的智能体：只导入基本内容，资料/记忆/模型/任务不导入（弹窗文案用「导入」）。 */
  remote?: boolean;
};

type CapabilityType = "plugins" | "skills" | "connectors" | "market";
type ConfigSheet = "openbot";
/** 「我的技能」条目：账户级技能库里的一份自建技能，与 Agent 是否持有无关。 */
type MySkillEntry = { skill: AgentSkill };
type CapabilityCategoryId =
  | "research"
  | "analysis"
  | "writing"
  | "monitoring"
  | "connections"
  | "workspace"
  | "featured"
  | "research-data"
  | "search"
  | "office"
  | "documents"
  | "files"
  | "development";
type CategoryId = "all" | CapabilityCategoryId | SkillCategory | MarketAgentCategory;
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
  testID?: string;
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

const CONNECTOR_CATEGORY_OPTIONS: CategoryOption[] = [
  { id: "all", labelKey: "agent.hubCategoryAll" },
  { id: "featured", labelKey: "agent.hubCategoryFeatured" },
  { id: "research-data", labelKey: "agent.hubCategoryResearchData" },
  { id: "search", labelKey: "agent.hubCategorySearch" },
  { id: "office", labelKey: "agent.hubCategoryOffice" },
  { id: "documents", labelKey: "agent.hubCategoryDocuments" },
  { id: "files", labelKey: "agent.hubCategoryFiles" },
  { id: "development", labelKey: "agent.hubCategoryDevelopment" },
  { id: "research", labelKey: "agent.hubCategoryResearch" },
  { id: "connections", labelKey: "agent.hubCategoryConnections" },
  { id: "workspace", labelKey: "agent.hubCategoryWorkspace" },
];

const MARKET_CATEGORY_OPTIONS: CategoryOption[] = [
  { id: "all", labelKey: "agent.hubCategoryAll" },
  { id: "market-analysis", labelKey: "agent.marketCategoryMarketAnalysis" },
  { id: "valuation-modeling", labelKey: "agent.marketCategoryValuationModeling" },
  { id: "deals-ib", labelKey: "agent.marketCategoryDealsIb" },
  { id: "ops-compliance", labelKey: "agent.marketCategoryOpsCompliance" },
  { id: "research-debate", labelKey: "agent.marketCategoryResearchDebate" },
  { id: "decision", labelKey: "agent.marketCategoryDecision" },
  { id: "partners", labelKey: "agent.marketCategoryPartners" },
];

const CATEGORY_OPTIONS_BY_TYPE: Record<CapabilityType, CategoryOption[]> = {
  plugins: CAPABILITY_CATEGORY_OPTIONS,
  skills: SKILL_CATEGORY_OPTIONS,
  connectors: CONNECTOR_CATEGORY_OPTIONS,
  market: MARKET_CATEGORY_OPTIONS,
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
  market: "agent.marketHeading",
};

const HUB_SEARCH_LABELS: Record<CapabilityType, TranslationKey> = {
  plugins: "agent.hubSearchPlugins",
  skills: "agent.hubSearchSkills",
  connectors: "agent.hubSearchConnectors",
  market: "agent.hubSearchAgents",
};

const HUB_COUNT_LABELS: Record<CapabilityType, TranslationKey> = {
  plugins: "agent.hubPluginCount",
  skills: "agent.hubSkillCount",
  connectors: "agent.hubConnectorCount",
  market: "agent.hubAgentCount",
};

const HUB_EMPTY_TITLE_LABELS: Record<CapabilityType, TranslationKey> = {
  plugins: "agent.hubPluginNoMatchTitle",
  skills: "agent.hubSkillNoMatchTitle",
  connectors: "agent.hubConnectorNoMatchTitle",
  market: "agent.hubAgentNoMatchTitle",
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

/**
 * 官方灵悟内置能力的绿色认证标：作者名前的绿色盾牌勾。
 * 用于「能力与市场」里来源为灵悟官方的技能 / 连接器卡片，
 * 以及「智能体市场」里内置（官方）智能体卡片。
 */
function OfficialMark() {
  return <ShieldCheck size={13} strokeWidth={2} color={colors.success} />;
}

/** 智能体作者展示：统一复用 @作者名；官方灵悟前加绿色认证标。 */
function MarketAgentAuthorLine({
  source,
  official,
}: {
  source: string;
  official?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
    >
      {official ? <OfficialMark /> : null}
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
        {source}
      </Text>
    </View>
  );
}

function CapabilityCard({ item }: { item: CatalogItem }) {
  const { t } = useTranslation();
  /** 来源标签等于官方灵悟标签时，视为官方内置能力，作者名前打绿标。 */
  const isOfficial = item.source === t("agent.hubSourceLingwu");
  /** 连接器卡片右下角展示真实连接状态，未接通时不暗示「可用」。 */
  // 已连接用品牌蓝（浅蓝底 + 深蓝字），未连接沿用中性灰。
  const connectorStatus =
    item.type === "connectors"
      ? item.state === "connected"
        ? {
            tone: "done" as StatusTone,
            label: t("agent.hubConnectorStateConnected"),
            background: colors.sky,
            foreground: colors.primaryStrong,
          }
        : {
            tone: "paused" as StatusTone,
            label: t("agent.hubConnectorStateDisconnected"),
            background: undefined,
            foreground: undefined,
          }
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
        testID={item.testID}
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
          <View
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            {isOfficial ? <OfficialMark /> : null}
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
          </View>
          {connectorStatus && (
            <StatusBadge
              tone={connectorStatus.tone}
              label={connectorStatus.label}
              textColor={connectorStatus.foreground}
              style={{
                alignSelf: "center",
                borderRadius: 6,
                paddingHorizontal: 7,
                paddingVertical: 3,
                backgroundColor: connectorStatus.background,
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

const DETAIL_BLOCK_GAP = space.md;
type MarketDetailTabId = "persona" | "instructions" | "skills" | "connectors";

/** 字段标签 12/20，字段内容 15/24：两层文字拉开层级，避免「一片同字号灰字」。 */
function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.compact }}>
      <Text style={[textScale.markMedium, { color: colors.muted }]}>{label}</Text>
      {children}
    </View>
  );
}

/** 字段正文：统一 15/24，行距比原先的 21 更松，长段落更好读。 */
function DetailValue({ children }: { children: ReactNode }) {
  return <Text style={[s.text, { color: colors.text }]}>{children}</Text>;
}

/** 说明性备注：图标 + 一段灰字，统一浅底，避免和正文抢层级。 */
function DetailNote({ icon: Icon, children }: { icon: IconComponent; children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: space.xs,
        padding: space.sm,
        borderRadius: radius.control,
        backgroundColor: colors.surfaceSoft,
      }}
    >
      <Icon size={14} strokeWidth={1.7} color={colors.muted} />
      <Text style={[textScale.bodySmall, { flex: 1, color: colors.muted }]}>{children}</Text>
    </View>
  );
}

function MarketDetailRailItem({
  label,
  icon: Icon,
  selected,
  onPress,
}: {
  label: string;
  icon: IconComponent;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 42,
        paddingHorizontal: 11,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: selected ? colors.sky : pressed ? colors.overlay2 : colors.paper,
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
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * 把市场条目的技能解析成可展示文案，供详情弹窗与卡片共用。
 *
 * 公开的智能体只同步 Agent 详情页「技能」页里真实配置的两类技能：
 * - 技能目录技能（entry.installedSkills，skillCatalog 里的 id）：目录是项目方共享的，
 *   跨用户也能按 id 在本地解析出标题与简介；
 * - 自建技能快照（entry.customSkills）：发布方同步的完整内容，直接展示 name/purpose。
 *
 * 结果顺序保持「目录技能 → 自建技能」，与详情页技能配置展示一致；
 * 模板预置的内部能力键（entry.skills）不在此展示——详情页技能区同样不展示它们。
 */
function resolveMarketEntrySkills(
  entry: MarketAgentEntry,
  locale: string,
): Array<{ id: string; title: string; detail?: string }> {
  const catalogItems = (ids: readonly string[]) =>
    ids
      .map((id) => skillCatalog.find((item) => item.id === id))
      // 失效的目录 id 静默跳过，避免历史数据抛错。
      .filter((item): item is SkillCatalogEntry => Boolean(item))
      .map((item) => ({
        id: item.id,
        title: locale === "zh-Hans" ? item.titleZh : item.titleEn,
        detail: locale === "zh-Hans" ? item.descriptionZh : item.descriptionEn,
      }));
  return [
    ...catalogItems(entry.installedSkills),
    ...entry.customSkills.map((skill) => ({
      id: skill.id,
      title: skill.name,
      detail: skill.purpose,
    })),
  ];
}

/**
 * 市场智能体详情弹窗。
 *
 * 视觉结构（2026 改版）：
 * - 改为 Agent 详情页同款「左侧导航 + 右侧内容」：桌面端左栏常驻，窄宽度退化成顶部横向分区条；
 * - 左栏保留智能体身份卡（头像、分类、来源、标签），右栏一次只展示一个分区；
 * - 唯一主动作（导入 / 复制 / 打开详情）常驻标题栏，内容区只负责阅读。
 */
function MarketAgentDetailSheet({
  entry,
  connectorNames,
  onClose,
  onImport,
  onUnpublish,
  onOpenAgent,
}: {
  entry: MarketAgentEntry;
  /** 连接器 id → 展示名；公开的智能体只带 id 引用，靠这里渲染成可读名称。 */
  connectorNames: Record<string, string>;
  onClose: () => void;
  /** 内置智能体 / 其他用户公开的智能体：导入（复制）为我的智能体。 */
  onImport?: () => void;
  /** 自己公开的智能体：右上角「取消公开」，撤回后不再出现在市场。 */
  onUnpublish?: () => void;
  /** 自己公开的智能体：打开该智能体的详情页。 */
  onOpenAgent?: () => void;
}) {
  const { t, locale } = useTranslation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [tab, setTab] = useState<MarketDetailTabId>("persona");
  const [layoutWidth, setLayoutWidth] = useState(windowWidth);
  useEffect(() => {
    setTab("persona");
  }, [entry.key]);
  // 内置智能体的指令在 market 数据里；用户公开智能体的指令在它自己的 Agent 上。
  const instructions = (entry.instructions || entry.agent?.instructions || "").trim();
  // 用户公开的智能体带发布方同步的两类技能（技能目录技能 id + 自建技能快照），
  // 统一解析后再渲染；模板预置的内部能力键不展示（详情页技能区同样不展示）。
  const skills = resolveMarketEntrySkills(entry, locale);
  // 公开的智能体只带连接器 id 引用，映射成本地化名称；未登记（卸载/失效）的 id 跳过。
  const connectorItems = entry.connectors
    .map((id) => ({ id, name: connectorNames[id] }))
    .filter((item): item is { id: string; name: string } => Boolean(item.name));
  // 「核心职责」的取值：内置智能体取面向市场的简介（detail）；
  // 用户公开的智能体没有市场简介，直接用它自己的职责（role），
  // 与 Agent 详情页「职责与人设」下的「核心职责」保持一一对应。
  // 职责为空时（用户未填职责）省掉该栏，避免出现空字段。
  const responsibility = entry.builtin ? entry.detail : entry.role;
  const showResponsibility = responsibility.trim().length > 0;
  // 用户公开智能体的 tags 是内部能力键（无展示名），不展示，避免露出裸 id。
  const showTags = entry.builtin && entry.tags.length > 0;
  // 主操作放进弹窗标题栏（常驻可见）：内置 / 远程智能体是「导入 / 复制」，自己的公开智能体是「打开详情」。
  const primaryAction = entry.builtin
    ? onImport
      ? { label: t("agent.marketImport"), icon: Download, onPress: onImport }
      : undefined
    : entry.remote
      ? onImport
        ? { label: t("agent.marketRemoteImport"), icon: Download, onPress: onImport }
        : undefined
      : onOpenAgent
        ? { label: t("agent.marketDetailOpenAgent"), icon: ArrowUpRight, onPress: onOpenAgent }
        : undefined;
  const stacked = layoutWidth < breakpoints.mobile;
  // 桌面端详情弹窗内容区固定高度：四个 tab（职责与人设 / 指令 / 技能 / 连接器）
  // 切换时弹窗整体高度不跳动。基准取视口高度的 60%，再把上限收到 600，
  // 避免超高显示器上弹窗过高、短内容 tabs 中间留出一片空场。
  // 内容超出基准时由右侧 ScrollView 内部滚动。
  // 预留的固定开销 = 背板上下内距 40 + 标题栏 ~59，故下限取 windowHeight - 160。
  // 窄屏（bottomSheet）弹窗本就贴近全屏高度，无需再固定。
  const detailContentHeight = stacked
    ? 0
    : Math.min(Math.round(windowHeight * 0.6), windowHeight - 160, 600);
  /**
   * 固定高度的样式。
   *
   * 注意不能写成 `{ flex: 1, height }`：`flex: 1` 在 Web 上展开为
   * `flex-basis: 0%`，主轴基准会盖掉同一节点的 `height`，弹窗高度就退回
   * 内容高度——切 tab 时高度跟着文字长短跳，正是要修掉的问题。
   * 所以固定高度的分支必须把 flex 权重让出来（basis 回到 auto）。
   */
  const contentSizing =
    detailContentHeight > 0
      ? {
          minHeight: 0,
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: "auto" as const,
          height: detailContentHeight,
        }
      : { minHeight: 0, flexGrow: 1, flexShrink: 1, flexBasis: 0 };
  const tabs: ReadonlyArray<{
    id: MarketDetailTabId;
    icon: IconComponent;
    title: string;
  }> = [
    { id: "persona", icon: Target, title: t("agent.marketDetailPersona") },
    { id: "instructions", icon: Terminal, title: t("agent.marketTabInstructions") },
    { id: "skills", icon: Puzzle, title: t("agent.marketTabSkills") },
    { id: "connectors", icon: Link2, title: t("agent.marketTabConnectors") },
  ];
  const active = tabs.find((item) => item.id === tab) ?? tabs[0];
  const personaContent = (
    <View
      style={{
        gap: DETAIL_BLOCK_GAP,
        padding: space.md,
        borderRadius: radius.medium,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.paper,
      }}
    >
      {showResponsibility ? (
        <>
          <DetailField label={t("agent.marketDetailResponsibility")}>
            <DetailValue>{responsibility}</DetailValue>
          </DetailField>
          <View style={{ height: 1, backgroundColor: colors.lineSoft }} />
        </>
      ) : null}
      <DetailField label={t("agent.marketDetailPersonaText")}>
        <DetailValue>{entry.persona}</DetailValue>
      </DetailField>
    </View>
  );
  const instructionsContent = (
    <View style={{ gap: space.lg }}>
      <DetailField label={t("agent.marketDetailInstructions")}>
        {instructions ? (
          <View
            style={{
              borderRadius: radius.medium,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.surfaceSoft,
              overflow: "hidden",
            }}
          >
            <View testID="market-agent-instructions" style={{ padding: space.md }}>
              <Markdown markdownit={assistantMarkdown} style={instructionsMarkdownStyle}>
                {instructions}
              </Markdown>
            </View>
          </View>
        ) : (
          <DetailNote icon={Terminal}>{t("agent.marketDetailNoInstructions")}</DetailNote>
        )}
      </DetailField>
    </View>
  );

  const skillsContent = (
    <View style={{ gap: space.lg }}>
      <DetailField label={t("agent.marketDetailSkills")}>
        {skills.length ? (
          <View style={{ gap: space.xs }}>
            {skills.map((skill) => (
              <View
                key={skill.id}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: space.xs,
                  padding: space.sm,
                  borderRadius: radius.control,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.paper,
                }}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: radius.small,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.sky,
                  }}
                >
                  <Puzzle size={14} strokeWidth={1.8} color={colors.primaryStrong} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: space.hairline }}>
                  <Text style={[textScale.markMedium, { color: colors.text, fontWeight: "600" }]}>
                    {skill.title}
                  </Text>
                  {skill.detail ? (
                    <Text numberOfLines={2} style={[textScale.bodySmall, { color: colors.muted }]}>
                      {skill.detail}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <DetailNote icon={Puzzle}>
            {entry.builtin
              ? t("agent.marketDetailNoSkills")
              : t("agent.marketDetailSkillsInDetail")}
          </DetailNote>
        )}
      </DetailField>
    </View>
  );

  const connectorsContent = (
    <View style={{ gap: space.lg }}>
      <DetailField label={t("agent.marketDetailConnectors")}>
        {connectorItems.length ? (
          <View style={{ gap: space.xs }}>
            {connectorItems.map((item) => (
              <View
                key={item.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.xs,
                  padding: space.sm,
                  borderRadius: radius.control,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.paper,
                }}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: radius.small,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.sky,
                  }}
                >
                  <Link2 size={14} strokeWidth={1.8} color={colors.primaryStrong} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[textScale.markMedium, { color: colors.text, fontWeight: "600" }]}>
                    {item.name}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <DetailNote icon={Link2}>
            {entry.builtin
              ? t("agent.marketDetailConnectorBuiltin")
              : t("agent.marketDetailConnectorUser")}
          </DetailNote>
        )}
      </DetailField>
    </View>
  );
  const content = (() => {
    switch (tab) {
      case "skills":
        return skillsContent;
      case "connectors":
        return connectorsContent;
      case "instructions":
        return instructionsContent;
      default:
        return personaContent;
    }
  })();

  return (
    <Sheet
      title={entry.name}
      onClose={onClose}
      wide
      scroll={false}
      headerAction={
        onUnpublish || primaryAction ? (
          <View style={[s.row, { gap: 8 }]}>
            {/* 自己公开的智能体：右上角提供「取消公开」，与卡片上的同一个动作。 */}
            {onUnpublish ? (
              <Button small icon={Globe2} onPress={onUnpublish}>
                {t("agent.marketUnpublish")}
              </Button>
            ) : null}
            {primaryAction ? (
              <Button primary small icon={primaryAction.icon} onPress={primaryAction.onPress}>
                {primaryAction.label}
              </Button>
            ) : null}
          </View>
        ) : undefined
      }
    >
      <View
        style={contentSizing}
        onLayout={(event) => setLayoutWidth(event.nativeEvent.layout.width)}
      >
        <View
          style={{
            flex: 1,
            minHeight: 0,
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
              {tabs.map((item) => {
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
                      {item.title}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View style={{ width: 188, flexShrink: 0, gap: space.sm }}>
              <View
                style={{
                  padding: 13,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.paper,
                  gap: 11,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
                  <AgentOrb avatar={entry.avatar} size={38} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text numberOfLines={1} style={[s.text, { fontSize: 13, fontWeight: "600" }]}>
                      {entry.name}
                    </Text>
                    <MarketAgentAuthorLine source={entry.source} official={entry.builtin} />
                  </View>
                </View>
                {showTags ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xxs }}>
                    {entry.tags.map((tag) => (
                      <Chip key={tag} variant="outline">
                        {tag}
                      </Chip>
                    ))}
                  </View>
                ) : null}
              </View>
              <View accessibilityRole="tablist" style={{ gap: 3 }}>
                {tabs.map((item) => (
                  <MarketDetailRailItem
                    key={item.id}
                    label={item.title}
                    icon={item.icon}
                    selected={item.id === tab}
                    onPress={() => setTab(item.id)}
                  />
                ))}
              </View>
            </View>
          )}

          <ScrollView
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{ gap: space.sm, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ gap: 3 }}>
              <Text style={[typography.heading, { fontSize: 19 }]}>{active.title}</Text>
              {stacked ? (
                <View style={{ gap: 2 }}>
                  <Text style={s.small}>{entry.name}</Text>
                  <MarketAgentAuthorLine source={entry.source} official={entry.builtin} />
                </View>
              ) : null}
            </View>
            <View
              style={{
                padding: stacked ? space.md : space.lg,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.paper,
                gap: space.lg,
              }}
            >
              {content}
            </View>
          </ScrollView>
        </View>
      </View>
    </Sheet>
  );
}

/** 市场里的智能体卡片：内置可导入，用户公开的展示详情 / 撤回入口。 */
function MarketAgentCard({
  entry,
  onImport,
  onUnpublish,
  onOpen,
}: {
  entry: MarketAgentEntry;
  /** 内置 / 其他用户公开智能体的「导入（复制）」动作；自己的公开智能体不传。 */
  onImport?: () => void;
  /** 自己公开的智能体：取消公开，撤回后该卡片不再出现在市场。 */
  onUnpublish?: () => void;
  /** 打开智能体详情弹窗（内置与用户公开的智能体都先看详情）。 */
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  // 卡片里的「核心职责」与详情弹窗保持同口径：
  // - 官方内置智能体：展示面向市场的职责摘要（detail）；
  // - 用户公开 / 远程公开智能体：展示它自己的 role。
  const responsibility = entry.builtin ? entry.detail : entry.role;
  // 卡片正文统一展示「核心职责 + 人设描述摘录」：
  // - 官方内置智能体：职责取 role，正文优先展示 persona 的一部分；
  // - 用户公开 / 远程公开智能体：沿用原先的 role + detail（detail 已是 persona/role 回退）。
  const summary = entry.builtin ? entry.persona || entry.detail : entry.detail;
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 172,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.paper,
        overflow: "hidden",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.name} · ${summary}`}
        onPress={onOpen}
        disabled={!onOpen}
        style={({ pressed }) => ({
          flex: 1,
          paddingTop: 14,
          paddingHorizontal: 14,
          backgroundColor: pressed ? colors.surfaceSoft : colors.paper,
        })}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <AgentOrb avatar={entry.avatar} size={32} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
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
              {entry.name}
            </Text>
          </View>
          {!entry.builtin && !entry.remote && (
            <ArrowUpRight size={14} strokeWidth={1.7} color={colors.disabled} />
          )}
        </View>
        {/* 用户公开 / 他用户公开的智能体：卡片补一行「核心职责」（取自该智能体的职责），
            与详情弹窗的「核心职责」一一对应；内置智能体正文已经是市场简介，不再重复。 */}
        {responsibility ? (
          <Text
            numberOfLines={1}
            style={{
              marginTop: 8,
              color: colors.faint,
              fontSize: 11,
              lineHeight: 16,
              fontFamily: fonts.sans,
            }}
          >
            {responsibility}
          </Text>
        ) : null}
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
          {summary}
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
          <View
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            {entry.builtin ? <OfficialMark /> : null}
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
              {entry.source}
            </Text>
          </View>
          {entry.builtin || entry.remote ? (
            onImport ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t(
                  entry.remote ? "agent.marketRemoteImport" : "agent.marketImport",
                )} · ${entry.name}`}
                hitSlop={6}
                onPress={onImport}
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
                <Download size={12} strokeWidth={1.8} color={colors.primaryStrong} />
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
                  {t(entry.remote ? "agent.marketRemoteImport" : "agent.marketImport")}
                </Text>
              </Pressable>
            ) : null
          ) : onUnpublish ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t("agent.marketUnpublish")} · ${entry.name}`}
              hitSlop={6}
              onPress={onUnpublish}
              style={({ pressed }) => ({
                height: 24,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 9,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: pressed ? colors.surfaceSoft : colors.paper,
              })}
            >
              <Globe2 size={12} strokeWidth={1.8} color={colors.muted} />
              <Text
                numberOfLines={1}
                style={{
                  color: colors.muted,
                  fontSize: 11,
                  lineHeight: 16,
                  fontWeight: "500",
                  fontFamily: fonts.sans,
                }}
              >
                {t("agent.marketUnpublish")}
              </Text>
            </Pressable>
          ) : (
            <StatusBadge tone="done" label={t("agent.marketPublicBadge")} />
          )}
        </View>
      </View>
    </View>
  );
}

/** 安装面板里的一行目标：可挂到智能体，也可挂到频道。 */
function InstallTargetRow({
  title,
  detail,
  avatar,
  installed,
  first,
  locked,
  onPress,
}: {
  title: string;
  detail: string;
  avatar: ReactNode;
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
      accessibilityLabel={`${title} · ${
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
      {avatar}
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
          {title}
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
          {detail}
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
 * 目标选择面板：技能详情弹层的「添加到智能体/频道」视图。
 *
 * 目录技能（安装）与自建技能（添加）共用这一版式，
 * 同时展示全部智能体和频道，只有「是否已持有」的判定方式不同，由调用方传入。
 */
function InstallTargetPickerPanel({
  agents,
  channels,
  isAgentAdded,
  isChannelAdded,
  lockedAgentIds,
  onToggleAgent,
  onToggleChannel,
}: {
  agents: AgentDefinition[];
  channels: Channel[];
  isAgentAdded: (agent: AgentDefinition) => boolean;
  isChannelAdded: (channel: Channel) => boolean;
  /** 兼容旧数据的只读 Agent 列表；账户级技能库下当前 UI 不再传入。 */
  lockedAgentIds?: string[];
  onToggleAgent: (agent: AgentDefinition) => void;
  onToggleChannel: (channel: Channel) => void;
}) {
  const { t } = useTranslation();
  const targets = [
    ...agents.map((agent) => ({
      key: `agent:${agent.id}`,
      title: agent.name,
      detail: agent.role,
      avatar: <AgentOrb avatar={agent.avatar} size={30} />,
      installed: isAgentAdded(agent),
      locked: (lockedAgentIds ?? []).includes(agent.id),
      onPress: () => onToggleAgent(agent),
    })),
    ...channels.map((channel) => ({
      key: `channel:${channel.id}`,
      title: channel.name,
      detail: t("channels.memberCount", { count: channel.agentIds.length }),
      avatar: <AgentOrb avatar={normalizeChannelAvatar(channel.avatar)} size={30} />,
      installed: isChannelAdded(channel),
      locked: false,
      onPress: () => onToggleChannel(channel),
    })),
  ];
  // 只有真正传入锁定列表的面板才提示「不可移除」，避免无锁定视图出现误导性说明。
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.small}>
        {t(lockedAgentIds ? "agent.skillInstallHint" : "agent.skillInstallHintNoLock")}
      </Text>
      {targets.length ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.field,
            overflow: "hidden",
          }}
        >
          {targets.map((target, index) => {
            return (
              <InstallTargetRow
                key={target.key}
                title={target.title}
                detail={target.detail}
                avatar={target.avatar}
                installed={target.installed}
                first={index === 0}
                locked={target.installed && target.locked}
                onPress={target.onPress}
              />
            );
          })}
        </View>
      ) : (
        <Text style={s.small}>{t("agent.skillShareNoTargets")}</Text>
      )}
      <Text style={[s.small, { color: colors.faint }]}>
        {t("agent.skillInstallSummary", {
          count:
            agents.filter((agent) => isAgentAdded(agent)).length +
            channels.filter((channel) => isChannelAdded(channel)).length,
        })}
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
  channels,
  onClose,
  onUse,
  onToggleInstallAgent,
  onToggleInstallChannel,
}: {
  skill: SkillCatalogEntry;
  /** 传入即展示「安装到智能体/频道」面板；不传则为只读详情。 */
  agents?: AgentDefinition[];
  channels?: Channel[];
  onClose: () => void;
  /** 传入即展示「使用此技能」操作；不传则隐藏该区域。 */
  onUse?: () => void;
  /** 切换某个智能体的安装状态（已安装则移除）。 */
  onToggleInstallAgent?: (agent: AgentDefinition) => void;
  /** 切换某个频道的安装状态（已安装则移除）。 */
  onToggleInstallChannel?: (channel: Channel) => void;
}) {
  const { t, locale } = useTranslation();
  const [installing, setInstalling] = useState(false);
  const appearance = SKILL_CATEGORY_APPEARANCE[skillCategory(skill)];
  const primaryTitle = locale === "zh-Hans" ? skill.titleZh : skill.titleEn;
  const secondaryTitle = locale === "zh-Hans" ? skill.titleEn : skill.titleZh;
  const installable = Boolean(
    (agents || channels) && onToggleInstallAgent && onToggleInstallChannel,
  );

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
        <InstallTargetPickerPanel
          agents={agents ?? []}
          channels={channels ?? []}
          isAgentAdded={(agent) => agent.installedSkills.includes(skill.id)}
          isChannelAdded={(channel) => (channel.installedSkills ?? []).includes(skill.id)}
          onToggleAgent={(agent) => onToggleInstallAgent?.(agent)}
          onToggleChannel={(channel) => onToggleInstallChannel?.(channel)}
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
  channels,
  addedAgentIds,
  addedChannelIds,
  lockedAgentIds,
  onToggleAddAgent,
  onToggleAddChannel,
  onClose,
}: {
  title: string;
  subtitle?: string;
  skill: Pick<AgentSkill, "name" | "purpose" | "instructions" | "outputFormat" | "version">;
  footer?: ReactNode;
  /** 可选的智能体（全部，含技能来源 Agent）。传入即展示「添加到智能体/频道」入口。 */
  agents?: AgentDefinition[];
  channels?: Channel[];
  /** 已持有该技能的智能体 id，用于行内「已添加」标记与计数。 */
  addedAgentIds?: string[];
  /** 已持有该技能的频道 id，用于行内「已添加」标记与计数。 */
  addedChannelIds?: string[];
  /** 兼容旧数据：需保留的副本所在智能体 id；账户级技能库下当前 UI 不再传入。 */
  lockedAgentIds?: string[];
  /** 切换某个智能体是否持有该技能。 */
  onToggleAddAgent?: (agent: AgentDefinition) => void;
  /** 切换某个频道是否持有该技能。 */
  onToggleAddChannel?: (channel: Channel) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const shareable = Boolean((agents || channels) && onToggleAddAgent && onToggleAddChannel);
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
        <InstallTargetPickerPanel
          agents={agents ?? []}
          channels={channels ?? []}
          isAgentAdded={(agent) => (addedAgentIds ?? []).includes(agent.id)}
          isChannelAdded={(channel) => (addedChannelIds ?? []).includes(channel.id)}
          lockedAgentIds={lockedAgentIds}
          onToggleAgent={(agent) => onToggleAddAgent?.(agent)}
          onToggleChannel={(channel) => onToggleAddChannel?.(channel)}
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

function appConnectorCard(
  item: AppConnectorView,
  onPress: () => void,
  labels: { connected: string; idle: string },
): CatalogItem {
  const icon =
    item.category === "search"
      ? Search
      : item.category === "documents"
        ? FileText
        : item.category === "files"
          ? FolderOpen
          : item.category === "development"
            ? Terminal
            : item.category === "office"
              ? Mail
              : Link2;
  return {
    id: `app:${item.slug}`,
    testID: `app-connector-${item.slug}`,
    type: "connectors",
    tags: [item.category, "connections", ...(item.featured ? (["featured"] as const) : [])],
    title: item.name,
    detail: item.summary,
    icon,
    iconColor: colors.primary,
    iconSurface: colors.sky,
    source: item.connected ? labels.connected : labels.idle,
    state: item.connected ? "connected" : "available",
    onPress,
  };
}

export function CapabilityHubScreen() {
  const { t, locale } = useTranslation();
  const { width } = useWindowDimensions();
  const { navigate, workspace, api, refresh, notify, open, prefillPrompt } = useWorkspace();
  const appConnectors = useAppConnectors(api);
  // 连接器 id → 展示名 的映射（内置工作区连接器 + 账户级应用连接器），
  // 供市场详情弹窗把发布方公开的连接器 id 引用渲染成名称。
  const marketConnectorNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const option of allConnectorOptions(connectorOptions(workspace), appConnectors.items)) {
      names[option.id] = option.name;
    }
    return names;
  }, [workspace, appConnectors.items]);
  const [appSlug, setAppSlug] = useState<string | null>(null);
  const {
    agents: agentList,
    createAgent,
    selectAgent,
    setAgentPublic,
    setSkillInstalled,
    setSkillRef,
    deleteSkill,
    skillLibrary,
    saveLibrarySkill,
    deleteLibrarySkill,
  } = useAgentSpace();
  const { channels, updateChannel } = useChannels();
  const [category, setCategory] = useState<CategoryId>("all");
  const [typeFilter, setTypeFilter] = useState<CapabilityType>("skills");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [configSheet, setConfigSheet] = useState<ConfigSheet>();
  const [googleConnectingId, setGoogleConnectingId] = useState<"gmail" | "calendar">();
  const [selectedSkillId, setSelectedSkillId] = useState<string>();
  /** 详情弹窗中正在查看的「我的技能」条目。 */
  const [selectedMySkill, setSelectedMySkill] = useState<MySkillEntry>();
  /** 「我的技能」里正在创建新技能。 */
  const [creatingSkill, setCreatingSkill] = useState(false);
  /** 正在读取并解析 SKILL.md：期间禁掉再次点击，避免重复入库。 */
  const [uploadingSkill, setUploadingSkill] = useState(false);
  /** 「上传技能」说明弹窗：先讲清格式与上传方式，再让用户选文件或拖拽。 */
  const [uploadSkillOpen, setUploadSkillOpen] = useState(false);
  /** 「我的技能」里正在编辑库中的技能（编辑不产生 Agent 副本）。 */
  const [editingMySkill, setEditingMySkill] = useState<AgentSkill>();
  /** 技能 tab 的二级视角：「技能市场」技能目录 / 「我的技能」。 */
  const [skillTab, setSkillTab] = useState<"all" | "mine">("all");
  /** 市场 tab 的二级视角：「市场公开」 / 「我的智能体」。 */
  const [marketTab, setMarketTab] = useState<"all" | "mine">("all");
  /** 市场里待导入（确认克隆）的智能体：内置智能体或其他用户公开的智能体。 */
  const [importingAgent, setImportingAgent] = useState<MarketImportTarget>();
  /** 市场卡片的详情弹窗：内置与用户公开的智能体都先看详情，再决定导入 / 打开。 */
  const [detailEntry, setDetailEntry] = useState<MarketAgentEntry>();
  /** 删除前二次确认：待删除的「我的技能」条目。 */
  const [deletingMySkill, setDeletingMySkill] = useState<MySkillEntry>();
  /** 服务端跨用户市场：其他人已公开的智能体快照；拉取失败时静默降级为只看本地市场。 */
  const [remoteMarketAgents, setRemoteMarketAgents] = useState<RemoteMarketAgent[]>();
  useEffect(() => {
    let cancelled = false;
    api
      .request<RemoteMarketAgent[]>("/api/market-agents")
      .then((records) => {
        if (!cancelled) setRemoteMarketAgents(records);
      })
      .catch(() => {
        // 网络异常时不打断市场页，保持「内置 + 自己公开」的本地视图。
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

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
  /** 频道对账户级自建技能直接保存引用，所以只需看 `skillRefs`。 */
  const mySkillAddedChannelIds = selectedMySkill
    ? channels
        .filter((channel) => (channel.skillRefs ?? []).includes(selectedMySkill.skill.id))
        .map((channel) => channel.id)
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
    const action = toggleSkillShare({ setSkillRef, deleteSkill }, agent, selectedMySkill.skill);
    notify(
      t(action === "added" ? "agent.skillInstalledToast" : "agent.skillUninstalledToast", {
        title: selectedMySkill.skill.name,
        agent: agent.name,
      }),
    );
  }

  function toggleMySkillInChannel(channel: Channel) {
    if (!selectedMySkill) return;
    const installed = (channel.skillRefs ?? []).includes(selectedMySkill.skill.id);
    void updateChannel(channel.id, {
      skillRefs: installed
        ? (channel.skillRefs ?? []).filter((id) => id !== selectedMySkill.skill.id)
        : [...new Set([...(channel.skillRefs ?? []), selectedMySkill.skill.id])],
    });
    notify(
      t(installed ? "agent.skillUninstalledToast" : "agent.skillInstalledToast", {
        title: selectedMySkill.skill.name,
        agent: channel.name,
      }),
    );
  }

  /**
   * 把选中的 SKILL.md 解析后写进「我的技能」库。
   * 不自动挂到某个 Agent：入库后仍走卡片里的「添加到智能体」，与手写创建保持一致。
   * 解析失败时保留弹窗，让用户换一个文件重试。
   */
  async function saveUploadedSkill(picked: PickedSkillFile) {
    if (uploadingSkill) return;
    setUploadingSkill(true);
    try {
      const parsed = parseSkillMarkdown(picked.text, {
        fallbackName: skillNameFromFile(picked.name),
        locale,
      });
      saveLibrarySkill(parsed);
      setSkillTab("mine");
      setUploadSkillOpen(false);
      notify(t("agentSpace.skillUploadedToast", { title: parsed.name }));
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    } finally {
      setUploadingSkill(false);
    }
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
    deleteSkillEverywhere({ setSkillRef, deleteSkill }, agentList, entry.skill);
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

  function toggleSkillInstallInChannel(channel: Channel) {
    if (!selectedSkill) return;
    const installed = (channel.installedSkills ?? []).includes(selectedSkill.id);
    void updateChannel(channel.id, {
      installedSkills: installed
        ? (channel.installedSkills ?? []).filter((id) => id !== selectedSkill.id)
        : [...new Set([...(channel.installedSkills ?? []), selectedSkill.id])],
    });
    notify(
      t(installed ? "agent.skillUninstalledToast" : "agent.skillInstalledToast", {
        title: locale === "zh-Hans" ? selectedSkill.titleZh : selectedSkill.titleEn,
        agent: channel.name,
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
      type: "connectors",
      tags: ["workspace", "connections"],
      title: t("app.titleCalendar"),
      detail: t("agent.shortcutCalendarDetail"),
      icon: CalendarDays,
      iconColor: serviceBrands.googleCalendar.fg,
      iconSurface: serviceBrands.googleCalendar.surface,
      source: workspaceSource,
      state: "connected",
      onPress: () => navigate("calendar"),
    },
    {
      id: "browser",
      type: "connectors",
      tags: ["connections", "research"],
      title: t("threads.agentComputer"),
      detail: t("agent.hubBrowserDetail"),
      icon: Globe2,
      iconColor: serviceBrands.browser.fg,
      iconSurface: serviceBrands.browser.surface,
      source: builtInSource,
      state: "connected",
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
    ...appConnectors.items.map((item) =>
      appConnectorCard(item, () => setAppSlug(item.slug), {
        connected: t("agent.hubConnectorStateConnected"),
        idle: t("agent.hubCategoryConnections"),
      }),
    ),
  ];

  const selectType = (next: CapabilityType) => {
    setCategory("all");
    setQuery("");
    setTypeFilter(next);
  };

  // 市场数据：内置公开智能体 + 其他人公开的智能体（服务端市场）+ 自己公开的智能体。
  const marketSourceBuiltin = t("agent.marketSourceBuiltin");
  // 用户公开的智能体都来自当前账号，来源标签显示「@昵称」，昵称缺省时回退到通用文案。
  const accountNickname = workspace.profile.name.trim();
  const marketSourceUser = accountNickname ? `@${accountNickname}` : t("agent.marketSourceUser");
  const builtinEntries = builtinMarketEntries(marketSourceBuiltin);
  const userEntries = userMarketEntries(agentList, marketSourceUser, skillLibrary);
  // 自己公开的智能体已由 userEntries 以「@我的昵称」列出，过滤掉服务端市场里的同名记录，避免卡片重复。
  const ownPublicAgentIds = new Set(
    userEntries.map((entry) => entry.agent?.id).filter((id): id is string => Boolean(id)),
  );
  const remoteEntries = remoteMarketEntries(
    remoteMarketAgents,
    ownPublicAgentIds,
    marketSourceUser,
  );
  const marketAllEntries: MarketAgentEntry[] = [
    ...builtinEntries,
    ...remoteEntries,
    ...userEntries,
  ];
  const marketMineEntries: MarketAgentEntry[] = userEntries;
  // 市场条目过滤：先按「市场公开 / 我的智能体」切视角，再按分类与关键词过滤。
  const marketByTab = marketTab === "mine" ? marketMineEntries : marketAllEntries;
  const marketByCategory =
    category === "all" ? marketByTab : marketByTab.filter((entry) => entry.category === category);
  const marketNormalizedQuery = query.trim().toLowerCase();
  const marketVisibleEntries = marketNormalizedQuery
    ? marketByCategory.filter((entry) =>
        [entry.name, entry.role, entry.detail, ...entry.tags]
          .join("\u0000")
          .toLowerCase()
          .includes(marketNormalizedQuery),
      )
    : marketByCategory;
  // 市场分类侧栏的计数（只统计内置智能体，用户公开的归入「全部」）。
  const marketCategoryCounts = MARKET_CATEGORY_OPTIONS.reduce(
    (result, option) => {
      result[option.id] =
        option.id === "all"
          ? marketByTab.length
          : marketByTab.filter((entry) => entry.category === option.id).length;
      return result;
    },
    {} as Record<CategoryId, number>,
  );

  /**
   * 导入市场智能体：克隆成用户自己的 Agent，并切到该 Agent。
   * 内置智能体预置对应技能与完整指令；其他用户公开的智能体复制基本信息、
   * 人设、指令、技能目录技能、自建技能快照与连接器引用（资料/记忆/模型/任务不导入）。
   */
  function importAgent(target: MarketImportTarget) {
    const agent = createAgent({
      template: "custom",
      name: target.name,
      role: target.role,
      persona: target.persona,
      avatar: target.avatar,
      ...(target.installedSkills?.length ? { installedSkills: [...target.installedSkills] } : {}),
      // 自建技能快照随导入一起交给 createAgent：它会复制成导入用户技能库里的独立记录，
      // 新 Agent 再通过 skillRefs 引用，保证技能配置与发布方一致且导入用户可独立编辑管理。
      ...(target.customSkills?.length ? { customSkills: [...target.customSkills] } : {}),
      ...(target.connectors?.length ? { installedConnectors: [...target.connectors] } : {}),
      ...(target.instructions?.trim() ? { instructions: target.instructions.trim() } : {}),
    });
    selectAgent(agent.id);
    notify(t("agent.marketImportedToast", { name: agent.name }));
  }

  /** 取消公开自己已公开的智能体：撤回后该卡片从市场消失，并给出提示。 */
  function unpublishAgent(entry: MarketAgentEntry) {
    const agent = entry.agent;
    if (!agent) return;
    setAgentPublic(agent.id, false);
    notify(t("agent.marketUnpublishedToast", { name: agent.name }));
  }

  /** 把市场条目转成「导入 / 复制」确认所需的克隆内容；自己的公开智能体没有导入入口。 */
  function toImportTarget(entry: MarketAgentEntry): MarketImportTarget | undefined {
    if (entry.builtin) {
      const builtin = BUILTIN_MARKET_AGENTS.find((item) => item.id === entry.builtinId);
      if (!builtin) return undefined;
      return {
        name: builtin.name,
        role: builtin.role,
        persona: builtin.persona,
        avatar: builtin.avatar,
        detail: builtin.detail,
        installedSkills: builtin.skills,
        instructions: builtin.instructions,
      };
    }
    if (entry.remote) {
      return {
        remote: true,
        name: entry.name,
        role: entry.role,
        persona: entry.persona,
        avatar: entry.avatar,
        detail: entry.detail,
        // 远程智能体公开的技能一并导入：技能目录技能 id + 自建技能快照 + 连接器引用，
        // 保证导入后技能配置与发布方一致（资料/记忆/模型/任务、模板内部能力键不导入）。
        installedSkills: entry.installedSkills,
        customSkills: entry.customSkills,
        connectors: entry.connectors,
        instructions: entry.instructions || undefined,
      };
    }
    return undefined;
  }

  const shortcuts: Shortcut[] = [
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
    {
      id: "market",
      title: t("agent.marketHeading"),
      detail: t("agent.marketShortDetail"),
      icon: Users,
      onPress: () => selectType("market"),
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

  // 连接页展示 Gmail、Google Calendar、OpenBot 和智能体电脑。
  // 日历工作区入口已恢复；邮件快捷卡仍隐藏。
  const HIDDEN_CAPABILITY_IDS: Partial<Record<CapabilityType, readonly string[]>> = {
    plugins: ["mail"],
  };
  const hiddenIdsForType = HIDDEN_CAPABILITY_IDS[typeFilter] ?? [];
  const scopedItems = items.filter(
    (item) => item.type === typeFilter && !hiddenIdsForType.includes(item.id),
  );
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
          {typeFilter === "market" ? (
            <View style={{ gap: 14 }}>
              <HubTabBar
                tabs={[
                  { id: "all", label: t("agent.marketTabPublic") },
                  { id: "mine", label: t("agent.marketTabMine") },
                ]}
                active={marketTab}
                onChange={(next) => {
                  // 切到「我的智能体」时重置分类，避免沿用市场公开下的分类筛出空结果。
                  if (next === "mine") setCategory("all");
                  setMarketTab(next);
                }}
              />
              {!useCategoryRail && searchField}

              <View style={{ flexDirection: useCategoryRail ? "row" : "column", gap: 20 }}>
                {useCategoryRail && marketTab === "all" && (
                  <View style={{ width: 180, gap: 10 }}>
                    {searchField}
                    <CategoryRail
                      category={category}
                      counts={marketCategoryCounts}
                      onChange={setCategory}
                      options={MARKET_CATEGORY_OPTIONS}
                    />
                  </View>
                )}
                {!useCategoryRail && marketTab === "all" && (
                  <CategoryRail
                    category={category}
                    counts={marketCategoryCounts}
                    onChange={setCategory}
                    options={MARKET_CATEGORY_OPTIONS}
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
                      {t("agent.marketListHeading")}
                    </Text>
                    <Text
                      style={{
                        color: colors.faint,
                        fontSize: 11,
                        lineHeight: 16,
                        fontFamily: fonts.sans,
                      }}
                    >
                      {t("agent.hubAgentCount", { count: marketVisibleEntries.length })}
                    </Text>
                  </View>

                  {marketVisibleEntries.length ? (
                    <View style={{ gap: 12 }}>
                      {chunk(marketVisibleEntries, gridColumns).map((row) => (
                        <View
                          key={row[0].key}
                          style={{ flexDirection: "row", gap: 12, alignItems: "stretch" }}
                        >
                          {row.map((entry) => (
                            <MarketAgentCard
                              key={entry.key}
                              entry={entry}
                              onImport={
                                entry.builtin || entry.remote
                                  ? () => {
                                      const target = toImportTarget(entry);
                                      if (target) setImportingAgent(target);
                                    }
                                  : undefined
                              }
                              onUnpublish={
                                !entry.builtin && !entry.remote
                                  ? () => unpublishAgent(entry)
                                  : undefined
                              }
                              onOpen={() => setDetailEntry(entry)}
                            />
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
                        icon={marketNormalizedQuery || category !== "all" ? Search : Users}
                        title={t(
                          marketNormalizedQuery || category !== "all"
                            ? "agent.hubAgentNoMatchTitle"
                            : marketTab === "mine"
                              ? "agent.marketMineEmptyTitle"
                              : "agent.marketEmptyTitle",
                        )}
                        detail={t(
                          marketNormalizedQuery || category !== "all"
                            ? "agent.hubNoMatchDetail"
                            : marketTab === "mine"
                              ? "agent.marketMineEmptyDetail"
                              : "agent.marketEmptyDetail",
                        )}
                      />
                    </View>
                  )}
                </View>
              </View>
            </View>
          ) : null}
          {typeFilter === "skills" && (
            <HubTabBar
              tabs={[
                { id: "all", label: t("agent.skillMarketAll") },
                { id: "mine", label: t("agent.mySkills") },
              ]}
              active={skillTab}
              onChange={setSkillTab}
              action={
                <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                  <Button
                    small
                    icon={Upload}
                    disabled={uploadingSkill}
                    onPress={() => setUploadSkillOpen(true)}
                  >
                    {t("agentSpace.uploadSkill")}
                  </Button>
                  <Button small icon={Plus} onPress={() => setCreatingSkill(true)}>
                    {t("agentSpace.createSkill")}
                  </Button>
                </View>
              }
            />
          )}
          {typeFilter === "market" ? null : typeFilter === "skills" && skillTab === "mine" ? (
            <View style={{ gap: 12 }}>
              {/* 与智能体市场「我的智能体」一致的计数行：左边「全部」，右边显示我的技能数量。 */}
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
                  {t("agent.marketListHeading")}
                </Text>
                <Text
                  style={{
                    color: colors.faint,
                    fontSize: 11,
                    lineHeight: 16,
                    fontFamily: fonts.sans,
                  }}
                >
                  {t("agent.hubSkillCount", { count: mySkills.length })}
                </Text>
              </View>
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

      {appConnectors.items.find((item) => item.slug === appSlug) ? (
        <AppConnectorSheet
          item={appConnectors.items.find((item) => item.slug === appSlug) as AppConnectorView}
          api={api}
          onClose={() => setAppSlug(null)}
          onChanged={() => void appConnectors.refresh()}
        />
      ) : null}
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

      {detailEntry && (
        <MarketAgentDetailSheet
          entry={detailEntry}
          connectorNames={marketConnectorNames}
          onClose={() => setDetailEntry(undefined)}
          onImport={
            detailEntry.builtin || detailEntry.remote
              ? () => {
                  const target = toImportTarget(detailEntry);
                  setDetailEntry(undefined);
                  if (target) setImportingAgent(target);
                }
              : undefined
          }
          onUnpublish={
            !detailEntry.builtin && !detailEntry.remote
              ? () => {
                  // 撤回后该条目已不在市场，详情弹窗随之关闭。
                  unpublishAgent(detailEntry);
                  setDetailEntry(undefined);
                }
              : undefined
          }
          onOpenAgent={
            !detailEntry.builtin && !detailEntry.remote && detailEntry.agent
              ? () => {
                  const agent = detailEntry.agent;
                  if (!agent) return;
                  setDetailEntry(undefined);
                  selectAgent(agent.id);
                  navigate("agent");
                }
              : undefined
          }
        />
      )}

      {importingAgent && (
        <Sheet
          title={t(
            importingAgent.remote ? "agent.marketRemoteImportTitle" : "agent.marketImportTitle",
          )}
          subtitle={importingAgent.name}
          onClose={() => setImportingAgent(undefined)}
          narrow
        >
          <View style={{ gap: 16 }}>
            <Text style={s.muted}>{importingAgent.detail}</Text>
            <View style={{ gap: 6 }}>
              <Text style={s.label}>
                {t(
                  importingAgent.remote ? "agent.marketRemoteImportHint" : "agent.marketImportHint",
                )}
              </Text>
              <Text style={s.small}>{importingAgent.persona}</Text>
            </View>
            <View style={[s.row, { gap: 10, marginTop: 4 }]}>
              <Button style={{ flex: 1 }} onPress={() => setImportingAgent(undefined)}>
                {t("common.cancel")}
              </Button>
              <Button
                primary
                style={{ flex: 1 }}
                onPress={() => {
                  const target = importingAgent;
                  setImportingAgent(undefined);
                  importAgent(target);
                }}
              >
                {t(
                  importingAgent.remote
                    ? "agent.marketRemoteImportConfirm"
                    : "agent.marketImportConfirm",
                )}
              </Button>
            </View>
          </View>
        </Sheet>
      )}

      {uploadSkillOpen && (
        <Sheet
          title={t("agentSpace.uploadSkill")}
          subtitle={t("agentSpace.uploadSkillHint")}
          onClose={() => setUploadSkillOpen(false)}
          narrow
        >
          <View style={{ gap: 12 }}>
            <SkillDropzone
              title={t("agentSpace.uploadSkillDropzoneTitle")}
              hint={t("agentSpace.uploadSkillDropzoneHint")}
              dragHint={t("agentSpace.uploadSkillDropzoneDragHint")}
              busy={uploadingSkill}
              onPick={(picked) => void saveUploadedSkill(picked)}
              onError={notify}
            />
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
          channels={channels}
          addedAgentIds={mySkillAddedAgentIds}
          addedChannelIds={mySkillAddedChannelIds}
          onToggleAddAgent={toggleMySkillInAgent}
          onToggleAddChannel={toggleMySkillInChannel}
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
          channels={channels}
          onClose={() => setSelectedSkillId(undefined)}
          onUse={() => startSelectedSkill(selectedSkill)}
          onToggleInstallAgent={toggleSkillInstall}
          onToggleInstallChannel={toggleSkillInstallInChannel}
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
