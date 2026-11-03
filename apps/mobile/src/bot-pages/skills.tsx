import { useState } from "react";
import { Pressable, View } from "react-native";
import { useAgentSpace } from "../agent-space";
import { AGENT_CAPABILITY_LABELS, type AgentSkill } from "../agent-space-model";
import { Text } from "../app-text";
import { useTranslation } from "../i18n";
import { Check, Plus } from "../icons";
import { Button, colors, Field, radius, SectionHeading, s } from "../ui";
import { BotPage, type BotPageProps } from "./shared";

function SkillEditor({ skill, onClose }: { skill?: AgentSkill; onClose: () => void }) {
  const { t } = useTranslation();
  const { current, saveSkill } = useAgentSpace();
  const [name, setName] = useState(() => skill?.name ?? t("agentSpace.skillSampleName"));
  const [purpose, setPurpose] = useState(
    () => skill?.purpose ?? t("agentSpace.skillSamplePurpose"),
  );
  const [instructions, setInstructions] = useState(
    () => skill?.instructions ?? t("agentSpace.skillSampleInstructions"),
  );
  const [outputFormat, setOutputFormat] = useState(
    () => skill?.outputFormat ?? t("agentSpace.skillSampleOutput"),
  );
  return (
    <View style={{ gap: 2 }}>
      <Field label={t("agentSpace.skillName")} value={name} onChangeText={setName} maxLength={40} />
      <Field
        label={t("agentSpace.skillPurpose")}
        value={purpose}
        onChangeText={setPurpose}
        maxLength={120}
      />
      <Field
        label={t("agentSpace.skillInstructions")}
        value={instructions}
        onChangeText={setInstructions}
        maxLength={4000}
        multiline
      />
      <Field
        label={t("agentSpace.skillOutput")}
        value={outputFormat}
        onChangeText={setOutputFormat}
        maxLength={800}
        multiline
      />
      <Button
        primary
        disabled={!name.trim() || !instructions.trim()}
        onPress={() => {
          saveSkill(current.id, { name, purpose, instructions, outputFormat }, skill?.id);
          onClose();
        }}
      >
        {t("agentSpace.saveSkill")}
      </Button>
    </View>
  );
}

export function BotSkillsPage({ onClose }: BotPageProps) {
  const { t, locale } = useTranslation();
  const { current, toggleSkill } = useAgentSpace();
  const [editingSkill, setEditingSkill] = useState<AgentSkill | "new">();
  if (editingSkill)
    return (
      <BotPage
        title={t(editingSkill === "new" ? "agentSpace.createSkill" : "agentSpace.editSkill")}
        onClose={() => setEditingSkill(undefined)}
      >
        <SkillEditor
          skill={editingSkill === "new" ? undefined : editingSkill}
          onClose={() => setEditingSkill(undefined)}
        />
      </BotPage>
    );
  return (
    <BotPage title={t("agentSpace.skills")} onClose={onClose}>
      <View style={{ gap: 8 }}>
        <View style={[s.between, { marginBottom: 5 }]}>
          <Text style={s.heading}>{t("agentSpace.customSkills")}</Text>
          <Button small icon={Plus} onPress={() => setEditingSkill("new")}>
            {t("agentSpace.createSkill")}
          </Button>
        </View>
        {current.customSkills.length ? (
          current.customSkills.map((skill) => (
            <Pressable
              key={skill.id}
              accessibilityRole="button"
              accessibilityLabel={`${t("agentSpace.editSkill")} ${skill.name}`}
              onPress={() => setEditingSkill(skill)}
              style={({ pressed }) => ({
                padding: 14,
                borderRadius: 15,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: pressed ? colors.surface : colors.paper,
                gap: 7,
              })}
            >
              <View style={s.between}>
                <Text style={[s.text, { fontWeight: "600" }]}>{skill.name}</Text>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityLabel={skill.name}
                  accessibilityState={{ checked: skill.enabled }}
                  onPress={(event) => {
                    event.stopPropagation();
                    toggleSkill(current.id, skill.id);
                  }}
                  style={{
                    width: 35,
                    height: 21,
                    borderRadius: radius.full,
                    padding: 3,
                    alignItems: skill.enabled ? "flex-end" : "flex-start",
                    backgroundColor: skill.enabled ? colors.primary : colors.lineStrong,
                  }}
                >
                  <View
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: radius.full,
                      backgroundColor: colors.paper,
                    }}
                  />
                </Pressable>
              </View>
              <Text style={s.small}>{skill.purpose || t("agentSpace.skillInstructions")}</Text>
              <Text style={[s.small, { color: colors.faint }]}>
                {t(skill.enabled ? "agentSpace.skillEnabled" : "agentSpace.skillDisabled")} ·{" "}
                {t("agentSpace.skillVersion", { version: skill.version })}
              </Text>
            </Pressable>
          ))
        ) : (
          <Text style={[s.muted, { paddingVertical: 18 }]}>{t("agentSpace.skillEmpty")}</Text>
        )}
        <SectionHeading title={t("agentSpace.quickCapabilities")} style={{ marginTop: 10 }} />
        {current.skills.map((capability) => (
          <View
            key={capability}
            style={[
              s.between,
              {
                minHeight: 48,
                borderBottomWidth: 1,
                borderBottomColor: colors.lineSoft,
              },
            ]}
          >
            <Text style={s.text}>
              {AGENT_CAPABILITY_LABELS[capability]?.[locale === "zh-Hans" ? "zh" : "en"] ??
                capability}
            </Text>
            <Check size={16} color={colors.success} />
          </View>
        ))}
      </View>
    </BotPage>
  );
}
