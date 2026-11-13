/**
 * 监控规则中心：今日打扰预算、规则 CRUD、暂停/恢复，以及
 * market / level / cooldown / 静默期 / 投递通道配置。
 */
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import type { LingWuApi } from "./api";
import { Text, TextInput } from "./app-text";
import type { TranslationKey } from "./i18n";
import { useTranslation } from "./i18n";
import { Pause, Play, Plus, RefreshCw, Settings2, Trash2 } from "./icons";
import {
  buildMonitorRuleInput,
  controlMonitorRule,
  createMonitorRule,
  type DeliveryChannel,
  deleteMonitorRule,
  draftMonitorRule,
  loadMonitorRules,
  loadMonitors,
  MONITOR_EVENT_KINDS,
  type MonitorEventKind,
  type MonitorLevel,
  type MonitorMarket,
  type MonitorRule,
  type MonitorRuleInput,
  type MonitorRuleValidation,
  quietHoursSummary,
  ruleThresholdSummary,
  setAttentionBudget,
  THRESHOLD_KINDS,
  type ThresholdField,
  toggleValue,
  updateMonitorRule,
  useMonitorsState,
} from "./monitors";
import { Button, Card, Chip, colors, Empty, ErrorNotice, SectionHeading, s } from "./ui";
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

const CHANNEL_KEYS: Record<DeliveryChannel, TranslationKey> = {
  apns: "screens.rulesChannelApns",
  fcm: "screens.rulesChannelFcm",
  email: "screens.rulesChannelEmail",
  wecom: "screens.rulesChannelWecom",
};

const LEVEL_KEYS: Record<MonitorLevel, TranslationKey> = {
  MUST_KNOW: "screens.monitorGroupMustKnow",
  LATER: "screens.monitorGroupLater",
  ARCHIVE: "screens.monitorGroupArchive",
};

const THRESHOLD_KEYS: Record<ThresholdField, TranslationKey> = {
  priceAbove: "screens.rulesThresholdPriceAbove",
  priceBelow: "screens.rulesThresholdPriceBelow",
  changePct: "screens.rulesThresholdChangePct",
  volumeMultiplier: "screens.rulesThresholdVolume",
  volatilityPct: "screens.rulesThresholdVolatility",
};

const ALL_CHANNELS: readonly DeliveryChannel[] = ["apns", "fcm", "email", "wecom"];
const ALL_LEVELS: readonly MonitorLevel[] = ["MUST_KNOW", "LATER", "ARCHIVE"];
const MARKETS: readonly MonitorMarket[] = ["CN", "HK", "US"];

const VALIDATION_KEYS: Record<MonitorRuleValidation, TranslationKey> = {
  target: "screens.rulesValidationTarget",
  kinds: "screens.rulesValidationKinds",
  channels: "screens.rulesValidationChannels",
  cooldown: "screens.rulesValidationCooldown",
  interval: "screens.rulesValidationInterval",
  quiet: "screens.rulesValidationQuiet",
  threshold: "screens.rulesThresholdRequired",
};

