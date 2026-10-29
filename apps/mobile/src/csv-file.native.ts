/** 原生端 CSV 文件选择：expo-document-picker + FileSystem 读取。 */
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export interface PickedCsv {
  name: string;
  text: string;
}

export async function readFileAsText(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}

export async function pickCsvFile(): Promise<PickedCsv | undefined> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["text/csv", "text/comma-separated-values", "application/csv", "text/plain"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return undefined;
  const asset = result.assets[0];
  if (!asset) return undefined;
  return { name: asset.name, text: await readFileAsText(asset.uri) };
}

/** 原生端分享文本文件（模板、错误行或导出的简报）。 */
export async function saveTextFile(name: string, text: string, mimeType = "text/csv") {
  const target = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(target, text);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target, { mimeType });
  }
}
