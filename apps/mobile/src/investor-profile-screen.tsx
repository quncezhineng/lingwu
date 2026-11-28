/**
 * A1 投资档案页（PRD-灵悟-主动服务与信任架构）。
 *
 * 档案分「目标 / 风险约束 / 投资范围 / 使用习惯」四组，每组都带可信状态
 * （用户已确认 / 系统推断 / 待复核）与「仍待你确认」的高风险字段。
 * 高风险字段（风险偏好 / 投资期限 / 禁止行业与市场）必须用户显式确认：
 * 未确认时不带 confirm 提交通常会拿到 422（code=confirm_required），
 * 这里统一改成二次确认弹层，确认后再以 confirm:true 提交。
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  GOAL_KINDS,
  type GoalKind,
  type InvestmentProfile,
  PROFILE_MARKETS,
  type ProfileMarket,
  type ProfileTrust,
  RISK_APPETITES,
  type RiskAppetite,
} from "../../../packages/domain/src/investor";
import type { MonitorCurrency } from "../../../packages/domain/src/monitor-currency";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import { CircleAlert, CircleCheck, Pencil, Plus, Trash2 } from "./icons";
import { SelectableChip } from "./selectable-chip";
import {
  Button,
  Card,
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

const CURRENCIES: MonitorCurrency[] = ["CNY", "USD", "HKD"];

const GOAL_KIND_KEYS: Record<GoalKind, TranslationKey> = {
  education: "investor.goal.education",
  retirement: "investor.goal.retirement",
  growth: "investor.goal.growth",
  preservation: "investor.goal.preservation",
  other: "investor.goal.other",
};

const APPETITE_KEYS: Record<RiskAppetite, TranslationKey> = {
  conservative: "investor.appetite.conservative",
  balanced: "investor.appetite.balanced",
  assertive: "investor.appetite.assertive",
  aggressive: "investor.appetite.aggressive",
};

const TRUST_KEYS: Record<ProfileTrust, TranslationKey> = {
  user_confirmed: "investor.trustUserConfirmed",
  derived: "investor.trustDerived",
  stale: "investor.trustStale",
};

/** 待确认高风险字段 → 展示文案。 */
const MISSING_KEYS: Record<string, TranslationKey> = {
  "risk.appetite": "investor.missingRiskAppetite",
  "risk.excluded": "investor.missingRiskExcluded",
  "goals.horizon": "investor.missingGoalsHorizon",
};

interface ProfileResponse {
  profile: InvestmentProfile;
  trust: { risk: ProfileTrust; goals: ProfileTrust };
  missingConfirmation: string[];
}

