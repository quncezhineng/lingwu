import { useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { colors, ErrorNotice } from "./ui";

/**
 * 研究产物 HTML 网页的原生渲染：用 WebView 的 `source={{ html }}` 展示
 * 构建好的 HTML 字符串；文件页可开启脚本，研究产物保持只读。
 * 外层 View 用 `flex: 1` 撑满「全屏详情弹窗」的剩余空间，WebView 填满自身容器。
 */
export default function HtmlPreview({
  html,
  interactive = false,
}: {
  html: string;
  title?: string;
  interactive?: boolean;
}) {
  const [error, setError] = useState("");
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <ErrorNotice error={error} />
      <WebView
        originWhitelist={["about:srcdoc"]}
        source={{ html }}
        javaScriptEnabled={interactive}
        domStorageEnabled={interactive}
        onError={(event) => setError(event.nativeEvent.description)}
        style={{ flex: 1, borderRadius: 12, backgroundColor: colors.paper }}
      />
    </View>
  );
}
