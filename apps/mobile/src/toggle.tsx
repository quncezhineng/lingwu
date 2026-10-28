import { useEffect, useRef } from "react";
import { Animated, Pressable, type StyleProp, View, type ViewStyle } from "react-native";
import { colors, radius } from "./theme";

const TRACK_WIDTH = 32;
const TRACK_HEIGHT = 19;
const THUMB = 15;
const PAD = 2;
const TRAVEL = TRACK_WIDTH - THUMB - PAD * 2;

/**
 * 开关：自绘 32×19 轨道 + 15px 白色圆钮。
 *
 * 不使用 RN core `Switch`：它在 react-native-web 上的实际渲染与 props 不一致
 * （轨道色与钮色错位、钮会溢出轨道）。这里统一视觉，同时保留 44×44 触控热区。
 * P1-7 的连接卡与提醒开关复用同一组件。
 */
export function Toggle({
  value,
  onValueChange,
  disabled,
  label,
  style,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  /** 无障碍标签。 */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [value, progress]);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onPress={() => onValueChange(!value)}
      style={[{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }, style]}
    >
      <View
        style={{
          width: TRACK_WIDTH,
          height: TRACK_HEIGHT,
          borderRadius: radius.full,
          padding: PAD,
          justifyContent: "center",
          backgroundColor: value ? colors.primary : colors.lineStrong,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Animated.View
          style={{
            width: THUMB,
            height: THUMB,
            borderRadius: radius.full,
            backgroundColor: colors.paper,
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, TRAVEL],
                }),
              },
            ],
          }}
        />
      </View>
    </Pressable>
  );
}
