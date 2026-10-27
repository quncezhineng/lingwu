/**
 * 近 1 年归一化收益曲线（P1-F1）。
 *
 * 两条序列都减去各自起点（归一化到 0%），主色实线为组合、灰色虚线为基准；
 * 提供无障碍摘要与「查看数据表」替代（月度采样）。
 */
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";
import { directionOf } from "./market-format";
import type { RiskSeriesPoint } from "./portfolio";
import { colors, marketDirectionColor, s } from "./ui";

const NEUTRAL = "#8A8F98";
const HEIGHT = 120;
const PADDING = { top: 8, right: 8, bottom: 20, left: 32 };

function normalize(points: RiskSeriesPoint[]) {
  const base = points[0];
  const portfolioBase = base?.portfolio ?? 0;
  const benchmarkBase = base?.benchmark ?? 0;
  return points.map((point) => ({
    date: point.date,
    portfolio: point.portfolio - portfolioBase,
    benchmark: point.benchmark - benchmarkBase,
  }));
}

function pathFor(values: number[], width: number, min: number, max: number) {
  const range = max - min || 1;
  const innerW = width - PADDING.left - PADDING.right;
  const innerH = HEIGHT - PADDING.top - PADDING.bottom;
  return values
    .map((value, index) => {
      const x = PADDING.left + (innerW * index) / Math.max(values.length - 1, 1);
      const y = PADDING.top + innerH - ((value - min) / range) * innerH;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function ReturnComparisonChart({
  series,
  benchmarkName,
  chartLabel,
  tableLabel,
  emptyLabel,
  loading,
  labels,
}: {
  series?: RiskSeriesPoint[];
  benchmarkName: string;
  chartLabel: string;
  tableLabel: string;
  emptyLabel: string;
  loading?: boolean;
  labels: { portfolio: string; benchmark: string; date: string };
}) {
  const [width, setWidth] = useState(0);
  const [showTable, setShowTable] = useState(false);

  if (loading) {
    return (
      <View style={{ height: HEIGHT, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!series || series.length < 12) {
    return (
      <View style={{ height: HEIGHT, alignItems: "center", justifyContent: "center" }}>
        <Text style={[s.small, { color: colors.faint }]}>{emptyLabel}</Text>
      </View>
    );
  }

  const points = normalize(series);
  const values = points.flatMap((point) => [point.portfolio, point.benchmark]);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const yFor = (value: number) => {
    const range = max - min || 1;
    const innerH = HEIGHT - PADDING.top - PADDING.bottom;
    return PADDING.top + innerH - ((value - min) / range) * innerH;
  };
  const last = points[points.length - 1];
  const mid = points[Math.floor(points.length / 2)];
  const first = points[0];

  return (
    <View style={{ gap: 6 }}>
      <View
        accessibilityRole="image"
        accessibilityLabel={chartLabel}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ height: HEIGHT }}
      >
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            {[max, (max + min) / 2, min].map((value) => (
              <Line
                key={value}
                x1={PADDING.left}
                x2={width - PADDING.right}
                y1={yFor(value)}
                y2={yFor(value)}
                stroke={colors.line}
                strokeWidth={1}
              />
            ))}
            <Path
              d={pathFor(
                points.map((point) => point.benchmark),
                width,
                min,
                max,
              )}
              stroke={NEUTRAL}
              strokeWidth={2}
              strokeDasharray="4 3"
              fill="none"
            />
            <Path
              d={pathFor(
                points.map((point) => point.portfolio),
                width,
                min,
                max,
              )}
              stroke={colors.primary}
              strokeWidth={2}
              fill="none"
            />
            {[max, min].map((value) => (
              <SvgText
                key={`y-${value}`}
                x={2}
                y={yFor(value) + 3}
                fontSize={10}
                fill={colors.faint}
              >
                {`${value > 0 ? "+" : ""}${value.toFixed(1)}%`}
              </SvgText>
            ))}
            {[first, mid, last].map((point, index) => (
              <SvgText
                key={`x-${point?.date ?? index}`}
                x={
                  PADDING.left +
                  ((width - PADDING.left - PADDING.right) * index) / 2 -
                  (index === 0 ? 0 : index === 2 ? 30 : 14)
                }
                y={HEIGHT - 4}
                fontSize={10}
                fill={colors.faint}
              >
                {point?.date.slice(5) ?? ""}
              </SvgText>
            ))}
          </Svg>
        )}
      </View>
      <View style={[s.row, { gap: 14, flexWrap: "wrap" }]}>
        <View style={[s.row, { gap: 6 }]}>
          <View style={{ width: 14, height: 2, backgroundColor: colors.primary }} />
          <Text style={s.small}>{labels.portfolio}</Text>
        </View>
        <View style={[s.row, { gap: 6 }]}>
          <View style={{ width: 14, height: 2, backgroundColor: NEUTRAL }} />
          <Text style={s.small}>
            {labels.benchmark} · {benchmarkName}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowTable((current) => !current)}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={[s.small, { color: colors.primary, fontWeight: "600" }]}>{tableLabel}</Text>
        </Pressable>
      </View>
      {showTable && (
        <View
          style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 10, overflow: "hidden" }}
        >
          <View
            style={[
              s.row,
              { minHeight: 36, paddingHorizontal: 10, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[s.small, { flex: 1 }]}>{labels.date}</Text>
            <Text style={[s.small, { width: 90, textAlign: "right" }]}>{labels.portfolio}</Text>
            <Text style={[s.small, { width: 90, textAlign: "right" }]}>{labels.benchmark}</Text>
          </View>
          {points
            .filter((_, index) => index % Math.max(1, Math.floor(points.length / 12)) === 0)
            .map((point) => (
              <View
                key={point.date}
                style={[
                  s.row,
                  {
                    minHeight: 34,
                    paddingHorizontal: 10,
                    borderTopWidth: 1,
                    borderTopColor: colors.line,
                  },
                ]}
              >
                <Text style={[s.small, { flex: 1 }]}>{point.date}</Text>
                <Text
                  style={[
                    s.metric,
                    s.small,
                    {
                      width: 90,
                      textAlign: "right",
                      color: marketDirectionColor(directionOf(point.portfolio)),
                    },
                  ]}
                >
                  {point.portfolio > 0 ? "+" : ""}
                  {point.portfolio.toFixed(1)}%
                </Text>
                <Text
                  style={[
                    s.metric,
                    s.small,
                    {
                      width: 90,
                      textAlign: "right",
                      color: marketDirectionColor(directionOf(point.benchmark)),
                    },
                  ]}
                >
                  {point.benchmark > 0 ? "+" : ""}
                  {point.benchmark.toFixed(1)}%
                </Text>
              </View>
            ))}
        </View>
      )}
    </View>
  );
}
