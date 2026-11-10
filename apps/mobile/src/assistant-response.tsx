import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Linking, Platform, ScrollView, type TextStyle, View } from "react-native";
import Markdown, { type MarkdownStyles, type RenderRules } from "react-native-markdown-renderer";
import type { Artifact } from "../../../packages/domain/src";
import { Text } from "./app-text";
import {
  assistantMarkdown,
  inlineDocumentFileName,
  isSafeAssistantUrl,
  scanInlineDocuments,
} from "./assistant-markdown";
import { findReferencedFile, markFileMentions } from "./chat-content";
import { fileKind } from "./file-kind";
import { tr } from "./i18n/translate";
import { markdownCellTextStyle, markdownTableRules } from "./markdown-table";
import { markdownPreviewDocument, openHtmlDocument } from "./open-html-document";
import { colors, ErrorNotice, fonts } from "./ui";

const textStyle = { color: colors.text, fontFamily: fonts.sans, fontSize: 15, lineHeight: 25 };
const style: Partial<MarkdownStyles> = {
  text: textStyle,
  paragraph: { marginTop: 0, marginBottom: 10 },
  list: { marginBottom: 10 },
  listUnorderedItem: { marginTop: 3, marginBottom: 1 },
  listOrderedItem: { marginTop: 3, marginBottom: 1 },
  listUnorderedItemIcon: { ...textStyle, marginLeft: 2, marginRight: 9 },
  listOrderedItemIcon: { ...textStyle, marginLeft: 0, marginRight: 8, minWidth: 18 },
  headingContainer: { marginTop: 18, marginBottom: 8 },
  heading1Container: { paddingBottom: 0, borderBottomWidth: 0 },
  heading2Container: { paddingBottom: 0, borderBottomWidth: 0 },
  heading: { fontFamily: fonts.serif, fontWeight: "600", color: colors.text },
  heading1: { fontSize: 22, lineHeight: 30 },
  heading2: { fontSize: 20, lineHeight: 28 },
  heading3: { fontSize: 17, lineHeight: 25 },
  heading4: { fontSize: 16, lineHeight: 24 },
  strong: { fontWeight: "600" },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.lineStrong,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 0,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 5,
    marginVertical: 10,
  },
  hr: { height: 1, backgroundColor: colors.line, marginVertical: 18 },
  pre: { marginBottom: 0 },
  link: { color: colors.primaryStrong, textDecorationLine: "underline" },
  codeInline: {
    backgroundColor: colors.tertiary,
    color: colors.primaryStrong,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
  },
  codeBlock: { backgroundColor: colors.tertiary, color: colors.text },
};

const compactTextStyle = { ...textStyle, fontSize: 13, lineHeight: 20 };
const compactStyle: Partial<MarkdownStyles> = {
  ...style,
  text: compactTextStyle,
  paragraph: { marginTop: 0, marginBottom: 2 },
  list: { marginBottom: 2 },
  listUnorderedItemIcon: { ...compactTextStyle, marginLeft: 2, marginRight: 7 },
  listOrderedItemIcon: { ...compactTextStyle, marginLeft: 0, marginRight: 6, minWidth: 16 },
  headingContainer: { marginTop: 2, marginBottom: 1 },
  heading1: { fontSize: 15, lineHeight: 19 },
  heading2: { fontSize: 14, lineHeight: 19 },
  heading3: { fontSize: 13, lineHeight: 19 },
  heading4: { fontSize: 13, lineHeight: 19 },
  heading5: { fontSize: 13, lineHeight: 19 },
  heading6: { fontSize: 13, lineHeight: 19 },
  link: { color: colors.primaryStrong, textDecorationLine: "underline" },
  codeInline: {
    backgroundColor: colors.tertiary,
    color: colors.primaryStrong,
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 0,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 11,
  },
  codeBlock: { backgroundColor: colors.tertiary, color: colors.text },
};

const codeText: TextStyle = {
  fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  fontSize: 13,
  lineHeight: 20,
  color: colors.text,
};

const compactCodeText: TextStyle = { ...codeText, fontSize: 11, lineHeight: 17 };

