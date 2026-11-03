import { forwardRef } from "react";
import {
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
} from "react-native";
import { fonts } from "./theme";

/** Keep the native instance types available for refs alongside the wrapped components. */
export type Text = NativeText;
export type TextInput = NativeTextInput;

const defaultFont = { fontFamily: fonts.serif };

export const Text = forwardRef<Text, TextProps>(function AppText({ style, ...props }, ref) {
  return <NativeText {...props} ref={ref} style={[defaultFont, style]} />;
});

export const TextInput = forwardRef<TextInput, TextInputProps>(function AppTextInput(
  { style, ...props },
  ref,
) {
  return <NativeTextInput {...props} ref={ref} style={[defaultFont, style]} />;
});

// Markdown's applyStyle uses these native display names when cloning text groups.
Text.displayName = "Text";
TextInput.displayName = "TextInput";
