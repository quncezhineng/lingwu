import { type ReactNode, useState } from "react";
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Pressable,
  type PressableProps,
  ScrollView,
  type StyleProp,
  StyleSheet,
  type TextInputProps,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { agentLayout } from "./agent-layout";
import { Text, TextInput } from "./app-text";
import { activeLocaleTag, useTranslation } from "./i18n";
import { tr } from "./i18n/translate";
import { AlertTriangle, ArrowUpRight, Check, ChevronRight, type IconComponent, X } from "./icons";
import { ModalOverlay } from "./modal-overlay";
import { breakpoints, colors, fonts, radius, semantic, shadow, space, typography } from "./theme";

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
  semantic,
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
  /** 浮层标题：与页面 H1 同一档字阶（22/32）。 */
  title: { color: colors.heading, ...typography.h1 },
  heading: { color: colors.heading, ...typography.heading },
  /** 白纸卡片：1px 描边 + 8px 圆角，靠描边与留白建立层级（无阴影）。 */
  card: {
    backgroundColor: semantic.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: semantic.border,
    padding: space.md,
  },
  divider: { height: 1, backgroundColor: semantic.border, marginVertical: space.sm },
  input: {
    borderWidth: 1,
    borderColor: semantic.input,
    borderRadius: radius.field,
    paddingHorizontal: space.sm,
    paddingVertical: 8,
    color: semantic.foreground,
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: semantic.card,
    minHeight: 36,
    fontFamily: fonts.sans,
  },
  field: { gap: 6, marginBottom: space.sm },
  /** 表单字段标签：12/18 w500，供 Field 与自定义字段（如带预览的输入区）共用。 */
  fieldLabel: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
    color: semantic.foreground,
  },
  /** 按钮：6px 圆角、无冗余描边，高度 34（sm 28 / lg 40），触控可达 44。 */
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 34,
    paddingVertical: 6,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: "transparent",
  },
  buttonSm: { minHeight: 28, paddingVertical: 4, paddingHorizontal: 10 },
  buttonLg: { minHeight: 40, paddingVertical: 9, paddingHorizontal: 16 },
  buttonIcon: { width: 34, height: 34, minHeight: 34, paddingHorizontal: 0, paddingVertical: 0 },
  /** shadcn variant → 表面色，全部复用既有主题色。 */
  buttonDefault: { backgroundColor: semantic.action, borderColor: semantic.action },
  buttonSecondary: { backgroundColor: semantic.secondary, borderColor: semantic.secondary },
  buttonOutline: { backgroundColor: semantic.card, borderColor: semantic.border },
  buttonGhost: { backgroundColor: "transparent", borderColor: "transparent" },
  buttonDestructive: { backgroundColor: colors.errorSoft, borderColor: colors.errorSoft },
  buttonLink: { backgroundColor: "transparent", borderColor: "transparent", paddingHorizontal: 4 },
  buttonHoverDefault: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  buttonHoverMuted: { backgroundColor: semantic.accent },
  /** 兼容既有引用的旧样式名。 */
  primary: { backgroundColor: colors.primaryAction, borderColor: colors.primaryAction },
  secondary: { backgroundColor: colors.paper, borderColor: colors.line },
  dangerSurface: { backgroundColor: colors.errorSoft, borderColor: colors.errorSoft },
  buttonText: { fontSize: 13, fontWeight: "500", fontFamily: fonts.sans },
  buttonTextSm: { fontSize: 12 },
  buttonTextLg: { fontSize: 14 },
  /** RN 没有 outline，用 1px ring 色描边表达 focus / focus-visible。 */
  focusRing: { borderColor: semantic.ring },
  /** 徽标：4px 圆角 + 紧凑内距，对应 shadcn Badge 的 secondary 形态。 */
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.badge,
    borderWidth: 1,
    borderColor: "transparent",
    alignSelf: "flex-start",
    backgroundColor: semantic.secondary,
  },
  chipOutline: { backgroundColor: "transparent", borderColor: semantic.border },
  chipText: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    fontWeight: "500",
    color: semantic.mutedForeground,
    fontFamily: fonts.sans,
  },
  /** 图标按钮：默认 ghost，仅在 hover / pressed 时出现一层极浅的底。 */
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  iconButtonHover: { backgroundColor: colors.overlay1 },
  iconButtonPressed: { backgroundColor: colors.overlay2 },
  iconButtonOutline: { backgroundColor: semantic.card, borderColor: semantic.border },
  iconButtonSecondary: { backgroundColor: semantic.secondary },
  /** 触控目标底座：36×36（可配合 hitSlop 达到 44）。 */
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: semantic.secondary,
  },
  /** 任务行 / 列表图标底座：36×36 / r6。 */
  glyph: {
    width: 36,
    height: 36,
    borderRadius: radius.field,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: semantic.secondary,
  },
  /** 错误提示：shadcn Alert 的紧凑形态，图标 + 文本 + 左侧语义条。 */
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    borderRadius: radius.card,
    borderLeftWidth: 2,
    borderLeftColor: semantic.destructive,
    backgroundColor: colors.errorSoft,
    marginVertical: space.xs,
  },
  modalShade: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: space.lg,
  },
  /** 弹窗面板：白底 + 1px 描边 + 12px 圆角，最大宽度对齐设计库 .panel 的 760。 */
  sheet: {
    backgroundColor: semantic.popover,
    borderRadius: radius.sheet,
    width: "100%",
    maxWidth: 760,
    maxHeight: "94%",
    flexShrink: 1,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: semantic.border,
  },
  /** 数据/度量数字：等宽字体 + tabular 数字，对齐 TraeWork 数值展示规范。 */
  metric: { fontVariant: ["tabular-nums"] as const, fontFamily: fonts.number },
});
/** 悬停/按下/焦点状态：RN 的类型只声明了 pressed，这里显式补上 hovered 与 focused。 */
export type HoverPressableState = { pressed: boolean; hovered: boolean; focused?: boolean };

type HoverPressableProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle> | ((state: HoverPressableState) => StyleProp<ViewStyle>);
};

/**
 * 带 hover 状态的可点击容器。
 *
 * react-native-web 的 Pressable 内部会算 hovered，但 RN 的类型没有暴露；
 * 这里自行记录悬停状态再交给样式函数，原生触摸端 hovered 恒为 false。
 */
export function HoverPressable({
  style,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  ...props
}: HoverPressableProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      {...props}
      style={
        typeof style === "function" ? ({ pressed }) => style({ pressed, hovered, focused }) : style
      }
      onHoverIn={(event) => {
        setHovered(true);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        onHoverOut?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
    />
  );
}

/** shadcn 风格按钮变体；旧 API（primary / danger）会自动映射到对应变体。 */
export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "link";

/** shadcn 风格按钮尺寸；旧 API（small）映射到 sm。 */
export type ButtonSize = "default" | "sm" | "lg" | "icon";

const buttonSurface: Record<ButtonVariant, ViewStyle> = {
  default: s.buttonDefault,
  secondary: s.buttonSecondary,
  outline: s.buttonOutline,
  ghost: s.buttonGhost,
  destructive: s.buttonDestructive,
  link: s.buttonLink,
};

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
  variant,
  size,
  style,
  hitSlop,
}: {
  children: ReactNode;
  onPress: () => void;
  icon?: IconComponent;
  /** 兼容旧调用：等价于 variant="default"。 */
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  /** busy 时不显示加载动画、不降低透明度，仅保留防重复点击，避免文字产生动态效果。 */
  quietBusy?: boolean;
  /** 兼容旧调用：等价于 size="sm"。 */
  small?: boolean;
  /** 兼容旧调用：等价于 variant="destructive"。 */
  danger?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  style?: ViewStyle;
  /** 扩大触控热区（视觉尺寸不变）；小尺寸按钮用于达到 44px 触控目标。 */
  hitSlop?: number;
}) {
  const resolvedVariant: ButtonVariant =
    variant ?? (primary ? "default" : danger ? "destructive" : "outline");
  const resolvedSize: ButtonSize = size ?? (small ? "sm" : "default");
  const color =
    resolvedVariant === "destructive"
      ? semantic.destructive
      : resolvedVariant === "default"
        ? semantic.primaryForeground
        : resolvedVariant === "link"
          ? colors.link
          : semantic.foreground;

  return (
    <HoverPressable
      accessibilityRole="button"
      disabled={disabled || busy}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed, hovered, focused }) => [
        s.button,
        buttonSurface[resolvedVariant],
        resolvedSize === "sm" && s.buttonSm,
        resolvedSize === "lg" && s.buttonLg,
        resolvedSize === "icon" && s.buttonIcon,
        // 悬停只做一档底色变化；主按钮走深色变体，其余走 accent。
        !disabled &&
          !busy &&
          hovered &&
          (resolvedVariant === "default" ? s.buttonHoverDefault : s.buttonHoverMuted),
        // 键盘导航时的 focus-visible 等价物：只换 1px ring 描边。
        focused && s.focusRing,
        style,
        {
          opacity: disabled ? 0.4 : busy && !quietBusy ? 0.75 : pressed ? 0.9 : 1,
        },
      ]}
    >
      {busy && !quietBusy ? (
        <ActivityIndicator color={color} size="small" />
      ) : Icon ? (
        <Icon size={resolvedSize === "lg" ? 16 : 14} color={color} />
      ) : null}
      <Text
        style={[
          s.buttonText,
          resolvedSize === "sm" && s.buttonTextSm,
          resolvedSize === "lg" && s.buttonTextLg,
          { color },
        ]}
      >
        {children}
      </Text>
    </HoverPressable>
  );
}
export function IconButton({
  icon: Icon,
  label,
  onPress,
  size = 34,
  variant = "ghost",
  disabled = false,
}: {
  icon: IconComponent;
  label: string;
  onPress: () => void;
  /** Touch target; pass 44 for dense table rows that need a larger hit area. */
  size?: number;
  variant?: "ghost" | "outline" | "secondary";
  disabled?: boolean;
}) {
  return (
    <HoverPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={disabled ? undefined : 6}
      onPress={onPress}
      style={({ pressed, hovered, focused }) => [
        s.iconButton,
        { width: size, height: size },
        variant === "outline" && s.iconButtonOutline,
        variant === "secondary" && s.iconButtonSecondary,
        !disabled && pressed && s.iconButtonPressed,
        !disabled && variant === "ghost" && hovered && !pressed && s.iconButtonHover,
        focused && s.focusRing,
        { opacity: disabled ? 0.35 : 1 },
      ]}
    >
      <Icon size={size >= 40 ? 18 : 16} color={semantic.mutedForeground} />
    </HoverPressable>
  );
}
export function Card({
  children,
  variant = "default",
  style,
}: {
  children: ReactNode;
  /** shadcn 卡片形态：默认白纸描边，muted 浅底，ghost 仅保留留白。 */
  variant?: "default" | "muted" | "ghost";
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        s.card,
        variant === "muted" && { backgroundColor: semantic.muted, borderColor: "transparent" },
        variant === "ghost" && { backgroundColor: "transparent", borderColor: "transparent" },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Chip({
  children,
  tint,
  variant = "default",
}: {
  children: ReactNode;
  /** 兼容旧调用：自定义底色。 */
  tint?: string;
  variant?: "default" | "secondary" | "outline";
}) {
  return (
    <View
      style={[
        s.chip,
        variant === "secondary" && { backgroundColor: semantic.muted },
        variant === "outline" && s.chipOutline,
        tint ? { backgroundColor: tint } : null,
      ]}
    >
      <Text style={s.chipText}>{children}</Text>
    </View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={semantic.placeholder}
        accessibilityLabel={label}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        style={[
          s.input,
          // RN 没有 outline，聚焦只换 1px ring 描边，保留输入框的纸面感。
          focused && s.focusRing,
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
    <View style={{ alignItems: "center", paddingVertical: 32, paddingHorizontal: 24, gap: 6 }}>
      <Icon size={22} color={semantic.mutedForeground} />
      <Text style={[s.heading, { fontSize: 14, marginTop: 6 }]}>{title}</Text>
      <Text
        style={[s.small, { textAlign: "center", maxWidth: 340, color: semantic.mutedForeground }]}
      >
        {detail}
      </Text>
      {children}
    </View>
  );
}
export function ErrorNotice({ error }: { error?: string }) {
  return error ? (
    <View accessibilityRole="alert" style={s.error}>
      <AlertTriangle size={15} color={semantic.destructive} />
      <Text
        style={[s.text, { flex: 1, color: semantic.destructive, fontSize: 13, lineHeight: 20 }]}
      >
        {error}
      </Text>
    </View>
  ) : null;
}
export function Sheet({
  title,
  titleIcon,
  subtitle,
  headerAction,
  children,
  onClose,
  wide,
  medium,
  narrow,
  small,
  fullscreen,
  dismissOnBackdrop = true,
  botLayout = false,
}: {
  title: string;
  /** 标题左侧装饰元素（如品牌 Logo），展示于标题文字之前。 */
  titleIcon?: ReactNode;
  subtitle?: string;
  /** 标题栏右侧操作（如「一键已读」），排在关闭按钮之前。 */
  headerAction?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  /** 中等浮层：比默认略宽，用于概览型设置面板。 */
  medium?: boolean;
  /** 紧凑阅读浮层：用于单张领悟卡等短内容，避免桌面端出现过宽留白。 */
  narrow?: boolean;
  /** 小型选择浮层：桌面端收窄，移动端保留左右留白。 */
  small?: boolean;
  /** 阅读模式：手机全屏，桌面使用大尺寸居中对话框（如研究产物详情）。 */
  fullscreen?: boolean;
  /** 点击弹窗外的深色背板区域时是否关闭弹窗，默认开启。 */
  dismissOnBackdrop?: boolean;
  /** Bot workspace spacing; uses a bottom sheet only on compact screens. */
  botLayout?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const compact = width < breakpoints.mobile;
  const bottomSheet = compact && !fullscreen;
  const edgeToEdge = compact && fullscreen;
  const mobileBotLayout = bottomSheet && botLayout;
  return (
    <ModalOverlay transition={bottomSheet ? "bottom" : "fade"} onRequestClose={onClose}>
      {/* 背板：点击深色区域关闭弹窗（dismissOnBackdrop 可关闭此行为） */}
      <Pressable
        onPress={dismissOnBackdrop ? onClose : undefined}
        style={[
          s.modalShade,
          !compact && { padding: space.lg },
          bottomSheet && { padding: 0, justifyContent: "flex-end" },
          edgeToEdge && { padding: 0 },
        ]}
      >
        {/* 弹窗面板：自身拦截点击，避免面板内点击冒泡到背板导致误关 */}
        <Pressable
          testID="sheet-dialog"
          accessibilityViewIsModal
          onPress={(e) => e.stopPropagation()}
          style={[
            s.sheet,
            !compact && {
              maxHeight: Math.max(0, height - space.xl * 2),
              borderRadius: radius.sheet,
              ...shadow.sheet,
            },
            wide && { maxWidth: 1050 },
            medium && { maxWidth: 680 },
            narrow && { maxWidth: 560 },
            small && { maxWidth: 440 },
            bottomSheet &&
              small && {
                width: Math.min(width - space.md * 2, 440),
                maxHeight: "88%",
                marginBottom: Math.max(insets.bottom, space.md),
                borderBottomLeftRadius: radius.sheet,
                borderBottomRightRadius: radius.sheet,
              },
            bottomSheet &&
              !small && {
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                paddingBottom: Math.max(insets.bottom, 12),
                maxHeight: "94%",
              },
            mobileBotLayout && {
              maxWidth: agentLayout.sheetMaxWidth,
              maxHeight: "91%",
              borderRadius: radius.sheet * 2,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              borderBottomWidth: 0,
            },
            fullscreen &&
              !compact && {
                maxWidth: 1200,
                height: "100%",
              },
            edgeToEdge && {
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
          {bottomSheet && (
            <View
              testID="sheet-drag-handle"
              style={{
                alignSelf: "center",
                width: 28,
                height: 3,
                borderRadius: radius.full,
                backgroundColor: colors.lineStrong,
                marginTop: 8,
              }}
            />
          )}
          <View
            style={[
              s.between,
              {
                padding: space.md,
                borderBottomWidth: 1,
                borderBottomColor: semantic.border,
                flexShrink: 0,
              },
              mobileBotLayout && {
                paddingTop: 11,
                paddingBottom: 16,
                paddingHorizontal: 20,
                borderBottomWidth: 0,
                minHeight: 61,
              },
            ]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <View style={s.row}>
                {!!titleIcon && <View style={{ marginRight: 10 }}>{titleIcon}</View>}
                <Text
                  numberOfLines={2}
                  style={[
                    s.title,
                    // shadcn DialogTitle：18/26 w600，比页面 H1 收敛一档。
                    { fontSize: 18, lineHeight: 26, fontWeight: "600" },
                    compact && { fontSize: 17, lineHeight: 24 },
                    // 标题带品牌 Logo 时再收紧一档，与左侧图形保持和谐。
                    titleIcon ? { fontSize: 16, lineHeight: 22 } : undefined,
                    botLayout && {
                      fontSize: compact ? 16 : 18,
                      lineHeight: compact ? 22 : 26,
                      fontFamily: fonts.sans,
                      fontWeight: "600",
                    },
                  ]}
                >
                  {title}
                </Text>
              </View>
              {!!subtitle && (
                <Text style={[s.muted, { fontSize: 12, lineHeight: 18 }]}>{subtitle}</Text>
              )}
            </View>
            {!!headerAction && <View style={{ marginRight: 8 }}>{headerAction}</View>}
            <IconButton icon={X} label={t("ui.closeDetails")} onPress={onClose} size={32} />
          </View>
          <ScrollView
            testID="sheet-scroll-content"
            keyboardShouldPersistTaps="handled"
            style={[{ flexShrink: 1, minHeight: 0 }, fullscreen && { flex: 1 }]}
            contentContainerStyle={
              fullscreen
                ? { flexGrow: 1, padding: space.md }
                : mobileBotLayout
                  ? { paddingHorizontal: space.lg, paddingBottom: 30 }
                  : { padding: space.md }
            }
          >
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </ModalOverlay>
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
          width: 16,
          height: 16,
          borderRadius: radius.micro,
          borderWidth: 1,
          borderColor: checked ? semantic.primary : colors.lineStrong,
          backgroundColor: checked ? semantic.primary : semantic.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <Check size={12} color={semantic.primaryForeground} strokeWidth={2} />}
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
    <View style={[s.between, { marginBottom: space.sm, gap: space.xs }, style]}>
      <View style={[s.row, { gap: 6, flexShrink: 1, minWidth: 0 }]}>
        <Text
          style={{ fontSize: 13, lineHeight: 20, fontWeight: "600", color: semantic.foreground }}
        >
          {title}
        </Text>
        {count !== undefined && (
          <View
            style={{
              minWidth: 16,
              paddingHorizontal: 4,
              paddingVertical: 1,
              borderRadius: radius.badge,
              backgroundColor: semantic.secondary,
              alignItems: "center",
            }}
          >
            <Text style={[s.metric, { fontSize: 10, lineHeight: 16, color: colors.muted }]}>
              {count}
            </Text>
          </View>
        )}
      </View>
      {actions ? (
        actions
      ) : action && onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} style={[s.row, { gap: 3 }]}>
          <Text style={[s.small, { color: colors.link }]}>{action}</Text>
          <ArrowUpRight size={12} color={colors.link} />
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
        {
          paddingVertical: 8,
          paddingHorizontal: 6,
          marginHorizontal: -6,
          gap: 10,
          borderRadius: radius.control,
        },
        pressed && { backgroundColor: colors.overlay1 },
      ]}
    >
      <View
        style={[
          s.iconButton,
          s.iconButtonOutline,
          { width: 28, height: 28 },
          tint ? { backgroundColor: tint } : null,
        ]}
      >
        <Icon size={15} color={semantic.foreground} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.text, { fontWeight: "500" }]}>{title}</Text>
        {!!detail && <Text style={s.small}>{detail}</Text>}
      </View>
      <ChevronRight size={14} color={semantic.subtleForeground} />
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
