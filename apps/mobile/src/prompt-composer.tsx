import { type ReactNode, type RefObject, useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { Text, TextInput } from "./app-text";
import { ArrowUp, type IconComponent, Plus, Square } from "./icons";
import { colors, fonts, radius, shadow } from "./ui";

const noFocusRing =
  Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as TextStyle) : undefined;

export type ComposerTool = {
  key: string;
  icon: IconComponent;
  label: string;
  onPress: () => void;
  active?: boolean;
};

export function PromptComposer({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  accessibilityLabel,
  inputRef,
  inputMinHeight = 68,
  inputMaxHeight = 150,
  tools = [],
  attachments,
  sendLabel,
  stopLabel,
  busy = false,
  submitDisabled = false,
  dense = false,
  inline = false,
  style,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  accessibilityLabel: string;
  inputRef?: RefObject<TextInput | null>;
  inputMinHeight?: number;
  inputMaxHeight?: number;
  tools?: ComposerTool[];
  attachments?: ReactNode;
  sendLabel: string;
  stopLabel?: string;
  busy?: boolean;
  submitDisabled?: boolean;
  dense?: boolean;
  /** The v3 Bot composer keeps attachment, message and send controls in one row. */
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [inputHeight, setInputHeight] = useState(inputMinHeight);

  useEffect(() => {
    if (!value) setInputHeight(inputMinHeight);
  }, [inputMinHeight, value]);

  const canSubmit = !submitDisabled && value.trim().length > 0;
  const actionDisabled = busy ? false : !canSubmit;
  const actionLabel = busy ? (stopLabel ?? sendLabel) : sendLabel;
  const action = () => {
    if (busy || canSubmit) onSubmit();
  };

  const input = (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChangeText}
      onFocus={() => {
        setFocused(true);
        setToolsOpen(false);
      }}
      onBlur={() => setFocused(false)}
      onContentSizeChange={(event) =>
        setInputHeight(
          !value
            ? inputMinHeight
            : Math.max(
                inputMinHeight,
                Math.min(inputMaxHeight, event.nativeEvent.contentSize.height),
              ),
        )
      }
      onSubmitEditing={action}
      onKeyPress={
        Platform.OS === "web"
          ? (event) => {
              if (
                event.nativeEvent.key === "Enter" &&
                !("shiftKey" in event.nativeEvent && event.nativeEvent.shiftKey)
              ) {
                event.preventDefault();
                action();
              }
            }
          : undefined
      }
      placeholder={placeholder}
      placeholderTextColor={colors.faint}
      accessibilityLabel={accessibilityLabel}
      selectionColor={colors.primary}
      multiline
      style={{
        color: colors.text,
        height: inputHeight,
        minHeight: inputMinHeight,
        maxHeight: inputMaxHeight,
        padding: 0,
        paddingTop: dense ? 4 : 2,
        paddingBottom: 6,
        fontSize: inline ? 14 : 16,
        lineHeight: inline ? 22 : 24,
        textAlignVertical: "top",
        ...(inline ? { flex: 1, minWidth: 0, paddingTop: 8, paddingBottom: 8 } : undefined),
        fontFamily: fonts.sans,
        ...noFocusRing,
      }}
    />
  );
  const submitAction = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={actionLabel}
      accessibilityState={{ disabled: actionDisabled, busy }}
      disabled={actionDisabled}
      hitSlop={4}
      onPress={action}
      style={({ pressed }) => ({
        width: dense ? 36 : 38,
        height: dense ? 36 : 38,
        borderRadius: radius.full,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: busy || canSubmit ? 0 : 1,
        borderColor: colors.line,
        backgroundColor: busy || canSubmit ? colors.primaryAction : colors.surfaceRaised,
        opacity: pressed ? 0.82 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      {busy ? (
        <Square size={16} fill={colors.onPrimary} strokeWidth={0} />
      ) : (
        <ArrowUp
          size={19}
          strokeWidth={1.9}
          color={canSubmit ? colors.onPrimary : colors.disabled}
        />
      )}
    </Pressable>
  );
  if (inline)
    return (
      <View
        style={[
          {
            backgroundColor: colors.paper,
            borderRadius: 29,
            borderWidth: 1,
            borderColor: focused ? colors.primary : colors.lineSoft,
            padding: 8,
            minHeight: 58,
            ...shadow.composer,
          },
          style,
        ]}
      >
        {attachments}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
          <View style={{ position: "relative", zIndex: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tools[0]?.label}
              accessibilityState={{ expanded: toolsOpen }}
              onPress={() => setToolsOpen(!toolsOpen)}
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: radius.full,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: toolsOpen || pressed ? colors.sky : colors.surface,
              })}
            >
              <Plus size={20} color={colors.muted} />
            </Pressable>
            {toolsOpen && (
              <View
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: 0,
                  minWidth: 200,
                  marginBottom: 12,
                  padding: 6,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 16,
                  backgroundColor: colors.paper,
                  ...shadow.card,
                }}
              >
                {tools.map(({ key, icon: Icon, label, onPress }) => (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    onPress={() => {
                      setToolsOpen(false);
                      onPress();
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      minHeight: 42,
                      padding: 10,
                      borderRadius: 10,
                      backgroundColor: pressed ? colors.surface : "transparent",
                    })}
                  >
                    <Icon size={17} color={colors.muted} />
                    <Text style={{ fontSize: 12, color: colors.text }}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          {input}
          {submitAction}
        </View>
      </View>
    );

  return (
    <View
      style={[
        {
          backgroundColor: colors.paper,
          borderRadius: dense ? radius.panel : radius.composer,
          borderWidth: 1,
          borderColor: focused ? colors.primary : colors.lineStrong,
          padding: dense ? 8 : 10,
          ...shadow.composer,
        },
        style,
      ]}
    >
      {attachments}
      {input}
      <View
        style={{
          minHeight: 36,
          marginTop: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 4 }}>
          {tools.map(({ key, icon: Icon, label, onPress, active }) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: !!active }}
              hitSlop={6}
              onPress={onPress}
              style={({ pressed }) => ({
                width: 34,
                height: 34,
                borderRadius: radius.control,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: active || pressed ? colors.overlay1 : colors.paper,
              })}
            >
              <Icon
                size={17}
                strokeWidth={1.7}
                color={active ? colors.primaryStrong : colors.muted}
              />
            </Pressable>
          ))}
        </View>
        {submitAction}
      </View>
    </View>
  );
}
