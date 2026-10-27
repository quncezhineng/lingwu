/**
 * 组合页表单：新建组合 / 重命名 / 手动添加或编辑持仓。
 */
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { LingWuApi } from "./api";
import { useTranslation } from "./i18n";
import { Search } from "./icons";
import { metaFor, type SymbolMeta, searchSymbols } from "./market";
import { type Currency, type Holding, marketCurrency } from "./portfolio";
import { Button, Chip, colors, ErrorNotice, Sheet, s } from "./ui";

const CURRENCY_OPTIONS: Currency[] = ["CNY", "USD", "HKD"];

export function PortfolioCreateSheet({
  mode,
  initialName,
  onClose,
  onSubmit,
}: {
  mode: "create" | "rename";
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string, baseCurrency: Currency) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName ?? "");
  const [currency, setCurrency] = useState<Currency>("CNY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Sheet
      title={t(mode === "create" ? "portfolio.createTitle" : "portfolio.renamePortfolio")}
      onClose={onClose}
    >
      <Text style={[s.small, { fontWeight: "600", color: colors.text, marginBottom: 7 }]}>
        {t("portfolio.createNameLabel")}
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t("portfolio.createNamePlaceholder")}
        placeholderTextColor={colors.faint}
        accessibilityLabel={t("portfolio.createNameLabel")}
        style={[s.input, { marginBottom: 16 }]}
      />
      {mode === "create" && (
        <>
          <Text style={[s.small, { fontWeight: "600", color: colors.text, marginBottom: 7 }]}>
            {t("portfolio.baseCurrency")}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
            {CURRENCY_OPTIONS.map((option) => {
              const selected = currency === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setCurrency(option)}
                  style={{
                    minHeight: 44,
                    minWidth: 72,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.line,
                    backgroundColor: selected ? colors.sky : colors.canvas,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: selected ? colors.primary : colors.muted,
                    }}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
      <ErrorNotice error={error} />
      <Button
        primary
        busy={busy}
        disabled={!name.trim()}
        style={{ minHeight: 44 }}
        onPress={() => {
          void (async () => {
            if (!name.trim()) return;
            setBusy(true);
            setError("");
            try {
              await onSubmit(name.trim(), currency);
            } catch {
              setError(t("portfolio.createError"));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {t(mode === "create" ? "portfolio.create" : "portfolio.holdingSave")}
      </Button>
      {mode === "create" && (
        <Text style={[s.small, { marginTop: 10 }]}>{t("portfolio.currencyHelp")}</Text>
      )}
    </Sheet>
  );
}

export function HoldingFormSheet({
  api,
  portfolioId,
  holding,
  onClose,
  onSubmit,
}: {
  api: LingWuApi;
  portfolioId: string;
  holding?: Holding;
  onClose: () => void;
  onSubmit: (input: {
    portfolioId: string;
    symbol: SymbolMeta;
    holdingId?: string;
    quantity: number;
    avgCost: number;
    sector?: string;
    currency: Currency;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [symbol, setSymbol] = useState<SymbolMeta | undefined>(
    holding ? metaFor(holding.symbolCode) : undefined,
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolMeta[]>([]);
  const [quantity, setQuantity] = useState(holding ? String(holding.quantity) : "");
  const [avgCost, setAvgCost] = useState(holding ? String(holding.avgCost) : "");
  const [sector, setSector] = useState(holding?.sector ?? "");
  const [currency, setCurrency] = useState<Currency>(holding?.currency ?? marketCurrency("US"));
  const [editCurrency, setEditCurrency] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchSymbols(api, trimmed, 5).then(setResults);
    }, 300);
    return () => clearTimeout(timer);
  }, [api, query]);

  const quantityValue = Number(quantity);
  const costValue = Number(avgCost);
  const quantityError =
    quantity && (!Number.isFinite(quantityValue) || quantityValue <= 0)
      ? t("portfolio.quantityInvalid")
      : "";
  const costError =
    avgCost && (!Number.isFinite(costValue) || costValue < 0) ? t("portfolio.costInvalid") : "";
  const canSave =
    !!symbol &&
    !!quantity &&
    !!avgCost &&
    !quantityError &&
    !costError &&
    Number.isFinite(quantityValue) &&
    Number.isFinite(costValue);

  return (
    <Sheet title={t(holding ? "portfolio.editHolding" : "portfolio.addHolding")} onClose={onClose}>
      <Text style={[s.small, { fontWeight: "600", color: colors.text, marginBottom: 7 }]}>
        {t("portfolio.holdingSymbol")}
      </Text>
      {symbol && !holding ? (
        <View
          style={[
            s.row,
            {
              gap: 8,
              minHeight: 44,
              paddingHorizontal: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.line,
              marginBottom: 14,
            },
          ]}
        >
          <Text style={[s.text, { flex: 1 }]}>
            {symbol.code} · {symbol.name}
          </Text>
          <Button small onPress={() => setSymbol(undefined)} style={{ minHeight: 36 }}>
            {t("portfolio.changeSymbol")}
          </Button>
        </View>
      ) : holding ? (
        <Text style={[s.text, { marginBottom: 14 }]}>
          {holding.symbolCode} · {holding.name ?? ""}
        </Text>
      ) : (
        <View style={{ marginBottom: 14 }}>
          <View
            style={[
              s.row,
              {
                gap: 8,
                minHeight: 44,
                paddingHorizontal: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.line,
              },
            ]}
          >
            <Search size={17} strokeWidth={1.8} color={colors.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("portfolio.symbolSearchPlaceholder")}
              placeholderTextColor={colors.faint}
              accessibilityLabel={t("portfolio.symbolSearchPlaceholder")}
              style={{ flex: 1, fontSize: 15, color: colors.text, paddingVertical: 8 }}
            />
          </View>
          {!!query.trim() && (
            <View
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {results.length ? (
                results.map((result, index) => (
                  <Pressable
                    key={result.code}
                    accessibilityRole="button"
                    onPress={() => {
                      setSymbol(result);
                      setCurrency(marketCurrency(result.market === "ETF" ? "US" : result.market));
                      setQuery("");
                    }}
                    style={({ pressed }) => [
                      s.row,
                      {
                        gap: 10,
                        minHeight: 44,
                        paddingHorizontal: 12,
                        borderTopWidth: index ? 1 : 0,
                        borderTopColor: colors.line,
                        backgroundColor: pressed ? colors.overlay1 : "transparent",
                      },
                    ]}
                  >
                    <Text style={[s.text, { fontSize: 14, fontWeight: "600", width: 92 }]}>
                      {result.code}
                    </Text>
                    <Text style={[s.muted, { flex: 1 }]} numberOfLines={1}>
                      {result.name}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text style={[s.muted, { padding: 12 }]}>{t("portfolio.symbolSearchEmpty")}</Text>
              )}
            </View>
          )}
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
            {t("portfolio.holdingQuantity")}
          </Text>
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            placeholder="10"
            placeholderTextColor={colors.faint}
            accessibilityLabel={t("portfolio.holdingQuantity")}
            style={s.input}
          />
          {!!quantityError && (
            <Text accessibilityRole="alert" style={[s.small, { color: colors.danger }]}>
              {quantityError}
            </Text>
          )}
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
            {t("portfolio.holdingAvgCost")}
          </Text>
          <TextInput
            value={avgCost}
            onChangeText={setAvgCost}
            keyboardType="decimal-pad"
            placeholder="180.50"
            placeholderTextColor={colors.faint}
            accessibilityLabel={t("portfolio.holdingAvgCost")}
            style={s.input}
          />
          {!!costError && (
            <Text accessibilityRole="alert" style={[s.small, { color: colors.danger }]}>
              {costError}
            </Text>
          )}
        </View>
      </View>

      <Text style={[s.small, { fontWeight: "600", color: colors.text, marginBottom: 7 }]}>
        {t("portfolio.holdingSector")}
      </Text>
      <TextInput
        value={sector}
        onChangeText={setSector}
        placeholder={t("portfolio.holdingSectorPlaceholder")}
        placeholderTextColor={colors.faint}
        accessibilityLabel={t("portfolio.holdingSector")}
        style={[s.input, { marginBottom: 14 }]}
      />

      <View style={[s.between, { marginBottom: 6 }]}>
        <View style={[s.row, { gap: 8 }]}>
          <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
            {t("portfolio.holdingCurrency")}
          </Text>
          <Chip>{currency}</Chip>
          <Text style={s.small}>{t("portfolio.currencyInferred")}</Text>
        </View>
        {!holding && currency !== "HKD" && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditCurrency((current) => !current)}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={[s.small, { color: colors.primary, fontWeight: "600" }]}>
              {t("portfolio.changeSymbol")}
            </Text>
          </Pressable>
        )}
      </View>
      {editCurrency && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
          {(["CNY", "USD"] as Currency[]).map((option) => {
            const selected = currency === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setCurrency(option)}
                style={{
                  minHeight: 44,
                  minWidth: 72,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.line,
                  backgroundColor: selected ? colors.sky : colors.canvas,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: selected ? colors.primary : colors.muted,
                  }}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <Text style={[s.small, { marginBottom: 14 }]}>{t("portfolio.currencyHelp")}</Text>

      <ErrorNotice error={error} />
      <Button
        primary
        busy={busy}
        disabled={!canSave}
        style={{ minHeight: 44 }}
        onPress={() => {
          if (!symbol || !canSave) return;
          void (async () => {
            setBusy(true);
            setError("");
            try {
              await onSubmit({
                portfolioId,
                symbol,
                holdingId: holding?.id,
                quantity: quantityValue,
                avgCost: costValue,
                sector: sector.trim() || undefined,
                currency,
              });
            } catch {
              setError(t("portfolio.holdingSaveError"));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {t("portfolio.holdingSave")}
      </Button>
      <Button style={{ marginTop: 10, minHeight: 44 }} onPress={onClose}>
        {t("portfolio.holdingCancel")}
      </Button>
    </Sheet>
  );
}
