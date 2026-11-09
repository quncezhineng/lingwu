import { useState } from "react";
import { Pressable, View } from "react-native";
import Markdown from "react-native-markdown-renderer";
import { useAgentSpace } from "./agent-space";
import type { AgentSkill } from "./agent-space-model";
import { Text, TextInput } from "./app-text";
import { assistantMarkdown } from "./assistant-markdown";
import { useTranslation } from "./i18n";
import { instructionsMarkdownStyle } from "./instructions-markdown";
import { Button, colors, Field, s } from "./ui";

/**
 * 工作提示词字段：默认编辑 Markdown 源码，可切到预览查看渲染结果。
 *
 * 复用 `s.input` 的描边与内边距，让预览框与输入框尺寸一致，切换时不跳版。
 */
function InstructionsField({
  label,
  value,
  onChangeText,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  maxLength: number;
}) {
  const { t } = useTranslation();
  const [previewing, setPreviewing] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.field}>
      <View style={s.between}>
        <Text style={s.fieldLabel}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected: previewing }}
          hitSlop={8}
          onPress={() => setPreviewing((on) => !on)}
          style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
        >
          <Text style={[s.small, { color: colors.link }]}>
            {t(
              previewing
                ? "agentSpace.skillInstructionsEdit"
                : "agentSpace.skillInstructionsPreview",
            )}
          </Text>
        </Pressable>
      </View>
      {previewing ? (
        <View style={[s.input, { minHeight: 120 }]}>
          {value.trim() ? (
            <Markdown markdownit={assistantMarkdown} style={instructionsMarkdownStyle}>
              {value}
            </Markdown>
          ) : (
            <Text style={s.small}>{t("agentSpace.skillInstructionsPreviewEmpty")}</Text>
          )}
        </View>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          maxLength={maxLength}
          multiline
          placeholderTextColor={colors.faint}
          accessibilityLabel={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            s.input,
            focused && { borderColor: colors.primary },
            { minHeight: 120, textAlignVertical: "top" },
          ]}
        />
      )}
    </View>
  );
}

/**
 * 自建技能的创建 / 编辑表单。
 *
 * `library` 模式写进账户级技能库（「应用与能力 → 我的技能」的创建与编辑）：
 * 技能只入库，不会自动挂到任何 Agent，需要用户在详情里「添加到智能体」。
 * 默认模式写进当前选中 Agent 的 customSkills，用于 Agent 详情技能页编辑已有副本。
 * `onSaved` 仅在保存成功后触发，关闭动作仍由 `onClose` 负责。
 */
export function SkillEditor({
  skill,
  onClose,
  onSaved,
  library = false,
}: {
  skill?: AgentSkill;
  onClose: () => void;
  /** 保存成功后的回调。 */
  onSaved?: () => void;
  /** 写入账户级技能库（创建技能）；不传则写入当前 Agent 的技能副本。 */
  library?: boolean;
}) {
  const { t } = useTranslation();
  const { current, saveSkill, saveLibrarySkill } = useAgentSpace();
  const [name, setName] = useState(() => skill?.name ?? t("agentSpace.skillSampleName"));
  const [purpose, setPurpose] = useState(
    () => skill?.purpose ?? t("agentSpace.skillSamplePurpose"),
  );
  const [instructions, setInstructions] = useState(
    () => skill?.instructions ?? t("agentSpace.skillSampleInstructions"),
  );
  const [outputFormat, setOutputFormat] = useState(
    () => skill?.outputFormat ?? t("agentSpace.skillSampleOutput"),
  );
  return (
    <View style={{ gap: 2 }}>
      <Field label={t("agentSpace.skillName")} value={name} onChangeText={setName} maxLength={40} />
      <Field
        label={t("agentSpace.skillPurpose")}
        value={purpose}
        onChangeText={setPurpose}
        maxLength={120}
      />
      <InstructionsField
        label={t("agentSpace.skillInstructions")}
        value={instructions}
        onChangeText={setInstructions}
        maxLength={4000}
      />
      <Field
        label={t("agentSpace.skillOutput")}
        value={outputFormat}
        onChangeText={setOutputFormat}
        maxLength={800}
        multiline
      />
      <Button
        primary
        disabled={!name.trim() || !instructions.trim()}
        onPress={() => {
          const input = { name, purpose, instructions, outputFormat };
          if (library) saveLibrarySkill(input, skill?.id);
          else saveSkill(current.id, input, skill?.id);
          onSaved?.();
          onClose();
        }}
      >
        {t("agentSpace.saveSkill")}
      </Button>
    </View>
  );
}
