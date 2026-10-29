import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { Artifact } from "../../../packages/domain/src/index.ts";
import { fillPdf, inspectPdf } from "../../../packages/integrations/src/pdf.ts";
import type { Auth } from "./auth.ts";
import type { Config } from "./config.ts";
import type { Store } from "./db.ts";
import { AppError } from "./errors.ts";

const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FileFormat =
  | "pdf"
  | "html"
  | "md"
  | "png"
  | "jpg"
  | "gif"
  | "webp"
  | "docx"
  | "doc"
  | "xlsx"
  | "xls"
  | "csv"
  | "pptx"
  | "ppt"
  | "txt"
  | "json";

type FileValidation = "pdf" | "utf8" | "png" | "jpeg" | "gif" | "webp" | "zip" | "ole";

interface FileFormatDefinition {
  extension: FileFormat;
  mimeType: string;
  validation: FileValidation;
}

interface FileMetadata {
  mimeType: string;
  extension: FileFormat;
  pageCount: number;
  fields?: Artifact["fields"];
}

const FILE_FORMATS: Record<string, FileFormatDefinition> = {
  pdf: { extension: "pdf", mimeType: "application/pdf", validation: "pdf" },
  html: { extension: "html", mimeType: "text/html", validation: "utf8" },
  htm: { extension: "html", mimeType: "text/html", validation: "utf8" },
  md: { extension: "md", mimeType: "text/markdown", validation: "utf8" },
  markdown: { extension: "md", mimeType: "text/markdown", validation: "utf8" },
  png: { extension: "png", mimeType: "image/png", validation: "png" },
  jpg: { extension: "jpg", mimeType: "image/jpeg", validation: "jpeg" },
  jpeg: { extension: "jpg", mimeType: "image/jpeg", validation: "jpeg" },
  gif: { extension: "gif", mimeType: "image/gif", validation: "gif" },
  webp: { extension: "webp", mimeType: "image/webp", validation: "webp" },
  doc: { extension: "doc", mimeType: "application/msword", validation: "ole" },
  docx: {
    extension: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    validation: "zip",
  },
  xls: { extension: "xls", mimeType: "application/vnd.ms-excel", validation: "ole" },
  xlsx: {
    extension: "xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    validation: "zip",
  },
  csv: { extension: "csv", mimeType: "text/csv", validation: "utf8" },
  ppt: { extension: "ppt", mimeType: "application/vnd.ms-powerpoint", validation: "ole" },
  pptx: {
    extension: "pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    validation: "zip",
  },
  txt: { extension: "txt", mimeType: "text/plain", validation: "utf8" },
  json: { extension: "json", mimeType: "application/json", validation: "utf8" },
};

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function assertFormat(definition: FileFormatDefinition, bytes: Uint8Array): void {
  const valid = (() => {
    switch (definition.validation) {
      case "pdf":
        return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
      case "png":
        return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      case "jpeg":
        return startsWith(bytes, [0xff, 0xd8, 0xff]);
      case "gif":
        return (
          Buffer.from(bytes.subarray(0, 6)).toString("ascii") === "GIF87a" ||
          Buffer.from(bytes.subarray(0, 6)).toString("ascii") === "GIF89a"
        );
      case "webp":
        return (
          Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
          Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
        );
      case "zip":
        return (
          startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
          startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
          startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
        );
      case "ole":
        return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      case "utf8":
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          return true;
        } catch {
          return false;
        }
    }
  })();
  if (valid) return;
  if (definition.validation === "utf8") {
    throw new AppError(
      definition.extension === "html"
        ? "HTML files must be UTF-8 text"
        : "Text-based files must be UTF-8 text",
      422,
    );
  }
  if (["png", "jpeg", "gif", "webp"].includes(definition.validation))
    throw new AppError("The file content does not match its image format", 422);
  if (["zip", "ole"].includes(definition.validation))
    throw new AppError("The file content does not match its Office format", 422);
  throw new AppError("The file content does not match its format", 422);
}

function formatFor(name: string, bytes: Uint8Array): FileFormat | null {
  const extension = name.toLowerCase().split(".").pop();
  const definition = extension ? FILE_FORMATS[extension] : undefined;
  if (definition) {
    assertFormat(definition, bytes);
    return definition.extension;
  }
  // A PDF uploaded with a misleading name can still be opened safely because the
  // server stores it with the canonical .pdf extension.
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  return null;
}

function definitionFor(format: FileFormat): FileFormatDefinition {
  return (
    Object.values(FILE_FORMATS).find((definition) => definition.extension === format) ??
    FILE_FORMATS.pdf
  );
}

function definitionForMime(mimeType: string): FileFormatDefinition | undefined {
  return Object.values(FILE_FORMATS).find((definition) => definition.mimeType === mimeType);
}

