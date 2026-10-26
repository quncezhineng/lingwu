import type { Artifact } from "../../../packages/domain/src";

export type FileKind = "html" | "pdf" | "other";

/** What the file should open as. The MIME type wins; the extension covers older rows. */
export function fileKind(file: Pick<Artifact, "name" | "mimeType">): FileKind {
  if (file.mimeType === "text/html" || /\.html?$/i.test(file.name)) return "html";
  if (file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  return "other";
}
