import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import type { Artifact } from "../../../packages/domain/src";
import { API_URL } from "./api";

interface UploadClient {
  readonly token: string;
  request<T>(path: string, body?: unknown, method?: string): Promise<T>;
}

/**
 * Opens the platform file picker and imports the selected PDF/HTML into Files.
 * Cancellation returns undefined; import failures are left to the caller so each
 * surface can keep its local error/toast behavior.
 */
export async function pickAndUploadFile(api: UploadClient): Promise<Artifact | undefined> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "text/html"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return undefined;

  const file = result.assets[0];
  if (!file) return undefined;
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
    mimeType: file.mimeType || (/\.html?$/i.test(file.name) ? "text/html" : "application/pdf"),
    headers: { Authorization: `Bearer ${api.token}` },
  });
  const payload = JSON.parse(uploaded.body);
  if (uploaded.status < 200 || uploaded.status >= 300)
    throw new Error(payload.error || "Could not import this file.");
  return payload as Artifact;
}
