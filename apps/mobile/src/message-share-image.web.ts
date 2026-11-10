/**
 * Web 端「分享为图片」：用 html2canvas-pro 把目标 DOM 节点渲染成 PNG。
 *
 * 优先走浏览器原生分享（移动端可直接分享到微信等），不支持时降级为下载文件。
 * html2canvas-pro 按需懒加载，避免原生打包时被打进 bundle。
 */
import type { RefObject } from "react";
import type { View } from "react-native";

export type ShareImageResult = "shared" | "downloaded" | "unavailable";

/** 把指定 View（对应一个 DOM 节点）渲染为 PNG 并分享或下载。 */
export async function captureAndShare(viewRef: RefObject<View | null>): Promise<ShareImageResult> {
  if (!viewRef.current || typeof document === "undefined") return "unavailable";

  const domNode = resolveDomNode(viewRef.current);
  if (!domNode) return "unavailable";

  const html2canvas = (await import("html2canvas-pro")).default;
  const canvas = await html2canvas(domNode, {
    scale: 2,
    backgroundColor: "#FFFFFF",
    useCORS: true,
    logging: false,
  });

  const fileName = `lingwu-${Date.now()}.png`;

  // 移动端 / 支持文件分享的浏览器：直接唤起系统分享面板。
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data?: ShareData) => Promise<void>;
  };
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob && typeof nav.share === "function") {
    const file = new File([blob], fileName, { type: "image/png" });
    const shareData: ShareData = { files: [file], title: document.title || "灵悟" };
    if (!nav.canShare || nav.canShare(shareData)) {
      try {
        await nav.share(shareData);
        return "shared";
      } catch (error) {
        // 用户主动取消不算失败。
        if ((error as { name?: string })?.name === "AbortError") return "shared";
        // 其他错误降级为下载。
      }
    }
  }

  const dataUrl = canvas.toDataURL("image/png");
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return "downloaded";
}

/**
 * 取回 View ref 对应的真实 DOM 节点。
 *
 * react-native-web 的 `View` 通过 `forwardRef` 直接把 DOM 元素交给 ref，
 * 所以 ref.current 本身就是 `HTMLElement`（上面额外挂了 measure 等方法）。
 * 旧版本或第三方包装层可能把节点藏在内部字段里，这里做多路兼容。
 */
function resolveDomNode(view: unknown): HTMLElement | null {
  if (view === null || view === undefined) return null;
  if (typeof HTMLElement !== "undefined" && view instanceof HTMLElement) return view;

  const candidate = view as Record<string, unknown>;
  for (const key of ["_node", "node", "_element", "element", "ref", "_hostNode"]) {
    const value = candidate[key];
    if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) return value;
  }

  // 兜底：从 React fiber 取 stateNode。
  const internals = candidate._reactInternals as { stateNode?: unknown } | undefined;
  const stateNode = internals?.stateNode;
  if (typeof HTMLElement !== "undefined" && stateNode instanceof HTMLElement) return stateNode;
  return null;
}
