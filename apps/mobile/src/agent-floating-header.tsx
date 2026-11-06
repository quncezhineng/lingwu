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
/** 圆形控件直径：低于胶囊高度，让中间的 Agent 身份成为唯一焦点。 */
const control = 36;

/** Scroll content starts below the controls, but its viewport extends underneath them. */
export function floatingHeaderClearance() {
  return top + height + 16;
}

/**
 * 悬浮顶栏：左侧菜单、中间 Agent 身份胶囊、右侧更多。
 *
 * 只有胶囊带一层极淡阴影（表示浮在对话之上），两侧控件仅用描边和悬停底色，
 * 避免三个元素各带一层阴影把顶栏糊成灰带。
 */
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
        <View pointerEvents="box-none" style={{ width: control, alignItems: "flex-start" }}>
          {!persistentNavigation && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("agentSpace.chooseAgent")}
              onPress={onMenu}
              style={({ pressed }) => ({
                width: control,
                height: control,
                borderRadius: radius.control,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? colors.surface : colors.paper,
                borderWidth: 1,
                borderColor: colors.lineSoft,
              })}
            >
              <Menu size={18} color={colors.muted} />
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
              minHeight: 38,
              paddingLeft: 6,
              paddingRight: 14,
              paddingVertical: 4,
              borderRadius: radius.full,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              borderWidth: 1,
              borderColor: colors.lineSoft,
              backgroundColor: pressed ? colors.surface : colors.paper,
              ...shadow.card,
            })}
          >
            <AgentOrb avatar={avatar} size={28} />
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontSize: 13,
                lineHeight: 20,
                fontWeight: "500",
                color: colors.text,
              }}
            >
              {label}
            </Text>
          </Pressable>
        </View>
        <View pointerEvents="box-none" style={{ width: control, alignItems: "flex-end" }}>
          {!persistentNavigation && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("agentSpace.more")}
              onPress={onMore}
              style={({ pressed }) => ({
                width: control,
                height: control,
                borderRadius: radius.control,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? colors.surface : colors.paper,
                borderWidth: 1,
                borderColor: colors.lineSoft,
              })}
            >
              <MoreHorizontal size={19} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
