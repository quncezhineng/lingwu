import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useAgentSpace } from "../agent-space";
import { Text, TextInput } from "../app-text";
import { AssistantResponse } from "../assistant-response";
import { useTranslation } from "../i18n";
import { Button, colors, radius, s, space } from "../ui";
import { BotPage, type BotPageProps } from "./shared";

type InstructionMode = "edit" | "preview";

/**
 * 「指令」页：编辑这个 Agent 的系统提示词。
 *
 * 与「人设」不同，这里写的是每次对话都会注入的行为约束（流程、口径、输出要求），
 * 保存后立即用于后续对话。
 */
export function BotInstructionsPage({ onClose, embedded }: BotPageProps) {
  const { t } = useTranslation();
  const { current, updateAgent } = useAgentSpace();
  const [instructions, setInstructions] = useState(current.instructions);
  // 打开时先看当前提示词的效果；需要改动再切到「编辑」。
  const [mode, setMode] = useState<InstructionMode>("preview");
  const [focused, setFocused] = useState(false);
  const modes: { id: InstructionMode; label: string }[] = [
    { id: "preview", label: t("agentSpace.instructionsPreview") },
    { id: "edit", label: t("agentSpace.instructionsEdit") },
  ];

  return (
    <BotPage
      title={t("agentSpace.instructions")}
      subtitle={current.name}
      onClose={onClose}
      embedded={embedded}
    >
      <View style={{ gap: 2 }}>
        <View style={styles.toolbar}>
          <View accessibilityRole="tablist" style={styles.switcher}>
            {modes.map((item) => {
              const active = mode === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  hitSlop={4}
                  onPress={() => setMode(item.id)}
                  style={({ pressed }) => [
                    styles.modeButton,
                    active && styles.modeButtonActive,
                    pressed && !active && { backgroundColor: colors.overlay1 },
                  ]}
                >
                  <Text
                    style={[
                      styles.modeLabel,
                      active && { color: colors.primaryStrong, fontWeight: "600" },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[s.small, { color: colors.faint }]}>
            {t("preferences.characterCount", { count: instructions.length })}
          </Text>
        </View>
        {mode === "edit" ? (
          <TextInput
            accessibilityLabel={t("agentSpace.instructions")}
            value={instructions}
            onChangeText={setInstructions}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t("agentSpace.instructionsPlaceholder")}
            placeholderTextColor={colors.faint}
            maxLength={4000}
            multiline
            textAlignVertical="top"
            style={[
              s.input,
              styles.editor,
              focused && {
                borderColor: colors.primary,
                backgroundColor: colors.sky,
              },
            ]}
          />
        ) : (
          <View style={styles.preview}>
            {instructions.trim() ? (
              <AssistantResponse content={instructions} />
            ) : (
              <Text style={[s.small, styles.previewEmpty]}>
                {t("agentSpace.instructionsPreviewEmpty")}
              </Text>
            )}
          </View>
        )}
        <Button
          primary
          style={{ marginTop: space.md }}
          onPress={() => {
            updateAgent(current.id, { instructions: instructions.trim() });
            onClose();
          }}
        >
          {t("agentSpace.saveInstructions")}
        </Button>
      </View>
    </BotPage>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  switcher: {
    flexDirection: "row",
    padding: 3,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
  },
  modeButton: {
    minWidth: 60,
    minHeight: 32,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.field,
  },
  modeButtonActive: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modeLabel: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  editor: {
    minHeight: 300,
    fontSize: 15,
    lineHeight: 23,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  preview: {
    minHeight: 300,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.field,
    backgroundColor: colors.paper,
  },
  previewEmpty: {
    minHeight: 266,
    textAlignVertical: "center",
  },
});
