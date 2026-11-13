/**
 * OPT-03 我的模板：从交付物反推口径、可解释匹配与复用度量。
 *
 * 内置能力目录不混入此页；这里只展示用户自己保存或他人主动共享的模板。
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./app-text";
import {
  createDeliverable,
  DELIVERABLE_KINDS,
  type DeliverableKind,
  loadDeliverables,
  useDeliverablesState,
} from "./deliverables";
import type { TranslationKey } from "./i18n";
import { useTranslation } from "./i18n";
import { Check, FileText, Link2, Plus, Sparkles } from "./icons";
import {
  acceptTemplate,
  createTemplateFromDeliverable,
  editReduction,
  loadTemplates,
  matchTemplates,
  rejectTemplate,
  setTemplateShared,
  type TemplateMatch,
  type UserTemplate,
  useTemplatesState,
} from "./templates";
import { Button, Card, Chip, colors, Empty, ErrorNotice, Field, SectionHeading, s } from "./ui";
import { useWorkspace } from "./workspace";

const KIND_KEYS: Record<DeliverableKind, TranslationKey> = {
  BRIEFING: "screens.deliverableKindBriefing",
  REPORT: "screens.deliverableKindReport",
  MINUTES: "screens.deliverableKindMinutes",
  ONE_PAGER: "screens.deliverableKindOnePager",
  REVIEW: "screens.deliverableKindReview",
  TABLE: "screens.deliverableKindTable",
  CUSTOM: "screens.deliverableKindCustom",
};

export function TemplateScreen() {
  const { api, notify, navigate } = useWorkspace();
  const { t } = useTranslation();
  const state = useTemplatesState();
  const deliverables = useDeliverablesState();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<DeliverableKind>("REPORT");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<TemplateMatch[]>([]);

  useEffect(() => {
    void loadTemplates(api, true);
    void loadDeliverables(api);
  }, [api]);

  const sources = useMemo(() => deliverables.items.slice(0, 6), [deliverables.items]);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      notify(message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  async function derive(deliverableId: string) {
    await run(
      () => createTemplateFromDeliverable(api, deliverableId),
      t("screens.templateCreated"),
    );
  }

  async function search() {
    setBusy(true);
    setError(undefined);
    try {
      setMatches(await matchTemplates(api, { kind, title: query.trim() || undefined, limit: 3 }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  async function applyTemplate(match: TemplateMatch) {
    setBusy(true);
    setError(undefined);
    try {
      await createDeliverable(api, {
        kind,
        title: query.trim() || match.name,
        content: match.sampleContent,
        sources: [],
        template_id: match.templateId,
        template_version: String(match.version),
      });
      await acceptTemplate(api, match.templateId, { kind, title: query.trim() || undefined });
      notify(t("screens.templateApplied"));
      navigate("deliverables");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  async function reject(match: TemplateMatch) {
    await run(
      () => rejectTemplate(api, match.templateId, { kind, title: query.trim() || undefined }),
      t("screens.templateRejected"),
    );
    setMatches((current) => current.filter((item) => item.templateId !== match.templateId));
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={[s.between, { gap: 12, flexWrap: "wrap" }]}>
        <View>
          <Text style={[s.heading, { fontSize: 18 }]}>{t("screens.templateTitle")}</Text>
          <Text style={s.small}>{t("screens.templateSubtitle")}</Text>
        </View>
      </View>

      {error ? <ErrorNotice error={error} /> : null}

      <Card style={{ gap: 10 }}>
        <SectionHeading title={t("screens.templateMatchTitle")} />
        <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
          {DELIVERABLE_KINDS.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              onPress={() => setKind(item)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: kind === item ? colors.primary : colors.line,
                backgroundColor: kind === item ? colors.sky : "transparent",
              }}
            >
              <Text style={s.small}>{t(KIND_KEYS[item])}</Text>
            </Pressable>
          ))}
        </View>
        <Field
          label={t("screens.templateMatchQuery")}
          value={query}
          onChangeText={setQuery}
          placeholder={t("screens.templateMatchPlaceholder")}
        />
        <Button icon={Sparkles} busy={busy} onPress={() => void search()}>
          {t("screens.templateMatchAction")}
        </Button>
        {matches.map((match) => (
          <View
            key={match.templateId}
            style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderColor: colors.lineSoft }}
          >
            <View style={[s.between, { gap: 8 }]}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
                {match.name}
              </Text>
              <Chip>{t("screens.templateScore", { score: match.score })}</Chip>
            </View>
            <Text style={s.small}>
              v{match.version} ·{" "}
              {t("screens.templateReuseCount", { count: match.metrics.reuseCount })}
            </Text>
            <Text style={s.small}>
              {match.reasons.join(" · ") || t("screens.templateNoReason")}
            </Text>
            <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
              <Button small icon={Check} busy={busy} onPress={() => void applyTemplate(match)}>
                {t("screens.templateUse")}
              </Button>
              <Button small quietBusy onPress={() => void reject(match)}>
                {t("screens.templateNotThis")}
              </Button>
            </View>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 10 }}>
        <SectionHeading title={t("screens.templateFromDeliverable")} count={sources.length} />
        {sources.length === 0 ? (
          <Text style={s.small}>{t("screens.templateNoDeliverables")}</Text>
        ) : (
          sources.map((item) => (
            <View key={item.id} style={[s.between, { gap: 8 }]}>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Text style={s.text} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={s.small}>
                  {t(KIND_KEYS[item.kind])} · v{item.version}
                </Text>
              </View>
              <Button small icon={Plus} busy={busy} onPress={() => void derive(item.id)}>
                {t("screens.templateDerive")}
              </Button>
            </View>
          ))
        )}
      </Card>

      <Card style={{ gap: 10 }}>
        <SectionHeading title={t("screens.templateMine")} count={state.templates.length} />
        {state.templates.length === 0 ? (
          <Empty
            icon={FileText}
            title={t("screens.templateEmptyTitle")}
            detail={t("screens.templateEmptyDetail")}
          />
        ) : (
          state.templates.map((template) => (
            <TemplateRow key={template.id} template={template} busy={busy} onShared={run} />
          ))
        )}
      </Card>

      <Card style={{ gap: 10 }}>
        <SectionHeading title={t("screens.templateShared")} count={state.shared.length} />
        {state.shared.length === 0 ? (
          <Text style={s.small}>{t("screens.templateNoShared")}</Text>
        ) : (
          state.shared.map((template) => (
            <View key={template.id} style={{ gap: 2 }}>
              <Text style={s.text}>{template.name}</Text>
              <Text style={s.small}>
                {t(KIND_KEYS[template.kind])} · v{template.version}
              </Text>
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

function TemplateRow({
  template,
  busy,
  onShared,
}: {
  template: UserTemplate;
  busy: boolean;
  onShared: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const { api } = useWorkspace();
  const { t } = useTranslation();
  const reduction = editReduction(template.metrics);
  return (
    <View
      style={{ gap: 6, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.lineSoft }}
    >
      <View style={[s.between, { gap: 8 }]}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{template.name}</Text>
        <Chip>{t("screens.templateVersion", { version: template.version })}</Chip>
      </View>
      <Text style={s.small}>{template.description}</Text>
      <Text style={s.small}>
        {t("screens.templateSections", { count: template.structure.length })} ·{" "}
        {t("screens.templateFields", { count: template.fields.length })} ·{" "}
        {t("screens.templateReuseCount", { count: template.metrics.reuseCount })}
      </Text>
      <Text style={s.small}>
        {t("screens.templateLatestEdit", {
          ratio:
            template.metrics.latestEditRatio === undefined
              ? t("screens.templateNoData")
              : `${Math.round(template.metrics.latestEditRatio * 100)}%`,
        })}
        {reduction === undefined
          ? ""
          : ` · ${t("screens.templateEditReduction", { ratio: `${Math.round(reduction * 100)}%` })}`}
        {template.metrics.needsClarification ? ` · ${t("screens.templateNeedsClarification")}` : ""}
      </Text>
      <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
        <Button
          small
          icon={Link2}
          quietBusy
          disabled={busy}
          onPress={() =>
            void onShared(
              () => setTemplateShared(api, template.id, !template.shared),
              template.shared ? t("screens.templateUnshared") : t("screens.templateSharedDone"),
            )
          }
        >
          {template.shared ? t("screens.templateStopShare") : t("screens.templateShare")}
        </Button>
        {template.versions.slice(-3).map((version) => (
          <Text key={version.id} style={s.small}>
            v{version.version} · {version.summary}
          </Text>
        ))}
      </View>
    </View>
  );
}
