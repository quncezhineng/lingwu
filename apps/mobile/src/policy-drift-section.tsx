import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  type InvestmentPolicy,
  POLICY_BASES,
  POLICY_SUM_TOLERANCE,
  type PolicyBasis,
  type PolicyDrift,
  type PolicyDriftRow,
  type PolicyInput,
} from "../../../packages/domain/src/investor";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import { Plus, Trash2 } from "./icons";
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

const BASIS_LABEL_KEYS = {
  asset_class: "investor.basis.asset_class",
  sector: "investor.basis.sector",
  region: "investor.basis.region",
  currency: "investor.basis.currency",
} as const;

const DRIFT_LABEL_KEYS = {
  within: "investor.drift.within",
  warning: "investor.drift.warning",
  breach: "investor.drift.breach",
} as const;

const pct = (value: number) => `${value.toFixed(1)}%`;

function statusTint(status: PolicyDriftRow["status"]) {
  return status === "breach"
    ? colors.danger
    : status === "warning"
      ? colors.alertVolumeText
      : colors.muted;
}

/** 编辑态的目标行；id 与业务 key 分离，保证列表 key 稳定（避免改名时行重组）。 */
type TargetDraft = {
  id: string;
  key: string;
  label: string;
  targetPercent: string;
  bandPercent: string;
};

/**
 * A2 目标配置与偏离：只在「组合详情」里展示，负责读政策、算偏离、并提供编辑入口。
 *
 * 无政策时不给任何默认假设（PRD A2 验收）：显示引导，不产出偏离。
 * 成本口径只作对比展示，不参与 breach 判定；判定口径始终是市值。
 */
