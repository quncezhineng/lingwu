import type { Artifact } from "../../../packages/domain/src";

export type FileKind =
  | "html"
  | "pdf"
  | "markdown"
  | "image"
  | "word"
  | "excel"
  | "ppt"
  | "text"
  | "other";

const KIND_BY_EXTENSION: Record<string, FileKind> = {
  pdf: "pdf",
  html: "html",
  htm: "html",
  md: "markdown",
  markdown: "markdown",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  doc: "word",
  docx: "word",
  xls: "excel",
  xlsx: "excel",
  csv: "excel",
  ppt: "ppt",
  pptx: "ppt",
  txt: "text",
  json: "text",
};

const KIND_BY_MIME: Record<string, FileKind> = {
  "application/pdf": "pdf",
  "text/html": "html",
  "text/markdown": "markdown",
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "application/msword": "word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/vnd.ms-excel": "excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
  "text/csv": "excel",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "ppt",
  "text/plain": "text",
  "application/json": "text",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  html: "text/html",
  htm: "text/html",
  md: "text/markdown",
  markdown: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  json: "application/json",
};

export function fileExtension(file: Pick<Artifact, "name">): string {
  return /\.([a-z0-9]{1,12})$/i.exec(file.name.trim())?.[1]?.toLowerCase() ?? "";
}

export function fileMimeType(file: Pick<Artifact, "name" | "mimeType">): string {
  return MIME_BY_EXTENSION[fileExtension(file)] || file.mimeType || "application/octet-stream";
}

export function fileBadge(file: Pick<Artifact, "name" | "mimeType">): string {
  const extension = fileExtension(file);
  if (extension) return extension.toUpperCase().slice(0, 5);
  return (
    {
      pdf: "PDF",
      html: "HTML",
      markdown: "MD",
      image: "IMG",
      word: "DOC",
      excel: "XLS",
      ppt: "PPT",
      text: "TXT",
      other: "FILE",
    } satisfies Record<FileKind, string>
  )[fileKind(file)];
}

export function fileTypeName(file: Pick<Artifact, "name" | "mimeType">): string {
  const extension = fileExtension(file);
  if (extension) return extension.toUpperCase();
  return fileBadge(file);
}

/** What the file should open as. A specific MIME type wins; the extension covers older rows. */
export function fileKind(file: Pick<Artifact, "name" | "mimeType">): FileKind {
  const extensionKind = KIND_BY_EXTENSION[fileExtension(file)];
  const mimeKind = KIND_BY_MIME[file.mimeType.toLowerCase()];
  if (mimeKind && mimeKind !== "text") return mimeKind;
  return extensionKind ?? mimeKind ?? "other";
}
