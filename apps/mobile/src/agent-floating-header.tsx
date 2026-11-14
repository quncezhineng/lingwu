import { useState } from "react";
import { Pressable, View } from "react-native";
import { agentLayout } from "./agent-layout";
import { AgentOrb } from "./agent-orb";
import type { AgentAvatarId } from "./agent-space-model";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import { ChevronLeft, ChevronRight, Menu } from "./icons";
import { MOBILE_CONTROL, mobileGlassStyle } from "./mobile-chrome";
import { colors, elevation, radius, semantic, sizing, space } from "./theme";
import { HoverPressable } from "./ui";

/** 悬浮头与内容列的间距、尺寸统一走 TDesign 4px 栅格与控件尺寸刻度。 */
const top = space.sm;
const height = sizing.touch;
/** 桌面圆形控件直径：低于胶囊高度，让中间的 Agent 身份成为唯一焦点。 */
const control = sizing.inputMd;

/** Scroll content starts below the controls, but its viewport extends underneath them. */
export function floatingHeaderClearance() {
  return top + height + space.md;
}

/**
 * 悬浮顶栏：左侧菜单、中间 Agent 身份胶囊。
 *
 * 窄屏不再放右侧展开按钮，整页侧栏只从这颗头像进入。
 * 只有胶囊带一层极淡阴影（表示浮在对话之上）。
 */
export function AgentFloatingHeader({
  name,
  role,
  avatar,
  persistentNavigation,
  onMenu,
  onBack,
  onIdentity,
}: {
  name: string;
  role: string;
  avatar: AgentAvatarId;
  persistentNavigation: boolean;
  onMenu: () => void;
  /** 手机 bot 页：圆形返回，回到 bots 首页。 */
  onBack?: () => void;
  /** 桌面展开右侧栏；窄屏打开整页侧栏。 */
  onIdentity: () => void;
}) {
  const { t } = useTranslation();
  const label = role ? `${name} · ${role}` : name;
  const [hovered, setHovered] = useState(false);
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
          paddingHorizontal: space.md,
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
        }}
      >
        <View
          pointerEvents="box-none"
          style={{ width: onBack ? MOBILE_CONTROL : control, alignItems: "flex-start" }}
        >
          {!persistentNavigation && (
            <Pressable
              testID={onBack ? "mobile-bot-back" : "mobile-agent-menu"}
              accessibilityRole="button"
              accessibilityLabel={t(onBack ? "agentSpace.backToBots" : "agentSpace.chooseAgent")}
              onPress={onBack ?? onMenu}
              style={({ pressed }) =>
                onBack
                  ? [
                      mobileGlassStyle(pressed),
                      {
                        width: MOBILE_CONTROL,
                        height: MOBILE_CONTROL,
                        borderRadius: radius.full,
                        alignItems: "center",
                        justifyContent: "center",
                      },
                    ]
                  : {
                      width: control,
                      height: control,
                      borderRadius: radius.control,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: pressed ? colors.surface : colors.paper,
                      borderWidth: 1,
                      borderColor: semantic.controlBorder,
                    }
              }
            >
              {onBack ? (
                <ChevronLeft size={22} color={colors.text} />
              ) : (
                <Menu size={18} color={colors.muted} />
              )}
            </Pressable>
          )}
        </View>
        <View pointerEvents="box-none" style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
          <View collapsable={false}>
            <HoverPressable
              testID="agent-management-capsule"
              accessibilityRole="button"
              accessibilityLabel={`${label}，${t(persistentNavigation ? "agentSpace.expandRail" : "agentSpace.openSidePage")}`}
              onPress={onIdentity}
              onHoverIn={() => setHovered(true)}
              onHoverOut={() => setHovered(false)}
              style={({ pressed }) => ({
                maxWidth: "100%",
                // 手机返回按钮是 44。胶囊与它对齐，头像和字号跟着长高。
                height: onBack ? MOBILE_CONTROL : undefined,
                minHeight: onBack ? MOBILE_CONTROL : sizing.controlLg,
                paddingLeft: space.compact,
                paddingRight: hovered ? space.tight : onBack ? space.sm : space.md,
                paddingVertical: onBack ? 0 : space.xxs,
                borderRadius: radius.circle,
                flexDirection: "row",
                alignItems: "center",
                gap: space.xs,
                borderWidth: 1,
                borderColor: semantic.controlBorder,
                backgroundColor: pressed ? colors.surface : colors.paper,
                ...elevation.level1,
              })}
            >
              <AgentOrb avatar={avatar} size={onBack ? 32 : 28} />
              <Text
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  fontSize: onBack ? 15 : 13,
                  lineHeight: onBack ? 22 : 20,
                  fontWeight: onBack ? "600" : "500",
                  color: colors.text,
                }}
              >
                {label}
              </Text>
              {hovered && <ChevronRight size={16} color={colors.muted} />}
            </HoverPressable>
          </View>
        </View>
        <View pointerEvents="box-none" style={{ width: onBack ? MOBILE_CONTROL : control }} />
      </View>
    </View>
  );
}
