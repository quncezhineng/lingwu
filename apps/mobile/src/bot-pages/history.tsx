import { View } from "react-native";
import { TaskCard } from "../agent-ui";
import { useTranslation } from "../i18n";
import { BotEmpty, BotPage, type BotPageProps, useBotResources } from "./shared";

/** Task cards keep their existing detail, process and task-control entry points. */
export function BotHistoryPage({ onClose, embedded }: BotPageProps) {
  const { t } = useTranslation();
  const { tasks } = useBotResources();
  return (
    <BotPage title={t("agentSpace.analysisHistory")} onClose={onClose} embedded={embedded}>
      <View style={{ gap: 12 }}>
        {tasks.length ? (
          tasks.map((task) => <TaskCard key={task.id} task={task} compact />)
        ) : (
          <BotEmpty>{t("agentSpace.noTasks")}</BotEmpty>
        )}
      </View>
    </BotPage>
  );
}
