/** Web 拖拽/点击上传区（真实 DOM 事件，支持键盘 Enter/Space）。 */
import { createElement, useState } from "react";
import { Text } from "react-native";
import type { PickedCsv } from "./csv-file";
import { pickCsvFile } from "./csv-file";
import { Upload } from "./icons";
import { colors, s } from "./ui";

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
  const [hover, setHover] = useState(false);

  const open = async () => {
    if (busy) return;
    const picked = await pickCsvFile();
    if (picked) onPick(picked);
  };

  return createElement(
    "div",
    {
      role: "button",
      tabIndex: 0,
      "aria-disabled": busy ? "true" : undefined,
      onDragOver: (event: DragEvent) => {
        event.preventDefault();
        setHover(true);
      },
      onDragLeave: () => setHover(false),
      onDrop: async (event: DragEvent) => {
        event.preventDefault();
        setHover(false);
        const file = event.dataTransfer?.files?.[0];
        if (file) onPick({ name: file.name, text: await file.text() });
      },
      onClick: () => void open(),
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void open();
        }
      },
      style: {
        minHeight: 160,
        padding: 28,
        borderRadius: 14,
        border: `1px dashed ${hover ? colors.primary : colors.lineStrong}`,
        background: hover ? colors.sky : colors.surface,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        cursor: busy ? "progress" : "pointer",
        opacity: busy ? 0.7 : 1,
        outline: "none",
      },
    },
    createElement(Upload, { size: 24, color: colors.primary }),
    createElement(Text, { style: [s.text, { fontWeight: "600" }] }, title),
    createElement(Text, { style: s.muted }, hint),
  );
}
