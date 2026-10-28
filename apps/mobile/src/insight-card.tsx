import {
  Pressable,
  type StyleProp,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useTranslation } from "./i18n";
import { ArrowUpRight, Heart, type IconComponent, Sparkles } from "./icons";
import { breakpoints, colors, radius, space, statusColors, typography } from "./theme";
import { s } from "./ui";

/**
 * 洞察卡（今日领悟 / 资料库「领悟卡」分区共用）。
 *
 * 结构对齐 Demo：眉标（图标 + 分类 + 序号）→ 衬线标题 → 一句话结论 → 底部元信息与动作。
 * 三种状态：
 * - 默认：整卡可点，进入详情；
 * - 已收藏：右下角出现实心收藏标记（传入 `onToggleSave` 时可切换）；
 * - 收起：只保留眉标与单行标题，用于右栏或紧凑列表。
 *
 * 交互实现上，未传 `onToggleSave` 时整卡是一个 Pressable（与工作台现状一致）；
 * 传入后拆成「正文区 / 底部区」两个并列 Pressable，避免嵌套按钮在
 * react-native-web 上冒泡误触。
 */
export function InsightCard({
  icon: Icon = Sparkles,
  eyebrow,
  title,
  detail,
  basis,
  limits,
  revisit,
  meta,
  onPress,
  onSimplify,
  onDisagree,
  onToggleSave,
  saved = false,
  collapsed = false,
  showSections = true,
  accessibilityLabel,
  style,
}: {
  icon?: IconComponent;
  eyebrow: string;
  title: string;
  /** 一句话结论 / 摘要；收起态不展示。 */
  detail?: string;
  /** 「依据」段；缺省不渲染。 */
  basis?: string;
  /** 「还不能判断什么」段；缺省不渲染。 */
  limits?: string;
  /** 「何时回看」段；缺省不渲染。 */
  revisit?: string;
  /** 底部元信息：来源、作者、时间等。 */
  meta?: string;
  onPress?: () => void;
  /** 底部动作：讲浅一点 / 我有不同看法。 */
  onSimplify?: () => void;
  onDisagree?: () => void;
  /** 传入后展示收藏按钮；由调用方决定是否持久化。 */
  onToggleSave?: () => void;
  saved?: boolean;
  collapsed?: boolean;
  /** 是否在卡面展开三段；工作台首屏传 false，把三段留给详情浮层。 */
  showSections?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const compact = width < breakpoints.mobile;

  const cardStyle: ViewStyle = {
    minHeight: collapsed ? undefined : compact ? 106 : undefined,
    paddingTop: 17,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.field,
    backgroundColor: colors.paper,
    justifyContent: "space-between",
    gap: space.sm,
  };

  const sections = [
    { label: t("ui.insightBasis"), value: basis },
    { label: t("ui.insightLimits"), value: limits },
    { label: t("ui.insightRevisit"), value: revisit },
  ].filter((item) => !!item.value);

  const body = (
    <View style={{ gap: space.xs, minWidth: 0 }}>
      <View style={[s.row, { gap: space.xs }]}>
        <Icon size={12} color={colors.primary} />
        <Text
          numberOfLines={1}
          style={{
            flexShrink: 1,
            fontSize: typography.eyebrow.fontSize,
            lineHeight: typography.eyebrow.lineHeight,
            color: colors.muted,
          }}
        >
          {eyebrow}
        </Text>
      </View>
      <Text
        numberOfLines={collapsed ? 1 : 2}
        style={{ ...typography.insightTitle, color: colors.heading }}
      >
        {title}
      </Text>
      {!collapsed && !!detail && (
        <Text numberOfLines={3} style={[typography.prose, { color: colors.muted }]}>
          {detail}
        </Text>
      )}
      {!collapsed &&
        showSections &&
        sections.map((item) => (
          <View key={item.label} style={{ gap: 2, marginTop: 2 }}>
            <Text style={[typography.eyebrow, { color: colors.faint }]}>{item.label}</Text>
            <Text style={[typography.prose, { color: colors.text }]}>{item.value}</Text>
          </View>
        ))}
    </View>
  );

  const footer = (
    <View style={[s.between, { gap: space.xs }]}>
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: typography.caption.fontSize,
          lineHeight: typography.caption.lineHeight,
          color: colors.faint,
        }}
      >
        {meta}
      </Text>
      <View style={[s.row, { gap: space.sm }]}>
        {!!onSimplify && (
          <Pressable accessibilityRole="button" hitSlop={6} onPress={onSimplify}>
            <Text style={[typography.caption, { color: colors.link }]}>
              {t("ui.insightSimplify")}
            </Text>
          </Pressable>
        )}
        {!!onDisagree && (
          <Pressable accessibilityRole="button" hitSlop={6} onPress={onDisagree}>
            <Text style={[typography.caption, { color: colors.link }]}>
              {t("ui.insightDisagree")}
            </Text>
          </Pressable>
        )}
        {onToggleSave ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(saved ? "ui.unsaveInsight" : "ui.saveInsight")}
            accessibilityState={{ selected: saved }}
            hitSlop={8}
            onPress={onToggleSave}
            style={({ pressed }) => ({
              width: 28,
              height: 28,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.micro,
              backgroundColor: saved
                ? statusColors.surface
                : pressed
                  ? colors.overlay1
                  : "transparent",
            })}
          >
            <Heart
              size={15}
              color={saved ? colors.primary : colors.faint}
              fill={saved ? colors.primary : "none"}
            />
          </Pressable>
        ) : (
          !!onPress && <ArrowUpRight size={14} color={colors.faint} />
        )}
      </View>
    </View>
  );

  // 有内嵌动作时必须拆分布局，避免 Pressable 嵌套在 Web 上冒泡误触。
  if (onToggleSave || onSimplify || onDisagree) {
    return (
      <View style={[cardStyle, style]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? title}
          onPress={onPress}
          style={{ gap: space.xs + 2 }}
        >
          {body}
        </Pressable>
        {!collapsed && footer}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [cardStyle, style, pressed && { backgroundColor: colors.surface }]}
    >
      {body}
      {!collapsed && footer}
    </Pressable>
  );
}
