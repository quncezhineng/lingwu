/**
 * 财报解析展示（P1-4 Part B）：
 * - 固定横幅「对比对象为上一期（YoY），未接入市场一致预期」在所有状态可见；
 * - 5 指标 × 本期/上期/同比；缺失字段表格内 — 并在表格下固定列出；
 * - comparison_source=none 提示「未找到上一期」；
 * - 支持粘贴文本解析；PDF 解析在服务端缺 pdftotext 时给出明确文案。
 */
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Text, TextInput, View } from "react-native";
import type { LingWuApi } from "./api";
import {
  type FinancialMetric,
  type FinancialReport,
  fetchLatestFinancials,
  isPdfUnsupported,
  METRIC_KEYS,
  type MetricKey,
  parseFinancials,
} from "./financials";
import { type TranslationFn, useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import { FileText, RefreshCw, Upload } from "./icons";
import { Button, Card, Chip, colors, DisclaimerNote, ErrorNotice, s } from "./ui";

const METRIC_LABEL: Record<MetricKey, TranslationKey> = {
  revenue: "financials.revenue",
  net_profit: "financials.netProfit",
  eps: "financials.eps",
  gross_margin: "financials.grossMargin",
  operating_cash_flow: "financials.operatingCashFlow",
};

const STATUS_LABEL: Record<FinancialReport["parseStatus"], TranslationKey> = {
  complete: "financials.statusComplete",
  partial: "financials.statusPartial",
  failed: "financials.statusFailed",
};

function currencyPrefix(unit: FinancialMetric["unit"]) {
  if (unit === "CNY") return "¥";
  if (unit === "USD") return "$";
  if (unit === "HKD") return "HK$";
  return "";
}

function formatMetric(value: number | null, unit: FinancialMetric["unit"]) {
  if (value === null) return "—";
  if (unit === "percent") return `${value.toFixed(2)}%`;
  const digits = unit === "per_share" ? 2 : Math.abs(value) >= 1000 ? 0 : 2;
  return `${currencyPrefix(unit)}${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)}`;
}

function formatDelta(metric: FinancialMetric, t: TranslationFn) {
  if (metric.changePp !== undefined && metric.changePp !== null) {
    const sign = metric.changePp > 0 ? "+" : "";
    return `${sign}${metric.changePp.toFixed(1)}pp`;
  }
  if (metric.yoy === null) return t("financials.yoy");
  const sign = metric.yoy > 0 ? "+" : "";
  return `${sign}${metric.yoy.toFixed(1)}%`;
}

export function FinancialsSection({ api, symbolCode }: { api: LingWuApi; symbolCode: string }) {
  const { t } = useTranslation();
  const [report, setReport] = useState<FinancialReport>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const latest = await fetchLatestFinancials(api, symbolCode);
      setReport(latest);
      setEditorOpen(!latest);
    } catch {
      setError(t("financials.parseFailed"));
      setEditorOpen(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api, symbolCode]);

  async function submit(input: { text?: string; pdfBase64?: string; sourceFile?: string }) {
    setParsing(true);
    setParseError("");
    try {
      const parsed = await parseFinancials(api, { symbolCode, ...input });
      setReport(parsed);
      setText("");
      setEditorOpen(false);
    } catch (reason) {
      setParseError(
        isPdfUnsupported(reason) && input.pdfBase64
          ? t("financials.pdfUnsupported")
          : t("financials.parseFailed"),
      );
    } finally {
      setParsing(false);
    }
  }

  async function pickPdf() {
    setParseError("");
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];
      if (!asset) return;
      const base64 =
        (asset as { base64?: string }).base64 ??
        (Platform.OS === "web"
          ? undefined
          : await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.Base64,
            }));
      if (!base64) {
        setParseError(t("financials.pdfUnsupported"));
        return;
      }
      await submit({ pdfBase64: base64, sourceFile: asset.name });
    } catch {
      setParseError(t("financials.pdfUnsupported"));
    }
  }

  const rows = report ? METRIC_KEYS.map((key) => ({ key, metric: report.metrics[key] })) : [];
  const missing = rows.filter((row) => row.metric.current === null).map((row) => row.key);

  return (
    <View style={{ marginTop: 18, gap: 8 }}>
      <View style={[s.between, { gap: 8, flexWrap: "wrap" }]}>
        <Text style={[s.label, { color: colors.faint }]}>{t("financials.title")}</Text>
        {!!report && (
          <Button
            small
            icon={RefreshCw}
            hitSlop={6}
            style={{ minHeight: 44 }}
            onPress={() => setEditorOpen((current) => !current)}
          >
            {editorOpen ? t("financials.collapse") : t("financials.update")}
          </Button>
        )}
      </View>

      {/* 固定横幅：所有状态可见 */}
      <View
        style={[s.row, { gap: 6, padding: 10, borderRadius: 10, backgroundColor: colors.surface }]}
      >
        <Text style={{ flex: 1, fontSize: 11, color: colors.muted }}>{t("financials.banner")}</Text>
      </View>

      {loading ? (
        <View style={[s.row, { gap: 8, paddingVertical: 12 }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={s.muted}>{t("financials.parsing")}</Text>
        </View>
      ) : report ? (
        <Card style={{ padding: 12, gap: 8 }}>
          <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
            <Chip>{t(STATUS_LABEL[report.parseStatus])}</Chip>
            {report.comparisonSource === "none" && (
              <Text style={[s.small, { color: colors.alertVolumeText }]}>
                {t("financials.comparisonNone")}
              </Text>
            )}
            <View style={{ flex: 1 }} />
            <Text style={[s.small, { color: colors.faint }]}>
              {t("financials.parsedAt", {
                time: new Date(report.parsedAt).toLocaleString(),
              })}
            </Text>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <View
              style={[
                s.row,
                { minHeight: 34, paddingHorizontal: 10, backgroundColor: colors.surface },
              ]}
            >
              <Text style={[s.small, { flex: 1.4 }]}>{t("financials.metricColumn")}</Text>
              <Text style={[s.small, { flex: 1, textAlign: "right" }]}>
                {t("financials.current")}
              </Text>
              <Text style={[s.small, { flex: 1, textAlign: "right" }]}>
                {t("financials.previous")}
              </Text>
              <Text style={[s.small, { flex: 1, textAlign: "right" }]}>{t("financials.yoy")}</Text>
            </View>
            {rows.map((row, index) => (
              <View
                key={row.key}
                style={[
                  s.row,
                  {
                    minHeight: 40,
                    paddingHorizontal: 10,
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: colors.line,
                  },
                ]}
              >
                <Text style={[s.text, { flex: 1.4, fontSize: 12 }]} numberOfLines={1}>
                  {t(METRIC_LABEL[row.key])}
                </Text>
                <Text
                  style={[
                    s.metric,
                    s.small,
                    {
                      flex: 1,
                      textAlign: "right",
                      color: row.metric.current === null ? colors.faint : colors.text,
                    },
                  ]}
                >
                  {formatMetric(row.metric.current, row.metric.unit)}
                </Text>
                <Text
                  style={[
                    s.metric,
                    s.small,
                    {
                      flex: 1,
                      textAlign: "right",
                      color: row.metric.previous === null ? colors.faint : colors.muted,
                    },
                  ]}
                >
                  {formatMetric(row.metric.previous, row.metric.unit)}
                </Text>
                <Text
                  style={[s.metric, s.small, { flex: 1, textAlign: "right", color: colors.muted }]}
                >
                  {formatDelta(row.metric, t)}
                </Text>
              </View>
            ))}
          </View>

          {(report.unavailable.length > 0 || missing.length > 0) && (
            <Text style={[s.small, { color: colors.alertVolumeText }]}>
              {t("financials.unavailable")}:{" "}
              {[
                ...new Set([...report.unavailable, ...missing.map((key) => t(METRIC_LABEL[key]))]),
              ].join(", ")}
            </Text>
          )}

          {(report.sourceFile || report.sourceUrl) && (
            <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
              <Text style={s.small}>{t("financials.source")}:</Text>
              {report.sourceUrl ? (
                <Text
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(report.sourceUrl ?? "")}
                  style={[s.small, { color: colors.primary }]}
                  numberOfLines={1}
                >
                  {report.sourceUrl}
                </Text>
              ) : (
                <Text style={[s.small, { color: colors.muted }]} numberOfLines={1}>
                  {report.sourceFile}
                </Text>
              )}
            </View>
          )}
        </Card>
      ) : (
        <Text style={s.muted}>{t("financials.noReport")}</Text>
      )}

      {editorOpen && (
        <Card style={{ padding: 12, gap: 10 }}>
          <View style={[s.row, { gap: 8 }]}>
            <FileText size={15} strokeWidth={1.8} color={colors.primary} />
            <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
              {t("financials.pasteTitle")}
            </Text>
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder={t("financials.textPlaceholder")}
            placeholderTextColor={colors.faint}
            accessibilityLabel={t("financials.pasteTitle")}
            style={[s.input, { minHeight: 120, textAlignVertical: "top", paddingTop: 10 }]}
          />
          <ErrorNotice error={parseError || error} />
          <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
            <Button
              primary
              busy={parsing}
              disabled={!text.trim()}
              style={{ minHeight: 44 }}
              onPress={() => void submit({ text: text.trim(), sourceFile: "pasted-text" })}
            >
              {parsing ? t("financials.parsing") : t("financials.parseText")}
            </Button>
            <Button
              icon={Upload}
              busy={parsing}
              style={{ minHeight: 44 }}
              onPress={() => void pickPdf()}
            >
              {t("financials.uploadPdf")}
            </Button>
          </View>
        </Card>
      )}
      <DisclaimerNote />
    </View>
  );
}
