import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * 系统「减少动态效果」偏好。
 *
 * 用于关闭循环动画、抽屉/弹窗过渡与开关滑块位移；默认 false，
 * 挂载后异步读取系统设置并订阅变化。
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