export function PolicyDriftSection({ portfolioId }: { portfolioId: string }) {
  const { t } = useTranslation();
  const { api, notify } = useWorkspace();
  const [policy, setPolicy] = useState<InvestmentPolicy | null>();
  const [drift, setDrift] = useState<PolicyDrift[]>();
  const [basis, setBasis] = useState<"market" | "cost">("market");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draftBasis, setDraftBasis] = useState<PolicyBasis>("asset_class");
  const [drafts, setDrafts] = useState<TargetDraft[]>([]);
  const draftSeed = useRef(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      setError("");
      try {
        const [nextPolicy, nextDrift] = await Promise.all([
          api.request<InvestmentPolicy | null>(`/api/portfolios/${portfolioId}/policy`),
          api.request<{ parts: PolicyDrift[] }>(
            `/api/portfolios/${portfolioId}/drift?valueBasis=${basis}`,
          ),
        ]);
        if (!active) return;
        setPolicy(nextPolicy);
        setDrift(nextDrift.parts);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [api, portfolioId, basis, reloadKey]);

  const openEditor = useCallback(() => {
    if (policy) {
      setDraftBasis(policy.basis);
      setDrafts(
        policy.targets.map((target) => ({
          id: `existing:${target.key}`,
          key: target.key,
          label: target.label,
          targetPercent: String(target.targetPercent),
          bandPercent: String(target.bandPercent),
        })),
      );
    } else {
      draftSeed.current += 1;
      setDraftBasis("asset_class");
      setDrafts([
        {
          id: `draft-${draftSeed.current}`,
          key: "",
          label: "",
          targetPercent: "",
          bandPercent: "5",
        },
      ]);
    }
    setConfirmDelete(false);
    setEditorError("");
    setEditing(true);
  }, [policy]);

  function addTarget() {
    draftSeed.current += 1;
    setDrafts((current) => [
      ...current,
      { id: `draft-${draftSeed.current}`, key: "", label: "", targetPercent: "", bandPercent: "5" },
    ]);
  }

  function updateDraft(id: string, patch: Partial<TargetDraft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    );
  }

  function removeDraft(id: string) {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  }

  const sum = drafts.reduce((total, draft) => total + (Number(draft.targetPercent) || 0), 0);
  const sumOk = Math.abs(sum - 100) <= POLICY_SUM_TOLERANCE;

  async function save() {
    if (saving) return;
    const targets = drafts.map((draft) => ({
      key: draft.key.trim(),
      label: draft.label.trim(),
      targetPercent: Number(draft.targetPercent),
      bandPercent: Number(draft.bandPercent) || 0,
    }));
    if (
      targets.some(
        (target) => !target.key || !target.label || !Number.isFinite(target.targetPercent),
      )
    ) {
      setEditorError(t("investor.policyValidation"));
      return;
    }
    setSaving(true);
    setEditorError("");
    try {
      const input: PolicyInput = { basis: draftBasis, targets };
      await api.request<InvestmentPolicy>(`/api/portfolios/${portfolioId}/policy`, input, "PUT");
      setEditing(false);
      notify(t("investor.policySaved"));
      setReloadKey((key) => key + 1);
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removePolicy() {
    if (saving) return;
    setSaving(true);
    setEditorError("");
    try {
      await api.request(`/api/portfolios/${portfolioId}/policy`, undefined, "DELETE");
      setEditing(false);
      notify(t("investor.policyDeleted"));
      setReloadKey((key) => key + 1);
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <SectionHeading
        title={t("investor.policyTitle")}
        action={policy ? t("investor.policyEdit") : t("investor.policySet")}
        onPress={openEditor}
      />
      <ErrorNotice error={error} />
      {policy === undefined ? (
        <ActivityIndicator color={colors.primary} />
      ) : policy === null ? (
        <Card variant="muted" style={{ gap: 8 }}>
          <Text style={s.small}>{t("investor.policyEmpty")}</Text>
          <Button small icon={Plus} onPress={openEditor} style={{ alignSelf: "flex-start" }}>
            {t("investor.policyCreate")}
          </Button>
        </Card>
      ) : (
        <>
          <View style={[s.between, { gap: 8, flexWrap: "wrap" }]}>
            <Chip variant="outline">{t(BASIS_LABEL_KEYS[policy.basis])}</Chip>
            <SelectableChipGroup
              multiple={false}
              options={[
                { value: "market" as const, label: t("investor.valueBasis.market") },
                { value: "cost" as const, label: t("investor.valueBasis.cost") },
              ]}
              value={[basis]}
              onChange={(next) => setBasis(next[0] ?? "market")}
            />
          </View>
          <Text style={s.small}>{t("investor.policyNote")}</Text>
          {drift === undefined ? (
            <ActivityIndicator color={colors.primary} />
          ) : drift.length === 0 ? (
            <Text style={s.small}>{t("investor.policyDriftEmpty")}</Text>
          ) : (
            drift.map((part) => (
              <Card key={`${part.basis}:${part.currency ?? "ALL"}`} style={{ gap: 8 }}>
                {part.currency ? (
                  <Text style={[s.text, { fontWeight: "600" }]}>
                    {t("investor.policyGroup", { currency: part.currency })}
                  </Text>
                ) : null}
                <View style={[s.row, { gap: 8 }]}>
                  <Text style={[s.small, { flex: 1 }]}>{t("investor.policyColKey")}</Text>
                  <Text style={[s.small, { width: 54, textAlign: "right" }]}>
                    {t("investor.policyColTarget")}
                  </Text>
                  <Text style={[s.small, { width: 54, textAlign: "right" }]}>
                    {t("investor.policyColActual")}
                  </Text>
                  <Text style={[s.small, { width: 54, textAlign: "right" }]}>
                    {t("investor.policyColDrift")}
                  </Text>
                </View>
                {part.rows.map((row) => (
                  <View key={row.key} style={[s.row, { gap: 8 }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[s.text, { fontWeight: "500" }]}>{row.label ?? row.key}</Text>
                      {row.status !== "within" ? (
                        <Text style={[s.small, { color: statusTint(row.status) }]}>
                          {t(DRIFT_LABEL_KEYS[row.status])}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[s.text, s.metric, { width: 54, textAlign: "right" }]}>
                      {pct(row.target)}
                    </Text>
                    <Text style={[s.text, s.metric, { width: 54, textAlign: "right" }]}>
                      {pct(row.actual)}
                    </Text>
                    <Text
                      style={[
                        s.text,
                        s.metric,
                        { width: 54, textAlign: "right", color: statusTint(row.status) },
                      ]}
                    >
                      {`${row.drift > 0 ? "+" : ""}${pct(row.drift)}`}
                    </Text>
                  </View>
                ))}
              </Card>
            ))
          )}
        </>
      )}
      {editing ? (
        <Sheet
          title={policy ? t("investor.policyEditorTitle") : t("investor.policyEditorNewTitle")}
          onClose={() => setEditing(false)}
          medium
        >
          <View style={{ gap: 14 }}>
            <View style={{ gap: 8 }}>
              <Text style={s.fieldLabel}>{t("investor.policyBasis")}</Text>
              <SelectableChipGroup
                multiple={false}
                options={POLICY_BASES.map((value) => ({
                  value,
                  label: t(BASIS_LABEL_KEYS[value]),
                }))}
                value={[draftBasis]}
                onChange={(next) => setDraftBasis(next[0] ?? "asset_class")}
              />
            </View>
            {drafts.map((draft) => (
              <Card key={draft.id} variant="muted" style={{ gap: 8 }}>
                <View style={[s.between, { gap: 8, alignItems: "flex-start" }]}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={t("investor.policyTargetKey")}
                      value={draft.key}
                      onChangeText={(text) => updateDraft(draft.id, { key: text })}
                      maxLength={40}
                    />
                  </View>
                  <IconButton
                    icon={Trash2}
                    label={t("investor.policyRemoveTarget")}
                    onPress={() => removeDraft(draft.id)}
                    style={{ marginTop: 4 }}
                  />
                </View>
                <Field
                  label={t("investor.policyTargetLabel")}
                  value={draft.label}
                  onChangeText={(text) => updateDraft(draft.id, { label: text })}
                  maxLength={60}
                />
                <View style={[s.row, { gap: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={t("investor.policyTargetPercent")}
                      value={draft.targetPercent}
                      onChangeText={(text) => updateDraft(draft.id, { targetPercent: text })}
                      keyboardType="numeric"
                      placeholder="0"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={t("investor.policyTargetBand")}
                      value={draft.bandPercent}
                      onChangeText={(text) => updateDraft(draft.id, { bandPercent: text })}
                      keyboardType="numeric"
                      placeholder="5"
                    />
                  </View>
                </View>
              </Card>
            ))}
            <Button small icon={Plus} onPress={addTarget} style={{ alignSelf: "flex-start" }}>
              {t("investor.policyAddTarget")}
            </Button>
            <Text style={[s.small, !sumOk && { color: colors.danger }]}>
              {t("investor.policySum", { sum: sum.toFixed(1) })}
            </Text>
            <ErrorNotice error={editorError} />
            {confirmDelete ? (
              <Card variant="muted" style={{ gap: 8 }}>
                <Text style={[s.text, { fontWeight: "500", color: colors.danger }]}>
                  {t("investor.policyDeleteConfirm")}
                </Text>
                <Text style={s.small}>{t("investor.policyDeleteNote")}</Text>
                <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                  <Button small danger disabled={saving} onPress={() => void removePolicy()}>
                    {t("investor.policyDeleteConfirmAction")}
                  </Button>
                  <Button small onPress={() => setConfirmDelete(false)}>
                    {t("common.cancel")}
                  </Button>
                </View>
              </Card>
            ) : (
              <View style={[s.row, { gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }]}>
                {policy ? (
                  <Button
                    small
                    variant="ghost"
                    icon={Trash2}
                    onPress={() => setConfirmDelete(true)}
                  >
                    {t("investor.policyDelete")}
                  </Button>
                ) : null}
                <Button small onPress={() => setEditing(false)}>
                  {t("common.cancel")}
                </Button>
                <Button small primary busy={saving} disabled={!sumOk} onPress={() => void save()}>
                  {t("investor.policySave")}
                </Button>
              </View>
            )}
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}
