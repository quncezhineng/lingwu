import { useState } from "react";
import { useAgentSpace } from "../agent-space";
import { useTranslation } from "../i18n";
import { InstructionsEditor } from "../instructions-editor";
import { BotPage, type BotPageProps } from "./shared";

/**
 * 「指令」页：编辑这个 Agent 的系统提示词。
 *
 * 与「人设」不同，这里写的是每次对话都会注入的行为约束（流程、口径、输出要求），
 * 保存后立即用于后续对话。编辑 / Markdown 预览的交互由 `InstructionsEditor` 统一提供。
 */
export function BotInstructionsPage({ onClose, embedded }: BotPageProps) {
  const { t } = useTranslation();
  const { current, updateAgent } = useAgentSpace();
  const [instructions, setInstructions] = useState(current.instructions);

  return (
    <BotPage
      title={t("agentSpace.instructions")}
      subtitle={current.name}
      onClose={onClose}
      embedded={embedded}
    >
      <InstructionsEditor
        value={instructions}
        onChange={setInstructions}
        accessibilityLabel={t("agentSpace.instructions")}
        onSave={() => {
          updateAgent(current.id, { instructions: instructions.trim() });
          onClose();
        }}
      />
    </BotPage>
  );
}
