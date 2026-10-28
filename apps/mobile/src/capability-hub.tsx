import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import {
  ArrowUpRight,
  Brain,
  CalendarDays,
  ChevronRight,
  Cpu,
  FileText,
  FolderOpen,
  Globe2,
  type IconComponent,
  Link2,
  ListChecks,
  Mail,
  Search,
  Sparkles,
  Target,
  X,
} from "./icons";
import { ConnectionsScreen } from "./screens";
import { breakpoints } from "./theme";
import { appBrands, colors, Empty, fonts, Sheet, s, serviceBrands, statusColors } from "./ui";
import { useWorkspace } from "./workspace";

type HubTab = "marketplace" | "mine";
type CapabilityType = "plugins" | "skills" | "connectors" | "workspace";
type CategoryId =
  | "all"
  | "research"
  | "analysis"
  | "writing"
  | "monitoring"
  | "connections"
  | "workspace";
type CatalogTag = Exclude<CategoryId, "all">;
type CapabilityState = "ready" | "connected" | "available" | "open";

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
  onPress: () => void;
};

type Shortcut = {
  id: CapabilityType | "knowledge";
  title: string;
  detail: string;
  icon: IconComponent;
  onPress: () => void;
};

const CATEGORY_OPTIONS: { id: CategoryId; labelKey: TranslationKey }[] = [
  { id: "all", labelKey: "agent.hubCategoryAll" },
  { id: "research", labelKey: "agent.hubCategoryResearch" },
  { id: "analysis", labelKey: "agent.hubCategoryAnalysis" },
  { id: "writing", labelKey: "agent.hubCategoryWriting" },
  { id: "monitoring", labelKey: "agent.hubCategoryMonitoring" },
  { id: "connections", labelKey: "agent.hubCategoryConnections" },
  { id: "workspace", labelKey: "agent.hubCategoryWorkspace" },
];

const FILLER_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

const TYPE_LABELS: Record<CapabilityType, TranslationKey> = {
  plugins: "agent.pluginsHeading",
  skills: "agent.skillsHeading",
  connectors: "agent.connectorsHeading",
  workspace: "agent.hubCategoryWorkspace",
};

const STATE_KEYS: Record<CapabilityState, TranslationKey> = {
  ready: "agent.hubStateReady",
  connected: "agent.hubStateConnected",
  available: "agent.hubStateAvailable",
  open: "agent.hubStateOpen",
};

