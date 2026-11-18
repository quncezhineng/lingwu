import type { ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { Text } from "./app-text";
import { Brain, Plus } from "./icons";
import { Button, colors, s } from "./ui";

type SkillSectionCardProps = {
  description: string;
  countLabel: string;
  emptyTitle: string;
  emptyDetail: string;
  addLabel: string;
  children?: ReactNode;
  onAdd: () => void;
};

/**
 * 技能区统一外壳：版式向记忆页靠齐。
 *
 * 外层只做间距排版（不画外框），真正的卡片交给内层内容卡：
 * - 顶部：说明文案 + 右侧主按钮
 * - 中间：当前技能数量
 * - 底部：技能网格，或与记忆页一致的空态盒子
 */
export function SkillSectionCard({
  description,
  countLabel,
  emptyTitle,
  emptyDetail,
  addLabel,
  children,
  onAdd,
}: SkillSectionCardProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const hasContent = Boolean(children);

  return (
    // 外层不再套卡片样式：去掉外框线，间距与层级由内层内容卡承担。
    <View style={{ gap: 22, padding: 20, borderRadius: 18 }}>
      <View
        style={{
          flexDirection: wide ? "row" : "column",
          alignItems: wide ? "center" : "flex-start",
          gap: 16,
        }}
      >
        <View style={{ flex: 1, gap: 7 }}>
          <Text style={[s.small, { color: colors.text, lineHeight: 20 }]}>{description}</Text>
        </View>
        <Button primary icon={Plus} onPress={onAdd}>
          {addLabel}
        </Button>
      </View>

      <View style={s.between}>
        <Text style={s.small}>{countLabel}</Text>
      </View>

      {hasContent ? (
        // 有内容时技能网格不再套卡片样式：每张技能卡自带描边，去掉这层多余的外框线。
        // 不再额外收窄内边距，让 CardGrid 的可用宽度与 Agent 详情技能页一致，保持双列布局。
        <View style={{ gap: 12 }}>{children}</View>
      ) : (
        <View style={[s.card, { alignItems: "center", paddingVertical: 42, gap: 10 }]}>
          <Brain size={26} color={colors.faint} />
          <Text style={s.heading}>{emptyTitle}</Text>
          <Text style={[s.muted, { textAlign: "center", maxWidth: 420 }]}>{emptyDetail}</Text>
        </View>
      )}
    </View>
  );
}
