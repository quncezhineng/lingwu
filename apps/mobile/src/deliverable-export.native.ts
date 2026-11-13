/** 交付物 Markdown / HTML 导出——原生端实现，写入缓存后交给系统分享面板。 */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { LingWuApi } from "./api";

function safeName(title: string, fallback: string) {
  const name = title.replace(/[\\/:*?"<>|\r\n\t]+/g, "-").trim();
  return name || fallback;
}

export async function saveDeliverableExport(
  api: LingWuApi,
  id: string,
  format: "markdown" | "html",
  title: string,
): Promise<string> {
  const body = await api.text(
    `/api/deliverables/${encodeURIComponent(id)}/export?format=${format}`,
  );
  const name = `${safeName(title, id)}.${format === "html" ? "html" : "md"}`;
  const target = `${FileSystem.cacheDirectory}${id}-${name}`;
  await FileSystem.writeAsStringAsync(target, body, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(target, {
    mimeType: format === "html" ? "text/html" : "text/markdown",
  });
  return name;
}
