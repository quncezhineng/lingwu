import { useEffect, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { AgentActivityScreen, GoalsScreen } from "./agent-ui";
import { useAgentWorkspace } from "./agent-workspace";
import { HubTabs } from "./hub-tabs";
import { useTranslation } from "./i18n";
import { PageHeader } from "./page-header";
import { breakpoints } from "./theme";
import { useWorkspace } from "./workspace";

type TaskHubTab = "tasks" | "reminders";

/**
 * 把「动态」和「目标与提醒」收拢成同一任务中心。
 * 原有执行、审批、目标与条件提醒能力不变，只减少一级导航入口。
 */
export function TaskHubScreen() {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { section } = useWorkspace();
  const { width } = useWindowDimensions();
  const initialTab: TaskHubTab = section === "goals" ? "reminders" : "tasks";
  const [tab, setTab] = useState<TaskHubTab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const activeTasks = (data?.tasks ?? []).filter(
    (task) => !["succeeded", "failed", "cancelled"].includes(task.status),
  ).length;
  const activeReminders = (data?.monitors ?? []).filter(
    (monitor) => monitor.status !== "stopped",
  ).length;

  return (
    <View style={{ gap: 20 }}>
      <PageHeader
        eyebrow={t("app.taskHubEyebrow")}
        title={t(tab === "tasks" ? "app.titleActivity" : "app.titleGoals")}
        description={t(tab === "tasks" ? "app.subtitleActivity" : "app.subtitleGoals")}
        compact={width < breakpoints.desktop}
        style={{ marginBottom: 0 }}
      />
      <HubTabs
        active={tab}
        onChange={setTab}
        items={[
          { id: "tasks", label: t("app.taskHubTasks"), count: activeTasks },
          { id: "reminders", label: t("app.taskHubReminders"), count: activeReminders },
        ]}
      />
      {tab === "tasks" ? <AgentActivityScreen /> : <GoalsScreen embedded />}
    </View>
  );
}
