import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  GOAL_KINDS,
  type GoalKind,
  type InvestorProfileView,
  PROFILE_MARKETS,
  type ProfileChangeProposal,
  type ProfileMarket,
  type ProfileUpdateInput,
  RISK_APPETITES,
  type RiskAppetite,
} from "../../../packages/domain/src/investor";
import {
  CURRENCY_CODES,
  type MonitorCurrency,
} from "../../../packages/domain/src/monitor-currency";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import { IdCard, Plus, ShieldCheck, Trash2 } from "./icons";
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

const TRUST_KEYS = {
  user_confirmed: "investor.trust.userConfirmed",
  derived: "investor.trust.derived",
  stale: "investor.trust.stale",
} as const;

const GOAL_KIND_KEYS = {
  education: "investor.goalKind.education",
  retirement: "investor.goalKind.retirement",
  growth: "investor.goalKind.growth",
  preservation: "investor.goalKind.preservation",
  other: "investor.goalKind.other",
} as const;

const APPETITE_KEYS = {
  conservative: "investor.appetite.conservative",
  balanced: "investor.appetite.balanced",
  assertive: "investor.appetite.assertive",
  aggressive: "investor.appetite.aggressive",
} as const;

const MARKET_KEYS = {
  CN: "investor.market.CN",
  HK: "investor.market.HK",
  US: "investor.market.US",
} as const;

const splitList = (text: string) =>
  text
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);

const joinList = (items: readonly string[]) => items.join("、");

