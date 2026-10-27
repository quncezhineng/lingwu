import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  type TextStyle,
  View,
} from "react-native";
import Markdown, { type MarkdownStyles, type RenderRules } from "react-native-markdown-renderer";
import { assistantMarkdown, isSafeAssistantUrl } from "./assistant-markdown";
import { useTranslation } from "./i18n";
import { Brain } from "./icons";
import { parseMemoryRecallResult, type RecalledMemory } from "./memory-recall-result";
import { colors } from "./ui";

// 记忆卡片上的 Markdown 渲染：与正文沿用同一字号/行高，标题逐级缩小，
// 链接使用品牌主色并保持 selectable，长文本记忆仍可整段复制。
const memoryMarkdownTextStyle: TextStyle = { color: colors.text, fontSize: 13.5, lineHeight: 19 };
const memoryMarkdownStyle: Partial<MarkdownStyles> = {
  text: memoryMarkdownTextStyle,
  paragraph: { marginTop: 0, marginBottom: 2 },
  list: { marginBottom: 2 },
  headingContainer: { marginTop: 2, marginBottom: 1 },
  heading1: { fontSize: 15, lineHeight: 19, color: colors.text },
  heading2: { fontSize: 14, lineHeight: 19, color: colors.text },
  heading3: { fontSize: 13, lineHeight: 19, color: colors.text },
  link: { color: colors.primary, textDecorationLine: "underline" },
  codeInline: {
    backgroundColor: colors.tertiary,
    color: colors.primary,
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 0,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 11,
  },
  codeBlock: { borderRadius: 8, backgroundColor: colors.tertiary, color: colors.text },
};
// 文本节点显式 selectable，与助手消息保持一致，便于复制记忆内容。
const memoryMarkdownRules: RenderRules = {
  textgroup: (node, children) => (
    <Text key={node.key} selectable style={memoryMarkdownTextStyle}>
      {children}
    </Text>
  ),
};
/** 记忆文本里的链接统一过安全校验后再打开，拦截外部地址与危险协议。 */
function openSafeLink(url: string): boolean {
  if (!isSafeAssistantUrl(url)) return false;
  void Linking.openURL(url).catch(() => {});
  return false;
}

export function MemoryRecallCard({ result, loading }: { result: unknown; loading: boolean }) {
  const { t } = useTranslation();
  const data = parseMemoryRecallResult(result);
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.muted}>{t("tools.memoryRecallLoading")}</Text>
      </View>
    );
  }
  if (!data) return <Text style={styles.muted}>{t("tools.memoryRecallUnavailable")}</Text>;
  return (
    <View style={styles.wrap}>
      {!!data.query && (
        <Text style={styles.query}>{t("tools.memoryRecallQuery", { query: data.query })}</Text>
      )}
      {data.memories.length ? (
        data.memories.map((memory) => <MemoryRow key={memory.id} memory={memory} />)
      ) : (
        <Text style={styles.muted}>{t("tools.memoryRecallEmpty")}</Text>
      )}
    </View>
  );
}

function MemoryRow({ memory }: { memory: RecalledMemory }) {
  return (
    <View style={styles.memory}>
      <View style={styles.icon}>
        <Brain size={14} strokeWidth={1.8} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <Markdown
          markdownit={assistantMarkdown}
          style={memoryMarkdownStyle}
          rules={memoryMarkdownRules}
          onLinkPress={openSafeLink}
        >
          {memory.text}
        </Markdown>
        {!!memory.source && <Text style={styles.source}>{memory.source}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  loading: { flexDirection: "row", alignItems: "center", gap: 8 },
  query: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  memory: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  body: { flex: 1, gap: 2 },
  source: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
