import { useEffect, useState } from "react";
import { View } from "react-native";
import type { AgentTask } from "../../../packages/domain/src/agent";
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
export function TaskHubScreen({
  initialTab,
  tasks,
}: {
  initialTab?: TaskHubTab;
  /** 传入时仅展示这些任务（用于「当前 Agent」作用域，如 Agent 管理页的任务弹窗）。 */
  tasks?: readonly AgentTask[];
} = {}) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { section, reminderIntent, clearReminderIntent } = useWorkspace();
  const defaultTab = initialTab ?? (reminderIntent || section === "goals" ? "reminders" : "tasks");
  const [tab, setTab] = useState<TaskHubTab>(defaultTab);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  // 传入 tasks 时以代理作用域为准；否则回落到全工作区任务。
  const totalTasks = tasks?.length ?? data?.tasks.length ?? 0;
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
        <AgentActivityScreen scopedTasks={tasks} />
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
