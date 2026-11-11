import { Platform, type ViewStyle } from "react-native";
import { rubberBandOffset } from "./mobile-bots";
import { colors, semantic, shadow } from "./theme";

/** iOS 常见最小触控边长。手机首页悬浮按钮和对话页返回按钮都用这一档。 */
export const MOBILE_CONTROL = 44;

export function mobileGlassStyle(pressed: boolean): ViewStyle {
  return {
    backgroundColor: pressed ? colors.glassPressed : colors.glass,
    borderWidth: 1,
    borderColor: semantic.controlBorder,
    ...shadow.composer,
    ...(Platform.OS === "web"
      ? ({
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        } as ViewStyle)
      : null),
  };
}

/** 网页上的列表也能在没排满时被拖动，松手后弹回去，并且不显示滚动条。 */
export function attachWebRubberBand(node: HTMLElement): () => void {
  if (Platform.OS === "web" && typeof matchMedia === "function") {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.style.scrollbarWidth = "none";
      return () => undefined;
    }
  }
  node.style.overflowY = "auto";
  node.style.scrollbarWidth = "none";
  node.style.overscrollBehavior = "none";
  let origin = 0;
  let pulled = 0;
  let tracking = false;
  const reset = () => {
    if (pulled === 0) return;
    node.style.transition = "transform 480ms cubic-bezier(0.2, 0.8, 0.2, 1)";
    node.style.transform = "translate3d(0, 0, 0)";
    pulled = 0;
  };
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    origin = event.clientY;
    pulled = 0;
    tracking = true;
    node.style.transition = "none";
  };
  const onMove = (event: PointerEvent) => {
    if (!tracking) return;
    const delta = event.clientY - origin;
    if (Math.abs(delta) < 6) return;
    const atTop = node.scrollTop <= 0;
    const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
    const overflows = node.scrollHeight > node.clientHeight + 2;
    const pullDown = delta > 0 && (!overflows || atTop);
    const pullUp = delta < 0 && (!overflows || atBottom);
    if (!pullDown && !pullUp) {
      if (pulled !== 0) reset();
      return;
    }
    if (!node.hasPointerCapture(event.pointerId)) node.setPointerCapture(event.pointerId);
    pulled = rubberBandOffset(delta, node.clientHeight || 1);
    node.style.transform = `translate3d(0, ${pulled}px, 0)`;
    event.preventDefault();
  };
  const onUp = () => {
    if (!tracking) return;
    tracking = false;
    reset();
  };
  node.addEventListener("pointerdown", onDown);
  node.addEventListener("pointermove", onMove);
  node.addEventListener("pointerup", onUp);
  node.addEventListener("pointercancel", onUp);
  return () => {
    node.removeEventListener("pointerdown", onDown);
    node.removeEventListener("pointermove", onMove);
    node.removeEventListener("pointerup", onUp);
    node.removeEventListener("pointercancel", onUp);
  };
}

/**
 * 内容滚进顶部或底部悬浮区时逐渐透明，露出页面背景。
 * 渐变盖住按钮区并再多出一截；按钮放在滚动层外面，所以保持清晰。
 */
export function edgeFadeMask(top: number, bottom: number): ViewStyle {
  const image = `linear-gradient(to bottom, transparent 0px, #000 ${Math.round(top)}px, #000 calc(100% - ${Math.round(bottom)}px), transparent 100%)`;
  return {
    maskImage: image,
    WebkitMaskImage: image,
  } as ViewStyle;
}
