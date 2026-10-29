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
  Text,
  TextInput,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import Svg, { Polyline } from "react-native-svg";
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
  Shapes,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  X,
} from "./icons";
import {
  activeWatchlist,
  addSymbols,
  catalogSymbols,
  createWatchlist,
  deleteWatchlist,
  loadWatchlists,
  type MarketKind,
  refreshWatchlists,
  removeSymbol,
  type SymbolAlert,
  type SymbolMeta,
  searchSymbols,
  selectWatchlist,
  updateWatchlist,
  useWatchlistState,
  type Watchlist,
  type WatchlistSymbol,
} from "./market";
import { defaultCurrency, directionOf, formatPercent, formatPrice } from "./market-format";
import { QuoteCard } from "./quote-card";
import { availabilityFromQuote, type QuoteAvailability, useQuotes } from "./quotes";
import { breakpoints, layout, space } from "./theme";
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

type WatchlistFilter = "all" | "CN" | "HK" | "US" | "FUND";

const MARKET_FILTERS: ReadonlyArray<{ id: WatchlistFilter; labelKey: TranslationKey }> = [
  { id: "all", labelKey: "markets.marketAll" },
  { id: "CN", labelKey: "markets.marketCN" },
  { id: "HK", labelKey: "markets.marketHK" },
  { id: "US", labelKey: "markets.marketUS" },
  { id: "FUND", labelKey: "markets.marketFund" },
];

const MARKET_LABEL = {
  US: "markets.marketUS",
  CN: "markets.marketCN",
  HK: "markets.marketHK",
  ETF: "markets.marketETF",
  FUND: "markets.marketFund",
} as const satisfies Record<MarketKind, TranslationKey>;

function matchesWatchFilter(market: MarketKind, filter: WatchlistFilter) {
  if (filter === "all") return true;
  if (filter === "FUND") return market === "ETF" || market === "FUND";
  return market === filter;
}

function marketAndAssetLabel(
  symbol: SymbolMeta,
  t: (key: TranslationKey) => string,
): { market: string; asset: string } {
  if (symbol.market === "FUND") {
    return { market: t("markets.marketFund"), asset: t("markets.assetFund") };
  }
  if (symbol.market === "ETF") {
    const region: MarketKind = /\.(SS|SZ)$/i.test(symbol.code)
      ? "CN"
      : /\.HK$/i.test(symbol.code)
        ? "HK"
        : "US";
    return { market: t(MARKET_LABEL[region]), asset: t("markets.assetETF") };
  }
  return { market: t(MARKET_LABEL[symbol.market]), asset: t("markets.assetStock") };
}

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
          icon: <Activity size={12} strokeWidth={1.9} color={colors.alertVolume} />,
          label: t("markets.alertVolumeSpike", { multiple: (alert.multiple ?? 2).toFixed(1) }),
        };
      default:
        return {
          color: colors.primaryStrong,
          background: colors.sky,
          icon: <FileText size={12} color={colors.primary} />,
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
  availability,
  onRetry,
  onPress,
  onMore,
}: {
  item: WatchlistSymbol;
  style?: ViewStyle;
  availability?: QuoteAvailability;
  onRetry?: () => void;
  onPress: () => void;
  onMore?: () => void;
}) {
  const { t } = useTranslation();
  const { symbol, quote, alerts, unavailable } = item;
  const alert = alerts[0];
  const summary = availabilityFromQuote(quote, unavailable);
  // 批量报价优先：加载/逐项错误都保留其状态，只有还没拿到 availability 时才回落 summary。
  const merged = availability ?? summary;
  return (
    <QuoteCard
      symbol={{ code: symbol.code, name: symbol.name, market: symbol.market }}
      availability={merged}
      size="standard"
      narrow
      onRetry={onRetry}
      onPress={onPress}
      style={style}
      metaAction={
        onMore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("markets.symbolMore", { name: symbol.name })}
            hitSlop={10}
            onPress={(event) => {
              event.stopPropagation();
              onMore();
            }}
            style={({ pressed }) => ({
              width: 28,
              height: 24,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              backgroundColor: pressed ? colors.overlay1 : "transparent",
            })}
          >
            <MoreHorizontal size={15} color={colors.faint} />
          </Pressable>
        ) : undefined
      }
      footer={
        alert ? (
          <AlertBadge alert={alert} />
        ) : unavailable && !quote ? (
          <Text style={s.small}>{t("markets.quoteUnavailable")}</Text>
        ) : undefined
      }
    />
  );
}

