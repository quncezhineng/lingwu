import { ArrowUpRight, Check, ChevronRight, type LucideIcon, X } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { activeLocaleTag, useTranslation } from "./i18n";
import { tr } from "./i18n/translate";
/**
 * TraeWork Light 设计令牌映射（LingWu 重构图腾）：
 * - 页面白底（--bg-base-default），卡片灰面（--bg-base-secondary），层级与原主题相反。
 * - 品牌主色 #4B3FE3（--bg-brand），稀缺使用；选中/按下态走中性 overlay 阶梯。
 * - 边框/分割线用中性 alpha（--border-neutral-l1/l2），聚焦用对比色。
 * - 状态色对应 TraeWork --status-* 语义，含配套 surface 浅底。
 */
export const colors = {
  canvas: "#FFFFFF", // --bg-base-default 页面背景
  surface: "#F5F5F5", // --bg-base-secondary 卡片/灰面
  card: "#F5F5F5", // 兼容别名：卡片灰面
  tertiary: "#E5E5E5", // --bg-base-tertiary 次级灰面（次要按钮）
  text: "#171717", // --text-default 主文字
  muted: "#404040", // --text-secondary 次级文字
  faint: "#737373", // --text-tertiary 三级文字/占位符
  disabled: "#A1A1A1", // --text-disabled
  line: "rgba(115,115,115,0.12)", // --border-neutral-l1
  lineStrong: "rgba(115,115,115,0.18)", // --border-neutral-l2
  overlay1: "rgba(115,115,115,0.08)", // --bg-overlay-l1
  overlay2: "rgba(115,115,115,0.12)", // --bg-overlay-l2（悬停/选中）
  overlay3: "rgba(115,115,115,0.16)", // --bg-overlay-l3（按下）
  // 品牌（--bg-brand 系）。`primary`/`blue` 为实心填充（配 onPrimary 前景），
  // `primaryLight`/`blueDark` 为图标、链接与强调文字色。
  primary: "#4B3FE3",
  primaryLight: "#6A6FFF",
  onPrimary: "#FFFFFF",
  blue: "#4B3FE3",
  blueDark: "#6A6FFF",
  sky: "#E5EAFF", // brand-100 浅品牌底（状态 Chip 等小面积使用）
  lavender: "#E5EAFF", // 兼容别名 → brand-100
  green: "rgba(64,176,139,0.12)", // status-success-surface-l1
  success: "#15A877", // status-success-default
  orange: "rgba(226,121,0,0.12)", // status-warning-surface-l1
  danger: "#E8463A", // status-error-default
  errorSoft: "rgba(232,70,58,0.12)", // status-error-surface-l1
  modalShade: "rgba(23,23,23,0.4)", // 模态遮罩（弹窗/菜单背景）
};
export const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  text: { color: colors.text, fontSize: 15, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  small: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  label: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: { color: colors.text, fontSize: 23, fontWeight: "600", letterSpacing: -0.7 },
  heading: { color: colors.text, fontSize: 16, fontWeight: "600", letterSpacing: -0.25 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 0,
    borderColor: colors.line,
    padding: 20,
  },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 18 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    backgroundColor: "#FFF",
    minHeight: 45,
  },
  field: { gap: 7, marginBottom: 16 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 17,
    minHeight: 42,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primary: { backgroundColor: colors.blue },
  secondary: { backgroundColor: colors.tertiary },
  buttonText: { fontSize: 14, fontWeight: "600" },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipText: { fontSize: 10, fontWeight: "600", color: colors.muted },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  error: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.errorSoft,
    marginVertical: 10,
    gap: 4,
  },
  modalShade: {
    flex: 1,
    backgroundColor: "rgba(23,23,23,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderRadius: 12,
    width: "100%",
    maxWidth: 790,
    maxHeight: "94%",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
  },
  /** 数据/度量数字：等宽字体 + tabular 数字，对齐 TraeWork 数值展示规范。 */
  metric: { fontVariant: ["tabular-nums"] as const },
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
}: {
  children: ReactNode;
  onPress: () => void;
  icon?: LucideIcon;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  /** busy 时不显示加载动画、不降低透明度，仅保留防重复点击，避免文字产生动态效果。 */
  quietBusy?: boolean;
  small?: boolean;
  danger?: boolean;
  style?: ViewStyle;
}) {
  const color = danger ? colors.danger : primary ? colors.onPrimary : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        primary ? s.primary : s.secondary,
        small && { minHeight: 38, paddingVertical: 7, paddingHorizontal: 13 },
        style,
        {
          opacity: disabled ? 0.4 : busy && !quietBusy ? 0.75 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {busy && !quietBusy ? (
        <ActivityIndicator color={color} size="small" />
      ) : Icon ? (
        <Icon size={15} strokeWidth={1.8} color={color} />
      ) : null}
      <Text style={[s.buttonText, { color }]}>{children}</Text>
    </Pressable>
  );
}
export function IconButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          backgroundColor: pressed ? colors.overlay2 : "#FFFFFF",
        },
      ]}
    >
      <Icon size={20} strokeWidth={1.8} color={colors.text} />
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
  icon: LucideIcon;
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <View style={{ alignItems: "center", padding: 40, gap: 13 }}>
      <View style={[s.iconBox, { width: 55, height: 55, borderRadius: 12 }]}>
        <Icon size={24} strokeWidth={1.8} color={colors.blueDark} />
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
  fullscreen,
  dismissOnBackdrop = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  /** 全屏模式：弹窗铺满整个网页/屏幕（如研究产物详情），优先级最高。 */
  fullscreen?: boolean;
  /** 点击弹窗外的深色背板区域时是否关闭弹窗，默认开启。 */
  dismissOnBackdrop?: boolean;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const compact = width < 600;
  return (
    <Modal transparent animationType={compact ? "slide" : "fade"} visible onRequestClose={onClose}>
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
                borderRadius: 3,
                backgroundColor: colors.lineStrong,
                marginTop: 10,
              }}
            />
          )}
          <View
            style={[
              s.between,
              { padding: compact ? 20 : 24, borderBottomWidth: 1, borderBottomColor: colors.line },
            ]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.title}>{title}</Text>
              {!!subtitle && <Text style={s.muted}>{subtitle}</Text>}
            </View>
            <IconButton icon={X} label={t("ui.closeDetails")} onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={fullscreen ? { flex: 1 } : undefined}
            contentContainerStyle={
              fullscreen
                ? { flexGrow: 1, padding: compact ? 20 : 24 }
                : { padding: compact ? 20 : 24 }
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
          borderRadius: 5,
          borderWidth: 1,
          borderColor: checked ? colors.blue : colors.lineStrong,
          backgroundColor: checked ? colors.blue : "#FFF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <Check size={13} strokeWidth={1.8} color={colors.onPrimary} />}
      </View>
      <Text style={[s.text, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}
export function SectionHeading({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={[s.between, { marginBottom: 19 }]}>
      <Text style={s.heading}>{title}</Text>
      {action && onPress && (
        <Pressable accessibilityRole="button" onPress={onPress} style={[s.row, { gap: 5 }]}>
          <Text style={[s.small, { color: colors.text }]}>{action}</Text>
          <ArrowUpRight size={13} strokeWidth={1.8} color={colors.muted} />
        </Pressable>
      )}
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
  icon: LucideIcon;
  tint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        { paddingVertical: 13, gap: 14, borderRadius: 10 },
        pressed && { backgroundColor: colors.overlay1 },
      ]}
    >
      <View style={[s.iconBox, { backgroundColor: tint || colors.sky }]}>
        <Icon size={19} strokeWidth={1.8} color={colors.text} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[s.text, { fontWeight: "500" }]}>{title}</Text>
        {!!detail && <Text style={s.small}>{detail}</Text>}
      </View>
      <ChevronRight size={15} strokeWidth={1.8} color={colors.muted} />
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
export function Mascot({ size = 42, variant }: { size?: number; variant?: string }) {
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
  const palette =
    {
      sky: "#E5EAFF",
      sand: "#FAF0DF",
      lilac: "#F1ECF9",
    }[variant ?? "sky"] ?? "#E5EAFF";
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
