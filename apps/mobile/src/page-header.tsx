import type { ReactNode } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { Text } from "./app-text";
import { colors, space, textScale, typography } from "./theme";

/**
 * 页面标题区：眉标（可选）+ H1 + 说明 + 右侧动作。
 *
 * 排版按 TDesign 字阶与 4px 栅格校准：眉标 10 / H1 20/28 / 说明 12/20 三档层级清晰，
 * 眉标—标题—说明的垂直间距走 2 / 6 刻度，区块下留白桌面 24 / 窄屏 20，
 * 标题与右侧动作之间留 16 的分区呼吸；动作区下沉 2，与 H1 的视觉中线对齐。
 *
 * 标题色沿用 `colors.pageTitle`，说明沿用 `colors.faint`（AA 对比度），
 * 字体沿用全局 `fonts`，配色与字体完全不变；`serif` 仅切换 H1 字体族。
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  compact,
  serif,
  style,
}: {
  /** 眉标：日期、分类等 10 号大写小标签。 */
  eyebrow?: string;
  title: string;
  /** 一句话说明。 */
  description?: string;
  /** 右侧动作区（按钮、返回入口等）。 */
  actions?: ReactNode;
  /** 窄屏形态（下留白 20、说明可折两行），默认桌面（下留白 24）。 */
  compact?: boolean;
  /** 可选：页面 H1 使用衬线（品牌延续方案）。 */
  serif?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (!title) return null;
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: space.md,
          marginBottom: compact ? space.lg : space.xl,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        {!!eyebrow && (
          <Text style={[typography.eyebrow, { color: colors.faint, marginBottom: space.hairline }]}>
            {eyebrow}
          </Text>
        )}
        <Text
          accessibilityRole="header"
          style={[
            typography.h1,
            textScale.titleLarge,
            {
              color: colors.pageTitle,
              ...(serif ? { fontFamily: typography.insightTitle.fontFamily } : null),
            },
          ]}
        >
          {title}
        </Text>
        {!!description && (
          <Text
            numberOfLines={compact ? 2 : 1}
            style={[
              textScale.bodySmall,
              { marginTop: space.compact, color: colors.faint, maxWidth: 640 },
            ]}
          >
            {description}
          </Text>
        )}
      </View>
      {!!actions && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.xs,
            paddingTop: space.hairline,
          }}
        >
          {actions}
        </View>
      )}
    </View>
  );
}
