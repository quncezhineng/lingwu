import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Modal,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { activeLocaleTag, useTranslation } from "./i18n";
import { tr } from "./i18n/translate";
import { ArrowUpRight, Check, ChevronRight, type IconComponent, X } from "./icons";
import { breakpoints, colors, fonts, radius, space, statusColors, typography } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * 设计令牌统一由 `theme.ts` 提供，这里 re-export 以兼容既有 `from "./ui"` 引用。
 * 新增代码请直接从 `./theme` 引入，或只使用本文件导出的组件。
 */
export {
  appBrands,
  chartNeutral,
  chartSeries,
  colors,
  fonts,
  iconStroke,
  radius,
  serviceBrands,
  shadow,
  space,
  statusColors,
  typography,
} from "./theme";

/** 共享样式表：只消费令牌，不写裸值。 */
export const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  text: { color: colors.text, ...typography.body },
  muted: { color: colors.muted, ...typography.prose },
  small: { color: colors.muted, ...typography.caption },
  label: { color: colors.muted, ...typography.eyebrow },
  /** 浮层标题：26/37 页面 H1 规格，与页面头保持同一层级。 */
  title: { color: colors.heading, ...typography.h1 },
  heading: { color: colors.heading, ...typography.heading },
  /** 白纸卡片：轻描边、10px 圆角，靠描边而非阴影表达层级。 */
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
  },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: space.md },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.field,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    backgroundColor: colors.paper,
    minHeight: 44,
    fontFamily: fonts.sans,
  },
  field: { gap: space.xs, marginBottom: space.md },
  /** 按钮：control 圆角 + 1px 描边，默认高度 38（small 32），触控可达 44。 */
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    minHeight: 38,
    paddingVertical: space.xs,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: "transparent",
  },
  primary: { backgroundColor: colors.primaryAction, borderColor: colors.primaryAction },
  secondary: { backgroundColor: colors.surface, borderColor: colors.line },
  dangerSurface: { backgroundColor: colors.errorSoft, borderColor: colors.errorSoft },
  buttonText: { fontSize: 14, fontWeight: "600", fontFamily: fonts.sans },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: space.xxs,
    borderRadius: radius.control,
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipText: {
    fontSize: typography.eyebrow.fontSize,
    lineHeight: typography.eyebrow.lineHeight,
    fontWeight: "600",
    color: colors.muted,
    fontFamily: fonts.sans,
  },
  /** 触控目标底座：44×44（不小于 touch 下限）。 */
  iconBox: {
    width: space.touch,
    height: space.touch,
    borderRadius: radius.card,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  /** 任务行 / 列表图标底座：36×39 / r9（Delta C5）。 */
  glyph: {
    width: 36,
    height: 39,
    borderRadius: radius.field,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  error: {
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.errorSoft,
    marginVertical: 10,
    gap: space.xxs,
  },
  modalShade: {
    flex: 1,
    backgroundColor: colors.modalShade,
    justifyContent: "center",
    alignItems: "center",
    padding: space.lg,
  },
  /** 弹窗面板：白底 + 1px 描边 + 17px 圆角（Demo .modal），最大宽度对齐设计库 .panel 的 760。 */
  sheet: {
    backgroundColor: colors.paper,
    borderRadius: radius.sheet,
    width: "100%",
    maxWidth: 760,
    maxHeight: "94%",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
  },
  /** 数据/度量数字：等宽字体 + tabular 数字，对齐 TraeWork 数值展示规范。 */
  metric: { fontVariant: ["tabular-nums"] as const, fontFamily: fonts.number },
});
export function Button({
  children,
  onPress,
  icon: Icon,
  primary,
  disabled,
  busy,
  quietBusy,
  small,
  danger,
  style,
  hitSlop,
}: {
  children: ReactNode;
  onPress: () => void;
  icon?: IconComponent;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  /** busy 时不显示加载动画、不降低透明度，仅保留防重复点击，避免文字产生动态效果。 */
  quietBusy?: boolean;
  small?: boolean;
  danger?: boolean;
  style?: ViewStyle;
  /** 扩大触控热区（视觉尺寸不变）；小尺寸按钮用于达到 44px 触控目标。 */
  hitSlop?: number;
}) {
  const color = danger ? colors.danger : primary ? colors.onPrimary : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        primary ? s.primary : danger ? s.dangerSurface : s.secondary,
        small && { minHeight: 32, paddingVertical: 6, paddingHorizontal: 13 },
        style,
        {
          opacity: disabled ? 0.4 : busy && !quietBusy ? 0.75 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {busy && !quietBusy ? (
        <ActivityIndicator color={color} size="small" />
      ) : Icon ? (
        <Icon size={15} color={color} />
      ) : null}
      <Text style={[s.buttonText, small && { fontSize: 12 }, { color }]}>{children}</Text>
    </Pressable>
  );
}
export function IconButton({
  icon: Icon,
  label,
  onPress,
  size = 38,
  disabled = false,
}: {
  icon: IconComponent;
  label: string;
  onPress: () => void;
  /** Touch target; pass 44 for dense table rows that need a larger hit area. */
  size?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={disabled ? undefined : 4}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radius.card,
          backgroundColor: pressed ? colors.overlay1 : "transparent",
          opacity: disabled ? 0.28 : 1,
        },
      ]}
    >
      <Icon size={size >= 44 ? 20 : 18} color={colors.muted} />
    </Pressable>
  );
}
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Chip({ children, tint }: { children: ReactNode; tint?: string }) {
  return (
    <View style={[s.chip, tint ? { backgroundColor: tint } : null]}>
      <Text style={s.chipText}>{children}</Text>
    </View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={s.field}>
      <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.faint}
        accessibilityLabel={label}
        {...props}
        style={[
          s.input,
          props.multiline && { minHeight: 120, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Empty({
  icon: Icon,
  title,
  detail,
  children,
}: {
  icon: IconComponent;
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <View style={{ alignItems: "center", padding: 40, gap: space.sm }}>
      <View style={[s.iconBox, { width: 48, height: 48, borderRadius: radius.composer }]}>
        <Icon size={24} color={colors.primary} />
      </View>
      <Text style={s.heading}>{title}</Text>
      <Text style={[s.muted, { textAlign: "center", maxWidth: 360 }]}>{detail}</Text>
      {children}
    </View>
  );
}
export function ErrorNotice({ error }: { error?: string }) {
  return error ? (
    <View accessibilityRole="alert" style={s.error}>
      <Text style={[s.text, { color: colors.danger }]}>{error}</Text>
    </View>
  ) : null;
}
export function Sheet({
  title,
  subtitle,
  children,
  onClose,
  wide,
  narrow,
  fullscreen,
  dismissOnBackdrop = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  /** 紧凑阅读浮层：用于单张领悟卡等短内容，避免桌面端出现过宽留白。 */
  narrow?: boolean;
  /** 全屏模式：弹窗铺满整个网页/屏幕（如研究产物详情），优先级最高。 */
  fullscreen?: boolean;
  /** 点击弹窗外的深色背板区域时是否关闭弹窗，默认开启。 */
  dismissOnBackdrop?: boolean;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const compact = width < 600;
  // 标题字号按 <760 收敛（弹层布局仍用 600 断点）
  const mobileTitle = width < breakpoints.mobile;
  return (
    <Modal
      transparent
      animationType={reducedMotion ? "none" : compact ? "slide" : "fade"}
      visible
      onRequestClose={onClose}
    >
      {/* 背板：点击深色区域关闭弹窗（dismissOnBackdrop 可关闭此行为） */}
      <Pressable
        onPress={dismissOnBackdrop ? onClose : undefined}
        style={[
          s.modalShade,
          compact && !fullscreen && { padding: 0, justifyContent: "flex-end" },
          fullscreen && { padding: 0, justifyContent: "center" },
        ]}
      >
        {/* 弹窗面板：自身拦截点击，避免面板内点击冒泡到背板导致误关 */}
        <Pressable
          accessibilityViewIsModal
          onPress={(e) => e.stopPropagation()}
          style={[
            s.sheet,
            wide && { maxWidth: 1050 },
            narrow && { maxWidth: 560 },
            compact &&
              !fullscreen && {
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                paddingBottom: Math.max(insets.bottom, 12),
                maxHeight: "94%",
              },
            fullscreen && {
              width: "100%",
              height: "100%",
              maxWidth: "100%",
              maxHeight: "100%",
              borderRadius: 0,
              borderWidth: 0,
              paddingBottom: 0,
            },
          ]}
        >
          {compact && !fullscreen && (
            <View
              style={{
                alignSelf: "center",
                width: 34,
                height: 4,
                borderRadius: radius.full,
                backgroundColor: colors.lineStrong,
                marginTop: 10,
              }}
            />
          )}
          <View
            style={[
              s.between,
              {
                padding: compact ? space.md : space.lg,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
              },
            ]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                numberOfLines={2}
                style={[s.title, mobileTitle && { fontSize: 22, lineHeight: 32 }]}
              >
                {title}
              </Text>
              {!!subtitle && <Text style={s.muted}>{subtitle}</Text>}
            </View>
            <IconButton icon={X} label={t("ui.closeDetails")} onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={fullscreen ? { flex: 1 } : undefined}
            contentContainerStyle={
              fullscreen
                ? { flexGrow: 1, padding: compact ? space.md : space.lg }
                : { padding: compact ? space.md : space.lg }
            }
          >
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
export function CheckRow({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={[s.row, { gap: 10, paddingVertical: 9 }]}
    >
      <View
        style={{
          width: 19,
          height: 19,
          borderRadius: radius.micro,
          borderWidth: 1,
          borderColor: checked ? colors.primary : colors.lineStrong,
          backgroundColor: checked ? colors.primary : colors.paper,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <Check size={13} color={colors.onPrimary} />}
      </View>
      <Text style={[s.text, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}
/**
 * 区块标题：标题 + 可选计数 chip + 可选文本按钮。
 *
 * 七个模块的二级分区统一走这里：标题 16/600、计数 10 号 chip（r4 / #EFEFEF）、
 * 动作 11 号文本按钮；`onPress` 缺省时动作纯展示。
 */
export function SectionHeading({
  title,
  count,
  action,
  onPress,
  actions,
  style,
}: {
  title: string;
  count?: number | string;
  action?: string;
  onPress?: () => void;
  /** 自定义右侧动作（如轮播切换），优先于文本按钮。 */
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.between, { marginBottom: space.lg }, style]}>
      <View style={[s.row, { gap: space.xs }]}>
        <Text style={[s.heading, { fontSize: 15 }]}>{title}</Text>
        {count !== undefined && (
          <View
            style={{
              minWidth: 18,
              paddingHorizontal: 5,
              paddingVertical: 2,
              borderRadius: radius.badge,
              backgroundColor: statusColors.surface,
              alignItems: "center",
            }}
          >
            <Text
              style={[
                s.metric,
                { fontSize: typography.eyebrow.fontSize, lineHeight: 14, color: colors.link },
              ]}
            >
              {count}
            </Text>
          </View>
        )}
      </View>
      {actions ? (
        actions
      ) : action && onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} style={[s.row, { gap: 4 }]}>
          <Text style={[s.small, { color: colors.link }]}>{action}</Text>
          <ArrowUpRight size={13} color={colors.link} />
        </Pressable>
      ) : null}
    </View>
  );
}
export function LinkRow({
  title,
  detail,
  onPress,
  icon: Icon,
  tint,
}: {
  title: string;
  detail?: string;
  onPress: () => void;
  icon: IconComponent;
  tint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        { paddingVertical: 13, gap: 14, borderRadius: radius.card },
        pressed && { backgroundColor: colors.overlay1 },
      ]}
    >
      <View style={[s.iconBox, { backgroundColor: tint || colors.surface }]}>
        <Icon size={19} color={colors.text} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[s.text, { fontWeight: "500" }]}>{title}</Text>
        {!!detail && <Text style={s.small}>{detail}</Text>}
      </View>
      <ChevronRight size={15} color={colors.muted} />
    </Pressable>
  );
}
/**
 * 可选照片头像：avatar1~avatar6 对应 assets 下的六张头像图，供用户在
 * 偏好设置里挑选。未传入或历史留存值（旧版 sky/sand/lilac 等）时回退到
 * 默认水豚涂装，保证旧数据仍可正常渲染。
 */
const AVATAR_SOURCES: Record<string, ImageSourcePropType> = {
  avatar1: require("../assets/avatar1.png"),
  avatar2: require("../assets/avatar2.png"),
  avatar3: require("../assets/avatar3.png"),
  avatar4: require("../assets/avatar4.png"),
  avatar5: require("../assets/avatar5.png"),
  avatar6: require("../assets/avatar6.png"),
};

/**
 * LingWu's original capybara, shared by every assistant surface. When
 * `variant` matches a photo avatar (avatar1~avatar6) a circular photo is
 * rendered instead of the color-tinted capybara.
 */
export function Mascot({
  size = 42,
  variant,
  background,
}: {
  size?: number;
  variant?: string;
  /** Override the fallback orb color without changing the persisted avatar variant. */
  background?: string;
}) {
  const { t } = useTranslation();
  const source = variant ? AVATAR_SOURCES[variant] : undefined;
  if (source) {
    return (
      <Image
        accessibilityLabel={t("ui.capybaraLabel")}
        source={source}
        resizeMode="cover"
        style={{ width: size, height: size, borderRadius: size / 2 }}
        accessible={false}
      />
    );
  }
  // 兜底涂装：默认（无 variant）或旧版 sky/sand/lilac 仍渲染水豚。
  // sand/lilac 是历史头像遗留值，保持原样以兼容已存数据；默认底色跟随品牌浅蓝。
  const palette =
    background ??
    {
      sky: colors.sky,
      sand: colors.avatarSand,
      lilac: colors.avatarLilac,
    }[variant ?? "sky"] ??
    colors.sky;
  return (
    <View accessibilityLabel={t("ui.capybaraLabel")} style={{ width: size, height: size }}>
      <View
        style={{
          position: "absolute",
          top: size * 0.15,
          left: size * 0.12,
          width: size * 0.76,
          height: size * 0.76,
          borderRadius: size,
          backgroundColor: palette,
        }}
      />
      <Image
        source={require("../assets/logo.png")}
        resizeMode="contain"
        style={{ width: size, height: size }}
        accessible={false}
      />
    </View>
  );
}
/** 行情正文色：涨红/跌绿/平灰的 AA 对比度变体（观察列表、标的详情共用）。 */
export function marketDirectionColor(direction: "up" | "down" | "flat") {
  return direction === "up"
    ? colors.marketUpText
    : direction === "down"
      ? colors.marketDownText
      : colors.marketFlat;
}

/**
 * 合规声明：所有行情/简报/研报类界面都应展示「不构成投资建议」。
 * 统一放在 ui 层，避免各页面各写一份导致遗漏或文案不一致。
 */
export function DisclaimerNote({ style }: { style?: StyleProp<TextStyle> }) {
  const { t } = useTranslation();
  return (
    <Text style={[s.small, { color: colors.faint, marginTop: 12 }, style]}>
      {t("ui.disclaimer")}
    </Text>
  );
}
export function dateLabel(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(activeLocaleTag(), options || { month: "short", day: "numeric" });
}
export function timeLabel(value: string, timeZone?: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString(activeLocaleTag(), {
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      });
}
export { relativeDate } from "./relative-date";

export function resultSummary(value: string) {
  return /^Saved to (?:sample|local) sent mail(?: · .+)?$/.test(value)
    ? tr("ui.replySaved")
    : value;
}
