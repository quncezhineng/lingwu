/**
 * Today 的盯盘区块：消费 `/api/today`，按 MUST_KNOW / LATER / ARCHIVE 分组，
 * 展示当日打扰预算，并提供「不必要 / 有用」反馈。
 */
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./app-text";
import type { TranslationKey } from "./i18n";
import { useTranslation } from "./i18n";
import { Archive, Bell, Clock3, type IconComponent } from "./icons";
import {
  dismissMonitorEvent,
  eventDetail,
  eventTitle,
  loadMonitors,
  type MonitorEvent,
  type MonitorEventKind,
  useMonitorsState,
} from "./monitors";
import { Button, Card, Chip, colors, Empty, ErrorNotice, SectionHeading, s, timeLabel } from "./ui";
import { useWorkspace } from "./workspace";

const KIND_KEYS: Record<MonitorEventKind, TranslationKey> = {
  PRICE_ABOVE: "screens.monitorKindPriceAbove",
  PRICE_BELOW: "screens.monitorKindPriceBelow",
  CHANGE_PCT: "screens.monitorKindChangePct",
  VOLUME_SPIKE: "screens.monitorKindVolumeSpike",
  VOLATILITY_SPIKE: "screens.monitorKindVolatilitySpike",
  EARNINGS: "screens.monitorKindEarnings",
  ANNOUNCEMENT: "screens.monitorKindAnnouncement",
  DIVIDEND: "screens.monitorKindDividend",
  SUSPENSION: "screens.monitorKindSuspension",
  DIGEST: "screens.monitorKindDigest",
};

