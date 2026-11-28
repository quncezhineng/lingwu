import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  CONSENT_CHANNELS,
  CONSENT_DATA_SCOPES,
  CONSENT_FREQUENCIES,
  CONSENT_PURPOSES,
  type Consent,
  type ConsentChannel,
  type ConsentCreateInput,
  type ConsentDataScope,
  type ConsentFrequency,
  type ConsentGate,
  type ConsentPurpose,
  type ConsentUpdateInput,
} from "../../../packages/domain/src/investor";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import { CircleAlert, CircleCheck, Pencil, Plus, ShieldAlert, ShieldCheck, Trash2 } from "./icons";
import { SelectableChipGroup } from "./selectable-chip";
import {
  Button,
  Card,
  Chip,
  colors,
  ErrorNotice,
  Field,
  IconButton,
  SectionHeading,
  Sheet,
  s,
} from "./ui";
import { useWorkspace } from "./workspace";

const DATA_SCOPE_KEYS = {
  portfolio: "investor.dataScope.portfolio",
  holdings: "investor.dataScope.holdings",
  notes: "investor.dataScope.notes",
  thesis: "investor.dataScope.thesis",
  watchlist: "investor.dataScope.watchlist",
  profile: "investor.dataScope.profile",
  market_data: "investor.dataScope.market_data",
} as const;

const PURPOSE_KEYS = {
  research: "investor.purpose.research",
  monitor: "investor.purpose.monitor",
  remind: "investor.purpose.remind",
  external_send: "investor.purpose.external_send",
} as const;

const CHANNEL_KEYS = {
  in_app: "investor.channel.in_app",
  email: "investor.channel.email",
  push: "investor.channel.push",
  webhook: "investor.channel.webhook",
} as const;

const FREQUENCY_KEYS = {
  realtime: "investor.frequency.realtime",
  daily: "investor.frequency.daily",
  weekly: "investor.frequency.weekly",
  manual_only: "investor.frequency.manual_only",
} as const;

function defaultTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  } catch {
    return "Asia/Shanghai";
  }
}

const dateOnly = (value: string) => value.slice(0, 10);

/**
 * A3 授权中心：五维授权（数据类别 / 用途 / 渠道 / 频率 / 有效期）的增删改查，
 * 以及当前免打扰门槛的直接展示。
 *
 * 撤回即停：撤回后不再参与判定；删除则彻底移除记录（PRD A3）。
 */
