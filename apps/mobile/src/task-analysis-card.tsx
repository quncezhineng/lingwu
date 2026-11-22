import { ActivityIndicator, View } from "react-native";
import { Text } from "./app-text";
import { colors, radius, s } from "./ui";

/**
 * 后台任务「分析进行中」提示卡。
 *
 * 由工作区轮询（agentWorkspace.tasks）驱动，不依赖 SSE 流：
 * 智能体 / 频道把问题交给后台任务后，对话流里持续展示这张卡，
 * 直到任务进入终态（轮询到 succeeded / failed / cancelled 才消失）。
 */
export function TaskAnalysisCard({
  label,
  title,
  progress,
}: {
  /** 主文案，如「正在进行任务分析…」。 */
  label: string;
  /** 任务标题（可空）。 */
  title?: string | null;
  /** 步骤进度文案（可空），如「3/8 步」。 */
  progress?: string | null;
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.paper,
      }}
    >
      <ActivityIndicator size="small" color={colors.primary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.small, { color: colors.primary }]} numberOfLines={1}>
          {label}
        </Text>
        {title ? (
          <Text style={[s.small, { color: colors.muted, marginTop: 2 }]} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
      {progress ? <Text style={[s.small, { color: colors.faint }]}>{progress}</Text> : null}
    </View>
  );
}
