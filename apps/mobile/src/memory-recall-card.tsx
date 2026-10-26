import { Brain } from "lucide-react-native";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "./i18n";
import { parseMemoryRecallResult, type RecalledMemory } from "./memory-recall-result";
import { colors } from "./ui";

export function MemoryRecallCard({ result, loading }: { result: unknown; loading: boolean }) {
  const { t } = useTranslation();
  const data = parseMemoryRecallResult(result);
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={colors.blueDark} />
        <Text style={styles.muted}>{t("tools.memoryRecallLoading")}</Text>
      </View>
    );
  }
  if (!data) return <Text style={styles.muted}>{t("tools.memoryRecallUnavailable")}</Text>;
  return (
    <View style={styles.wrap}>
      {!!data.query && (
        <Text style={styles.query}>{t("tools.memoryRecallQuery", { query: data.query })}</Text>
      )}
      {data.memories.length ? (
        data.memories.map((memory) => <MemoryRow key={memory.id} memory={memory} />)
      ) : (
        <Text style={styles.muted}>{t("tools.memoryRecallEmpty")}</Text>
      )}
    </View>
  );
}

function MemoryRow({ memory }: { memory: RecalledMemory }) {
  return (
    <View style={styles.memory}>
      <View style={styles.icon}>
        <Brain size={14} strokeWidth={1.8} color={colors.blueDark} />
      </View>
      <View style={styles.body}>
        <Text selectable style={styles.text}>
          {memory.text}
        </Text>
        {!!memory.source && <Text style={styles.source}>{memory.source}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  loading: { flexDirection: "row", alignItems: "center", gap: 8 },
  query: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  memory: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sky,
  },
  body: { flex: 1, gap: 2 },
  text: { color: colors.text, fontSize: 13.5, lineHeight: 19 },
  source: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
