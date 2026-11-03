import { useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "./app-text";
import { activeLocaleTag, useTranslation } from "./i18n";
import { ArrowUpRight, Plus } from "./icons";
import { activeWatchlist, loadWatchlists, useWatchlistState } from "./market";
import { directionOf, formatPercent } from "./market-format";
import { useQuotes } from "./quotes";
import { colors, fonts, marketDirectionColor, s } from "./ui";
import { useWorkspace } from "./workspace";

/** A compact view of the same selected watchlist used by watchlist management. */
export function WatchlistRail({
  onViewAll,
  onAdd,
  beforeOpenSymbol,
}: {
  onViewAll: () => void;
  onAdd: () => void;
  beforeOpenSymbol?: () => void;
}) {
  const { t, locale } = useTranslation();
  const { api, open } = useWorkspace();
  const state = useWatchlistState();
  const list = activeWatchlist();
  const symbols = useMemo(
    () =>
      state.source === "api"
        ? (list?.symbols ?? []).slice(0, 4).map((item) => item.symbol.code)
        : [],
    [list, state.source],
  );
  const { quotes } = useQuotes(api, symbols, { refreshMs: 60_000 });
  useEffect(() => {
    void loadWatchlists(api, locale);
  }, [api, locale]);

  return (
    <View testID="capability-watchlist" style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, minHeight: 36 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 17,
            fontFamily: fonts.serif,
            fontWeight: "600",
            color: colors.text,
            flexShrink: 1,
          }}
        >
          {t("workbench.myWatchlist")}
        </Text>
        {state.status === "ready" && (
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 7,
              backgroundColor: colors.tertiary,
            }}
          >
            <Text style={[s.metric, { fontSize: 10, color: colors.faint }]}>
              {list?.symbols.length ?? 0}
            </Text>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={onViewAll}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 56,
            minHeight: 36,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 3,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 11, color: colors.primaryStrong }}>
            {t("workbench.viewAll")}
          </Text>
          <ArrowUpRight size={13} color={colors.primaryStrong} />
        </Pressable>
      </View>

      {state.status === "loading" && !list ? (
        <View style={{ minHeight: 88, justifyContent: "center", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={s.small}>{t("common.loading")}</Text>
        </View>
      ) : list?.symbols.length ? (
        <View>
          {list.symbols.slice(0, 4).map((item, index) => {
            const availability = quotes[item.symbol.code];
            // API lists never fall back to locally seeded example prices.
            const quote =
              state.source === "mock"
                ? item.quote
                : availability?.status === "ready"
                  ? availability.quote
                  : undefined;
            const change = quote?.changePercent;
            const price = quote && Number.isFinite(quote.price) ? quote.price : undefined;
            const precision = Math.min(
              6,
              Math.max(
                0,
                Math.trunc(
                  quote?.precision ??
                    (item.symbol.market === "FUND" || (price !== undefined && price < 1) ? 4 : 2),
                ),
              ),
            );
            const venue = /\.(SS|SH|SZ)$/i.test(item.symbol.code)
              ? "CN"
              : /\.HK$/i.test(item.symbol.code)
                ? "HK"
                : item.symbol.market;
            return (
              <Pressable
                key={item.symbol.code}
                accessibilityRole="button"
                accessibilityLabel={`${item.symbol.name} ${item.symbol.code}`}
                onPress={() => {
                  beforeOpenSymbol?.();
                  open({
                    type: "watchlist-symbol",
                    symbol: item.symbol,
                    quote,
                    watchlist: { id: list.id, name: list.name },
                  });
                }}
                style={({ pressed }) => ({
                  minHeight: 77,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 14,
                  paddingHorizontal: 0,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: colors.lineSoft,
                  backgroundColor: pressed ? colors.overlay1 : "transparent",
                })}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 15,
                      lineHeight: 21,
                      fontFamily: fonts.serif,
                      fontWeight: "600",
                      color: colors.text,
                    }}
                  >
                    {item.symbol.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[s.metric, { fontSize: 11, lineHeight: 16, color: colors.faint }]}
                  >
                    {item.symbol.code.replace(/\.(SS|SH|SZ|HK)$/i, "")} · {venue}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", flexShrink: 0, gap: 7 }}>
                  <Text
                    style={[
                      s.metric,
                      {
                        fontSize: 13,
                        lineHeight: 21,
                        color:
                          change === undefined
                            ? colors.faint
                            : marketDirectionColor(directionOf(change)),
                      },
                    ]}
                  >
                    {change === undefined ? "—" : formatPercent(change)}
                  </Text>
                  <Text style={[s.metric, { fontSize: 11, lineHeight: 16, color: colors.faint }]}>
                    {price === undefined
                      ? "—"
                      : new Intl.NumberFormat(activeLocaleTag(), {
                          minimumFractionDigits: precision,
                          maximumFractionDigits: precision,
                        }).format(price)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={[s.small, { lineHeight: 20, paddingVertical: 15 }]}>
          {t("workbench.watchlistEmpty")}
        </Text>
      )}
      {state.status === "ready" && state.source === "mock" && (
        <Text style={[s.small, { fontSize: 10 }]}>{t("markets.watchlistSampleCaption")}</Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: state.status === "loading" }}
        disabled={state.status === "loading"}
        onPress={onAdd}
        style={({ pressed }) => ({
          minHeight: 43,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: colors.lineStrong,
          borderRadius: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
          backgroundColor: pressed ? colors.overlay1 : "transparent",
          opacity: state.status === "loading" ? 0.5 : 1,
        })}
      >
        <Plus size={17} color={colors.faint} />
        <Text style={{ fontSize: 13, color: colors.faint }}>{t("workbench.addWatch")}</Text>
      </Pressable>
    </View>
  );
}
