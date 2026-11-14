/**
 * 研究产物的分享与落盘。
 *
 * 对话里生成的报告（`AgentArtifact`）在三种位置出现：对话中的卡片、右侧「资料」
 * 列表、以及报告详情页。三处需要同一套动作，所以统一收在这个模块里：
 *
 * - 分享：把报告正文发布成公开网页（复用 `/api/shares`），再把链接交给系统分享面板；
 *   收件人无需登录即可阅读，与「对话消息分享为链接」保持同一套服务端能力。
 * - 导出：把 `artifact-export.ts` 生成的内容按平台落盘——Web 端用浏览器下载，
 *   原生端写入缓存后走系统分享面板（可存到「文件」）。
 *
 * 「导出什么」放在纯函数模块里，这里只负责平台与网络。
 */
import type { AgentArtifact } from "../../../packages/domain/src/agent";
import type { LingWuApi } from "./api";
import { type ArtifactExportFormat, artifactExportText, artifactFileName } from "./artifact-export";
import { renderArtifactMarkdown } from "./artifact-html";
import { saveTextFile } from "./csv-file";
import { statusLabel } from "./i18n/translate";
import { copyText } from "./message-share";
import { publishShare } from "./share-page";

/** 导出报告，返回实际使用的文件名（用于给用户提示）。 */
export async function exportArtifact(
  artifact: AgentArtifact,
  format: ArtifactExportFormat,
): Promise<string> {
  const name = artifactFileName(artifact, format);
  await saveTextFile(
    name,
    artifactExportText(artifact, format),
    format === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8",
  );
  return name;
}

/**
 * 发布报告分享页并把链接复制到剪贴板。
 *
 * `question` 字段复用为「标题 · 类型」：分享页会把它渲染在正文上方，
 * 收件人先看到这是哪份报告，再读正文。
 * 返回公开链接；链接已自动复制到系统剪贴板，调用方按「已复制」提示即可。
 */
export async function shareArtifactLink(
  api: LingWuApi,
  artifact: AgentArtifact,
): Promise<{ url: string; result: "copied" }> {
  const url = await publishShare(api, {
    question: `${artifact.title} · ${statusLabel(artifact.kind)}`,
    answer: renderArtifactMarkdown(artifact),
  });
  await copyText(url);
  return { url, result: "copied" };
}
