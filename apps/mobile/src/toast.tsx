import type { ReactNode } from "react";
import { Pressable, type StyleProp, Text, View, type ViewStyle } from "react-native";
import { useTranslation } from "./i18n";
import { Check, X } from "./icons";
import { colors, radius, space, typography } from "./theme";
export type ToastState = {
  text: string;
  /** 可撤销动作（如「撤销」）；不传则是纯提示。 */
  action?: { label: string; onPress: () => void };
};

/**
 * 统一提示条：深色底 + 3.2s 自动消失 + 可选撤销。
 *
 * - 位置固定在底栏上方，`aria-live=polite` 让读屏播报；
 * - 时长与样式由调用方（App）统一控制，页面里不再各写一份；
 * - 图标区留给调用方扩展（默认对勾），不在组件里写业务文案。
 */
export function Toast({
  toast,
  onDismiss,
  icon,
  style,
}: {
  toast?: ToastState;
  onDismiss: () => void;
  /** 左侧图标，默认对勾。 */
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  if (!toast) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[
        { position: "absolute", bottom: 94, left: 20, right: 20, alignItems: "center" },
        style,
      ]}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          padding: 14,
          backgroundColor: colors.toast,
          borderRadius: radius.field,
          maxWidth: 560,
        }}
      >
        {icon ?? <Check size={16} color={colors.onToast} />}
        <Text
          numberOfLines={2}
          style={{ ...typography.body, color: colors.onToast, flexShrink: 1 }}
        >
          {toast.text}
        </Text>
        {!!toast.action && (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              toast.action?.onPress();
              onDismiss();
            }}
          >
            <Text style={[typography.caption, { color: colors.accentLine, fontWeight: "600" }]}>
              {toast.action.label}
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("app.dismissNotification")}
          hitSlop={8}
          onPress={onDismiss}
          style={{ padding: 2 }}
        >
          <X size={16} color={colors.onToast} />
        </Pressable>
      </View>
    </View>
  );
}
