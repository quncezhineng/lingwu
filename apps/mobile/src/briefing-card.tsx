/**
 * 今日市场简报。
 *
 * 信息层级对齐 Demo：日期与来源 → 一句话导读 → 三项指数 →
 * 阅读线索（真实研究产物）→ 可折叠完整简报 → 下载 / 资料库 / 继续分析。
 * 所有行情与洞察均来自现有 store，缺少数据时呈现明确空态。
 */
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import type { AgentArtifact } from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import {
  briefingIndices,
  briefingInsightView,
  briefingLead,
  briefingRelationStats,
  latestBriefingInsights,
} from "./briefing-view";
import { saveTextFile } from "./csv-file";
import { activeLocaleTag, useTranslation } from "./i18n";
import { statusLabel } from "./i18n/translate";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  Download,
  FileText,
  FolderOpen,
  MessageCircle,
  RefreshCw,
  Sparkles,
} from "./icons";
import { InsightCard } from "./insight-card";
import {
  type AlertKind,
  type BriefingEvent,
  type BriefingSymbolUpdate,
  generateBriefing,
  type IndexQuote,
  loadBriefing,
  type MarketBriefing,
  todayISO,
  useBriefingState,
} from "./market";
import { markdownPreviewDocument } from "./open-html-document";
import { Button, Card, colors, DisclaimerNote, dateLabel, ErrorNotice, s, typography } from "./ui";
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
function alertNoteKey(alert: AlertKind) {
  switch (alert) {
    case "price_break":
      return "markets.notePriceBreak" as const;
    case "volume_spike":
      return "markets.noteVolumeSpike" as const;
    case "news":
      return "markets.noteNews" as const;
    default:
      return "markets.noteChange" as const;
  }
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSoft,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 4,
      }}
    >
      {children}
    </View>
  );
}

function BriefingSectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <View style={[s.row, { gap: 9, marginTop: 22, marginBottom: 8 }]}>
      <Text style={[s.metric, { width: 18, fontSize: 10, color: colors.primaryStrong }]}>
        {number}
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 20, fontWeight: "600", color: colors.text }}>
        {title}
      </Text>
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
              <Activity size={13} strokeWidth={1.9} color={colors.alertVolume} />
            ) : row.alert === "price_break" ? (
              <View
                style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.danger }}
              />
            ) : row.alert === "news" ? (
              <FileText size={13} color={colors.primary} />
            ) : (
              <View
                style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: colors.faint }}
              />
            )}
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text style={[s.text, { fontSize: 13, fontWeight: "600" }]} numberOfLines={1}>
                {row.name || row.code}
              </Text>
              <Text style={[s.small, { fontSize: 10 }]} numberOfLines={1}>
                {row.code} · {row.alert ? t(alertNoteKey(row.alert)) : t("markets.briefingNoMove")}
              </Text>
            </View>
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
          <CalendarDays size={14} color={colors.faint} />
          <Text style={[s.small, s.metric, { color: colors.faint, width: 64 }]}>{row.time}</Text>
          <Text style={[s.text, { flex: 1, fontSize: 13 }]} numberOfLines={2}>
            {row.title}
          </Text>
        </View>
      ))}
    </Panel>
  );
}

