/**
 * 研究产物的导出内容与文件名（纯函数，不依赖 React Native / 网络）。
 *
 * 上传给用户的文件长什么样、叫什么名字，是导出功能里最容易出错、也最需要
 * 单测覆盖的两件事：标题里的 `/`、`:` 会让浏览器丢掉整个文件名，同一天导出
 * 两份同名报告又会互相覆盖。这里只关心「产出什么」，落盘由 `artifact-share.ts`
 * 按平台处理。
 */
import type { AgentArtifact } from "../../../packages/domain/src/agent";
import { renderArtifactHtml, renderArtifactMarkdown } from "./artifact-html";

export type ArtifactExportFormat = "html" | "markdown";

const FALLBACK_NAME = "lingwu-report";
/** Windows / macOS / Linux 上不能出现在文件名里的字符，外加换行与制表符。 */
const UNSAFE_FILENAME_RE = /[\\/:*?"<>|\r\n\t]+/g;

/**
 * 导出文件名：标题压成安全字符，再补一个日期后缀。
 * 后缀取 `createdAt` 的日期部分（ISO 字符串前 10 位），日期不可解析时不加。
 */
export function artifactFileName(artifact: AgentArtifact, format: ArtifactExportFormat): string {
  const base =
    artifact.title.replace(UNSAFE_FILENAME_RE, " ").replace(/\s+/g, " ").trim().slice(0, 60) ||
    FALLBACK_NAME;
  const day = artifact.createdAt.slice(0, 10);
  const stamp = /^\d{4}-\d{2}-\d{2}$/.test(day) ? `-${day}` : "";
  return `${base}${stamp}.${format === "html" ? "html" : "md"}`;
}

/** 导出正文：HTML 为完整自包含文档，Markdown 为同一份信息结构的纯文本。 */
export function artifactExportText(artifact: AgentArtifact, format: ArtifactExportFormat): string {
  return format === "html" ? renderArtifactHtml(artifact) : renderArtifactMarkdown(artifact);
}
