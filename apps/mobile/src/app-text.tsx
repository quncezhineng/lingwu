import { forwardRef } from "react";
import {
  Text as NativeText,
  TextInput as NativeTextInput,
  Platform,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";
import { fonts } from "./theme";

/** Keep the native instance types available for refs alongside the wrapped components. */
export type Text = NativeText;
export type TextInput = NativeTextInput;

const defaultFont = { fontFamily: fonts.serif };

/**
 * Web 端统一去掉输入框点击聚焦时浏览器默认的黄色 focus 边框（outline）。
 * 项目里所有输入框都经由这个包装组件渲染，在此一次性兜底，
 * 避免每个搜索框/输入框都单独写一遍 outlineStyle。
 */
const webNoFocusRing =
  Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as TextStyle) : null;

export const Text = forwardRef<Text, TextProps>(function AppText({ style, ...props }, ref) {
  return <NativeText {...props} ref={ref} style={[defaultFont, style]} />;
});

export const TextInput = forwardRef<TextInput, TextInputProps>(function AppTextInput(
  { style, ...props },
  ref,
) {
  return <NativeTextInput {...props} ref={ref} style={[defaultFont, style, webNoFocusRing]} />;
});

// Markdown's applyStyle uses these native display names when cloning text groups.
Text.displayName = "Text";
TextInput.displayName = "TextInput";
