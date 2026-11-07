import { useAgentSpace } from "../agent-space";
import { useTranslation } from "../i18n";
import { PreferencesScreen } from "../preferences-screen";
import { BotPage, type BotPageProps } from "./shared";

/**
 * 「记忆」页：展示当前 Agent 的专属记忆（按 agentId 隔离）。
 *
 * 目标内容统一由任务中心的「目标」标签维护，Agent 详情不重复承载；
 * 此页仅保留当前 Agent 的记忆（PreferencesScreen，传入 agentId）。
 */
export function BotGoalsMemoryPage({ onClose, embedded }: BotPageProps) {
  const { t } = useTranslation();
  const { current } = useAgentSpace();
  return (
    <BotPage
      title={t("agent.memory")}
      subtitle={t("agent.memoryDetail")}
      onClose={onClose}
      embedded={embedded}
    >
      <PreferencesScreen embedded agentId={current.id} />
    </BotPage>
  );
}
