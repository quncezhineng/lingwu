/**
 * 原生端「分享为图片」：用 react-native-view-shot 把目标 View 截成 PNG，
 * 再走 expo-sharing 系统分享面板。
 */
import * as Sharing from "expo-sharing";
import type { RefObject } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";

export type ShareImageResult = "shared" | "downloaded" | "unavailable";

/** 把指定 View 截图为 PNG 并唤起系统分享面板。 */
export async function captureAndShare(viewRef: RefObject<View | null>): Promise<ShareImageResult> {
  if (!viewRef.current) return "unavailable";
  const uri = await captureRef(viewRef, { format: "png", result: "tmpfile" });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png" });
    return "shared";
  }
  return "unavailable";
}