function codeBlockRule(compact: boolean): RenderRules["fence"] {
  return (node, _children, _parent, _styles) => (
    <ScrollView
      key={node.key}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{
        maxWidth: "100%",
        marginVertical: compact ? 3 : 7,
        borderRadius: compact ? 8 : 12,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.tertiary,
      }}
      contentContainerStyle={{ padding: compact ? 7 : 12 }}
    >
      <Text selectable style={compact ? compactCodeText : codeText}>
        {node.content.replace(/\n$/, "")}
      </Text>
    </ScrollView>
  );
}

function StreamingCursor() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.18, duration: 480, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 1, duration: 480, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={{
        width: 7,
        height: 18,
        marginBottom: 3,
        borderRadius: 4,
        backgroundColor: colors.primary,
        opacity,
      }}
    />
  );
}

export function AssistantResponse({
  content,
  streaming = false,
  compact = false,
  files = [],
  onOpenFile,
}: {
  content: string;
  streaming?: boolean;
  compact?: boolean;
  files?: readonly Artifact[];
  onOpenFile?: (file: Artifact) => void;
}) {
  const [linkError, setLinkError] = useState("");
  const inlineDocuments = useMemo(() => scanInlineDocuments(content), [content]);
  const source = useMemo(
    () => markFileMentions(inlineDocuments.markdown, files),
    [files, inlineDocuments.markdown],
  );
  const onLinkPress = useCallback(
    (url: string) => {
      const file = findReferencedFile(url, files);
      if (file && onOpenFile) {
        onOpenFile(file);
        return false;
      }
      if (!isSafeAssistantUrl(url)) return false;
      setLinkError("");
      void Linking.openURL(url).catch((error) =>
        setLinkError(error instanceof Error ? error.message : String(error)),
      );
      return false;
    },
    [files, onOpenFile],
  );
  const rules = useMemo<RenderRules>(
    () => ({
      ...markdownTableRules(compact),
      textgroup: (node, children, parents) => {
        const cell = parents.find((parent) => parent.type === "th" || parent.type === "td");
        return (
          <Text
            key={node.key}
            selectable
            style={
              cell ? markdownCellTextStyle(cell, compact) : compact ? compactTextStyle : textStyle
            }
          >
            {children}
          </Text>
        );
      },
      image: (node) => (
        <Text key={node.key} selectable style={{ color: colors.muted }}>
          {node.attributes.alt
            ? tr("tools.imageAlt", { alt: node.attributes.alt })
            : tr("tools.imagePlaceholder")}
        </Text>
      ),
      code_inline: (node, _children, _parent, styles) => {
        const file = findReferencedFile(node.content, files);
        const inlineDocument = inlineDocuments.documents.get(
          inlineDocumentFileName(node.content) ?? "",
        );
        const onPress =
          file && onOpenFile
            ? () => {
                // Web 端 HTML 产物直接在新标签页打开签名 URL，便于整页浏览；
                // 原生端及其他文件类型沿用应用内详情打开。
                if (Platform.OS === "web" && fileKind(file) === "html" && file.url)
                  void Linking.openURL(file.url);
                else onOpenFile(file);
              }
            : Platform.OS === "web" && inlineDocument
              ? () => {
                  setLinkError("");
                  const html =
                    inlineDocument.kind === "markdown"
                      ? markdownPreviewDocument(inlineDocument.source, inlineDocument.name)
                      : inlineDocument.source;
                  if (!openHtmlDocument(html)) {
                    setLinkError(tr("chat.documentOpenError"));
                  }
                }
              : undefined;
        return (
          <Text
            key={node.key}
            selectable
            accessibilityRole={onPress ? "link" : undefined}
            onPress={onPress}
            style={[
              styles.codeInline as TextStyle,
              ...(onPress
                ? [
                    {
                      color: colors.primaryStrong,
                      backgroundColor: colors.tertiary,
                      textDecorationLine: "underline" as const,
                      textDecorationStyle: "dotted" as const,
                    },
                  ]
                : []),
            ]}
          >
            {node.content}
          </Text>
        );
      },
      code_block: codeBlockRule(compact),
      fence: codeBlockRule(compact),
    }),
    [compact, files, inlineDocuments, onOpenFile],
  );
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Markdown
            markdownit={assistantMarkdown}
            style={compact ? compactStyle : style}
            rules={rules}
            onLinkPress={onLinkPress}
          >
            {source}
          </Markdown>
        </View>
        {streaming && <StreamingCursor />}
      </View>
      <ErrorNotice error={linkError} />
    </>
  );
}
