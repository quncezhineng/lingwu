/**
 * CSV 导入向导（P1-F1，四步）。
 *
 * Step 1 选择文件 → Step 2 字段映射 → Step 3 预览校验 → Step 4 完成。
 * 客户端负责解析/映射/逐行校验与「现有 → 导入后」投影；提交仍由后端二次校验
 * （mock 模式本地合并）。部分成功必须二次确认。
 */
import { useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import type { LingWuApi } from "./api";
import { CsvDropzone } from "./CsvDropzone";
import {
  autoMap,
  type CsvTable,
  fieldSynonymHint,
  type ImportPreview,
  PORTFOLIO_FIELDS,
  type PortfolioField,
  parseCsv,
  projectedQuantities,
  REQUIRED_FIELDS,
  templateCsv,
  toCanonicalCsv,
  toErrorCsv,
  validateRows,
} from "./csv";
import { type PickedCsv, saveTextFile } from "./csv-file";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import { AlertTriangle, Check, CircleX } from "./icons";
import {
  type Currency,
  commitMockImport,
  type Portfolio,
  type PortfolioSource,
  projectedHoldingQuantities,
} from "./portfolio";
import { Button, colors, ErrorNotice, Sheet, s } from "./ui";

const FIELD_LABEL: Record<PortfolioField, TranslationKey> = {
  symbol: "portfolio.fieldSymbol",
  name: "portfolio.fieldName",
  quantity: "portfolio.fieldQuantity",
  avg_cost: "portfolio.fieldAvgCost",
  buy_date: "portfolio.fieldBuyDate",
  currency: "portfolio.fieldCurrency",
  sector: "portfolio.fieldSector",
  market: "portfolio.fieldMarket",
};

const STEPS: Array<{ id: number; key: TranslationKey }> = [
  { id: 1, key: "portfolio.stepFile" },
  { id: 2, key: "portfolio.stepMapping" },
  { id: 3, key: "portfolio.stepPreview" },
  { id: 4, key: "portfolio.stepDone" },
];

type Mapping = Partial<Record<PortfolioField, number>>;

function StepIndicator({ current }: { current: number }) {
  const { t } = useTranslation();
  return (
    <View style={[s.row, { gap: 6, marginBottom: 18, flexWrap: "wrap" }]}>
      {STEPS.map((step, index) => {
        const done = current > step.id;
        const active = current === step.id;
        return (
          <View key={step.id} style={[s.row, { gap: 6 }]}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: done ? colors.primary : active ? colors.sky : colors.surface,
                borderWidth: active ? 1 : 0,
                borderColor: colors.primary,
              }}
            >
              {done ? (
                <Check size={12} strokeWidth={2} color={colors.onPrimary} />
              ) : (
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: active ? colors.primary : colors.faint,
                  }}
                >
                  {step.id}
                </Text>
              )}
            </View>
            <Text
              style={[
                s.small,
                { fontWeight: active ? "600" : "400", color: active ? colors.text : colors.muted },
              ]}
            >
              {t(step.key)}
            </Text>
            {index < STEPS.length - 1 && (
              <View
                style={{
                  width: 18,
                  height: 1,
                  backgroundColor: current > step.id ? colors.primary : colors.line,
                }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function ConfirmModal({
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
          style={[s.card, { maxWidth: 380, width: "100%", padding: 22, gap: 10 }]}
        >
          <Text style={s.heading}>{title}</Text>
          <Text style={s.muted}>{detail}</Text>
          <View style={[s.row, { gap: 10, marginTop: 8 }]}>
            <Button style={{ flex: 1, minHeight: 44 }} onPress={onCancel}>
              {cancelLabel}
            </Button>
            <Button primary style={{ flex: 1, minHeight: 44 }} onPress={onConfirm}>
              {confirmLabel}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ColumnPicker({
  title,
  headers,
  selected,
  onSelect,
  onClose,
}: {
  title: string;
  headers: string[];
  selected?: number;
  onSelect: (index: number | undefined) => void;
  onClose: () => void;
}) {
  const keys = headers.map((header, index) => {
    const occurrence = headers.slice(0, index).filter((item) => item === header).length;
    return `${header || "col"}#${occurrence}`;
  });
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable onPress={onClose} style={s.modalShade}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[s.card, { maxWidth: 420, width: "100%", padding: 0, overflow: "hidden" }]}
        >
          <Text style={[s.heading, { padding: 16 }]}>{title}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onSelect(undefined);
              onClose();
            }}
            style={{
              minHeight: 48,
              justifyContent: "center",
              paddingHorizontal: 16,
              borderTopWidth: 1,
              borderTopColor: colors.line,
            }}
          >
            <Text style={[s.muted, { color: colors.faint }]}>—</Text>
          </Pressable>
          {headers.map((header, index) => (
            <Pressable
              key={keys[index] ?? header}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === index }}
              onPress={() => {
                onSelect(index);
                onClose();
              }}
              style={{
                minHeight: 48,
                justifyContent: "center",
                paddingHorizontal: 16,
                borderTopWidth: 1,
                borderTopColor: colors.line,
                backgroundColor: selected === index ? colors.sky : colors.canvas,
              }}
            >
              <Text style={s.text}>{header || `#${index + 1}`}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function errorReason(t: (key: TranslationKey) => string, issue: { field: string; reason: string }) {
  void t;
  return `${issue.field} · ${issue.reason}`;
}

export function ImportWizard({
  api,
  source,
  portfolio,
  onClose,
  onImported,
}: {
  api: LingWuApi;
  source: PortfolioSource;
  portfolio: Portfolio;
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<PickedCsv>();
  const [table, setTable] = useState<CsvTable>();
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<ImportPreview>();
  const [pickerField, setPickerField] = useState<PortfolioField>();
  const [expandedRow, setExpandedRow] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [result, setResult] = useState<{
    /** 后端 rows_accepted（合法行数）；0 表示全部失败。 */
    accepted: number;
    imported: number;
    merged: number;
    skipped: number;
    duplicateImport: boolean;
  }>();

  const mappingValues = useMemo(
    () => Object.values(mapping).filter((v) => v !== undefined),
    [mapping],
  );
  const duplicateColumn = mappingValues.length !== new Set(mappingValues).size;
  const duplicateField = PORTFOLIO_FIELDS.find(
    (field) =>
      mapping[field] !== undefined &&
      mappingValues.filter((value) => value === mapping[field]).length > 1,
  );
  const missingRequired = REQUIRED_FIELDS.filter((field) => mapping[field] === undefined);
  const canMap = !duplicateColumn && missingRequired.length === 0;

  const validRows = preview?.rows.filter((row) => row.status !== "error") ?? [];
  const errorRows = preview?.rows.filter((row) => row.status === "error") ?? [];
  const projected = useMemo(() => {
    if (!preview) return [];
    const totals = projectedQuantities(preview.rows);
    return projectedHoldingQuantities(totals);
  }, [preview]);
  const willAccumulate = projected.some((row) => row.current > 0);

  function reset() {
    setStep(1);
    setFile(undefined);
    setTable(undefined);
    setMapping({});
    setPreview(undefined);
    setError("");
    setResult(undefined);
    setExpandedRow(undefined);
  }

  function handleFile(picked: PickedCsv) {
    setError("");
    if (!/\.csv$/i.test(picked.name)) {
      setError(t("portfolio.csvOnly"));
      return;
    }
    if (picked.text.length > 5 * 1024 * 1024) {
      setError(t("portfolio.tooLarge"));
      return;
    }
    try {
      const parsed = parseCsv(picked.text);
      if (!parsed.headers.length) {
        setError(t("portfolio.parseError"));
        return;
      }
      setFile(picked);
      setTable(parsed);
      setMapping(autoMap(parsed.headers));
      setStep(2);
    } catch {
      setError(t("portfolio.parseError"));
    }
  }

  function goPreview() {
    if (!table) return;
    setPreview(validateRows(table, mapping));
    setStep(3);
  }

  async function submit() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const csv = toCanonicalCsv(preview.rows);
      if (source === "api") {
        const payload = await api.request<unknown>("/api/portfolios/import", {
          csv,
          portfolio_id: portfolio.id,
        });
        const record =
          payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        const imported =
          typeof record.imported_count === "number" ? record.imported_count : validRows.length;
        const merged =
          typeof record.merged_count === "number" ? record.merged_count : preview.summary.merged;
        const skipped = Array.isArray(record.errors) ? record.errors.length : errorRows.length;
        const accepted =
          typeof record.rows_accepted === "number" ? record.rows_accepted : imported + merged;
        setResult({
          accepted,
          imported,
          merged,
          skipped,
          duplicateImport: record.duplicate_import === true,
        });
        onImported();
      } else {
        const rows = validRows.map((row) => ({
          symbol: (row.values.symbol ?? "").toUpperCase(),
          quantity: Number(row.values.quantity),
          avgCost: Number(row.values.avg_cost),
          currency: (row.values.currency || "USD") as Currency,
          name: row.values.name,
          sector: row.values.sector,
          buyDate: row.values.buy_date,
        }));
        commitMockImport(portfolio.id, rows);
        setResult({
          accepted: validRows.length,
          imported: validRows.length,
          merged: preview.summary.merged,
          skipped: errorRows.length,
          duplicateImport: false,
        });
        onImported();
      }
      setStep(4);
    } catch {
      setError(t("portfolio.importFailedDetail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={t("portfolio.importTitle")}
      onClose={() => {
        if (step > 1 && step < 4) setConfirmDiscard(true);
        else onClose();
      }}
      fullscreen
    >
      <StepIndicator current={step} />
      <Text style={[s.muted, { marginBottom: 14 }]}>
        {t("portfolio.importTarget", { name: portfolio.name })}
      </Text>

      {step === 1 && (
        <View style={{ gap: 12 }}>
          <CsvDropzone
            onPick={handleFile}
            title={t("portfolio.dropTitle")}
            hint={t("portfolio.dropHint")}
            busy={busy}
          />
          <Text style={s.small}>{t("portfolio.fileHint")}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void saveTextFile("lingwu-holdings-template.csv", templateCsv())}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={[s.small, { color: colors.primary, fontWeight: "600" }]}>
              {t("portfolio.template")}
            </Text>
          </Pressable>
          <Text style={s.small}>{t("portfolio.templateColumns")}</Text>
          <ErrorNotice error={error} />
          {!!file && (
            <Text style={s.muted}>
              {file.name} · {table?.rows.length ?? 0} rows
            </Text>
          )}
        </View>
      )}

      {step === 2 && table && (
        <View style={{ gap: 4 }}>
          <Text style={[s.muted, { marginBottom: 10 }]}>{t("portfolio.mappingHint")}</Text>
          {PORTFOLIO_FIELDS.map((field) => {
            const required = REQUIRED_FIELDS.includes(field);
            const column = mapping[field];
            const duplicate =
              column !== undefined && mappingValues.filter((value) => value === column).length > 1;
            return (
              <View
                key={field}
                style={[
                  s.between,
                  { minHeight: 56, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.text}>
                    {t(FIELD_LABEL[field])}
                    {required ? " *" : ""}
                  </Text>
                  <Text style={s.small}>{fieldSynonymHint(field)}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t(FIELD_LABEL[field])}${required ? " *" : ""}`}
                  onPress={() => setPickerField(field)}
                  style={{
                    minHeight: 44,
                    minWidth: 180,
                    justifyContent: "center",
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor:
                      required && column === undefined
                        ? colors.danger
                        : duplicate
                          ? colors.danger
                          : colors.line,
                  }}
                >
                  <Text
                    style={[s.text, { color: column === undefined ? colors.faint : colors.text }]}
                  >
                    {column === undefined ? "—" : table.headers[column] || `#${column + 1}`}
                  </Text>
                </Pressable>
              </View>
            );
          })}
          {missingRequired.length > 0 && (
            <Text
              accessibilityRole="alert"
              style={[s.small, { color: colors.danger, marginTop: 8 }]}
            >
              {t("portfolio.requiredUnmapped")}
            </Text>
          )}
          {duplicateColumn && (
            <Text
              accessibilityRole="alert"
              style={[s.small, { color: colors.danger, marginTop: 8 }]}
            >
              {t("portfolio.duplicateMapping", {
                field: duplicateField ? t(FIELD_LABEL[duplicateField]) : "—",
              })}
            </Text>
          )}
          <Text style={[s.small, { marginTop: 10 }]}>{t("portfolio.currencyHint")}</Text>
          <Text style={s.small}>{t("portfolio.buyDateHint")}</Text>
          <View style={{ marginTop: 12 }}>
            <Text style={[s.small, { fontWeight: "600", color: colors.text, marginBottom: 6 }]}>
              {t("portfolio.previewRows")}
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {table.rows.slice(0, 3).map((cells, index) => (
                <View
                  key={cells.join("|") || `row-${index}`}
                  style={[
                    s.row,
                    {
                      minHeight: 36,
                      paddingHorizontal: 10,
                      gap: 8,
                      borderTopWidth: index ? 1 : 0,
                      borderTopColor: colors.line,
                      backgroundColor: colors.surface,
                    },
                  ]}
                >
                  {cells.slice(0, 4).map((cell, cellIndex) => (
                    <Text
                      key={table.headers[cellIndex] ?? cell ?? "col"}
                      style={[s.small, s.metric, { flex: 1, color: colors.text }]}
                      numberOfLines={1}
                    >
                      {cell || "—"}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </View>
          <View style={[s.row, { gap: 10, marginTop: 16 }]}>
            <Button style={{ minHeight: 44 }} onPress={() => setStep(1)}>
              {t("portfolio.back")}
            </Button>
            <Button primary disabled={!canMap} style={{ minHeight: 44 }} onPress={goPreview}>
              {t("portfolio.stepPreview")}
            </Button>
          </View>
        </View>
      )}

      {step === 3 && preview && (
        <View style={{ gap: 10 }}>
          <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
            <View style={[s.chip, { backgroundColor: colors.surface }]}>
              <Text style={s.chipText}>
                {t("portfolio.previewValid", { count: preview.summary.valid })}
              </Text>
            </View>
            <View style={[s.chip, { backgroundColor: colors.alertVolumeSurface }]}>
              <Text style={[s.chipText, { color: colors.alertVolumeText }]}>
                {t("portfolio.previewWarning", { count: preview.summary.warning })}
              </Text>
            </View>
            <View style={[s.chip, { backgroundColor: colors.errorSoft }]}>
              <Text style={[s.chipText, { color: colors.danger }]}>
                {t("portfolio.previewError", { count: preview.summary.error })}
              </Text>
            </View>
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
                { minHeight: 36, paddingHorizontal: 10, backgroundColor: colors.surface },
              ]}
            >
              <Text style={[s.small, { width: 54 }]}>{t("portfolio.rowLabel", { row: "" })}</Text>
              <Text style={[s.small, { width: 92 }]}>{t("portfolio.fieldSymbol")}</Text>
              <Text style={[s.small, { flex: 1 }]}>{t("portfolio.fieldQuantity")}</Text>
              <Text style={[s.small, { flex: 1 }]}>{t("portfolio.fieldAvgCost")}</Text>
              <Text style={[s.small, { width: 64 }]}>{t("portfolio.fieldCurrency")}</Text>
            </View>
            {preview.rows.map((row) => {
              const isError = row.status === "error";
              const isWarning = row.status === "warning";
              return (
                <View key={row.line}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: expandedRow === row.line }}
                    onPress={() =>
                      setExpandedRow((current) => (current === row.line ? undefined : row.line))
                    }
                    style={{
                      minHeight: 44,
                      paddingHorizontal: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      borderTopWidth: 1,
                      borderTopColor: colors.line,
                      backgroundColor: isError ? colors.errorSoft : colors.canvas,
                    }}
                  >
                    {isWarning && (
                      <View
                        style={{
                          width: 3,
                          alignSelf: "stretch",
                          backgroundColor: colors.alertVolume,
                          marginRight: 8,
                        }}
                      />
                    )}
                    <View style={{ width: 46, flexDirection: "row", alignItems: "center", gap: 4 }}>
                      {isError ? (
                        <CircleX size={12} strokeWidth={2} color={colors.danger} />
                      ) : isWarning ? (
                        <AlertTriangle size={12} strokeWidth={2} color={colors.alertVolume} />
                      ) : (
                        <Check size={12} strokeWidth={2} color={colors.success} />
                      )}
                      <Text style={[s.small, isError && { color: colors.danger }]}>{row.line}</Text>
                    </View>
                    <Text
                      style={[
                        s.small,
                        { width: 88, fontWeight: "600" },
                        isError && { color: colors.danger },
                      ]}
                      numberOfLines={1}
                    >
                      {row.values.symbol || "—"}
                    </Text>
                    <Text style={[s.small, { flex: 1 }, isError && { color: colors.danger }]}>
                      {row.values.quantity || "—"}
                    </Text>
                    <Text style={[s.small, { flex: 1 }, isError && { color: colors.danger }]}>
                      {row.values.avg_cost || "—"}
                    </Text>
                    <Text style={[s.small, { width: 64 }, isError && { color: colors.danger }]}>
                      {row.values.currency || "—"}
                    </Text>
                  </Pressable>
                  {expandedRow === row.line && (
                    <View
                      style={{
                        paddingHorizontal: 12,
                        paddingBottom: 10,
                        backgroundColor: isError ? colors.errorSoft : colors.surface,
                      }}
                    >
                      {row.issues.length ? (
                        row.issues.map((issue) => (
                          <Text
                            key={`${issue.field}-${issue.reason}`}
                            style={[s.small, { color: isError ? colors.danger : colors.muted }]}
                          >
                            {errorReason(t, issue)}
                          </Text>
                        ))
                      ) : (
                        <Text style={s.small}>{t("portfolio.previewValid", { count: 1 })}</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {preview.summary.merged > 0 && (
            <Text style={[s.small, { color: colors.alertVolumeText }]}>
              {t("portfolio.mergedRowsGeneric", { count: preview.summary.merged })}
            </Text>
          )}

          {willAccumulate && (
            <View style={{ gap: 4 }}>
              <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                {t("portfolio.projectedTitle")}
              </Text>
              {projected.slice(0, 6).map((row) => (
                <Text key={row.symbol} style={s.small}>
                  {t("portfolio.projectedRow", {
                    symbol: row.symbol,
                    current: row.current,
                    next: row.next,
                  })}
                </Text>
              ))}
            </View>
          )}

          {errorRows.length > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                void saveTextFile("lingwu-import-errors.csv", toErrorCsv(preview.rows))
              }
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={[s.small, { color: colors.primary, fontWeight: "600" }]}>
                {t("portfolio.downloadErrors")}
              </Text>
            </Pressable>
          )}

          <ErrorNotice error={error} />
          <View style={[s.row, { gap: 10, flexWrap: "wrap", marginTop: 6 }]}>
            <Button style={{ minHeight: 44 }} onPress={() => setStep(2)}>
              {t("portfolio.back")}
            </Button>
            {errorRows.length > 0 ? (
              <Button
                primary
                busy={busy}
                style={{ minHeight: 44 }}
                onPress={() => setConfirmSkip(true)}
              >
                {t("portfolio.skipErrors", { count: errorRows.length, valid: validRows.length })}
              </Button>
            ) : (
              <Button
                primary
                busy={busy}
                style={{ minHeight: 44 }}
                onPress={() => (willAccumulate ? setConfirmMerge(true) : void submit())}
              >
                {t("portfolio.importCount", { count: validRows.length })}
              </Button>
            )}
          </View>
        </View>
      )}

      {step === 4 && result && (
        <View style={{ gap: 12, alignItems: "center", paddingTop: 12 }}>
          <View
            style={[
              s.iconBox,
              {
                width: 55,
                height: 55,
                borderRadius: 14,
                backgroundColor: result.accepted > 0 ? colors.green : colors.errorSoft,
              },
            ]}
          >
            {result.accepted > 0 ? (
              <Check size={26} strokeWidth={2} color={colors.success} />
            ) : (
              <CircleX size={26} strokeWidth={2} color={colors.danger} />
            )}
          </View>
          <Text style={s.heading}>
            {result.accepted > 0 ? t("portfolio.importSuccessTitle") : t("portfolio.importFailed")}
          </Text>
          <Text style={[s.muted, { textAlign: "center" }]}>
            {result.accepted > 0
              ? t("portfolio.importSuccessDetail", { count: result.accepted, name: portfolio.name })
              : t("portfolio.importFailedDetail")}
          </Text>
          {result.accepted > 0 && (result.merged > 0 || result.skipped > 0) && (
            <Text style={s.small}>
              {t("portfolio.importPartialDetail", {
                merged: result.merged,
                skipped: result.skipped,
              })}
            </Text>
          )}
          {result.duplicateImport && (
            <Text style={[s.small, { color: colors.alertVolumeText }]}>
              {t("portfolio.duplicateImport")}
            </Text>
          )}
          <View
            style={[s.row, { gap: 10, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }]}
          >
            <Button primary style={{ minHeight: 44 }} onPress={onClose}>
              {t("portfolio.viewPortfolio")}
            </Button>
            <Button style={{ minHeight: 44 }} onPress={reset}>
              {t("portfolio.continueImport")}
            </Button>
            {result.skipped > 0 && preview && (
              <Button
                style={{ minHeight: 44 }}
                onPress={() =>
                  void saveTextFile("lingwu-import-errors.csv", toErrorCsv(preview.rows))
                }
              >
                {t("portfolio.downloadErrors")}
              </Button>
            )}
          </View>
        </View>
      )}

      {pickerField !== undefined && table && (
        <ColumnPicker
          title={t(FIELD_LABEL[pickerField])}
          headers={table.headers}
          selected={mapping[pickerField]}
          onSelect={(index) =>
            setMapping((current) => {
              const next = { ...current };
              if (index === undefined) delete next[pickerField];
              else next[pickerField] = index;
              return next;
            })
          }
          onClose={() => setPickerField(undefined)}
        />
      )}

      {confirmSkip && preview && (
        <ConfirmModal
          title={t("portfolio.stepPreview")}
          detail={t("portfolio.skipConfirm", { count: errorRows.length, valid: validRows.length })}
          cancelLabel={t("portfolio.holdingCancel")}
          confirmLabel={t("portfolio.importCount", { count: validRows.length })}
          onCancel={() => setConfirmSkip(false)}
          onConfirm={() => {
            setConfirmSkip(false);
            void submit();
          }}
        />
      )}
      {confirmMerge && (
        <ConfirmModal
          title={t("portfolio.confirmMergeTitle")}
          detail={t("portfolio.confirmMergeDetail")}
          cancelLabel={t("portfolio.holdingCancel")}
          confirmLabel={t("portfolio.importCount", { count: validRows.length })}
          onCancel={() => setConfirmMerge(false)}
          onConfirm={() => {
            setConfirmMerge(false);
            void submit();
          }}
        />
      )}
      {confirmDiscard && (
        <ConfirmModal
          title={t("portfolio.discardTitle")}
          detail={t("portfolio.discardDetail")}
          cancelLabel={t("portfolio.discardContinue")}
          confirmLabel={t("portfolio.discardConfirm")}
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={onClose}
        />
      )}
    </Sheet>
  );
}