function BriefingInsightCard({
  artifact,
  onOpen,
}: {
  artifact: AgentArtifact;
  onOpen: (artifact: AgentArtifact) => void;
}) {
  const { t } = useTranslation();
  const view = briefingInsightView(artifact);
  const category = view.category || statusLabel(artifact.kind);
  const symbol = [view.symbolName, view.code].filter(Boolean).join(" · ");
  const meta = symbol || `${statusLabel(artifact.kind)} · ${dateLabel(artifact.createdAt)}`;
  return (
    <InsightCard
      collapsed
      eyebrow={`${t("markets.briefingInsightEyebrow")} · ${category}`}
      title={view.title}
      meta={meta}
      actionLabel={t("markets.briefingInspectInsight")}
      accessibilityLabel={t("markets.briefingOpenInsight", { title: view.title })}
      onPress={() => onOpen(artifact)}
      style={{
        paddingTop: 15,
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: colors.paper,
        borderRadius: 8,
      }}
    />
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

function briefingMarkdown(
  briefing: MarketBriefing,
  t: ReturnType<typeof useTranslation>["t"],
  lead: string,
) {
  const relation = briefingRelationStats(briefing.symbolUpdates);
  const marketRows = briefing.marketData.length
    ? briefing.marketData
        .map((row) => `- **${row.name}**：${formatPercent(row.changePercent)}（${row.value}）`)
        .join("\n")
    : `- ${t("markets.briefingNoMarketData")}`;
  const updates = briefing.symbolUpdates.length
    ? briefing.symbolUpdates
        .map(
          (row) =>
            `- **${row.name || row.code}（${row.code}）**：${formatPercent(row.changePercent)}，${row.price}`,
        )
        .join("\n")
    : `- ${t("markets.briefingNoUpdates")}`;
  const events = briefing.events.length
    ? briefing.events.map((row) => `- ${row.time} · ${row.title}`).join("\n")
    : briefing.eventsStatus === "not_implemented"
      ? `- ${t("markets.briefingEventsPending")}`
      : `- ${t("markets.briefingNoEvents")}`;

  return [
    `# ${t("markets.briefingTitle")}`,
    "",
    `> ${dateLabel(briefing.date, { month: "long", day: "numeric" })} · ${t("markets.briefingContext")}`,
    "",
    lead,
    "",
    `## ${t("markets.briefingMarketOverview")}`,
    marketRows,
    "",
    ...briefing.summary.slice(1).map((point) => `- ${point}`),
    "",
    `## ${t("markets.briefingFocus")}`,
    updates,
    "",
    `## ${t("markets.briefingRelation")}`,
    relation.total
      ? t("markets.briefingRelationSummary", {
          count: relation.total,
          moved: relation.moved,
        })
      : t("markets.briefingRelationEmpty"),
    "",
    `## ${t("markets.briefingNext")}`,
    events,
    briefing.eventsNote && briefing.eventsStatus !== "not_implemented"
      ? `\n${briefing.eventsNote}`
      : "",
    "",
    "---",
    t("ui.disclaimer"),
  ].join("\n");
}

export function MarketBriefingCard({
  plain = false,
  onRequestClose,
}: {
  plain?: boolean;
  onRequestClose?: () => void;
} = {}) {
  const { api, ask, navigate, notify, open } = useWorkspace();
  const { data } = useAgentWorkspace();
  const { t, locale } = useTranslation();
  const { width } = useWindowDimensions();
  const state = useBriefingState();
  const [expanded, setExpanded] = useState(false);
  const compact = width < 600;

  useEffect(() => {
    void loadBriefing(api, locale);
  }, [api, locale]);

  const briefing = state.briefing;
  const stale = !!briefing && (briefing.isToday === false || briefing.date < todayISO());
  const title = t(stale ? "markets.briefingYesterdayTitle" : "markets.briefingTitle");
  const lead = briefing ? briefingLead(briefing.summary) : "";
  const insights = useMemo(() => latestBriefingInsights(data?.artifacts ?? []), [data?.artifacts]);
  const indices = useMemo(() => (briefing ? briefingIndices(briefing.marketData) : []), [briefing]);
  const relation = useMemo(
    () => briefingRelationStats(briefing?.symbolUpdates ?? []),
    [briefing?.symbolUpdates],
  );

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => !current);
  };

  const openInsight = (artifact: AgentArtifact) => {
    onRequestClose?.();
    open({ type: "artifact", artifact });
  };

  const openFiles = () => {
    onRequestClose?.();
    navigate("files");
  };

  const continueAnalysis = () => {
    onRequestClose?.();
    if (!briefing) return;
    const market = briefing.marketData
      .map((row) => `${row.name} ${formatPercent(row.changePercent)}`)
      .join(" · ");
    const watchlist = briefing.symbolUpdates
      .map(
        (row) =>
          `${row.name || row.code} (${row.code}) ${formatPercent(row.changePercent)}${
            row.alert ? ` · ${t(alertNoteKey(row.alert))}` : ""
          }`,
      )
      .join(" · ");
    ask(
      t("markets.briefingFollowUpPrompt", {
        date: dateLabel(briefing.date, { month: "long", day: "numeric" }),
        source:
          state.source === "mock" ? t("markets.watchlistSample") : t("markets.briefingLiveSource"),
        summary: briefing.summary.join(" · "),
        market: market || t("markets.briefingNoMarketData"),
        watchlist: watchlist || t("markets.briefingNoUpdates"),
      }),
    );
  };

  const download = async () => {
    if (!briefing) return;
    try {
      const filename = `${briefing.date}-${t("markets.briefingDownloadName")}`
        .replace(/[\\/:*?"<>|]/g, "-")
        .concat(".html");
      const document = markdownPreviewDocument(
        briefingMarkdown(briefing, t, lead || t("markets.briefingFallbackLead")),
        title,
      );
      await saveTextFile(filename, document, "text/html;charset=utf-8");
      notify(t("markets.briefingDownloaded"));
    } catch {
      notify(t("markets.briefingDownloadError"));
    }
  };

  let body: ReactNode;
  if (state.status === "loading" || state.status === "generating") {
    body = (
      <View style={{ gap: 14, marginTop: plain ? 0 : 16 }}>
        {state.status === "generating" && (
          <View style={[s.row, { gap: 8 }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={s.muted}>{t("markets.briefingGenerating")}</Text>
          </View>
        )}
        <SkeletonLines />
      </View>
    );
  } else if (!briefing) {
    body = (
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
            <Activity size={28} color={colors.faint} />
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
    );
  } else {
    body = (
      <View style={{ gap: 0, marginTop: plain ? 0 : 16 }}>
        <View style={[s.between, { gap: 12, flexWrap: "wrap" }]}>
          <Text style={[typography.caption, { color: colors.faint }]}>
            {dateLabel(briefing.date, { month: "long", day: "numeric" })} ·{" "}
            {t("markets.briefingContext")}
          </Text>
          <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
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
            {briefing.dataStatus === "partial" && (
              <View
                style={[
                  s.chip,
                  {
                    backgroundColor: colors.alertVolumeSurface,
                    borderColor: colors.alertVolumeSurface,
                  },
                ]}
              >
                <Text style={[s.chipText, { color: colors.alertVolumeText }]}>
                  {t("markets.briefingPartial")}
                </Text>
              </View>
            )}
          </View>
        </View>

        {stale && (
          <Text style={[s.small, { color: colors.faint, marginTop: 10 }]}>
            {t("markets.briefingStaleHint")}
          </Text>
        )}

        {briefing.dataStatus === "partial" && (
          <View
            style={[
              s.row,
              {
                flexWrap: "wrap",
                gap: 8,
                padding: 12,
                borderRadius: 8,
                backgroundColor: colors.alertVolumeSurface,
                marginTop: 12,
              },
            ]}
          >
            <AlertTriangle size={15} color={colors.alertVolumeText} />
            <View style={{ flex: 1, minWidth: 160, gap: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.alertVolumeText }}>
                {t("markets.briefingPartial")}
              </Text>
              <Text style={{ fontSize: 11, lineHeight: 16, color: colors.alertVolumeText }}>
                {t("markets.briefingPartialHint")}
                {briefing.unavailable?.length
                  ? ` · ${briefing.unavailable.slice(0, 5).join(", ")}`
                  : ""}
              </Text>
            </View>
            <Button
              small
              icon={RefreshCw}
              onPress={() => void generateBriefing(api, locale, { force: true })}
            >
              {t("markets.briefingRegenerate")}
            </Button>
          </View>
        )}

        <Text
          style={{
            marginTop: 15,
            color: colors.heading,
            fontFamily: typography.prose.fontFamily,
            fontSize: 15,
            lineHeight: 25,
          }}
        >
          {lead || t("markets.briefingFallbackLead")}
        </Text>

        <View
          style={{
            flexDirection: compact ? "column" : "row",
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: colors.line,
            marginTop: 17,
          }}
        >
          {indices.length ? (
            indices.map((row, index) => (
              <View
                key={row.name}
                style={{
                  flex: 1,
                  minWidth: 0,
                  gap: 6,
                  paddingVertical: 13,
                  paddingHorizontal: compact ? 0 : 16,
                  borderLeftWidth: !compact && index ? 1 : 0,
                  borderTopWidth: compact && index ? 1 : 0,
                  borderColor: colors.line,
                }}
              >
                <Text style={{ fontSize: 11, lineHeight: 17, color: colors.faint }}>
                  {row.name}
                </Text>
                <Text
                  style={[
                    s.metric,
                    {
                      fontSize: 20,
                      lineHeight: 26,
                      color: changeColor(row.changePercent),
                    },
                  ]}
                >
                  {row.changePercent < 0
                    ? `−${Math.abs(row.changePercent).toFixed(2)}%`
                    : formatPercent(row.changePercent)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[s.muted, { paddingVertical: 16 }]}>
              {t("markets.briefingNoMarketData")}
            </Text>
          )}
        </View>

        <View style={[s.row, { gap: 9, marginTop: 22, marginBottom: 12 }]}>
          <Sparkles size={14} color={colors.primary} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
            {t("markets.briefingInsightHeading")}
          </Text>
          <Text style={{ fontSize: 10, color: colors.faint }}>
            {t("markets.briefingInsightCount", { count: insights.length })}
          </Text>
        </View>

        {insights.length ? (
          <View style={{ gap: 11 }}>
            {insights.map((artifact) => (
              <BriefingInsightCard key={artifact.id} artifact={artifact} onOpen={openInsight} />
            ))}
          </View>
        ) : (
          <View
            style={{
              alignItems: "center",
              gap: 8,
              paddingVertical: 22,
              paddingHorizontal: 18,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 8,
              backgroundColor: colors.surfaceSoft,
            }}
          >
            <Sparkles size={20} color={colors.faint} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
              {t("markets.briefingInsightEmptyTitle")}
            </Text>
            <Text style={[s.small, { textAlign: "center", maxWidth: 390 }]}>
              {t("markets.briefingInsightEmptyDetail")}
            </Text>
            <Button small icon={FolderOpen} onPress={openFiles}>
              {t("markets.briefingViewFiles")}
            </Button>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={t(
            expanded ? "markets.briefingCollapseFull" : "markets.briefingExpandFull",
          )}
          onPress={toggleExpanded}
          style={({ pressed }) => [
            s.between,
            {
              minHeight: 44,
              marginTop: 20,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: colors.line,
              backgroundColor: pressed ? colors.overlay1 : "transparent",
            },
          ]}
        >
          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted }}>
            {t(expanded ? "markets.briefingCollapseFull" : "markets.briefingExpandFull")}
          </Text>
          <View style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}>
            <ChevronDown size={15} color={colors.faint} />
          </View>
        </Pressable>

        {expanded && (
          <View>
            <BriefingSectionTitle number="01" title={t("markets.briefingMarketOverview")} />
            <View style={{ gap: 7 }}>
              {briefing.summary.slice(1).map((point) => (
                <View key={point} style={[s.row, { alignItems: "flex-start", gap: 8 }]}>
                  <View
                    style={{
                      width: 4,
                      height: 4,
                      marginTop: 8,
                      borderRadius: 999,
                      backgroundColor: colors.lineStrong,
                    }}
                  />
                  <Text style={[s.text, { flex: 1, fontSize: 13, lineHeight: 21 }]}>{point}</Text>
                </View>
              ))}
            </View>
            {briefing.marketData.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <MarketDataSection rows={briefing.marketData} />
              </View>
            )}

            <BriefingSectionTitle number="02" title={t("markets.briefingFocus")} />
            {briefing.symbolUpdates.length ? (
              <WatchlistSection rows={briefing.symbolUpdates} />
            ) : (
              <Text style={s.muted}>{t("markets.briefingNoUpdates")}</Text>
            )}

            <BriefingSectionTitle number="03" title={t("markets.briefingRelation")} />
            <Text style={[s.muted, { fontSize: 13, lineHeight: 22 }]}>
              {relation.total
                ? t("markets.briefingRelationSummary", {
                    count: relation.total,
                    moved: relation.moved,
                  })
                : t("markets.briefingRelationEmpty")}
            </Text>

            <BriefingSectionTitle number="04" title={t("markets.briefingNext")} />
            {briefing.events.length ? (
              <EventsSection rows={briefing.events} />
            ) : (
              <Text style={s.muted}>
                {briefing.eventsStatus === "not_implemented"
                  ? t("markets.briefingEventsPending")
                  : t("markets.briefingNoEvents")}
              </Text>
            )}
            {!!briefing.eventsNote && briefing.eventsStatus !== "not_implemented" && (
              <Text style={[s.small, { marginTop: 8 }]}>{briefing.eventsNote}</Text>
            )}
          </View>
        )}

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            marginTop: 24,
          }}
        >
          <Button
            icon={Download}
            onPress={() => void download()}
            style={{ flexGrow: compact ? 1 : 0 }}
          >
            {t("markets.briefingDownload")}
          </Button>
          <Button icon={FolderOpen} onPress={openFiles} style={{ flexGrow: compact ? 1 : 0 }}>
            {t("markets.briefingViewFiles")}
          </Button>
          <Button
            primary
            icon={MessageCircle}
            onPress={continueAnalysis}
            style={{ flexGrow: compact ? 1 : 0 }}
          >
            {t("markets.briefingContinue")}
          </Button>
        </View>
        <DisclaimerNote />
      </View>
    );
  }

  if (plain) return body;
  return (
    <Card style={{ gap: 0 }}>
      <View style={[s.between, { gap: 12 }]}>
        <View style={[s.row, { gap: 8, flex: 1, minWidth: 0 }]}>
          <Activity size={18} color={colors.primary} />
          <Text style={s.heading} numberOfLines={1}>
            {title}
          </Text>
          {stale && (
            <View style={[s.chip, { backgroundColor: colors.surface }]}>
              <Text style={s.chipText}>{t("markets.briefingYesterday")}</Text>
            </View>
          )}
          {state.status === "ready" && state.source === "mock" && (
            <View style={[s.chip, { backgroundColor: colors.surface }]}>
              <Text style={s.chipText}>{t("markets.watchlistSample")}</Text>
            </View>
          )}
        </View>
        {briefing && <Text style={s.small}>{briefing.date}</Text>}
      </View>
      {body}
    </Card>
  );
}
