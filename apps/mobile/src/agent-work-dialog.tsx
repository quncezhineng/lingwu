import { useEffect, useMemo } from "react";
import { Pressable, View } from "react-native";
import { useAgentSpace } from "./agent-space";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { groupRailWork, type RailWorkItem, railWorkItems } from "./automation-task-rail";
import { selectBotResources } from "./bot-resources";
import { activeLocaleTag, useTranslation } from "./i18n";
import { Bell, ListChecks } from "./icons";
import { colors, fonts, radius } from "./theme";
import { useWorkspace } from "./workspace";

const PREVIEW_LIMIT = 4;

function useRailWork() {
  const { current } = useAgentSpace();
  const { data, refresh: refreshAgent } = useAgentWorkspace();
  const { refresh } = useWorkspace();
  const scoped = useMemo(() => selectBotResources(current, data), [current, data]);
  const items = useMemo(
    () => railWorkItems(scoped.tasks, scoped.monitors),
    [scoped.monitors, scoped.tasks],
  );
  useEffect(() => {
    void refresh().catch(() => {});
    void refreshAgent().catch(() => {});
  }, [refresh, refreshAgent]);
  return items;
}

/** 侧栏只展示最近四条。完整列表走任务中心弹层。 */
export function AgentWorkList() {
  return <WorkGroups items={useRailWork()} limit={PREVIEW_LIMIT} />;
}

function WorkGroups({ items, limit }: { items: RailWorkItem[]; limit?: number }) {
  const { t } = useTranslation();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const groups = groupRailWork(items, { limit, locale: activeLocaleTag(), timeZone });
  if (groups.length === 0) {
    return (
      <Text
        style={{
          paddingHorizontal: 4,
          paddingVertical: 18,
          fontSize: 13,
          lineHeight: 20,
          color: colors.muted,
        }}
      >
        {t("agentSpace.noTasks")}
      </Text>
    );
  }
  return (
    <View style={{ gap: 4 }}>
      {groups.map((group) => (
        <View key={group.day || group.label} style={{ gap: 2 }}>
          <Text
            style={{
              paddingHorizontal: 6,
              paddingTop: 8,
              paddingBottom: 2,
              fontSize: 12,
              lineHeight: 18,
              color: colors.muted,
            }}
          >
            {group.label === "today"
              ? t("agentSpace.workDateToday")
              : group.label === "yesterday"
                ? t("agentSpace.workDateYesterday")
                : group.label}
          </Text>
          {group.items.map((item) => (
            <WorkRow key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </View>
      ))}
    </View>
  );
}

function WorkRow({ item }: { item: RailWorkItem }) {
  const { t } = useTranslation();
  const { open } = useWorkspace();
  const automation = item.kind === "automation";
  const Icon = automation ? Bell : ListChecks;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(automation ? "agent.openTrackingLabel" : "agent.openTaskLabel", {
        title: item.title,
      })}
      onPress={() => {
        const taskId = automation ? item.taskId : item.id;
        if (taskId) open({ type: "task", taskId });
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: 32,
        paddingHorizontal: 6,
        borderRadius: radius.control,
        backgroundColor: pressed ? colors.overlay1 : "transparent",
      })}
    >
      <Icon size={16} color={colors.primary} />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: fonts.sans,
          fontSize: 13,
          lineHeight: 20,
          color: colors.text,
        }}
      >
        {item.title}
      </Text>
    </Pressable>
  );
}
