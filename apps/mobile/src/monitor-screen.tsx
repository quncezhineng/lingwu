/**
 * 「盯」规则中心（OPT-01）。
 *
 * 首屏先回答「今天它替我看到什么」：必须知道 / 可以稍后 / 已归档。
 * 规则是第二层：按标的、组合、论点、网页挂事件，并受打扰预算约束。
 */
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Text, TextInput } from "./app-text";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import { Bell, Plus, Target, Trash2 } from "./icons";
import {
  createMonitorRule,
  deleteMonitorRule,
  dismissMonitorEvent,
  loadMonitor,
  MONITOR_EVENT_KINDS,
  MONITOR_LEVELS,
  MONITOR_MARKETS,
  type MonitorEvent,
  type MonitorEventKind,
  type MonitorLevel,
  type MonitorMarket,
  type MonitorRule,
  type MonitorTargetType,
  runMonitorCheck,
  setAttentionBudget,
  updateMonitorRule,
  useMonitorState,
} from "./monitor";
import { space } from "./theme";
import {
  Button,
  Card,
  Chip,
  colors,
  Empty,
  ErrorNotice,
  Field,
  SectionHeading,
  Sheet,
  s,
} from "./ui";
import { useWorkspace } from "./workspace";

const KIND_KEYS: Record<MonitorEventKind, TranslationKey> = {
  PRICE_MOVE: "monitor.kindPrice",
  EARNINGS: "monitor.kindEarnings",
  ANNOUNCEMENT: "monitor.kindAnnouncement",
  DIVIDEND: "monitor.kindDividend",
  HALT: "monitor.kindHalt",
  RATING_CHANGE: "monitor.kindRating",
  NEWS: "monitor.kindNews",
  THESIS_SIGNAL: "monitor.kindThesis",
  PAGE_CHANGE: "monitor.kindPage",
};

const LEVEL_KEYS: Record<MonitorLevel, TranslationKey> = {
  MUST_KNOW: "monitor.levelMustKnow",
  LATER: "monitor.levelLater",
  ARCHIVE: "monitor.levelArchive",
};

const TARGET_KEYS: Record<MonitorTargetType, TranslationKey> = {
  symbol: "monitor.targetSymbol",
  portfolio: "monitor.targetPortfolio",
  thesis: "monitor.targetThesis",
  page: "monitor.targetPage",
};

function SelectChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 34,
        justifyContent: "center",
        paddingHorizontal: 11,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? colors.accentLine : colors.line,
        backgroundColor: selected ? colors.sky : colors.paper,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: selected ? "600" : "500",
          color: selected ? colors.primary : colors.muted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EventCard({ event, onDismiss }: { event: MonitorEvent; onDismiss: () => void }) {
  const { t } = useTranslation();
  const reason =
    event.reason === "attention_budget"
      ? t("monitor.reasonBudget")
      : event.reason === "quiet_hours"
        ? t("monitor.reasonQuiet")
        : event.reason === "non_trading_day"
          ? t("monitor.reasonNonTrading")
          : undefined;
  return (
    <Card style={{ gap: 8 }}>
      <View style={s.between}>
        <View style={[s.row, { gap: 6 }]}>
          <Chip variant="secondary">{t(KIND_KEYS[event.kind])}</Chip>
          {event.state === "downgraded" && (
            <Chip tint={colors.orange}>{t("monitor.downgraded")}</Chip>
          )}
        </View>
        <Text style={s.small}>{timeLabel(event.detectedAt)}</Text>
      </View>
      <Text style={[s.text, { fontSize: 14, fontWeight: "600" }]}>{event.title}</Text>
      {!!event.body && <Text style={s.muted}>{event.body}</Text>}
      {reason && <Text style={s.small}>{reason}</Text>}
      <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
        <Button small onPress={onDismiss}>
          {t("monitor.dismiss")}
        </Button>
      </View>
    </Card>
  );
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function RuleRow({
  rule,
  onToggle,
  onDelete,
}: {
  rule: MonitorRule;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        s.row,
        {
          gap: 10,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
          opacity: rule.enabled ? 1 : 0.62,
        },
      ]}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
          <Text style={[s.text, { fontSize: 14, fontWeight: "600" }]}>
            {rule.name ?? rule.targetId}
          </Text>
          <Chip variant="secondary">{rule.market}</Chip>
        </View>
        <Text style={s.small}>
          {rule.eventKinds.map((kind) => t(KIND_KEYS[kind])).join(" · ")} ·{" "}
          {t(LEVEL_KEYS[rule.level])} ·{" "}
          {t("monitor.cooldownShort", { minutes: rule.cooldownMinutes })}
        </Text>
        {rule.disabledReason && (
          <Text style={[s.small, { color: colors.alertVolumeText }]}>
            {t("monitor.ruleDisabledReason")}
          </Text>
        )}
      </View>
      <Button small onPress={onToggle}>
        {rule.enabled ? t("monitor.pause") : t("monitor.resume")}
      </Button>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("monitor.delete")}
        onPress={onDelete}
        hitSlop={8}
        style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.6 : 1 })}
      >
        <Trash2 size={16} color={colors.faint} />
      </Pressable>
    </View>
  );
}

