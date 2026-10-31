import { Pressable, Text, View } from "react-native";
import { colors, fonts } from "./theme";

export type HubTabItem<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

/** 一级聚合页里的二级分段：保持现有细线、蓝线和留白体系。 */
export function HubTabs<T extends string>({
  items,
  active,
  onChange,
}: {
  items: ReadonlyArray<HubTabItem<T>>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(item.id)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderBottomWidth: 2,
              borderBottomColor: selected ? colors.primary : "transparent",
              backgroundColor: pressed ? colors.overlay1 : "transparent",
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text
                style={{
                  color: selected ? colors.primaryStrong : colors.muted,
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  lineHeight: 20,
                  fontWeight: selected ? "600" : "500",
                }}
              >
                {item.label}
              </Text>
              {typeof item.count === "number" && item.count > 0 && (
                <Text
                  style={{
                    color: selected ? colors.primary : colors.faint,
                    fontSize: 10,
                    lineHeight: 16,
                  }}
                >
                  {item.count}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
