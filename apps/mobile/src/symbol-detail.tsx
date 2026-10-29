/**
 * F3 标的详情 + F4 深度研究交互（全屏 Sheet）。
 *
 * F3：行情概览、近期新闻（来自最新研报）、公告占位、价格提醒 CRUD（B6）、
 *     Agent 异动分析入口。
 * F4：POST /api/research 触发 → 轮询 /api/agent/tasks/:id 展示 4 步进度 →
 *     GET /api/research/:symbol 展示 6 模块研报 → 导出（Web 打印为 PDF）→ 追问。
 *     估值区强制标注「启发式区间估算，非 DCF 模型」；报告底部含来源与免责声明。
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import type { AgentTask, RunEvent } from "../../../packages/domain/src/agent";
import { FinancialsSection } from "./financials-card";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import {
  Check,
  CircleX,
  FileText,
  MessageCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "./icons";
import { type Quote, removeSymbol, type SymbolMeta } from "./market";
import { directionOf, formatPercent } from "./market-format";
import { SymbolNotesSection } from "./note-ui";
import { setNotesIntent } from "./notes";
import {
  checkPriceAlert,
  createPriceAlert,
  deletePriceAlert,
  listPriceAlerts,
  type PriceAlertRecord,
  type ThresholdType,
  updatePriceAlert,
} from "./price-alerts";
import { QuoteCard } from "./quote-card";
import { availabilityFromQuote, useQuotes } from "./quotes";
import {
  fetchLatestReport,
  fetchResearchTask,
  isResearchDone,
  type ReportLabels,
  type ResearchReport,
  researchReportDocument,
  startResearch,
} from "./research";
import { Toggle } from "./toggle";
import {
  Button,
  Card,
  colors,
  DisclaimerNote,
  ErrorNotice,
  marketDirectionColor,
  SectionHeading,
  Sheet,
  s,
} from "./ui";
import { useWorkspace } from "./workspace";

const ALERT_TYPES: ReadonlyArray<{ id: ThresholdType; labelKey: TranslationKey }> = [
  { id: "PRICE_ABOVE", labelKey: "research.priceAbove" },
  { id: "PRICE_BELOW", labelKey: "research.priceBelow" },
  { id: "CHANGE_PCT", labelKey: "research.changePct" },
];

const _MARKET_CHIP: Record<SymbolMeta["market"], TranslationKey> = {
  US: "markets.marketUS",
  CN: "markets.marketCN",
  HK: "markets.marketHK",
  ETF: "markets.marketETF",
  FUND: "markets.marketFund",
};

const REASON_KEYS: Record<string, TranslationKey> = {
  disabled: "research.checkDisabled",
  deduplicated: "research.checkDedup",
  quote_unavailable: "research.checkQuoteUnavailable",
  not_triggered: "research.checkNotTriggered",
};

const FIN_KEYS: Record<string, TranslationKey> = {
  price: "research.finPrice",
  previousClose: "research.finPreviousClose",
  change: "research.finChange",
  changePercent: "research.finChangePercent",
  dayHigh: "research.finDayHigh",
  dayLow: "research.finDayLow",
  volume: "research.finVolume",
  fiftyTwoWeekHigh: "research.fin52wHigh",
  fiftyTwoWeekLow: "research.fin52wLow",
  currency: "research.finCurrency",
  asOf: "research.finAsOf",
  source: "research.finSource",
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number")
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={[s.label, { color: colors.faint, marginTop: 18, marginBottom: 8 }]}>
      {children}
    </Text>
  );
}

/** 价格提醒行：类型/阈值 + 开关 + 检查 + 删除。 */
function AlertRow({
  alert,
  busy,
  confirming,
  onToggle,
  onCheck,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  alert: PriceAlertRecord;
  busy: boolean;
  confirming: boolean;
  onToggle: (enabled: boolean) => void;
  onCheck: () => void;
  onEdit: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const { t } = useTranslation();
  const label =
    alert.threshold_type === "CHANGE_PCT"
      ? `${t("research.changePct")} ${alert.threshold_value}%`
      : `${t(alert.threshold_type === "PRICE_ABOVE" ? "research.priceAbove" : "research.priceBelow")} ${alert.threshold_value}`;
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 12, gap: 6 }}>
      <View style={[s.row, { gap: 8 }]}>
        <Pressable accessibilityRole="button" onPress={onEdit} style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.text, { fontSize: 14, fontWeight: "600" }]}>{label}</Text>
          <Text style={s.small}>
            {t("research.intervalLabel")} {alert.interval_minutes}
            {alert.last_checked_at
              ? ` · ${t("research.lastChecked", {
                  time: new Date(alert.last_checked_at).toLocaleTimeString(),
                })}`
              : ""}
          </Text>
        </Pressable>
        <Toggle
          value={alert.enabled}
          disabled={busy}
          onValueChange={onToggle}
          label={t("research.enabled")}
        />
      </View>
      {confirming ? (
        <View style={{ gap: 8 }}>
          <Text style={[s.small, { color: colors.danger, fontWeight: "600" }]}>
            {t("research.deleteConfirm")}
          </Text>
          <View style={[s.row, { gap: 8 }]}>
            <Button small danger busy={busy} hitSlop={6} icon={Trash2} onPress={onConfirmDelete}>
              {t("research.deleteConfirmAction")}
            </Button>
            <Button small hitSlop={6} onPress={onCancelDelete}>
              {t("research.cancel")}
            </Button>
          </View>
        </View>
      ) : (
        <View style={[s.row, { gap: 8 }]}>
          <Button small busy={busy} hitSlop={6} onPress={onCheck} icon={RefreshCw}>
            {t("research.checkNow")}
          </Button>
          <Button small danger hitSlop={6} icon={Trash2} onPress={onRequestDelete}>
            {t("research.deleteAlert")}
          </Button>
        </View>
      )}
    </View>
  );
}

