/**
 * 自适应卡片网格。
 *
 * 页面内容宽度（扣掉侧栏、内边距）和弹层宽度都远小于窗口宽度，用窗口宽度估算列数
 * 会让卡片被挤在窄栏里；这里统一按容器 `onLayout` 实测结果换算，保证每栏不小于
 * `minColumnWidth`，空间不够时自然退化为单列。
 */
import { type ReactNode, useState } from "react";
import { View } from "react-native";

/** 网格列间距。 */
const GRID_GAP = 10;

export function CardGrid<T>({
  items,
  minColumnWidth,
  maxColumns = 2,
  getKey,
  render,
}: {
  items: readonly T[];
  /** 单栏最小宽度：不足则减少列数。目标卡 / 任务卡约 340，紧凑卡片约 200。 */
  minColumnWidth: number;
  maxColumns?: 1 | 2 | 3;
  getKey: (item: T) => string;
  /** 第三个参数是本次实际排出的列数，卡片据此切换横向 / 纵向版式。 */
  render: (item: T, index: number, layout: { columns: number }) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const columns =
    width > 0
      ? Math.max(
          1,
          Math.min(maxColumns, Math.floor((width + GRID_GAP) / (minColumnWidth + GRID_GAP))),
        )
      : 1;
  const cellWidth = width > 0 ? (width - GRID_GAP * (columns - 1)) / columns : 0;
  // 实测到之前按目标栏数给百分比兜底，避免首帧挤成单列再跳变。
  const fallback = maxColumns >= 3 ? "31%" : maxColumns === 2 ? "48%" : "100%";
  // 兜底宽度本身就是按 maxColumns 折算的，这里同步报出去，首帧版式才不会先横后竖。
  const layoutColumns = width > 0 ? columns : maxColumns;
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP }}
    >
      {items.map((item, index) => (
        <View key={getKey(item)} style={cellWidth ? { width: cellWidth } : { width: fallback }}>
          {render(item, index, { columns: layoutColumns })}
        </View>
      ))}
    </View>
  );
}
