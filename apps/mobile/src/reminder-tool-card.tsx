import { Bell, Clock3 } from "lucide-react-native";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { activeLocaleTag, type TranslationFn, useTranslation } from "./i18n";
import type { ReminderItem, ReminderResult } from "./reminder-result";
import { parseReminderResult } from "./reminder-result";
import { colors } from "./ui";

function conditionLabel(reminder: ReminderItem, t: TranslationFn): string {
  if (reminder.condition === "contains") {
    return t("tools.reminderConditionContains", { value: reminder.value });
  }
  if (reminder.condition === "price_below") {
    return t("tools.reminderConditionPrice", { value: reminder.value });
  }
  return t("tools.reminderConditionChange");
}

function whenLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(activeLocaleTag(), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ReminderToolCard({ result, loading }: { result: unknown; loading: boolean }) {
  const { t } = useTranslation();
  const data = parseReminderResult(result);
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={colors.blueDark} />
        <Text style={styles.muted}>{t("tools.remindersLoading")}</Text>
      </View>
    );
  }
  if (!data) {
    return <Text style={styles.muted}>{t("tools.remindersUnavailable")}</Text>;
  }
  return <ReminderList data={data} t={t} />;
}

function ReminderList({ data, t }: { data: ReminderResult; t: TranslationFn }) {
  if (!data.reminders.length && !data.alerts.length) {
    return <Text style={styles.muted}>{t("tools.remindersEmpty")}</Text>;
  }
  return (
    <View style={styles.list}>
      {data.reminders.map((reminder) => (
        <View key={reminder.id} style={styles.item}>
          <View style={styles.itemIcon}>
            <Clock3 size={14} color={colors.blueDark} />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{reminder.title}</Text>
            <Text style={styles.meta}>
              {conditionLabel(reminder, t)} ·{" "}
              {t("tools.reminderNextCheck", { when: whenLabel(reminder.nextCheckAt) })}
            </Text>
          </View>
        </View>
      ))}
      {!!data.alerts.length && (
        <View style={styles.alerts}>
          <Text style={styles.sectionLabel}>{t("tools.remindersRecentAlerts")}</Text>
          {data.alerts.map((alert) => (
            <View key={alert.id} style={styles.item}>
              <View style={styles.itemIcon}>
                <Bell size={14} color={colors.blueDark} />
              </View>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>{alert.title}</Text>
                <Text numberOfLines={2} style={styles.meta}>
                  {alert.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 11 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  itemIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sky,
  },
  itemBody: { flex: 1, gap: 2 },
  itemTitle: { color: colors.text, fontSize: 13.5, lineHeight: 19, fontWeight: "500" },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  sectionLabel: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  alerts: { gap: 9, paddingTop: 3 },
  loading: { flexDirection: "row", alignItems: "center", gap: 8 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
