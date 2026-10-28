import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from "react-native";
import type { TaskStep } from "../../../packages/domain/src/agent";
import { useTranslation } from "./i18n";
import { runtimeLabel, statusLabel } from "./i18n/translate";
import { Check, ChevronDown, ChevronUp, CircleX, Clock3 } from "./icons";
import { colors, radius, space, statusColors, typography } from "./theme";
import { s } from "./ui";

/** 步骤标记：完成对勾、进行中转圈、失败叉、等待时钟、未开始空心圆点（同一套图标语言）。 */
function StepMark({ step }: { step: TaskStep }) {
  switch (step.status) {
    case "succeeded":
      return <Check size={16} color={statusColors.stepDone} />;
    case "running":
      return <ActivityIndicator size="small" color={colors.primary} />;
    case "failed":
      return <CircleX size={15} color={colors.danger} />;
    case "waiting":
      return <Clock3 size={15} color={statusColors.waiting} />;
    default:
      return (
        <View
          style={{
            width: 9,
            height: 9,
            borderRadius: radius.full,
            borderWidth: 1.5,
            borderColor: colors.lineStrong,
          }}
        />
      );
  }
}

/** 步骤状态的文字色：进行中用加深蓝，失败用红，其余中性。 */
function stepTextColor(status: TaskStep["status"]) {
  if (status === "running") return colors.primaryStrong;
  if (status === "failed") return colors.danger;
  return colors.muted;
}

/**
 * 计划卡：任务步骤列表 + 进度文本（x/y 步）。
 *
 * 对齐 Demo 的 `.plan-card`：r10、padding 16 18、1px 描边；收起时整卡浅灰底，
 * 与「任务卡」的进度条形态区分开——计划卡用步骤列表 + 文本进度，任务卡保留进度条。
 */
export function PlanCard({
  steps,
  title,
  collapsible = true,
  defaultCollapsed = false,
  style,
}: {
  steps: TaskStep[];
  /** 卡片标题，由调用方传入已翻译文案。 */
  title: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  style?: ViewStyle;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const done = steps.filter((step) => step.status === "succeeded").length;
  const total = steps.length;
  const progress = total ? Math.round((done / total) * 100) : 0;

  return (
    <View style={[card, collapsed && { backgroundColor: colors.surfaceSoft }, style]}>
      <View style={[s.between, { gap: space.xs }]}>
        <View style={[s.row, { gap: space.xs, flexShrink: 1 }]}>
          <Text style={s.heading}>{title}</Text>
          <Text
            style={[
              s.metric,
              { fontSize: typography.caption.fontSize, color: colors.muted, flexShrink: 0 },
            ]}
          >
            {t("ui.planProgress", { done, total })}
          </Text>
        </View>
        {collapsible && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(collapsed ? "ui.showMore" : "ui.showLess")}
            accessibilityState={{ expanded: !collapsed }}
            hitSlop={8}
            onPress={() => setCollapsed((value) => !value)}
            style={({ pressed }) => ({
              width: 28,
              height: 28,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.micro,
              backgroundColor: pressed ? colors.overlay1 : "transparent",
            })}
          >
            {collapsed ? (
              <ChevronDown size={15} color={colors.muted} />
            ) : (
              <ChevronUp size={15} color={colors.muted} />
            )}
          </Pressable>
        )}
      </View>

      <View style={{ height: 3, borderRadius: radius.full, backgroundColor: colors.line }}>
        <View
          style={{
            height: 3,
            width: `${progress}%`,
            borderRadius: radius.full,
            backgroundColor: colors.primary,
          }}
        />
      </View>

      {!collapsed &&
        steps.map((step) => (
          <View key={step.id} style={[s.row, { gap: space.sm, alignItems: "flex-start" }]}>
            <View style={{ width: 18, alignItems: "center", paddingTop: 3 }}>
              <StepMark step={step} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.text, { color: colors.text }]}>{runtimeLabel(step.title)}</Text>
              {!!step.detail && <Text style={[s.small, { marginTop: 2 }]}>{step.detail}</Text>}
              <Text style={[s.small, { marginTop: 2, color: stepTextColor(step.status) }]}>
                {statusLabel(step.status)}
              </Text>
            </View>
          </View>
        ))}
    </View>
  );
}

const card: ViewStyle = {
  backgroundColor: colors.paper,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: colors.line,
  paddingVertical: space.md,
  paddingHorizontal: 18,
  gap: space.sm,
};
