/** 原生上传区：点击选择 CSV 文件。 */
import { Text, View } from "react-native";
import type { PickedCsv } from "./csv-file";
import { pickCsvFile } from "./csv-file";
import { Upload } from "./icons";
import { Button, colors, s } from "./ui";

export function CsvDropzone({
  onPick,
  title,
  hint,
  busy,
}: {
  onPick: (file: PickedCsv) => void;
  title: string;
  hint: string;
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
      <Text style={s.muted}>{hint}</Text>
      <Button
        primary
        icon={Upload}
        busy={busy}
        style={{ minHeight: 44 }}
        onPress={() => {
          void pickCsvFile().then((picked) => {
            if (picked) onPick(picked);
          });
        }}
      >
        {title}
      </Button>
    </View>
  );
}
