import { useEffect, useState } from "react";
import { View } from "react-native";
import { AgentActivityScreen, GoalsScreen } from "./agent-ui";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { HubTabs } from "./hub-tabs";
import { useTranslation } from "./i18n";
import { colors, fonts } from "./theme";
import { useWorkspace } from "./workspace";

type TaskHubTab = "tasks" | "reminders";

/**
 * 把「动态」和「目标与提醒」收拢成同一任务中心。
 * 原有执行、审批、目标与条件提醒能力不变，只减少一级导航入口。
 */
export function TaskHubScreen({ initialTab }: { initialTab?: TaskHubTab } = {}) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { section, reminderIntent, clearReminderIntent } = useWorkspace();
  const defaultTab = initialTab ?? (reminderIntent || section === "goals" ? "reminders" : "tasks");
  const [tab, setTab] = useState<TaskHubTab>(defaultTab);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const totalTasks = data?.tasks.length ?? 0;
  const activeReminders = (data?.monitors ?? []).filter(
    (monitor) => monitor.status !== "stopped",
  ).length;

  return (
    <View style={{ gap: 16 }}>
      <Text
        numberOfLines={1}
        style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 20, color: colors.faint }}
      >
        {t("agent.taskCenterDescription")}
      </Text>
      <HubTabs
        active={tab}
        onChange={setTab}
        items={[
          { id: "tasks", label: t("app.taskHubTasks"), count: totalTasks },
          { id: "reminders", label: t("app.taskHubReminders"), count: activeReminders },
        ]}
      />
      {tab === "tasks" ? (
        <AgentActivityScreen />
      ) : (
        <GoalsScreen
          embedded
          reminderIntent={reminderIntent}
          onReminderIntentHandled={clearReminderIntent}
        />
      )}
    </View>
  );
}
