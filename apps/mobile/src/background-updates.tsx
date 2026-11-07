import { Pressable, View } from "react-native";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import { ArrowRight, Bell, X } from "./icons";
import { Button, Card, colors, ErrorNotice, resultSummary, s } from "./ui";
import { useNotificationActions } from "./use-notification-actions";
import { useWorkspace } from "./workspace";

export function BackgroundUpdates() {
  const { data } = useAgentWorkspace();
  const { open } = useWorkspace();
  const { t } = useTranslation();
  const { updates, error, busy, markRead, openNotification } = useNotificationActions();
  const update = updates[0];
  if (!update || data?.identity.showChatUpdates === false) return null;
  return (
    <Card style={{ padding: 16, gap: 10 }}>
      <View style={[s.between, { gap: 12 }]}>
        <View style={[s.row, { gap: 7 }]}>
          <Bell size={14} color={colors.primary} />
          <Text style={s.small}>{t("tools.updateForYou")}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("tools.dismissBackgroundUpdate")}
          disabled={busy}
          onPress={() => void markRead(update.id)}
          hitSlop={10}
          style={{ padding: 6 }}
        >
          <X size={16} color={colors.muted} />
        </Pressable>
      </View>
      <Text style={s.heading}>{update.title}</Text>
      <Text style={s.text}>{resultSummary(update.body)}</Text>
      <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
        <Button small icon={ArrowRight} busy={busy} onPress={() => void openNotification(update)}>
          {t("tools.viewTask")}
        </Button>
        {updates.length > 1 && (
          <Button small onPress={() => open({ type: "notifications" })}>
            {updates.length - 1 === 1
              ? t("tools.moreUpdatesOne")
              : t("tools.moreUpdates", { count: updates.length - 1 })}
          </Button>
        )}
      </View>
      <ErrorNotice error={error} />
    </Card>
  );
}
