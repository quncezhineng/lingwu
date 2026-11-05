import { Pressable, View } from "react-native";
import { agentLayout } from "./agent-layout";
import { AgentOrb } from "./agent-orb";
import type { AgentAvatarId } from "./agent-space-model";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import { Menu, MoreHorizontal } from "./icons";
import { colors, radius, shadow } from "./theme";

const top = 12;
const height = 44;

/** Scroll content starts below the controls, but its viewport extends underneath them. */
export function floatingHeaderClearance() {
  return top + height + 16;
}

export function AgentFloatingHeader({
  name,
  role,
  avatar,
  persistentNavigation,
  onMenu,
  onManage,
  onMore,
}: {
  name: string;
  role: string;
  avatar: AgentAvatarId;
  persistentNavigation: boolean;
  onMenu: () => void;
  onManage: () => void;
  onMore: () => void;
}) {
  const { t } = useTranslation();
  const label = role ? `${name} · ${role}` : name;
  return (
    <View
      testID="agent-floating-header"
      pointerEvents="box-none"
      style={{ position: "absolute", top, left: 0, right: 0, alignItems: "center", zIndex: 20 }}
    >
      <View
        pointerEvents="box-none"
        style={{
          width: "100%",
          maxWidth: agentLayout.columnMaxWidth,
          height,
          paddingHorizontal: 17,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <View pointerEvents="box-none" style={{ width: height, alignItems: "flex-start" }}>
          {!persistentNavigation && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("agentSpace.chooseAgent")}
              onPress={onMenu}
              style={({ pressed }) => ({
                width: height,
                height,
                borderRadius: radius.full,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? colors.surface : colors.paper,
                borderWidth: 1,
                borderColor: colors.lineSoft,
                ...shadow.card,
              })}
            >
              <Menu size={20} color={colors.text} />
            </Pressable>
          )}
        </View>
        <View pointerEvents="box-none" style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
          <Pressable
            testID="agent-management-capsule"
            accessibilityRole="button"
            accessibilityLabel={`${label}，${t("agentSpace.agentDetails")}`}
            onPress={onManage}
            style={({ pressed }) => ({
              maxWidth: "100%",
              minHeight: height,
              paddingHorizontal: 13,
              paddingVertical: 7,
              borderRadius: radius.full,
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              borderWidth: 1,
              borderColor: colors.lineSoft,
              backgroundColor: pressed ? colors.surface : colors.paper,
              ...shadow.composer,
            })}
          >
            <AgentOrb avatar={avatar} size={28} />
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontSize: 14,
                lineHeight: 22,
                fontWeight: "500",
                color: colors.text,
              }}
            >
              {label}
            </Text>
          </Pressable>
        </View>
        <View pointerEvents="box-none" style={{ width: height, alignItems: "flex-end" }}>
          {!persistentNavigation && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("agentSpace.more")}
              onPress={onMore}
              style={({ pressed }) => ({
                width: height,
                height,
                borderRadius: radius.full,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? colors.surface : colors.paper,
                borderWidth: 1,
                borderColor: colors.lineSoft,
                ...shadow.card,
              })}
            >
              <MoreHorizontal size={21} color={colors.text} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