export function MonitorTodayCard() {
  const { api, navigate, notify } = useWorkspace();
  const { t } = useTranslation();
  const state = useMonitorsState();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string>();

  useEffect(() => {
    // Today 是聚合页：每次进入都重新读 /api/today，避免规则/事件变化后看到旧预算。
    void loadMonitors(api, true);
  }, [api]);

  const today = state.today;
  const groups = today?.groups;
  const total = groups ? groups.MUST_KNOW.length + groups.LATER.length + groups.ARCHIVE.length : 0;

  async function feedback(event: MonitorEvent, reason: "unnecessary" | "useful") {
    setPendingId(event.id);
    try {
      const result = await dismissMonitorEvent(api, event.id, reason);
      notify(
        reason === "useful"
          ? t("screens.monitorMarkedUseful")
          : result.accelerated
            ? t("screens.monitorDismissedAccelerated")
            : t("screens.monitorMarkedUnnecessary"),
      );
    } catch {
      notify(t("screens.monitorFeedbackFailed"));
    } finally {
      setPendingId(undefined);
    }
  }

  return (
    <Card>
      <SectionHeading
        title={t("screens.monitorTodayHeading")}
        count={total || undefined}
        action={t("screens.monitorTodayAction")}
        onPress={() => navigate("monitors")}
      />
      {state.status === "error" ? (
        <View style={{ gap: 10 }}>
          <ErrorNotice error={t("screens.monitorLoadFailed")} />
          <Button small onPress={() => void loadMonitors(api, true)}>
            {t("screens.monitorRetry")}
          </Button>
        </View>
      ) : !today ? (
        <Text style={s.muted}>{t("common.loading")}</Text>
      ) : (
        <View style={{ gap: 14 }}>
          <BudgetBar
            limit={today.budget.limit}
            used={today.budget.used}
            remaining={today.budget.remaining}
            downgraded={today.budget.downgradedCount}
          />
          {total === 0 ? (
            <Empty
              icon={Bell}
              title={t("screens.monitorEmptyTitle")}
              detail={t("screens.monitorEmptyDetail")}
            />
          ) : (
            <View style={{ gap: 10 }}>
              <EventGroup
                title={t("screens.monitorGroupMustKnow")}
                icon={Bell}
                events={groups?.MUST_KNOW ?? []}
                pendingId={pendingId}
                onFeedback={feedback}
              />
              <EventGroup
                title={t("screens.monitorGroupLater")}
                icon={Clock3}
                events={groups?.LATER ?? []}
                pendingId={pendingId}
                onFeedback={feedback}
              />
              <EventGroup
                title={t("screens.monitorGroupArchive")}
                icon={Archive}
                events={groups?.ARCHIVE ?? []}
                pendingId={pendingId}
                onFeedback={feedback}
                collapsed={!archiveOpen}
                onToggle={() => setArchiveOpen((open) => !open)}
              />
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

function BudgetBar({
  limit,
  used,
  remaining,
  downgraded,
}: {
  limit: number;
  used: number;
  remaining: number;
  downgraded: number;
}) {
  const { t } = useTranslation();
  const pct = limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0;
  return (
    <View style={{ gap: 7 }}>
      <View style={[s.between, { gap: 8 }]}>
        <Text style={[s.small, { color: colors.text }]}>
          {t("screens.monitorBudgetUsed", { used, limit })}
        </Text>
        <Text style={s.small}>{t("screens.monitorBudgetRemaining", { remaining })}</Text>
      </View>
      <View
        style={{
          height: 6,
          borderRadius: 999,
          backgroundColor: colors.surface,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: pct >= 100 ? colors.orange : colors.primary,
          }}
        />
      </View>
      {downgraded > 0 && (
        <Text style={[s.small, { color: colors.faint }]}>
          {t("screens.monitorBudgetDowngraded", { count: downgraded })}
        </Text>
      )}
    </View>
  );
}

function EventGroup({
  title,
  icon: Icon,
  events,
  pendingId,
  onFeedback,
  collapsed,
  onToggle,
}: {
  title: string;
  icon: IconComponent;
  events: readonly MonitorEvent[];
  pendingId?: string;
  onFeedback: (event: MonitorEvent, reason: "unnecessary" | "useful") => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useTranslation();
  if (!events.length) return null;
  return (
    <View style={{ gap: 2 }}>
      <Pressable
        accessibilityRole={onToggle ? "button" : undefined}
        onPress={onToggle}
        disabled={!onToggle}
        style={[s.row, { gap: 6, paddingVertical: 4 }]}
      >
        <Icon size={13} color={colors.muted} />
        <Text style={[s.label, { fontSize: 11, letterSpacing: 0.8 }]}>{title}</Text>
        <Chip variant="secondary">{events.length}</Chip>
        {onToggle && (
          <Text style={[s.small, { color: colors.link, marginLeft: "auto" }]}>
            {collapsed ? t("screens.monitorShowArchive") : t("screens.monitorHideArchive")}
          </Text>
        )}
      </Pressable>
      {!collapsed &&
        events.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            busy={pendingId === event.id}
            onFeedback={onFeedback}
          />
        ))}
    </View>
  );
}

function EventRow({
  event,
  busy,
  onFeedback,
}: {
  event: MonitorEvent;
  busy: boolean;
  onFeedback: (event: MonitorEvent, reason: "unnecessary" | "useful") => void;
}) {
  const { t } = useTranslation();
  const detail = eventDetail(event);
  return (
    <View
      style={[
        s.row,
        {
          gap: 10,
          paddingVertical: 10,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          alignItems: "flex-start",
        },
      ]}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          marginTop: 6,
          backgroundColor:
            event.severity === "high"
              ? colors.danger
              : event.severity === "medium"
                ? colors.orange
                : colors.faint,
        }}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
          <Text numberOfLines={1} style={[s.text, { fontSize: 12, fontWeight: "600" }]}>
            {eventTitle(event)}
          </Text>
          <Chip variant="outline">{t(KIND_KEYS[event.kind])}</Chip>
          {!!event.market && <Chip variant="outline">{event.market}</Chip>}
        </View>
        <Text numberOfLines={2} style={[s.small, { fontSize: 11, lineHeight: 17 }]}>
          {detail || t("screens.monitorEventDetected", { time: timeLabel(event.detectedAt) })}
        </Text>
        <View style={[s.row, { gap: 6, marginTop: 2 }]}>
          <Text style={[s.small, { fontSize: 10, color: colors.faint }]}>
            {timeLabel(event.lastDetectedAt ?? event.detectedAt)}
          </Text>
          {event.downgraded && (
            <Text style={[s.small, { fontSize: 10, color: colors.faint }]}>
              {t("screens.monitorDowngraded")}
            </Text>
          )}
        </View>
      </View>
      <View style={{ gap: 6, alignItems: "flex-end" }}>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onPress={() => onFeedback(event, "unnecessary")}
        >
          {t("screens.monitorUnnecessary")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onPress={() => onFeedback(event, "useful")}
        >
          {t("screens.monitorUseful")}
        </Button>
      </View>
    </View>
  );
}
