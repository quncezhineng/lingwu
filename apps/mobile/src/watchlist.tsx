/**
 * F1 — 观察列表（WatchlistScreen）。
 *
 * 结构对齐 UI 规格 D1：列表切换 → 搜索（300ms 防抖 + 下拉匹配）→ 市场分组标签
 * → 标的行情卡片网格（移动端 1 列 / 平板 2 列 / 桌面 3 列）。
 * 数据来自 `market.ts` 的内存 store（真实接口优先、mock 兜底），行情每 60s 刷新一次。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Platform,
  Pressable,
  type StyleProp,
  Text,
  TextInput,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import type { LingWuApi } from "./api";
import { activeLocaleTag, type TranslationKey, useTranslation } from "./i18n";
import {
  Activity,
  Check,
  CircleDollarSign,
  FileText,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Target,
  X,
} from "./icons";
import {
  activeWatchlist,
  addSymbols,
  createWatchlist,
  deleteWatchlist,
  loadWatchlists,
  type MarketKind,
  refreshWatchlists,
  type SymbolAlert,
  type SymbolMeta,
  searchSymbols,
  selectWatchlist,
  updateWatchlist,
  useWatchlistState,
  type WatchlistSymbol,
} from "./market";
import {
  currencySymbol,
  defaultCurrency,
  directionOf,
  formatPercent,
  formatPrice,
} from "./market-format";
import {
  Button,
  Card,
  colors,
  DisclaimerNote,
  Empty,
  ErrorNotice,
  IconButton,
  marketDirectionColor,
  Sheet,
  s,
} from "./ui";
import { useWorkspace } from "./workspace";

const MARKET_FILTERS: ReadonlyArray<{ id: MarketKind | "all"; labelKey: TranslationKey }> = [
  { id: "all", labelKey: "markets.marketAll" },
  { id: "US", labelKey: "markets.marketUS" },
  { id: "CN", labelKey: "markets.marketCN" },
  { id: "HK", labelKey: "markets.marketHK" },
  { id: "ETF", labelKey: "markets.marketETF" },
];

const MARKET_LABEL = {
  US: "markets.marketUS",
  CN: "markets.marketCN",
  HK: "markets.marketHK",
  ETF: "markets.marketETF",
} as const satisfies Record<MarketKind, TranslationKey>;

/** 骨架屏的呼吸动画；尊重「减少动态效果」偏好。 */
function useShimmer() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        ]),
      );
      animation.start();
    });
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [opacity]);
  return opacity;
}

function SkeletonCard({ shimmer }: { shimmer: Animated.Value }) {
  const bar = (width: `${number}%`, height: number) => (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: 4,
        backgroundColor: colors.tertiary,
        opacity: shimmer,
      }}
    />
  );
  return (
    <Card style={{ gap: 10, minHeight: 88 }}>
      <View style={s.between}>
        {bar("34%", 14)}
        {bar("22%", 18)}
      </View>
      <View style={s.between}>
        {bar("46%", 11)}
        {bar("18%", 11)}
      </View>
    </Card>
  );
}

function AlertBadge({ alert }: { alert: SymbolAlert }) {
  const { t } = useTranslation();
  const config = (() => {
    switch (alert.kind) {
      case "price_break":
        return {
          color: colors.danger,
          background: colors.errorSoft,
          icon: <View style={dotStyle} />,
          label: t("markets.alertPriceBreak", {
            level: alert.level === undefined ? "" : alert.level.toFixed(2),
          }),
        };
      case "change_threshold": {
        const dir = directionOf(alert.threshold ?? 0);
        return {
          color: marketDirectionColor(dir),
          background: dir === "down" ? colors.marketDownSurface : colors.marketUpSurface,
          icon: (
            <Text style={{ fontSize: 9, color: marketDirectionColor(dir) }}>
              {dir === "down" ? "▼" : dir === "up" ? "▲" : "—"}
            </Text>
          ),
          label: t(dir === "down" ? "markets.alertChangeDown" : "markets.alertChangeUp"),
        };
      }
      case "volume_spike":
        return {
          color: colors.alertVolumeText,
          background: colors.alertVolumeSurface,
          icon: <Activity size={12} strokeWidth={2} color={colors.alertVolume} />,
          label: t("markets.alertVolumeSpike", { multiple: (alert.multiple ?? 2).toFixed(1) }),
        };
      default:
        return {
          color: colors.primary,
          background: colors.sky,
          icon: <FileText size={12} strokeWidth={1.8} color={colors.primary} />,
          label: alert.headline
            ? t("markets.alertNews", { headline: alert.headline })
            : t("markets.alertNews", { headline: "" }),
        };
    }
  })();
  return (
    <View
      style={[
        s.row,
        {
          gap: 5,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 4,
          backgroundColor: config.background,
          alignSelf: "flex-start",
          maxWidth: "100%",
        },
      ]}
    >
      {config.icon}
      <Text numberOfLines={1} style={{ fontSize: 11, color: config.color, flexShrink: 1 }}>
        {config.label}
      </Text>
    </View>
  );
}

