/**
 * P1-F1 组合页（PortfolioScreen）。
 *
 * 结构（对齐 UI-SPEC-P1-1）：
 * 工具条 → 组合切换 → [每个币种：概览卡 → 风险指标与基准 → 资产配置/行业集中度
 * → 前 5 重仓 → 持仓] → 页脚（更新时间 + 不构成投资建议）。
 *
 * 硬口径：不做汇率换算，按币种分组；无法估值的持仓显式排除并披露；
 * 样本不足显示「数据不足」而不是 0。
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, useWindowDimensions, View } from "react-native";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import { AlertTriangle, CircleDollarSign, MoreHorizontal, Plus, RefreshCw, Upload } from "./icons";
import { metaFor } from "./market";
import { directionOf, formatPercent, formatPrice } from "./market-format";
import {
  activePortfolio,
  addHolding,
  buildAllocationSlices,
  type Currency,
  type CurrencyGroup,
  createPortfolio,
  deleteHolding,
  deletePortfolio,
  type Holding,
  loadPortfolios,
  type PositionView,
  refreshSummary,
  renamePortfolio,
  selectPortfolio,
  updateHolding,
  usePortfolioState,
} from "./portfolio";
import { ReturnComparisonChart } from "./portfolio-chart";
import { HoldingFormSheet, PortfolioCreateSheet } from "./portfolio-forms";
import { ImportWizard } from "./portfolio-import";
import {
  Button,
  Card,
  Chip,
  colors,
  DisclaimerNote,
  Empty,
  ErrorNotice,
  IconButton,
  marketDirectionColor,
  SectionHeading,
  Sheet,
  s,
} from "./ui";
import { useWorkspace } from "./workspace";

const ALLOCATION_COLORS = [
  "#3A83F7",
  "#2FB3FF",
  "#3C7FB1",
  "#2A9D8F",
  "#C9922E",
  "#7B61A8",
  "#8A8F98",
];
const OTHER_COLOR = "#B0B6BF";

const BENCHMARKS: Record<Currency, Array<{ id: string; labelKey: TranslationKey }>> = {
  CNY: [
    { id: "000300.SS", labelKey: "portfolio.benchmarkCsi300" },
    { id: "000001.SS", labelKey: "portfolio.benchmarkSse" },
  ],
  USD: [
    { id: "^GSPC", labelKey: "portfolio.benchmarkSp500" },
    { id: "^NDX", labelKey: "portfolio.benchmarkNd100" },
  ],
  HKD: [{ id: "^HSI", labelKey: "portfolio.benchmarkHsi" }],
};

const DEFAULT_BENCHMARK: Record<Currency, string> = {
  CNY: "000300.SS",
  USD: "^GSPC",
  HKD: "^HSI",
};

const QUOTE_ERROR_KEYS: Record<string, TranslationKey> = {
  network: "portfolio.errorNetwork",
  timeout: "portfolio.errorTimeout",
  http: "portfolio.errorHttp",
  parse: "portfolio.errorParse",
  not_found: "portfolio.errorNotFound",
  unsupported: "portfolio.errorUnsupported",
  provider_error: "portfolio.errorProvider",
};

function formatMoney(value: number | undefined, currency: Currency) {
  return value === undefined ? "—" : formatPrice(value, currency);
}

function quoteErrorLabel(error: string | undefined, t: (key: TranslationKey) => string) {
  if (!error) return t("portfolio.quoteUnavailable");
  const key = QUOTE_ERROR_KEYS[error];
  return key ? t(key) : t("portfolio.quoteUnavailable");
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

function sortPositions(positions: PositionView[], sort: "marketValue" | "pnl" | "weight") {
  return [...positions].sort((a, b) => {
    const key = sort === "marketValue" ? "marketValue" : sort === "pnl" ? "pnl" : "weight";
    return (b[key] ?? Number.NEGATIVE_INFINITY) - (a[key] ?? Number.NEGATIVE_INFINITY);
  });
}

function SegmentedChips<T extends string>({
  items,
  selected,
  onSelect,
}: {
  items: Array<{ id: T; label: string; count?: number }>;
  selected: T;
  onSelect: (id: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map((item) => {
        const active = item.id === selected;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item.id)}
            style={{
              minHeight: 44,
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.line,
              backgroundColor: active ? colors.sky : colors.paper,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: active ? "600" : "500",
                color: active ? colors.primary : colors.text,
              }}
            >
              {item.label}
            </Text>
            {item.count !== undefined && (
              <Text style={{ fontSize: 11, color: active ? colors.primary : colors.faint }}>
                {item.count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function OverviewCard({ group, desktop }: { group: CurrencyGroup; desktop: boolean }) {
  const { t } = useTranslation();
  const pnlDirection = directionOf(group.pnl);
  return (
    <Card style={{ flex: desktop ? 1 : undefined, gap: 10 }}>
      <View style={[s.between]}>
        <View style={[s.row, { gap: 8 }]}>
          <Text style={[s.label, { color: colors.text, fontSize: 11, letterSpacing: 1.2 }]}>
            {group.currency}
          </Text>
          <Chip>{t("portfolio.notConverted")}</Chip>
        </View>
        <Text style={s.small}>{t("portfolio.holdingsCount", { count: group.totalCount })}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {[
          {
            label: t("portfolio.metricsMarketValue"),
            value: formatMoney(group.marketValue, group.currency),
          },
          { label: t("portfolio.metricsCost"), value: formatMoney(group.cost, group.currency) },
        ].map((metric) => (
          <View key={metric.label} style={{ flex: 1, minWidth: 120, gap: 2 }}>
            <Text style={s.small}>{metric.label}</Text>
            <Text style={[s.metric, { fontSize: 20, fontWeight: "600", color: colors.text }]}>
              {metric.value}
            </Text>
          </View>
        ))}
        <View style={{ flex: 1, minWidth: 120, gap: 2 }}>
          <Text style={s.small}>{t("portfolio.metricsPnl")}</Text>
          <Text
            style={[
              s.metric,
              { fontSize: 20, fontWeight: "600", color: marketDirectionColor(pnlDirection) },
            ]}
          >
            {formatMoney(group.pnl, group.currency)}
          </Text>
          <Text
            style={[
              s.metric,
              { fontSize: 12, fontWeight: "600", color: marketDirectionColor(pnlDirection) },
            ]}
          >
            {group.pnlPct === undefined ? "—" : formatPercent(group.pnlPct)}
          </Text>
        </View>
      </View>
      <Text
        style={[s.small, group.pricedCount < group.totalCount && { color: colors.alertVolumeText }]}
      >
        {t("portfolio.pricedCount", { priced: group.pricedCount, total: group.totalCount })}
        {group.pricedCount < group.totalCount ? t("portfolio.partialUnavailable") : ""}
      </Text>
      {group.unvaluedCount > 0 && (
        <Text style={[s.small, { color: colors.alertVolumeText }]}>
          {t("portfolio.unvaluedBlock", {
            count: group.unvaluedCount,
            cost: formatMoney(group.unvaluedCost, group.currency),
          })}
        </Text>
      )}
      {group.totalCount > 0 && group.pricedCount === 0 && (
        <Text style={s.small}>{t("portfolio.noPriced")}</Text>
      )}
    </Card>
  );
}

function RiskMetricTile({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: string;
}) {
  return (
    <Card style={{ flexGrow: 1, flexBasis: "22%", minWidth: 130, padding: 12, gap: 2 }}>
      <Text style={s.small}>{label}</Text>
      <Text style={[s.metric, { fontSize: 18, fontWeight: "600", color: color ?? colors.text }]}>
        {value}
      </Text>
      {!!hint && <Text style={[s.small, { color: colors.faint }]}>{hint}</Text>}
    </Card>
  );
}

function RiskSection({
  group,
  benchmark,
  onBenchmark,
  onExplain,
  onRetry,
  loading,
}: {
  group: CurrencyGroup;
  benchmark: string;
  onBenchmark: (id: string) => void;
  onExplain: () => void;
  onRetry: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const risk = group.risk;
  const insufficient = (risk?.samples ?? 0) > 0 && (risk?.samples ?? 0) < 120;
  const missingMetric = (metric: string) =>
    risk?.unavailable?.some((item) => item.metric === metric) ?? false;
  const metricHint = (metric: string) => {
    const issue = risk?.unavailable?.find((item) => item.metric === metric);
    if (!issue) return undefined;
    return issue.reason === "insufficient_history"
      ? t("portfolio.insufficientReason", { count: metric === "max_drawdown" ? 60 : 120 })
      : issue.reason;
  };
  const betaUnavailable = insufficient || risk?.beta === undefined || missingMetric("beta");
  const sharpeUnavailable = insufficient || risk?.sharpe === undefined || missingMetric("sharpe");
  const drawdownUnavailable = risk?.maxDrawdown === undefined || missingMetric("max_drawdown");
  const rangeReturn = risk?.cumulativeReturn ?? risk?.return1y;
  const returnUnavailable = rangeReturn === undefined;
  const pricedIncomplete = group.pricedCount < group.totalCount;
  const benchmarkItem = BENCHMARKS[group.currency].find((item) => item.id === benchmark);
  const benchmarkReturn = risk?.benchmarkReturn ?? risk?.benchmark?.return1y;
  const rangeReturnForCompare = risk?.cumulativeReturn ?? risk?.return1y;
  const excess =
    rangeReturnForCompare !== undefined && benchmarkReturn !== undefined
      ? rangeReturnForCompare - benchmarkReturn
      : undefined;
  const benchmarkMatches =
    risk?.benchmark?.symbol === benchmark || risk?.benchmarkSymbol === benchmark;

  return (
    <View style={{ gap: 10 }}>
      <View style={[s.between, { gap: 10, flexWrap: "wrap" }]}>
        <Text style={s.heading}>{t("portfolio.riskTitle", { currency: group.currency })}</Text>
        <View style={[s.row, { gap: 10 }]}>
          <Text style={s.small}>{t("portfolio.riskPeriod")}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onExplain}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={[s.small, { color: colors.primary, fontWeight: "600" }]}>
              {t("portfolio.riskExplain")}
            </Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          {[0, 1, 2, 3].map((index) => (
            <Card key={index} style={{ flexGrow: 1, flexBasis: "22%", minWidth: 130, padding: 12 }}>
              <View
                style={{
                  height: 10,
                  width: "50%",
                  borderRadius: 4,
                  backgroundColor: colors.tertiary,
                }}
              />
              <View
                style={{
                  height: 16,
                  width: "70%",
                  borderRadius: 4,
                  backgroundColor: colors.tertiary,
                  marginTop: 8,
                }}
              />
            </Card>
          ))}
        </View>
      ) : pricedIncomplete ? (
        <Card style={{ padding: 12 }}>
          <Text style={[s.small, { color: colors.alertVolumeText }]}>
            {t("portfolio.insufficientData")} ·{" "}
            {t("portfolio.pricedCount", { priced: group.pricedCount, total: group.totalCount })}
          </Text>
        </Card>
      ) : !risk ? (
        <Card style={{ padding: 12, gap: 8 }}>
          <Text style={s.small}>{t("portfolio.riskUnavailable")}</Text>
          <Button
            small
            icon={RefreshCw}
            hitSlop={6}
            onPress={onRetry}
            style={{ minHeight: 44, alignSelf: "flex-start" }}
          >
            {t("portfolio.retry")}
          </Button>
        </Card>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <RiskMetricTile
            label={t("portfolio.riskBeta")}
            value={betaUnavailable ? t("portfolio.insufficientData") : (risk.beta ?? 0).toFixed(2)}
            hint={betaUnavailable ? metricHint("beta") : undefined}
            color={betaUnavailable ? colors.faint : colors.text}
          />
          <RiskMetricTile
            label={t("portfolio.riskSharpe")}
            value={
              sharpeUnavailable ? t("portfolio.insufficientData") : (risk.sharpe ?? 0).toFixed(2)
            }
            hint={sharpeUnavailable ? metricHint("sharpe") : undefined}
            color={sharpeUnavailable ? colors.faint : colors.text}
          />
          <RiskMetricTile
            label={t("portfolio.riskMaxDD")}
            value={
              drawdownUnavailable
                ? t("portfolio.insufficientData")
                : `-${Math.abs(risk.maxDrawdown ?? 0).toFixed(1)}%`
            }
            color={drawdownUnavailable ? colors.faint : colors.marketDownText}
            hint={drawdownUnavailable ? metricHint("max_drawdown") : undefined}
          />
          <RiskMetricTile
            label={t("portfolio.riskReturn")}
            value={
              returnUnavailable ? t("portfolio.insufficientData") : formatPercent(rangeReturn ?? 0)
            }
            color={
              returnUnavailable ? colors.faint : marketDirectionColor(directionOf(rangeReturn ?? 0))
            }
          />
        </View>
      )}

      {!insufficient && !pricedIncomplete && !!risk && (
        <View style={{ gap: 8 }}>
          <View style={[s.row, { gap: 8, flexWrap: "wrap", alignItems: "center" }]}>
            <Text style={s.small}>{t("portfolio.benchmark")}</Text>
            <SegmentedChips
              items={BENCHMARKS[group.currency].map((item) => ({
                id: item.id,
                label: t(item.labelKey),
              }))}
              selected={benchmark}
              onSelect={onBenchmark}
            />
          </View>
          {benchmarkMatches &&
          rangeReturnForCompare !== undefined &&
          benchmarkReturn !== undefined ? (
            <Text style={s.small}>
              {t("portfolio.benchmarkCompare", {
                portfolio: formatPercent(rangeReturnForCompare),
                benchmark: formatPercent(benchmarkReturn),
                excess: `${(risk?.excessReturn ?? excess ?? 0) > 0 ? "+" : ""}${(risk?.excessReturn ?? excess ?? 0).toFixed(1)}pp`,
              })}
            </Text>
          ) : benchmarkMatches ? (
            <Text style={s.small}>{t("portfolio.benchmarkReturnMissing")}</Text>
          ) : (
            <Text style={s.small}>{t("portfolio.benchmarkDataUnavailable")}</Text>
          )}
          <ReturnComparisonChart
            series={risk.series}
            benchmarkName={benchmarkItem ? t(benchmarkItem.labelKey) : ""}
            loading={false}
            emptyLabel={t("portfolio.chartEmpty")}
            tableLabel={t("portfolio.chartTable")}
            chartLabel={t("portfolio.chartLabel", {
              portfolio:
                rangeReturnForCompare === undefined ? "—" : formatPercent(rangeReturnForCompare),
              benchmark: benchmarkItem ? t(benchmarkItem.labelKey) : "",
              benchmarkReturn: benchmarkReturn === undefined ? "—" : formatPercent(benchmarkReturn),
              excess: `${(risk?.excessReturn ?? excess ?? 0).toFixed(1)}`,
            })}
            labels={{
              portfolio: t("portfolio.chartPortfolio"),
              benchmark: t("portfolio.chartBenchmark"),
              date: t("portfolio.chartDate"),
            }}
          />
          <Text style={s.small}>{t("portfolio.chartNormalized")}</Text>
        </View>
      )}
    </View>
  );
}

function AllocationSection({
  group,
  mode,
  onMode,
}: {
  group: CurrencyGroup;
  mode: "symbol" | "sector";
  onMode: (mode: "symbol" | "sector") => void;
}) {
  const { t } = useTranslation();
  const raw = mode === "symbol" ? group.bySymbol : group.bySector;
  const slices = buildAllocationSlices(raw);
  const sectors = group.bySector.slice(0, 5);
  const topThree = sectors.slice(0, 3).reduce((sum, item) => sum + item.weight, 0);
  const lead = sectors[0];
  const warn = !!lead && lead.key !== "未分类" && (lead.weight >= 40 || topThree >= 70);
  const uncategorized = group.bySector.find((item) => item.key === "未分类");
  const uncategorizedCount = group.positions.filter((position) => !position.sector).length;

  return (
    <View style={{ gap: 10 }}>
      <SectionHeading title={t("portfolio.allocationTitle")} />
      <SegmentedChips
        items={[
          { id: "symbol", label: t("portfolio.bySymbol") },
          { id: "sector", label: t("portfolio.bySector") },
        ]}
        selected={mode}
        onSelect={(id) => onMode(id as "symbol" | "sector")}
      />
      {slices.length ? (
        <View style={{ gap: 10 }}>
          <View
            style={{
              height: 10,
              borderRadius: 999,
              overflow: "hidden",
              backgroundColor: colors.tertiary,
              flexDirection: "row",
            }}
          >
            {slices.map((slice, index) => (
              <View
                key={slice.key}
                style={{
                  width: `${slice.weight}%`,
                  height: 10,
                  backgroundColor:
                    slice.key === "__other__"
                      ? OTHER_COLOR
                      : ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
                  borderRightWidth: index < slices.length - 1 ? 2 : 0,
                  borderRightColor: colors.paper,
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {slices.map((slice, index) => (
              <View key={slice.key} style={[s.row, { gap: 5 }]}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor:
                      slice.key === "__other__"
                        ? OTHER_COLOR
                        : ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
                  }}
                />
                <Text style={[s.text, { fontSize: 12 }]} numberOfLines={1}>
                  {slice.key === "__other__"
                    ? t("portfolio.other")
                    : slice.key === "未分类"
                      ? t("portfolio.uncategorized")
                      : slice.key}
                </Text>
                <Text style={[s.metric, s.small]}>{slice.weight.toFixed(1)}%</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <Text style={s.muted}>{t("portfolio.allocationEmpty")}</Text>
      )}
      {group.unvaluedCount > 0 && (
        <Text style={[s.small, { color: colors.alertVolumeText }]}>
          {t("portfolio.allocationExcluded", { count: group.unvaluedCount })}
        </Text>
      )}

      <Text style={[s.small, { fontWeight: "600", color: colors.text, marginTop: 8 }]}>
        {t("portfolio.concentration")}
      </Text>
      {sectors.length ? (
        <View style={{ gap: 8 }}>
          {sectors.map((sector) => (
            <View key={sector.key} style={{ gap: 3 }}>
              <View style={s.between}>
                <Text style={[s.text, { fontSize: 13 }]}>
                  {sector.key === "未分类" ? t("portfolio.uncategorized") : sector.key}
                </Text>
                <Text style={[s.metric, s.small]}>{sector.weight.toFixed(1)}%</Text>
              </View>
              <View style={{ height: 6, borderRadius: 999, backgroundColor: colors.tertiary }}>
                <View
                  style={{
                    width: `${Math.min(100, sector.weight)}%`,
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: colors.primary,
                  }}
                />
              </View>
            </View>
          ))}
          {warn && lead && (
            <View
              style={[
                s.row,
                { gap: 6, padding: 8, borderRadius: 8, backgroundColor: colors.alertVolumeSurface },
              ]}
            >
              <AlertTriangle size={14} strokeWidth={1.8} color={colors.alertVolumeText} />
              <Text style={{ flex: 1, fontSize: 11, color: colors.alertVolumeText }}>
                {t("portfolio.concentrationWarning", {
                  name: lead.key,
                  pct: lead.weight.toFixed(0),
                })}
              </Text>
            </View>
          )}
          {!!uncategorized && uncategorizedCount > 0 && warn === false && (
            <Text style={[s.small, { color: colors.faint }]}>
              {t("portfolio.uncategorizedHint", { count: uncategorizedCount })}
            </Text>
          )}
        </View>
      ) : (
        <Text style={s.muted}>{t("portfolio.allocationEmpty")}</Text>
      )}
    </View>
  );
}

function TopHoldingsSection({
  group,
  onOpen,
}: {
  group: CurrencyGroup;
  onOpen: (position: PositionView) => void;
}) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const positions = sortPositions(
    group.positions.filter((position) => position.marketValue !== undefined),
    "marketValue",
  );
  if (!positions.length) return null;
  const rows = showAll ? positions : positions.slice(0, 5);
  return (
    <View style={{ gap: 8 }}>
      <SectionHeading
        title={t("portfolio.topHoldings")}
        action={showAll ? t("portfolio.back") : t("portfolio.viewAll")}
        onPress={() => setShowAll((current) => !current)}
      />
      <Card style={{ paddingVertical: 2 }}>
        {rows.map((position, index) => (
          <Pressable
            key={position.id}
            accessibilityRole="button"
            onPress={() => onOpen(position)}
            style={({ pressed }) => [
              s.row,
              {
                minHeight: 44,
                gap: 8,
                borderTopWidth: index ? 1 : 0,
                borderTopColor: colors.line,
                paddingHorizontal: 4,
                borderRadius: 8,
              },
              pressed && { backgroundColor: colors.overlay1 },
            ]}
          >
            <Text style={[s.small, { width: 16, color: colors.faint }]}>{index + 1}</Text>
            <Text
              style={[s.text, { fontSize: 13, fontWeight: "600", width: 74 }]}
              numberOfLines={1}
            >
              {position.symbolCode}
            </Text>
            <Text style={[s.muted, { flex: 1, fontSize: 12 }]} numberOfLines={1}>
              {position.name}
            </Text>
            <Text style={[s.metric, { fontSize: 13 }]}>
              {formatMoney(position.marketValue, group.currency)}
            </Text>
            <Text style={[s.metric, s.small, { width: 56, textAlign: "right" }]}>
              {position.weight === undefined ? "—" : `${position.weight.toFixed(1)}%`}
            </Text>
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

function HoldingsSection({
  group,
  sort,
  onSort,
  onAdd,
  onMenu,
  onOpen,
  desktop,
}: {
  group: CurrencyGroup;
  sort: "marketValue" | "pnl" | "weight";
  onSort: (sort: "marketValue" | "pnl" | "weight") => void;
  onAdd: () => void;
  onMenu: (holding: Holding) => void;
  onOpen: (position: PositionView) => void;
  desktop: boolean;
}) {
  const { t } = useTranslation();
  const positions = sortPositions(group.positions, sort);
  const directions: Array<{ id: typeof sort; label: string }> = [
    { id: "marketValue", label: t("portfolio.sortByMarketValue") },
    { id: "pnl", label: t("portfolio.sortByPnl") },
    { id: "weight", label: t("portfolio.sortByWeight") },
  ];

  return (
    <View style={{ gap: 8 }}>
      <View style={[s.between, { gap: 10, flexWrap: "wrap" }]}>
        <View style={[s.row, { gap: 8 }]}>
          <Text style={s.heading}>
            {t("portfolio.holdingsTitle", { currency: group.currency })}
          </Text>
          <Text style={s.small}>
            {t("portfolio.holdingsCount", { count: group.positions.length })}
          </Text>
        </View>
        <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
          <SegmentedChips
            items={directions.map((item) => ({ id: item.id, label: item.label }))}
            selected={sort}
            onSelect={(id) => onSort(id as typeof sort)}
          />
          <Button small icon={Plus} hitSlop={6} onPress={onAdd} style={{ minHeight: 44 }}>
            {t("portfolio.addHolding")}
          </Button>
        </View>
      </View>

      {!positions.length ? (
        <Empty
          icon={CircleDollarSign}
          title={t("portfolio.emptyHoldingsTitle")}
          detail={t("portfolio.emptyHoldingsDetail")}
        >
          <Button primary icon={Plus} onPress={onAdd} style={{ minHeight: 44 }}>
            {t("portfolio.holdingsAdd")}
          </Button>
        </Empty>
      ) : desktop ? (
        <View
          style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 10, overflow: "hidden" }}
        >
          <View
            style={[
              s.row,
              { minHeight: 36, paddingHorizontal: 10, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[s.small, { flex: 1, minWidth: 160 }]}>
              {t("portfolio.holdingSymbol")}
            </Text>
            <Text style={[s.small, { width: 90, textAlign: "right" }]}>
              {t("portfolio.holdingQuantity")}
            </Text>
            <Text style={[s.small, { width: 100, textAlign: "right" }]}>
              {t("portfolio.holdingAvgCost")}
            </Text>
            <Text style={[s.small, { width: 100, textAlign: "right" }]}>
              {t("portfolio.priceLabel")}
            </Text>
            <Text style={[s.small, { width: 120, textAlign: "right" }]}>
              {t("portfolio.metricsMarketValue")}
            </Text>
            <Text style={[s.small, { width: 120, textAlign: "right" }]}>
              {t("portfolio.metricsPnl")}
            </Text>
            <Text style={[s.small, { width: 80, textAlign: "right" }]}>
              {t("portfolio.sortByWeight")}
            </Text>
            <View style={{ width: 44 }} />
          </View>
          {positions.map((position, index) => (
            <View
              key={position.id}
              style={[
                s.row,
                {
                  minHeight: 48,
                  paddingHorizontal: 10,
                  gap: 6,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: colors.line,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => onOpen(position)}
                style={{ flex: 1, minWidth: 160 }}
              >
                <Text style={[s.text, { fontSize: 13, fontWeight: "600" }]} numberOfLines={1}>
                  {position.symbolCode}
                </Text>
                <Text style={[s.small, { fontSize: 11 }]} numberOfLines={1}>
                  {position.name ?? ""}
                </Text>
              </Pressable>
              <Text style={[s.metric, s.small, { width: 90, textAlign: "right" }]}>
                {formatQuantity(position.quantity)}
              </Text>
              <Text style={[s.metric, s.small, { width: 100, textAlign: "right" }]}>
                {position.avgCost.toFixed(2)}
              </Text>
              <View style={{ width: 100, alignItems: "flex-end" }}>
                <Text style={[s.metric, s.small]}>
                  {position.price === undefined ? "—" : position.price.toFixed(2)}
                </Text>
                {position.marketValue === undefined && (
                  <Text
                    style={[s.small, { fontSize: 10, color: colors.alertVolumeText }]}
                    numberOfLines={1}
                  >
                    {quoteErrorLabel(position.error, t)}
                  </Text>
                )}
              </View>
              <Text
                style={[s.metric, s.small, { width: 120, textAlign: "right", fontWeight: "600" }]}
              >
                {formatMoney(position.marketValue, group.currency)}
              </Text>
              <View style={{ width: 120, alignItems: "flex-end" }}>
                <Text
                  style={[
                    s.metric,
                    {
                      fontSize: 12,
                      fontWeight: "600",
                      color: marketDirectionColor(directionOf(position.pnlPct ?? 0)),
                    },
                  ]}
                >
                  {position.pnl === undefined ? "—" : formatMoney(position.pnl, group.currency)}
                </Text>
                <Text
                  style={[
                    s.metric,
                    s.small,
                    {
                      fontSize: 11,
                      color: marketDirectionColor(directionOf(position.pnlPct ?? 0)),
                    },
                  ]}
                >
                  {position.pnlPct === undefined ? "—" : formatPercent(position.pnlPct)}
                </Text>
              </View>
              <Text style={[s.metric, s.small, { width: 60, textAlign: "right" }]}>
                {position.weight === undefined ? "—" : `${position.weight.toFixed(1)}%`}
              </Text>
              <IconButton
                icon={MoreHorizontal}
                label={t("portfolio.portfolioMenu")}
                size={44}
                onPress={() => onMenu(position)}
              />
            </View>
          ))}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {positions.map((position) => (
            <Card key={position.id} style={{ padding: 14, gap: 6 }}>
              <View style={[s.between, { gap: 8 }]}>
                <View style={[s.row, { gap: 6, flex: 1, minWidth: 0 }]}>
                  <Text style={[s.text, { fontSize: 14, fontWeight: "600" }]} numberOfLines={1}>
                    {position.symbolCode}
                  </Text>
                  <Text style={[s.muted, { fontSize: 12, flexShrink: 1 }]} numberOfLines={1}>
                    {position.name ?? ""}
                  </Text>
                </View>
                <Text style={[s.metric, { fontSize: 15, fontWeight: "600" }]}>
                  {formatMoney(position.marketValue, group.currency)}
                </Text>
              </View>
              <Text style={s.small}>
                {formatQuantity(position.quantity)} × {position.avgCost.toFixed(2)} →{" "}
                {position.price === undefined
                  ? quoteErrorLabel(position.error, t)
                  : position.price.toFixed(2)}
              </Text>
              <View style={[s.between, { gap: 8 }]}>
                <Text
                  style={[
                    s.metric,
                    {
                      fontSize: 13,
                      fontWeight: "600",
                      color: marketDirectionColor(directionOf(position.pnlPct ?? 0)),
                    },
                  ]}
                >
                  {position.pnl === undefined ? "—" : formatMoney(position.pnl, group.currency)}{" "}
                  {position.pnlPct === undefined ? "" : formatPercent(position.pnlPct)}
                </Text>
                <View style={[s.row, { gap: 8 }]}>
                  <Text style={[s.small, { color: colors.faint }]}>
                    {position.weight === undefined ? "—" : `${position.weight.toFixed(1)}%`}
                  </Text>
                  <IconButton
                    icon={MoreHorizontal}
                    label={t("portfolio.portfolioMenu")}
                    size={44}
                    onPress={() => onMenu(position)}
                  />
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

function RowMenu({
  holding,
  onEdit,
  onDelete,
  onClose,
}: {
  holding: Holding;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable onPress={onClose} style={s.modalShade}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[s.card, { maxWidth: 360, width: "100%", padding: 0, overflow: "hidden" }]}
        >
          <Text style={[s.heading, { padding: 16 }]}>{holding.symbolCode}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onClose();
              onEdit();
            }}
            style={{
              minHeight: 48,
              justifyContent: "center",
              paddingHorizontal: 16,
              borderTopWidth: 1,
              borderTopColor: colors.line,
            }}
          >
            <Text style={s.text}>{t("portfolio.editHolding")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onClose();
              onDelete();
            }}
            style={{
              minHeight: 48,
              justifyContent: "center",
              paddingHorizontal: 16,
              borderTopWidth: 1,
              borderTopColor: colors.line,
            }}
          >
            <Text style={[s.text, { color: colors.danger }]}>{t("portfolio.removeHolding")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function PortfolioScreen() {
  const { api, notify, open } = useWorkspace();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const state = usePortfolioState();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDeletePortfolio, setConfirmDeletePortfolio] = useState(false);
  const [confirmDeleteHolding, setConfirmDeleteHolding] = useState<Holding>();
  const [holdingForm, setHoldingForm] = useState<
    { mode: "create" } | { mode: "edit"; holding: Holding }
  >();
  const [importOpen, setImportOpen] = useState(false);
  const [riskExplain, setRiskExplain] = useState(false);
  const [allocationMode, setAllocationMode] = useState<"symbol" | "sector">("symbol");
  const [benchmarks, setBenchmarks] = useState<Record<Currency, string>>(DEFAULT_BENCHMARK);
  const [sorts, setSorts] = useState<Record<Currency, "marketValue" | "pnl" | "weight">>({
    CNY: "marketValue",
    USD: "marketValue",
    HKD: "marketValue",
  });
  const [rowMenu, setRowMenu] = useState<Holding>();

  useEffect(() => {
    void loadPortfolios(api);
  }, [api]);

  useEffect(() => {
    const timer = setInterval(() => refreshSummary(api), 60_000);
    return () => clearInterval(timer);
  }, [api]);

  const portfolio =
    state.portfolios.find((item) => item.id === state.activeId) ?? activePortfolio();
  const summary = state.summary?.portfolio?.id === portfolio?.id ? state.summary : undefined;
  const groups = summary?.groups ?? [];
  const refreshedAt = summary?.generatedAt;

  const openPosition = (position: PositionView) => {
    const meta = metaFor(position.symbolCode);
    open({
      type: "symbol",
      symbol: meta,
      quote:
        position.price === undefined
          ? undefined
          : { price: position.price, changePercent: position.changePercent },
    });
  };

  async function submitHolding(input: {
    portfolioId: string;
    symbol: { code: string; name: string };
    holdingId?: string;
    quantity: number;
    avgCost: number;
    sector?: string;
    currency: Currency;
  }) {
    if (input.holdingId) {
      await updateHolding(api, input.portfolioId, input.holdingId, {
        quantity: input.quantity,
        avgCost: input.avgCost,
        sector: input.sector,
      });
    } else {
      await addHolding(api, {
        portfolioId: input.portfolioId,
        symbolCode: input.symbol.code,
        quantity: input.quantity,
        avgCost: input.avgCost,
        sector: input.sector,
        currency: input.currency,
      });
    }
    setHoldingForm(undefined);
    notify(t("portfolio.holdingSaved"));
  }

  if (state.status === "loading") {
    return (
      <View style={{ gap: 12 }}>
        {[0, 1].map((index) => (
          <Card key={index} style={{ gap: 10, height: 132 }}>
            {[0, 1, 2].map((line) => (
              <View
                key={line}
                style={{
                  height: 12,
                  width: `${80 - line * 15}%`,
                  borderRadius: 4,
                  backgroundColor: colors.tertiary,
                }}
              />
            ))}
          </Card>
        ))}
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!state.portfolios.length) {
    return (
      <View style={{ gap: 14 }}>
        <ErrorNotice error={state.degraded ? t("portfolio.loadFailed") : undefined} />
        <Empty
          icon={CircleDollarSign}
          title={t("portfolio.emptyTitle")}
          detail={t("portfolio.emptyDetail")}
        >
          <Button primary icon={Plus} style={{ minHeight: 44 }} onPress={() => setCreateOpen(true)}>
            {t("portfolio.emptyCreate")}
          </Button>
        </Empty>
        {createOpen && (
          <PortfolioCreateSheet
            mode="create"
            onClose={() => setCreateOpen(false)}
            onSubmit={async (name, currency) => {
              await createPortfolio(api, { name, baseCurrency: currency });
              setCreateOpen(false);
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={[s.between, { gap: 8, flexWrap: "wrap" }]}>
        <View style={[s.row, { gap: 8, flexWrap: "wrap", flex: 1 }]}>
          <SegmentedChips
            items={state.portfolios.map((item) => ({ id: item.id, label: item.name }))}
            selected={portfolio?.id ?? ""}
            onSelect={(id) => selectPortfolio(api, id)}
          />
        </View>
        <View style={[s.row, { gap: 8 }]}>
          <Button small icon={Upload} style={{ minHeight: 44 }} onPress={() => setImportOpen(true)}>
            {t("portfolio.importCsv")}
          </Button>
          <Button
            small
            primary
            icon={Plus}
            style={{ minHeight: 44 }}
            onPress={() => setCreateOpen(true)}
          >
            {t("portfolio.newPortfolio")}
          </Button>
          <IconButton
            icon={MoreHorizontal}
            label={t("portfolio.portfolioMenu")}
            onPress={() => setMenuOpen(true)}
          />
        </View>
      </View>

      {state.source === "mock" && (
        <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
          <Chip>{t("portfolio.sample")}</Chip>
          <Text style={[s.small, { flexShrink: 1 }]}>{t("portfolio.sampleHint")}</Text>
        </View>
      )}

      {state.summaryStatus === "error" && <ErrorNotice error={t("portfolio.summaryFailed")} />}

      {!!summary && groups.length === 0 && (
        <Empty
          icon={CircleDollarSign}
          title={t("portfolio.emptyHoldingsTitle")}
          detail={t("portfolio.emptyHoldingsDetail")}
        >
          <View style={[s.row, { gap: 10, flexWrap: "wrap", justifyContent: "center" }]}>
            <Button
              primary
              icon={Plus}
              style={{ minHeight: 44 }}
              onPress={() => setHoldingForm({ mode: "create" })}
            >
              {t("portfolio.holdingsAdd")}
            </Button>
            <Button icon={Upload} style={{ minHeight: 44 }} onPress={() => setImportOpen(true)}>
              {t("portfolio.emptyImport")}
            </Button>
          </View>
        </Empty>
      )}

      <View style={{ flexDirection: desktop ? "row" : "column", gap: 12 }}>
        {groups.map((group) => (
          <View key={`overview-${group.currency}`} style={{ flex: 1 }}>
            <OverviewCard group={group} desktop={desktop} />
          </View>
        ))}
      </View>

      {groups.map((group) => (
        <View key={group.currency} style={{ gap: 18 }}>
          <RiskSection
            group={group}
            benchmark={benchmarks[group.currency]}
            onBenchmark={(id) => setBenchmarks((current) => ({ ...current, [group.currency]: id }))}
            onExplain={() => setRiskExplain(true)}
            onRetry={() => refreshSummary(api)}
            loading={state.summaryStatus === "loading"}
          />
          <AllocationSection group={group} mode={allocationMode} onMode={setAllocationMode} />
          <TopHoldingsSection group={group} onOpen={openPosition} />
          <HoldingsSection
            group={group}
            sort={sorts[group.currency]}
            onSort={(sort) => setSorts((current) => ({ ...current, [group.currency]: sort }))}
            onAdd={() => setHoldingForm({ mode: "create" })}
            onMenu={(holding) => setRowMenu(holding)}
            onOpen={openPosition}
            desktop={width >= 600}
          />
        </View>
      ))}

      <Text style={[s.small, { textAlign: "right" }]}>
        {state.summaryStatus === "loading"
          ? t("portfolio.refreshing")
          : refreshedAt
            ? t("portfolio.updatedAt", { time: new Date(refreshedAt).toLocaleTimeString() })
            : ""}
      </Text>
      <DisclaimerNote />

      {createOpen && (
        <PortfolioCreateSheet
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSubmit={async (name, currency) => {
            await createPortfolio(api, { name, baseCurrency: currency });
            setCreateOpen(false);
          }}
        />
      )}
      {renameOpen && portfolio && (
        <PortfolioCreateSheet
          mode="rename"
          initialName={portfolio.name}
          onClose={() => setRenameOpen(false)}
          onSubmit={async (name) => {
            await renamePortfolio(api, portfolio.id, name);
            setRenameOpen(false);
          }}
        />
      )}
      {menuOpen && portfolio && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setMenuOpen(false)}>
          <Pressable onPress={() => setMenuOpen(false)} style={s.modalShade}>
            <Pressable
              accessibilityViewIsModal
              onPress={(event) => event.stopPropagation()}
              style={[s.card, { maxWidth: 320, width: "100%", padding: 0, overflow: "hidden" }]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMenuOpen(false);
                  setRenameOpen(true);
                }}
                style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16 }}
              >
                <Text style={s.text}>{t("portfolio.renamePortfolio")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMenuOpen(false);
                  setConfirmDeletePortfolio(true);
                }}
                style={{
                  minHeight: 48,
                  justifyContent: "center",
                  paddingHorizontal: 16,
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                }}
              >
                <Text style={[s.text, { color: colors.danger }]}>
                  {t("portfolio.deletePortfolio")}
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {confirmDeletePortfolio && portfolio && (
        <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => setConfirmDeletePortfolio(false)}
        >
          <Pressable onPress={() => setConfirmDeletePortfolio(false)} style={s.modalShade}>
            <Pressable
              accessibilityViewIsModal
              onPress={(event) => event.stopPropagation()}
              style={[s.card, { maxWidth: 360, width: "100%", padding: 22, gap: 10 }]}
            >
              <Text style={s.heading}>{t("portfolio.deletePortfolioConfirm")}</Text>
              <Text style={s.muted}>
                {t("portfolio.deletePortfolioDetail", { name: portfolio.name })}
              </Text>
              <View style={[s.row, { gap: 10, marginTop: 8 }]}>
                <Button
                  style={{ flex: 1, minHeight: 44 }}
                  onPress={() => setConfirmDeletePortfolio(false)}
                >
                  {t("portfolio.holdingCancel")}
                </Button>
                <Button
                  danger
                  style={{ flex: 1, minHeight: 44 }}
                  onPress={() => {
                    void (async () => {
                      try {
                        await deletePortfolio(api, portfolio.id);
                        setConfirmDeletePortfolio(false);
                      } catch {
                        notify(t("portfolio.loadFailed"));
                      }
                    })();
                  }}
                >
                  {t("portfolio.deletePortfolio")}
                </Button>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {holdingForm && portfolio && (
        <HoldingFormSheet
          api={api}
          portfolioId={portfolio.id}
          holding={holdingForm.mode === "edit" ? holdingForm.holding : undefined}
          onClose={() => setHoldingForm(undefined)}
          onSubmit={submitHolding}
        />
      )}
      {rowMenu && portfolio && (
        <RowMenu
          holding={rowMenu}
          onClose={() => setRowMenu(undefined)}
          onEdit={() => setHoldingForm({ mode: "edit", holding: rowMenu })}
          onDelete={() => setConfirmDeleteHolding(rowMenu)}
        />
      )}
      {confirmDeleteHolding && portfolio && (
        <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => setConfirmDeleteHolding(undefined)}
        >
          <Pressable onPress={() => setConfirmDeleteHolding(undefined)} style={s.modalShade}>
            <Pressable
              accessibilityViewIsModal
              onPress={(event) => event.stopPropagation()}
              style={[s.card, { maxWidth: 360, width: "100%", padding: 22, gap: 10 }]}
            >
              <Text style={s.heading}>{t("portfolio.holdingDeleteConfirm")}</Text>
              <Text style={s.muted}>{confirmDeleteHolding.symbolCode}</Text>
              <View style={[s.row, { gap: 10, marginTop: 8 }]}>
                <Button
                  style={{ flex: 1, minHeight: 44 }}
                  onPress={() => setConfirmDeleteHolding(undefined)}
                >
                  {t("portfolio.holdingCancel")}
                </Button>
                <Button
                  danger
                  style={{ flex: 1, minHeight: 44 }}
                  onPress={() => {
                    void (async () => {
                      try {
                        await deleteHolding(api, portfolio.id, confirmDeleteHolding.id);
                        setConfirmDeleteHolding(undefined);
                      } catch {
                        notify(t("portfolio.holdingSaveError"));
                      }
                    })();
                  }}
                >
                  {t("portfolio.removeHolding")}
                </Button>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {importOpen && portfolio && (
        <ImportWizard
          api={api}
          source={state.source}
          portfolio={portfolio}
          onClose={() => setImportOpen(false)}
          onImported={() => refreshSummary(api)}
        />
      )}
      {riskExplain && (
        <Sheet title={t("portfolio.riskExplain")} onClose={() => setRiskExplain(false)}>
          <Text style={s.text}>{t("portfolio.riskExplainText")}</Text>
        </Sheet>
      )}
    </View>
  );
}