function ReportView({
  report,
  onExport,
  onFollowUp,
  onRerun,
  rerunBusy,
}: {
  report: ResearchReport;
  onExport: () => void;
  onFollowUp: () => void;
  onRerun: () => void;
  rerunBusy: boolean;
}) {
  const { t } = useTranslation();
  const [showAllFields, setShowAllFields] = useState(false);
  const financialEntries = Object.entries(report.financials).filter(
    ([key, value]) => key !== "unavailable" && value !== null && value !== undefined,
  );
  const visibleEntries = showAllFields ? financialEntries : financialEntries.slice(0, 6);
  const valuation = report.valuation;
  const heuristic =
    valuation?.method === "range_heuristic" || valuation?.method === "price_band_heuristic";
  return (
    <View style={{ gap: 4 }}>
      <View style={[s.between, { gap: 10, marginBottom: 4 }]}>
        <Text style={[s.heading, { flex: 1 }]}>{report.title}</Text>
        <Text style={s.small}>{new Date(report.generatedAt).toLocaleDateString()}</Text>
      </View>
      <Text style={s.small}>
        {report.symbolCode} · {new Date(report.generatedAt).toLocaleString()}
      </Text>

      <SectionLabel>{t("research.overview")}</SectionLabel>
      <Text style={s.text}>{report.companyOverview || "—"}</Text>

      <SectionLabel>{t("research.financials")}</SectionLabel>
      <View
        style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 10, overflow: "hidden" }}
      >
        {visibleEntries.map(([key, value], index) => (
          <View
            key={key}
            style={[
              s.between,
              {
                paddingHorizontal: 12,
                minHeight: 34,
                borderTopWidth: index ? 1 : 0,
                borderTopColor: colors.line,
              },
            ]}
          >
            <Text style={[s.muted, { fontSize: 12 }]}>
              {FIN_KEYS[key] ? t(FIN_KEYS[key]) : key}
            </Text>
            <Text style={[s.metric, { fontSize: 12, color: colors.text }]}>
              {displayValue(value)}
            </Text>
          </View>
        ))}
      </View>
      {financialEntries.length > 6 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowAllFields((current) => !current)}
          style={{ paddingVertical: 6 }}
        >
          <Text style={[s.small, { color: colors.primaryStrong, fontWeight: "600" }]}>
            {showAllFields
              ? t("research.showLess")
              : t("research.showAll", { count: financialEntries.length })}
          </Text>
        </Pressable>
      )}
      {report.unavailable.length > 0 && (
        <Text style={[s.small, { marginTop: 6 }]}>
          {t("research.unavailable")}: {report.unavailable.join(", ")}
        </Text>
      )}

      <SectionLabel>{t("research.news")}</SectionLabel>
      {report.news.length ? (
        report.news.map((item) => (
          <Pressable
            key={item.url}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(item.url)}
            style={({ pressed }) => [
              { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line, gap: 2 },
              pressed && { backgroundColor: colors.overlay1 },
            ]}
          >
            <Text style={[s.text, { fontSize: 13, color: colors.primaryStrong }]} numberOfLines={2}>
              {item.title}
            </Text>
            {!!item.publishedAt && <Text style={s.small}>{item.publishedAt}</Text>}
          </Pressable>
        ))
      ) : (
        <Text style={s.muted}>{t("research.noNews")}</Text>
      )}

      <SectionLabel>{t("research.peers")}</SectionLabel>
      {report.peers.length ? (
        <View
          style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 10, overflow: "hidden" }}
        >
          <View
            style={[
              s.row,
              { paddingHorizontal: 12, minHeight: 32, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[s.small, { width: 86 }]}>Symbol</Text>
            <Text style={[s.small, { flex: 1 }]}>Name</Text>
            <Text style={[s.small, { width: 70, textAlign: "right" }]}>Price</Text>
            <Text style={[s.small, { width: 64, textAlign: "right" }]}>Chg</Text>
          </View>
          {report.peers.map((peer, index) => (
            <View
              key={peer.symbol}
              style={[
                s.row,
                {
                  paddingHorizontal: 12,
                  minHeight: 34,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: colors.line,
                },
              ]}
            >
              <Text style={[s.text, { width: 86, fontSize: 12, fontWeight: "600" }]}>
                {peer.symbol}
              </Text>
              <Text style={[s.muted, { flex: 1, fontSize: 12 }]} numberOfLines={1}>
                {peer.name ?? "—"}
              </Text>
              <Text style={[s.metric, { width: 70, textAlign: "right", fontSize: 12 }]}>
                {displayValue(peer.price)}
              </Text>
              <Text
                style={[
                  s.metric,
                  {
                    width: 64,
                    textAlign: "right",
                    fontSize: 12,
                    color:
                      peer.changePercent === undefined
                        ? colors.faint
                        : marketDirectionColor(directionOf(peer.changePercent)),
                  },
                ]}
              >
                {peer.changePercent === undefined
                  ? (peer.error ?? "—")
                  : formatPercent(peer.changePercent)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.muted}>{t("research.noPeers")}</Text>
      )}

      <SectionLabel>{t("research.valuation")}</SectionLabel>
      {valuation ? (
        <View style={{ gap: 8 }}>
          {heuristic && (
            <View
              style={[
                s.row,
                {
                  gap: 6,
                  alignSelf: "flex-start",
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: colors.alertVolumeSurface,
                },
              ]}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.alertVolumeText }}>
                {t("research.heuristic")}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[
              { label: t("research.current"), value: valuation.current },
              { label: t("research.low"), value: valuation.low },
              { label: t("research.mid"), value: valuation.mid },
              { label: t("research.high"), value: valuation.high },
            ].map((item) => (
              <View
                key={item.label}
                style={[
                  s.card,
                  {
                    flexGrow: 1,
                    minWidth: 130,
                    padding: 10,
                    gap: 2,
                    backgroundColor: colors.surface,
                    borderColor: colors.line,
                  },
                ]}
              >
                <Text style={s.small}>{item.label}</Text>
                <Text style={[s.metric, { fontSize: 16, fontWeight: "600", color: colors.text }]}>
                  {displayValue(item.value)}
                </Text>
              </View>
            ))}
          </View>
          {valuation.assumptions.length > 0 && (
            <View style={{ gap: 4 }}>
              <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                {t("research.assumptions")}
              </Text>
              {valuation.assumptions.map((item) => (
                <Text key={item} style={s.small}>
                  · {item}
                </Text>
              ))}
            </View>
          )}
          {!!valuation.caveat && <Text style={s.small}>{valuation.caveat}</Text>}
        </View>
      ) : (
        <Text style={s.muted}>{t("research.noValuation")}</Text>
      )}

      <SectionLabel>{t("research.risks")}</SectionLabel>
      {report.risks.length ? (
        report.risks.map((risk) => (
          <Text key={risk} style={[s.text, { fontSize: 13 }]}>
            · {risk}
          </Text>
        ))
      ) : (
        <Text style={s.muted}>—</Text>
      )}

      <SectionLabel>{t("research.sources")}</SectionLabel>
      {report.news.length ? (
        report.news.map((item) => (
          <Pressable
            key={`src-${item.url}`}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(item.url)}
          >
            <Text style={[s.small, { color: colors.primaryStrong }]} numberOfLines={1}>
              {item.url}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text style={s.muted}>{t("research.noNews")}</Text>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        <Button icon={FileText} onPress={onExport}>
          {t("research.exportPdf")}
        </Button>
        <Button primary icon={MessageCircle} onPress={onFollowUp}>
          {t("research.followUp")}
        </Button>
        <Button icon={RefreshCw} busy={rerunBusy} onPress={onRerun}>
          {t("research.rerun")}
        </Button>
      </View>
    </View>
  );
}

function planTitle(title: string, t: (key: TranslationKey) => string) {
  const known: Record<string, TranslationKey> = {
    "Load market data": "research.stepLoadQuote",
    "Gather news and peer quotes": "research.stepGather",
    "Estimate a valuation range": "research.stepValuation",
    "Write the report": "research.stepWrite",
  };
  const key = known[title];
  return key ? t(key) : title;
}

function ResearchProgress({ task, events }: { task: AgentTask; events: RunEvent[] }) {
  const { t } = useTranslation();
  const stepEvents = events.filter((event) => event.kind === "step").slice(-3);
  return (
    <View style={{ gap: 10 }}>
      {task.plan.map((step) => {
        const color =
          step.status === "succeeded"
            ? colors.success
            : step.status === "failed"
              ? colors.danger
              : step.status === "running"
                ? colors.primary
                : colors.faint;
        return (
          <View key={step.id} style={[s.row, { gap: 10, alignItems: "flex-start" }]}>
            <View style={{ width: 16, alignItems: "center", paddingTop: 3 }}>
              {step.status === "running" ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : step.status === "succeeded" ? (
                <Check size={14} strokeWidth={1.9} color={color} />
              ) : step.status === "failed" ? (
                <CircleX size={14} strokeWidth={1.9} color={color} />
              ) : (
                <View
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    borderWidth: 1.5,
                    borderColor: colors.lineStrong,
                  }}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.text, { fontSize: 13, color: colors.text }]}>
                {planTitle(step.title, t)}
              </Text>
              {!!step.detail && <Text style={s.small}>{step.detail}</Text>}
              <Text style={s.small}>
                {step.status === "running"
                  ? t("research.statusRunning")
                  : step.status === "succeeded"
                    ? t("research.statusSucceeded")
                    : step.status === "failed"
                      ? t("research.statusFailed")
                      : t("research.statusPending")}
              </Text>
            </View>
          </View>
        );
      })}
      {stepEvents.map((event) => (
        <Text key={event.id} style={s.small} numberOfLines={2}>
          · {event.title}
        </Text>
      ))}
    </View>
  );
}

export function SymbolDetailSheet({
  symbol,
  quote,
  watchlist,
}: {
  symbol: SymbolMeta;
  quote?: Quote;
  watchlist?: { id: string; name: string };
}) {
  const { api, close, ask, navigate, notify, refresh } = useWorkspace();
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<PriceAlertRecord[]>();
  const [alertsError, setAlertsError] = useState("");
  const [alertBusyId, setAlertBusyId] = useState<string>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string>();
  const [form, setForm] = useState<{
    mode: "create" | "edit";
    id?: string;
    type: ThresholdType;
    threshold: string;
    interval: string;
    enabled: boolean;
  } | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [report, setReport] = useState<ResearchReport>();
  const [reportError, setReportError] = useState("");
  const [task, setTask] = useState<AgentTask>();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [researchError, setResearchError] = useState("");
  const [starting, setStarting] = useState(false);

  const { quotes, retry } = useQuotes(api, [symbol.code], { refreshMs: 60_000 });
  const fetched = quotes[symbol.code];
  const availability =
    fetched?.status === "ready"
      ? fetched
      : quote
        ? availabilityFromQuote(quote)
        : (fetched ?? { status: "loading" as const });

  async function loadAlerts(target = symbol.code) {
    setAlertsError("");
    try {
      const all = await listPriceAlerts(api);
      setAlerts(all.filter((alert) => alert.symbol_code === target));
      setConfirmDeleteId(undefined);
    } catch (error) {
      setAlertsError(errorText(error));
      setAlerts([]);
    }
  }

  useEffect(() => {
    void loadAlerts();
    void fetchLatestReport(api, symbol.code)
      .then((latest) => {
        setReport(latest);
        setReportError("");
      })
      .catch((error) => setReportError(errorText(error)));
  }, [api, symbol.code]);

  // 轮询研究任务直到终态。
  const taskId = task?.id;
  const taskStatus = task?.status;
  useEffect(() => {
    if (!taskId || !taskStatus || isResearchDone(task)) return;
    let active = true;
    const tick = async () => {
      try {
        const payload = await fetchResearchTask(api, taskId);
        if (!active) return;
        setTask(payload.task);
        setEvents(payload.events);
      } catch {
        // 轮询失败视为瞬时错误，下一轮继续。
      }
    };
    void tick();
    const timer = setInterval(tick, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, taskId, taskStatus]);

  // 任务成功后单独拉取研报，避免与轮询 effect 的清理竞争。
  useEffect(() => {
    if (task?.status !== "succeeded") return;
    let active = true;
    void fetchLatestReport(api, symbol.code)
      .then((latest) => {
        if (!active || !latest) return;
        setReport(latest);
        setReportError("");
        notify(t("research.reportReady"));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, task?.status, symbol.code]);

  async function runResearch() {
    setStarting(true);
    setResearchError("");
    try {
      const created = await startResearch(api, symbol.code);
      setTask(created);
      setEvents([]);
    } catch (error) {
      setResearchError(errorText(error));
    } finally {
      setStarting(false);
    }
  }

  function labelsForReport(): ReportLabels {
    return {
      disclaimer: t("ui.disclaimer"),
      sources: t("research.sources"),
      overview: t("research.overview"),
      financials: t("research.financials"),
      news: t("research.news"),
      peers: t("research.peers"),
      valuation: t("research.valuation"),
      risks: t("research.risks"),
      unavailable: t("research.unavailable"),
      heuristic: t("research.heuristic"),
      current: t("research.current"),
      low: t("research.low"),
      mid: t("research.mid"),
      high: t("research.high"),
      generatedAt: t("research.generatedAt"),
      noNews: t("research.noNews"),
      noPeers: t("research.noPeers"),
      noValuation: t("research.noValuation"),
    };
  }

  async function exportReport() {
    if (!report) return;
    const doc = researchReportDocument(report, labelsForReport());
    try {
      if (Platform.OS === "web") {
        const opened = (
          globalThis as unknown as {
            open?: (url: string, target: string) => Window | null;
          }
        ).open?.(
          URL.createObjectURL(new Blob([doc], { type: "text/html;charset=utf-8" })),
          "_blank",
        );
        if (!opened) {
          notify(t("research.exportUnsupported"));
          return;
        }
        const trigger = () => {
          try {
            opened.focus();
            opened.print();
          } catch {
            // 浏览器可能拦截自动打印；用户仍可手动打印。
          }
        };
        opened.addEventListener?.("load", trigger);
        setTimeout(trigger, 1200);
        notify(t("research.exportedPrint"));
        return;
      }
      const target = `${FileSystem.cacheDirectory}research-${report.symbolCode}-${Date.now()}.html`;
      await FileSystem.writeAsStringAsync(target, doc);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, { mimeType: "text/html", UTI: "public.html" });
        notify(t("research.exportedShare"));
      } else {
        notify(t("research.exportUnsupported"));
      }
    } catch {
      notify(t("research.exportUnsupported"));
    }
  }

  async function toggleAlert(alert: PriceAlertRecord, enabled: boolean) {
    setAlertBusyId(alert.id);
    try {
      await updatePriceAlert(api, alert.id, { enabled });
      await loadAlerts();
    } catch {
      notify(t("research.alertSaveError"));
    } finally {
      setAlertBusyId(undefined);
    }
  }

  async function removeAlert(alert: PriceAlertRecord) {
    setAlertBusyId(alert.id);
    try {
      await deletePriceAlert(api, alert.id);
      notify(t("research.alertDeleted"));
      await loadAlerts();
    } catch {
      notify(t("research.alertDeleteError"));
    } finally {
      setAlertBusyId(undefined);
    }
  }

  async function checkAlert(alert: PriceAlertRecord) {
    setAlertBusyId(alert.id);
    try {
      const result = await checkPriceAlert(api, alert.id);
      const key = result.triggered
        ? "research.checkTriggered"
        : (REASON_KEYS[result.reason ?? "not_triggered"] ?? "research.checkNotTriggered");
      notify(t(key));
      // 触发后后端已写入通知：用真实通知主键标记已读，并刷新未读角标。
      if (result.notificationId) {
        await api
          .request(`/api/agent/notifications/${encodeURIComponent(result.notificationId)}/read`, {})
          .catch(() => undefined);
        void refresh().catch(() => undefined);
      }
      await loadAlerts();
    } catch {
      notify(t("research.alertSaveError"));
    } finally {
      setAlertBusyId(undefined);
    }
  }

  async function submitForm() {
    if (!form) return;
    const threshold = Number(form.threshold);
    const interval = Number(form.interval);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      notify(t("research.thresholdInvalid"));
      return;
    }
    if (!Number.isInteger(interval) || interval < 1 || interval > 1440) {
      notify(t("research.intervalInvalid"));
      return;
    }
    setFormBusy(true);
    try {
      if (form.mode === "edit" && form.id) {
        await updatePriceAlert(api, form.id, {
          threshold_type: form.type,
          threshold_value: threshold,
          interval_minutes: interval,
          enabled: form.enabled,
        });
        notify(t("research.alertSaved"));
      } else {
        await createPriceAlert(api, {
          symbol_code: symbol.code,
          threshold_type: form.type,
          threshold_value: threshold,
          interval_minutes: interval,
          enabled: form.enabled,
        });
        notify(t("research.alertCreated"));
      }
      setForm(null);
      await loadAlerts();
    } catch {
      notify(t("research.alertSaveError"));
    } finally {
      setFormBusy(false);
    }
  }

  const running = !!task && !isResearchDone(task);
  const failed = task?.status === "failed";

  return (
    <Sheet title={`${symbol.code} · ${symbol.name}`} onClose={close} fullscreen>
      {/* 行情概览（统一 QuoteCard，standard） */}
      <View style={{ marginBottom: 14 }}>
        <QuoteCard
          symbol={{ code: symbol.code, name: symbol.name, market: symbol.market }}
          availability={availability}
          size="standard"
          onRetry={retry}
        />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
        <Button primary icon={Sparkles} busy={starting} onPress={() => void runResearch()}>
          {starting ? t("research.starting") : t("research.start")}
        </Button>
        <Button
          icon={MessageCircle}
          onPress={() => {
            close();
            ask(t("research.askPrompt", { code: symbol.code }));
          }}
        >
          {t("research.askAgent")}
        </Button>
        <Button
          small
          icon={Plus}
          hitSlop={6}
          onPress={() =>
            setForm({
              mode: "create",
              type: "PRICE_ABOVE",
              threshold: "",
              interval: "15",
              enabled: true,
            })
          }
        >
          {t("research.addAlert")}
        </Button>
        {!!watchlist?.id && (
          <Button
            small
            danger
            icon={Trash2}
            hitSlop={6}
            onPress={() => {
              removeSymbol(api, watchlist.id, symbol.code);
              notify(t("research.removedFromList", { name: watchlist.name }));
              close();
            }}
          >
            {t("research.removeFromList", { name: watchlist.name })}
          </Button>
        )}
      </View>

      {!!researchError && <ErrorNotice error={t("research.startFailed")} />}
      {failed && <ErrorNotice error={t("research.taskFailed")} />}

      {(running || (task && task.status === "succeeded" && !report)) && task && (
        <Card style={{ marginTop: 14 }}>
          <SectionHeading title={t("research.progressTitle")} />
          <ResearchProgress task={task} events={events} />
        </Card>
      )}

      {/* 价格提醒 */}
      <SectionLabel>{t("research.alertsSection")}</SectionLabel>
      {alertsError ? (
        <View style={{ gap: 8 }}>
          <ErrorNotice error={t("research.alertsError")} />
          <Button small icon={RefreshCw} hitSlop={6} onPress={() => void loadAlerts()}>
            {t("research.alertsRetry")}
          </Button>
        </View>
      ) : alerts === undefined ? (
        <ActivityIndicator color={colors.primary} />
      ) : alerts.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              busy={alertBusyId === alert.id}
              confirming={confirmDeleteId === alert.id}
              onToggle={(enabled) => void toggleAlert(alert, enabled)}
              onCheck={() => void checkAlert(alert)}
              onRequestDelete={() => setConfirmDeleteId(alert.id)}
              onConfirmDelete={() => {
                setConfirmDeleteId(undefined);
                void removeAlert(alert);
              }}
              onCancelDelete={() => setConfirmDeleteId(undefined)}
              onEdit={() =>
                setForm({
                  mode: "edit",
                  id: alert.id,
                  type: alert.threshold_type,
                  threshold: String(alert.threshold_value),
                  interval: String(alert.interval_minutes),
                  enabled: alert.enabled,
                })
              }
            />
          ))}
        </Card>
      ) : (
        <Text style={s.muted}>{t("research.noAlerts")}</Text>
      )}

      {form && (
        <Card style={{ marginTop: 12, gap: 12 }}>
          <Text style={s.heading}>
            {t(form.mode === "edit" ? "research.editAlert" : "research.addAlert")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ALERT_TYPES.map((option) => {
              const selected = form.type === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setForm({ ...form, type: option.id })}
                  style={{
                    paddingHorizontal: 12,
                    minHeight: 34,
                    justifyContent: "center",
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.line,
                    backgroundColor: selected ? colors.sky : colors.paper,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: selected ? colors.primary : colors.muted,
                    }}
                  >
                    {t(option.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                {t("research.thresholdLabel")}
              </Text>
              <TextInput
                value={form.threshold}
                onChangeText={(text) => setForm({ ...form, threshold: text })}
                keyboardType="decimal-pad"
                placeholder={form.type === "CHANGE_PCT" ? "5" : "200"}
                placeholderTextColor={colors.faint}
                accessibilityLabel={t("research.thresholdLabel")}
                style={s.input}
              />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                {t("research.intervalLabel")}
              </Text>
              <TextInput
                value={form.interval}
                onChangeText={(text) => setForm({ ...form, interval: text })}
                keyboardType="number-pad"
                placeholder="15"
                placeholderTextColor={colors.faint}
                accessibilityLabel={t("research.intervalLabel")}
                style={s.input}
              />
            </View>
          </View>
          <View style={[s.between, { minHeight: 40 }]}>
            <Text style={[s.text, { fontSize: 14 }]}>{t("research.enabled")}</Text>
            <Toggle
              value={form.enabled}
              onValueChange={(enabled) => setForm({ ...form, enabled })}
              label={t("research.enabled")}
            />
          </View>
          <View style={[s.row, { gap: 10 }]}>
            <Button primary busy={formBusy} onPress={() => void submitForm()}>
              {t("research.save")}
            </Button>
            <Button onPress={() => setForm(null)}>{t("research.cancel")}</Button>
          </View>
        </Card>
      )}

      {/* 投资笔记（位于价格提醒之后、新闻之前） */}
      <SymbolNotesSection
        api={api}
        symbolCode={symbol.code}
        onOpenTheses={() => {
          setNotesIntent({ tab: "theses", symbol: symbol.code });
          close();
          navigate("notes");
        }}
      />
      {/* 财报解析（固定「对比上一期、未接一致预期」横幅） */}
      <FinancialsSection api={api} symbolCode={symbol.code} />

      {/* 近期新闻（来自最新研报） */}
      <SectionLabel>{t("research.newsSection")}</SectionLabel>
      {report?.news.length ? (
        report.news.slice(0, 5).map((item) => (
          <Pressable
            key={`detail-news-${item.url}`}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(item.url)}
            style={({ pressed }) => [
              { paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.line, gap: 2 },
              pressed && { backgroundColor: colors.overlay1 },
            ]}
          >
            <Text style={[s.text, { fontSize: 13, color: colors.primaryStrong }]} numberOfLines={2}>
              {item.title}
            </Text>
            {!!item.publishedAt && <Text style={s.small}>{item.publishedAt}</Text>}
          </Pressable>
        ))
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={s.muted}>{t("research.newsEmpty")}</Text>
          <Button
            small
            icon={Sparkles}
            busy={starting}
            hitSlop={6}
            onPress={() => void runResearch()}
          >
            {t("research.runResearch")}
          </Button>
        </View>
      )}

      {/* 公告占位 */}
      <SectionLabel>{t("research.filingsSection")}</SectionLabel>
      <Text style={s.muted}>{t("research.filingsEmpty")}</Text>

      {/* 研报（F4）：放在 F3 内容之后，避免长表把提醒/新闻挤到折叠线下 */}
      {report && (
        <Card style={{ marginTop: 14 }}>
          <SectionHeading title={t("research.reportTitle")} />
          <ReportView
            report={report}
            onExport={() => void exportReport()}
            onFollowUp={() => {
              close();
              ask(t("research.followUpPrompt", { code: symbol.code }));
            }}
            onRerun={() => void runResearch()}
            rerunBusy={starting}
          />
        </Card>
      )}

      {!!reportError && !report && <ErrorNotice error={t("research.loadFailed")} />}

      <DisclaimerNote />
    </Sheet>
  );
}
