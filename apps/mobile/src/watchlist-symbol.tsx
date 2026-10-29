import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useAgentWorkspace } from "./agent-workspace";
import { useTranslation } from "./i18n";
import {
  Bell,
  ChevronRight,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "./icons";
import { workbenchInsightView } from "./insight-view";
import { addSymbols, normalizeCode, type Quote, removeSymbol, type SymbolMeta } from "./market";
import { directionOf, formatPercent, formatPrice } from "./market-format";
import { NoteDetailSheet, NoteEditorSheet } from "./note-ui";
import { type InvestmentNote, loadNotes, useNotesState } from "./notes";
import { availabilityFromQuote, useQuotes } from "./quotes";
import { fetchLatestReport } from "./research";
import { Button, colors, marketDirectionColor, Sheet, s, typography } from "./ui";
import { latestInsightForSymbol, latestNoteForSymbol } from "./watchlist-symbol-view";
import { useWorkspace } from "./workspace";

type AnalysisStatus = "loading" | "pending" | "analyzed" | "unavailable";

function marketAssetLabel(
  symbol: SymbolMeta,
  t: ReturnType<typeof useTranslation>["t"],
): { market: string; asset: string } {
  if (symbol.market === "FUND") {
    return { market: t("markets.marketFund"), asset: t("markets.assetFund") };
  }
  if (symbol.market === "ETF") {
    const region = /\.(SS|SZ)$/i.test(symbol.code)
      ? "CN"
      : /\.HK$/i.test(symbol.code)
        ? "HK"
        : "US";
    return {
      market: t(
        region === "CN"
          ? "markets.marketCN"
          : region === "HK"
            ? "markets.marketHK"
            : "markets.marketUS",
      ),
      asset: t("markets.assetETF"),
    };
  }
  return {
    market: t(
      symbol.market === "CN"
        ? "markets.marketCN"
        : symbol.market === "HK"
          ? "markets.marketHK"
          : "markets.marketUS",
    ),
    asset: t("markets.assetStock"),
  };
}

/**
 * 自选标的第一层摘要弹窗。
 * 深层研究、提醒管理和完整新闻仍由 SymbolDetailSheet 承载，避免一次点击直接进入重页面。
 */
export function WatchlistSymbolSheet({
  symbol,
  quote: initialQuote,
  watchlist,
}: {
  symbol: SymbolMeta;
  quote?: Quote;
  watchlist: { id: string; name: string };
}) {
  const { api, ask, close, notify, open } = useWorkspace();
  const { data: agent } = useAgentWorkspace();
  const notesState = useNotesState();
  const { t } = useTranslation();
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("loading");
  const [editor, setEditor] = useState<"note" | "reason">();
  const [noteView, setNoteView] = useState<InvestmentNote>();
  const [editingNote, setEditingNote] = useState<InvestmentNote>();
  const { quotes, retry } = useQuotes(api, [symbol.code], { refreshMs: 60_000 });
  const availability =
    quotes[symbol.code]?.status === "ready"
      ? quotes[symbol.code]
      : initialQuote
        ? availabilityFromQuote(initialQuote)
        : (quotes[symbol.code] ?? { status: "loading" as const });
  const quote = availability.status === "ready" ? availability.quote : initialQuote;
  const currency =
    quote?.currency ??
    (symbol.market === "CN" || symbol.market === "FUND"
      ? "CNY"
      : symbol.market === "HK"
        ? "HKD"
        : "USD");
  const precision = quote?.precision ?? (symbol.market === "FUND" ? 4 : 2);
  const changePercent = quote?.changePercent;
  const changeColor =
    changePercent === undefined ? colors.muted : marketDirectionColor(directionOf(changePercent));
  const labels = marketAssetLabel(symbol, t);
  const latestNote = latestNoteForSymbol(notesState.notes, symbol.code);
  const symbolNoteCount = useMemo(
    () =>
      notesState.notes.filter(
        (note) => normalizeCode(note.symbolCode) === normalizeCode(symbol.code),
      ).length,
    [notesState.notes, symbol.code],
  );
  const insightArtifact = latestInsightForSymbol(agent?.artifacts ?? [], symbol);
  const insight = insightArtifact ? workbenchInsightView(insightArtifact) : undefined;

  useEffect(() => {
    void loadNotes(api);
  }, [api]);

  useEffect(() => {
    let active = true;
    setAnalysisStatus("loading");
    void fetchLatestReport(api, symbol.code)
      .then((report) => {
        if (active) setAnalysisStatus(report ? "analyzed" : "pending");
      })
      .catch(() => {
        if (active) setAnalysisStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, [api, symbol.code]);

  const openDetail = (focus?: "alerts") =>
    open({
      type: "symbol",
      symbol,
      quote,
      watchlist,
      focus,
    });

  const remove = () => {
    removeSymbol(api, watchlist.id, symbol.code);
    close();
    notify(t("markets.watchlistRemoved", { name: symbol.name }), {
      label: t("markets.watchlistUndo"),
      onPress: () => addSymbols(api, watchlist.id, [symbol]),
    });
  };

  return (
    <>
      <Sheet
        title={symbol.name}
        subtitle={`${symbol.code} · ${labels.market} · ${labels.asset}`}
        narrow
        onClose={close}
      >
        <View style={{ gap: 16 }}>
          <View
            style={{
              gap: 14,
              paddingBottom: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
            }}
          >
            <View style={[s.between, { gap: 16, alignItems: "flex-end" }]}>
              <View style={{ gap: 4 }}>
                <Text style={[s.small, { color: colors.faint }]}>
                  {symbol.market === "FUND"
                    ? t("markets.watchPopupNav")
                    : t("markets.watchPopupPrice")}
                </Text>
                <View style={[s.row, { gap: 6, alignItems: "baseline" }]}>
                  <Text
                    style={[
                      s.metric,
                      {
                        fontSize: 28,
                        lineHeight: 36,
                        color: colors.heading,
                        fontVariant: ["tabular-nums"],
                      },
                    ]}
                  >
                    {quote ? formatPrice(quote.price, currency, precision) : "—"}
                  </Text>
                  <Text style={[s.small, { color: colors.faint }]}>{quote ? currency : ""}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={[s.small, { color: colors.faint }]}>
                  {t("markets.watchPopupChange")}
                </Text>
                <Text
                  style={[
                    s.metric,
                    {
                      fontSize: 17,
                      color: changeColor,
                      fontVariant: ["tabular-nums"],
                    },
                  ]}
                >
                  {changePercent === undefined ? "—" : formatPercent(changePercent)}
                </Text>
              </View>
            </View>
            {availability.status === "loading" && (
              <View style={[s.row, { gap: 6 }]}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={s.small}>{t("markets.loading")}</Text>
              </View>
            )}
            {availability.status === "unavailable" && (
              <Pressable
                accessibilityRole="button"
                onPress={retry}
                style={[s.row, { gap: 6, minHeight: 32 }]}
              >
                <Text style={[s.small, { color: colors.link }]}>
                  {t("markets.watchPopupQuoteUnavailable")}
                </Text>
                <Text style={[s.small, { color: colors.primaryStrong, fontWeight: "600" }]}>
                  {t("quotes.retry")}
                </Text>
              </Pressable>
            )}
            <View style={[s.between, { gap: 12, flexWrap: "wrap" }]}>
              <View style={[s.row, { gap: 8 }]}>
                <View style={[s.row, s.chip, { gap: 4, minHeight: 24 }]}>
                  <Target size={11} color={colors.text} />
                  <Text style={[s.chipText, { color: colors.text }]}>
                    {t("markets.watchPopupFollowing")}
                  </Text>
                </View>
                {analysisStatus !== "unavailable" && (
                  <View style={[s.chip, { minHeight: 24 }]}>
                    {analysisStatus === "loading" ? (
                      <ActivityIndicator color={colors.faint} size="small" />
                    ) : (
                      <Text style={s.chipText}>
                        {t(
                          analysisStatus === "analyzed"
                            ? "markets.watchPopupAnalyzed"
                            : "markets.watchPopupPending",
                        )}
                      </Text>
                    )}
                  </View>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditor("reason")}
                style={[s.row, { gap: 4, minHeight: 32 }]}
              >
                <Text style={[s.small, { color: colors.link }]}>
                  {t("markets.watchPopupAddReason")}
                </Text>
                <Pencil size={12} color={colors.link} />
              </Pressable>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
              {t("markets.watchPopupInsight")}
            </Text>
            {insight && insightArtifact ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => open({ type: "insight", artifact: insightArtifact })}
                style={({ pressed }) => [
                  s.card,
                  {
                    padding: 14,
                    gap: 8,
                    borderColor: colors.line,
                    backgroundColor: pressed ? colors.overlay1 : colors.paper,
                  },
                ]}
              >
                <View style={[s.between, { gap: 8 }]}>
                  <View style={[s.row, { gap: 6, flex: 1, minWidth: 0 }]}>
                    <Sparkles size={12} color={colors.primary} />
                    <Text numberOfLines={1} style={[s.small, { color: colors.muted }]}>
                      {insight.category
                        ? `${t("markets.watchPopupInsight")} · ${insight.category}`
                        : t("markets.watchPopupInsight")}
                    </Text>
                  </View>
                  <ChevronRight size={14} color={colors.faint} />
                </View>
                <Text
                  numberOfLines={2}
                  style={[
                    typography.insightTitle,
                    { fontSize: 16, lineHeight: 23, color: colors.heading },
                  ]}
                >
                  {insight.title}
                </Text>
                {!!insight.takeaway && (
                  <Text numberOfLines={2} style={[typography.prose, { color: colors.muted }]}>
                    {insight.takeaway}
                  </Text>
                )}
                <View style={[s.between, { gap: 8 }]}>
                  <Text numberOfLines={1} style={[s.small, { flex: 1, color: colors.faint }]}>
                    {[insight.symbolName, insight.code].filter(Boolean).join(" · ")}
                  </Text>
                  <Text style={[s.small, { color: colors.link }]}>
                    {t("markets.watchPopupReadInsight")}
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View
                style={[
                  s.card,
                  { padding: 14, gap: 6, borderStyle: "dashed", backgroundColor: colors.surface },
                ]}
              >
                <View style={[s.row, { gap: 6 }]}>
                  <Sparkles size={12} color={colors.faint} />
                  <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                    {t("markets.watchPopupInsightEmptyTitle")}
                  </Text>
                </View>
                <Text style={s.small}>{t("markets.watchPopupInsightEmptyDetail")}</Text>
              </View>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <View style={[s.between, { gap: 8 }]}>
              <View style={[s.row, { gap: 6 }]}>
                <FileText size={13} color={colors.faint} />
                <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                  {t("markets.watchPopupNotes", { count: symbolNoteCount })}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditor("note")}
                style={[s.row, { gap: 4, minHeight: 32 }]}
              >
                <Text style={[s.small, { color: colors.link }]}>
                  {t("markets.watchPopupAddNote")}
                </Text>
                <Plus size={12} color={colors.link} />
              </Pressable>
            </View>
            {latestNote ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={latestNote.title || latestNote.content}
                onPress={() => setNoteView(latestNote)}
                style={({ pressed }) => [
                  s.card,
                  {
                    padding: 14,
                    gap: 5,
                    backgroundColor: pressed ? colors.overlay1 : colors.paper,
                  },
                ]}
              >
                {!!latestNote.title && (
                  <Text numberOfLines={1} style={[s.text, { fontSize: 13, fontWeight: "600" }]}>
                    {latestNote.title}
                  </Text>
                )}
                <Text numberOfLines={2} style={[s.muted, { fontSize: 12 }]}>
                  {latestNote.content}
                </Text>
                <Text style={[s.small, { color: colors.faint }]}>
                  {new Date(latestNote.updatedAt).toLocaleDateString()}
                </Text>
              </Pressable>
            ) : (
              <Text style={s.small}>{t("markets.watchPopupNotesEmpty")}</Text>
            )}
          </View>

          <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
            <Button
              small
              icon={Bell}
              style={{ minHeight: 42 }}
              onPress={() => openDetail("alerts")}
            >
              {t("markets.watchPopupSetAlert")}
            </Button>
            <Button
              small
              icon={Sparkles}
              style={{ minHeight: 42 }}
              onPress={() => {
                close();
                ask(
                  t("markets.watchlistAnalyzePrompt", {
                    name: symbol.name,
                    code: symbol.code,
                  }),
                );
              }}
            >
              {t("markets.watchPopupAnalyze")}
            </Button>
            <Button
              primary
              small
              icon={ExternalLink}
              style={{ minHeight: 42, marginLeft: "auto" }}
              onPress={() => openDetail()}
            >
              {t("markets.watchPopupViewDetail")}
            </Button>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={remove}
            style={[s.row, { alignSelf: "flex-start", gap: 4, minHeight: 32 }]}
          >
            <Trash2 size={12} color={colors.danger} />
            <Text style={[s.small, { color: colors.danger }]}>{t("markets.watchlistRemove")}</Text>
          </Pressable>
        </View>
      </Sheet>

      {!!editor && (
        <NoteEditorSheet
          api={api}
          defaultType="RESEARCH"
          defaultSymbol={symbol.code}
          defaultTitle={
            editor === "reason" ? t("markets.watchPopupReasonTitle", { name: symbol.name }) : ""
          }
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            notify(t("notes.saved"));
          }}
        />
      )}
      {!!noteView && (
        <NoteDetailSheet
          api={api}
          note={notesState.notes.find((note) => note.id === noteView.id) ?? noteView}
          onClose={() => setNoteView(undefined)}
          onEdit={() => {
            setEditingNote(noteView);
            setNoteView(undefined);
          }}
          onChanged={() => {
            setNoteView(undefined);
            notify(t("notes.deleted"));
          }}
        />
      )}
      {!!editingNote && (
        <NoteEditorSheet
          api={api}
          initial={editingNote}
          onClose={() => setEditingNote(undefined)}
          onSaved={() => {
            setEditingNote(undefined);
            notify(t("notes.saved"));
          }}
        />
      )}
    </>
  );
}
