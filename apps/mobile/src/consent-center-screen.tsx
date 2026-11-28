/**
 * A3 授权中心（PRD-灵悟-主动服务与信任架构）。
 *
 * 每条授权回答四件事：能用哪些数据（scope）、用来做什么（purpose）、走什么渠道
 * （channel）、多久一次（frequency）；是否「长期有效」也在卡片上明说。
 * 顶部再给出今天的投放结论（ConsentGate）：是否有提醒授权 / 是否在免打扰 /
 * 今日是否已达推送上限——这三条正是事件判级做降级（push→feed）的依据。
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  CONSENT_CHANNELS,
  CONSENT_DATA_SCOPES,
  CONSENT_FREQUENCIES,
  CONSENT_PURPOSES,
  type Consent,
  type ConsentChannel,
  type ConsentDataScope,
  type ConsentFrequency,
  type ConsentGate,
  type ConsentPurpose,
  DEFAULT_DAILY_PUSH_CAP,
} from "../../../packages/domain/src/investor";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import { CircleAlert, Pencil, Plus, ShieldAlert, ShieldCheck, Trash2 } from "./icons";
import { SelectableChip } from "./selectable-chip";
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
  space,
} from "./ui";
import { useWorkspace } from "./workspace";

const SCOPE_KEYS: Record<ConsentDataScope, TranslationKey> = {
  portfolio: "investor.scope.portfolio",
  holdings: "investor.scope.holdings",
  notes: "investor.scope.notes",
  thesis: "investor.scope.thesis",
  watchlist: "investor.scope.watchlist",
  profile: "investor.scope.profile",
  market_data: "investor.scope.market_data",
};

const PURPOSE_KEYS: Record<ConsentPurpose, TranslationKey> = {
  research: "investor.purpose.research",
  monitor: "investor.purpose.monitor",
  remind: "investor.purpose.remind",
  external_send: "investor.purpose.external_send",
};

const CHANNEL_KEYS: Record<ConsentChannel, TranslationKey> = {
  in_app: "investor.channel.in_app",
  email: "investor.channel.email",
  push: "investor.channel.push",
  webhook: "investor.channel.webhook",
};

const FREQUENCY_KEYS: Record<ConsentFrequency, TranslationKey> = {
  realtime: "investor.frequency.realtime",
  daily: "investor.frequency.daily",
  weekly: "investor.frequency.weekly",
  manual_only: "investor.frequency.manual_only",
};

function defaultTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  } catch {
    return "Asia/Shanghai";
  }
}

function InfoRow({ label, value, divided }: { label: string; value: string; divided?: boolean }) {
  return (
    <View
      style={[
        s.row,
        { justifyContent: "space-between", gap: space.sm, paddingVertical: space.tight },
        divided && { borderTopWidth: 1, borderTopColor: colors.line },
      ]}
    >
      <Text style={s.small}>{label}</Text>
      <Text style={[s.text, { flexShrink: 1, textAlign: "right" }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function labels<T extends string>(
  items: T[],
  keys: Record<T, TranslationKey>,
  t: (key: TranslationKey) => string,
) {
  return items.map((item) => t(keys[item])).join(" · ");
}

// ─── 新增 / 编辑授权 ───

function ConsentEditorSheet({
  initial,
  onClose,
  onSaved,
}: {
  initial: Consent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const [scopes, setScopes] = useState<ConsentDataScope[]>(initial?.dataScope ?? ["portfolio"]);
  const [purposes, setPurposes] = useState<ConsentPurpose[]>(
    initial?.purposes ?? ["monitor", "remind"],
  );
  const [channels, setChannels] = useState<ConsentChannel[]>(
    initial?.channels ?? ["in_app", "push"],
  );
  const [frequency, setFrequency] = useState<ConsentFrequency>(initial?.frequency ?? "daily");
  const [validTo, setValidTo] = useState(initial?.validTo ? initial.validTo.slice(0, 10) : "");
  const [quietOn, setQuietOn] = useState(Boolean(initial?.quietHours));
  const [quietStart, setQuietStart] = useState(initial?.quietHours?.start ?? "22:00");
  const [quietEnd, setQuietEnd] = useState(initial?.quietHours?.end ?? "08:00");
  const [quietZone, setQuietZone] = useState(initial?.quietHours?.timeZone ?? defaultTimeZone());
  const [cap, setCap] = useState(
    initial?.dailyPushCap !== undefined ? String(initial.dailyPushCap) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  async function save() {
    if (saving) return;
    if (scopes.length === 0 || purposes.length === 0 || channels.length === 0) {
      setError(t("investor.atLeastOnePerGroup"));
      return;
    }
    if (quietOn && (!timePattern.test(quietStart) || !timePattern.test(quietEnd))) {
      setError(t("investor.quietHoursInvalid"));
      return;
    }
    const capValue = cap.trim() === "" ? undefined : Number(cap);
    if (capValue !== undefined && (!Number.isInteger(capValue) || capValue < 1 || capValue > 10)) {
      setError(t("investor.capHint"));
      return;
    }
    const validToIso = validTo.trim() === "" ? null : new Date(validTo.trim()).toISOString();
    if (validTo.trim() !== "" && Number.isNaN(new Date(validTo.trim()).getTime())) {
      setError(t("investor.consentSaveFailed"));
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (initial) {
        await api.request<Consent>(
          `/api/investor/consents/${initial.id}`,
          {
            dataScope: scopes,
            purposes,
            channels,
            frequency,
            validTo: validToIso,
            quietHours: quietOn ? { start: quietStart, end: quietEnd, timeZone: quietZone } : null,
            dailyPushCap: capValue ?? null,
          },
          "PUT",
        );
      } else {
        await api.request<Consent>(
          "/api/investor/consents",
          {
            dataScope: scopes,
            purposes,
            channels,
            frequency,
            ...(validToIso ? { validTo: validToIso } : {}),
            ...(quietOn
              ? { quietHours: { start: quietStart, end: quietEnd, timeZone: quietZone } }
              : {}),
            ...(capValue !== undefined ? { dailyPushCap: capValue } : {}),
          },
          "POST",
        );
      }
      notify(t("investor.consentSaved"));
      onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title={initial ? t("investor.editConsent") : t("investor.newConsent")} onClose={onClose}>
      <View style={{ gap: space.md }}>
        <View style={{ gap: space.xs }}>
          <Text style={s.fieldLabel}>{t("investor.scopesLabel")}</Text>
          <View style={[s.row, { gap: space.xxs, flexWrap: "wrap" }]}>
            {CONSENT_DATA_SCOPES.map((scope) => (
              <SelectableChip
                key={scope}
                label={t(SCOPE_KEYS[scope])}
                active={scopes.includes(scope)}
                onPress={() => setScopes((current) => toggle(current, scope))}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: space.xs }}>
          <Text style={s.fieldLabel}>{t("investor.purposesLabel")}</Text>
          <View style={[s.row, { gap: space.xxs, flexWrap: "wrap" }]}>
            {CONSENT_PURPOSES.map((purpose) => (
              <SelectableChip
                key={purpose}
                label={t(PURPOSE_KEYS[purpose])}
                active={purposes.includes(purpose)}
                onPress={() => setPurposes((current) => toggle(current, purpose))}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: space.xs }}>
          <Text style={s.fieldLabel}>{t("investor.channelsLabel")}</Text>
          <View style={[s.row, { gap: space.xxs, flexWrap: "wrap" }]}>
            {CONSENT_CHANNELS.map((channel) => (
              <SelectableChip
                key={channel}
                label={t(CHANNEL_KEYS[channel])}
                active={channels.includes(channel)}
                onPress={() => setChannels((current) => toggle(current, channel))}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: space.xs }}>
          <Text style={s.fieldLabel}>{t("investor.frequencyLabel")}</Text>
          <View style={[s.row, { gap: space.xxs, flexWrap: "wrap" }]}>
            {CONSENT_FREQUENCIES.map((item) => (
              <SelectableChip
                key={item}
                label={t(FREQUENCY_KEYS[item])}
                active={frequency === item}
                onPress={() => setFrequency(item)}
              />
            ))}
          </View>
        </View>

        <Field
          label={t("investor.validUntilLabel")}
          value={validTo}
          onChangeText={setValidTo}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          maxLength={10}
        />

        <View style={{ gap: space.xs }}>
          <Text style={s.fieldLabel}>{t("investor.quietHoursLabel")}</Text>
          <View style={[s.row, { gap: space.xxs, flexWrap: "wrap" }]}>
            <SelectableChip
              label={t("investor.longTerm")}
              active={!quietOn}
              onPress={() => setQuietOn(false)}
            />
            <SelectableChip
              label={t("investor.quietHoursLabel")}
              active={quietOn}
              onPress={() => setQuietOn(true)}
            />
          </View>
          {quietOn && (
            <View style={[s.row, { gap: space.sm, flexWrap: "wrap" }]}>
              <View style={{ flex: 1, minWidth: 96 }}>
                <Field
                  label={t("investor.quietStart")}
                  value={quietStart}
                  onChangeText={setQuietStart}
                  placeholder="22:00"
                  autoCapitalize="none"
                  maxLength={5}
                />
              </View>
              <View style={{ flex: 1, minWidth: 96 }}>
                <Field
                  label={t("investor.quietEnd")}
                  value={quietEnd}
                  onChangeText={setQuietEnd}
                  placeholder="08:00"
                  autoCapitalize="none"
                  maxLength={5}
                />
              </View>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Field
                  label={t("investor.timeZoneLabel")}
                  value={quietZone}
                  onChangeText={setQuietZone}
                  autoCapitalize="none"
                  maxLength={40}
                />
              </View>
            </View>
          )}
        </View>

        <View style={{ gap: space.xxs }}>
          <Field
            label={t("investor.dailyPushCapLabel")}
            value={cap}
            onChangeText={setCap}
            keyboardType="number-pad"
            placeholder={String(DEFAULT_DAILY_PUSH_CAP)}
            maxLength={2}
          />
          <Text style={s.small}>{t("investor.capHint")}</Text>
        </View>

        <ErrorNotice error={error} />
        <View style={[s.row, { gap: space.sm, justifyContent: "flex-end", flexWrap: "wrap" }]}>
          <Button small disabled={saving} onPress={onClose}>
            {t("common.cancel")}
          </Button>
          <Button small primary busy={saving} onPress={() => void save()}>
            {t("investor.save")}
          </Button>
        </View>
      </View>
    </Sheet>
  );
}

// ─── 页面 ───

export function ConsentCenterScreen() {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const [consents, setConsents] = useState<Consent[]>();
  const [gate, setGate] = useState<ConsentGate>();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Consent | "new" | undefined>();
  const [deleting, setDeleting] = useState<Consent>();
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [list, resolved] = await Promise.all([
        api.request<Consent[]>("/api/investor/consents"),
        api.request<ConsentGate>("/api/investor/consents/gate"),
      ]);
      setConsents(list);
      setGate(resolved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(consent: Consent) {
    if (busyId) return;
    setBusyId(consent.id);
    setError("");
    try {
      await api.request<Consent>(`/api/investor/consents/${consent.id}/revoke`, {}, "POST");
      notify(t("investor.revokedNotice"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId("");
    }
  }

  async function remove(consent: Consent) {
    if (busyId) return;
    setBusyId(consent.id);
    setError("");
    try {
      await api.request<void>(`/api/investor/consents/${consent.id}`, undefined, "DELETE");
      notify(t("investor.deletedNotice"));
      setDeleting(undefined);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId("");
    }
  }

  if (!consents) {
    return (
      <View style={{ alignItems: "center", padding: 40, gap: space.sm }}>
        {error ? (
          <>
            <ErrorNotice error={t("investor.consentLoadFailed")} />
            <Button onPress={() => void load()}>{t("common.tryAgain")}</Button>
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: space.lg }}>
      <Text style={s.muted}>{t("investor.consentsSubtitle")}</Text>

      {/* 今日投放结论（ConsentGate） */}
      {gate && (
        <Card style={{ gap: space.xs }}>
          <SectionHeading title={t("investor.gateHeading")} style={{ marginBottom: 0 }} />
          <View style={[s.row, { gap: space.xs, alignItems: "flex-start" }]}>
            {gate.canRemind ? (
              <ShieldCheck size={15} color={colors.success} />
            ) : (
              <ShieldAlert size={15} color={colors.muted} />
            )}
            <Text style={[s.small, { flex: 1 }]}>
              {gate.canRemind ? t("investor.gateRemindOn") : t("investor.gateRemindOff")}
            </Text>
          </View>
          {gate.quietHours && (
            <View style={[s.row, { gap: space.xs, alignItems: "flex-start" }]}>
              <CircleAlert size={15} color={colors.alertVolumeText} />
              <Text style={[s.small, { flex: 1 }]}>{t("investor.gateQuiet")}</Text>
            </View>
          )}
          {gate.pushCapReached && (
            <View style={[s.row, { gap: space.xs, alignItems: "flex-start" }]}>
              <CircleAlert size={15} color={colors.alertVolumeText} />
              <Text style={[s.small, { flex: 1 }]}>{t("investor.gateCapReached")}</Text>
            </View>
          )}
        </Card>
      )}

      <ErrorNotice error={error} />

      <View style={{ gap: space.sm }}>
        <SectionHeading
          title={t("investor.overviewHeading")}
          style={{ marginBottom: 0 }}
          actions={
            <IconButton
              icon={Plus}
              label={t("investor.addConsent")}
              onPress={() => setEditing("new")}
            />
          }
        />

        {consents.length === 0 ? (
          <Card variant="muted" style={{ alignItems: "center", gap: space.sm }}>
            <ShieldCheck size={22} color={colors.faint} />
            <Text style={[s.text, { fontWeight: "500" }]}>{t("investor.consentsEmpty")}</Text>
            <Text style={[s.small, { textAlign: "center" }]}>
              {t("investor.consentsEmptyDetail")}
            </Text>
            <Button small primary icon={Plus} onPress={() => setEditing("new")}>
              {t("investor.addConsent")}
            </Button>
          </Card>
        ) : (
          consents.map((consent) => {
            const revoked = Boolean(consent.revokedAt);
            return (
              <Card key={consent.id} style={{ gap: space.xxs }}>
                <View style={[s.between, { gap: space.sm }]}>
                  <Text style={[s.text, { fontWeight: "600", flex: 1 }]}>
                    {labels(consent.dataScope, SCOPE_KEYS, t)}
                  </Text>
                  {revoked && <Chip variant="secondary">{t("investor.revoked")}</Chip>}
                </View>
                <InfoRow
                  label={t("investor.purposesLabel")}
                  value={labels(consent.purposes, PURPOSE_KEYS, t)}
                />
                <InfoRow
                  label={t("investor.channelsLabel")}
                  value={labels(consent.channels, CHANNEL_KEYS, t)}
                  divided
                />
                <InfoRow
                  label={t("investor.frequencyLabel")}
                  value={t(FREQUENCY_KEYS[consent.frequency])}
                  divided
                />
                <InfoRow
                  label={t("investor.validUntilLabel")}
                  value={consent.validTo ? consent.validTo.slice(0, 10) : t("investor.longTerm")}
                  divided
                />
                {consent.quietHours && (
                  <InfoRow
                    label={t("investor.quietHoursLabel")}
                    value={`${consent.quietHours.start}–${consent.quietHours.end}`}
                    divided
                  />
                )}
                {consent.dailyPushCap !== undefined && (
                  <InfoRow
                    label={t("investor.dailyPushCapLabel")}
                    value={String(consent.dailyPushCap)}
                    divided
                  />
                )}
                <View
                  style={[
                    s.row,
                    { gap: space.xxs, justifyContent: "flex-end", paddingTop: space.xxs },
                  ]}
                >
                  {!revoked && (
                    <>
                      <IconButton
                        icon={Pencil}
                        label={t("investor.editConsent")}
                        onPress={() => setEditing(consent)}
                      />
                      <Button
                        small
                        disabled={busyId === consent.id}
                        onPress={() => void revoke(consent)}
                      >
                        {t("investor.revoke")}
                      </Button>
                    </>
                  )}
                  <IconButton
                    icon={Trash2}
                    label={t("investor.delete")}
                    disabled={busyId === consent.id}
                    onPress={() => setDeleting(consent)}
                  />
                </View>
              </Card>
            );
          })
        )}
      </View>

      {editing && (
        <ConsentEditorSheet
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => void load()}
        />
      )}

      {deleting && (
        <Sheet title={t("investor.delete")} small onClose={() => setDeleting(undefined)}>
          <View style={{ gap: space.md }}>
            <Text style={s.text}>{t("investor.deleteConfirm")}</Text>
            <ErrorNotice error={error} />
            <View style={[s.row, { gap: space.sm, justifyContent: "flex-end", flexWrap: "wrap" }]}>
              <Button
                small
                disabled={busyId === deleting.id}
                onPress={() => setDeleting(undefined)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                small
                danger
                busy={busyId === deleting.id}
                onPress={() => void remove(deleting)}
              >
                {t("investor.delete")}
              </Button>
            </View>
          </View>
        </Sheet>
      )}
    </View>
  );
}
