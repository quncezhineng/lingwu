/**
 * 消息操作栏的剪贴板与分享能力。
 *
 * 通过 Platform 判断走两套实现：
 * - Web：`navigator.clipboard` 与 `navigator.share`（不可用时退回复制文本）。
 * - 原生：`react-native` 的 `Share` API（系统分享面板）。
 *
 * 独立成模块是为了让「复制为 Markdown」这类纯文本能力可被单元测试直接引用。
 */
import { Platform, Share } from "react-native";

/** 把文本写入剪贴板。Web 走异步 Clipboard API，失败时降级到 execCommand。 */
export async function copyText(text: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // 非安全上下文或文档失焦时异步 API 会失败，继续走兜底。
      }
    }
    if (typeof document !== "undefined" && legacyCopy(text)) return;
    throw new Error("clipboard unavailable");
  }
  // 原生端：仓库未装 expo-clipboard，退回通过分享面板暴露文本。
  await Share.share({ message: text });
}

/**
 * 用隐藏 textarea + execCommand 复制。
 *
 * 旧浏览器或 http 非安全上下文下 `navigator.clipboard` 不可用，
 * 这是唯一可行的兜底路径；必须聚焦并与用户手势在同一任务内执行。
 */
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    const active = document.activeElement as HTMLElement | null;
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    textarea.remove();
    active?.focus?.();
    return ok;
  } catch {
    return false;
  }
}

/** 分享指定的公开链接（可附带摘要文本）。Web 优先系统分享，否则复制链接。 */
export async function shareLink(url: string, text = ""): Promise<"shared" | "copied"> {
  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(text ? { text, url } : { url });
        return "shared";
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return "shared";
      }
    }
    await copyText(url);
    return "copied";
  }
  await Share.share({ message: text ? `${text}\n\n${url}` : url });
  return "shared";
}

/** 分享文本 / 链接。Web 优先 `navigator.share`（带上当前页面链接），否则复制链接。 */
export async function shareText(text: string): Promise<"shared" | "copied"> {
  if (Platform.OS === "web") {
    const link =
      typeof window !== "undefined" && typeof window.location?.href === "string"
        ? window.location.href
        : "";
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(link ? { text, url: link } : { text });
        return "shared";
      } catch (error) {
        // 用户主动取消不算失败。
        if ((error as { name?: string })?.name === "AbortError") return "shared";
        // 其余错误（如桌面端不支持）降级为复制链接。
      }
    }
    await copyText(link || text);
    return "copied";
  }
  await Share.share({ message: text });
  return "shared";
}
