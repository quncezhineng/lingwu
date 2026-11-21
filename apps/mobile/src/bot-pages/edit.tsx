import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { AgentOrb } from "../agent-orb";
import { useAgentSpace } from "../agent-space";
import {
  AGENT_COMMUNICATIONS,
  AGENT_TONES,
  type AgentAvatarId,
  type AgentCommunication,
  type AgentTone,
} from "../agent-space-model";
import { Text } from "../app-text";
import { statusLabel, useTranslation } from "../i18n";
import { Globe2 } from "../icons";
import { ModalOverlay } from "../modal-overlay";
import { Button, colors, Field, radius, s } from "../ui";
import { useWorkspace } from "../workspace";
import { BotPage, type BotPageProps } from "./shared";

/** 语气 / 话说多少的单选项胶囊，与引导页的选项样式保持一致。 */
function PersonaChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: 38,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.line,
        backgroundColor: selected ? colors.primary : pressed ? colors.surface : colors.paper,
      })}
    >
      <Text
        style={{
          fontSize: 13,
          lineHeight: 19,
          fontWeight: selected ? "600" : "500",
          color: selected ? colors.onPrimary : colors.muted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** 人设表单的当前草稿：父级点「公开」时用它把未保存的编辑一并落盘。 */
type PersonaDraft = {
  name: string;
  role: string;
  tone: AgentTone;
  communication: AgentCommunication;
  persona: string;
  avatar: AgentAvatarId;
  /** 是否满足「保存人设」的可保存条件（姓名与人设都非空）。 */
  valid: boolean;
};

/**
 * 人设表单。
 *
 * `secondaryAction` 与「保存人设」并排成双列（等宽）：目前用于「删除 Agent」，
 * 不传时保存按钮仍独占一行，避免系统默认 Agent 这类不可删除的场景留下半列空位。
 */
function PersonaEditor({
  onSaved,
  secondaryAction,
  draftRef,
}: {
  onSaved: () => void;
  /** 与保存按钮并排的次要操作；不传则保存按钮独占整行。 */
  secondaryAction?: ReactNode;
  /** 每次渲染把最新草稿同步给父级，供父级的「公开」按钮落盘未保存的编辑。 */
  draftRef?: { current: PersonaDraft | null };
}) {
  const { t } = useTranslation();
  const { current, updateAgent } = useAgentSpace();
  const [name, setName] = useState(current.name);
  const [role, setRole] = useState(current.role);
  const [tone, setTone] = useState<AgentTone>(current.tone);
  const [communication, setCommunication] = useState<AgentCommunication>(current.communication);
  const [persona, setPersona] = useState(current.persona);
  const [avatar, setAvatar] = useState(current.avatar);
  // 提交后再写 ref（不在渲染期产生副作用），保证父级点击时读到的是最新草稿。
  useEffect(() => {
    if (!draftRef) return;
    draftRef.current = {
      name,
      role,
      tone,
      communication,
      persona,
      avatar,
      valid: Boolean(name.trim() && persona.trim()),
    };
  });
  /** 主操作：保存人设。单独提出来，才能按需与次要操作并排或独占一行。 */
  const saveButton = (
    <Button
      primary
      disabled={!name.trim() || !persona.trim()}
      onPress={() => {
        updateAgent(current.id, { name, role, tone, communication, persona, avatar });
        onSaved();
      }}
    >
      {t("agentSpace.savePersona")}
    </Button>
  );
  return (
    <View style={{ gap: 2 }}>
      <View style={{ alignItems: "center", marginBottom: 8 }}>
        <AgentOrb avatar={avatar} size={62} />
      </View>
      <Text style={[s.small, { color: colors.faint, marginBottom: 8 }]}>
        {t("agentSpace.agentAvatar")}
      </Text>
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
      <Field label={t("agentSpace.agentName")} value={name} onChangeText={setName} maxLength={20} />
      <Field label={t("agentSpace.agentRole")} value={role} onChangeText={setRole} maxLength={50} />
      <Text style={[s.small, { color: colors.faint, marginBottom: 8 }]}>
        {t("agentSpace.tone")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {AGENT_TONES.map((item) => (
          <PersonaChip
            key={item}
            label={statusLabel(item)}
            selected={tone === item}
            onPress={() => setTone(item)}
          />
        ))}
      </View>
      <Text style={[s.small, { color: colors.faint, marginBottom: 8 }]}>
        {t("agentSpace.verbosity")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {AGENT_COMMUNICATIONS.map((item) => (
          <PersonaChip
            key={item}
            label={statusLabel(item)}
            selected={communication === item}
            onPress={() => setCommunication(item)}
          />
        ))}
      </View>
      <Field
        label={t("agentSpace.agentPersona")}
        value={persona}
        onChangeText={setPersona}
        maxLength={1000}
        multiline
      />
      {secondaryAction ? (
        // 双列等宽：左保存、右删除；两个按钮同一行，高度由 stretch 对齐。
        <View style={[s.row, { gap: 10, alignItems: "stretch" }]}>
          <View style={{ flex: 1 }}>{saveButton}</View>
          <View style={{ flex: 1 }}>{secondaryAction}</View>
        </View>
      ) : (
        saveButton
      )}
    </View>
  );
}

export function BotEditPage({
  onClose,
  onDeleted,
  embedded = false,
}: BotPageProps & { onDeleted: () => void }) {
  const { t } = useTranslation();
  const { current, deleteAgent, setAgentPublic, updateAgent } = useAgentSpace();
  const { notify } = useWorkspace();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 「公开」时要把 PersonaEditor 里未保存的编辑一并落盘，因此持有它的最新草稿。
  const draftRef = useRef<PersonaDraft | null>(null);
  return (
    <BotPage title={t("agentSpace.editPersona")} onClose={onClose} embedded={embedded}>
      {/* 「保存人设」与「删除 Agent」双列并排：删除是不可恢复操作，等宽但用 danger 色区分。 */}
      <PersonaEditor
        onSaved={onClose}
        draftRef={draftRef}
        secondaryAction={
          current.system ? undefined : (
            <Button danger onPress={() => setConfirmDelete(true)}>
              {t("agentSpace.deleteAgent")}
            </Button>
          )
        }
      />
      {/* 公开到市场：仅用户自建的智能体可公开，系统默认 Agent 不可公开。 */}
      {!current.system && (
        <View
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.paper,
            gap: 8,
          }}
        >
          <View style={[s.row, { gap: 10, alignItems: "center" }]}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.control,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: current.public ? colors.sky : colors.surfaceSoft,
              }}
            >
              <Globe2 size={17} color={current.public ? colors.primaryStrong : colors.muted} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[s.text, { fontSize: 13, fontWeight: "600" }]}>
                {t("agent.marketPublish")}
              </Text>
              <Text style={[s.small, { color: colors.faint }]}>
                {current.public ? t("agent.marketPublishedHint") : t("agent.marketPublishHint")}
              </Text>
            </View>
            <Button
              small
              primary={!current.public}
              onPress={() => {
                // 先把当前编辑中的人设落盘，再发布：广场卡片与详情页的
                // 「核心职责 / 人设描述」直接派生自 Agent，必须与详情页此刻
                // 看到的内容一致，不能停留在上一次保存的旧值。
                const draft = draftRef.current;
                const canSave = Boolean(draft?.valid);
                if (draft && canSave) {
                  updateAgent(current.id, {
                    name: draft.name,
                    role: draft.role,
                    tone: draft.tone,
                    communication: draft.communication,
                    persona: draft.persona,
                    avatar: draft.avatar,
                  });
                }
                const next = !current.public;
                setAgentPublic(current.id, next);
                notify(
                  t(next ? "agent.marketPublishedToast" : "agent.marketUnpublishedToast", {
                    name: canSave && draft ? draft.name : current.name,
                  }),
                );
              }}
            >
              {current.public ? t("agent.marketUnpublish") : t("agent.marketPublish")}
            </Button>
          </View>
        </View>
      )}
      <View style={{ marginTop: 12 }}>
        {current.system && (
          <Text style={[s.small, { color: colors.faint, marginTop: 10 }]}>
            {t("agentSpace.systemCannotDelete")}
          </Text>
        )}
        {/* 删除 Agent 确认弹窗：不可恢复，需用户显式确认。 */}
        {confirmDelete && (
          <ModalOverlay visible onRequestClose={() => setConfirmDelete(false)}>
            <Pressable onPress={() => setConfirmDelete(false)} style={s.modalShade}>
              <Pressable
                accessibilityViewIsModal
                onPress={(event) => event.stopPropagation()}
                style={[s.card, { maxWidth: 360, width: "100%", padding: 22, gap: 10 }]}
              >
                <Text style={s.heading}>{t("agentSpace.deleteConfirmTitle")}</Text>
                <Text style={s.muted}>{t("agentSpace.deleteAgentNote")}</Text>
                <View style={[s.row, { gap: 10, marginTop: 8 }]}>
                  <Button
                    style={{ flex: 1, minHeight: 44 }}
                    onPress={() => setConfirmDelete(false)}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    danger
                    style={{ flex: 1, minHeight: 44 }}
                    onPress={() => {
                      deleteAgent(current.id);
                      onDeleted();
                    }}
                  >
                    {t("agentSpace.deleteConfirmAction")}
                  </Button>
                </View>
              </Pressable>
            </Pressable>
          </ModalOverlay>
        )}
      </View>
    </BotPage>
  );
}
