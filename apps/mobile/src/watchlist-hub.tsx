import { Pressable, Text, View } from "react-native";
import { useTranslation } from "./i18n";
import { PortfolioScreen } from "./portfolio-screen";
import { colors } from "./ui";
import { WatchlistScreen } from "./watchlist";
import { useWorkspace } from "./workspace";

/**
 * 自选与投资组合共用「我的自选」导航入口，在页面内通过页签切换。
 * 路由仍保留 watchlist / portfolio 两个 section，便于直达与页面标题联动。
 */
export function WatchlistHubScreen() {
  const { section, navigate } = useWorkspace();
  const { t } = useTranslation();
  const tabs = [
    { id: "watchlist" as const, label: t("app.titleWatchlist") },
    { id: "portfolio" as const, label: t("app.titlePortfolio") },
  ];

  return (
    <View style={{ gap: 16 }}>
      <View
        accessibilityLabel={`${t("app.titleWatchlist")} / ${t("app.titlePortfolio")}`}
        style={{
          flexDirection: "row",
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
        }}
      >
        {tabs.map((tab) => {
          const active = section === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => navigate(tab.id)}
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

      {section === "portfolio" ? <PortfolioScreen /> : <WatchlistScreen />}
    </View>
  );
}