interface GoalDraft {
  id: string;
  kind: GoalKind;
  label: string;
  horizonMonths: string;
  amount: string;
  currency: MonitorCurrency;
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={[s.between, { gap: 12, paddingVertical: 8 }]}>
      <Text style={s.small}>{label}</Text>
      <Text style={[s.text, { flexShrink: 1, textAlign: "right" }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/**
 * A1 投资档案：展示四组字段（目标 / 约束 / 范围 / 习惯）及其可信状态，
 * 并承载「模型提议 → 用户确认」的审核入口。
 *
 * 强制确认字段（风险偏好 / 期限 / 禁止行业）由用户在本页显式保存时一并确认；
 * 模型提议一律进待审列表，用户 accept 后才落库（PRD A1）。
 */
export function InvestorProfileScreen() {
  const { t } = useTranslation();
  const { api, notify } = useWorkspace();
  const [view, setView] = useState<InvestorProfileView>();
  const [proposals, setProposals] = useState<ProfileChangeProposal[]>([]);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [goals, setGoals] = useState<GoalDraft[]>([]);
  const [appetite, setAppetite] = useState<RiskAppetite | "">("");
  const [drawdown, setDrawdown] = useState("");
  const [excludedSectors, setExcludedSectors] = useState("");
  const [excludedMarkets, setExcludedMarkets] = useState<ProfileMarket[]>([]);
  const [markets, setMarkets] = useState<ProfileMarket[]>([]);
  const [sectors, setSectors] = useState("");
  const [style, setStyle] = useState("");
  const [language, setLanguage] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [currency, setCurrency] = useState<MonitorCurrency | "">("");
  const goalSeed = useRef(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const [nextView, nextProposals] = await Promise.all([
        api.request<InvestorProfileView>("/api/investor/profile"),
        api.request<ProfileChangeProposal[]>("/api/investor/profile/proposals"),
      ]);
      setView(nextView);
      setProposals(nextProposals);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const openEditor = useCallback(() => {
    if (!view) return;
    const { profile } = view;
    setGoals(
      profile.goals.map((goal) => {
        goalSeed.current += 1;
        return {
          id: `existing-${goalSeed.current}`,
          kind: goal.kind,
          label: goal.label,
          horizonMonths: goal.horizonMonths === undefined ? "" : String(goal.horizonMonths),
          amount: goal.amount === undefined ? "" : String(goal.amount.value),
          currency: goal.amount?.currency ?? profile.habits.currency ?? "CNY",
        };
      }),
    );
    setAppetite(profile.risk.appetite ?? "");
    setDrawdown(
      profile.risk.maxDrawdownPercent === undefined ? "" : String(profile.risk.maxDrawdownPercent),
    );
    setExcludedSectors(joinList(profile.risk.excludedSectors));
    setExcludedMarkets(
      profile.risk.excludedMarkets.filter((item): item is ProfileMarket =>
        (PROFILE_MARKETS as readonly string[]).includes(item),
      ),
    );
    setMarkets(profile.scope.markets);
    setSectors(joinList(profile.scope.sectors));
    setStyle(profile.scope.style ?? "");
    setLanguage(profile.habits.language ?? "");
    setTimeZone(profile.habits.timeZone ?? "");
    setCurrency(profile.habits.currency ?? "");
    setEditorError("");
    setEditing(true);
  }, [view]);

  function addGoal() {
    goalSeed.current += 1;
    setGoals((current) => [
      ...current,
      {
        id: `draft-${goalSeed.current}`,
        kind: "growth",
        label: "",
        horizonMonths: "",
        amount: "",
        currency: "CNY",
      },
    ]);
  }

  function updateGoal(id: string, patch: Partial<GoalDraft>) {
    setGoals((current) => current.map((goal) => (goal.id === id ? { ...goal, ...patch } : goal)));
  }

  async function save() {
    if (saving) return;
    if (goals.some((goal) => !goal.label.trim())) {
      setEditorError(t("investor.goalLabelRequired"));
      return;
    }
    const payload: ProfileUpdateInput = {
      confirm: true,
      goals: goals.map((goal) => ({
        kind: goal.kind,
        label: goal.label.trim(),
        ...(goal.horizonMonths.trim() ? { horizonMonths: Number(goal.horizonMonths) } : {}),
        ...(goal.amount.trim()
          ? { amount: { value: Number(goal.amount), currency: goal.currency } }
          : {}),
      })),
      risk: {
        ...(appetite ? { appetite } : {}),
        ...(drawdown.trim() ? { maxDrawdownPercent: Number(drawdown) } : {}),
        excludedSectors: splitList(excludedSectors),
        excludedMarkets,
      },
      scope: {
        markets,
        sectors: splitList(sectors),
        ...(style.trim() ? { style: style.trim() } : {}),
      },
      habits: {
        ...(language.trim() ? { language: language.trim() } : {}),
        ...(timeZone.trim() ? { timeZone: timeZone.trim() } : {}),
        ...(currency ? { currency } : {}),
      },
    };
    setSaving(true);
    setEditorError("");
    try {
      const next = await api.request<InvestorProfileView>("/api/investor/profile", payload, "PUT");
      setView(next);
      setEditing(false);
      notify(t("investor.profileSaved"));
    } catch (e) {
      const code = (e as { code?: string }).code;
      setEditorError(
        code === "confirm_required"
          ? t("investor.confirmRequired")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setSaving(false);
    }
  }

  async function reviewProposal(id: string, action: "accept" | "reject") {
    setError("");
    try {
      await api.request<ProfileChangeProposal>(
        `/api/investor/profile/proposals/${id}/review`,
        { action },
        "POST",
      );
      notify(action === "accept" ? t("investor.proposalAccepted") : t("investor.proposalRejected"));
      setReloadKey((key) => key + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!view && !error)
    return (
      <View style={{ alignItems: "center", padding: 40, gap: 13 }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  if (!view)
    return (
      <View style={{ gap: 12 }}>
        <ErrorNotice error={error} />
        <Button onPress={() => void load()}>{t("common.tryAgain")}</Button>
      </View>
    );

  const { profile, trust, missingConfirmation } = view;
  const appetiteLabel = profile.risk.appetite
    ? t(APPETITE_KEYS[profile.risk.appetite])
    : t("investor.unset");
  const pendingProposals = proposals.filter((proposal) => proposal.status === "pending");

  return (
    <View style={{ gap: 20 }}>
      <Text style={s.muted}>{t("investor.profileIntro")}</Text>
      {missingConfirmation.length > 0 ? (
        <Card variant="muted" style={{ gap: 6 }}>
          <View style={[s.row, { gap: 8 }]}>
            <ShieldCheck size={16} color={colors.alertVolumeText} />
            <Text style={[s.text, { fontWeight: "600" }]}>{t("investor.profileMissingTitle")}</Text>
          </View>
          <Text style={s.small}>{t("investor.profileMissingDetail")}</Text>
          {missingConfirmation.map((field) => (
            <Text key={field} style={[s.small, { color: colors.alertVolumeText }]}>
              {field}
            </Text>
          ))}
        </Card>
      ) : null}
      <ErrorNotice error={error} />

      <View style={{ gap: 10 }}>
        <SectionHeading
          title={t("investor.sectionGoals")}
          actions={<Chip variant="outline">{t(TRUST_KEYS[trust.goals])}</Chip>}
        />
        {profile.goals.length === 0 ? (
          <Text style={s.small}>{t("investor.goalsEmpty")}</Text>
        ) : (
          <Card style={{ paddingVertical: 6 }}>
            {profile.goals.map((goal, index) => (
              <View
                key={`${goal.kind}:${goal.label}:${goal.updatedAt}`}
                style={[
                  { gap: 4, paddingVertical: 8 },
                  index > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                ]}
              >
                <View style={[s.between, { gap: 8 }]}>
                  <Text style={[s.text, { fontWeight: "500" }]}>{goal.label}</Text>
                  <Chip variant="secondary">{t(GOAL_KIND_KEYS[goal.kind])}</Chip>
                </View>
                <Text style={s.small}>
                  {`${t("investor.goalHorizon")}: ${
                    goal.horizonMonths === undefined
                      ? t("investor.unset")
                      : t("investor.goalMonths", { months: goal.horizonMonths })
                  }`}
                </Text>
                {goal.amount ? (
                  <Text style={s.small}>
                    {`${t("investor.goalAmount")}: ${goal.amount.value} ${goal.amount.currency}`}
                  </Text>
                ) : null}
              </View>
            ))}
          </Card>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading
          title={t("investor.sectionRisk")}
          actions={<Chip variant="outline">{t(TRUST_KEYS[trust.risk])}</Chip>}
        />
        <Card style={{ paddingVertical: 4 }}>
          <FieldRow label={t("investor.riskAppetite")} value={appetiteLabel} />
          <FieldRow
            label={t("investor.riskMaxDrawdown")}
            value={
              profile.risk.maxDrawdownPercent === undefined
                ? t("investor.unset")
                : `${profile.risk.maxDrawdownPercent}%`
            }
          />
          <FieldRow
            label={t("investor.riskExcludedSectors")}
            value={
              profile.risk.excludedSectors.length
                ? joinList(profile.risk.excludedSectors)
                : t("investor.riskNone")
            }
          />
          <FieldRow
            label={t("investor.riskExcludedMarkets")}
            value={
              profile.risk.excludedMarkets.length
                ? profile.risk.excludedMarkets.join("、")
                : t("investor.riskNone")
            }
          />
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading
          title={t("investor.sectionScope")}
          actions={<Chip variant="outline">{t(TRUST_KEYS[trust.scope])}</Chip>}
        />
        <Card style={{ paddingVertical: 4 }}>
          <FieldRow
            label={t("investor.scopeMarkets")}
            value={profile.scope.markets.map((market) => t(MARKET_KEYS[market])).join("、")}
          />
          <FieldRow
            label={t("investor.scopeSectors")}
            value={
              profile.scope.sectors.length ? joinList(profile.scope.sectors) : t("investor.unset")
            }
          />
          <FieldRow
            label={t("investor.scopeStyle")}
            value={profile.scope.style ?? t("investor.unset")}
          />
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading
          title={t("investor.sectionHabits")}
          actions={<Chip variant="outline">{t(TRUST_KEYS[trust.habits])}</Chip>}
        />
        <Card style={{ paddingVertical: 4 }}>
          <FieldRow
            label={t("investor.habitsLanguage")}
            value={profile.habits.language ?? t("investor.unset")}
          />
          <FieldRow
            label={t("investor.habitsTimeZone")}
            value={profile.habits.timeZone ?? t("investor.unset")}
          />
          <FieldRow
            label={t("investor.habitsCurrency")}
            value={profile.habits.currency ?? t("investor.unset")}
          />
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading title={t("investor.proposalsTitle")} count={pendingProposals.length} />
        {pendingProposals.length === 0 ? (
          <Text style={s.small}>{t("investor.proposalsEmpty")}</Text>
        ) : (
          pendingProposals.map((proposal) => (
            <Card key={proposal.id} style={{ gap: 8 }}>
              <View style={[s.row, { gap: 8 }]}>
                <IdCard size={16} color={colors.primary} />
                <Text style={[s.text, { fontWeight: "500", flex: 1 }]}>{proposal.label}</Text>
              </View>
              <Text style={s.small}>
                {`${proposal.currentValue ?? t("investor.unset")} → ${proposal.proposedValue}`}
              </Text>
              {proposal.rationale ? <Text style={s.small}>{proposal.rationale}</Text> : null}
              <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                <Button small primary onPress={() => void reviewProposal(proposal.id, "accept")}>
                  {t("investor.proposalAccept")}
                </Button>
                <Button small onPress={() => void reviewProposal(proposal.id, "reject")}>
                  {t("investor.proposalReject")}
                </Button>
              </View>
            </Card>
          ))
        )}
      </View>

      <Button icon={ShieldCheck} onPress={openEditor}>
        {t("investor.edit")}
      </Button>

      {editing ? (
        <Sheet title={t("investor.editTitle")} onClose={() => setEditing(false)} medium>
          <View style={{ gap: 16 }}>
            <View style={{ gap: 8 }}>
              <Text style={s.fieldLabel}>{t("investor.sectionGoals")}</Text>
              {goals.map((goal) => (
                <Card key={goal.id} variant="muted" style={{ gap: 8 }}>
                  <View style={[s.between, { gap: 8, alignItems: "flex-start" }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>{t("investor.goalKindLabel")}</Text>
                      <SelectableChipGroup
                        multiple={false}
                        options={GOAL_KINDS.map((value) => ({
                          value,
                          label: t(GOAL_KIND_KEYS[value]),
                        }))}
                        value={[goal.kind]}
                        onChange={(next) => updateGoal(goal.id, { kind: next[0] ?? "growth" })}
                      />
                    </View>
                    <IconButton
                      icon={Trash2}
                      label={t("investor.goalRemove")}
                      onPress={() =>
                        setGoals((current) => current.filter((item) => item.id !== goal.id))
                      }
                    />
                  </View>
                  <Field
                    label={t("investor.goalLabel")}
                    value={goal.label}
                    onChangeText={(text) => updateGoal(goal.id, { label: text })}
                    maxLength={80}
                  />
                  <View style={[s.row, { gap: 10 }]}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label={t("investor.goalHorizon")}
                        value={goal.horizonMonths}
                        onChangeText={(text) => updateGoal(goal.id, { horizonMonths: text })}
                        keyboardType="numeric"
                        placeholder="0"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label={t("investor.goalAmount")}
                        value={goal.amount}
                        onChangeText={(text) => updateGoal(goal.id, { amount: text })}
                        keyboardType="numeric"
                        placeholder="0"
                      />
                    </View>
                  </View>
                  <View style={{ gap: 8 }}>
                    <Text style={s.fieldLabel}>{t("investor.goalCurrency")}</Text>
                    <SelectableChipGroup
                      multiple={false}
                      options={CURRENCY_CODES.map((value) => ({ value, label: value }))}
                      value={[goal.currency]}
                      onChange={(next) => updateGoal(goal.id, { currency: next[0] ?? "CNY" })}
                    />
                  </View>
                </Card>
              ))}
              <Button small icon={Plus} onPress={addGoal} style={{ alignSelf: "flex-start" }}>
                {t("investor.goalAdd")}
              </Button>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={s.fieldLabel}>{t("investor.riskAppetite")}</Text>
              <SelectableChipGroup
                multiple={false}
                options={RISK_APPETITES.map((value) => ({ value, label: t(APPETITE_KEYS[value]) }))}
                value={appetite ? [appetite] : []}
                onChange={(next) => setAppetite(next[0] ?? "")}
              />
            </View>
            <Field
              label={t("investor.riskMaxDrawdown")}
              value={drawdown}
              onChangeText={setDrawdown}
              keyboardType="numeric"
              placeholder="0"
            />
            <Field
              label={t("investor.riskExcludedSectors")}
              value={excludedSectors}
              onChangeText={setExcludedSectors}
              placeholder={t("investor.listHint")}
            />
            <View style={{ gap: 8 }}>
              <Text style={s.fieldLabel}>{t("investor.riskExcludedMarkets")}</Text>
              <SelectableChipGroup
                options={PROFILE_MARKETS.map((value) => ({ value, label: t(MARKET_KEYS[value]) }))}
                value={excludedMarkets}
                onChange={setExcludedMarkets}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={s.fieldLabel}>{t("investor.scopeMarkets")}</Text>
              <SelectableChipGroup
                options={PROFILE_MARKETS.map((value) => ({ value, label: t(MARKET_KEYS[value]) }))}
                value={markets}
                onChange={setMarkets}
              />
            </View>
            <Field
              label={t("investor.scopeSectors")}
              value={sectors}
              onChangeText={setSectors}
              placeholder={t("investor.listHint")}
            />
            <Field
              label={t("investor.scopeStyle")}
              value={style}
              onChangeText={setStyle}
              maxLength={40}
            />

            <Field
              label={t("investor.habitsLanguage")}
              value={language}
              onChangeText={setLanguage}
              maxLength={20}
            />
            <Field
              label={t("investor.habitsTimeZone")}
              value={timeZone}
              onChangeText={setTimeZone}
              maxLength={60}
            />
            <View style={{ gap: 8 }}>
              <Text style={s.fieldLabel}>{t("investor.habitsCurrency")}</Text>
              <SelectableChipGroup
                multiple={false}
                options={CURRENCY_CODES.map((value) => ({ value, label: value }))}
                value={currency ? [currency] : []}
                onChange={(next) => setCurrency(next[0] ?? "")}
              />
            </View>

            <ErrorNotice error={editorError} />
            <View style={[s.row, { gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }]}>
              <Button small onPress={() => setEditing(false)}>
                {t("common.cancel")}
              </Button>
              <Button small primary busy={saving} onPress={() => void save()}>
                {t("investor.save")}
              </Button>
            </View>
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}
