/** Web 端技能上传区：真实 DOM 拖拽事件 + 点击选择，支持键盘 Enter/Space。 */
import { createElement, useState } from "react";
import { Text } from "./app-text";
import { Upload } from "./icons";
import { type PickedSkillFile, pickSkillFile } from "./skill-file";
import { colors, s } from "./ui";

/** 只接受文本类技能文件；拖进图片或 PDF 时直接给出可读提示。 */
const SKILL_EXTENSIONS = /\.(md|markdown|txt)$/i;

export function SkillDropzone({
  onPick,
  onError,
  title,
  hint,
  dragHint,
  busy,
}: {
  onPick: (file: PickedSkillFile) => void;
  onError?: (message: string) => void;
  title: string;
  hint: string;
  /** 仅 Web 生效：提示可以直接把文件拖进来。 */
  dragHint: string;
  busy?: boolean;
}) {
  const [hover, setHover] = useState(false);

  const open = async () => {
    if (busy) return;
    try {
      const picked = await pickSkillFile();
      if (picked) onPick(picked);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    }
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
        if (busy) return;
        const file = event.dataTransfer?.files?.[0];
        if (!file) return;
        if (!SKILL_EXTENSIONS.test(file.name)) {
          onError?.(hint);
          return;
        }
        onPick({ name: file.name, text: await file.text() });
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
        textAlign: "center",
        cursor: busy ? "progress" : "pointer",
        opacity: busy ? 0.7 : 1,
        outline: "none",
      },
    },
    createElement(Upload, { size: 24, color: colors.primary }),
    createElement(Text, { style: [s.text, { fontWeight: "600" }] }, title),
    createElement(Text, { style: s.muted }, hint),
    createElement(Text, { style: s.muted }, dragHint),
  );
}