function parseList(value: string): string[] {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sameList(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
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

// ─── 编辑草稿 ───

interface GoalDraft {
  /** 客户端稳定行标识：仅用于列表 key，避免编辑时按内容 key 导致输入框重挂载。 */
  id: string;
  kind: GoalKind;
  label: string;
  horizonMonths: string;
  amount?: { value: number; currency: MonitorCurrency };
}

let goalRowSeq = 0;
function goalRowId() {
  goalRowSeq += 1;
  return `goal-${goalRowSeq}`;
}

interface RiskDraft {
  appetite: RiskAppetite | "";
  maxDrawdownPercent: string;
  excludedSectors: string;
  excludedMarkets: ProfileMarket[];
}

interface ScopeDraft {
  markets: ProfileMarket[];
  sectors: string;
  style: string;
}

interface HabitDraft {
  currency: MonitorCurrency | "";
  timeZone: string;
  language: string;
}

interface UpdatePayload {
  goals?: {
    kind: GoalKind;
    label: string;
    horizonMonths?: number;
    amount?: { value: number; currency: MonitorCurrency };
    source: "user";
  }[];
  risk?: {
    appetite?: RiskAppetite;
    maxDrawdownPercent?: number;
    excludedSectors?: string[];
    excludedMarkets?: ProfileMarket[];
  };
  scope?: { markets?: ProfileMarket[]; sectors?: string[]; style?: string };
  habits?: { currency?: MonitorCurrency; timeZone?: string; language?: string };
}

/** 依据草稿与原档案生成差异化的更新体，同时列出被触碰的高风险字段。 */
function buildUpdate(
  initial: InvestmentProfile,
  draft: { goals: GoalDraft[]; risk: RiskDraft; scope: ScopeDraft; habits: HabitDraft },
): { update: UpdatePayload; risky: string[] } {
  const update: UpdatePayload = {};
  const risky: string[] = [];

  const initialGoals = initial.goals.map((goal) => ({
    kind: goal.kind,
    label: goal.label,
    horizonMonths: goal.horizonMonths ?? "",
    amount: goal.amount,
  }));
  const draftGoals = draft.goals.map((goal) => ({
    kind: goal.kind,
    label: goal.label.trim(),
    horizonMonths: goal.horizonMonths.trim(),
    amount: goal.amount,
  }));
  if (JSON.stringify(initialGoals) !== JSON.stringify(draftGoals)) {
    const goals: UpdatePayload["goals"] = draft.goals.map((goal) => {
      const entry: NonNullable<UpdatePayload["goals"]>[number] = {
        kind: goal.kind,
        label: goal.label.trim(),
        source: "user",
      };
      if (goal.horizonMonths.trim() !== "") entry.horizonMonths = Number(goal.horizonMonths);
      if (goal.amount) entry.amount = goal.amount;
      return entry;
    });
    update.goals = goals;
    if (goals.some((goal) => goal.horizonMonths !== undefined)) risky.push("goals.horizon");
  }

  const risk: NonNullable<UpdatePayload["risk"]> = {};
  if (draft.risk.appetite !== "" && draft.risk.appetite !== initial.risk.appetite) {
    risk.appetite = draft.risk.appetite;
    risky.push("risk.appetite");
  }
  const excludedSectors = parseList(draft.risk.excludedSectors);
  if (
    !sameList(excludedSectors, initial.risk.excludedSectors) ||
    !sameList(draft.risk.excludedMarkets, initial.risk.excludedMarkets)
  ) {
    risk.excludedSectors = excludedSectors;
    risk.excludedMarkets = draft.risk.excludedMarkets;
    risky.push("risk.excluded");
  }
  const drawdown = draft.risk.maxDrawdownPercent.trim();
  const drawdownValue = drawdown === "" ? undefined : Number(drawdown);
  if (drawdownValue !== undefined && drawdownValue !== initial.risk.maxDrawdownPercent) {
    risk.maxDrawdownPercent = drawdownValue;
  }
  if (Object.keys(risk).length > 0) update.risk = risk;

  const scope: NonNullable<UpdatePayload["scope"]> = {};
  if (!sameList(draft.scope.markets, initial.scope.markets)) scope.markets = draft.scope.markets;
  const sectors = parseList(draft.scope.sectors);
  if (!sameList(sectors, initial.scope.sectors)) scope.sectors = sectors;
  const style = draft.scope.style.trim();
  if (style !== (initial.scope.style ?? "")) scope.style = style;
  if (Object.keys(scope).length > 0) update.scope = scope;

  const habits: NonNullable<UpdatePayload["habits"]> = {};
  if (draft.habits.currency !== "" && draft.habits.currency !== initial.habits.currency)
    habits.currency = draft.habits.currency;
  const timeZone = draft.habits.timeZone.trim();
  if (timeZone !== (initial.habits.timeZone ?? "")) habits.timeZone = timeZone;
  const language = draft.habits.language.trim();
  if (language !== (initial.habits.language ?? "")) habits.language = language;
  if (Object.keys(habits).length > 0) update.habits = habits;

  return { update, risky };
}

// ─── 编辑浮层 ───

function ProfileEditorSheet({
  initial,
  onClose,
  onSaved,
}: {
  initial: InvestmentProfile;
  onClose: () => void;
  onSaved: (response: ProfileResponse) => void;
}) {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"edit" | "confirm">("edit");
  const [goals, setGoals] = useState<GoalDraft[]>(
    initial.goals.map((goal) => ({
      id: goalRowId(),
      kind: goal.kind,
      label: goal.label,
      horizonMonths: goal.horizonMonths !== undefined ? String(goal.horizonMonths) : "",
      amount: goal.amount,
    })),
  );
  const [risk, setRisk] = useState<RiskDraft>({
    appetite: initial.risk.appetite ?? "",
    maxDrawdownPercent:
      initial.risk.maxDrawdownPercent !== undefined ? String(initial.risk.maxDrawdownPercent) : "",
    excludedSectors: initial.risk.excludedSectors.join(", "),
    // 档案里 excludedMarkets 存的是宽松字符串，编辑态收敛到已知市场枚举。
    excludedMarkets: initial.risk.excludedMarkets.filter((market): market is ProfileMarket =>
      (PROFILE_MARKETS as readonly string[]).includes(market),
    ),
  });
  const [scope, setScope] = useState<ScopeDraft>({
    markets: initial.scope.markets,
    sectors: initial.scope.sectors.join(", "),
    style: initial.scope.style ?? "",
  });
  const [habits, setHabits] = useState<HabitDraft>({
    currency: initial.habits.currency ?? "",
    timeZone: initial.habits.timeZone ?? "",
    language: initial.habits.language ?? "",
  });
  const [risky, setRisky] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const invalidHorizon = goals.some(
    (goal) => goal.horizonMonths.trim() !== "" && !/^\d+$/.test(goal.horizonMonths.trim()),
  );

  function toggleMarket(list: ProfileMarket[], value: ProfileMarket): ProfileMarket[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function updateGoal(index: number, patch: Partial<GoalDraft>) {
    setGoals((current) =>
      current.map((goal, position) => (position === index ? { ...goal, ...patch } : goal)),
    );
  }

  async function perform(update: UpdatePayload, confirm: boolean) {
    setSaving(true);
    setError("");
    try {
      const response = await api.request<ProfileResponse>(
        "/api/investor/profile",
        { ...update, confirm },
        "PUT",
      );
      notify(t("investor.saved"));
      onSaved(response);
      onClose();
    } catch (reason) {
      const failure = reason as Error & { code?: string };
      if (failure.code === "confirm_required") {
        // 兜底：本地没判出高风险字段时，服务端仍要求确认。
        setRisky(["risk.appetite", "risk.excluded", "goals.horizon"]);
        setPhase("confirm");
      } else {
        setError(failure.message);
      }
    } finally {
      setSaving(false);
    }
  }

  function beginSave() {
    if (saving) return;
    if (invalidHorizon) {
      setError(t("investor.invalidHorizon"));
      return;
    }
    const { update, risky: fields } = buildUpdate(initial, { goals, risk, scope, habits });
    if (Object.keys(update).length === 0) {
      onClose();
      return;
    }
    if (fields.length > 0) {
      setRisky(fields);
      setPhase("confirm");
      setError("");
      return;
    }
    void perform(update, false);
  }

  function confirmSave() {
    const { update } = buildUpdate(initial, { goals, risk, scope, habits });
    void perform(update, true);
  }

  if (phase === "confirm") {
    return (
      <Sheet title={t("investor.confirmTitle")} small onClose={onClose}>
        <View style={{ gap: space.md }}>
          <Text style={s.text}>{t("investor.confirmBody")}</Text>
          <View style={{ gap: space.xxs }}>
            {risky.map((field) => (
              <View key={field} style={[s.row, { gap: space.xs }]}>
                <CircleAlert size={15} color={colors.alertVolumeText} />
                <Text style={s.text}>{MISSING_KEYS[field] ? t(MISSING_KEYS[field]) : field}</Text>
              </View>
            ))}
          </View>
          <ErrorNotice error={error} />
          <View style={[s.row, { gap: space.sm, justifyContent: "flex-end", flexWrap: "wrap" }]}>
            <Button small disabled={saving} onPress={() => setPhase("edit")}>
              {t("common.cancel")}
            </Button>
            <Button small primary busy={saving} onPress={confirmSave}>
              {t("investor.confirmApply")}
            </Button>
          </View>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet title={t("investor.edit")} onClose={onClose}>
      <View style={{ gap: space.md }}>
        {/* 目标 */}
        <View style={{ gap: space.sm }}>
          <SectionHeading title={t("investor.goalsHeading")} style={{ marginBottom: 0 }} />
          {goals.map((goal, index) => (
            <Card key={goal.id} variant="muted" style={{ gap: space.sm }}>
              <View style={{ gap: space.xs }}>
                <Text style={s.fieldLabel}>{t("investor.goalKindLabel")}</Text>
                <View style={[s.row, { gap: space.xxs, flexWrap: "wrap" }]}>
                  {GOAL_KINDS.map((kind) => (
                    <SelectableChip
                      key={kind}
                      label={t(GOAL_KIND_KEYS[kind])}
                      active={goal.kind === kind}
                      onPress={() => updateGoal(index, { kind })}
                    />
                  ))}
                </View>
              </View>
              <View style={[s.row, { gap: space.sm, alignItems: "flex-end" }]}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t("investor.goalLabelLabel")}
                    value={goal.label}
                    onChangeText={(value) => updateGoal(index, { label: value })}
                    maxLength={80}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t("investor.horizonMonthsLabel")}
                    value={goal.horizonMonths}
                    onChangeText={(value) => updateGoal(index, { horizonMonths: value })}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                </View>
                <IconButton
                  icon={Trash2}
                  label={t("investor.removeGoal")}
                  style={{ marginBottom: space.md }}
                  onPress={() => setGoals((current) => current.filter((_, i) => i !== index))}
                />
              </View>
            </Card>
          ))}
          <Button
            small
            icon={Plus}
            disabled={goals.length >= 10 || invalidHorizon}
            onPress={() =>
              setGoals((current) => [
                ...current,
                { id: goalRowId(), kind: "growth", label: "", horizonMonths: "" },
              ])
            }
          >
            {t("investor.addGoal")}
          </Button>
        </View>

        {/* 风险约束 */}
        <View style={{ gap: space.sm }}>
          <SectionHeading title={t("investor.riskHeading")} style={{ marginBottom: 0 }} />
          <View style={{ gap: space.xs }}>
            <Text style={s.fieldLabel}>{t("investor.appetiteLabel")}</Text>
            <View style={[s.row, { gap: space.xxs, flexWrap: "wrap" }]}>
              {RISK_APPETITES.map((appetite) => (
                <SelectableChip
                  key={appetite}
                  label={t(APPETITE_KEYS[appetite])}
                  active={risk.appetite === appetite}
                  onPress={() =>
                    setRisk((current) => ({
                      ...current,
                      appetite: current.appetite === appetite ? "" : appetite,
                    }))
                  }
                />
              ))}
            </View>
          </View>
          <Field
            label={t("investor.maxDrawdownLabel")}
            value={risk.maxDrawdownPercent}
            onChangeText={(value) =>
              setRisk((current) => ({ ...current, maxDrawdownPercent: value }))
            }
            keyboardType="decimal-pad"
            maxLength={6}
          />
          <Field
            label={t("investor.excludedSectorsLabel")}
            value={risk.excludedSectors}
            onChangeText={(value) => setRisk((current) => ({ ...current, excludedSectors: value }))}
            placeholder={t("investor.excludedSectorsPlaceholder")}
            maxLength={400}
          />
          <View style={{ gap: space.xs }}>
            <Text style={s.fieldLabel}>{t("investor.excludedMarketsLabel")}</Text>
            <View style={[s.row, { gap: space.xxs, flexWrap: "wrap" }]}>
              {PROFILE_MARKETS.map((market) => (
                <SelectableChip
                  key={market}
                  label={market}
                  active={risk.excludedMarkets.includes(market)}
                  onPress={() =>
                    setRisk((current) => ({
                      ...current,
                      excludedMarkets: toggleMarket(current.excludedMarkets, market),
                    }))
                  }
                />
              ))}
            </View>
          </View>
        </View>

        {/* 投资范围 */}
        <View style={{ gap: space.sm }}>
          <SectionHeading title={t("investor.scopeHeading")} style={{ marginBottom: 0 }} />
          <View style={{ gap: space.xs }}>
            <Text style={s.fieldLabel}>{t("investor.marketsLabel")}</Text>
            <View style={[s.row, { gap: space.xxs, flexWrap: "wrap" }]}>
              {PROFILE_MARKETS.map((market) => (
                <SelectableChip
                  key={market}
                  label={market}
                  active={scope.markets.includes(market)}
                  onPress={() =>
                    setScope((current) => ({
                      ...current,
                      markets: toggleMarket(current.markets, market),
                    }))
                  }
                />
              ))}
            </View>
            <Text style={s.small}>{t("investor.scopeMarketsHint")}</Text>
          </View>
          <Field
            label={t("investor.sectorsLabel")}
            value={scope.sectors}
            onChangeText={(value) => setScope((current) => ({ ...current, sectors: value }))}
            placeholder={t("investor.excludedSectorsPlaceholder")}
            maxLength={400}
          />
          <Field
            label={t("investor.styleLabel")}
            value={scope.style}
            onChangeText={(value) => setScope((current) => ({ ...current, style: value }))}
            maxLength={60}
          />
        </View>

        {/* 使用习惯 */}
        <View style={{ gap: space.sm }}>
          <SectionHeading title={t("investor.habitsHeading")} style={{ marginBottom: 0 }} />
          <View style={{ gap: space.xs }}>
            <Text style={s.fieldLabel}>{t("investor.currencyLabel")}</Text>
            <View style={[s.row, { gap: space.xxs, flexWrap: "wrap" }]}>
              {CURRENCIES.map((currency) => (
                <SelectableChip
                  key={currency}
                  label={currency}
                  active={habits.currency === currency}
                  onPress={() =>
                    setHabits((current) => ({
                      ...current,
                      currency: current.currency === currency ? "" : currency,
                    }))
                  }
                />
              ))}
            </View>
          </View>
          <Field
            label={t("investor.timeZoneLabel")}
            value={habits.timeZone}
            onChangeText={(value) => setHabits((current) => ({ ...current, timeZone: value }))}
            autoCapitalize="none"
            maxLength={40}
          />
          <Field
            label={t("investor.languageLabel")}
            value={habits.language}
            onChangeText={(value) => setHabits((current) => ({ ...current, language: value }))}
            autoCapitalize="none"
            maxLength={20}
          />
        </View>

        <ErrorNotice error={error} />
        <View style={[s.row, { gap: space.sm, justifyContent: "flex-end", flexWrap: "wrap" }]}>
          <Button small disabled={saving} onPress={onClose}>
            {t("common.cancel")}
          </Button>
          <Button small primary busy={saving} onPress={beginSave}>
            {t("investor.save")}
          </Button>
        </View>
      </View>
    </Sheet>
  );
}

// ─── 页面 ───

export function InvestorProfileScreen() {
  const { api } = useWorkspace();
  const { t } = useTranslation();
  const [state, setState] = useState<ProfileResponse>();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setState(await api.request<ProfileResponse>("/api/investor/profile"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) {
    return (
      <View style={{ alignItems: "center", padding: 40, gap: space.sm }}>
        {error ? (
          <>
            <ErrorNotice error={t("investor.loadFailed")} />
            <Button onPress={() => void load()}>{t("common.tryAgain")}</Button>
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  const { profile, trust, missingConfirmation } = state;
  const appetite = profile.risk.appetite;
  const maxDrawdown =
    profile.risk.maxDrawdownPercent !== undefined
      ? `${profile.risk.maxDrawdownPercent}%`
      : t("investor.notSet");

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <Text style={s.muted}>{t("investor.profileSubtitle")}</Text>
      </View>

      {/* 可信状态 + 待确认 */}
      <Card style={{ gap: space.sm }}>
        <SectionHeading title={t("investor.trustHeading")} style={{ marginBottom: 0 }} />
        <InfoRow label={t("investor.trustRisk")} value={t(TRUST_KEYS[trust.risk])} />
        <InfoRow label={t("investor.trustGoals")} value={t(TRUST_KEYS[trust.goals])} divided />
        <View style={[s.row, { gap: space.xs, alignItems: "flex-start", paddingTop: space.tight }]}>
          {missingConfirmation.length > 0 ? (
            <CircleAlert size={15} color={colors.alertVolumeText} />
          ) : (
            <CircleCheck size={15} color={colors.success} />
          )}
          <Text style={[s.small, { flex: 1 }]}>
            {missingConfirmation.length > 0
              ? t("investor.needsConfirm", { count: missingConfirmation.length })
              : t("investor.allConfirmed")}
          </Text>
        </View>
      </Card>

      {/* 目标 */}
      <View style={{ gap: space.sm }}>
        <SectionHeading
          title={t("investor.goalsHeading")}
          style={{ marginBottom: 0 }}
          actions={
            <IconButton icon={Pencil} label={t("investor.edit")} onPress={() => setEditing(true)} />
          }
        />
        <Card>
          {profile.goals.length === 0 ? (
            <Text style={s.small}>{t("investor.noGoals")}</Text>
          ) : (
            profile.goals.map((goal, index) => (
              <InfoRow
                key={`${goal.kind}:${goal.label}:${goal.updatedAt}`}
                divided={index > 0}
                label={`${goal.label} · ${t(GOAL_KIND_KEYS[goal.kind])}`}
                value={
                  goal.horizonMonths !== undefined
                    ? t("investor.horizonValue", { months: goal.horizonMonths })
                    : t("investor.notSet")
                }
              />
            ))
          )}
        </Card>
      </View>

      {/* 风险约束 */}
      <View style={{ gap: space.sm }}>
        <SectionHeading title={t("investor.riskHeading")} style={{ marginBottom: 0 }} />
        <Card>
          <InfoRow
            label={t("investor.appetiteLabel")}
            value={appetite ? t(APPETITE_KEYS[appetite]) : t("investor.notSet")}
          />
          <InfoRow label={t("investor.maxDrawdownLabel")} value={maxDrawdown} divided />
          <InfoRow
            label={t("investor.excludedSectorsLabel")}
            value={profile.risk.excludedSectors.join(", ") || t("investor.notSet")}
            divided
          />
          <InfoRow
            label={t("investor.excludedMarketsLabel")}
            value={profile.risk.excludedMarkets.join(", ") || t("investor.notSet")}
            divided
          />
          {profile.risk.assessmentExpiresAt ? (
            <InfoRow
              label={t("investor.assessmentExpiryLabel")}
              value={profile.risk.assessmentExpiresAt.slice(0, 10)}
              divided
            />
          ) : null}
        </Card>
      </View>

      {/* 投资范围 */}
      <View style={{ gap: space.sm }}>
        <SectionHeading title={t("investor.scopeHeading")} style={{ marginBottom: 0 }} />
        <Card>
          <InfoRow
            label={t("investor.marketsLabel")}
            value={profile.scope.markets.join(", ") || t("investor.notSet")}
          />
          <InfoRow
            label={t("investor.sectorsLabel")}
            value={profile.scope.sectors.join(", ") || t("investor.notSet")}
            divided
          />
          <InfoRow
            label={t("investor.styleLabel")}
            value={profile.scope.style?.trim() || t("investor.notSet")}
            divided
          />
        </Card>
      </View>

      {/* 使用习惯 */}
      <View style={{ gap: space.sm }}>
        <SectionHeading title={t("investor.habitsHeading")} style={{ marginBottom: 0 }} />
        <Card>
          <InfoRow
            label={t("investor.currencyLabel")}
            value={profile.habits.currency || t("investor.notSet")}
          />
          <InfoRow
            label={t("investor.timeZoneLabel")}
            value={profile.habits.timeZone?.trim() || t("investor.notSet")}
            divided
          />
          <InfoRow
            label={t("investor.languageLabel")}
            value={profile.habits.language?.trim() || t("investor.notSet")}
            divided
          />
        </Card>
      </View>

      <Button primary icon={Pencil} onPress={() => setEditing(true)}>
        {t("investor.edit")}
      </Button>

      {editing && (
        <ProfileEditorSheet
          initial={profile}
          onClose={() => setEditing(false)}
          onSaved={(response) => setState(response)}
        />
      )}
    </View>
  );
}
