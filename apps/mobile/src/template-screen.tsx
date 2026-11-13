/**
 * OPT-03 我的模板与内置能力。
 *
 * 三个明确分表：
 * - 我的口径：用户模板，可编辑、可分享、可查看版本与质量分；
 * - 团队共享：其他成员主动分享的模板，只读；
 * - 内置能力：184 条只读技能，不允许编辑，也不与用户模板混排。
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import type { LingWuApi } from "./api";
import { Text, TextInput } from "./app-text";
import { createDeliverable, type DeliverableKind } from "./deliverables";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import { FileText, Plus, Share2 } from "./icons";
import { skillCatalog } from "./skill-catalog";
import {
  acceptTemplate,
  editReduction,
  loadTemplates,
  matchTemplates,
  rejectTemplate,
  setTemplateShared,
  type TemplateMatch,
  type TemplateMetrics,
  type UserTemplate,
  updateTemplate,
  useTemplatesState,
} from "./templates";
import { radius, space } from "./theme";
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

const KIND_KEYS: Record<DeliverableKind, TranslationKey> = {
  BRIEFING: "deliverables.kindBriefing",
  REPORT: "deliverables.kindReport",
  MINUTES: "deliverables.kindMinutes",
  ONE_PAGER: "deliverables.kindOnePager",
  REVIEW: "deliverables.kindReview",
  TABLE: "deliverables.kindTable",
  CUSTOM: "deliverables.kindCustom",
};

const TONE_KEYS: Record<"formal" | "direct" | "concise", TranslationKey> = {
  formal: "templates.toneFormal",
  direct: "templates.toneDirect",
  concise: "templates.toneConcise",
};

function percent(value?: number): string {
  return value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 72, gap: 2 }}>
      <Text style={[s.small, { fontSize: 10, color: colors.faint }]}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>{value}</Text>
    </View>
  );
}

function MetricsPanel({ metrics }: { metrics: TemplateMetrics }) {
  const { t } = useTranslation();
  const reduction = editReduction(metrics);
  return (
    <View style={{ gap: 8 }}>
      <View style={[s.row, { gap: 16, flexWrap: "wrap" }]}>
        <Metric label={t("templates.metricReuse")} value={String(metrics.reuseCount)} />
        <Metric label={t("templates.metricFirstEdit")} value={percent(metrics.firstEditRatio)} />
        <Metric label={t("templates.metricLatestEdit")} value={percent(metrics.latestEditRatio)} />
        <Metric label={t("templates.metricReduction")} value={percent(reduction)} />
        <Metric label={t("templates.metricAccuracy")} value={percent(metrics.matchAccuracy)} />
      </View>
      {metrics.needsClarification && (
        <View
          style={{
            padding: 9,
            borderRadius: radius.card,
            backgroundColor: colors.alertVolume,
          }}
        >
          <Text style={[s.small, { color: colors.alertVolumeText, fontWeight: "600" }]}>
            {t("templates.needsClarification")}
          </Text>
        </View>
      )}
    </View>
  );
}

function TemplateCard({
  template,
  readonly,
  onOpen,
  onShare,
  onUse,
}: {
  template: UserTemplate;
  readonly?: boolean;
  onOpen: () => void;
  onShare?: () => void;
  onUse: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card style={{ padding: 14, gap: 8, height: "100%" }}>
      <View style={[s.between, { gap: 8 }]}>
        <View style={[s.row, { gap: 5, flexWrap: "wrap", flex: 1 }]}>
          <Chip>{t(KIND_KEYS[template.kind])}</Chip>
          <Text style={[s.small, { fontSize: 11, color: colors.faint }]}>v{template.version}</Text>
          {template.shared && (
            <Text style={[s.small, { fontSize: 10, color: colors.primaryStrong }]}>
              {t("templates.sharedBadge")}
            </Text>
          )}
        </View>
        <Text style={[s.small, { fontSize: 10, color: colors.faint }]}>
          {new Date(template.updatedAt).toLocaleDateString()}
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onOpen} style={{ gap: 5 }}>
        <Text style={[s.text, { fontSize: 15, fontWeight: "600" }]} numberOfLines={2}>
          {template.name}
        </Text>
        <Text style={s.small} numberOfLines={2}>
          {template.description}
        </Text>
      </Pressable>
      <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
        <Text style={[s.small, { fontSize: 11 }]}>
          {t("templates.cardStructure", { count: template.structure.length })}
        </Text>
        <Text style={[s.small, { fontSize: 11 }]}>
          {t("templates.cardFields", { count: template.fields.length })}
        </Text>
        <Text style={[s.small, { fontSize: 11 }]}>
          {t("templates.cardReuse", { count: template.metrics.reuseCount })}
        </Text>
        {template.metrics.needsClarification && (
          <Text style={[s.small, { fontSize: 11, color: colors.alertVolumeText }]}>
            {t("templates.notClear")}
          </Text>
        )}
      </View>
      <View style={[s.row, { gap: 7, flexWrap: "wrap" }]}>
        <Button small style={{ minHeight: 40 }} onPress={onOpen}>
          {t("templates.open")}
        </Button>
        {!readonly && (
          <Button small primary style={{ minHeight: 40 }} onPress={onUse}>
            {t("templates.use")}
          </Button>
        )}
        {onShare && (
          <Button small style={{ minHeight: 40 }} onPress={onShare}>
            {template.shared ? t("templates.unshare") : t("templates.share")}
          </Button>
        )}
      </View>
    </Card>
  );
}

function UseTemplateSheet({
  template,
  onClose,
}: {
  template: {
    id: string;
    name: string;
    version: number;
    sampleContent: string;
    kind: DeliverableKind;
  };
  onClose: () => void;
}) {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const [title, setTitle] = useState(template.name);
  const [content, setContent] = useState(template.sampleContent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    setError("");
    try {
      await createDeliverable(api, {
        kind: template.kind,
        title: title.trim(),
        content: content.trim(),
        template_id: template.id,
        template_version: `${template.id}@v${template.version}`,
      });
      notify(t("templates.deliverableCreated"));
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("templates.useTitle", { name: template.name })} onClose={onClose} small>
      <View style={{ gap: space.sm }}>
        <Text style={s.small}>{t("templates.useHint")}</Text>
        <ErrorNotice error={error} />
        <Field label={t("deliverables.titleLabel")} value={title} onChangeText={setTitle} />
        <Field
          label={t("deliverables.contentLabel")}
          value={content}
          onChangeText={setContent}
          multiline
        />
        <Button primary busy={busy} onPress={() => void create()}>
          {t("templates.createDraft")}
        </Button>
      </View>
    </Sheet>
  );
}

function TemplateDetail({
  template,
  onClose,
  onChanged,
  onUse,
}: {
  template: UserTemplate;
  onClose: () => void;
  onChanged: (next: UserTemplate) => void;
  onUse: () => void;
}) {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [structure, setStructure] = useState(template.structure);
  const [fields, setFields] = useState(template.fields);
  const [units, setUnits] = useState(template.voice.units.join(", "));
  const [conventions, setConventions] = useState(template.voice.conventions.join("\n"));
  const [tone, setTone] = useState(template.voice.tone);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const next = await updateTemplate(api, template.id, {
        name: name.trim(),
        description: description.trim(),
        structure: structure.map((item, index) => ({
          id: item.id,
          title: item.title.trim(),
          required: item.required,
          instructions: item.instructions,
          order: index,
        })),
        fields: fields.map((item) => ({
          id: item.id,
          label: item.label.trim(),
          required: item.required,
          unit: item.unit,
        })),
        voice: {
          tone,
          units: units
            .split(/[,，]/)
            .map((item) => item.trim())
            .filter(Boolean),
          conventions: conventions
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        },
        summary: "编辑模板口径",
      });
      setEditing(false);
      notify(t("templates.savedVersion"));
      onChanged(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={template.name}
      subtitle={`${t(KIND_KEYS[template.kind])} · v${template.version}`}
      onClose={onClose}
      fullscreen
      headerAction={template.shared ? <Chip>{t("templates.sharedBadge")}</Chip> : undefined}
    >
      <View style={{ gap: space.md }}>
        <ErrorNotice error={error} />
        <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
          <Button primary onPress={onUse}>
            {t("templates.use")}
          </Button>
          <Button onPress={() => setEditing((value) => !value)}>
            {editing ? t("templates.cancelEdit") : t("templates.edit")}
          </Button>
          <Button
            busy={busy}
            onPress={() =>
              void setTemplateShared(api, template.id, !template.shared).then((next) => {
                notify(next.shared ? t("templates.sharedNow") : t("templates.unsharedNow"));
                onChanged(next);
              })
            }
          >
            {template.shared ? t("templates.unshare") : t("templates.share")}
          </Button>
        </View>

        {editing ? (
          <Card style={{ gap: 9 }}>
            <Field label={t("templates.name")} value={name} onChangeText={setName} />
            <Field
              label={t("templates.description")}
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <SectionHeading title={t("templates.structure")} />
            {structure.map((item, index) => (
              <View key={item.id} style={[s.row, { gap: 6 }]}>
                <TextInput
                  value={item.title}
                  onChangeText={(value) =>
                    setStructure((items) =>
                      items.map((entry, at) => (at === index ? { ...entry, title: value } : entry)),
                    )
                  }
                  style={[s.input, { flex: 1 }]}
                  accessibilityLabel={t("templates.sectionTitle")}
                />
                <Button
                  small
                  onPress={() =>
                    setStructure((items) =>
                      items.map((entry, at) =>
                        at === index ? { ...entry, required: !entry.required } : entry,
                      ),
                    )
                  }
                >
                  {item.required ? t("templates.required") : t("templates.optional")}
                </Button>
                <Button
                  small
                  danger
                  onPress={() => setStructure((items) => items.filter((_, at) => at !== index))}
                >
                  ×
                </Button>
              </View>
            ))}
            <Button
              small
              icon={Plus}
              onPress={() =>
                setStructure((items) => [
                  ...items,
                  {
                    id: `new-section-${Date.now()}`,
                    title: t("templates.newSection"),
                    order: items.length,
                    required: true,
                  },
                ])
              }
            >
              {t("templates.addSection")}
            </Button>
            <SectionHeading title={t("templates.fields")} />
            {fields.map((item, index) => (
              <View key={item.id} style={[s.row, { gap: 6 }]}>
                <TextInput
                  value={item.label}
                  onChangeText={(value) =>
                    setFields((items) =>
                      items.map((entry, at) => (at === index ? { ...entry, label: value } : entry)),
                    )
                  }
                  style={[s.input, { flex: 1 }]}
                  accessibilityLabel={t("templates.fieldLabel")}
                />
                <TextInput
                  value={item.unit ?? ""}
                  onChangeText={(value) =>
                    setFields((items) =>
                      items.map((entry, at) => (at === index ? { ...entry, unit: value } : entry)),
                    )
                  }
                  placeholder={t("templates.unit")}
                  placeholderTextColor={colors.faint}
                  style={[s.input, { width: 74 }]}
                  accessibilityLabel={t("templates.unit")}
                />
                <Button
                  small
                  onPress={() =>
                    setFields((items) =>
                      items.map((entry, at) =>
                        at === index ? { ...entry, required: !entry.required } : entry,
                      ),
                    )
                  }
                >
                  {item.required ? t("templates.required") : t("templates.optional")}
                </Button>
                <Button
                  small
                  danger
                  onPress={() => setFields((items) => items.filter((_, at) => at !== index))}
                >
                  ×
                </Button>
              </View>
            ))}
            <Button
              small
              icon={Plus}
              onPress={() =>
                setFields((items) => [
                  ...items,
                  {
                    id: `new-field-${Date.now()}`,
                    label: t("templates.newField"),
                    required: false,
                  },
                ])
              }
            >
              {t("templates.addField")}
            </Button>
            <SectionHeading title={t("templates.voice")} />
            <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
              {(
                [
                  ["formal", "templates.toneFormal"],
                  ["direct", "templates.toneDirect"],
                  ["concise", "templates.toneConcise"],
                ] as const
              ).map(([value, key]) => (
                <Button key={value} small primary={tone === value} onPress={() => setTone(value)}>
                  {t(key)}
                </Button>
              ))}
            </View>
            <Field label={t("templates.units")} value={units} onChangeText={setUnits} />
            <Field
              label={t("templates.conventions")}
              value={conventions}
              onChangeText={setConventions}
              multiline
            />
            <Button primary busy={busy} onPress={() => void save()}>
              {t("templates.saveVersion")}
            </Button>
          </Card>
        ) : (
          <>
            <Card style={{ gap: 8 }}>
              <Text style={s.text}>{template.description}</Text>
              <MetricsPanel metrics={template.metrics} />
            </Card>
            <Card style={{ gap: 8 }}>
              <SectionHeading title={t("templates.structure")} style={{ marginBottom: 0 }} />
              {template.structure.map((item) => (
                <View key={item.id} style={[s.row, { gap: 6 }]}>
                  <Text style={[s.small, { minWidth: 20, color: colors.faint }]}>
                    {item.order + 1}
                  </Text>
                  <Text style={[s.text, { flex: 1, fontSize: 13 }]}>{item.title}</Text>
                  <Text style={[s.small, { fontSize: 10, color: colors.faint }]}>
                    {item.required ? t("templates.required") : t("templates.optional")}
                  </Text>
                </View>
              ))}
            </Card>
            <Card style={{ gap: 8 }}>
              <SectionHeading title={t("templates.fields")} style={{ marginBottom: 0 }} />
              {template.fields.length ? (
                <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
                  {template.fields.map((item) => (
                    <Chip key={item.id}>
                      {item.label}
                      {item.unit ? `（${item.unit}）` : ""}
                      {item.required ? " *" : ""}
                    </Chip>
                  ))}
                </View>
              ) : (
                <Text style={s.small}>{t("templates.noFields")}</Text>
              )}
            </Card>
            <Card style={{ gap: 8 }}>
              <SectionHeading title={t("templates.voice")} style={{ marginBottom: 0 }} />
              <Text style={s.small}>
                {t("templates.toneLabel")}：{t(TONE_KEYS[template.voice.tone])}·{" "}
                {t("templates.languageLabel")}：{template.voice.language}
              </Text>
              {!!template.voice.units.length && (
                <Text style={s.small}>
                  {t("templates.units")}：{template.voice.units.join("、")}
                </Text>
              )}
              {template.voice.conventions.map((line) => (
                <Text key={line} style={s.small}>
                  · {line}
                </Text>
              ))}
            </Card>
            <Card style={{ gap: 8 }}>
              <SectionHeading title={t("templates.counterexamples")} style={{ marginBottom: 0 }} />
              {template.counterexamples.length ? (
                template.counterexamples.map((item) => (
                  <View key={item.id} style={{ gap: 2 }}>
                    <Text style={[s.small, { textDecorationLine: "line-through" }]}>
                      {item.text}
                    </Text>
                    <Text style={[s.small, { fontSize: 10, color: colors.faint }]}>
                      {item.reason === "removed"
                        ? t("templates.removedLine")
                        : t("templates.rewrittenLine")}
                      {item.preferred ? ` → ${item.preferred}` : ""}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={s.small}>{t("templates.noCounterexamples")}</Text>
              )}
            </Card>
            <Card style={{ gap: 8 }}>
              <SectionHeading title={t("templates.versions")} style={{ marginBottom: 0 }} />
              {[...template.versions]
                .reverse()
                .slice(0, 6)
                .map((version) => (
                  <View key={version.id} style={{ gap: 2 }}>
                    <Text style={[s.small, { fontWeight: "600" }]}>
                      v{version.version} · {new Date(version.createdAt).toLocaleString()}
                    </Text>
                    <Text style={[s.small, { fontSize: 11 }]}>{version.summary}</Text>
                  </View>
                ))}
            </Card>
          </>
        )}
      </View>
    </Sheet>
  );
}

function MatchTester({ onUse }: { onUse: (match: TemplateMatch, kind: DeliverableKind) => void }) {
  const { api } = useWorkspace();
  const { t } = useTranslation();
  const [kind, setKind] = useState<DeliverableKind>("REPORT");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [matches, setMatches] = useState<TemplateMatch[]>([]);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      setMatches(await matchTemplates(api, { kind, title, prompt, limit: 3 }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 9 }}>
      <SectionHeading title={t("templates.matchTitle")} style={{ marginBottom: 0 }} />
      <Text style={s.small}>{t("templates.matchHint")}</Text>
      <View style={[s.row, { gap: 5, flexWrap: "wrap" }]}>
        {(Object.keys(KIND_KEYS) as DeliverableKind[]).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: kind === item }}
            onPress={() => setKind(item)}
            style={{
              paddingHorizontal: 9,
              paddingVertical: 5,
              borderRadius: radius.full,
              backgroundColor: kind === item ? colors.sky : colors.surfaceSoft,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: kind === item ? "600" : "500" }}>
              {t(KIND_KEYS[item])}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t("templates.matchTitlePlaceholder")}
        placeholderTextColor={colors.faint}
        style={s.input}
        accessibilityLabel={t("templates.matchTitlePlaceholder")}
      />
      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        placeholder={t("templates.matchPromptPlaceholder")}
        placeholderTextColor={colors.faint}
        multiline
        style={[s.input, { minHeight: 72, textAlignVertical: "top" }]}
        accessibilityLabel={t("templates.matchPromptPlaceholder")}
      />
      <Button small primary busy={busy} onPress={() => void run()}>
        {t("templates.matchAction")}
      </Button>
      {matches.map((match) => (
        <View
          key={match.templateId}
          style={{
            gap: 5,
            padding: 10,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <View style={[s.between]}>
            <Text style={[s.text, { fontWeight: "600", flex: 1 }]}>
              {match.name} · v{match.version}
            </Text>
            <Text style={[s.small, { fontSize: 11, color: colors.faint }]}>
              {t("templates.score", { score: match.score })}
            </Text>
          </View>
          {match.reasons.map((reason) => (
            <Text key={reason} style={[s.small, { fontSize: 11 }]}>
              · {reason}
            </Text>
          ))}
          <View style={[s.row, { gap: 6 }]}>
            <Button small primary onPress={() => onUse(match, kind)}>
              {t("templates.use")}
            </Button>
            <Button
              small
              onPress={() =>
                void rejectTemplate(api, match.templateId, { kind, title, prompt }).then(() =>
                  setMatches((items) =>
                    items.filter((item) => item.templateId !== match.templateId),
                  ),
                )
              }
            >
              {t("templates.notThis")}
            </Button>
          </View>
        </View>
      ))}
    </Card>
  );
}

function BuiltInCatalog({ query }: { query: string }) {
  const { t } = useTranslation();
  const needle = query.trim().toLowerCase();
  const entries = useMemo(
    () =>
      skillCatalog.filter((item) => {
        if (!needle) return true;
        return `${item.titleZh} ${item.titleEn} ${item.descriptionZh} ${item.sourceFolder}`
          .toLowerCase()
          .includes(needle);
      }),
    [needle],
  );
  return (
    <View style={{ gap: space.sm }}>
      <Card style={{ gap: 4 }}>
        <Text style={[s.text, { fontWeight: "600" }]}>{t("templates.builtInTitle")}</Text>
        <Text style={s.small}>{t("templates.builtInHint", { count: skillCatalog.length })}</Text>
      </Card>
      {entries.slice(0, 60).map((item) => (
        <Card key={item.id} style={{ padding: 12, gap: 4 }}>
          <View style={[s.between, { gap: 8 }]}>
            <Text style={[s.text, { fontWeight: "600", flex: 1 }]}>{item.titleZh}</Text>
            <Text style={[s.small, { fontSize: 10, color: colors.faint }]}>{item.titleEn}</Text>
          </View>
          <Text style={[s.small, { fontSize: 12 }]} numberOfLines={2}>
            {item.descriptionZh}
          </Text>
          <Text style={[s.small, { fontSize: 10, color: colors.faint }]}>{item.sourceFolder}</Text>
        </Card>
      ))}
      {entries.length > 60 && (
        <Text style={s.small}>{t("templates.builtInMore", { count: entries.length - 60 })}</Text>
      )}
      {!entries.length && <Text style={s.small}>{t("templates.builtInEmpty")}</Text>}
    </View>
  );
}

type TemplateTab = "mine" | "team" | "builtin";

export function TemplateScreen() {
  const { api } = useWorkspace();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const state = useTemplatesState();
  const [tab, setTab] = useState<TemplateTab>("mine");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<UserTemplate>();
  const [useTarget, setUseTarget] = useState<{
    id: string;
    name: string;
    version: number;
    sampleContent: string;
    kind: DeliverableKind;
  }>();

  useEffect(() => {
    void loadTemplates(api);
  }, [api]);

  const needle = query.trim().toLowerCase();
  const filtered = (list: UserTemplate[]) =>
    list.filter((item) =>
      needle ? `${item.name} ${item.description}`.toLowerCase().includes(needle) : true,
    );
  const mine = filtered(state.templates);
  const shared = filtered(state.shared);
  const columns = width >= 1120 ? 3 : width >= 720 ? 2 : 1;
  const cardWidth = columns === 3 ? "32%" : columns === 2 ? "48.8%" : "100%";

  function use(template: {
    id: string;
    name: string;
    version: number;
    sampleContent: string;
    kind: DeliverableKind;
  }) {
    setUseTarget(template);
  }

  return (
    <View style={{ gap: space.md }}>
      <Card style={{ gap: 10 }}>
        <View style={{ gap: 3 }}>
          <Text style={[s.text, { fontSize: 16, fontWeight: "600" }]}>{t("templates.title")}</Text>
          <Text style={s.small}>{t("templates.subtitle")}</Text>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("templates.search")}
          placeholderTextColor={colors.faint}
          style={s.input}
          accessibilityLabel={t("templates.search")}
        />
        <View style={[s.row, { gap: 4, flexWrap: "wrap" }]}>
          {(
            [
              ["mine", t("templates.tabMine"), state.templates.length],
              ["team", t("templates.tabTeam"), state.shared.length],
              ["builtin", t("templates.tabBuiltIn"), skillCatalog.length],
            ] as const
          ).map(([id, label, count]) => (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === id }}
              onPress={() => setTab(id)}
              style={{
                minHeight: 36,
                justifyContent: "center",
                paddingHorizontal: 11,
                borderRadius: radius.full,
                backgroundColor: tab === id ? colors.sky : colors.surfaceSoft,
                borderWidth: 1,
                borderColor: tab === id ? colors.accentLine : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: tab === id ? "600" : "500",
                  color: tab === id ? colors.primary : colors.muted,
                }}
              >
                {label} {count}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <ErrorNotice error={state.error} />
      {tab === "mine" && (
        <>
          <MatchTester onUse={(match, kind) => void acceptMatch(match, kind, api, use)} />
          {state.status === "loading" ? (
            <Text style={s.small}>{t("templates.loading")}</Text>
          ) : mine.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {mine.map((template) => (
                <View key={template.id} style={{ width: cardWidth }}>
                  <TemplateCard
                    template={template}
                    onOpen={() => setSelected(template)}
                    onShare={() => void setTemplateShared(api, template.id, !template.shared)}
                    onUse={() => use(template)}
                  />
                </View>
              ))}
            </View>
          ) : (
            <Card>
              <Empty
                icon={FileText}
                title={t("templates.emptyTitle")}
                detail={t("templates.emptyDetail")}
              />
            </Card>
          )}
        </>
      )}
      {tab === "team" &&
        (shared.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {shared.map((template) => (
              <View key={template.id} style={{ width: cardWidth }}>
                <TemplateCard
                  template={template}
                  readonly
                  onOpen={() => setSelected(template)}
                  onUse={() => use(template)}
                />
              </View>
            ))}
          </View>
        ) : (
          <Card>
            <Empty
              icon={Share2}
              title={t("templates.teamEmptyTitle")}
              detail={t("templates.teamEmptyDetail")}
            />
          </Card>
        ))}
      {tab === "builtin" && <BuiltInCatalog query={query} />}

      {selected && (
        <TemplateDetail
          template={state.templates.find((item) => item.id === selected.id) ?? selected}
          onClose={() => setSelected(undefined)}
          onChanged={(next) => setSelected(next)}
          onUse={() => use(selected)}
        />
      )}
      {useTarget && (
        <UseTemplateSheet template={useTarget} onClose={() => setUseTarget(undefined)} />
      )}
    </View>
  );
}

async function acceptMatch(
  match: TemplateMatch,
  kind: DeliverableKind,
  api: LingWuApi,
  use: (template: {
    id: string;
    name: string;
    version: number;
    sampleContent: string;
    kind: DeliverableKind;
  }) => void,
) {
  await acceptTemplate(api, match.templateId, {
    kind,
    title: match.name,
  });
  use({
    id: match.templateId,
    name: match.name,
    version: match.version,
    sampleContent: match.sampleContent,
    kind,
  });
}
