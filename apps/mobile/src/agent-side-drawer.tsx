import { type ReactNode, useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { agentLayout } from "./agent-layout";
import { ModalOverlay } from "./modal-overlay";
import { colors } from "./ui";
import { useReducedMotion } from "./use-reduced-motion";

/** The fixed backdrop appears first; the left/right panel slides independently. */
export function AgentSideDrawer({
  side,
  onClose,
  closeLabel,
  children,
}: {
  side: "left" | "right";
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.88, agentLayout.drawerMaxWidth);
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay: 60,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion]);
  return (
    <ModalOverlay onRequestClose={onClose} transition="none">
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          justifyContent: side === "left" ? "flex-start" : "flex-end",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={{
            width: drawerWidth,
            height: "100%",
            backgroundColor: colors.surfaceRaised,
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [drawerWidth * (side === "left" ? -1 : 1), 0],
                }),
              },
            ],
          }}
        >
          {children}
        </Animated.View>
      </View>
    </ModalOverlay>
  );
}
