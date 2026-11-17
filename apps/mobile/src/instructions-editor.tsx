import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "./app-text";
import { AssistantResponse } from "./assistant-response";
import { useTranslation } from "./i18n";
import { Button, colors, radius, s, space } from "./ui";

type InstructionMode = "edit" | "preview";

/**
 * 「指令」编辑器：Agent 详情页与频道详情页共用这一份。
 *
 * 打开时先看当前指令渲染出来的效果（Markdown 预览），需要改动再切到「编辑」。
 * 保存动作各不相同（写 Agent / 写频道），所以只回调 `onSave`，不自己落库。
 */
export function InstructionsEditor({
  value,
  onChange,
  onSave,
  accessibilityLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
  /** 输入框的无障碍名称：两个页面各自沿用原来的文案 key。 */
  accessibilityLabel: string;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<InstructionMode>("preview");
  const [focused, setFocused] = useState(false);
  const modes: { id: InstructionMode; label: string }[] = [
    { id: "preview", label: t("agentSpace.instructionsPreview") },
    { id: "edit", label: t("agentSpace.instructionsEdit") },
  ];

  return (
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
          {t("preferences.characterCount", { count: value.length })}
        </Text>
      </View>
      {mode === "edit" ? (
        <TextInput
          accessibilityLabel={accessibilityLabel}
          value={value}
          onChangeText={onChange}
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
          {value.trim() ? (
            <AssistantResponse content={value} />
          ) : (
            <Text style={[s.small, styles.previewEmpty]}>
              {t("agentSpace.instructionsPreviewEmpty")}
            </Text>
          )}
        </View>
      )}
      <Button primary style={{ marginTop: space.md }} onPress={onSave}>
        {t("agentSpace.saveInstructions")}
      </Button>
    </View>
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
