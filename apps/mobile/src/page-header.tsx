import type { ReactNode } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { Text } from "./app-text";
import { colors, space, typography } from "./theme";

/**
 * 页面标题区：眉标（可选）+ H1 + 说明 + 右侧动作。
 *
 * 规格来自 Demo `.page-head`：26/37、w500、字距 0.5、**sans**（衬线只留给
 * 问候语与洞察卡标题），标题色 `colors.heading`（#4A4A4A），
 * 说明文案 11/1.8 用 `colors.faint`（比 Demo 的 #999 更严格，达 AA），
 * 下边距桌面 28 / 移动 23。
 *
 * 决策 D5（页面 H1 是否保留衬线）尚未批复；当前按 Demo 实测用 sans，
 * 若产品选择品牌延续，只需把 `serif` 打开。
 *
 * 视觉按 shadcn 的 Typography 层级收紧：H1 20/28 w600、说明单行弱化、
 * 区块下留白统一到 16 / 20；配色与字体保持项目原有主题不变。
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
  /** 一句话说明（Demo .page-head p）。 */
  description?: string;
  /** 右侧动作区（按钮、返回入口等）。 */
  actions?: ReactNode;
  /** 窄屏形态（下边距 23），默认桌面 28。 */
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
          gap: space.sm,
          marginBottom: compact ? 16 : 20,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {!!eyebrow && <Text style={[typography.eyebrow, { color: colors.faint }]}>{eyebrow}</Text>}
        <Text
          accessibilityRole="header"
          style={{
            ...typography.h1,
            fontSize: 20,
            lineHeight: 28,
            fontWeight: "600",
            color: colors.pageTitle,
            ...(serif ? { fontFamily: typography.insightTitle.fontFamily } : null),
          }}
        >
          {title}
        </Text>
        {!!description && (
          <Text
            numberOfLines={compact ? 2 : 1}
            style={[typography.meta, { lineHeight: 19, color: colors.faint, maxWidth: 640 }]}
          >
            {description}
          </Text>
        )}
      </View>
      {!!actions && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{actions}</View>
      )}
    </View>
  );
}