/**
 * 迷你走势：仅当行情显式提供 `sparkline`（≥2 个点）时渲染。
 * 没有数据时返回 null，由调用方展示「—」，不在前端合成走势（金融图不得造数）。
 */
function Sparkline({
  points,
  width = 90,
  height = 24,
}: {
  points?: number[];
  width?: number;
  height?: number;
}) {
  if (!points || points.length < 2) return null;
  const pad = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points
    .map((value, index) => {
      const x = pad + (index / (points.length - 1)) * (width - pad * 2);
      const y = pad + (1 - (value - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = points[points.length - 1] >= points[0];
  return (
    <Svg
      accessibilityElementsHidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ flexShrink: 0 }}
    >
      <Polyline
        points={coords}
        fill="none"
        stroke={rising ? colors.marketUp : colors.marketDown}
        strokeWidth={1.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * 六列表格列宽（1000 宽时内容区约 684）：
 * 名称 ≥132 + 市场 76 + 价格 84 + 涨跌 66 + 走势 72 + 操作 88
 * + 5 × 8 gap + 左右 padding 24 → 606，不挤压主信息。
 */
const TABLE_NAME_MIN = 132;
const TABLE_GAP = 8;
const TABLE_PAD = 12;

function tableQuote(item: WatchlistSymbol, quotes: Record<string, QuoteAvailability>) {
  const availability =
    quotes[item.symbol.code] ?? availabilityFromQuote(item.quote, item.unavailable);
  return availability.status === "ready" ? availability.quote : item.quote;
}

/** 桌面六列表格：名称/代码 · 市场/类型 · 最新价/净值 · 涨跌幅 · 近月走势 · 操作。 */
function WatchTable({
  items,
  quotes,
  onOpen,
  onAnalyze,
  onRemove,
}: {
  items: WatchlistSymbol[];
  quotes: Record<string, QuoteAvailability>;
  onOpen: (item: WatchlistSymbol) => void;
  onAnalyze: (item: WatchlistSymbol) => void;
  onRemove: (item: WatchlistSymbol) => void;
}) {
  const { t } = useTranslation();
  const rows = items.map((item) => ({ item, quote: tableQuote(item, quotes) }));
  const header = (label: string, style?: TextStyle) => (
    <Text style={[{ fontSize: 11, lineHeight: 17, color: colors.muted }, style]}>{label}</Text>
  );
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 10,
        backgroundColor: colors.paper,
        overflow: "hidden",
      }}
    >
      <View style={[s.row, headerRow]}>
        {header(t("markets.tableName"), { flex: 1.7, minWidth: TABLE_NAME_MIN })}
        {header(t("markets.tableMarketType"), { width: 76 })}
        {header(t("markets.tableLatestValue"), { width: 84, textAlign: "right" })}
        {header(t("markets.tableChangePercent"), { width: 66, textAlign: "right" })}
        {header(t("markets.tableTrend"), { width: 72, textAlign: "center" })}
        {header(t("markets.tableActions"), { width: 88, textAlign: "right" })}
      </View>
      {rows.map(({ item, quote }, index) => {
        const currency = quote?.currency ?? defaultCurrency(item.symbol.market);
        const changePercent = quote?.changePercent;
        const direction = directionOf(changePercent ?? 0);
        const color = changePercent === undefined ? colors.muted : marketDirectionColor(direction);
        const labels = marketAndAssetLabel(item.symbol, t);
        return (
          <View
            key={item.symbol.code}
            style={[
              s.row,
              rowStyle,
              index > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.symbol.name} ${item.symbol.code}`}
              onPress={() => onOpen(item)}
              style={({ pressed }) => [
                s.row,
                { flex: 1.7, minWidth: TABLE_NAME_MIN, gap: 10, paddingVertical: 12 },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={[s.glyph, { width: 32, height: 36 }]}>
                {item.symbol.market === "ETF" || item.symbol.market === "FUND" ? (
                  <Shapes size={16} color={colors.primary} />
                ) : (
                  <Activity size={16} color={colors.muted} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
                >
                  {item.symbol.name}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 11, color: colors.faint }}>
                  {item.symbol.code}
                </Text>
              </View>
            </Pressable>
            <View style={{ width: 76, gap: 2 }}>
              <Text numberOfLines={1} style={{ fontSize: 11, color: colors.text }}>
                {labels.market}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 10, color: colors.faint }}>
                {labels.asset}
              </Text>
            </View>
            <View style={{ width: 84, alignItems: "flex-end", gap: 2 }}>
              <Text
                numberOfLines={1}
                style={[s.metric, { fontSize: 13, color: colors.text, textAlign: "right" }]}
              >
                {quote
                  ? formatPrice(
                      quote.price,
                      currency,
                      quote.precision ?? (item.symbol.market === "FUND" ? 4 : 2),
                    )
                  : "—"}
              </Text>
              <Text style={{ fontSize: 9, color: colors.faint }}>{quote ? currency : ""}</Text>
            </View>
            <Text
              numberOfLines={1}
              style={[s.metric, { width: 66, textAlign: "right", fontSize: 12, color }]}
            >
              {changePercent === undefined ? "—" : formatPercent(changePercent)}
            </Text>
            <View style={{ width: 72, alignItems: "center" }}>
              <Sparkline points={quote?.sparkline} width={68} height={22} />
              {!quote?.sparkline && (
                <Text style={{ fontSize: 10, color: colors.faint }}>
                  {t("markets.trendUnavailable")}
                </Text>
              )}
            </View>
            <View style={[s.row, { width: 88, justifyContent: "flex-end", gap: 8 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("markets.watchlistAnalyze")}
                hitSlop={8}
                onPress={() => onAnalyze(item)}
                style={[s.row, { gap: 3, minHeight: 32 }]}
              >
                <Sparkles size={12} color={colors.link} />
                <Text style={{ fontSize: 11, color: colors.link }}>
                  {t("markets.watchlistAnalyze")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("markets.watchlistRemove")}
                hitSlop={8}
                onPress={() => onRemove(item)}
                style={{ width: 28, minHeight: 32, alignItems: "center", justifyContent: "center" }}
              >
                <Trash2 size={13} color={colors.faint} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** 卡片形态的「⋯」菜单：分析 / 从列表移除。 */
function SymbolMenu({
  item,
  onClose,
  onAnalyze,
  onRemove,
}: {
  item: WatchlistSymbol;
  onClose: () => void;
  onAnalyze: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet
      title={item.symbol.name}
      subtitle={`${item.symbol.code} · ${item.symbol.market}`}
      onClose={onClose}
    >
      <View style={{ gap: 10 }}>
        <Button primary onPress={onAnalyze}>
          {t("markets.watchlistAnalyze")}
        </Button>
        <Button danger onPress={onRemove}>
          {t("markets.watchlistRemove")}
        </Button>
      </View>
    </Sheet>
  );
}

const headerRow: ViewStyle = {
  paddingHorizontal: TABLE_PAD,
  minHeight: 38,
  gap: TABLE_GAP,
  backgroundColor: colors.surface,
  borderBottomWidth: 1,
  borderBottomColor: colors.line,
};

const rowStyle: ViewStyle = {
  paddingHorizontal: TABLE_PAD,
  gap: TABLE_GAP,
};

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
            backgroundColor: colors.paper,
          },
        ]}
      >
        <Search size={17} color={colors.faint} />
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
            <X size={15} color={colors.faint} />
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
            backgroundColor: colors.paper,
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
                    {added && <Check size={12} strokeWidth={1.9} color={colors.muted} />}
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

/** 当前列表的即时筛选搜索；添加标的使用独立的弹窗搜索。 */
function FilterSearch({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  return (
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
          backgroundColor: colors.paper,
          minWidth: 240,
        },
      ]}
    >
      <Search size={16} color={colors.faint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={t("markets.watchlistSearchPlaceholder")}
        placeholderTextColor={colors.faint}
        accessibilityLabel={t("markets.watchlistSearchPlaceholder")}
        style={[
          { flex: 1, fontSize: 13, color: colors.text, paddingVertical: 8 },
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
          <X size={14} color={colors.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** 添加自选弹窗：搜索、市场筛选、结果列表，始终添加到当前列表。 */
function AddSymbolSheet({
  api,
  list,
  onAdd,
  onClose,
}: {
  api: LingWuApi;
  list: Watchlist;
  onAdd: (symbol: SymbolMeta) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WatchlistFilter>("all");
  const [results, setResults] = useState<SymbolMeta[]>(() => catalogSymbols());

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(catalogSymbols());
      return;
    }
    const timer = setTimeout(() => {
      void searchSymbols(api, trimmed, 20).then((matches) => {
        // 真实目录无结果时补上内置目录，保证基金和离线示例仍可添加。
        const local = catalogSymbols().filter(
          (item) =>
            item.code.toLowerCase().includes(trimmed.toLowerCase()) ||
            item.name.toLowerCase().includes(trimmed.toLowerCase()),
        );
        const merged = [...matches];
        for (const item of local) {
          if (!merged.some((match) => match.code === item.code)) merged.push(item);
        }
        setResults(merged);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [api, query]);

  const visible = results.filter((item) => matchesWatchFilter(item.market, filter));
  const counts = MARKET_FILTERS.reduce<Record<WatchlistFilter, number>>(
    (tally, item) => {
      tally[item.id] = results.filter((symbol) =>
        matchesWatchFilter(symbol.market, item.id),
      ).length;
      return tally;
    },
    { all: 0, CN: 0, HK: 0, US: 0, FUND: 0 },
  );

  return (
    <Sheet
      title={t("markets.watchlistAddTitle")}
      subtitle={t("markets.watchlistAddTo", { name: list.name })}
      onClose={onClose}
    >
      <View style={{ gap: 14 }}>
        <FilterSearch value={query} onChange={setQuery} />
        <SegmentedTabs counts={counts} active={filter} onChange={setFilter} />
        <View style={{ gap: 0, borderWidth: 1, borderColor: colors.line, borderRadius: 10 }}>
          {visible.length ? (
            visible.map((symbol, index) => {
              const added = list.symbols.some((item) => item.symbol.code === symbol.code);
              const labels = marketAndAssetLabel(symbol, t);
              return (
                <View
                  key={symbol.code}
                  style={[
                    s.row,
                    {
                      gap: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderTopWidth: index ? 1 : 0,
                      borderTopColor: colors.line,
                    },
                  ]}
                >
                  <View style={[s.glyph, { width: 34, height: 36 }]}>
                    {symbol.market === "ETF" || symbol.market === "FUND" ? (
                      <Shapes size={16} color={colors.primary} />
                    ) : (
                      <Activity size={16} color={colors.muted} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
                    >
                      {symbol.name}
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 11, color: colors.faint }}>
                      {symbol.code} · {labels.market} · {labels.asset}
                    </Text>
                  </View>
                  <Button
                    small
                    primary={!added}
                    disabled={added}
                    onPress={() => onAdd(symbol)}
                    style={{ minHeight: 36 }}
                  >
                    {added ? t("markets.watchlistAdded") : t("markets.watchlistAdd")}
                  </Button>
                </View>
              );
            })
          ) : (
            <View style={{ alignItems: "center", gap: 6, padding: 28 }}>
              <Search size={22} color={colors.faint} />
              <Text style={[s.text, { fontWeight: "600" }]}>{t("markets.watchlistAddEmpty")}</Text>
              <Text style={[s.small, { textAlign: "center" }]}>
                {t("markets.watchlistAddEmptyDetail")}
              </Text>
            </View>
          )}
        </View>
        <Button primary onPress={onClose}>
          {t("markets.watchlistAddDone")}
        </Button>
      </View>
    </Sheet>
  );
}

function SegmentedTabs({
  counts,
  active,
  onChange,
}: {
  counts: Record<WatchlistFilter, number>;
  active: WatchlistFilter;
  onChange: (id: WatchlistFilter) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        s.row,
        {
          gap: 24,
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
            style={({ pressed }) => [
              s.row,
              {
                gap: 6,
                paddingHorizontal: 1,
                minHeight: 44,
                borderBottomWidth: 2,
                borderBottomColor: selected ? colors.primary : "transparent",
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: selected ? colors.primaryStrong : colors.muted,
              }}
            >
              {t(filter.labelKey)}
            </Text>
            <Text style={{ fontSize: 10, color: selected ? colors.primary : colors.faint }}>
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
  onNew,
  onEdit,
  onDelete,
  onClose,
}: {
  onNew: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const rows: Array<{ label: string; danger?: boolean; onPress: () => void }> = [
    { label: t("markets.watchlistNew"), onPress: onNew },
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
            backgroundColor: colors.paper,
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
            <X size={11} strokeWidth={1.9} color={colors.faint} />
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
  const { api, notify, open, ask } = useWorkspace();
  const { t, locale } = useTranslation();
  const { width } = useWindowDimensions();
  const state = useWatchlistState();
  const [filterQuery, setFilterQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState<WatchlistFilter>("all");
  const [sheet, setSheet] = useState<"create" | "edit" | "add" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuFor, setMenuFor] = useState<WatchlistSymbol | null>(null);
  const shimmer = useShimmer();

  useEffect(() => {
    void loadWatchlists(api, locale);
  }, [api, locale]);

  // 行情刷新：60s 轮询（符合 P0「≤1 分钟」要求）。
  useEffect(() => {
    const timer = setInterval(() => refreshWatchlists(api, locale), 60_000);
    return () => clearInterval(timer);
  }, [api, locale]);

  const list = activeWatchlist();
  const quoteSymbols = useMemo(
    () => (list?.symbols ?? []).map((entry) => entry.symbol.code),
    [list],
  );
  const { quotes, retry } = useQuotes(api, quoteSymbols, { refreshMs: 60_000 });
  // 栅格列数按「内容宽度」而不是窗口宽度计算：桌面壳要扣掉侧栏与页面左右 padding，
  // 否则 1000 宽附近会出现「壳层已进入桌面、内容区只剩 584」的断点悬崖。
  const contentWidth =
    width >= breakpoints.desktop
      ? width - layout.sidebar - space.page * 2
      : width - space.pageMobile * 2;
  const columns = contentWidth >= 960 ? 3 : contentWidth >= 560 ? 2 : 1;
  const cardWidth = columns === 1 ? "100%" : columns === 2 ? "48%" : "31.5%";
  // ≥1000 用六列表格（信息密度），窄屏回落卡片 + 「⋯」操作（Demo D4）。
  const table = width >= breakpoints.desktop;

  const openSymbol = (item: WatchlistSymbol) =>
    open({
      type: "symbol",
      symbol: item.symbol,
      quote: item.quote,
      watchlist: { id: list?.id ?? "", name: list?.name ?? "" },
    });

  const analyzeSymbol = (item: WatchlistSymbol) => {
    ask(
      t("markets.watchlistAnalyzePrompt", {
        name: item.symbol.name,
        code: item.symbol.code,
      }),
    );
    setMenuFor(null);
  };

  // 移除后通过统一 Toast 提供撤销（3.2s，动作即把标的重新加回列表）。
  const removeItem = (item: WatchlistSymbol) => {
    if (!list) return;
    removeSymbol(api, list.id, item.symbol.code);
    setMenuFor(null);
    notify(t("markets.watchlistRemoved", { name: item.symbol.name }), {
      label: t("markets.watchlistUndo"),
      onPress: () => addSymbols(api, list.id, [item.symbol]),
    });
  };

  const counts = useMemo(() => {
    const symbols = list?.symbols ?? [];
    const tally: Record<WatchlistFilter, number> = {
      all: symbols.length,
      US: 0,
      CN: 0,
      HK: 0,
      FUND: 0,
    };
    for (const item of symbols) {
      const market = item.symbol.market;
      if (market === "US" || market === "CN" || market === "HK") tally[market] += 1;
      if (market === "ETF" || market === "FUND") tally.FUND += 1;
    }
    return tally;
  }, [list]);

  const visibleSymbols = useMemo(() => {
    const symbols = list?.symbols ?? [];
    const needle = filterQuery.trim().toLowerCase();
    return symbols.filter(
      (item) =>
        matchesWatchFilter(item.symbol.market, marketFilter) &&
        (!needle ||
          item.symbol.name.toLowerCase().includes(needle) ||
          item.symbol.code.toLowerCase().includes(needle)),
    );
  }, [filterQuery, list, marketFilter]);

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
      {/* 列表切换 + 添加 + 更多 */}
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
                style={({ pressed }) => [
                  s.row,
                  {
                    gap: 6,
                    paddingHorizontal: 12,
                    minHeight: 44,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.line,
                    backgroundColor: selected ? colors.sky : colors.paper,
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
        <Button small primary icon={Plus} style={{ minHeight: 44 }} onPress={() => setSheet("add")}>
          {t("markets.watchlistAddAction")}
        </Button>
        <IconButton
          icon={MoreHorizontal}
          label={t("markets.watchlistMore")}
          onPress={() => setMenuOpen(true)}
        />
      </View>

      <View style={[s.between, { gap: 12, flexWrap: "wrap" }]}>
        <Text style={s.small}>
          {t("markets.watchlistCaptionedCount", { count: list?.symbols.length ?? 0 })}
        </Text>
        <View style={[s.row, { gap: 6 }]}>
          {state.source === "mock" ? (
            <View style={[s.chip, { paddingVertical: 2 }]}>
              <Text style={s.chipText}>{t("markets.watchlistSample")}</Text>
            </View>
          ) : null}
          <Text style={s.small}>
            {t(
              state.source === "mock"
                ? "markets.watchlistSampleCaption"
                : "markets.watchlistLiveCaption",
            )}
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: width >= 760 ? "row" : "column",
          alignItems: width >= 760 ? "flex-end" : "stretch",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <SegmentedTabs counts={counts} active={marketFilter} onChange={setMarketFilter} />
        </View>
        <View style={{ width: width >= 760 ? 280 : "100%", paddingBottom: 12 }}>
          <FilterSearch value={filterQuery} onChange={setFilterQuery} />
        </View>
      </View>

      {state.status === "ready" && state.source === "mock" && (
        <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
          <Text style={[s.small, { flexShrink: 1 }]}>{t("markets.watchlistSampleHint")}</Text>
        </View>
      )}

      {!!state.degraded && (
        <View style={{ gap: 8 }}>
          <ErrorNotice error={t("markets.watchlistLoadError")} />
          <Button small onPress={() => void loadWatchlists(api, locale, true)}>
            {t("markets.watchlistRetry")}
          </Button>
        </View>
      )}

      {visibleSymbols.length ? (
        table ? (
          <WatchTable
            items={visibleSymbols}
            quotes={quotes}
            onOpen={openSymbol}
            onAnalyze={analyzeSymbol}
            onRemove={removeItem}
          />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "stretch" }}>
            {visibleSymbols.map((item) => (
              // 尺寸落在外层容器，卡片本身撑满：单列时 wrapper 100% 宽，避免卡片只占 240 留白
              <View
                key={item.symbol.code}
                style={{
                  width: cardWidth,
                  flexGrow: columns === 1 ? 0 : 1,
                  minWidth: columns === 3 ? 230 : columns === 2 ? 240 : 0,
                }}
              >
                <SymbolCard
                  item={item}
                  availability={quotes[item.symbol.code]}
                  onRetry={retry}
                  style={{ width: "100%", flexGrow: 1 }}
                  onPress={() => openSymbol(item)}
                  onMore={() => setMenuFor(item)}
                />
              </View>
            ))}
          </View>
        )
      ) : list?.symbols.length ? (
        <Empty
          icon={Search}
          title={t("markets.watchlistFilterEmptyTitle")}
          detail={t("markets.watchlistFilterEmptyDetail")}
        >
          <Button icon={Plus} onPress={() => setSheet("add")}>
            {t("markets.watchlistAddAction")}
          </Button>
        </Empty>
      ) : (
        <Empty
          icon={CircleDollarSign}
          title={t("markets.watchlistEmptyListTitle")}
          detail={t("markets.watchlistEmptyListDetail")}
        >
          <Button icon={Plus} onPress={() => setSheet("add")}>
            {t("markets.watchlistAddSymbol")}
          </Button>
        </Empty>
      )}

      <View
        style={{
          flexDirection: width >= 720 ? "row" : "column",
          alignItems: width >= 720 ? "center" : "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <View style={[s.row, { gap: 6, flexShrink: 1 }]}>
          <ShieldCheck size={12} color={colors.faint} />
          <Text style={[s.small, { flexShrink: 1 }]}>{t("markets.watchlistSaved")}</Text>
        </View>
        <View style={[s.row, { gap: 6 }]}>
          <RefreshCw size={11} color={colors.faint} />
          <Text style={s.small}>
            {t("markets.watchlistUpdated", {
              time: new Date(list?.updatedAt ?? new Date().toISOString()).toLocaleTimeString(
                activeLocaleTag(),
                { hour: "numeric", minute: "2-digit" },
              ),
            })}
          </Text>
        </View>
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
      {sheet === "add" && list && (
        <AddSymbolSheet
          api={api}
          list={list}
          onAdd={(symbol) => addSymbols(api, list.id, [symbol])}
          onClose={() => setSheet(null)}
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
      {!!menuFor && (
        <SymbolMenu
          item={menuFor}
          onClose={() => setMenuFor(null)}
          onAnalyze={() => analyzeSymbol(menuFor)}
          onRemove={() => removeItem(menuFor)}
        />
      )}
      {menuOpen && list && (
        <ListMenu
          onNew={() => setSheet("create")}
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
