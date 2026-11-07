import { Platform, type TextStyle } from "react-native";
import type { MarkdownStyles } from "react-native-markdown-renderer";
import { colors, fonts } from "./ui";

/** 工作提示词 Markdown 渲染：沿用输入框的 15 号字，只按层级缩放标题。 */
export const instructionsTextStyle: TextStyle = {
  color: colors.text,
  fontFamily: fonts.serif,
  fontSize: 15,
  lineHeight: 24,
};

/**
 * 工作提示词 Markdown 渲染样式。
 *
 * 技能编辑器（bot-pages/skills.tsx）的预览态与「我的技能 / 我的技能详情」弹窗
 * 共用同一套样式，保证同一份指令在任何位置的排版观感一致。
 */
export const instructionsMarkdownStyle: Partial<MarkdownStyles> = {
  text: instructionsTextStyle,
  paragraph: { marginTop: 0, marginBottom: 6 },
  list: { marginBottom: 6 },
  listUnorderedItemIcon: { ...instructionsTextStyle, marginLeft: 2, marginRight: 8 },
  listOrderedItemIcon: { ...instructionsTextStyle, marginLeft: 0, marginRight: 6, minWidth: 18 },
  headingContainer: { marginTop: 6, marginBottom: 3 },
  heading: { fontFamily: fonts.serif, fontWeight: "600", color: colors.text },
  heading1: { fontSize: 17, lineHeight: 25 },
  heading2: { fontSize: 16, lineHeight: 24 },
  heading3: { fontSize: 15, lineHeight: 24 },
  strong: { fontWeight: "600" },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.lineStrong,
    paddingHorizontal: 10,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 5,
    marginVertical: 6,
  },
  hr: { height: 1, backgroundColor: colors.line, marginVertical: 10 },
  link: { color: colors.primaryStrong, textDecorationLine: "underline" },
  codeInline: {
    backgroundColor: colors.tertiary,
    color: colors.primaryStrong,
    borderRadius: 4,
    paddingHorizontal: 3,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
  },
  codeBlock: { borderRadius: 6, backgroundColor: colors.tertiary, color: colors.text },
};