const dotStyle = {
  width: 8,
  height: 8,
  borderRadius: 999,
  backgroundColor: colors.danger,
} as const;

function SymbolCard({
  item,
  style,
  compact,
  onPress,
}: {
  item: WatchlistSymbol;
  style?: StyleProp<ViewStyle>;
  /** 移动端单列时用两行布局，避免价格与涨跌幅互相挤压。 */
  compact?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { symbol, quote, alerts, unavailable } = item;
  const currency = quote?.currency ?? defaultCurrency(symbol.market);
  const dayDirection = directionOf(quote?.changePercent ?? 0);
  const weekDirection = directionOf(quote?.weekChangePercent ?? 0);
  const dayColor = marketDirectionColor(dayDirection);
  const arrow = dayDirection === "up" ? "▲" : dayDirection === "down" ? "▼" : "—";
  const alert = alerts[0];
  const priceText = quote ? formatPrice(quote.price, currency) : "—";
  const changeText =
    quote?.change === undefined
      ? "—"
      : `${quote.change >= 0 ? "+" : "-"}${currencySymbol(currency)}${Math.abs(quote.change).toFixed(2)}`;
  const percentText = quote?.changePercent === undefined ? "—" : formatPercent(quote.changePercent);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${symbol.code} ${symbol.name}, ${priceText}, ${percentText}`}
      onPress={onPress}
      style={({ pressed }) => [s.card, style, pressed && { backgroundColor: colors.overlay1 }]}
    >
      {compact ? (
        <View style={{ gap: 8 }}>
          <View style={s.between}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[s.heading, { fontSize: 16 }]} numberOfLines={1}>
                {symbol.code}
              </Text>
              <Text style={[s.muted, { fontSize: 13, lineHeight: 19 }]} numberOfLines={1}>
                {symbol.name}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              <Text style={[s.metric, { fontSize: 19, fontWeight: "600", color: colors.text }]}>
                {priceText}
              </Text>
              <Text style={[s.metric, { fontSize: 11, color: dayColor }]}>
                {t("markets.dayChange", { value: changeText })}
              </Text>
            </View>
          </View>
          <View style={[s.between, { gap: 8 }]}>
            {quote?.weekChangePercent !== undefined ? (
              <Text style={[s.metric, s.small, { color: marketDirectionColor(weekDirection) }]}>
                {t("markets.weekChange", { value: formatPercent(quote.weekChangePercent) })}
              </Text>
            ) : (
              <View />
            )}
            <Text style={[s.metric, { fontSize: 16, fontWeight: "600", color: dayColor }]}>
              {arrow} {percentText}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[s.row, { alignItems: "flex-start", gap: 8 }]}>
          <View style={{ flex: 2, gap: 2, minWidth: 0 }}>
            <Text style={[s.heading, { fontSize: 16 }]} numberOfLines={1}>
              {symbol.code}
            </Text>
            <Text style={[s.muted, { fontSize: 13, lineHeight: 19 }]} numberOfLines={1}>
              {symbol.name}
            </Text>
          </View>
          <View style={{ flex: 1.5, alignItems: "flex-end", gap: 2 }}>
            <Text style={[s.metric, { fontSize: 19, fontWeight: "600", color: colors.text }]}>
              {priceText}
            </Text>
            <Text style={[s.metric, { fontSize: 11, color: dayColor }]}>
              {t("markets.dayChange", { value: changeText })}
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
            <Text style={[s.metric, { fontSize: 16, fontWeight: "600", color: dayColor }]}>
              {arrow} {percentText}
            </Text>
            {quote?.weekChangePercent !== undefined && (
              <Text
                style={[s.metric, { fontSize: 11, color: marketDirectionColor(weekDirection) }]}
                numberOfLines={1}
              >
                {t("markets.weekChange", { value: formatPercent(quote.weekChangePercent) })}
              </Text>
            )}
          </View>
        </View>
      )}
      {(alert || unavailable || !quote) && (
        <View
          style={{ borderTopWidth: 1, borderTopColor: colors.line, marginTop: 12, paddingTop: 8 }}
        >
          {alert ? (
            <AlertBadge alert={alert} />
          ) : (
            <Text style={s.small}>
              {t(unavailable ? "markets.quoteUnavailable" : "markets.loading")}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

/** 搜索栏 + 下拉匹配面板。 */
function SymbolSearch({
  value,
  onChange,
  results,
  onAdd,
  isAdded,
  placeholder,
  emptyLabel,
  hint,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  results: SymbolMeta[];
  onAdd: (symbol: SymbolMeta) => void;
  isAdded: (code: string) => boolean;
  placeholder: string;
  emptyLabel: string;
  hint: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPanel = focused && value.trim().length > 0;
  // 窄屏内嵌展开（避免被 ScrollView 裁剪），宽屏用浮层下拉。
  const overlay = width >= 600;
  return (
    <View style={{ position: "relative", zIndex: 30 }}>
      <View
        style={[
          s.row,
          {
            gap: 8,
            borderWidth: 1,
            borderColor: focused ? colors.primary : colors.line,
            borderRadius: 10,
            paddingHorizontal: 12,
            minHeight: 44,
            backgroundColor: colors.canvas,
          },
        ]}
      >
        <Search size={17} strokeWidth={1.8} color={colors.faint} />
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setFocused(true);
          }}
          onBlur={() => {
            // 延迟失焦，避免点击「添加」时面板先卸载导致点击丢失。
            blurTimer.current = setTimeout(() => setFocused(false), 160);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          accessibilityLabel={placeholder}
          autoFocus={autoFocus}
          autoCapitalize="characters"
          style={[
            { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 8 },
            // 聚焦态已由容器 1px 品牌色描边表达，web 端去掉浏览器默认 outline。
            Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as TextStyle) : null,
          ]}
        />
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("ui.closeDetails")}
            onPress={() => onChange("")}
            style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}
          >
            <X size={15} strokeWidth={1.8} color={colors.faint} />
          </Pressable>
        ) : null}
      </View>
      {showPanel && (
        <View
          style={{
            position: overlay ? "absolute" : "relative",
            top: overlay ? 50 : 0,
            marginTop: overlay ? 0 : 8,
            left: 0,
            right: 0,
            maxHeight: 280,
            backgroundColor: colors.canvas,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 10,
            overflow: "hidden",
            zIndex: 40,
          }}
        >
          {results.length ? (
            results.map((symbol, index) => {
              const added = isAdded(symbol.code);
              return (
                <View
                  key={symbol.code}
                  style={[
                    s.row,
                    {
                      gap: 10,
                      paddingHorizontal: 12,
                      minHeight: 52,
                      borderTopWidth: index ? 1 : 0,
                      borderTopColor: colors.line,
                    },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.text, { fontSize: 14, fontWeight: "600" }]} numberOfLines={1}>
                      {symbol.code}
                    </Text>
                    <Text style={[s.muted, { fontSize: 12 }]} numberOfLines={1}>
                      {symbol.name}
                    </Text>
                  </View>
                  <View style={[s.chip, { backgroundColor: colors.surface }]}>
                    <Text style={s.chipText}>{t(MARKET_LABEL[symbol.market])}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={added}
                    accessibilityState={{ disabled: added }}
                    accessibilityLabel={
                      added ? t("markets.watchlistAdded") : t("markets.watchlistAdd")
                    }
                    onPressIn={() => {
                      if (blurTimer.current) clearTimeout(blurTimer.current);
                    }}
                    onPress={() => onAdd(symbol)}
                    style={({ pressed }) => [
                      s.row,
                      {
                        gap: 4,
                        paddingHorizontal: 10,
                        minHeight: 32,
                        minWidth: 64,
                        justifyContent: "center",
                        borderRadius: 999,
                        backgroundColor: added ? colors.surface : colors.sky,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    {added && <Check size={12} strokeWidth={2} color={colors.muted} />}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: added ? colors.muted : colors.primary,
                      }}
                    >
                      {added ? t("markets.watchlistAdded") : t("markets.watchlistAdd")}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          ) : (
            <View style={{ padding: 14 }}>
              <Text style={[s.muted, { fontSize: 13 }]}>
                {value.trim().length > 0 ? emptyLabel : hint}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function SegmentedTabs({
  counts,
  active,
  onChange,
}: {
  counts: Record<string, number>;
  active: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        s.row,
        {
          gap: 8,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
          flexWrap: "wrap",
        },
      ]}
    >
      {MARKET_FILTERS.map((filter) => {
        const selected = filter.id === active;
        const count = counts[filter.id] ?? 0;
        return (
          <Pressable
            key={filter.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(filter.id)}
            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
            style={({ pressed }) => [
              s.row,
              {
                gap: 5,
                paddingHorizontal: 12,
                minHeight: 36,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.line,
                backgroundColor: selected ? colors.sky : colors.surface,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: selected ? colors.primary : colors.muted,
              }}
            >
              {t(filter.labelKey)}
            </Text>
            <Text style={{ fontSize: 11, color: selected ? colors.primary : colors.faint }}>
              {count}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ConfirmDialog({
  title,
  detail,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  detail: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={s.modalShade}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[s.card, { maxWidth: 360, width: "100%", padding: 24, gap: 12 }]}
        >
          <Text style={s.heading}>{title}</Text>
          <Text style={s.muted}>{detail}</Text>
          <View style={[s.row, { gap: 12, marginTop: 8 }]}>
            <Button style={{ flex: 1 }} onPress={onCancel}>
              {cancelLabel}
            </Button>
            <Button danger style={{ flex: 1 }} onPress={onConfirm}>
              {confirmLabel}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 列表操作菜单（⋯）：编辑 / 删除。 */
function ListMenu({
  onEdit,
  onDelete,
  onClose,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const rows: Array<{ label: string; danger?: boolean; onPress: () => void }> = [
    { label: t("markets.watchlistEditAction"), onPress: onEdit },
    { label: t("markets.watchlistDeleteAction"), danger: true, onPress: onDelete },
  ];
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable onPress={onClose} style={s.modalShade}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            top: 96,
            right: 20,
            minWidth: 168,
            backgroundColor: colors.canvas,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {rows.map((row, index) => (
            <Pressable
              key={row.label}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                row.onPress();
              }}
              style={({ pressed }) => ({
                paddingHorizontal: 16,
                minHeight: 44,
                justifyContent: "center",
                borderTopWidth: index ? 1 : 0,
                borderTopColor: colors.line,
                backgroundColor: pressed ? colors.overlay1 : "transparent",
              })}
            >
              <Text style={[s.text, { color: row.danger ? colors.danger : colors.text }]}>
                {row.label}
              </Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 新建 / 编辑列表弹窗。 */
function WatchlistSheet({
  api,
  mode,
  initialName,
  initialSymbols,
  onClose,
  onSubmit,
}: {
  api: LingWuApi;
  mode: "create" | "edit";
  initialName?: string;
  initialSymbols?: SymbolMeta[];
  onClose: () => void;
  onSubmit: (name: string, symbols: SymbolMeta[]) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolMeta[]>([]);
  const [selected, setSelected] = useState<SymbolMeta[]>(initialSymbols ?? []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchSymbols(api, trimmed).then(setResults);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const canSubmit = name.trim().length > 0;
  return (
    <Sheet
      title={t(mode === "create" ? "markets.watchlistCreateTitle" : "markets.watchlistEditTitle")}
      onClose={onClose}
    >
      <Text style={[s.small, { fontWeight: "600", color: colors.text, marginBottom: 7 }]}>
        {t("markets.watchlistNameLabel")}
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t("markets.watchlistNamePlaceholder")}
        placeholderTextColor={colors.faint}
        accessibilityLabel={t("markets.watchlistNameLabel")}
        style={[s.input, { marginBottom: 16 }]}
      />
      <Text style={[s.small, { fontWeight: "600", color: colors.text, marginBottom: 7 }]}>
        {t("markets.watchlistSymbolsLabel")}
      </Text>
      <SymbolSearch
        value={query}
        onChange={setQuery}
        results={results}
        placeholder={t("markets.watchlistSearchPlaceholder")}
        emptyLabel={t("markets.watchlistSearchEmpty")}
        hint={t("markets.watchlistSymbolsHint")}
        isAdded={(code) => selected.some((item) => item.code === code)}
        onAdd={(symbol) => {
          setSelected((current) =>
            current.some((item) => item.code === symbol.code) ? current : [...current, symbol],
          );
          setQuery("");
        }}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        {selected.map((symbol) => (
          <Pressable
            key={symbol.code}
            accessibilityRole="button"
            accessibilityLabel={`${symbol.code} ${symbol.name}`}
            onPress={() =>
              setSelected((current) => current.filter((item) => item.code !== symbol.code))
            }
            style={[s.row, s.chip, { gap: 6, minHeight: 30 }]}
          >
            <Text style={[s.chipText, { fontSize: 11, color: colors.text }]}>{symbol.code}</Text>
            <X size={11} strokeWidth={2} color={colors.faint} />
          </Pressable>
        ))}
      </View>
      <Button
        primary
        disabled={!canSubmit}
        onPress={() => onSubmit(name.trim(), selected)}
        style={{ marginTop: 22 }}
      >
        {t(mode === "create" ? "markets.watchlistCreate" : "markets.watchlistSave")}
      </Button>
    </Sheet>
  );
}

export function WatchlistScreen() {
  const { api, notify, open } = useWorkspace();
  const { t, locale } = useTranslation();
  const { width } = useWindowDimensions();
  const state = useWatchlistState();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolMeta[]>([]);
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [sheet, setSheet] = useState<"create" | "edit" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const shimmer = useShimmer();

  useEffect(() => {
    void loadWatchlists(api, locale);
  }, [api, locale]);

  // 行情刷新：60s 轮询（符合 P0「≤1 分钟」要求）。
  useEffect(() => {
    const timer = setInterval(() => refreshWatchlists(api, locale), 60_000);
    return () => clearInterval(timer);
  }, [api, locale]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchSymbols(api, trimmed).then(setResults);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const list = activeWatchlist();
  const columns = width >= 900 ? 3 : width >= 600 ? 2 : 1;
  const cardWidth = columns === 1 ? "100%" : columns === 2 ? "48%" : "31.5%";

  const counts = useMemo(() => {
    const symbols = list?.symbols ?? [];
    const tally: Record<string, number> = { all: symbols.length, US: 0, CN: 0, HK: 0, ETF: 0 };
    for (const item of symbols) tally[item.symbol.market] = (tally[item.symbol.market] ?? 0) + 1;
    return tally;
  }, [list]);

  const visibleSymbols = useMemo(() => {
    const symbols = list?.symbols ?? [];
    return marketFilter === "all"
      ? symbols
      : symbols.filter((item) => item.symbol.market === marketFilter);
  }, [list, marketFilter]);

  if (state.status === "loading" && !state.lists.length) {
    return (
      <View style={{ gap: 12 }}>
        {[0, 1, 2, 3, 4].map((index) => (
          <SkeletonCard key={index} shimmer={shimmer} />
        ))}
      </View>
    );
  }

  if (!state.lists.length) {
    return (
      <View style={{ gap: 16 }}>
        <ErrorNotice error={state.degraded ? t("markets.watchlistLoadError") : undefined} />
        <Empty
          icon={Target}
          title={t("markets.watchlistEmptyTitle")}
          detail={t("markets.watchlistEmptyDetail")}
        >
          <Button primary icon={Plus} onPress={() => setSheet("create")}>
            {t("markets.watchlistCreateFirst")}
          </Button>
        </Empty>
        {sheet === "create" && (
          <WatchlistSheet
            api={api}
            mode="create"
            onClose={() => setSheet(null)}
            onSubmit={(name, symbols) => {
              createWatchlist(api, { name, symbols });
              setSheet(null);
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {/* 列表切换 + 新建 + 更多 */}
      <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
        <View style={[s.row, { gap: 8, flex: 1, flexWrap: "wrap" }]}>
          {state.lists.map((item) => {
            const selected = item.id === list?.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => selectWatchlist(api, item.id)}
                hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                style={({ pressed }) => [
                  s.row,
                  {
                    gap: 6,
                    paddingHorizontal: 12,
                    minHeight: 36,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.line,
                    backgroundColor: selected ? colors.sky : colors.canvas,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: selected ? "600" : "500",
                    color: selected ? colors.primary : colors.text,
                  }}
                >
                  {item.name}
                </Text>
                <Text style={{ fontSize: 11, color: selected ? colors.primary : colors.faint }}>
                  {item.symbols.length}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Button
          small
          primary
          icon={Plus}
          hitSlop={4}
          style={{ minHeight: 36 }}
          onPress={() => setSheet("create")}
        >
          {t("markets.watchlistNew")}
        </Button>
        <IconButton
          icon={MoreHorizontal}
          label={t("markets.watchlistMore")}
          onPress={() => setMenuOpen(true)}
        />
      </View>

      {state.status === "ready" && state.source === "mock" && (
        <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
          <View style={[s.chip, { backgroundColor: colors.surface }]}>
            <Text style={s.chipText}>{t("markets.watchlistSample")}</Text>
          </View>
          <Text style={[s.small, { flexShrink: 1 }]}>{t("markets.watchlistSampleHint")}</Text>
        </View>
      )}

      <SymbolSearch
        value={query}
        onChange={setQuery}
        results={results}
        placeholder={t("markets.watchlistSearchPlaceholder")}
        emptyLabel={t("markets.watchlistSearchEmpty")}
        hint={t("markets.watchlistSearchHint")}
        isAdded={(code) => !!list?.symbols.some((item) => item.symbol.code === code)}
        onAdd={(symbol) => {
          if (list) addSymbols(api, list.id, [symbol]);
          setQuery("");
        }}
      />

      <SegmentedTabs counts={counts} active={marketFilter} onChange={setMarketFilter} />

      {visibleSymbols.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "stretch" }}>
          {visibleSymbols.map((item) => (
            <SymbolCard
              key={item.symbol.code}
              item={item}
              compact={columns === 1}
              style={{
                width: cardWidth,
                flexGrow: columns === 1 ? 0 : 1,
                minWidth: columns === 3 ? 230 : 240,
              }}
              onPress={() =>
                open({
                  type: "symbol",
                  symbol: item.symbol,
                  quote: item.quote,
                  watchlist: { id: list?.id ?? "", name: list?.name ?? "" },
                })
              }
            />
          ))}
        </View>
      ) : (
        <Empty
          icon={CircleDollarSign}
          title={t("markets.watchlistEmptyListTitle")}
          detail={t("markets.watchlistEmptyListDetail")}
        >
          <Button icon={Search} onPress={() => setSheet("edit")}>
            {t("markets.watchlistAddSymbol")}
          </Button>
        </Empty>
      )}

      <View style={[s.row, { gap: 6, justifyContent: "flex-end" }]}>
        <RefreshCw size={11} strokeWidth={1.8} color={colors.faint} />
        <Text style={s.small}>
          {t("markets.watchlistUpdated", {
            time: new Date(list?.updatedAt ?? new Date().toISOString()).toLocaleTimeString(
              activeLocaleTag(),
              { hour: "numeric", minute: "2-digit" },
            ),
          })}
        </Text>
      </View>
      <DisclaimerNote style={{ marginTop: 0, textAlign: "right" }} />

      {sheet === "create" && (
        <WatchlistSheet
          api={api}
          mode="create"
          onClose={() => setSheet(null)}
          onSubmit={(name, symbols) => {
            createWatchlist(api, { name, symbols });
            setSheet(null);
          }}
        />
      )}
      {sheet === "edit" && list && (
        <WatchlistSheet
          api={api}
          mode="edit"
          initialName={list.name}
          initialSymbols={list.symbols.map((item) => item.symbol)}
          onClose={() => setSheet(null)}
          onSubmit={(name, symbols) => {
            updateWatchlist(api, list.id, { name, symbols });
            setSheet(null);
          }}
        />
      )}
      {menuOpen && list && (
        <ListMenu
          onClose={() => setMenuOpen(false)}
          onEdit={() => setSheet("edit")}
          onDelete={() => setConfirmDelete(true)}
        />
      )}
      {confirmDelete && list && (
        <ConfirmDialog
          title={t("markets.watchlistDeleteTitle")}
          detail={t("markets.watchlistDeleteDetail", { name: list.name })}
          cancelLabel={t("markets.watchlistDeleteCancel")}
          confirmLabel={t("markets.watchlistDeleteConfirm")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void (async () => {
              try {
                await deleteWatchlist(api, list.id);
                setConfirmDelete(false);
              } catch {
                notify(t("markets.watchlistDeleteError"));
              }
            })();
          }}
        />
      )}
    </View>
  );
}
