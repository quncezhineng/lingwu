import { View } from "react-native";
import { TaskCard } from "../agent-ui";
import { useTranslation } from "../i18n";
import { BotEmpty, BotPage, type BotPageProps, TwoColumnGrid, useBotResources } from "./shared";

/**
 * 「任务」页：展示当前 Agent 的近期分析任务。
 *
 * 目标内容统一由任务中心的「目标」标签维护，Agent 详情不再重复承载，
 * 因此这里不再有二级标签栏与目标的新建 / 详情分支。
 * 任务卡片以双列网格排布（窄屏退回单列）。
 */
export function BotHistoryPage({ onClose, embedded }: BotPageProps) {
  const { t } = useTranslation();
  const { tasks } = useBotResources();
  return (
    <BotPage title={t("agentSpace.analysisHistory")} onClose={onClose} embedded={embedded}>
      {tasks.length ? (
        <TwoColumnGrid>
          {(columns, itemWidth) =>
            tasks.map((task) => (
              <View key={task.id} style={columns === 2 ? { width: itemWidth } : undefined}>
                <TaskCard task={task} compact />
              </View>
            ))
          }
        </TwoColumnGrid>
      ) : (
        <BotEmpty>{t("agentSpace.noTasks")}</BotEmpty>
      )}
    </BotPage>
  );
}
