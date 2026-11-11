import { TaskCard } from "../agent-ui";
import { CardGrid } from "../card-grid";
import { useTranslation } from "../i18n";
import { BotEmpty, BotPage, type BotPageProps, useBotResources } from "./shared";

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
        <CardGrid
          items={tasks}
          // 详情页正文列比任务中心窄（左栏 180 + 卡片内距之后约 690），
          // 用 340 的下限会一路退化成单列，放宽到 280 才能稳定排成双列。
          minColumnWidth={280}
          getKey={(task) => task.id}
          render={(task, _index, { columns }) => (
            // 双列时换成纵向版式，否则图标 + 标题 + 时间会挤在同一行里。
            <TaskCard task={task} compact stacked={columns > 1} />
          )}
        />
      ) : (
        <BotEmpty>{t("agentSpace.noTasks")}</BotEmpty>
      )}
    </BotPage>
  );
}
