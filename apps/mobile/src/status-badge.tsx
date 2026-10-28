import { type StyleProp, Text, View, type ViewStyle } from "react-native";
import type { TaskStatus } from "../../../packages/domain/src/agent";
import { colors, radius, statusColors, typography } from "./theme";

/**
 * 状态语义。
 *
 * 四态 + 两种扩展态（失败、取消）。底统一中性 `#EFEFEF`，仅文字色区分，
 * 与 Demo 的 `.status-badge` 一致：小圆角矩形（r4）、10 号字、3×6 内距。
 */
export type StatusTone = "running" | "waiting" | "done" | "failed" | "paused";

export const statusToneColors: Record<StatusTone, { background: string; foreground: string }> = {
  running: { background: statusColors.surface, foreground: statusColors.running },
  waiting: { background: statusColors.surface, foreground: statusColors.waiting },
  done: { background: statusColors.surface, foreground: statusColors.done },
  failed: { background: statusColors.surface, foreground: colors.danger },
  paused: { background: statusColors.surface, foreground: statusColors.paused },
};

/** 任务状态 → 徽标语义。取消态按中性（paused）展示，不再强调为错误。 */
export function taskStatusTone(status: TaskStatus): StatusTone {
  switch (status) {
    case "queued":
    case "running":
      return "running";
    case "waiting_approval":
    case "waiting_input":
    case "scheduled":
      return "waiting";
    case "succeeded":
      return "done";
    case "failed":
      return "failed";
    case "cancelled":
    case "paused":
      return "paused";
  }
}

/**
 * 状态徽标：小圆角矩形 + 中性底 + 语义字色。
 *
 * 文案由调用方用 `statusLabel()` 传入，组件只负责状态视觉，
 * 避免各页面各自拼颜色与字号。
 */
export function StatusBadge({
  tone,
  label,
  style,
}: {
  tone: StatusTone;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = statusToneColors[tone];
  return (
    <View
      style={[
        {
          alignSelf: "flex-start",
          paddingHorizontal: 6,
          paddingVertical: 3,
          borderRadius: radius.badge,
          backgroundColor: palette.background,
        },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          fontSize: typography.eyebrow.fontSize,
          lineHeight: 14,
          fontWeight: "500",
          color: palette.foreground,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
