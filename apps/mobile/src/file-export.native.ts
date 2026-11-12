/**
 * 文件资料的「分享 / 保存」——原生端实现。
 *
 * iOS / Android 没有统一的「下载目录」概念，两个动作都走系统分享面板：
 * 先把文件按鉴权下载到缓存目录，再交给 `expo-sharing`，用户可以在面板里
 * 存到「文件」、发到微信，或用其他 App 打开。
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { Artifact } from "../../../packages/domain/src";
import type { LingWuApi } from "./api";
import { fileMimeType } from "./file-kind";

/** 文件名里出现路径分隔符会让写入失败，统一压成短横线。 */
function safeName(file: Artifact): string {
  const name = file.name.replace(/[\\/:*?"<>|\r\n\t]+/g, "-").trim();
  return name || file.id;
}

async function downloadToCache(api: LingWuApi, file: Artifact): Promise<string> {
  const target = `${FileSystem.cacheDirectory}${file.id}-${safeName(file)}`;
  const result = await FileSystem.downloadAsync(
    api.url(file.url || `/api/files/${file.id}/content`),
    target,
    { headers: { Authorization: `Bearer ${api.token}` } },
  );
  if (result.status && result.status >= 400) {
    throw new Error(`Could not read this file (${result.status}).`);
  }
  return target;
}

/** 下载后打开系统分享面板（用户可在此保存到设备），返回文件名。 */
export async function saveRemoteFile(api: LingWuApi, file: Artifact): Promise<string> {
  const target = await downloadToCache(api, file);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(target, { mimeType: fileMimeType(file) });
  return file.name;
}

/** 原生端的「分享」与「保存」共用分享面板。 */
export async function shareRemoteFile(api: LingWuApi, file: Artifact): Promise<"shared" | "saved"> {
  await saveRemoteFile(api, file);
  return "shared";
}
