import { Pressable, View } from "react-native";
import { Text } from "./app-text";
import { Check } from "./icons";
import { radius, semantic, space, textScale } from "./theme";

/** 一组可点选标签：用于档案范围、授权维度等「少量枚举多选/单选」。 */
export function SelectableChipGroup<T extends string>({
  options,
  value,
  onChange,
  multiple = true,
  disabled = false,
}: {
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onChange: (next: T[]) => void;
  /** 缺省多选；单选时点击会替换当前项。 */
  multiple?: boolean;
  disabled?: boolean;
}) {
  function toggle(option: T) {
    if (disabled) return;
    if (!multiple) {
      onChange([option]);
      return;
    }
    onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option]);
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => toggle(option.value)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: space.hairline,
              paddingHorizontal: space.sm,
              paddingVertical: space.compact,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: selected ? semantic.primary : semantic.border,
              backgroundColor: selected ? semantic.primary : semantic.card,
              opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
            })}
          >
            {selected && <Check size={12} color={semantic.primaryForeground} strokeWidth={2} />}
            <Text
              style={[
                textScale.markMedium,
                { color: selected ? semantic.primaryForeground : semantic.foreground },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
