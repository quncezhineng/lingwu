/** 原生端选择 SKILL.md：expo-document-picker + FileSystem 读取文本。 */
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

export interface PickedSkillFile {
  name: string;
  text: string;
}

/** 技能文件是纯文本，超过这个体积基本不是正常技能。 */
export const MAX_SKILL_BYTES = 512 * 1024;

export async function pickSkillFile(): Promise<PickedSkillFile | undefined> {
  const result = await DocumentPicker.getDocumentAsync({
    // 部分 Android 文件管理器会把 .md 报成 octet-stream，放宽一项避免选不到文件。
    type: ["text/markdown", "text/x-markdown", "text/plain", "application/octet-stream"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return undefined;
  const asset = result.assets[0];
  if (!asset) return undefined;
  if (asset.size !== undefined && asset.size > MAX_SKILL_BYTES)
    throw new Error("技能文件不能超过 512 KB。");
  const text = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (text.length > MAX_SKILL_BYTES) throw new Error("技能文件不能超过 512 KB。");
  return { name: asset.name, text };
}