export function MonitorRulesScreen() {
  const { api, notify, navigate } = useWorkspace();
  const { t } = useTranslation();
  const state = useMonitorsState();
  const [editing, setEditing] = useState<MonitorRule | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [limitDraft, setLimitDraft] = useState("5");
  const [limitBusy, setLimitBusy] = useState(false);

  useEffect(() => {
    void loadMonitorRules(api);
    void loadMonitors(api);
  }, [api]);

  useEffect(() => {
    if (state.today) setLimitDraft(String(state.today.budget.limit));
  }, [state.today]);

  async function saveLimit() {
    const limit = Number.parseInt(limitDraft, 10);
    if (!Number.isFinite(limit) || limit < 1 || limit > 10) {
      notify(t("screens.rulesValidationBudget"));
      return;
    }
    setLimitBusy(true);
    try {
      await setAttentionBudget(api, limit);
      void loadMonitors(api, true);
      notify(t("screens.rulesBudgetSaved"));
    } catch {
      notify(t("screens.rulesSaveFailed"));
    } finally {
      setLimitBusy(false);
    }
  }

  async function control(rule: MonitorRule) {
    setBusyId(rule.id);
    try {
      await controlMonitorRule(api, rule.id, rule.enabled ? "pause" : "resume");
      void loadMonitors(api, true);
      notify(rule.enabled ? t("screens.rulesPaused") : t("screens.rulesResumed"));
    } catch {
      notify(t("screens.rulesSaveFailed"));
    } finally {
      setBusyId(undefined);
    }
  }

  async function remove(rule: MonitorRule) {
    if (confirmDelete !== rule.id) {
      setConfirmDelete(rule.id);
      return;
    }
    setBusyId(rule.id);
    try {
      await deleteMonitorRule(api, rule.id);
      void loadMonitors(api, true);
      setConfirmDelete(undefined);
      if (editing === rule) setEditing(null);
      notify(t("screens.rulesDeleted"));
    } catch {
      notify(t("screens.rulesSaveFailed"));
    } finally {
      setBusyId(undefined);
    }
  }

  const rules = state.rules;
  const limit = state.today?.budget.limit ?? 5;
  const used = state.today?.budget.used ?? 0;

  return (
    <View style={{ gap: 16 }}>
      <Card variant="muted">
        <SectionHeading title={t("screens.rulesBudgetHeading")} />
        <Text style={[s.small, { marginBottom: 10 }]}>
          {t("screens.rulesBudgetHint", { limit })}
        </Text>
        <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
          <Text style={[s.small, { color: colors.text }]}>
            {t("screens.rulesBudgetUsed", { used, limit })}
          </Text>
          <TextInput
            value={limitDraft}
            onChangeText={setLimitDraft}
            keyboardType="number-pad"
            style={[s.input, { width: 64 }]}
            accessibilityLabel={t("screens.rulesBudgetHeading")}
          />
          <Button small busy={limitBusy} onPress={() => void saveLimit()}>
            {t("screens.rulesBudgetSave")}
          </Button>
        </View>
      </Card>

      <View style={[s.between, { gap: 8, flexWrap: "wrap" }]}>
        <View>
          <Text style={[s.heading, { fontSize: 16 }]}>{t("screens.rulesHeading")}</Text>
          <Text style={s.small}>{t("screens.rulesSubtitle")}</Text>
        </View>
        <Button primary icon={Plus} onPress={() => setEditing(editing === "new" ? null : "new")}>
          {t("screens.rulesNew")}
        </Button>
      </View>

      {state.error && <ErrorNotice error={state.error} />}

      {editing === "new" && (
        <RuleEditor
          onCancel={() => setEditing(null)}
          onSaved={() => setEditing(null)}
          onNotify={notify}
          api={api}
        />
      )}

      {rules.length === 0 ? (
        <Card>
          <Empty
            icon={Settings2}
            title={t("screens.rulesEmptyTitle")}
            detail={t("screens.rulesEmptyDetail")}
          />
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {rules.map((rule) => (
            <Card key={rule.id}>
              <View style={[s.between, { gap: 10, flexWrap: "wrap" }]}>
                <View style={{ flex: 1, minWidth: 180, gap: 4 }}>
                  <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
                    <Text style={[s.text, { fontSize: 13, fontWeight: "600" }]}>
                      {rule.title || rule.targetId}
                    </Text>
                    <Chip variant="outline">{t(LEVEL_KEYS[rule.level])}</Chip>
                    <Chip variant="outline">{rule.market ?? t("screens.rulesMarketAuto")}</Chip>
                    {!rule.enabled && (
                      <Chip tint={colors.surface}>{t("screens.rulesDisabled")}</Chip>
                    )}
                  </View>
                  <Text style={s.small}>
                    {t("screens.rulesTargetLabel", {
                      type:
                        rule.targetType === "portfolio"
                          ? t("screens.rulesTargetPortfolio")
                          : t("screens.rulesTargetSymbol"),
                      id: rule.targetId,
                    })}
                  </Text>
                  <Text style={[s.small, { fontSize: 11 }]}>
                    {rule.eventKinds.map((kind) => t(KIND_KEYS[kind])).join(" · ")}
                    {ruleThresholdSummary(rule) ? ` · ${ruleThresholdSummary(rule)}` : ""}
                  </Text>
                  <Text style={[s.small, { fontSize: 11, color: colors.faint }]}>
                    {t("screens.rulesCooldownShort", { minutes: rule.cooldownMinutes })}
                    {" · "}
                    {quietHoursSummary(rule)
                      ? t("screens.rulesQuietSummary", {
                          start: quietHoursSummary(rule).split("–")[0],
                          end: quietHoursSummary(rule).split("–")[1],
                        })
                      : t("screens.rulesQuietClosed")}
                    {" · "}
                    {rule.channels.map((channel) => t(CHANNEL_KEYS[channel])).join("/")}
                  </Text>
                  {rule.lastError && (
                    <Text style={[s.small, { fontSize: 11, color: colors.danger }]}>
                      {rule.lastError}
                    </Text>
                  )}
                </View>
                <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
                  <Button
                    small
                    icon={rule.enabled ? Pause : Play}
                    busy={busyId === rule.id}
                    onPress={() => void control(rule)}
                  >
                    {rule.enabled ? t("screens.rulesPause") : t("screens.rulesResume")}
                  </Button>
                  <Button small onPress={() => setEditing(rule)}>
                    {t("screens.rulesEdit")}
                  </Button>
                  <Button
                    small
                    variant="destructive"
                    icon={Trash2}
                    busy={busyId === rule.id}
                    onPress={() => void remove(rule)}
                  >
                    {confirmDelete === rule.id
                      ? t("screens.rulesDeleteConfirm")
                      : t("screens.rulesDelete")}
                  </Button>
                </View>
              </View>
              {editing !== "new" && editing?.id === rule.id && (
                <View style={{ marginTop: 14 }}>
                  <RuleEditor
                    rule={rule}
                    onCancel={() => setEditing(null)}
                    onSaved={() => setEditing(null)}
                    onNotify={notify}
                    api={api}
                  />
                </View>
              )}
            </Card>
          ))}
        </View>
      )}

      <View style={[s.row, { gap: 8 }]}>
        <Button
          small
          icon={RefreshCw}
          onPress={() => {
            void loadMonitorRules(api, true);
            void loadMonitors(api, true);
          }}
        >
          {t("screens.monitorRetry")}
        </Button>
        <Button small variant="ghost" onPress={() => navigate("today")}>
          {t("screens.rulesBackToday")}
        </Button>
      </View>
    </View>
  );
}

