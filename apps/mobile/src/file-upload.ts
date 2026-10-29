import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import type { Artifact } from "../../../packages/domain/src";
import { API_URL } from "./api";
import { fileMimeType } from "./file-kind";

interface UploadClient {
  readonly token: string;
  request<T>(path: string, body?: unknown, method?: string): Promise<T>;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "text/html",
  "text/markdown",
  "text/plain",
  "text/csv",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

/**
 * Opens the platform file picker and imports a supported document or image.
 * Cancellation returns undefined; import failures are left to the caller so each
 * surface can keep its local error/toast behavior.
 */
export async function pickAndUploadFile(api: UploadClient): Promise<Artifact | undefined> {
  const result = await DocumentPicker.getDocumentAsync({
    type: SUPPORTED_MIME_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return undefined;

  const file = result.assets[0];
  if (!file) return undefined;
  const size = file.size ?? file.file?.size;
  if (size !== undefined && size > MAX_FILE_BYTES)
    throw new Error("Files must be 10 MB or smaller.");
  if (Platform.OS === "web") {
    if (!file.file) throw new Error("The selected file could not be read. Please choose it again.");
    const form = new FormData();
    form.append("file", file.file, file.name);
    return api.request<Artifact>("/api/files", form);
  }

  const uploaded = await FileSystem.uploadAsync(`${API_URL}/api/files`, file.uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType: fileMimeType({ name: file.name, mimeType: file.mimeType ?? "" }),
    headers: { Authorization: `Bearer ${api.token}` },
  });
  const payload = JSON.parse(uploaded.body);
  if (uploaded.status < 200 || uploaded.status >= 300)
    throw new Error(payload.error || "Could not import this file.");
  return payload as Artifact;
}