interface RuleFormState {
  name: string;
  targetType: MonitorTargetType;
  targetId: string;
  market: MonitorMarket;
  eventKinds: MonitorEventKind[];
  level: MonitorLevel;
  cooldownMinutes: string;
  intervalMinutes: string;
  thresholdType: "PRICE_ABOVE" | "PRICE_BELOW" | "CHANGE_PCT";
  thresholdValue: string;
}

const EMPTY_FORM: RuleFormState = {
  name: "",
  targetType: "symbol",
  targetId: "",
  market: "CN",
  eventKinds: ["ANNOUNCEMENT"],
  level: "MUST_KNOW",
  cooldownMinutes: "240",
  intervalMinutes: "5",
  thresholdType: "PRICE_BELOW",
  thresholdValue: "",
};

function RuleForm({ onClose }: { onClose: () => void }) {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const usesPrice = form.eventKinds.includes("PRICE_MOVE");
  const patch = (next: Partial<RuleFormState>) => setForm((current) => ({ ...current, ...next }));

  async function save() {
    setError("");
    const targetId = form.targetId.trim();
    if (!targetId) {
      setError(t("monitor.formTargetRequired"));
      return;
    }
    if (!form.eventKinds.length) {
      setError(t("monitor.formKindsRequired"));
      return;
    }
    const threshold = Number(form.thresholdValue);
    if (usesPrice && (!Number.isFinite(threshold) || threshold <= 0)) {
      setError(t("monitor.formPriceRequired"));
      return;
    }
    setSaving(true);
    try {
      await createMonitorRule(api, {
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        targetType: form.targetType,
        targetId,
        market: form.market,
        eventKinds: form.eventKinds,
        level: form.level,
        cooldownMinutes: Number(form.cooldownMinutes) || 0,
        intervalMinutes: Number(form.intervalMinutes) || 5,
        enabled: true,
        channels: ["in_app"],
        ...(usesPrice
          ? {
              price: {
                thresholdType: form.thresholdType,
                thresholdValue: threshold,
              },
            }
          : {}),
      });
      notify(t("monitor.ruleCreated"));
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  }

  const toggleKind = (kind: MonitorEventKind) =>
    patch({
      eventKinds: form.eventKinds.includes(kind)
        ? form.eventKinds.filter((item) => item !== kind)
        : [...form.eventKinds, kind],
    });

  return (
    <Sheet
      title={t("monitor.formTitle")}
      subtitle={t("monitor.formSubtitle")}
      onClose={onClose}
      medium
    >
      <View style={{ gap: 12 }}>
        <Field
          label={t("monitor.formName")}
          value={form.name}
          onChangeText={(name) => patch({ name })}
          placeholder={t("monitor.formNamePlaceholder")}
        />
        <View style={{ gap: 6 }}>
          <Text style={s.label}>{t("monitor.formTarget")}</Text>
          <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
            {(Object.keys(TARGET_KEYS) as MonitorTargetType[]).map((type) => (
              <SelectChip
                key={type}
                label={t(TARGET_KEYS[type])}
                selected={form.targetType === type}
                onPress={() => patch({ targetType: type })}
              />
            ))}
          </View>
          <TextInput
            value={form.targetId}
            onChangeText={(targetId) => patch({ targetId })}
            placeholder={t("monitor.formTargetPlaceholder")}
            accessibilityLabel={t("monitor.formTarget")}
            style={s.input}
            autoCapitalize="characters"
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={s.label}>{t("monitor.formMarket")}</Text>
          <View style={[s.row, { gap: 6 }]}>
            {MONITOR_MARKETS.map((market) => (
              <SelectChip
                key={market}
                label={market}
                selected={form.market === market}
                onPress={() => patch({ market })}
              />
            ))}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={s.label}>{t("monitor.formKinds")}</Text>
          <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
            {MONITOR_EVENT_KINDS.map((kind) => (
              <SelectChip
                key={kind}
                label={t(KIND_KEYS[kind])}
                selected={form.eventKinds.includes(kind)}
                onPress={() => toggleKind(kind)}
              />
            ))}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={s.label}>{t("monitor.formLevel")}</Text>
          <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
            {MONITOR_LEVELS.map((level) => (
              <SelectChip
                key={level}
                label={t(LEVEL_KEYS[level])}
                selected={form.level === level}
                onPress={() => patch({ level })}
              />
            ))}
          </View>
        </View>
        {usesPrice && (
          <View style={{ gap: 6 }}>
            <Text style={s.label}>{t("monitor.formPrice")}</Text>
            <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
              {(
                [
                  ["PRICE_BELOW", "monitor.priceBelow"],
                  ["PRICE_ABOVE", "monitor.priceAbove"],
                  ["CHANGE_PCT", "monitor.priceChange"],
                ] as const
              ).map(([type, key]) => (
                <SelectChip
                  key={type}
                  label={t(key)}
                  selected={form.thresholdType === type}
                  onPress={() => patch({ thresholdType: type })}
                />
              ))}
            </View>
            <TextInput
              value={form.thresholdValue}
              onChangeText={(thresholdValue) => patch({ thresholdValue })}
              keyboardType="decimal-pad"
              placeholder={t("monitor.formPricePlaceholder")}
              accessibilityLabel={t("monitor.formPrice")}
              style={s.input}
            />
          </View>
        )}
        <View style={[s.row, { gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Field
              label={t("monitor.formCooldown")}
              value={form.cooldownMinutes}
              onChangeText={(cooldownMinutes) => patch({ cooldownMinutes })}
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label={t("monitor.formInterval")}
              value={form.intervalMinutes}
              onChangeText={(intervalMinutes) => patch({ intervalMinutes })}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <Text style={s.small}>{t("monitor.formQuietHint")}</Text>
        <ErrorNotice error={error} />
        <View style={[s.row, { gap: 8, justifyContent: "flex-end" }]}>
          <Button onPress={onClose}>{t("monitor.cancel")}</Button>
          <Button primary busy={saving} onPress={() => void save()}>
            {t("monitor.save")}
          </Button>
        </View>
      </View>
    </Sheet>
  );
}

export function MonitorScreen() {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const state = useMonitorState();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadMonitor(api);
  }, [api]);

  const today = state.today;
  const budget = today?.budget;

  async function changeBudget(delta: number) {
    if (!budget || busy) return;
    const limit = Math.min(10, Math.max(1, budget.limit + delta));
    if (limit === budget.limit) return;
    setBusy(true);
    try {
      await setAttentionBudget(api, limit);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRule(rule: MonitorRule) {
    try {
      await updateMonitorRule(api, rule.id, { enabled: !rule.enabled });
      notify(rule.enabled ? t("monitor.rulePaused") : t("monitor.ruleResumed"));
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeRule(rule: MonitorRule) {
    try {
      await deleteMonitorRule(api, rule.id);
      notify(t("monitor.ruleDeleted"));
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    }
  }

  async function dismiss(event: MonitorEvent) {
    try {
      await dismissMonitorEvent(api, event.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <View style={{ gap: space.md }}>
      <Card style={{ gap: 10 }}>
        <View style={s.between}>
          <View style={[s.row, { gap: 8 }]}>
            <Bell size={18} color={colors.primary} />
            <Text style={[s.text, { fontSize: 16, fontWeight: "600" }]}>
              {t("monitor.budgetTitle")}
            </Text>
          </View>
          <View style={[s.row, { gap: 6 }]}>
            <Button
              small
              onPress={() => void changeBudget(-1)}
              disabled={!budget || budget.limit <= 1}
            >
              −
            </Button>
            <Text style={[s.text, { minWidth: 54, textAlign: "center", fontWeight: "600" }]}>
              {budget ? `${budget.used} / ${budget.limit}` : "—"}
            </Text>
            <Button
              small
              onPress={() => void changeBudget(1)}
              disabled={!budget || budget.limit >= 10}
            >
              +
            </Button>
          </View>
        </View>
        <Text style={s.small}>{t("monitor.budgetHint")}</Text>
        {!!budget?.downgradedCount && (
          <Text style={[s.small, { color: colors.alertVolumeText }]}>
            {t("monitor.budgetDowngraded", { count: budget.downgradedCount })}
          </Text>
        )}
        <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
          <Button
            small
            busy={busy}
            onPress={() => {
              setBusy(true);
              void runMonitorCheck(api)
                .then(() => notify(t("monitor.checkDone")))
                .catch((error) => notify(error instanceof Error ? error.message : String(error)))
                .finally(() => setBusy(false));
            }}
          >
            {t("monitor.checkNow")}
          </Button>
          <Button small primary icon={Plus} onPress={() => setCreating(true)}>
            {t("monitor.newRule")}
          </Button>
        </View>
      </Card>

      <ErrorNotice error={state.error} />

      <View style={{ gap: 10 }}>
        <SectionHeading
          title={t("monitor.mustKnowHeading", { count: today?.mustKnow.length ?? 0 })}
        />
        {today?.mustKnow.length ? (
          today.mustKnow.map((event) => (
            <EventCard key={event.id} event={event} onDismiss={() => void dismiss(event)} />
          ))
        ) : (
          <Empty
            icon={Bell}
            title={t("monitor.emptyMustKnowTitle")}
            detail={t("monitor.emptyMustKnowDetail")}
          />
        )}
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading title={t("monitor.laterHeading", { count: today?.later.length ?? 0 })} />
        {today?.later.length ? (
          today.later.map((event) => (
            <EventCard key={event.id} event={event} onDismiss={() => void dismiss(event)} />
          ))
        ) : (
          <Empty
            icon={Bell}
            title={t("monitor.emptyLaterTitle")}
            detail={t("monitor.emptyLaterDetail")}
          />
        )}
      </View>

      {!!today?.archive.length && (
        <View style={{ gap: 8 }}>
          <SectionHeading title={t("monitor.archiveHeading", { count: today.archive.length })} />
          {today.archive.slice(0, 5).map((event) => (
            <EventCard key={event.id} event={event} onDismiss={() => void dismiss(event)} />
          ))}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <SectionHeading
          title={t("monitor.rulesHeading", { count: today?.rules.length ?? 0 })}
          action={t("monitor.newRule")}
          onPress={() => setCreating(true)}
        />
        {today?.rules.length ? (
          <Card style={{ paddingVertical: 2 }}>
            {today.rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onToggle={() => void toggleRule(rule)}
                onDelete={() => void removeRule(rule)}
              />
            ))}
          </Card>
        ) : (
          <Empty
            icon={Target}
            title={t("monitor.emptyRulesTitle")}
            detail={t("monitor.emptyRulesDetail")}
          />
        )}
      </View>

      {creating && <RuleForm onClose={() => setCreating(false)} />}
    </View>
  );
}

/** Today 卡片：只递上必须知道与可以稍后，归档留在「盯」页。 */
export function MonitorTodayCard({ onOpenAll }: { onOpenAll: () => void }) {
  const { t } = useTranslation();
  const state = useMonitorState();
  const today = state.today;
  const items = [...(today?.mustKnow ?? []), ...(today?.later ?? [])].slice(0, 3);
  return (
    <Card style={{ gap: 10 }}>
      <SectionHeading
        title={t("monitor.todayHeading")}
        action={t("monitor.todayAction")}
        onPress={onOpenAll}
      />
      {items.length ? (
        items.map((event) => (
          <View key={event.id} style={{ gap: 2 }}>
            <View style={[s.row, { gap: 6 }]}>
              <Target
                size={13}
                color={event.level === "MUST_KNOW" ? colors.primary : colors.faint}
              />
              <Text
                style={[s.text, { fontSize: 13, fontWeight: "600", flex: 1 }]}
                numberOfLines={1}
              >
                {event.title}
              </Text>
              <Text style={s.small}>{t(KIND_KEYS[event.kind])}</Text>
            </View>
            {!!event.body && (
              <Text style={[s.small, { marginLeft: 19 }]} numberOfLines={1}>
                {event.body}
              </Text>
            )}
          </View>
        ))
      ) : (
        <Empty
          icon={Bell}
          title={t("monitor.todayEmptyTitle")}
          detail={t("monitor.todayEmptyDetail")}
        />
      )}
    </Card>
  );
}
