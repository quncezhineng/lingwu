import { BlurView } from "expo-blur";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { colors } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";

const webBackdrop = {
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  backgroundColor: colors.modalShade,
} as ViewStyle;

/** A stationary backdrop, deliberately outside the animated content layer. */
export function ModalBackdrop() {
  if (Platform.OS === "web")
    return (
      <View
        testID="modal-backdrop"
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, webBackdrop]}
      />
    );
  return (
    <BlurView
      testID="modal-backdrop"
      pointerEvents="none"
      intensity={24}
      tint="default"
      experimentalBlurMethod="dimezisBlurView"
      style={StyleSheet.absoluteFill}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.modalShade }]} />
    </BlurView>
  );
}

/** Show the full-screen backdrop first; only the dialog content moves or fades. */
export function ModalOverlay({
  children,
  visible = true,
  onRequestClose,
  transition = "fade",
}: {
  children: ReactNode;
  visible?: boolean;
  onRequestClose: () => void;
  transition?: "bottom" | "fade" | "none";
}) {
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const showContent = useCallback(() => {
    animation.current?.stop();
    if (reducedMotion || transition === "none") {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    animation.current = Animated.timing(progress, {
      toValue: 1,
      delay: 60,
      duration: transition === "bottom" ? 280 : 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.current.start();
  }, [progress, reducedMotion, transition]);

  useEffect(() => {
    if (!visible || reducedMotion) {
      animation.current?.stop();
      progress.setValue(visible ? 1 : 0);
    }
    return () => animation.current?.stop();
  }, [progress, reducedMotion, visible]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onShow={showContent}
      onRequestClose={onRequestClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={{ flex: 1 }}>
        <ModalBackdrop />
        <Animated.View
          testID="modal-content"
          style={[
            { flex: 1 },
            transition === "bottom" && !reducedMotion
              ? {
                  transform: [
                    {
                      translateY: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [height, 0],
                      }),
                    },
                  ],
                }
              : { opacity: reducedMotion || transition === "none" ? 1 : progress },
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
