import { useEffect, useState } from "react";
import { View } from "react-native";
import { goalsEnabled } from "../../../packages/domain/src/features";
import { AgentActivityScreen } from "./agent-ui";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { HubTabs } from "./hub-tabs";
import { useTranslation } from "./i18n";
import { consumeMonitorTab, loadMonitor, useMonitorState } from "./monitor";
import { MonitorScreen } from "./monitor-screen";
import { listedWorkTasks } from "./task-presentation";
import { colors, fonts } from "./theme";
import { TrackingScreen } from "./tracking-screen";
import { buildTrackingView } from "./tracking-view";
import { useWorkspace } from "./workspace";

type TaskHubTab = "tasks" | "tracking" | "monitor";

/**
 * 把「动态」和「目标与提醒」收拢成同一任务中心。
 * 原有执行、审批、目标与条件提醒能力不变，只减少一级导航入口。
 * 任务为全局视图：汇总所有 Agent 的全部任务。
 */
export function TaskHubScreen({ initialTab }: { initialTab?: TaskHubTab } = {}) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { api, section, reminderIntent, clearReminderIntent } = useWorkspace();
  const monitorState = useMonitorState();
  const defaultTab = initialTab ?? (reminderIntent || section === "goals" ? "tracking" : "tasks");
  const [tab, setTab] = useState<TaskHubTab>(defaultTab);

  useEffect(() => {
    void loadMonitor(api);
  }, [api]);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  // 其它页面发起提醒意图时必须切回「追踪」，否则停在任务页会丢掉这次意图
  // （defaultTab 的值可能没变，上面那个 effect 不会触发）。
  useEffect(() => {
    if (reminderIntent) setTab("tracking");
  }, [reminderIntent]);

  // Today 的「今天替你盯到的」卡片通过一次性信号把用户送到盯盘页。
  useEffect(() => {
    if (monitorState.tabRequested && consumeMonitorTab()) setTab("monitor");
  }, [monitorState.tabRequested]);

  const totalTasks = listedWorkTasks(data?.tasks ?? []).length;
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
            count: goalsEnabled
              ? (tracking?.counts.tracking ?? 0)
              : (tracking?.reminders.length ?? 0),
          },
          {
            id: "monitor",
            label: t("app.taskHubMonitor"),
            count:
              (monitorState.today?.mustKnow.length ?? 0) + (monitorState.today?.later.length ?? 0),
          },
        ]}
      />
      {tab === "tasks" ? (
        <AgentActivityScreen />
      ) : tab === "tracking" ? (
        <TrackingScreen
          embedded
          reminderIntent={reminderIntent}
          onReminderIntentHandled={clearReminderIntent}
        />
      ) : (
        <MonitorScreen />
      )}
    </View>
  );
}
