import { useState } from "react";
import { Pressable, View } from "react-native";
import { AgentOrb } from "../agent-orb";
import { useAgentSpace } from "../agent-space";
import type { AgentAvatarId } from "../agent-space-model";
import { Text } from "../app-text";
import { useTranslation } from "../i18n";
import { Button, colors, Field, radius, s } from "../ui";
import { BotPage, type BotPageProps } from "./shared";

function PersonaEditor({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation();
  const { current, updateAgent } = useAgentSpace();
  const [name, setName] = useState(current.name);
  const [role, setRole] = useState(current.role);
  const [persona, setPersona] = useState(current.persona);
  const [avatar, setAvatar] = useState(current.avatar);
  return (
    <View style={{ gap: 2 }}>
      <View style={{ alignItems: "center", marginBottom: 8 }}>
        <AgentOrb avatar={avatar} size={62} />
      </View>
      <Field label={t("agentSpace.agentName")} value={name} onChangeText={setName} maxLength={20} />
      <Field label={t("agentSpace.agentRole")} value={role} onChangeText={setRole} maxLength={30} />
      <Field
        label={t("agentSpace.agentPersona")}
        value={persona}
        onChangeText={setPersona}
        maxLength={1000}
        multiline
      />
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        {(["orb", "bloom", "moon", "planet", "cat"] as AgentAvatarId[]).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="radio"
            accessibilityState={{ checked: avatar === item }}
            onPress={() => setAvatar(item)}
            style={{
              width: 43,
              height: 43,
              borderRadius: radius.full,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: avatar === item ? colors.primary : colors.line,
              backgroundColor: avatar === item ? colors.sky : colors.paper,
            }}
          >
            <AgentOrb avatar={item} size={30} />
          </Pressable>
        ))}
      </View>
      <Button
        primary
        disabled={!name.trim() || !persona.trim()}
        onPress={() => {
          updateAgent(current.id, { name, role, persona, avatar });
          onSaved();
        }}
      >
        {t("agentSpace.savePersona")}
      </Button>
    </View>
  );
}

export function BotEditPage({ onClose, onDeleted }: BotPageProps & { onDeleted: () => void }) {
  const { t } = useTranslation();
  const { current, deleteAgent } = useAgentSpace();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <BotPage title={t("agentSpace.editPersona")} onClose={onClose}>
      <PersonaEditor onSaved={onClose} />
      <View style={{ marginTop: 20 }}>
        {!current.system && (
          <>
            {confirmDelete && (
              <View
                style={{
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 13,
                  backgroundColor: colors.errorSoft,
                  gap: 10,
                }}
              >
                <Text style={[s.text, { fontWeight: "600", color: colors.danger }]}>
                  {t("agentSpace.deleteAgent")}
                </Text>
                <Text style={s.small}>{t("agentSpace.deleteAgentNote")}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button
                    small
                    danger
                    onPress={() => {
                      deleteAgent(current.id);
                      onDeleted();
                    }}
                  >
                    {t("agentSpace.deleteAgent")}
                  </Button>
                  <Button small onPress={() => setConfirmDelete(false)}>
                    {t("common.cancel")}
                  </Button>
                </View>
              </View>
            )}
            {!confirmDelete && (
              <Button danger style={{ marginTop: 16 }} onPress={() => setConfirmDelete(true)}>
                {t("agentSpace.deleteAgent")}
              </Button>
            )}
          </>
        )}
        {current.system && (
          <Text style={[s.small, { color: colors.faint, marginTop: 10 }]}>
            {t("agentSpace.systemCannotDelete")}
          </Text>
        )}
      </View>
    </BotPage>
  );
}
