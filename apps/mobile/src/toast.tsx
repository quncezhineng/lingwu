import { useEffect } from "react";
import { Modal, Platform, Pressable, type StyleProp, View, type ViewStyle } from "react-native";
import { Text } from "./app-text";
import { colors, radius, space, typography } from "./theme";
export type ToastState = {
  text: string;
  /** 可撤销动作（如「撤销」）；不传则是纯提示。 */
  action?: { label: string; onPress: () => void };
};

/** 撤销按钮的标记：Web 端点在它上面时不能被「点击任意处关闭」抢走事件。 */
const TOAST_ACTION_TEST_ID = "toast-action";

/**
 * 统一提示条：纯文字 + 3.2s 自动消失 + 可选撤销。
 *
 * - 通过透明 `Modal` 渲染，保证提示始终浮在所有弹窗之上（页面最上层），
 *   避免被内部的深色遮罩或面板遮挡（如模型管理弹窗内启停模型的反馈）；
 * - 点击页面任意位置都能立即关闭：Web 端监听文档的 `pointerdown`，不拦截事件，
 *   点击仍会照常作用于页面元素；原生端用整层 `Pressable` 承接点击；
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
  /**
   * Web：页面任意位置按下即关闭。这里不铺满屏点击层，避免把用户的下一步操作吞掉
   * （例如连续给多个 Agent 安装技能时，第一次点击仍要生效）。
   */
  useEffect(() => {
    if (!toast || Platform.OS !== "web") return;
    const doc = globalThis.document;
    if (!doc) return;
    const dismiss = (event: Event) => {
      const target = event.target as Element | null;
      // 只放过「撤销」按钮：它在 pointerdown 之后还需要收到 click。
      if (target?.closest?.(`[data-testid="${TOAST_ACTION_TEST_ID}"]`)) return;
      onDismiss();
    };
    doc.addEventListener("pointerdown", dismiss);
    return () => doc.removeEventListener("pointerdown", dismiss);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const body = (
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
          gap: space.sm,
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: colors.toast,
          borderRadius: radius.field,
          maxWidth: 560,
        }}
      >
        <Text
          numberOfLines={2}
          style={{
            ...typography.meta,
            fontSize: 13,
            lineHeight: 20,
            color: colors.onToast,
            flexShrink: 1,
          }}
        >
          {toast.text}
        </Text>
        {!!toast.action && (
          <Pressable
            testID={TOAST_ACTION_TEST_ID}
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
  );

  return (
    <Modal transparent animationType="none" onRequestClose={onDismiss}>
      {Platform.OS === "web" ? (
        <View pointerEvents="box-none" style={{ flex: 1 }}>
          {body}
        </View>
      ) : (
        // 原生端的透明 Modal 本身会吃掉页面点击，这里把它转成「点任意处关闭」。
        <Pressable onPress={onDismiss} style={{ flex: 1 }}>
          {body}
        </Pressable>
      )}
    </Modal>
  );
}