function RuleEditor({
  api,
  rule,
  onSaved,
  onCancel,
  onNotify,
}: {
  api: LingWuApi;
  rule?: MonitorRule;
  onSaved: () => void;
  onCancel: () => void;
  onNotify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => draftMonitorRule(rule));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const create = !rule;

  function patch(next: Partial<typeof draft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function patchThreshold(field: ThresholdField, value: string) {
    setDraft((current) => ({
      ...current,
      thresholds: { ...current.thresholds, [field]: value },
    }));
  }

  async function save() {
    const result = buildMonitorRuleInput(draft, create);
    if ("error" in result) {
      setError(
        result.error === "threshold"
          ? t(VALIDATION_KEYS.threshold, {
              kind: result.kind ? t(KIND_KEYS[result.kind]) : "",
            })
          : t(VALIDATION_KEYS[result.error]),
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      if (create) await createMonitorRule(api, result.input as MonitorRuleInput);
      else await updateMonitorRule(api, rule.id, result.input);
      void loadMonitors(api, true);
      onNotify(create ? t("screens.rulesCreated") : t("screens.rulesUpdated"));
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("screens.rulesSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeading title={create ? t("screens.rulesNew") : t("screens.rulesEdit")} />
      <View style={{ gap: 10 }}>
        <Field label={t("screens.rulesFieldTitle")}>
          <TextInput
            value={draft.title}
            onChangeText={(value) => patch({ title: value })}
            style={s.input}
            placeholder={t("screens.rulesTitlePlaceholder")}
          />
        </Field>
        {create && (
          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>{t("screens.rulesFieldTargetType")}</Text>
            <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
              {(["symbol", "portfolio"] as const).map((targetType) => (
                <Choice
                  key={targetType}
                  active={draft.targetType === targetType}
                  onPress={() => patch({ targetType })}
                >
                  {targetType === "symbol"
                    ? t("screens.rulesTargetSymbol")
                    : t("screens.rulesTargetPortfolio")}
                </Choice>
              ))}
            </View>
          </View>
        )}
        {create && (
          <Field label={t("screens.rulesFieldTargetId")}>
            <TextInput
              value={draft.targetId}
              onChangeText={(value) => patch({ targetId: value })}
              style={s.input}
              autoCapitalize="characters"
              placeholder={draft.targetType === "symbol" ? "AAPL" : "portfolio-id"}
            />
          </Field>
        )}
        <View style={{ gap: 6 }}>
          <Text style={s.fieldLabel}>{t("screens.rulesFieldMarket")}</Text>
          <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
            <Choice active={draft.market === ""} onPress={() => patch({ market: "" })}>
              {t("screens.rulesMarketAuto")}
            </Choice>
            {MARKETS.map((market) => (
              <Choice
                key={market}
                active={draft.market === market}
                onPress={() => patch({ market })}
              >
                {market}
              </Choice>
            ))}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={s.fieldLabel}>{t("screens.rulesFieldLevel")}</Text>
          <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
            {ALL_LEVELS.map((level) => (
              <Choice key={level} active={draft.level === level} onPress={() => patch({ level })}>
                {t(LEVEL_KEYS[level])}
              </Choice>
            ))}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={s.fieldLabel}>{t("screens.rulesFieldKinds")}</Text>
          <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
            {MONITOR_EVENT_KINDS.map((kind) => (
              <Choice
                key={kind}
                active={draft.kinds.includes(kind)}
                onPress={() => patch({ kinds: toggleValue(draft.kinds, kind) })}
              >
                {t(KIND_KEYS[kind])}
              </Choice>
            ))}
          </View>
        </View>
        {draft.kinds.map((kind) => {
          const field = THRESHOLD_KINDS[kind as keyof typeof THRESHOLD_KINDS] as
            | ThresholdField
            | undefined;
          if (!field) return null;
          return (
            <Field key={kind} label={t(THRESHOLD_KEYS[field])}>
              <TextInput
                value={draft.thresholds[field]}
                onChangeText={(value) => patchThreshold(field, value)}
                keyboardType="decimal-pad"
                style={s.input}
              />
            </Field>
          );
        })}
        <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
          <Field label={t("screens.rulesFieldCooldown")}>
            <TextInput
              value={draft.cooldown}
              onChangeText={(value) => patch({ cooldown: value })}
              keyboardType="number-pad"
              style={[s.input, { width: 90 }]}
            />
          </Field>
          <Field label={t("screens.rulesFieldInterval")}>
            <TextInput
              value={draft.interval}
              onChangeText={(value) => patch({ interval: value })}
              keyboardType="number-pad"
              style={[s.input, { width: 90 }]}
            />
          </Field>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={s.fieldLabel}>{t("screens.rulesFieldQuiet")}</Text>
          <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
            <Choice active={draft.quietEnabled} onPress={() => patch({ quietEnabled: true })}>
              {t("screens.rulesQuietOn")}
            </Choice>
            <Choice active={!draft.quietEnabled} onPress={() => patch({ quietEnabled: false })}>
              {t("screens.rulesQuietOff")}
            </Choice>
          </View>
          {draft.quietEnabled && (
            <View style={[s.row, { gap: 10, marginTop: 4 }]}>
              <Field label={t("screens.rulesQuietStart")}>
                <TextInput
                  value={draft.quietStart}
                  onChangeText={(value) => patch({ quietStart: value })}
                  keyboardType="number-pad"
                  style={[s.input, { width: 72 }]}
                />
              </Field>
              <Field label={t("screens.rulesQuietEnd")}>
                <TextInput
                  value={draft.quietEnd}
                  onChangeText={(value) => patch({ quietEnd: value })}
                  keyboardType="number-pad"
                  style={[s.input, { width: 72 }]}
                />
              </Field>
            </View>
          )}
        </View>
        <View style={{ gap: 6 }}>
          <Text style={s.fieldLabel}>{t("screens.rulesFieldChannels")}</Text>
          <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
            {ALL_CHANNELS.map((channel) => (
              <Choice
                key={channel}
                active={draft.channels.includes(channel)}
                onPress={() => patch({ channels: toggleValue(draft.channels, channel) })}
              >
                {t(CHANNEL_KEYS[channel])}
              </Choice>
            ))}
          </View>
        </View>
        {error && <ErrorNotice error={error} />}
        <View style={[s.row, { gap: 8, marginTop: 4 }]}>
          <Button primary busy={busy} onPress={() => void save()}>
            {create ? t("screens.rulesCreate") : t("screens.rulesSave")}
          </Button>
          <Button variant="ghost" onPress={onCancel}>
            {t("screens.rulesCancel")}
          </Button>
        </View>
      </View>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Choice({
  active,
  onPress,
  children,
}: {
  active: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        {
          paddingHorizontal: 9,
          paddingVertical: 5,
          backgroundColor: active ? colors.sky : colors.paper,
          borderColor: active ? colors.primary : colors.line,
        },
        pressed && { backgroundColor: colors.overlay1 },
      ]}
    >
      <Text style={[s.chipText, active && { color: colors.primaryStrong }]}>{children}</Text>
    </Pressable>
  );
}
