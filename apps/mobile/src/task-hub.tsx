import { useEffect, useState } from "react";
import { View } from "react-native";
import { AgentActivityScreen } from "./agent-ui";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { HubTabs } from "./hub-tabs";
import { useTranslation } from "./i18n";
import { colors, fonts } from "./theme";
import { TrackingScreen } from "./tracking-screen";
import { buildTrackingView } from "./tracking-view";
import { useWorkspace } from "./workspace";

type TaskHubTab = "tasks" | "tracking";

/**
 * 把「动态」和「目标与提醒」收拢成同一任务中心。
 * 原有执行、审批、目标与条件提醒能力不变，只减少一级导航入口。
 * 任务为全局视图：汇总所有 Agent 的全部任务。
 */
export function TaskHubScreen({ initialTab }: { initialTab?: TaskHubTab } = {}) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { section, reminderIntent, clearReminderIntent } = useWorkspace();
  const defaultTab = initialTab ?? (reminderIntent || section === "goals" ? "tracking" : "tasks");
  const [tab, setTab] = useState<TaskHubTab>(defaultTab);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  // 其它页面发起提醒意图时必须切回「追踪」，否则停在任务页会丢掉这次意图
  // （defaultTab 的值可能没变，上面那个 effect 不会触发）。
  useEffect(() => {
    if (reminderIntent) setTab("tracking");
  }, [reminderIntent]);

  const totalTasks = data?.tasks.length ?? 0;
  const tracking = data ? buildTrackingView(data) : undefined;

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
          {
            id: "tracking",
            label: t("app.taskHubReminders"),
            count: tracking?.counts.tracking ?? 0,
          },
        ]}
      />
      {tab === "tasks" ? (
        <AgentActivityScreen />
      ) : (
        <TrackingScreen
          embedded
          reminderIntent={reminderIntent}
          onReminderIntentHandled={clearReminderIntent}
        />
      )}
    </View>
  );
}
