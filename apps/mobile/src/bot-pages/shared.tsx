import { type ReactNode, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useAgentSpace } from "../agent-space";
import { useAgentWorkspace } from "../agent-workspace";
import { Text } from "../app-text";
import { selectBotResources } from "../bot-resources";
import { ChevronLeft } from "../icons";
import { colors, Sheet, s } from "../ui";
import { useWorkspace } from "../workspace";

/** embedded 为真时只渲染内容，由外层的独立页面提供标题与容器。 */
export type BotPageProps = { onClose: () => void; embedded?: boolean };

export function BotPage({
  title,
  subtitle,
  onClose,
  children,
  embedded = false,
}: BotPageProps & { title: string; subtitle?: string; children: ReactNode }) {
  const { current } = useAgentSpace();
  if (embedded) return <View style={{ gap: 2 }}>{children}</View>;
  return (
    <Sheet botLayout title={title} subtitle={subtitle ?? current.name} onClose={onClose}>
      {children}
    </Sheet>
  );
}

export function BotEmpty({ children }: { children: ReactNode }) {
  return <Text style={[s.muted, { paddingVertical: 24, lineHeight: 22 }]}>{children}</Text>;
}

/** 内容列宽达到该值才排两列，窄屏退回单列，避免卡片被挤没。 */
const TWO_COLUMN_MIN_WIDTH = 400;
const TWO_COLUMN_GAP = 10;

/**
 * 双列网格容器：宽屏两列、窄屏单列，用 `onLayout` 实测内容列宽决定。
 *
 * 三栏布局里内容列远窄于窗口，所以不能只依赖 `useWindowDimensions`；
 * 首帧用窗口宽做初值，随后以真实列宽为准。子项通过 `columns` 拿到列数，
 * 用 `itemWidth`（两列时的固定列宽，或单列时 undefined 撑满）自行排布。
 */
export function TwoColumnGrid({
  children,
}: {
  children: (columns: number, itemWidth: number | undefined) => ReactNode;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth);
  const columns = width >= TWO_COLUMN_MIN_WIDTH ? 2 : 1;
  const itemWidth = columns === 2 ? (width - TWO_COLUMN_GAP) / 2 : undefined;
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={
        columns === 2
          ? { flexDirection: "row", flexWrap: "wrap", gap: TWO_COLUMN_GAP }
          : { gap: 10 }
      }
    >
      {children(columns, itemWidth)}
    </View>
  );
}

/**
 * 嵌入模式下的返回入口。
 *
 * 浮层里由标题栏承担「回到列表」，独立页面没有这一层，
 * 因此嵌套的编辑态需要自己给出一条返回路径。
 */
export function BotInlineBack({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingVertical: 5,
        marginBottom: 6,
      }}
    >
      <ChevronLeft size={15} color={colors.muted} />
      <Text style={[s.small, { fontSize: 12, color: colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function useBotResources() {
  const { current } = useAgentSpace();
  const { data } = useAgentWorkspace();
  const { workspace } = useWorkspace();
  return { current, data, ...selectBotResources(current, data, workspace.files) };
}
