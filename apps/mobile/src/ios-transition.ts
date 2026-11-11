import { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, Platform } from "react-native";
import { shouldCompletePop } from "./ios-gesture";
import { useReducedMotion } from "./use-reduced-motion";

export { shouldCompletePop };

/** iOS push 时长。曲线接近系统导航的减速。 */
export const IOS_PUSH_MS = 350;
export const iosPushEasing = Easing.bezier(0.2, 0.8, 0.2, 1);
/** 底下页面在被盖住时向左挪动的比例。 */
export const IOS_PARALLAX = 0.3;
export const IOS_DIM = 0.12;
export const IOS_EDGE_PX = 24;

export function webPrefersReducedMotion(): boolean {
  if (Platform.OS !== "web" || typeof matchMedia !== "function") return false;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 手机底部浮层：自下而上进入，关闭时向下退出。桌面不启用。 */
export function useIosSheetShift(enabled: boolean, travel: number, onClose: () => void) {
  const reduced = useReducedMotion() || webPrefersReducedMotion();
  const shift = useRef(new Animated.Value(enabled && !reduced ? travel : 0)).current;
  const closing = useRef(false);
  useEffect(() => {
    if (!enabled || reduced) return;
    shift.setValue(travel);
    const animation = Animated.timing(shift, {
      toValue: 0,
      duration: IOS_PUSH_MS,
      easing: iosPushEasing,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [enabled, reduced, shift, travel]);
  const dismiss = useCallback(() => {
    if (!enabled || reduced || closing.current) {
      onClose();
      return;
    }
    closing.current = true;
    Animated.timing(shift, {
      toValue: travel,
      duration: IOS_PUSH_MS,
      easing: iosPushEasing,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [enabled, onClose, reduced, shift, travel]);
  return { shift, dismiss, reduced };
}
