/**
 * 对话内联行情卡片：渲染 `get_quote` 的 `quote` / `quotes[]`。
 *
 * 单标的走 compact 卡片；多标的按纵向列表展示。行情字段、七类错误与
 * stale/asOf 语义完全复用 QuoteCard / quotes.ts，不在对话里另造文案。
 */
import { ActivityIndicator, Text, View } from "react-native";
import { useTranslation } from "./i18n";
import { metaFor } from "./market";
import { QuoteCard } from "./quote-card";
import { parseToolQuotes } from "./quotes";
import { Card, colors, s } from "./ui";

export function QuoteToolCard({ result, loading }: { result: unknown; loading: boolean }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <Card style={{ padding: 14 }}>
        <View style={[s.row, { gap: 8 }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={s.muted}>{t("quotes.fetching")}</Text>
        </View>
      </Card>
    );
  }
  const quotes = parseToolQuotes(result);
  if (!quotes.length) return <Text style={s.muted}>{t("quotes.unavailable")}</Text>;
  return (
    <View style={{ gap: 8 }}>
      {quotes.map((item) => {
        const meta = metaFor(item.symbol);
        const market =
          item.market === "US" ||
          item.market === "CN" ||
          item.market === "HK" ||
          item.market === "ETF" ||
          item.market === "FUND"
            ? item.market
            : meta.market;
        return (
          <QuoteCard
            key={item.symbol}
            symbol={{ code: item.symbol, name: item.name || meta.name, market }}
            availability={item.availability}
            size="compact"
          />
        );
      })}
    </View>
  );
}
