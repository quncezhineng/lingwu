/** 原生端技能上传区：不接受系统级拖拽，点击按钮选择 SKILL.md。 */
import { View } from "react-native";
import { Text } from "./app-text";
import { Upload } from "./icons";
import { type PickedSkillFile, pickSkillFile } from "./skill-file";
import { Button, colors, s } from "./ui";

export function SkillDropzone({
  onPick,
  onError,
  title,
  hint,
  busy,
}: {
  onPick: (file: PickedSkillFile) => void;
  onError?: (message: string) => void;
  title: string;
  hint: string;
  /** 仅 Web 生效，原生端忽略。 */
  dragHint?: string;
  busy?: boolean;
}) {
  return (
    <View
      style={[
        s.card,
        {
          minHeight: 160,
          gap: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
          borderStyle: "dashed",
          borderColor: colors.lineStrong,
        },
      ]}
    >
      <Upload size={24} color={colors.primary} />
      <Text style={[s.text, { fontWeight: "600" }]}>{title}</Text>
      <Text style={[s.muted, { textAlign: "center" }]}>{hint}</Text>
      <Button
        primary
        icon={Upload}
        busy={busy}
        style={{ minHeight: 44 }}
        onPress={() => {
          void pickSkillFile()
            .then((picked) => {
              if (picked) onPick(picked);
            })
            .catch((error: unknown) => {
              onError?.(error instanceof Error ? error.message : String(error));
            });
        }}
      >
        {title}
      </Button>
    </View>
  );
}
