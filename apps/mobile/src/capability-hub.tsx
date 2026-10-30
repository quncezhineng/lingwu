import { useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import {
  Activity,
  ArrowUpRight,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Cpu,
  FolderOpen,
  Globe2,
  Hand,
  type IconComponent,
  Link2,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  X,
} from "./icons";
import { type SkillCatalogEntry, type SkillCategory, skillCatalog } from "./skill-catalog";
import { StatusBadge } from "./status-badge";
import { breakpoints, radius } from "./theme";
import { appBrands, Button, Chip, colors, Empty, fonts, Sheet, s, serviceBrands } from "./ui";
import { useWorkspace } from "./workspace";

type HubTab = "marketplace" | "mine";
type CapabilityType = "plugins" | "skills" | "connectors" | "workspace";
type ConfigSheet = "model" | "openbot";
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
  installed: boolean;
  searchText?: string;
  onPress: () => void;
};

type Shortcut = {
  id: CapabilityType | "knowledge";
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
  workspace: CAPABILITY_CATEGORY_OPTIONS,
};

const FILLER_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

const TYPE_LABELS: Record<CapabilityType, TranslationKey> = {
  plugins: "agent.pluginsHeading",
  skills: "agent.skillsHeading",
  connectors: "agent.connectorsHeading",
  workspace: "agent.hubCategoryWorkspace",
};

const HUB_TAB_LABELS: Record<CapabilityType, Record<HubTab, TranslationKey>> = {
  plugins: {
    marketplace: "agent.hubPluginMarketplace",
    mine: "agent.hubMyPlugins",
  },
  skills: {
    marketplace: "agent.hubSkillMarketplace",
    mine: "agent.hubMySkills",
  },
  connectors: {
    marketplace: "agent.hubConnectorMarketplace",
    mine: "agent.hubMyConnectors",
  },
  workspace: {
    marketplace: "agent.hubMarketplace",
    mine: "agent.hubMine",
  },
};

const HUB_SEARCH_LABELS: Record<CapabilityType, TranslationKey> = {
  plugins: "agent.hubSearchPlugins",
  skills: "agent.hubSearchSkills",
  connectors: "agent.hubSearchConnectors",
  workspace: "agent.hubSearchCapabilities",
};

const HUB_COUNT_LABELS: Record<CapabilityType, TranslationKey> = {
  plugins: "agent.hubPluginCount",
  skills: "agent.hubSkillCount",
  connectors: "agent.hubConnectorCount",
  workspace: "agent.hubCapabilityCount",
};

const HUB_EMPTY_TITLE_LABELS: Record<CapabilityType, TranslationKey> = {
  plugins: "agent.hubPluginNoMatchTitle",
  skills: "agent.hubSkillNoMatchTitle",
  connectors: "agent.hubConnectorNoMatchTitle",
  workspace: "agent.hubNoMatchTitle",
};

const HUB_MY_EMPTY_TITLE_LABELS: Record<CapabilityType, TranslationKey> = {
  plugins: "agent.hubMyPluginsEmptyTitle",
  skills: "agent.hubMySkillsEmptyTitle",
  connectors: "agent.hubMyConnectorsEmptyTitle",
  workspace: "agent.hubNoMatchTitle",
};

