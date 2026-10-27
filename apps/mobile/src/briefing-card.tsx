/**
 * F2 — 市场简报卡片（TodayScreen 首页）。
 *
 * 摘要模式：标题 + 3-5 条要点 + 追问入口；
 * 展开模式：追加市场数据、观察列表动态、今日事件与操作栏。
 * 数据由 `market.ts` 的 briefing store 提供（真实接口优先，mock 兜底，缓存 1h）。
 */
import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, LayoutAnimation, Pressable, Text, View } from "react-native";
import { activeLocaleTag, type TranslationKey, useTranslation } from "./i18n";
import {
  Activity,
  ChevronDown,
  FileText,
  type IconComponent,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Target,
} from "./icons";
import {
  type AlertKind,
  type BriefingEvent,
  type BriefingSymbolUpdate,
  generateBriefing,
  type IndexQuote,
  loadBriefing,
  todayISO,
  useBriefingState,
} from "./market";
import { Button, Card, colors, ErrorNotice, s } from "./ui";
import { useWorkspace } from "./workspace";

function formatPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function changeColor(value: number) {
  if (value > 0.005) return colors.marketUpText;
  if (value < -0.005) return colors.marketDownText;
  return colors.marketFlat;
}

function updateColor(alert: AlertKind | undefined, changePercent: number) {
  if (alert === "volume_spike") return colors.alertVolumeText;
  return changeColor(changePercent);
}

/** 简报里的标的动态不带具体数值，用简短说明代替完整阈值文案。 */
function alertNoteKey(alert: AlertKind): TranslationKey {
  switch (alert) {
    case "price_break":
      return "markets.notePriceBreak";
    case "volume_spike":
      return "markets.noteVolumeSpike";
    case "news":
      return "markets.noteNews";
    default:
      return "markets.noteChange";
  }
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={[s.label, { color: colors.faint, marginTop: 20, marginBottom: 10 }]}>
      {children}
    </Text>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 4,
      }}
    >
      {children}
    </View>
  );
}

function MarketDataSection({ rows }: { rows: IndexQuote[] }) {
  return (
    <Panel>
      {rows.map((row, index) => (
        <View
          key={row.name}
          style={[
            s.row,
            {
              minHeight: 36,
              gap: 10,
              borderTopWidth: index ? 1 : 0,
              borderTopColor: colors.line,
            },
          ]}
        >
          <Text style={[s.text, { flex: 1, fontSize: 13 }]} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={[s.metric, { fontSize: 13, color: colors.text }]}>
            {new Intl.NumberFormat(activeLocaleTag(), {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(row.value)}
          </Text>
          <Text
            style={[
              s.metric,
              {
                fontSize: 12,
                width: 66,
                textAlign: "right",
                color: changeColor(row.changePercent),
              },
            ]}
          >
            {row.changePercent > 0 ? "▲ " : row.changePercent < 0 ? "▼ " : ""}
            {formatPercent(row.changePercent)}
          </Text>
        </View>
      ))}
    </Panel>
  );
}

function WatchlistSection({ rows }: { rows: BriefingSymbolUpdate[] }) {
  const { t } = useTranslation();
  return (
    <Panel>
      {rows.map((row, index) => {
        const color = updateColor(row.alert, row.changePercent);
        return (
          <View
            key={row.code}
            style={[
              s.row,
              {
                minHeight: 40,
                gap: 8,
                borderTopWidth: index ? 1 : 0,
                borderTopColor: colors.line,
              },
            ]}
          >
            {row.alert === "change_threshold" ? (
              <Text style={{ fontSize: 9, width: 8, color }}>
                {row.changePercent >= 0 ? "▲" : "▼"}
              </Text>
            ) : row.alert === "volume_spike" ? (
              <Activity size={13} strokeWidth={2} color={colors.alertVolume} />
            ) : row.alert === "price_break" ? (
              <View
                style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.danger }}
              />
            ) : row.alert === "news" ? (
              <FileText size={13} strokeWidth={1.8} color={colors.primary} />
            ) : (
              <View
                style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: colors.faint }}
              />
            )}
            <Text
              style={[s.text, { fontSize: 13, fontWeight: "600", width: 62 }]}
              numberOfLines={1}
            >
              {row.code}
            </Text>
            <Text style={[s.muted, { fontSize: 12, flex: 1 }]} numberOfLines={1}>
              {row.alert ? t(alertNoteKey(row.alert)) : t("markets.briefingNoMove")}
            </Text>
            <Text style={[s.metric, { fontSize: 12, color: colors.text }]}>
              {row.price.toFixed(2)}
            </Text>
            <Text style={[s.metric, { fontSize: 12, width: 60, textAlign: "right", color }]}>
              {formatPercent(row.changePercent)}
            </Text>
          </View>
        );
      })}
    </Panel>
  );
}

function EventsSection({ rows }: { rows: BriefingEvent[] }) {
  return (
    <Panel>
      {rows.map((row, index) => (
        <View
          key={`${row.time}:${row.title}`}
          style={[
            s.row,
            {
              minHeight: 36,
              gap: 8,
              borderTopWidth: index ? 1 : 0,
              borderTopColor: colors.line,
            },
          ]}
        >
          <Text style={{ fontSize: 12 }}>📅</Text>
          <Text style={[s.small, s.metric, { color: colors.faint, width: 64 }]}>{row.time}</Text>
          <Text style={[s.text, { flex: 1, fontSize: 13 }]} numberOfLines={2}>
            {row.title}
          </Text>
        </View>
      ))}
    </Panel>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: IconComponent;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        {
          gap: 8,
          paddingHorizontal: 14,
          minHeight: 40,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: pressed ? colors.overlay2 : colors.surface,
        },
      ]}
    >
      <Icon size={15} strokeWidth={1.8} color={colors.primary} />
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>{label}</Text>
    </Pressable>
  );
}

