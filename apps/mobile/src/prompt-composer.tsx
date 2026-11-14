import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
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
import { enterConfirmsIme } from "./prompt-composer-ime";
import { colors, composerMetrics, fonts, radius, semantic, shadow } from "./ui";

const noFocusRing =
  Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as TextStyle) : undefined;

export type ComposerTool = {
  key: string;
  icon: IconComponent;
  label: string;
  onPress: () => void;
  active?: boolean;
};

export type ComposerCornerAction = {
  icon: IconComponent;
  label: string;
  onPress: () => void;
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
  cornerAction,
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
  cornerAction?: ComposerCornerAction;
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
  const [shellHeight, setShellHeight] = useState(composerMetrics.minHeight);
  const [inputHost, setInputHost] = useState<HTMLElement | null>(null);
  const composing = useRef(false);
  const compositionEndedAt = useRef(0);
  const assignInputRef = useCallback(
    (node: TextInput | null) => {
      setInputHost((current) => {
        const host = node as unknown as HTMLElement | null;
        return current === host ? current : host;
      });
      if (inputRef) inputRef.current = node;
    },
    [inputRef],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || !inputHost) return;
    const start = () => {
      composing.current = true;
    };
    const end = () => {
      composing.current = false;
      compositionEndedAt.current = Date.now();
    };
    inputHost.addEventListener("compositionstart", start);
    inputHost.addEventListener("compositionend", end);
    return () => {
      inputHost.removeEventListener("compositionstart", start);
      inputHost.removeEventListener("compositionend", end);
    };
  }, [inputHost]);

  useEffect(() => {
    if (!value) setInputHeight(inputMinHeight);
  }, [inputMinHeight, value]);

  const canSubmit = !submitDisabled && value.trim().length > 0;
  const actionDisabled = busy ? false : !canSubmit;
  const actionLabel = busy ? (stopLabel ?? sendLabel) : sendLabel;
  const action = () => {
    if (busy || canSubmit) onSubmit();
  };
  const controlSize = inline ? composerMetrics.control : dense ? 34 : 36;
  const multiline = inputHeight > inputMinHeight + composerMetrics.growSlack;
  // A full pill follows the short side. Chips or extra lines make the shell
  // taller than one line; that same radius then becomes a huge end cap and
  // the send button sits outside the curve. Keep the semicircle for one
  // line, and the fixed corner once the shell grows.
  const shellGrown = shellHeight > composerMetrics.minHeight + composerMetrics.growSlack;
  const grown = multiline || shellGrown;
  const composerRadius = grown ? composerMetrics.pillRadius : radius.full;
  const cornerButton = cornerAction ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cornerAction.label}
      hitSlop={6}
      onPress={cornerAction.onPress}
      style={({ pressed }) => ({
        position: "absolute",
        // Keep the shortcut fully above the composer instead of covering its input area.
        top: -44,
        right: 13,
        zIndex: 20,
        width: 34,
        height: 34,
        borderRadius: radius.control,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: pressed ? colors.primary : semantic.controlBorder,
        backgroundColor: pressed ? colors.sky : colors.paper,
        transform: [{ scale: pressed ? 0.96 : 1 }],
        ...shadow.card,
      })}
    >
      <cornerAction.icon size={17} strokeWidth={1.8} color={colors.primaryStrong} />
    </Pressable>
  ) : null;

  const input = (
    <TextInput
      ref={assignInputRef}
      value={value}
      onChangeText={onChangeText}
      onFocus={() => {
        setFocused(true);
        setToolsOpen(false);
      }}
      onBlur={() => setFocused(false)}
      onContentSizeChange={(event) => {
        const measured = Math.ceil(event.nativeEvent.contentSize.height);
        const next = !value
          ? inputMinHeight
          : Math.max(inputMinHeight, Math.min(inputMaxHeight, measured));
        // A caret or one glyph should not resize the field. That resize was
        // changing the transcript spacer and shaking the messages above.
        setInputHeight((current) => (Math.abs(current - next) < 8 ? current : next));
      }}
      onSubmitEditing={action}
      onKeyPress={
        Platform.OS === "web"
          ? (event) => {
              const native = event.nativeEvent as {
                key?: string;
                keyCode?: number;
                isComposing?: boolean;
                shiftKey?: boolean;
              };
              if (native.key !== "Enter" || native.shiftKey) return;
              // 输入法用回车确认候选。这时不要 preventDefault，把按键留给输入法。
              if (
                enterConfirmsIme(
                  { keyCode: native.keyCode, isComposing: native.isComposing },
                  { composing: composing.current, compositionEndedAt: compositionEndedAt.current },
                  Date.now(),
                )
              )
                return;
              event.preventDefault();
              action();
            }
          : undefined
      }
      key={placeholder}
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
        width: controlSize,
        height: controlSize,
        flexShrink: 0,
        borderRadius: radius.full,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: busy || canSubmit ? 0 : 1,
        borderColor: semantic.controlBorder,
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
            position: "relative",
            backgroundColor: colors.paper,
            borderRadius: composerRadius,
            borderWidth: 1,
            borderColor: focused ? colors.primary : colors.line,
            padding: composerMetrics.padding,
            minHeight: composerMetrics.minHeight,
            ...shadow.composer,
          },
          style,
        ]}
        onLayout={(event) => {
          const next = Math.ceil(event.nativeEvent.layout.height);
          setShellHeight((current) => (Math.abs(current - next) < 1 ? current : next));
        }}
      >
        {cornerButton}
        {attachments}
        <View
          style={{
            flexDirection: "row",
            alignItems: grown ? "flex-end" : "center",
            flexWrap: "nowrap",
            gap: 4,
          }}
        >
          <View style={{ position: "relative", zIndex: 10, flexShrink: 0 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tools[0]?.label}
              accessibilityState={{ expanded: toolsOpen }}
              onPress={() => setToolsOpen(!toolsOpen)}
              style={({ pressed }) => ({
                width: controlSize,
                height: controlSize,
                flexShrink: 0,
                borderRadius: radius.control,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: toolsOpen || pressed ? colors.overlay2 : "transparent",
              })}
            >
              <Plus size={19} color={colors.muted} />
            </Pressable>
            {toolsOpen && (
              <View
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: 0,
                  minWidth: 200,
                  marginBottom: 10,
                  padding: 4,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: radius.card,
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
                      gap: 8,
                      minHeight: 36,
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                      borderRadius: radius.badge,
                      backgroundColor: pressed ? colors.overlay1 : "transparent",
                    })}
                  >
                    <Icon size={16} color={colors.muted} />
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
          position: "relative",
          backgroundColor: colors.paper,
          borderRadius: composerMetrics.pillRadius,
          borderWidth: 1,
          borderColor: focused ? colors.primary : colors.line,
          padding: dense ? composerMetrics.padding : 8,
          ...shadow.composer,
        },
        style,
      ]}
    >
      {cornerButton}
      {attachments}
      {input}
      <View
        style={{
          minHeight: 32,
          marginTop: 6,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 2 }}>
          {tools.map(({ key, icon: Icon, label, onPress, active }) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: !!active }}
              hitSlop={6}
              onPress={onPress}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: radius.control,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: active || pressed ? colors.overlay1 : "transparent",
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