const STATE_KEYS: Record<CapabilityState, TranslationKey> = {
  ready: "agent.hubStateReady",
  connected: "agent.hubStateConnected",
  available: "agent.hubStateAvailable",
  open: "agent.hubStateOpen",
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

function CapabilityCard({
  item,
  tab,
  installBusy,
  onSetInstalled,
}: {
  item: CatalogItem;
  tab: HubTab;
  installBusy: boolean;
  onSetInstalled: (installed: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 205,
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
          paddingTop: 16,
          paddingHorizontal: 16,
          backgroundColor: pressed ? colors.surfaceSoft : colors.paper,
        })}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: radius.field,
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
            marginTop: 14,
            color: colors.muted,
            fontSize: 13,
            lineHeight: 17,
            fontFamily: fonts.sans,
          }}
        >
          {item.detail}
        </Text>
      </Pressable>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <View
          style={[
            s.between,
            {
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: colors.line,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={{
              maxWidth: "52%",
              color: colors.faint,
              fontSize: 11,
              lineHeight: 16,
              fontFamily: fonts.sans,
            }}
          >
            {item.source}
          </Text>
          <StatusBadge
            tone={item.state === "available" ? "paused" : "done"}
            label={t(STATE_KEYS[item.state])}
            style={item.state === "available" ? undefined : { backgroundColor: colors.sky }}
          />
        </View>
        {tab === "mine" ? (
          <Button
            small
            icon={Trash2}
            busy={installBusy}
            onPress={() => onSetInstalled(false)}
            style={{ width: "100%", marginTop: 10 }}
          >
            {t("agent.hubRemove")}
          </Button>
        ) : item.installed ? (
          <Button
            small
            icon={Check}
            disabled
            onPress={() => undefined}
            style={{ width: "100%", marginTop: 10 }}
          >
            {t("agent.hubInstalled")}
          </Button>
        ) : (
          <Button
            small
            primary
            icon={Plus}
            busy={installBusy}
            onPress={() => onSetInstalled(true)}
            style={{ width: "100%", marginTop: 10 }}
          >
            {t("agent.hubInstall")}
          </Button>
        )}
      </View>
    </View>
  );
}

function SkillDetailSheet({
  skill,
  onClose,
  onUse,
}: {
  skill: SkillCatalogEntry;
  onClose: () => void;
  onUse: () => void;
}) {
  const { t, locale } = useTranslation();
  const appearance = SKILL_CATEGORY_APPEARANCE[skillCategory(skill)];
  const primaryTitle = locale === "zh-Hans" ? skill.titleZh : skill.titleEn;
  const secondaryTitle = locale === "zh-Hans" ? skill.titleEn : skill.titleZh;

  return (
    <Sheet title={primaryTitle} subtitle={secondaryTitle} onClose={onClose} narrow>
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

        <View style={{ gap: 10 }}>
          <Text style={s.small}>{t("agent.skillDetailUseHint")}</Text>
          <Button primary icon={Sparkles} onPress={onUse}>
            {t("agent.skillDetailUse")}
          </Button>
        </View>
      </View>
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
    <View style={{ width: 200, gap: 2 }}>
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

export function CapabilityHubScreen() {
  const { t, locale } = useTranslation();
  const { width } = useWindowDimensions();
  const { navigate, ask, workspace, api, refresh, notify, open } = useWorkspace();
  const [tab, setTab] = useState<HubTab>("marketplace");
  const [category, setCategory] = useState<CategoryId>("all");
  const [typeFilter, setTypeFilter] = useState<CapabilityType>("plugins");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [configSheet, setConfigSheet] = useState<ConfigSheet>();
  const [configBusy, setConfigBusy] = useState(false);
  const [configError, setConfigError] = useState("");
  const [googleConnectingId, setGoogleConnectingId] = useState<"gmail" | "calendar">();
  const [selectedSkillId, setSelectedSkillId] = useState<string>();
  const [installBusyId, setInstallBusyId] = useState<string>();

  const desktop = width >= breakpoints.desktop;
  const railWidth = desktop ? 232 : 0;
  const pagePadding = desktop ? 84 : 44;
  const contentWidth = Math.max(0, Math.min(width - railWidth, 1340) - pagePadding);
  const useCategoryRail = contentWidth >= 760;
  const gridWidth = contentWidth - (useCategoryRail ? 220 : 0);
  const gridColumns = gridWidth >= 920 ? 4 : gridWidth >= 660 ? 3 : gridWidth >= 430 ? 2 : 1;
  const shortcutsAsCarousel = contentWidth < 680;
  const shortcutColumns = contentWidth >= 1000 ? 4 : contentWidth >= 680 ? 3 : 2;

  const googleConnected = workspace.connections.some(
    (connection) =>
      connection.id === "google" &&
      (connection.status === "connected" || connection.status === "sample"),
  );
  const browserConnected = workspace.connections.some(
    (connection) => connection.id === "browser" && connection.status === "connected",
  );
  // 与连接器面板同一口径：选中模型即视为已连接（不再看 modelOptions 是否可切换）
  const modelConnected = Boolean(workspace.runtime.model);
  const modelOptions = workspace.runtime.modelOptions ?? [];
  const installedCapabilityIds = new Set(
    (workspace.installedCapabilities ?? []).map((capability) => capability.id),
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
      installed: installedCapabilityIds.has(id),
      searchText: [
        skill.id,
        skill.titleZh,
        skill.titleEn,
        skill.descriptionZh,
        skill.descriptionEn,
      ].join(" "),
      onPress: () => setSelectedSkillId(skill.id),
    };
  });
  const selectedSkill = selectedSkillId
    ? skillCatalog.find((skill) => skill.id === selectedSkillId)
    : undefined;

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

  async function switchModel(model: string) {
    setConfigBusy(true);
    setConfigError("");
    try {
      await api.request("/api/model", { model });
      await refresh();
      notify(t("screens.connectionsModelSwitched", { model: shortModel(model) }));
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : String(error));
    } finally {
      setConfigBusy(false);
    }
  }

  async function setCapabilityInstalled(item: CatalogItem, installed: boolean) {
    if (installBusyId) return;
    setInstallBusyId(item.id);
    try {
      await api.request(
        `/api/capabilities/${encodeURIComponent(item.id)}`,
        {
          type: item.type,
          installed,
        },
        "PUT",
      );
      await refresh();
      if (!installed) setCategory("all");
      notify(
        t(installed ? "agent.hubInstalledNotice" : "agent.hubRemovedNotice", {
          title: item.title,
        }),
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    } finally {
      setInstallBusyId(undefined);
    }
  }

  function startSelectedSkill(skill: SkillCatalogEntry) {
    ask(
      locale === "zh-Hans"
        ? `请使用「${skill.titleZh}」技能处理当前任务。\n\n技能说明：${skill.descriptionZh}\n\n开始前请先询问我缺少的必要信息。`
        : `Use the "${skill.titleEn}" skill for this task.\n\nSkill description: ${skill.descriptionEn}\n\nAsk for any missing inputs before starting.`,
    );
    setSelectedSkillId(undefined);
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
      installed: installedCapabilityIds.has("mail"),
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
      installed: installedCapabilityIds.has("calendar-workspace"),
      onPress: () => navigate("calendar"),
    },
    {
      id: "model",
      type: "plugins",
      tags: ["connections"],
      title: t("screens.connectionsModelLabel"),
      detail: t("agent.hubModelDetail"),
      icon: Cpu,
      iconColor: colors.primary,
      iconSurface: colors.sky,
      source: builtInSource,
      state: modelConnected ? "connected" : "available",
      installed: installedCapabilityIds.has("model"),
      onPress: () => setConfigSheet("model"),
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
      installed: installedCapabilityIds.has("gmail"),
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
      installed: installedCapabilityIds.has("calendar"),
      onPress: () => void openGoogleConnector("calendar"),
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
      state: browserConnected ? "connected" : "available",
      installed: installedCapabilityIds.has("browser"),
      onPress: () => open({ type: "computer" }),
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
      installed: installedCapabilityIds.has("openbot"),
      onPress: () => setConfigSheet("openbot"),
    },
  ];

  const selectType = (next: CapabilityType) => {
    setTab("marketplace");
    setCategory("all");
    setQuery("");
    setTypeFilter(next);
  };

  const shortcuts: Shortcut[] = [
    {
      id: "plugins",
      title: t("agent.pluginsHeading"),
      detail: t("agent.hubPluginsDetail"),
      icon: Sparkles,
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
    {
      id: "knowledge",
      title: t("agent.hubKnowledgeTitle"),
      detail: t("agent.hubKnowledgeDetail"),
      icon: FolderOpen,
      onPress: () => navigate("files"),
    },
  ];

  const tabItems = items.filter((item) => tab === "marketplace" || item.installed);
  const scopedItems = tabItems.filter((item) => item.type === typeFilter);
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
  const showMineEmptyState = tab === "mine" && category === "all" && !normalizedQuery;

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
        <View
          style={{
            minHeight: 40,
            flexDirection: "row",
            gap: 24,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
          }}
        >
          {(
            [
              ["marketplace", HUB_TAB_LABELS[typeFilter].marketplace],
              ["mine", HUB_TAB_LABELS[typeFilter].mine],
            ] as const
          ).map(([id, labelKey]) => {
            const active = tab === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setTab(id);
                  setCategory("all");
                }}
                style={{ justifyContent: "center", minHeight: 40 }}
              >
                <Text
                  style={{
                    color: active ? colors.primaryStrong : colors.muted,
                    fontSize: 14,
                    lineHeight: 20,
                    fontWeight: active ? "600" : "400",
                    fontFamily: fonts.sans,
                  }}
                >
                  {t(labelKey)}
                </Text>
                {active && (
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
        </View>

        <View style={{ paddingTop: 16, gap: 14 }}>
          {!useCategoryRail && searchField}

          <View style={{ flexDirection: useCategoryRail ? "row" : "column", gap: 20 }}>
            {useCategoryRail && (
              <View style={{ width: 200, gap: 10 }}>
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
                        <CapabilityCard
                          key={item.id}
                          item={item}
                          tab={tab}
                          installBusy={installBusyId === item.id}
                          onSetInstalled={(installed) =>
                            void setCapabilityInstalled(item, installed)
                          }
                        />
                      ))}
                      {FILLER_KEYS.slice(0, gridColumns - row.length).map((key) => (
                        <View key={key} style={{ flex: 1 }} />
                      ))}
                    </View>
                  ))}
                </View>
              ) : (
                <View
                  style={{
                    minHeight: 230,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: radius.card,
                    backgroundColor: colors.paper,
                  }}
                >
                  <Empty
                    icon={Search}
                    title={t(
                      showMineEmptyState
                        ? HUB_MY_EMPTY_TITLE_LABELS[typeFilter]
                        : HUB_EMPTY_TITLE_LABELS[typeFilter],
                    )}
                    detail={t(
                      showMineEmptyState ? "agent.hubMyEmptyDetail" : "agent.hubNoMatchDetail",
                    )}
                  >
                    {showMineEmptyState && (
                      <Button small primary onPress={() => setTab("marketplace")}>
                        {t("agent.hubBrowseMarketplace")}
                      </Button>
                    )}
                  </Empty>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {configSheet && (
        <Sheet
          title={configSheet === "model" ? t("screens.connectionsModelLabel") : "OpenBot"}
          subtitle={
            configSheet === "model"
              ? t("screens.connectionsModelSubtitle")
              : t("screens.connectionsOpenBotSubtitle")
          }
          onClose={() => {
            setConfigSheet(undefined);
            setConfigError("");
          }}
        >
          {configSheet === "model" ? (
            <View style={{ gap: 18 }}>
              {modelOptions.length ? (
                modelOptions.map((choice) => (
                  <View key={choice.provider} style={{ gap: 8 }}>
                    <Text style={s.small}>{choice.label}</Text>
                    <View style={[s.row, { gap: 7, flexWrap: "wrap" }]}>
                      {choice.models.map((model) => {
                        const current = model === workspace.runtime.model;
                        return (
                          <Pressable
                            key={model}
                            accessibilityRole="button"
                            accessibilityState={{
                              selected: current,
                              disabled: configBusy || current,
                            }}
                            disabled={configBusy || current}
                            onPress={() => void switchModel(model)}
                            style={[s.row, { gap: 4, opacity: configBusy ? 0.5 : 1 }]}
                          >
                            <Chip tint={current ? colors.sky : undefined}>{shortModel(model)}</Chip>
                            {current && <Check size={13} color={colors.primary} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={s.muted}>{t("screens.connectionsModelEmpty")}</Text>
              )}
              {!!configError && (
                <Text style={{ color: colors.danger, fontSize: 12, lineHeight: 18 }}>
                  {configError}
                </Text>
              )}
              <View style={[s.between, { gap: 15, paddingTop: 12 }]}>
                <Text style={s.muted}>{t("screens.connectionsModelCurrent")}</Text>
                <Text style={[s.text, { fontSize: 12 }]}>
                  {workspace.runtime.model ?? t("screens.connectionsNotConnected")}
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              <Text style={s.text}>{t("screens.connectionsOpenBotNotice")}</Text>
              <Text style={s.muted}>{t("screens.connectionsOpenBotDetail")}</Text>
            </View>
          )}
        </Sheet>
      )}

      {selectedSkill && (
        <SkillDetailSheet
          skill={selectedSkill}
          onClose={() => setSelectedSkillId(undefined)}
          onUse={() => startSelectedSkill(selectedSkill)}
        />
      )}
    </View>
  );
}

function shortModel(spec: string) {
  return spec.split("/").slice(1).join("/") || spec;
}
