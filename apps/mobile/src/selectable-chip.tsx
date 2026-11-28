/**
 * 可选中胶囊：A1 投资档案 / A2 目标配置 / A3 授权中心共用的枚举选择控件。
 *
 * 与静态展示的 `Chip` 区分：这是可点击的选项，选中态用品牌浅蓝底 + 主色描边。
 */
import { Pressable } from "react-native";
import { Text } from "./app-text";
import { colors, radius, s, semantic, space } from "./ui";

export function SelectableChip({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          paddingHorizontal: space.compact,
          paddingVertical: space.xxs,
          borderRadius: radius.full,
          borderWidth: 1,
          minHeight: 32,
          justifyContent: "center",
          opacity: disabled ? 0.5 : 1,
        },
        active
          ? { backgroundColor: colors.sky, borderColor: colors.primary }
          : { backgroundColor: semantic.card, borderColor: colors.line },
      ]}
    >
      <Text style={[s.small, { color: active ? colors.primaryStrong : colors.muted }]}>
        {label}
      </Text>
    </Pressable>
  );
}
