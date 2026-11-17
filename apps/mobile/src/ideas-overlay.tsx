import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { IdeasScreen } from "./agent-ui";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import { Lightbulb, X } from "./icons";
import { ModalOverlay } from "./modal-overlay";
import { breakpoints, colors, radius, shadow, typography } from "./theme";

/**
 * 灵感浮层：把「灵感」页装进一个居中的大浮层，对话页不离开当前上下文就能挑模板。
 *
 * 智能体对话与频道对话共用同一个浮层；模板点选后如何处理由调用方决定：
 * 不传 `onPickPrompt` 时沿用默认行为（写进工作区草稿并回到智能体对话），
 * 传了则由调用方把文案填进自己的输入框（频道对话就是这种用法）。
 */
export function IdeasOverlay({
  onClose,
  onPickPrompt,
  subtitle,
}: {
  onClose: () => void;
  /** 自定义模板落地方式：拿到模板文案后写进当前对话的输入框，不跳页。 */
  onPickPrompt?: (prompt: string) => void;
  /** 副标题覆写：频道对话里「当前 Agent」的默认措辞不准确。 */
  subtitle?: string;
}) {
  const { width, height } = useWindowDimensions();
  const { t } = useTranslation();
  const desktop = width >= breakpoints.desktop;
  const panelWidth = Math.min(1180, Math.floor(width * (desktop ? 0.8 : 0.92)));
  const panelHeight = Math.min(900, Math.floor(height * (desktop ? 0.8 : 0.9)));
  return (
    <ModalOverlay transition="fade" backdrop="subtle" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: desktop ? 24 : 12,
        }}
      >
        <View
          style={{
            width: panelWidth,
            height: panelHeight,
            maxWidth: "100%",
            maxHeight: "100%",
            overflow: "hidden",
            borderRadius: radius.sheet,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.canvas,
            ...shadow.sheet,
          }}
        >
          <View
            style={{
              height: 54,
              flexShrink: 0,
              paddingHorizontal: 18,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
              backgroundColor: colors.paper,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: radius.control,
                backgroundColor: colors.sky,
              }}
            >
              <Lightbulb size={17} color={colors.primary} />
            </View>
            <Text style={[typography.heading, { flex: 1, fontSize: 16 }]}>
              {t("agentSpace.openIdeasPage")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("ui.closeDetails")}
              onPress={onClose}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: radius.full,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? colors.overlay1 : "transparent",
              })}
            >
              <X size={18} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: desktop ? 26 : 18,
              paddingTop: 22,
              paddingBottom: 34,
            }}
          >
            <IdeasScreen subtitle={subtitle} onUsePrompt={onClose} onPickPrompt={onPickPrompt} />
          </ScrollView>
        </View>
      </View>
    </ModalOverlay>
  );
}
