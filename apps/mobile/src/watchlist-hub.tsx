import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import { PortfolioScreen } from "./portfolio-screen";
import { colors, fonts } from "./theme";
import { WatchlistScreen } from "./watchlist";
import { useWorkspace } from "./workspace";

/**
 * 自选与投资组合共用「我的自选」导航入口，在页面内通过页签切换。
 * 页面模式联动 watchlist / portfolio 路由；内嵌模式只切换弹窗内的内容。
 */
export function WatchlistHubScreen({
  mode = "page",
  onOpenChat,
}: {
  mode?: "page" | "embedded";
  /** 预填提示词后跳转对话：弹层内使用时由调用方关闭弹层。 */
  onOpenChat?: () => void;
} = {}) {
  const { section, navigate } = useWorkspace();
  const { t } = useTranslation();
  const [embeddedTab, setEmbeddedTab] = useState<"watchlist" | "portfolio">("watchlist");
  const activeTab =
    mode === "embedded" ? embeddedTab : section === "portfolio" ? "portfolio" : "watchlist";
  const tabs = [
    { id: "watchlist" as const, label: t("app.titleWatchlist") },
    { id: "portfolio" as const, label: t("app.titlePortfolio") },
  ];

  return (
    <View style={{ gap: 16 }}>
      <Text
        numberOfLines={2}
        style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 20, color: colors.faint }}
      >
        {t("agentSpace.watchlistPageDescription")}
      </Text>
      <View
        accessibilityLabel={`${t("app.titleWatchlist")} / ${t("app.titlePortfolio")}`}
        style={{
          flexDirection: "row",
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
        }}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (mode === "embedded") setEmbeddedTab(tab.id);
                else navigate(tab.id);
              }}
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: "center",
                marginRight: 28,
                paddingHorizontal: 2,
                borderBottomWidth: 2,
                borderBottomColor: active ? colors.primary : "transparent",
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: active ? "600" : "500",
                  color: active ? colors.primaryStrong : colors.muted,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeTab === "portfolio" ? (
        <PortfolioScreen embedded={mode === "embedded"} />
      ) : (
        <WatchlistScreen embedded={mode === "embedded"} onOpenChat={onOpenChat} />
      )}
    </View>
  );
}
