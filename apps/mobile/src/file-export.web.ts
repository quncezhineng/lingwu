/**
 * 文件资料的「分享 / 保存」——浏览器端实现。
 *
 * 资料库里的文件（PDF、Word、CSV……）都挂在需要鉴权的 `/api/files/:id/content`
 * 下，直接把链接丢给别人打不开，所以分享必须先带着 token 取回内容：
 *
 * - 保存：fetch 成 Blob 后用 `<a download>` 落到本地下载目录；
 * - 分享：优先用 Web Share API 分享文件本身（手机浏览器、部分桌面浏览器），
 *   不可用时退回复「先下载，再自己发送」，并把结果告诉调用方。
 */
import type { Artifact } from "../../../packages/domain/src";
import type { LingWuApi } from "./api";
import { fileMimeType } from "./file-kind";

/** 带鉴权取回文件内容；不经过 `<a href>`，避免 401 页面被当成文件下载。 */
async function readBlob(api: LingWuApi, file: Artifact): Promise<Blob> {
  const response = await fetch(api.url(file.url || `/api/files/${file.id}/content`), {
    headers: { Authorization: `Bearer ${api.token}` },
  });
  if (!response.ok) throw new Error(`Could not read this file (${response.status}).`);
  return response.blob();
}

function saveBlob(blob: Blob, name: string) {
  if (typeof document === "undefined") throw new Error("Downloads are unavailable.");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name || "document";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 保存到浏览器下载目录，返回文件名。 */
export async function saveRemoteFile(api: LingWuApi, file: Artifact): Promise<string> {
  const blob = await readBlob(api, file);
  saveBlob(blob, file.name);
  return file.name;
}

/**
 * 分享文件本身。返回 `"shared"` 表示已交给系统分享面板，
 * `"saved"` 表示浏览器不支持分享文件、已改为保存。
 */
export async function shareRemoteFile(api: LingWuApi, file: Artifact): Promise<"shared" | "saved"> {
  const blob = await readBlob(api, file);
  const shareFile = new File([blob], file.name, { type: fileMimeType(file) });
  const navigatorApi = typeof navigator === "undefined" ? undefined : navigator;
  if (navigatorApi?.share && navigatorApi.canShare?.({ files: [shareFile] })) {
    try {
      await navigatorApi.share({ files: [shareFile], title: file.name });
      return "shared";
    } catch (error) {
      // 用户主动取消不算失败，也不再退回下载。
      if ((error as { name?: string })?.name === "AbortError") return "shared";
    }
  }
  saveBlob(blob, file.name);
  return "saved";
}
