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
import { colors, motion } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";

/** 背板只做一层轻微虚化，层级由面板的 1px 描边承担（shadcn Dialog 的做法）。 */
const webBackdrop = {
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  backgroundColor: colors.modalShade,
} as ViewStyle;

/** A stationary backdrop, deliberately outside the animated content layer. */
export function ModalBackdrop({ subtle = false }: { subtle?: boolean }) {
  const backgroundColor = subtle ? "rgba(24,24,24,0.14)" : colors.modalShade;
  if (Platform.OS === "web")
    return (
      <View
        testID="modal-backdrop"
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, subtle ? { backgroundColor } : webBackdrop]}
      />
    );
  return (
    <BlurView
      testID="modal-backdrop"
      pointerEvents="none"
      intensity={subtle ? 6 : 16}
      tint="default"
      experimentalBlurMethod="dimezisBlurView"
      style={StyleSheet.absoluteFill}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor }]} />
    </BlurView>
  );
}

/** Show the full-screen backdrop first; only the dialog content moves or fades. */
export function ModalOverlay({
  children,
  visible = true,
  onRequestClose,
  transition = "fade",
  backdrop = "dimmed",
}: {
  children: ReactNode;
  visible?: boolean;
  onRequestClose: () => void;
  transition?: "bottom" | "fade" | "none";
  backdrop?: "dimmed" | "subtle";
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
      duration: transition === "bottom" ? motion.base : motion.fast,
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
        <ModalBackdrop subtle={backdrop === "subtle"} />
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