const STATE_COLORS: Record<CapabilityState, string> = {
  ready: colors.primary,
  connected: colors.success,
  available: colors.muted,
  open: colors.text,
};

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
          minHeight: 82,
          paddingHorizontal: 12,
          paddingVertical: 12,
          gap: 7,
          borderRadius: 7,
          borderWidth: 1,
          borderColor: active ? colors.accentLine : colors.line,
          backgroundColor: active ? colors.sky : pressed ? colors.surface : colors.canvas,
          flex: compact ? undefined : 1,
          width: compact ? 176 : undefined,
        },
        active && {
          shadowColor: colors.primary,
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 2 },
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 25,
            height: 25,
            borderRadius: 5,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: active ? colors.paper : colors.surface,
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
          fontSize: 10,
          lineHeight: 15,
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title} · ${item.detail}`}
      onPress={item.onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: 158,
        paddingTop: 16,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: pressed ? colors.lineStrong : colors.line,
        backgroundColor: pressed ? colors.surface : colors.paper,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 4,
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
      <View
        style={[
          s.between,
          {
            marginTop: 12,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: colors.line,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={{
            maxWidth: "60%",
            color: colors.faint,
            fontSize: 11,
            lineHeight: 16,
            fontFamily: fonts.sans,
          }}
        >
          {item.source}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: STATE_COLORS[item.state],
            fontSize: 11,
            lineHeight: 16,
            fontFamily: fonts.sans,
          }}
        >
          {t(STATE_KEYS[item.state])}
        </Text>
      </View>
    </Pressable>
  );
}

function CategoryRail({
  category,
  counts,
  onChange,
  horizontal,
}: {
  category: CategoryId;
  counts: Record<CategoryId, number>;
  onChange: (next: CategoryId) => void;
  horizontal?: boolean;
}) {
  const { t } = useTranslation();

  if (horizontal) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 1 }}
      >
        {CATEGORY_OPTIONS.map((option) => {
          const active = category === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(option.id)}
              style={({ pressed }) => ({
                minHeight: 34,
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                paddingHorizontal: 11,
                borderRadius: 7,
                borderWidth: 1,
                borderColor: active ? colors.lineStrong : colors.line,
                backgroundColor: active ? colors.tertiary : pressed ? colors.surface : colors.paper,
              })}
            >
              <Text
                style={{
                  color: colors.text,
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
                  color: active ? colors.muted : colors.faint,
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
      {CATEGORY_OPTIONS.map((option) => {
        const active = category === option.id;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.id)}
            style={({ pressed }) => ({
              minHeight: 28,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 4,
              backgroundColor: active
                ? statusColors.surface
                : pressed
                  ? colors.surface
                  : "transparent",
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                color: active ? colors.text : colors.muted,
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
                color: active ? colors.muted : colors.faint,
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
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { navigate, ask, workspace } = useWorkspace();
  const [tab, setTab] = useState<HubTab>("marketplace");
  const [category, setCategory] = useState<CategoryId>("all");
  const [typeFilter, setTypeFilter] = useState<CapabilityType>();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);

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
  const modelConnected = workspace.runtime.configured || Boolean(workspace.runtime.model);
  const openConnections = () => setConnectionsOpen(true);
  const builtInSource = t("agent.hubSourceLingwu");
  const workspaceSource = t("agent.hubSourceWorkspace");

  const items: CatalogItem[] = [
    {
      id: "deep-research",
      type: "plugins",
      tags: ["research", "analysis"],
      title: t("agent.pluginDeepResearch"),
      detail: t("agent.pluginDeepResearchDetail"),
      icon: Sparkles,
      iconColor: colors.primary,
      iconSurface: colors.sky,
      source: builtInSource,
      state: "ready",
      installed: true,
      onPress: () => ask(t("agent.pluginDeepResearchPrompt")),
    },
    {
      id: "daily-review",
      type: "plugins",
      tags: ["research", "monitoring"],
      title: t("agent.pluginDailyReview"),
      detail: t("agent.pluginDailyReviewDetail"),
      icon: ListChecks,
      iconColor: appBrands.dailyReview.fg,
      iconSurface: appBrands.dailyReview.surface,
      source: builtInSource,
      state: "ready",
      installed: true,
      onPress: () => navigate("today"),
    },
    {
      id: "portfolio-review",
      type: "plugins",
      tags: ["analysis", "monitoring"],
      title: t("agent.pluginPortfolioReview"),
      detail: t("agent.pluginPortfolioReviewDetail"),
      icon: Target,
      iconColor: appBrands.portfolioReview.fg,
      iconSurface: appBrands.portfolioReview.surface,
      source: builtInSource,
      state: "ready",
      installed: true,
      onPress: () => navigate("portfolio"),
    },
    {
      id: "earnings",
      type: "skills",
      tags: ["analysis", "research"],
      title: t("agent.skillEarnings"),
      detail: t("agent.skillEarningsDetail"),
      icon: FileText,
      iconColor: appBrands.earnings.fg,
      iconSurface: appBrands.earnings.surface,
      source: builtInSource,
      state: "ready",
      installed: true,
      onPress: () => ask(t("agent.skillEarningsPrompt")),
    },
    {
      id: "report",
      type: "skills",
      tags: ["writing", "research"],
      title: t("agent.skillReport"),
      detail: t("agent.skillReportDetail"),
      icon: Brain,
      iconColor: appBrands.report.fg,
      iconSurface: appBrands.report.surface,
      source: builtInSource,
      state: "ready",
      installed: true,
      onPress: () => ask(t("agent.skillReportPrompt")),
    },
    {
      id: "notes",
      type: "skills",
      tags: ["writing", "workspace"],
      title: t("agent.skillNotes"),
      detail: t("agent.skillNotesDetail"),
      icon: FileText,
      iconColor: appBrands.notes.fg,
      iconSurface: appBrands.notes.surface,
      source: builtInSource,
      state: "ready",
      installed: true,
      onPress: () => navigate("notes"),
    },
    {
      id: "monitoring",
      type: "skills",
      tags: ["monitoring"],
      title: t("agent.skillMonitoring"),
      detail: t("agent.skillMonitoringDetail"),
      icon: Target,
      iconColor: appBrands.monitoring.fg,
      iconSurface: appBrands.monitoring.surface,
      source: builtInSource,
      state: "ready",
      installed: true,
      onPress: () => navigate("goals"),
    },
    {
      id: "model",
      type: "connectors",
      tags: ["connections"],
      title: t("screens.connectionsModelLabel"),
      detail: t("agent.hubModelDetail"),
      icon: Cpu,
      iconColor: colors.primary,
      iconSurface: colors.sky,
      source: builtInSource,
      state: modelConnected ? "connected" : "available",
      installed: modelConnected,
      onPress: openConnections,
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
      source: "Google",
      state: googleConnected ? "connected" : "available",
      installed: googleConnected,
      onPress: openConnections,
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
      source: "Google",
      state: googleConnected ? "connected" : "available",
      installed: googleConnected,
      onPress: openConnections,
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
      installed: browserConnected,
      onPress: openConnections,
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
      source: "OpenBot",
      state: workspace.runtime.openbotConfigured ? "connected" : "available",
      installed: workspace.runtime.openbotConfigured,
      onPress: openConnections,
    },
    {
      id: "mail",
      type: "workspace",
      tags: ["workspace", "connections"],
      title: t("app.titleMail"),
      detail: t("agent.shortcutMailDetail"),
      icon: Mail,
      iconColor: serviceBrands.gmail.fg,
      iconSurface: serviceBrands.gmail.surface,
      source: workspaceSource,
      state: "open",
      installed: true,
      onPress: () => navigate("mail"),
    },
    {
      id: "calendar-workspace",
      type: "workspace",
      tags: ["workspace", "connections"],
      title: t("app.titleCalendar"),
      detail: t("agent.shortcutCalendarDetail"),
      icon: CalendarDays,
      iconColor: serviceBrands.googleCalendar.fg,
      iconSurface: serviceBrands.googleCalendar.surface,
      source: workspaceSource,
      state: "open",
      installed: true,
      onPress: () => navigate("calendar"),
    },
  ];

  const selectType = (next: CapabilityType) => {
    setTab("marketplace");
    setCategory("all");
    setQuery("");
    setTypeFilter((current) => (current === next ? undefined : next));
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
  const scopedItems = typeFilter ? tabItems.filter((item) => item.type === typeFilter) : tabItems;
  const cardsForCategory = (item: CatalogItem, nextCategory: CategoryId) =>
    nextCategory === "all" || item.tags.includes(nextCategory as CatalogTag);
  const counts = CATEGORY_OPTIONS.reduce(
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
      t(TYPE_LABELS[item.type]),
      ...item.tags.map((tag) => {
        const option = CATEGORY_OPTIONS.find((candidate) => candidate.id === tag);
        return option ? t(option.labelKey) : "";
      }),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const visibleRows = chunk(visibleItems, gridColumns);
  const activeCategoryLabel =
    CATEGORY_OPTIONS.find((option) => option.id === category)?.labelKey ?? "agent.hubAllCategories";

  const searchField = (
    <View
      style={{
        minHeight: 34,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingHorizontal: 9,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: searchFocused ? colors.lineStrong : colors.line,
        backgroundColor: colors.paper,
      }}
    >
      <Search size={14} strokeWidth={1.7} color={colors.faint} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        placeholder={t("agent.hubSearchCapabilities")}
        placeholderTextColor={colors.faint}
        accessibilityLabel={t("agent.hubSearchCapabilities")}
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
              active={typeFilter !== undefined && shortcut.id === typeFilter}
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
                  active={typeFilter !== undefined && shortcut.id === typeFilter}
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
              ["marketplace", "agent.hubMarketplace"],
              ["mine", "agent.hubMine"],
            ] as const
          ).map(([id, labelKey]) => {
            const active = tab === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setTab(id)}
                style={{ justifyContent: "center", minHeight: 40 }}
              >
                <Text
                  style={{
                    color: active ? colors.text : colors.muted,
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
                      backgroundColor: colors.text,
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
                <CategoryRail category={category} counts={counts} onChange={setCategory} />
              </View>
            )}
            {!useCategoryRail && (
              <CategoryRail category={category} counts={counts} onChange={setCategory} horizontal />
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
                  {t("agent.hubCapabilityCount", { count: visibleItems.length })}
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
                <View
                  style={{
                    minHeight: 230,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: 5,
                    backgroundColor: colors.paper,
                  }}
                >
                  <Empty
                    icon={Search}
                    title={t("agent.hubNoMatchTitle")}
                    detail={t("agent.hubNoMatchDetail")}
                  />
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {connectionsOpen && (
        <Sheet
          title={t("agent.connectorsHeading")}
          subtitle={t("agent.hubConnectorsSheetSubtitle")}
          onClose={() => setConnectionsOpen(false)}
          wide
        >
          <ConnectionsScreen />
        </Sheet>
      )}
    </View>
  );
}
