/**
 * 统一行情卡片（P1-4 Part A）：compact（对话内联/简报）与 standard（观察列表/标的详情）。
 *
 * 职责边界：卡片只负责展示 availability；请求、5s 超时与降级由 `quotes.ts` 的
 * `useQuotes`/`fetchQuotes` 负责。加载态展示骨架，父级超时后传入 unavailable。
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import { currencySymbol, directionOf, formatPercent } from "./market-format";
import {
  formatAsOf,
  formatDelayMinutes,
  formatVolume,
  type QuoteAvailability,
  type QuoteError,
} from "./quotes";
import { colors, marketDirectionColor, s } from "./ui";

const ERROR_KEYS: Record<QuoteError, TranslationKey> = {
  network: "quotes.errorNetwork",
  timeout: "quotes.errorTimeout",
  http: "quotes.errorHttp",
  parse: "quotes.errorParse",
  not_found: "quotes.errorNotFound",
  unsupported: "quotes.errorUnsupported",
  provider_error: "quotes.errorProvider",
};

function errorLabel(reason: QuoteError | undefined, t: (key: TranslationKey) => string) {
  return reason ? t(ERROR_KEYS[reason]) : t("quotes.unavailable");
}

function formatPriceSmart(value: number, currency: string) {
  const digits = value < 1 ? 4 : 2;
  const text = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return `${currencySymbol(currency)}${text}`;
}

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

function SkeletonBar({
  width,
  height,
  opacity,
}: {
  width: `${number}%` | number;
  height: number;
  opacity: Animated.Value;
}) {
  return (
    <Animated.View
      style={{ width, height, borderRadius: 4, backgroundColor: colors.tertiary, opacity }}
    />
  );
}

export function QuoteCard({
  symbol,
  availability,
  size,
  onPress,
  footer,
  onRetry,
  showVolume = true,
  narrow,
  style,
}: {
  symbol: { code: string; name: string; market: "US" | "CN" | "HK" | "ETF" };
  availability: QuoteAvailability;
  size: "compact" | "standard";
  onPress?: () => void;
  footer?: ReactNode;
  onRetry?: () => void;
  showVolume?: boolean;
  /** 强制两行布局（网格卡片等窄容器）。 */
  narrow?: boolean;
  style?: ViewStyle;
}) {
  const { t, locale } = useTranslation();
  const { width } = useWindowDimensions();
  const shimmer = useShimmer();
  const [cardWidth, setCardWidth] = useState(0);
  const compactTime = width >= 360;
  // 观察列表网格卡片可能只有 ~250px 宽；按卡片实际宽度切换两行布局，避免价格与涨跌幅挤压。
  const mobileStandard =
    size === "standard" && (narrow ?? (cardWidth > 0 ? cardWidth < 340 : width < 600));
  const measure = (event: { nativeEvent: { layout: { width: number } } }) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setCardWidth((current) => (current === next ? current : next));
  };

  const currency =
    availability.status === "ready"
      ? (availability.quote.currency ??
        (symbol.market === "CN" ? "CNY" : symbol.market === "HK" ? "HKD" : "USD"))
      : symbol.market === "CN"
        ? "CNY"
        : symbol.market === "HK"
          ? "HKD"
          : "USD";

  const content = (() => {
    if (availability.status === "loading") {
      if (size === "compact") {
        return (
          <View style={[s.row, { gap: 8, minHeight: 44, paddingHorizontal: 12 }]}>
            <SkeletonBar width={42} height={12} opacity={shimmer} />
            <SkeletonBar width={64} height={14} opacity={shimmer} />
            <SkeletonBar width={64} height={12} opacity={shimmer} />
          </View>
        );
      }
      return (
        <View style={[s.card, { minHeight: 96, padding: 14, gap: 8 }, style]}>
          <View style={s.between}>
            <SkeletonBar width="34%" height={14} opacity={shimmer} />
            <SkeletonBar width="22%" height={18} opacity={shimmer} />
          </View>
          <View style={s.between}>
            <SkeletonBar width="46%" height={11} opacity={shimmer} />
            <SkeletonBar width="18%" height={16} opacity={shimmer} />
          </View>
          <SkeletonBar width="40%" height={10} opacity={shimmer} />
        </View>
      );
    }

    if (availability.status === "unavailable") {
      const reason = errorLabel(availability.reason, t);
      if (size === "compact") {
        return (
          <View
            style={[
              s.row,
              {
                gap: 8,
                minHeight: 44,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 10,
                backgroundColor: colors.canvas,
              },
              style,
            ]}
          >
            <Text
              style={[s.text, { fontSize: 13, fontWeight: "600", width: 58 }]}
              numberOfLines={1}
            >
              {symbol.code}
            </Text>
            <Text style={{ color: colors.faint }}>—</Text>
            <Text style={[s.muted, { fontSize: 12 }]} numberOfLines={1}>
              {t("quotes.unavailable")} · <Text style={s.small}>{reason}</Text>
            </Text>
          </View>
        );
      }
      return (
        <View style={[s.card, { minHeight: 96, padding: 14, gap: 6 }, style]}>
          <Text style={[s.heading, { fontSize: 16 }]} numberOfLines={1}>
            {symbol.code}
          </Text>
          <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={1}>
            {symbol.name}
          </Text>
          <View
            style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, marginTop: 4 }}
          >
            <View style={[s.row, { gap: 8 }]}>
              <Text style={[s.muted, { flex: 1, fontSize: 12 }]} numberOfLines={1}>
                {t("quotes.unavailable")} · <Text style={s.small}>{reason}</Text>
              </Text>
              {availability.retryable && onRetry && (
                <Pressable
                  accessibilityRole="button"
                  onPress={onRetry}
                  style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 6 }}
                >
                  <Text style={[s.small, { color: colors.primary, fontWeight: "600" }]}>
                    {t("quotes.retry")}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      );
    }

    const quote = availability.quote;
    const dayDirection = directionOf(quote.changePercent ?? 0);
    const dayColor = marketDirectionColor(dayDirection);
    const arrow = dayDirection === "up" ? "▲" : dayDirection === "down" ? "▼" : "—";
    const priceText = formatPriceSmart(quote.price, currency);
    const changeText =
      quote.change === undefined
        ? undefined
        : `${quote.change > 0 ? "+" : quote.change < 0 ? "-" : ""}${currencySymbol(currency)}${Math.abs(quote.change).toFixed(2)}`;
    const percentText =
      quote.changePercent === undefined ? "—" : formatPercent(quote.changePercent);
    const time = formatAsOf(quote.asOf, locale);
    const delayMinutes = quote.stale ? formatDelayMinutes(quote.asOf) : undefined;
    const delayLabel =
      delayMinutes && delayMinutes >= 1
        ? t("quotes.delayedMinutes", { count: delayMinutes })
        : t("quotes.delayed");
    const volume = showVolume ? formatVolume(quote.volume, locale) : undefined;
    const delayedChip = quote.stale ? (
      <View
        style={{
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 999,
          backgroundColor: colors.alertVolumeSurface,
        }}
      >
        <Text style={{ fontSize: 10, fontWeight: "600", color: colors.alertVolumeText }}>
          {delayLabel}
        </Text>
      </View>
    ) : quote.marketState === "closed" ? (
      <View
        style={{
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 999,
          backgroundColor: colors.surface,
        }}
      >
        <Text style={{ fontSize: 10, fontWeight: "600", color: colors.muted }}>
          {t("quotes.closed")}
        </Text>
      </View>
    ) : null;
    const timeText = time ? t("quotes.updatedAt", { time: time.label }) : undefined;

    if (size === "compact") {
      return (
        <View
          style={[
            s.row,
            {
              gap: 8,
              minHeight: 44,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 10,
              backgroundColor: colors.canvas,
            },
            style,
          ]}
        >
          <Text
            style={[s.text, { fontSize: 13, fontWeight: "600", maxWidth: 96 }]}
            numberOfLines={1}
          >
            {symbol.code}
          </Text>
          <Text style={[s.metric, { fontSize: 14, fontWeight: "600", color: colors.text }]}>
            {priceText}
          </Text>
          <Text
            style={[s.metric, { flex: 1, fontSize: 13, fontWeight: "600", color: dayColor }]}
            numberOfLines={1}
          >
            {arrow} {percentText}
          </Text>
          {delayedChip}
          {!!timeText && compactTime && (
            <Text style={[s.small, s.metric, { fontSize: 10, color: colors.faint }]}>
              {timeText}
            </Text>
          )}
        </View>
      );
    }

    const meta = (
      <View
        style={[
          s.row,
          {
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: colors.line,
            marginTop: 12,
            paddingTop: 8,
            flexWrap: "wrap",
          },
        ]}
      >
        {!!volume && (
          <Text style={[s.small, { fontSize: 11, color: colors.muted }]}>
            {t("quotes.volume", { value: volume })}
          </Text>
        )}
        {!!volume && !!timeText && <Text style={s.small}>·</Text>}
        {!!timeText && (
          <Text style={[s.small, s.metric, { fontSize: 11, color: colors.faint }]}>{timeText}</Text>
        )}
        <View style={{ flex: 1 }} />
        {delayedChip}
      </View>
    );

    if (mobileStandard) {
      return (
        <View style={[s.card, { padding: 14, gap: 6, width: "100%" }, style]} onLayout={measure}>
          <View style={s.between}>
            <Text style={[s.heading, { fontSize: 16 }]} numberOfLines={1}>
              {symbol.code}
            </Text>
            <Text style={[s.metric, { fontSize: 19, fontWeight: "600", color: colors.text }]}>
              {priceText}
            </Text>
          </View>
          <View style={s.between}>
            <Text style={[s.muted, { fontSize: 13, flex: 1 }]} numberOfLines={1}>
              {symbol.name}
            </Text>
            {!!changeText && (
              <Text style={[s.metric, { fontSize: 11, color: dayColor }]}>
                {t("markets.dayChange", { value: changeText })}
              </Text>
            )}
          </View>
          <View style={s.between}>
            <Text
              style={[
                s.metric,
                {
                  fontSize: 11,
                  color: marketDirectionColor(directionOf(quote.weekChangePercent ?? 0)),
                },
              ]}
            >
              {quote.weekChangePercent === undefined
                ? ""
                : t("markets.weekChange", { value: formatPercent(quote.weekChangePercent) })}
            </Text>
            <Text style={[s.metric, { fontSize: 16, fontWeight: "600", color: dayColor }]}>
              {arrow} {percentText}
            </Text>
          </View>
          {meta}
          {footer && <View style={{ marginTop: 6 }}>{footer}</View>}
        </View>
      );
    }

    return (
      <View style={[s.card, { padding: 14, width: "100%" }, style]} onLayout={measure}>
        <View style={[s.row, { alignItems: "flex-start", gap: 8 }]}>
          <View style={{ flex: 2, minWidth: 0, gap: 2 }}>
            <Text style={[s.heading, { fontSize: 16 }]} numberOfLines={1}>
              {symbol.code}
            </Text>
            <Text style={[s.muted, { fontSize: 13, lineHeight: 19 }]} numberOfLines={1}>
              {symbol.name}
            </Text>
          </View>
          <View style={{ flex: 1.5, alignItems: "flex-end", gap: 2 }}>
            <Text style={[s.metric, { fontSize: 20, fontWeight: "600", color: colors.text }]}>
              {priceText}
            </Text>
            {!!changeText && (
              <Text style={[s.metric, { fontSize: 11, color: dayColor }]}>
                {t("markets.dayChange", { value: changeText })}
              </Text>
            )}
          </View>
          <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
            <Text style={[s.metric, { fontSize: 16, fontWeight: "600", color: dayColor }]}>
              {arrow} {percentText}
            </Text>
            {quote.weekChangePercent !== undefined && (
              <Text
                style={[
                  s.metric,
                  {
                    fontSize: 11,
                    color: marketDirectionColor(directionOf(quote.weekChangePercent)),
                  },
                ]}
                numberOfLines={1}
              >
                {t("markets.weekChange", { value: formatPercent(quote.weekChangePercent) })}
              </Text>
            )}
          </View>
        </View>
        {meta}
        {footer && <View style={{ marginTop: 6 }}>{footer}</View>}
      </View>
    );
  })();

  if (!onPress)
    return (
      <View accessibilityLabel={accessibilityLabelOf(availability, symbol, t)}>{content}</View>
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelOf(availability, symbol, t)}
      onPress={onPress}
      style={({ pressed }) =>
        pressed ? { backgroundColor: colors.overlay1, borderRadius: 14 } : undefined
      }
    >
      {content}
    </Pressable>
  );
}

function accessibilityLabelOf(
  availability: QuoteAvailability,
  symbol: { code: string; name: string },
  t: (key: TranslationKey) => string,
) {
  if (availability.status === "loading") return `${symbol.code} ${symbol.name}`;
  if (availability.status === "unavailable")
    return `${symbol.code} ${symbol.name}, ${t("quotes.unavailable")}`;
  const quote = availability.quote;
  return `${symbol.code} ${symbol.name}, ${quote.price}, ${quote.changePercent ?? ""}`;
}
