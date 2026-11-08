import { type ComponentType, useEffect, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { agentLayout } from "./agent-layout";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import { Text } from "./app-text";
import { BotEditPage } from "./bot-pages/edit";
import { BotGoalsMemoryPage } from "./bot-pages/goals-memory";
import { BotHistoryPage } from "./bot-pages/history";
import { BotInstructionsPage } from "./bot-pages/instructions";
import { BotLibraryPage } from "./bot-pages/library";
import { BotSkillsPage } from "./bot-pages/skills";
import { type TranslationKey, useTranslation } from "./i18n";
import { Brain, Clock3, Cpu, FolderOpen, Heart, Settings2, Terminal } from "./icons";
import { ModelSelector } from "./model-selector";
import { breakpoints, colors, radius, shadow, space, typography } from "./theme";
import { HoverPressable, s } from "./ui";
import { useWorkspace } from "./workspace";

/** Agent 详情页的左栏分区，右栏渲染对应分区的设置内容。 */
export type AgentSettingsTab =
  | "profile"
  | "instructions"
  | "skills"
  | "resources"
  | "history"
  | "goals"
  | "model";

const TABS: ReadonlyArray<{
  id: AgentSettingsTab;
  icon: ComponentType<{ size?: number; color?: string }>;
  labelKey: TranslationKey;
}> = [
  { id: "profile", icon: Settings2, labelKey: "agentSpace.persona" },
  { id: "instructions", icon: Terminal, labelKey: "agentSpace.instructions" },
  { id: "skills", icon: Brain, labelKey: "agentSpace.skills" },
  { id: "resources", icon: FolderOpen, labelKey: "agentSpace.library" },
  { id: "history", icon: Clock3, labelKey: "agentSpace.analysisHistory" },
  { id: "goals", icon: Heart, labelKey: "agent.memory" },
  { id: "model", icon: Cpu, labelKey: "modelSettings.model" },
];

/**
 * 「详情」独立页面：左栏是功能分区，右栏是该分区对应的设置内容。
 *
 * 取代原先的 AgentManagerSheet 浮层，让每个设置项都有稳定的入口与可读的内容宽度。
 */
export function AgentSettingsScreen({
  tabIntent,
  onTabIntentConsumed,
}: {
  /** 外部跳转意图：进入详情页时定位到指定分区（例如从「解锁更多的能力」直达技能页）。 */
  tabIntent?: AgentSettingsTab | null;
  /** 分区意图被应用后通知调用方清除，避免下次进入详情页被再次定位。 */
  onTabIntentConsumed?: () => void;
}) {
  const { t } = useTranslation();
  const { current, updateAgent } = useAgentSpace();
  const { navigate, notify, workspace } = useWorkspace();
  const { width: windowWidth } = useWindowDimensions();
  const [tab, setTab] = useState<AgentSettingsTab>("profile");
  // 意图可能在页面挂载后才被设置（例如桌面端常驻侧栏），因此用 effect 监听
  // 而不是只在首次渲染读取一次 props。
  useEffect(() => {
    if (!tabIntent) return;
    setTab(tabIntent);
    onTabIntentConsumed?.();
  }, [tabIntent, onTabIntentConsumed]);
  // 三栏布局下内容列远窄于窗口，用实际列宽而不是窗口宽度决定左右分栏。
  const [width, setWidth] = useState(windowWidth);
  // 单列宽度下左栏收成横向分区条，避免挤压右侧内容。
  const stacked = width < breakpoints.mobile;
  // 横向内距只跟窗口走（与顶部返回栏同一判定），分栏方向才跟实际列宽走。
  const narrowViewport = windowWidth < breakpoints.mobile;
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];

  const notifySaved = () => notify(t("agentSpace.changesSaved"));
  // 「跟随默认模型」需要显式写出默认模型名，否则用户看不出实际会用到哪个版本。
  const defaultModelLabel = workspace.runtime.model
    ? (workspace.runtime.modelLabels?.[workspace.runtime.model] ??
      workspace.runtime.model.split("/").slice(1).join("/"))
    : t("modelSettings.notConfigured");

  const content = (() => {
    switch (tab) {
      case "instructions":
        return <BotInstructionsPage embedded onClose={notifySaved} />;
      case "skills":
        return <BotSkillsPage embedded onClose={() => undefined} />;
      case "resources":
        return <BotLibraryPage embedded onClose={() => undefined} />;
      case "history":
        return <BotHistoryPage embedded onClose={() => undefined} />;
      case "goals":
        return <BotGoalsMemoryPage embedded onClose={() => undefined} />;
      case "model":
        return (
          <View style={{ gap: space.sm }}>
            <Text style={[s.muted, { lineHeight: 21 }]}>{t("agentSpace.modelHint")}</Text>
            <ModelSelector
              value={current.model}
              onSelect={(model) => {
                updateAgent(current.id, { model });
                notifySaved();
              }}
              inheritLabel={t("agentSpace.modelFollowDefault", { model: defaultModelLabel })}
            />
          </View>
        );
      default:
        return <BotEditPage embedded onClose={notifySaved} onDeleted={() => navigate("chat")} />;
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
          // 与顶栏共用同一列宽与横向内距，返回按钮才与左栏卡片对齐。
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
              <AgentOrb avatar={current.avatar} size={38} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={[s.text, { fontSize: 13, fontWeight: "600" }]}>
                  {current.name}
                </Text>
                <Text numberOfLines={1} style={[s.small, { fontSize: 11, color: colors.faint }]}>
                  {current.system ? t("agentSpace.systemAgent") : current.role}
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
            {stacked && <Text style={s.small}>{current.name}</Text>}
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
