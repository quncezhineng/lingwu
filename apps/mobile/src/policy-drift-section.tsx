/**
 * A2 目标配置与偏离分区（PRD-灵悟-主动服务与信任架构）。
 *
 * 挂在组合页（PortfolioScreen）总览之后、逐币种明细之前：总览回答「现在有多少钱」，
 * 这一块回答「离目标配置偏了多少」。硬口径：偏离按原币市值占比、分币种各算一份，
 * 不做汇率折算——口径声明（policy.note）必须展示。
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  type DriftStatus,
  type InvestmentPolicy,
  investmentPolicySchema,
  POLICY_BASES,
  POLICY_MARKET_NOTE,
  POLICY_SUM_TOLERANCE,
  type PolicyBasis,
  type PolicyDrift,
} from "../../../packages/domain/src/investor";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import { CircleAlert, CircleCheck, Pencil, Plus, Target, Trash2 } from "./icons";
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

const BASIS_KEYS: Record<PolicyBasis, TranslationKey> = {
  asset_class: "investor.basis.asset_class",
  sector: "investor.basis.sector",
  region: "investor.basis.region",
  currency: "investor.basis.currency",
};

const DRIFT_STATUS_KEYS: Record<DriftStatus, TranslationKey> = {
  within: "investor.driftStatusWithin",
  warning: "investor.driftStatusWarning",
  breach: "investor.driftStatusBreach",
};

function driftStatusColor(status: DriftStatus) {
  return status === "breach"
    ? colors.danger
    : status === "warning"
      ? colors.alertVolumeText
      : colors.success;
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/** 新建目标配置时的初始行：key 与维度分类口径对齐（asset_class=bond/equity 等）。 */
const DEFAULT_TARGETS: Record<PolicyBasis, DraftTarget[]> = {
  asset_class: [
    { id: "base-equity", key: "equity", label: "equity", targetPercent: "60", bandPercent: "5" },
    { id: "base-bond", key: "bond", label: "bond", targetPercent: "40", bandPercent: "5" },
  ],
  sector: [
    {
      id: "base-technology",
      key: "technology",
      label: "technology",
      targetPercent: "50",
      bandPercent: "5",
    },
    {
      id: "base-financials",
      key: "financials",
      label: "financials",
      targetPercent: "50",
      bandPercent: "5",
    },
  ],
  region: [
    { id: "base-CN", key: "CN", label: "CN", targetPercent: "50", bandPercent: "5" },
    { id: "base-US", key: "US", label: "US", targetPercent: "50", bandPercent: "5" },
  ],
  currency: [
    { id: "base-CNY", key: "CNY", label: "CNY", targetPercent: "50", bandPercent: "5" },
    { id: "base-USD", key: "USD", label: "USD", targetPercent: "50", bandPercent: "5" },
  ],
};

interface DraftTarget {
  /** 客户端稳定行标识：仅用于列表 key，避免编辑时按内容 key 导致输入框重挂载。 */
  id: string;
  key: string;
  label: string;
  targetPercent: string;
  bandPercent: string;
}

let targetRowSeq = 0;
function targetRowId() {
  targetRowSeq += 1;
  return `target-${targetRowSeq}`;
}

/** 一行偏离：左侧名称 + 目标/实际/差额，右侧档位 + 容忍带。 */
function DriftRow({ row, divided }: { row: PolicyDrift["rows"][number]; divided: boolean }) {
  const { t } = useTranslation();
  const color = driftStatusColor(row.status);
  return (
    <View
      style={[
        s.row,
        { gap: space.compact, paddingVertical: space.tight, alignItems: "flex-start" },
        divided && { borderTopWidth: 1, borderTopColor: colors.line },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.text, { fontWeight: "500" }]}>{row.label}</Text>
        <Text style={s.small}>
          {t("investor.driftColTarget")} {percent(row.target)} · {t("investor.driftColActual")}{" "}
          {percent(row.actual)} · {t("investor.driftColGap")} {signedPercent(row.drift)}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text style={[s.small, { color, fontWeight: "600" }]}>
          {t(DRIFT_STATUS_KEYS[row.status])}
        </Text>
        <Text style={[s.small, { color: colors.faint }]}>
          {t("investor.driftColBand")} ±{percent(row.band)}
        </Text>
      </View>
    </View>
  );
}