export function ConsentCenterScreen() {
  const { t } = useTranslation();
  const { api, notify } = useWorkspace();
  const [consents, setConsents] = useState<Consent[]>();
  const [gate, setGate] = useState<ConsentGate>();
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingAction, setPendingAction] = useState<{
    id: string;
    kind: "revoke" | "delete";
  } | null>(null);

  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [dataScope, setDataScope] = useState<ConsentDataScope[]>(["market_data"]);
  const [purposes, setPurposes] = useState<ConsentPurpose[]>(["research"]);
  const [channels, setChannels] = useState<ConsentChannel[]>(["in_app"]);
  const [frequency, setFrequency] = useState<ConsentFrequency>("manual_only");
  const [validTo, setValidTo] = useState("");
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");
  const [quietZone, setQuietZone] = useState(defaultTimeZone());
  const [cap, setCap] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [nextConsents, nextGate] = await Promise.all([
        api.request<Consent[]>("/api/investor/consents"),
        api.request<ConsentGate>("/api/investor/consents/gate"),
      ]);
      setConsents(nextConsents);
      setGate(nextGate);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setDataScope(["market_data"]);
    setPurposes(["research"]);
    setChannels(["in_app"]);
    setFrequency("manual_only");
    setValidTo("");
    setQuietEnabled(false);
    setQuietStart("22:00");
    setQuietEnd("07:00");
    setQuietZone(defaultTimeZone());
    setCap("");
    setEditorError("");
    setEditing(true);
  }, []);

  const openEdit = useCallback((consent: Consent) => {
    setEditingId(consent.id);
    setDataScope(consent.dataScope);
    setPurposes(consent.purposes);
    setChannels(consent.channels);
    setFrequency(consent.frequency);
    setValidTo(consent.validTo ? dateOnly(consent.validTo) : "");
    setQuietEnabled(!!consent.quietHours);
    setQuietStart(consent.quietHours?.start ?? "22:00");
    setQuietEnd(consent.quietHours?.end ?? "07:00");
    setQuietZone(consent.quietHours?.timeZone ?? defaultTimeZone());
    setCap(consent.dailyPushCap === undefined ? "" : String(consent.dailyPushCap));
    setEditorError("");
    setEditing(true);
  }, []);

  async function save() {
    if (saving) return;
    if (!dataScope.length || !purposes.length || !channels.length) {
      setEditorError(t("investor.consentDimensionRequired"));
      return;
    }
    const quietHours = quietEnabled
      ? { start: quietStart.trim(), end: quietEnd.trim(), timeZone: quietZone.trim() }
      : null;
    const dailyPushCap = cap.trim() ? Number(cap) : null;
    const validToValue = validTo.trim() ? `${validTo.trim()}T00:00:00.000Z` : null;
    setSaving(true);
    setEditorError("");
    try {
      if (editingId) {
        const input: ConsentUpdateInput = {
          dataScope,
          purposes,
          channels,
          frequency,
          validTo: validToValue,
          quietHours,
          dailyPushCap,
        };
        await api.request<Consent>(`/api/investor/consents/${editingId}`, input, "PATCH");
      } else {
        const input: ConsentCreateInput = {
          dataScope,
          purposes,
          channels,
          frequency,
          validTo: validToValue,
          quietHours,
          dailyPushCap,
        };
        await api.request<Consent>("/api/investor/consents", input, "POST");
      }
      setEditing(false);
      notify(t("investor.consentSaved"));
      setReloadKey((key) => key + 1);
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function runAction(id: string, kind: "revoke" | "delete") {
    setError("");
    try {
      if (kind === "revoke") {
        await api.request<Consent>(`/api/investor/consents/${id}/revoke`, {}, "POST");
        notify(t("investor.consentRevoked"));
      } else {
        await api.request(`/api/investor/consents/${id}`, undefined, "DELETE");
        notify(t("investor.consentDeleted"));
      }
      setPendingAction(null);
      setReloadKey((key) => key + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!consents && !error)
    return (
      <View style={{ alignItems: "center", padding: 40, gap: 13 }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  if (!consents)
    return (
      <View style={{ gap: 12 }}>
        <ErrorNotice error={error} />
        <Button onPress={() => void load()}>{t("common.tryAgain")}</Button>
      </View>
    );

  return (
    <View style={{ gap: 20 }}>
      <Text style={s.muted}>{t("investor.consentsIntro")}</Text>

      {gate ? (
        <Card variant="muted" style={{ gap: 6 }}>
          <View style={[s.row, { gap: 8 }]}>
            {gate.quiet || !gate.remind ? (
              <ShieldAlert size={16} color={colors.alertVolumeText} />
            ) : (
              <ShieldCheck size={16} color={colors.success} />
            )}
            <Text style={[s.text, { fontWeight: "600" }]}>
              {gate.configured
                ? gate.quiet
                  ? t("investor.gateQuiet")
                  : gate.remind
                    ? t("investor.gateCanPush")
                    : t("investor.gateNoRemind")
                : t("investor.gateNotConfigured")}
            </Text>
          </View>
          <Text style={s.small}>
            {t("investor.gateRemaining", { remaining: gate.remaining, cap: gate.dailyPushCap })}
          </Text>
          {gate.reasons.map((reason) => (
            <Text key={reason} style={s.small}>
              {reason}
            </Text>
          ))}
        </Card>
      ) : null}

      <ErrorNotice error={error} />

      <View style={{ gap: 10 }}>
        <SectionHeading
          title={t("investor.consentsTitle")}
          count={consents.length}
          actions={
            <Button small icon={Plus} onPress={openCreate}>
              {t("investor.consentNew")}
            </Button>
          }
        />
        {consents.length === 0 ? (
          <Text style={s.small}>{t("investor.consentsEmpty")}</Text>
        ) : (
          consents.map((consent) => {
            const revoked = !!consent.revokedAt;
            const pending = pendingAction?.id === consent.id ? pendingAction.kind : null;
            return (
              <Card key={consent.id} style={{ gap: 8 }}>
                <View style={[s.between, { gap: 8 }]}>
                  <View style={[s.row, { gap: 8, flex: 1 }]}>
                    {revoked ? (
                      <CircleAlert size={16} color={colors.muted} />
                    ) : (
                      <CircleCheck size={16} color={colors.success} />
                    )}
                    <Text style={[s.text, { fontWeight: "500" }]}>
                      {t("investor.consentFrequencyLabel", {
                        frequency: t(FREQUENCY_KEYS[consent.frequency]),
                      })}
                    </Text>
                  </View>
                  <Chip variant={revoked ? "secondary" : "outline"}>
                    {revoked ? t("investor.consentRevokedBadge") : t("investor.consentActive")}
                  </Chip>
                </View>
                <Text style={s.small}>
                  {consent.dataScope.map((scope) => t(DATA_SCOPE_KEYS[scope])).join("、")}
                </Text>
                <Text style={s.small}>
                  {consent.purposes.map((purpose) => t(PURPOSE_KEYS[purpose])).join("、")}
                </Text>
                <Text style={s.small}>
                  {consent.channels.map((channel) => t(CHANNEL_KEYS[channel])).join("、")}
                </Text>
                <Text style={s.small}>
                  {consent.validTo
                    ? t("investor.consentValidTo", { date: dateOnly(consent.validTo) })
                    : t("investor.consentNoExpiry")}
                </Text>
                {consent.dailyPushCap !== undefined ? (
                  <Text style={s.small}>
                    {t("investor.consentDailyCapValue", { cap: consent.dailyPushCap })}
                  </Text>
                ) : null}
                {pending ? (
                  <Card variant="muted" style={{ gap: 8 }}>
                    <Text style={[s.text, { fontWeight: "500", color: colors.danger }]}>
                      {pending === "revoke"
                        ? t("investor.consentRevokeConfirm")
                        : t("investor.consentDeleteConfirm")}
                    </Text>
                    <Text style={s.small}>
                      {pending === "revoke"
                        ? t("investor.consentRevokeNote")
                        : t("investor.consentDeleteNote")}
                    </Text>
                    <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                      <Button small danger onPress={() => void runAction(consent.id, pending)}>
                        {t("investor.consentConfirmAction")}
                      </Button>
                      <Button small onPress={() => setPendingAction(null)}>
                        {t("common.cancel")}
                      </Button>
                    </View>
                  </Card>
                ) : (
                  <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                    <Button small icon={Pencil} onPress={() => openEdit(consent)}>
                      {t("investor.consentEdit")}
                    </Button>
                    {!revoked ? (
                      <Button
                        small
                        icon={ShieldAlert}
                        onPress={() => setPendingAction({ id: consent.id, kind: "revoke" })}
                      >
                        {t("investor.consentRevoke")}
                      </Button>
                    ) : null}
                    <IconButton
                      icon={Trash2}
                      label={t("investor.consentDelete")}
                      onPress={() => setPendingAction({ id: consent.id, kind: "delete" })}
                    />
                  </View>
                )}
              </Card>
            );
          })
        )}
      </View>

      {editing ? (
        <Sheet
          title={editingId ? t("investor.consentEditTitle") : t("investor.consentCreateTitle")}
          onClose={() => setEditing(false)}
          medium
        >
          <View style={{ gap: 14 }}>
            <View style={{ gap: 8 }}>
              <Text style={s.fieldLabel}>{t("investor.consentDataScope")}</Text>
              <SelectableChipGroup
                options={CONSENT_DATA_SCOPES.map((value) => ({
                  value,
                  label: t(DATA_SCOPE_KEYS[value]),
                }))}
                value={dataScope}
                onChange={setDataScope}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={s.fieldLabel}>{t("investor.consentPurposes")}</Text>
              <SelectableChipGroup
                options={CONSENT_PURPOSES.map((value) => ({
                  value,
                  label: t(PURPOSE_KEYS[value]),
                }))}
                value={purposes}
                onChange={setPurposes}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={s.fieldLabel}>{t("investor.consentChannels")}</Text>
              <SelectableChipGroup
                options={CONSENT_CHANNELS.map((value) => ({
                  value,
                  label: t(CHANNEL_KEYS[value]),
                }))}
                value={channels}
                onChange={setChannels}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={s.fieldLabel}>{t("investor.consentFrequency")}</Text>
              <SelectableChipGroup
                multiple={false}
                options={CONSENT_FREQUENCIES.map((value) => ({
                  value,
                  label: t(FREQUENCY_KEYS[value]),
                }))}
                value={[frequency]}
                onChange={(next) => setFrequency(next[0] ?? "manual_only")}
              />
            </View>
            <Field
              label={t("investor.consentValidToLabel")}
              value={validTo}
              onChangeText={setValidTo}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
            />
            <Button
              small
              variant={quietEnabled ? "default" : "outline"}
              icon={quietEnabled ? CircleCheck : CircleAlert}
              onPress={() => setQuietEnabled((current) => !current)}
              style={{ alignSelf: "flex-start" }}
            >
              {t("investor.consentQuietToggle")}
            </Button>
            {quietEnabled ? (
              <View style={[s.row, { gap: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t("investor.consentQuietStart")}
                    value={quietStart}
                    onChangeText={setQuietStart}
                    placeholder="22:00"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t("investor.consentQuietEnd")}
                    value={quietEnd}
                    onChangeText={setQuietEnd}
                    placeholder="07:00"
                  />
                </View>
              </View>
            ) : null}
            {quietEnabled ? (
              <Field
                label={t("investor.consentQuietZone")}
                value={quietZone}
                onChangeText={setQuietZone}
                maxLength={60}
                autoCapitalize="none"
              />
            ) : null}
            <Field
              label={t("investor.consentDailyCapLabel")}
              value={cap}
              onChangeText={setCap}
              keyboardType="numeric"
              placeholder={t("investor.consentCapUnset")}
            />
            <ErrorNotice error={editorError} />
            <View style={[s.row, { gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }]}>
              <Button small onPress={() => setEditing(false)}>
                {t("common.cancel")}
              </Button>
              <Button small primary busy={saving} onPress={() => void save()}>
                {t("investor.consentSave")}
              </Button>
            </View>
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}
