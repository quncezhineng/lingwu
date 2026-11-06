import { Modal, Pressable, type StyleProp, View, type ViewStyle } from "react-native";
import { Text } from "./app-text";
import { colors, radius, space, typography } from "./theme";
export type ToastState = {
  text: string;
  /** 可撤销动作（如「撤销」）；不传则是纯提示。 */
  action?: { label: string; onPress: () => void };
};

/**
 * 统一提示条：纯文字 + 3.2s 自动消失 + 可选撤销。
 *
 * - 通过透明 `Modal` 渲染，保证提示始终浮在所有弹窗之上（页面最上层），
 *   避免被内部的深色遮罩或面板遮挡（如模型管理弹窗内启停模型的反馈）；
 * - 不带前置图标与关闭按钮，仅保留正文（可撤销动作仍为文字按钮）；
 * - 位置固定在底栏上方，`aria-live=polite` 让读屏播报；
 * - 时长与样式由调用方（App）统一控制，页面里不再各写一份。
 */
export function Toast({
  toast,
  onDismiss,
  style,
}: {
  toast?: ToastState;
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (!toast) return null;
  return (
    <Modal transparent animationType="none" onRequestClose={onDismiss}>
      <View pointerEvents="box-none" style={{ flex: 1 }}>
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
          </View>
        </View>
      </View>
    </Modal>
  );
}