function PolicyEditorSheet({
  portfolioId,
  initial,
  onClose,
  onSaved,
}: {
  portfolioId: string;
  initial: InvestmentPolicy | null;
  onClose: () => void;
  onSaved: (policy: InvestmentPolicy) => void;
}) {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const initialBasis = initial?.basis ?? "asset_class";
  const [basis, setBasis] = useState<PolicyBasis>(initialBasis);
  const [targets, setTargets] = useState<DraftTarget[]>(
    initial
      ? initial.targets.map((target) => ({
          id: targetRowId(),
          key: target.key,
          label: target.label,
          targetPercent: String(target.targetPercent),
          bandPercent: String(target.bandPercent),
        }))
      : DEFAULT_TARGETS[initialBasis],
  );
  const [note, setNote] = useState(initial?.note ?? POLICY_MARKET_NOTE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const sum = targets.reduce((total, row) => {
    const value = Number(row.targetPercent);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
  const sumOff = Math.abs(sum - 100) > POLICY_SUM_TOLERANCE;

  function changeBasis(next: PolicyBasis) {
    setBasis(next);
    // 切换维度即换一套分类口径，行内容随之重设（用户可在新口径上继续改）。
    setTargets(DEFAULT_TARGETS[next]);
  }

  function updateTarget(index: number, patch: Partial<DraftTarget>) {
    setTargets((current) =>
      current.map((row, position) => (position === index ? { ...row, ...patch } : row)),
    );
  }

  async function save() {
    if (saving) return;
    if (sumOff) {
      setError(t("investor.policySumError"));
      return;
    }
    const payload = {
      basis,
      targets: targets.map((row) => ({
        key: row.key.trim(),
        label: row.label.trim(),
        targetPercent: Number(row.targetPercent),
        bandPercent: row.bandPercent.trim() === "" ? 5 : Number(row.bandPercent),
      })),
      note: note.trim() || POLICY_MARKET_NOTE,
    };
    const parsed = investmentPolicySchema.safeParse(payload);
    if (!parsed.success) {
      setError(t("investor.policySaveFailed"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await api.request<InvestmentPolicy>(
        `/api/portfolios/${portfolioId}/policy`,
        parsed.data,
        "PUT",
      );
      notify(t("investor.policySaved"));
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title={initial ? t("investor.policyEdit") : t("investor.policySet")} onClose={onClose}>
      <View style={{ gap: space.md }}>
        <View style={{ gap: space.xs }}>
          <Text style={s.fieldLabel}>{t("investor.policyBasisLabel")}</Text>
          <View style={[s.row, { gap: space.xxs, flexWrap: "wrap" }]}>
            {POLICY_BASES.map((item) => (
              <SelectableChip
                key={item}
                label={t(BASIS_KEYS[item])}
                active={basis === item}
                onPress={() => changeBasis(item)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          {targets.map((row, index) => (
            <Card key={row.id} variant="muted" style={{ gap: space.sm }}>
              <View style={[s.row, { gap: space.sm }]}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t("investor.targetKeyColumn")}
                    value={row.key}
                    onChangeText={(value) => updateTarget(index, { key: value })}
                    autoCapitalize="none"
                    maxLength={40}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t("investor.targetLabelColumn")}
                    value={row.label}
                    onChangeText={(value) => updateTarget(index, { label: value })}
                    maxLength={60}
                  />
                </View>
              </View>
              <View style={[s.row, { gap: space.sm, alignItems: "flex-end" }]}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t("investor.targetPercentColumn")}
                    value={row.targetPercent}
                    onChangeText={(value) => updateTarget(index, { targetPercent: value })}
                    keyboardType="decimal-pad"
                    maxLength={6}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t("investor.bandPercentColumn")}
                    value={row.bandPercent}
                    onChangeText={(value) => updateTarget(index, { bandPercent: value })}
                    keyboardType="decimal-pad"
                    maxLength={6}
                  />
                </View>
                <IconButton
                  icon={Trash2}
                  label={t("investor.removeTarget")}
                  disabled={targets.length <= 1}
                  style={{ marginBottom: space.md }}
                  onPress={() => setTargets((current) => current.filter((_, i) => i !== index))}
                />
              </View>
            </Card>
          ))}
          <Button
            small
            icon={Plus}
            disabled={targets.length >= 30}
            onPress={() =>
              setTargets((current) => [
                ...current,
                { id: targetRowId(), key: "", label: "", targetPercent: "0", bandPercent: "5" },
              ])
            }
          >
            {t("investor.addTarget")}
          </Button>
        </View>

        <View style={[s.row, { gap: space.xxs, paddingVertical: space.xxs }]}>
          {sumOff ? (
            <CircleAlert size={14} color={colors.danger} />
          ) : (
            <CircleCheck size={14} color={colors.success} />
          )}
          <Text style={[s.small, { color: sumOff ? colors.danger : colors.success }]}>
            {percent(sum)} / 100%
          </Text>
        </View>

        <Field
          label={t("investor.policyNoteLabel")}
          value={note}
          onChangeText={setNote}
          maxLength={200}
        />
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

/**
 * 目标配置与偏离分区。组合页只需要传 portfolioId：
 * 配置读写走 `/api/portfolios/:id/policy`，偏离读 `/drift?valueBasis=`。
 */
export function PolicyDriftSection({ portfolioId }: { portfolioId: string }) {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  /** undefined = 加载中；null = 尚未设置目标配置。 */
  const [policy, setPolicy] = useState<InvestmentPolicy | null | undefined>(undefined);
  const [parts, setParts] = useState<PolicyDrift[]>([]);
  const [valueBasis, setValueBasis] = useState<"market" | "cost">("market");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await api.request<InvestmentPolicy | null>(
        `/api/portfolios/${portfolioId}/policy`,
      );
      setPolicy(next ?? null);
      if (!next) {
        setParts([]);
        return;
      }
      const drift = await api.request<{ parts: PolicyDrift[] }>(
        `/api/portfolios/${portfolioId}/drift?valueBasis=${valueBasis}`,
      );
      setParts(drift.parts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api, portfolioId, valueBasis]);

  useEffect(() => {
    void load();
  }, [load]);

  async function removePolicy() {
    if (removing) return;
    setRemoving(true);
    setError("");
    try {
      await api.request<void>(`/api/portfolios/${portfolioId}/policy`, undefined, "DELETE");
      setPolicy(null);
      setParts([]);
      notify(t("investor.policyRemoved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      <SectionHeading
        title={t("investor.policyHeading")}
        style={{ marginBottom: 0 }}
        actions={
          policy ? (
            <View style={[s.row, { gap: space.xxs }]}>
              <IconButton
                icon={Pencil}
                label={t("investor.policyEdit")}
                onPress={() => setEditing(true)}
              />
              <IconButton
                icon={Trash2}
                label={t("investor.policyRemove")}
                disabled={removing}
                onPress={() => void removePolicy()}
              />
            </View>
          ) : undefined
        }
      />

      {error ? <ErrorNotice error={error} /> : null}

      {policy === undefined ? (
        error ? null : (
          <ActivityIndicator color={colors.primary} />
        )
      ) : policy === null ? (
        <Card variant="muted" style={{ alignItems: "center", gap: space.sm }}>
          <Target size={22} color={colors.faint} />
          <Text style={[s.text, { fontWeight: "500" }]}>{t("investor.policyEmpty")}</Text>
          <Text style={[s.small, { textAlign: "center" }]}>{t("investor.policyEmptyDetail")}</Text>
          <Button small primary icon={Target} onPress={() => setEditing(true)}>
            {t("investor.policySet")}
          </Button>
        </Card>
      ) : (
        <Card style={{ gap: space.sm }}>
          <View style={[s.between, { gap: space.sm, flexWrap: "wrap" }]}>
            <Text style={[s.small, { color: colors.faint }]}>
              {t("investor.policyBasisLabel")} · {t(BASIS_KEYS[policy.basis])}
            </Text>
            <View style={[s.row, { gap: space.xxs }]}>
              <SelectableChip
                label={t("investor.valueBasisMarket")}
                active={valueBasis === "market"}
                onPress={() => setValueBasis("market")}
              />
              <SelectableChip
                label={t("investor.valueBasisCost")}
                active={valueBasis === "cost"}
                onPress={() => setValueBasis("cost")}
              />
            </View>
          </View>

          <Text style={[s.small, { color: colors.alertVolumeText }]}>
            {t("investor.policyNoteLabel")} · {policy.note}
          </Text>

          {parts.length === 0 ? (
            <Text style={s.small}>{t("investor.driftNoParts")}</Text>
          ) : (
            <View style={{ gap: space.sm }}>
              {parts.map((part) => (
                <View key={part.currency ?? part.basis} style={{ gap: space.xxs }}>
                  <Text style={[s.text, { fontWeight: "600" }]}>
                    {part.currency
                      ? t("investor.driftCurrency", { currency: part.currency })
                      : t("investor.policyHeading")}
                  </Text>
                  {part.rows.map((row, index) => (
                    <DriftRow key={row.key} row={row} divided={index > 0} />
                  ))}
                </View>
              ))}
            </View>
          )}
        </Card>
      )}

      {editing && (
        <PolicyEditorSheet
          portfolioId={portfolioId}
          initial={policy ?? null}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setPolicy(saved);
            void load();
          }}
        />
      )}
    </View>
  );
}
