import { type ReactNode, type RefObject, useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  type StyleProp,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { ArrowUp, ChevronDown, type IconComponent, Square } from "./icons";
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
  assistantLabel,
  assistantText,
  onOpenAssistant,
  sendLabel,
  stopLabel,
  busy = false,
  submitDisabled = false,
  dense = false,
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
  assistantLabel?: string;
  assistantText?: string;
  onOpenAssistant?: () => void;
  sendLabel: string;
  stopLabel?: string;
  busy?: boolean;
  submitDisabled?: boolean;
  dense?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
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

  return (
    <View
      style={[
        {
          backgroundColor: colors.paper,
          borderRadius: radius.composer,
          borderWidth: 1,
          borderColor: focused ? colors.primary : colors.line,
          padding: dense ? 10 : 16,
          ...shadow.composer,
        },
        style,
      ]}
    >
      {attachments}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onContentSizeChange={(event) =>
          setInputHeight(
            Math.max(
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
          fontSize: 16,
          lineHeight: 24,
          textAlignVertical: "top",
          fontFamily: fonts.sans,
          ...noFocusRing,
        }}
      />
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
          {!!tools.length && (
            <View
              style={{
                width: 1,
                height: 15,
                backgroundColor: colors.line,
                marginHorizontal: 3,
              }}
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={assistantLabel ?? assistantText}
            disabled={!onOpenAssistant}
            onPress={onOpenAssistant}
            style={({ pressed }) => ({
              minHeight: 34,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 7,
              borderRadius: radius.control,
              backgroundColor: pressed ? colors.overlay1 : "transparent",
            })}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: radius.full,
                backgroundColor: colors.primary,
              }}
            />
            <Text
              numberOfLines={1}
              style={{
                maxWidth: 120,
                fontSize: 11,
                lineHeight: 17,
                fontWeight: "500",
                color: colors.muted,
                fontFamily: fonts.sans,
              }}
            >
              {assistantText}
            </Text>
            {!!onOpenAssistant && <ChevronDown size={12} color={colors.faint} />}
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{ disabled: actionDisabled, busy }}
          disabled={actionDisabled}
          hitSlop={4}
          onPress={action}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: busy || canSubmit ? colors.primary : colors.tertiary,
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
      </View>
    </View>
  );
}
