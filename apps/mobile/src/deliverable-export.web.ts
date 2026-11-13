/**
 * 交付物 Markdown / HTML 导出——浏览器端实现。
 *
 * 导出接口需要鉴权，所以先带 token 取回文本，再落成本地下载。
 */
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
  if (typeof document === "undefined") throw new Error("Downloads are unavailable.");
  const blob = new Blob([body], {
    type: format === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