function SkeletonLines() {
  return (
    <View style={{ gap: 8 }}>
      {["92%", "78%", "86%"].map((width, index) => (
        <View
          key={width}
          style={{
            width: width as `${number}%`,
            height: 12,
            borderRadius: 4,
            backgroundColor: colors.tertiary,
            opacity: index === 1 ? 0.75 : 1,
          }}
        />
      ))}
    </View>
  );
}

export function MarketBriefingCard() {
  const { api, ask, navigate } = useWorkspace();
  const { t, locale } = useTranslation();
  const state = useBriefingState();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    void loadBriefing(api, locale);
  }, [api, locale]);

  const briefing = state.briefing;
  const stale = !!briefing && (briefing.isToday === false || briefing.date < todayISO());
  const title = t(stale ? "markets.briefingYesterdayTitle" : "markets.briefingTitle");

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => !current);
  };

  return (
    <Card style={{ gap: 0 }}>
      <View style={[s.between, { gap: 10 }]}>
        <View style={[s.row, { gap: 8, flex: 1, minWidth: 0 }]}>
          <Activity size={18} strokeWidth={1.9} color={colors.primary} />
          <Text style={s.heading} numberOfLines={1}>
            {title}
          </Text>
          {stale && (
            <View style={[s.chip, { backgroundColor: colors.surface }]}>
              <Text style={s.chipText}>{t("markets.briefingYesterday")}</Text>
            </View>
          )}
          {state.source === "mock" && (
            <View style={[s.chip, { backgroundColor: colors.surface }]}>
              <Text style={s.chipText}>{t("markets.watchlistSample")}</Text>
            </View>
          )}
        </View>
        <View style={[s.row, { gap: 8 }]}>
          {briefing && <Text style={s.small}>{briefing.date}</Text>}
          {briefing && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                expanded ? "markets.briefingCollapse" : "markets.briefingExpand",
              )}
              onPress={toggle}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                backgroundColor: pressed ? colors.overlay1 : "transparent",
              })}
            >
              <View style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}>
                <ChevronDown size={16} strokeWidth={1.8} color={colors.faint} />
              </View>
            </Pressable>
          )}
        </View>
      </View>

      {state.status === "loading" || state.status === "generating" ? (
        <View style={{ gap: 14, marginTop: 16 }}>
          {state.status === "generating" && (
            <View style={[s.row, { gap: 8 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={s.muted}>{t("markets.briefingGenerating")}</Text>
            </View>
          )}
          <SkeletonLines />
        </View>
      ) : !briefing ? (
        <View style={{ gap: 10, paddingVertical: 18 }}>
          {state.error ? (
            <>
              <ErrorNotice error={t("markets.briefingError")} />
              <Button icon={RefreshCw} onPress={() => void loadBriefing(api, locale, true)}>
                {t("markets.briefingRetry")}
              </Button>
            </>
          ) : (
            <View style={{ alignItems: "center", gap: 10, paddingHorizontal: 12 }}>
              <Activity size={28} strokeWidth={1.6} color={colors.faint} />
              <Text style={s.heading}>{t("markets.briefingEmptyTitle")}</Text>
              <Text style={[s.muted, { textAlign: "center" }]}>
                {t("markets.briefingEmptyDetail")}
              </Text>
              <Button icon={RefreshCw} onPress={() => void generateBriefing(api, locale)}>
                {t("markets.briefingGenerate")}
              </Button>
            </View>
          )}
        </View>
      ) : (
        <View style={{ marginTop: 14 }}>
          {stale && (
            <Text style={[s.small, { color: colors.faint, marginBottom: 10 }]}>
              {t("markets.briefingStaleHint")}
            </Text>
          )}
          <View style={{ gap: 8 }}>
            {briefing.summary.map((point, index) => (
              <View key={point} style={[s.row, { alignItems: "flex-start", gap: 8 }]}>
                <Text style={[s.muted, { fontSize: 13, color: colors.faint, width: 16 }]}>
                  {index + 1}.
                </Text>
                <Text style={[s.text, { flex: 1, fontSize: 14, lineHeight: 21 }]}>{point}</Text>
              </View>
            ))}
          </View>

          {expanded && (
            <View>
              {briefing.marketData.length > 0 && (
                <>
                  <SectionLabel>{t("markets.briefingMarketData")}</SectionLabel>
                  <MarketDataSection rows={briefing.marketData} />
                </>
              )}
              <SectionLabel>{t("markets.briefingWatchlist")}</SectionLabel>
              {briefing.symbolUpdates.length ? (
                <WatchlistSection rows={briefing.symbolUpdates} />
              ) : (
                <Text style={s.muted}>{t("markets.briefingNoUpdates")}</Text>
              )}
              <SectionLabel>{t("markets.briefingEvents")}</SectionLabel>
              {briefing.events.length ? (
                <EventsSection rows={briefing.events} />
              ) : (
                <Text style={s.muted}>{t("markets.briefingNoEvents")}</Text>
              )}
            </View>
          )}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
            <ActionButton
              icon={MessageCircle}
              label={t("markets.briefingFollowUp")}
              onPress={() => ask(t("markets.briefingFollowUpPrompt"))}
            />
            <ActionButton
              icon={expanded ? Sparkles : Target}
              label={expanded ? t("markets.briefingOpenWatchlist") : t("markets.briefingExpand")}
              onPress={() => (expanded ? navigate("watchlist") : toggle())}
            />
          </View>
        </View>
      )}
    </Card>
  );
}
