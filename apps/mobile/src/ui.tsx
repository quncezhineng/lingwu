import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Modal,
  Platform,
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
/**
 * 灵悟设计令牌。
 *
 * 视觉方向来自 v7 Demo 的工作台：暖灰画布、白色纸面、细描边、克制的蓝色
 * 强调和衬线标题。行情涨跌仍遵循中国市场惯例（红涨绿跌），但品牌操作色
 * 不再使用紫色。
 */
export const colors = {
  canvas: "#F8F8F8", // 页面画布
  paper: "#FFFFFF", // 卡片、输入框与浮层纸面
  surface: "#F4F4F4",
  tertiary: "#EEEEEE",
  text: "#303030",
  muted: "#696969",
  faint: "#8A8A8A",
  disabled: "#B0B0B0",
  line: "#E6E6E6",
  lineStrong: "#D6D6D6",
  overlay1: "rgba(48,48,48,0.045)",
  overlay2: "rgba(48,48,48,0.075)",
  overlay3: "rgba(48,48,48,0.11)",
  primary: "#3A83F7",
  onPrimary: "#FFFFFF",
  primaryStrong: "#245FC4",
  primaryAction: "#2F6FD8",
  sky: "#EDF3FF",
  green: "rgba(33,125,98,0.10)",
  success: "#217D62",
  orange: "rgba(211,126,35,0.11)",
  danger: "#C4384B",
  errorSoft: "rgba(196,56,75,0.09)",
  modalShade: "rgba(24,24,24,0.32)",
  // 行情语义色：遵循中国市场惯例（涨红跌绿），与 danger/success 同色值但语义独立，
  // 避免行情涨跌被误读为「错误 / 成功」状态。
  marketUp: "#C4384B",
  marketDown: "#217D62",
  marketFlat: "#767676",
  marketUpSurface: "rgba(196,56,75,0.08)",
  marketDownSurface: "rgba(33,125,98,0.08)",
  // 文本专用深色变体：上两者直接作为正文色时对白底只有 ~3.9:1 / ~3.0:1，
  // 这里压深到 ≥4.5:1（WCAG AA 正文），图形与浅底仍用上面的原始色。
  marketUpText: "#B42F43",
  marketDownText: "#176A52",
  alertVolume: "#C47B24",
  alertVolumeText: "#8C520E",
  alertVolumeSurface: "rgba(196,123,36,0.10)",
};

/** Web 端优先使用中文系统字体；原生端保持在平台字体回退内。 */
export const fonts = {
  sans: Platform.select({
    web: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    ios: "PingFang SC",
    android: "sans-serif",
    default: "sans-serif",
  }),
  serif: Platform.select({
    web: '"Noto Serif SC", "Songti SC", STSong, Georgia, serif',
    ios: "Songti SC",
    android: "serif",
    default: "serif",
  }),
  number: Platform.select({
    web: 'Georgia, "Times New Roman", serif',
    ios: "Georgia",
    android: "serif",
    default: "serif",
  }),
} as const;

/**
 * 第三方服务品牌色。
 *
 * 仅用于 Connections 列表里的服务识别（Gmail / Google 日历 / 浏览器 / OpenBot），
 * 让用户一眼认出对接的是哪个外部服务；它们不参与品牌主操作，
 * 避免外部服务色与 LingWu 的蓝色操作层级混淆。
 * `surface` 是配套的浅色底座，用于图标背板。
 */
export const serviceBrands = {
  gmail: { fg: "#EA5B4D", surface: "rgba(234,91,77,0.12)" },
  googleCalendar: { fg: "#4285F4", surface: "rgba(66,133,244,0.12)" },
  browser: { fg: "#1987CF", surface: "rgba(25,135,207,0.12)" },
  openbot: { fg: "#6866A6", surface: "rgba(104,102,166,0.12)" },
} as const;
export const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  text: { color: colors.text, fontSize: 15, lineHeight: 23, fontFamily: fonts.sans },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21, fontFamily: fonts.sans },
  small: { color: colors.muted, fontSize: 11, lineHeight: 17, fontFamily: fonts.sans },
  label: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontFamily: fonts.sans,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.7,
    fontFamily: fonts.serif,
  },
  heading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.25,
    fontFamily: fonts.sans,
  },
  /** 白纸卡片：轻描边、10px 圆角，避免过多浮层与阴影。 */
  card: {
    backgroundColor: colors.paper,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 16 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.paper,
    minHeight: 44,
    fontFamily: fonts.sans,
  },
  field: { gap: 7, marginBottom: 16 },
  /** 按钮：轻圆角 + 1px 描边，默认高度 38（small 32）。 */
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    minHeight: 38,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
  },
  primary: { backgroundColor: colors.primaryAction, borderColor: colors.primaryAction },
  secondary: { backgroundColor: colors.surface, borderColor: colors.line },
  dangerSurface: { backgroundColor: colors.errorSoft, borderColor: colors.errorSoft },
  buttonText: { fontSize: 14, fontWeight: "600", fontFamily: fonts.sans },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    fontFamily: fonts.sans,
  },
  /** 图标底座：44×44 / 13px 圆角（设计库 App Card 的 .ic 规格）。 */
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  error: {
    padding: 16,
    borderRadius: 10,
    backgroundColor: colors.errorSoft,
    marginVertical: 10,
    gap: 4,
  },
  modalShade: {
    flex: 1,
    backgroundColor: colors.modalShade,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  /** 弹窗面板：白底 + 1px 描边 + 14px 圆角，最大宽度对齐设计库 .panel 的 760。 */
  sheet: {
    backgroundColor: colors.paper,
    borderRadius: 12,
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
        <Icon size={15} strokeWidth={1.8} color={color} />
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
}: {
  icon: IconComponent;
  label: string;
  onPress: () => void;
  /** Touch target; pass 44 for dense table rows that need a larger hit area. */
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 10,
          backgroundColor: pressed ? colors.overlay1 : "transparent",
        },
      ]}
    >
      <Icon size={size >= 44 ? 20 : 18} strokeWidth={1.8} color={colors.muted} />
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
    <View style={{ alignItems: "center", padding: 40, gap: 13 }}>
      <View style={[s.iconBox, { width: 55, height: 55, borderRadius: 14 }]}>
        <Icon size={24} strokeWidth={1.8} color={colors.primary} />
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
              { padding: compact ? 16 : 20, borderBottomWidth: 1, borderBottomColor: colors.line },
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
                ? { flexGrow: 1, padding: compact ? 16 : 20 }
                : { padding: compact ? 16 : 20 }
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
          borderColor: checked ? colors.primary : colors.lineStrong,
          backgroundColor: checked ? colors.primary : colors.paper,
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
  icon: IconComponent;
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
      <View style={[s.iconBox, { backgroundColor: tint || colors.surface }]}>
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
  // sand/lilac 是历史头像遗留值，保持原样以兼容已存数据；默认底色跟随品牌浅蓝。
  const palette =
    {
      sky: colors.sky,
      sand: "#FAF0DF",
      lilac: "#F1ECF9",
    }[variant ?? "sky"] ?? colors.sky;
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
