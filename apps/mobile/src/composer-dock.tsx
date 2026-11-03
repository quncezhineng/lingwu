import { type ReactNode, useLayoutEffect, useRef } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { agentLayout } from "./agent-layout";
import { colors } from "./theme";

/** An opaque matte base matching the chat canvas, without intercepting scroll. */
export function ComposerMatte() {
  return (
    <View
      testID="composer-matte-background"
      pointerEvents="none"
      style={{
        position: "absolute",
        top: "40%",
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.canvas,
      }}
    />
  );
}

/** The transparent floating layer leaves the transcript viewport full height. */
export function ComposerDock({
  floating,
  keyboardPadding,
  onHeightChange,
  children,
}: {
  floating: boolean;
  keyboardPadding: number;
  onHeightChange: (height: number) => void;
  children: ReactNode;
}) {
  const bodyHeight = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (floating && bodyHeight.current !== null)
      onHeightChange(Math.ceil(bodyHeight.current + keyboardPadding));
  }, [floating, keyboardPadding, onHeightChange]);
  return (
    <KeyboardAvoidingView
      testID={floating ? "floating-composer-dock" : "composer-dock"}
      pointerEvents={floating ? "box-none" : "auto"}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      onLayout={({ nativeEvent: { layout } }) => {
        // Hidden, mounted Agent conversations report zero; keep their last usable size.
        if (floating && layout.height > 0) {
          bodyHeight.current = Math.max(0, layout.height - keyboardPadding);
          onHeightChange(Math.ceil(layout.height));
        }
      }}
      style={[
        { width: "100%", maxWidth: agentLayout.columnMaxWidth, alignSelf: "center" },
        floating && { position: "absolute", bottom: 0, zIndex: 10 },
        keyboardPadding > 0 && { paddingBottom: keyboardPadding },
      ]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