async function inspectFile(name: string, bytes: Uint8Array): Promise<FileMetadata> {
  const format = formatFor(name, bytes);
  if (format === "pdf") {
    const metadata = await inspectPdf(bytes);
    if (metadata.pageCount > 500) throw new AppError("PDFs must have 500 pages or fewer", 422);
    return {
      mimeType: "application/pdf",
      extension: "pdf",
      pageCount: metadata.pageCount,
      fields: metadata.fields,
    };
  }
  if (!format) throw new AppError("Choose a supported document or image file", 415);
  const definition = definitionFor(format);
  return { mimeType: definition.mimeType, extension: definition.extension, pageCount: 0 };
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).at(-1) ?? "document.pdf";
  // Slice code points, not UTF-16 units, so a surrogate pair is never split in half.
  const cleaned = Array.from(base)
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .slice(0, 180)
    .join("");
  return cleaned || "document.pdf";
}

function assertFileId(id: string): void {
  if (!FILE_ID.test(id)) throw new AppError("File not found", 404);
}

// Keyed operations need the same ID on every retry, so the ID is derived from the
// owner and operation key instead of random. It is shaped as a version 5 UUID
// (first 128 bits of a SHA-256 hash, version and variant bits set) so it is
// accepted anywhere a random file UUID is.
export function deterministicFileId(owner: string, operationKey: string): string {
  const bytes = createHash("sha256")
    .update(JSON.stringify([owner, operationKey]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class Files {
  constructor(
    private readonly db: Store,
    private readonly config: Config,
    private readonly auth: Auth,
  ) {}
  async import(
    owner: string,
    name: string,
    bytes: Uint8Array,
    source: string,
    parentId?: string,
    operationKey?: string,
  ): Promise<Artifact> {
    const id = operationKey === undefined ? randomUUID() : deterministicFileId(owner, operationKey);
    if (operationKey !== undefined) {
      const existing = await this.db.get<Artifact>(owner, "files", id);
      if (existing) return this.signed(owner, existing);
    }
    if (bytes.length > 10 * 1024 * 1024) throw new AppError("Files must be 10 MB or smaller", 413);
    let metadata = await inspectFile(name, bytes);
    const directory = join(this.config.dataDir, "files");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = this.pathFor(id, metadata.extension);
    if (operationKey === undefined) {
      await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
    } else {
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
        try {
          await link(temporary, path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          bytes = await readFile(path);
          metadata = await inspectFile(name, bytes);
        }
      } finally {
        await rm(temporary, { force: true });
      }
    }
    const safeName = sanitizeFileName(name);
    const artifact: Artifact = {
      id,
      name: safeName,
      mimeType: metadata.mimeType,
      size: bytes.length,
      pageCount: metadata.pageCount,
      fields: metadata.fields,
      url: "",
      createdAt: new Date().toISOString(),
      source,
      parentId,
    };
    if (operationKey === undefined) {
      await this.db.put(owner, "files", artifact);
      return this.signed(owner, artifact);
    }
    const persisted = await this.db.insertIfAbsent(owner, "files", artifact);
    return this.signed(owner, persisted ?? (await this.get(owner, id)));
  }
  signed(owner: string, file: Artifact): Artifact {
    return { ...file, url: this.auth.sign(owner, `/api/files/${file.id}/content`) };
  }
  async list(owner: string) {
    return (await this.db.list<Artifact>(owner, "files")).map((file) => this.signed(owner, file));
  }
  async get(owner: string, id: string) {
    assertFileId(id);
    const file = await this.db.get<Artifact>(owner, "files", id);
    if (!file) throw new AppError("File not found", 404);
    return file;
  }
  private pathFor(id: string, extension: FileFormat = "pdf"): string {
    assertFileId(id);
    const directory = resolve(this.config.dataDir, "files");
    const resolved = resolve(directory, `${id}.${extension}`);
    if (!resolved.startsWith(`${directory}${sep}`)) throw new AppError("File not found", 404);
    return resolved;
  }
  async bytes(owner: string, id: string) {
    const file = await this.get(owner, id);
    const extension =
      definitionForMime(file.mimeType)?.extension ??
      FILE_FORMATS[file.name.toLowerCase().split(".").pop() ?? ""]?.extension ??
      "pdf";
    return readFile(this.pathFor(id, extension));
  }
  async fill(
    owner: string,
    id: string,
    values: Record<string, string | boolean>,
    operationKey?: string,
  ) {
    const file = await this.get(owner, id);
    if (file.mimeType !== "application/pdf")
      throw new AppError("Only PDF files can be filled", 422);
    const bytes = await this.bytes(owner, id);
    const output = await fillPdf(bytes, values);
    return this.import(
      owner,
      `${file.name.replace(/\.pdf$/i, "")} — filled.pdf`,
      output,
      `Filled from ${file.name}`,
      id,
      operationKey === undefined
        ? undefined
        : JSON.stringify([
            "fill",
            operationKey,
            id,
            Object.keys(values)
              .sort()
              .map((name) => [name, values[name]]),
          ]),
    );
  }
}
