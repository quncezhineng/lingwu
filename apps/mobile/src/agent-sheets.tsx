import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { AgentArtifact } from "../../../packages/domain/src/agent";
import { AccountScreen } from "./account";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import {
  AGENT_CAPABILITY_LABELS,
  AGENT_TEMPLATES,
  type AgentAvatarId,
  type AgentSkill,
  type AgentTemplateId,
} from "./agent-space-model";
import { AgentStatus, TaskCard } from "./agent-ui";
import { useAgentWorkspace } from "./agent-workspace";
import { MarketBriefingCard } from "./briefing-card";
import { CapabilityHubScreen } from "./capability-hub";
import { useTranslation } from "./i18n";
import {
  Bell,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Folder,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Settings2,
  Sparkles,
  Star,
  Target,
} from "./icons";
import { InsightCard } from "./insight-card";
import { FilesScreen } from "./screens";
import { TaskHubScreen } from "./task-hub";
import { Button, colors, Field, radius, SectionHeading, Sheet, s, space, typography } from "./ui";
import { WatchlistHubScreen } from "./watchlist-hub";
import { useWorkspace } from "./workspace";

export type AgentPanel =
  | "more"
  | "manage"
  | "create"
  | "preferences"
  | "watchlist"
  | "tasks"
  | "files"
  | "insights"
  | "brief"
  | "capabilities"
  | "account";

function PanelButton({
  icon: Icon,
  title,
  detail,
  badge,
  onPress,
  active,
}: {
  icon: typeof MessageCircle;
  title: string;
  detail?: string;
  badge?: number;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 62,
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: active ? colors.accentLine : "transparent",
        backgroundColor: active ? colors.sky : pressed ? colors.surface : "transparent",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? colors.paper : colors.surface,
        }}
      >
        <Icon size={18} color={active ? colors.primary : colors.muted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={[s.text, { fontWeight: "600" }]}>{title}</Text>
        {!!detail && (
          <Text numberOfLines={2} style={[s.small, { color: colors.faint }]}>
            {detail}
          </Text>
        )}
      </View>
      {badge !== undefined && badge > 0 ? (
        <View
          style={{
            minWidth: 22,
            height: 22,
            paddingHorizontal: 6,
            borderRadius: radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.tertiary,
          }}
        >
          <Text style={[s.metric, { fontSize: 10, color: colors.muted }]}>{badge}</Text>
        </View>
      ) : (
        <ChevronRight size={15} color={colors.faint} />
      )}
    </Pressable>
  );
}

function SheetSection({ children }: { children: React.ReactNode }) {
  return <View style={{ gap: 4, marginBottom: space.lg }}>{children}</View>;
}

function AgentMoreSheet({
  onClose,
  onPanel,
}: {
  onClose: () => void;
  onPanel: (panel: AgentPanel) => void;
}) {
  const { t, locale } = useTranslation();
  const { current } = useAgentSpace();
  const { data } = useAgentWorkspace();
  const tasks = data?.tasks ?? [];
  const agentTasks = tasks.filter(
    (task) => task.threadId === current.threadId || (!task.threadId && current.system),
  );
  const activeTasks = agentTasks.filter(
    (task) => !["succeeded", "failed", "cancelled"].includes(task.status),
  );
  const linkedMonitors = (data?.monitors ?? []).filter((monitor) =>
    agentTasks.some((task) => task.id === monitor.taskId),
  );
  const capabilities = current.skills.slice(0, 4);
  return (
    <Sheet title={t("agentSpace.more")} onClose={onClose} wide>
      <View style={{ gap: 6 }}>
        <Text style={[typography.eyebrow, { color: colors.faint, marginBottom: 7 }]}>
          {t("agentSpace.globalArea")}
        </Text>
        <SheetSection>
          <PanelButton
            icon={Star}
            title={t("agentSpace.marketBrief")}
            detail={t("agentSpace.marketBriefDetail")}
            onPress={() => onPanel("brief")}
          />
          <PanelButton
            icon={Sparkles}
            title={t("agentSpace.insights")}
            detail={t("agentSpace.insightsDetail")}
            onPress={() => onPanel("insights")}
          />
          <PanelButton
            icon={Star}
            title={t("agentSpace.watchlist")}
            detail={t("agentSpace.watchlistDetail")}
            onPress={() => onPanel("watchlist")}
          />
          <PanelButton
            icon={Clock3}
            title={t("agentSpace.tasks")}
            detail={t("agentSpace.tasksDetail")}
            badge={activeTasks.length}
            onPress={() => onPanel("tasks")}
          />
        </SheetSection>

        <Text style={[typography.eyebrow, { color: colors.faint, marginTop: 6, marginBottom: 7 }]}>
          {t("agentSpace.agentLearned", { name: current.name })}
        </Text>
        <SheetSection>
          <PanelButton
            icon={Bell}
            title={t("agentSpace.scheduledTasks")}
            detail={`${linkedMonitors.filter((monitor) => monitor.status === "active").length} · ${current.name}`}
            onPress={() => {
              onClose();
              onPanel("manage");
            }}
          />
          <PanelButton
            icon={Clock3}
            title={t("agentSpace.taskHistory")}
            detail={`${agentTasks.length} · ${current.name}`}
            onPress={() => onPanel("tasks")}
          />
        </SheetSection>

        <Text style={[typography.eyebrow, { color: colors.faint, marginBottom: 9 }]}>
          {t("agentSpace.quickCapabilities")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
          {capabilities.map((capability) => {
            const label = AGENT_CAPABILITY_LABELS[capability];
            return (
              <Pressable
                key={capability}
                accessibilityRole="button"
                onPress={() => onPanel("capabilities")}
                style={({ pressed }) => ({
                  width: "48%",
                  minHeight: 82,
                  padding: 13,
                  borderRadius: 15,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: pressed ? colors.surface : colors.paper,
                  gap: 9,
                })}
              >
                <Sparkles size={18} color={colors.primary} />
                <Text style={[s.text, { fontSize: 13, fontWeight: "600" }]} numberOfLines={2}>
                  {label ? label[locale === "zh-Hans" ? "zh" : "en"] : capability}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Button
          icon={MoreHorizontal}
          onPress={() => onPanel("capabilities")}
          style={{ marginTop: 12 }}
        >
          {t("agentSpace.allCapabilities")}
        </Button>
        <Text style={[s.small, { color: colors.faint, marginTop: 10, lineHeight: 18 }]}>
          {t("agentSpace.globalNote")}
        </Text>
      </View>
    </Sheet>
  );
}

function CreateAgentSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const { createAgent } = useAgentSpace();
  const [template, setTemplate] = useState<Exclude<AgentTemplateId, "general">>();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [persona, setPersona] = useState("");
  const [avatar, setAvatar] = useState<AgentAvatarId>("moon");
  const templateInfo = template ? AGENT_TEMPLATES[template] : undefined;

  const choose = (next: Exclude<AgentTemplateId, "general">) => {
    const info = AGENT_TEMPLATES[next];
    setTemplate(next);
    setName(info.name);
    setRole(info.role);
    setPersona(info.persona);
    setAvatar(info.avatar);
  };

  if (!template) {
    return (
      <Sheet
        title={t("agentSpace.createTitle")}
        subtitle={t("agentSpace.createSubtitle")}
        onClose={onClose}
        small
      >
        <View style={{ gap: 7 }}>
          <PanelButton
            icon={Star}
            title={t("agentSpace.templateMarket")}
            detail={t("agentSpace.templateMarketDetail")}
            onPress={() => choose("market")}
          />
          <PanelButton
            icon={Target}
            title={t("agentSpace.templateAsset")}
            detail={t("agentSpace.templateAssetDetail")}
            onPress={() => choose("asset")}
          />
          <PanelButton
            icon={Sparkles}
            title={t("agentSpace.templateCustom")}
            detail={t("agentSpace.templateCustomDetail")}
            onPress={() => choose("custom")}
          />
        </View>
        <Text style={[s.small, { color: colors.faint, marginTop: 14, lineHeight: 18 }]}>
          {t("agentSpace.sampleNote")}
        </Text>
      </Sheet>
    );
  }

  return (
    <Sheet title={t("agentSpace.customizeTitle")} onClose={onClose} narrow>
      <View style={{ alignItems: "center", marginBottom: 8 }}>
        <AgentOrb avatar={avatar} size={68} />
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
      <Text style={[s.small, { color: colors.faint, marginBottom: 8 }]}>
        {t("agentSpace.avatar")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {(["orb", "bloom", "moon", "planet", "cat"] as AgentAvatarId[]).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="radio"
            accessibilityState={{ checked: avatar === item }}
            onPress={() => setAvatar(item)}
            style={{
              width: 45,
              height: 45,
              borderRadius: radius.full,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: avatar === item ? colors.primary : colors.line,
              backgroundColor: avatar === item ? colors.sky : colors.paper,
            }}
          >
            <AgentOrb avatar={item} size={31} />
          </Pressable>
        ))}
      </View>
      <Button
        primary
        disabled={!name.trim() || !persona.trim()}
        onPress={() => {
          createAgent({ template, name, role, persona, avatar });
          onCreated();
        }}
      >
        {t("agentSpace.createAction", { name: name.trim() || templateInfo?.name || "" })}
      </Button>
    </Sheet>
  );
}

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

function AgentManagerSheet({ onClose }: { onClose: () => void }) {
  const { t, locale } = useTranslation();
  const { current, deleteAgent, toggleSkill } = useAgentSpace();
  const { data } = useAgentWorkspace();
  const { open, navigate } = useWorkspace();
  const [tab, setTab] = useState<"profile" | "tasks" | "files" | "skills" | "settings">("profile");
  const [editingPersona, setEditingPersona] = useState(false);
  const [editingSkill, setEditingSkill] = useState<AgentSkill | "new" | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const agentTasks = (data?.tasks ?? []).filter(
    (task) => task.threadId === current.threadId || (!task.threadId && current.system),
  );
  const agentArtifacts = (data?.artifacts ?? []).filter((artifact) =>
    agentTasks.some((task) => task.id === artifact.taskId),
  );
  const agentTaskIds = new Set(agentTasks.map((task) => task.id));
  const liveMonitors = (data?.monitors ?? []).filter(
    (monitor) => monitor.status !== "stopped" && agentTaskIds.has(monitor.taskId),
  );
  const libraryCount = agentArtifacts.length;
  const skillCount = current.skills.length + current.customSkills.length;

  return (
    <Sheet title={current.name} onClose={onClose} wide>
      <View
        style={{
          padding: 18,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.paper,
          gap: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <AgentOrb avatar={current.avatar} size={58} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[typography.heading, { fontSize: 18 }]}>{current.name}</Text>
              {current.system && (
                <View
                  style={{
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    borderRadius: radius.badge,
                    backgroundColor: colors.sky,
                  }}
                >
                  <Text style={{ fontSize: 9, color: colors.primaryStrong }}>
                    {t("agentSpace.systemAgent")}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[s.small, { marginTop: 3 }]}>{current.role}</Text>
          </View>
          <Button small icon={Settings2} onPress={() => setEditingPersona(true)}>
            {t("agentSpace.editPersona")}
          </Button>
        </View>
        <Text style={[s.muted, { fontSize: 13, lineHeight: 22 }]}>{current.persona}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            [String(liveMonitors.length), t("agentSpace.scheduledTasks")],
            [String(libraryCount), t("agentSpace.artifacts")],
            [String(skillCount), t("agentSpace.skills")],
          ].map(([value, label]) => (
            <Pressable
              key={label}
              onPress={() =>
                setTab(
                  label === t("agentSpace.artifacts")
                    ? "files"
                    : label === t("agentSpace.skills")
                      ? "skills"
                      : "tasks",
                )
              }
              style={{
                flex: 1,
                minHeight: 59,
                borderRadius: 13,
                backgroundColor: colors.surfaceRaised,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <Text style={[s.metric, { fontSize: 18, color: colors.text }]}>{value}</Text>
              <Text style={[s.small, { color: colors.faint }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {editingPersona ? (
        <View style={{ marginTop: 18 }}>
          <SectionHeading title={t("agentSpace.editPersona")} />
          <PersonaEditor onSaved={() => setEditingPersona(false)} />
        </View>
      ) : editingSkill ? (
        <View style={{ marginTop: 18 }}>
          <SectionHeading
            title={editingSkill === "new" ? t("agentSpace.createSkill") : t("agentSpace.editSkill")}
          />
          <SkillEditor
            skill={editingSkill === "new" ? undefined : editingSkill}
            onClose={() => setEditingSkill(undefined)}
          />
        </View>
      ) : (
        <>
          <View
            style={{
              flexDirection: "row",
              gap: 4,
              padding: 4,
              borderRadius: 12,
              backgroundColor: colors.surface,
              marginVertical: 18,
            }}
          >
            {(
              [
                ["profile", t("agentSpace.manageAgent"), MessageCircle],
                ["tasks", t("agentSpace.scheduledTasks"), Bell],
                ["files", t("agentSpace.artifacts"), Folder],
                ["skills", t("agentSpace.skills"), Sparkles],
                ["settings", t("agentSpace.persona"), Settings2],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                onPress={() => setTab(id)}
                style={{
                  flex: 1,
                  minHeight: 36,
                  borderRadius: 9,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: tab === id ? colors.paper : "transparent",
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 11,
                    lineHeight: 16,
                    fontWeight: tab === id ? "600" : "500",
                    color: tab === id ? colors.primaryStrong : colors.muted,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === "profile" && (
            <View style={{ gap: 4 }}>
              <SheetSection>
                <PanelButton
                  icon={Clock3}
                  title={t("agentSpace.analysisHistory")}
                  detail={`${agentTasks.length} · ${current.name}`}
                  onPress={() => setTab("tasks")}
                />
                <PanelButton
                  icon={Target}
                  title={t("agentSpace.goalsMemory")}
                  detail={`${data?.goals.length ?? 0} · ${data?.memories.length ?? 0}`}
                  onPress={() => setTab("settings")}
                />
              </SheetSection>
              <Text style={[s.small, { color: colors.faint, lineHeight: 18 }]}>
                {t("agentSpace.sampleNote")}
              </Text>
            </View>
          )}

          {tab === "tasks" && (
            <View style={{ gap: 12 }}>
              <SectionHeading title={t("agentSpace.scheduledTasks")} count={liveMonitors.length} />
              {liveMonitors.length ? (
                liveMonitors.map((monitor) => (
                  <View
                    key={monitor.id}
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.line,
                      backgroundColor: colors.paper,
                      gap: 7,
                    }}
                  >
                    <Text style={[s.text, { fontWeight: "600" }]}>{monitor.title}</Text>
                    <Text style={s.small}>
                      {monitor.schedule === "daily"
                        ? `${monitor.timeOfDay ?? "08:30"} · Asia/Shanghai`
                        : monitor.schedule === "weekly"
                          ? `${monitor.weekday ?? 1} · ${monitor.timeOfDay ?? "08:30"}`
                          : `${monitor.intervalMinutes} min`}
                    </Text>
                    <Text
                      style={[
                        s.small,
                        { color: monitor.status === "active" ? colors.success : colors.faint },
                      ]}
                    >
                      {monitor.status}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={[s.muted, { paddingVertical: 18 }]}>{t("agentSpace.noTasks")}</Text>
              )}
              <SectionHeading
                title={t("agentSpace.taskHistory")}
                count={agentTasks.length}
                style={{ marginTop: 8 }}
              />
              {agentTasks.length ? (
                agentTasks.slice(0, 8).map((task) => <TaskCard key={task.id} task={task} compact />)
              ) : (
                <Text style={[s.muted, { paddingVertical: 14 }]}>{t("agentSpace.noTasks")}</Text>
              )}
            </View>
          )}

          {tab === "files" && (
            <View style={{ gap: 10 }}>
              <SectionHeading title={t("agentSpace.artifacts")} count={libraryCount} />
              {agentArtifacts.length ? (
                agentArtifacts.map((artifact) => (
                  <PanelButton
                    key={artifact.id}
                    icon={FileText}
                    title={artifact.title}
                    detail={artifact.summary}
                    onPress={() => open({ type: "artifact", artifact })}
                  />
                ))
              ) : (
                <Text style={[s.muted, { paddingVertical: 18 }]}>{t("agentSpace.noInsights")}</Text>
              )}
            </View>
          )}

          {tab === "skills" && (
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
                        accessibilityState={{ checked: skill.enabled }}
                        onPress={() => toggleSkill(current.id, skill.id)}
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
                    <Text style={s.small}>
                      {skill.purpose || t("agentSpace.skillInstructions")}
                    </Text>
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
          )}

          {tab === "settings" && (
            <View style={{ gap: 8 }}>
              <SectionHeading title={t("agentSpace.persona")} />
              <PersonaEditor onSaved={() => setTab("profile")} />
              <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 18 }} />
              <SectionHeading title={t("agentSpace.goalsMemory")} />
              {(data?.goals ?? []).slice(0, 5).map((goal) => (
                <PanelButton
                  key={goal.id}
                  icon={Target}
                  title={goal.title}
                  detail={goal.status}
                  onPress={() => {
                    navigate("goals");
                    onClose();
                  }}
                />
              ))}
              {(data?.memories ?? []).slice(0, 5).map((memory) => (
                <View
                  key={memory.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: colors.surfaceRaised,
                    gap: 4,
                  }}
                >
                  <Text style={[s.text, { fontSize: 13 }]}>{memory.text}</Text>
                  <Text style={[s.small, { color: colors.faint }]}>{memory.source}</Text>
                </View>
              ))}
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
                            onClose();
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
          )}
        </>
      )}
    </Sheet>
  );
}

function PreferencesSheet({ onClose }: { onClose: () => void }) {
  const { t, locale } = useTranslation();
  const { preferences, setPreferences } = useAgentSpace();
  const [name, setName] = useState(preferences.name);
  const [risk, setRisk] = useState(preferences.risk);
  const [goal, setGoal] = useState(preferences.goal);
  const options = [
    ["稳健一些", "riskSteady"],
    ["均衡一些", "riskBalanced"],
    ["更积极一些", "riskActive"],
    ["还不确定", "riskUnsure"],
  ] as const;
  return (
    <Sheet
      title={t("agentSpace.preferences")}
      subtitle={t("agentSpace.preferencesDetail")}
      onClose={onClose}
      narrow
    >
      <Field label={t("agentSpace.userName")} value={name} onChangeText={setName} maxLength={20} />
      <Field label={t("agentSpace.risk")} value={risk} onChangeText={setRisk} maxLength={20} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
        {options.map(([value, labelKey]) => (
          <Pressable
            key={value}
            onPress={() => setRisk(value)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: risk === value ? colors.primary : colors.line,
              backgroundColor: risk === value ? colors.sky : colors.paper,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: risk === value ? colors.primaryStrong : colors.muted,
              }}
            >
              {t(`agentSpace.${labelKey}` as "agentSpace.riskSteady")}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field
        label={t("agentSpace.goal")}
        value={goal}
        onChangeText={setGoal}
        maxLength={120}
        multiline
      />
      <Text style={[s.small, { color: colors.faint, marginBottom: 16 }]}>
        {t("agentSpace.following")}:{" "}
        {[...preferences.markets, ...preferences.areas].join(locale === "zh-Hans" ? "、" : ", ") ||
          "—"}
      </Text>
      <Button
        primary
        onPress={() => {
          setPreferences({ name: name.trim(), risk, goal });
          onClose();
        }}
      >
        {t("agentSpace.savePreferences")}
      </Button>
    </Sheet>
  );
}

function InsightsSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const { open } = useWorkspace();
  const insights = (data?.artifacts ?? []).filter(
    (artifact) => artifact.kind === "research_report" || artifact.kind === "report",
  );
  return (
    <Sheet title={t("agentSpace.insights")} onClose={onClose} wide>
      <View style={{ gap: 12 }}>
        <Text style={[s.muted, { lineHeight: 20 }]}>{t("agentSpace.insightsDetail")}</Text>
        {insights.length ? (
          insights.map((artifact: AgentArtifact) => (
            <InsightCard
              key={artifact.id}
              eyebrow={artifact.kind === "report" ? "Report" : "Research"}
              title={artifact.summary || artifact.title}
              meta={artifact.title}
              actionLabel={t("agent.artifactOpenDetail")}
              onPress={() => open({ type: "artifact", artifact })}
            />
          ))
        ) : (
          <Text style={[s.muted, { paddingVertical: 30, textAlign: "center" }]}>
            {t("agentSpace.noInsights")}
          </Text>
        )}
      </View>
    </Sheet>
  );
}

export function AgentSheets({
  panel,
  onClose,
  onPanel,
  onSignOut,
}: {
  panel?: AgentPanel;
  onClose: () => void;
  onPanel: (panel: AgentPanel) => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const { current } = useAgentSpace();
  if (!panel) return null;
  if (panel === "more") return <AgentMoreSheet onClose={onClose} onPanel={onPanel} />;
  if (panel === "manage") return <AgentManagerSheet onClose={onClose} />;
  if (panel === "create") return <CreateAgentSheet onClose={onClose} onCreated={onClose} />;
  if (panel === "preferences") return <PreferencesSheet onClose={onClose} />;
  if (panel === "watchlist")
    return (
      <Sheet title={t("agentSpace.watchlist")} onClose={onClose} wide>
        <WatchlistHubScreen />
      </Sheet>
    );
  if (panel === "tasks")
    return (
      <Sheet title={t("agentSpace.tasks")} onClose={onClose} wide>
        <AgentStatus />
        <TaskHubScreen />
      </Sheet>
    );
  if (panel === "files")
    return (
      <Sheet title={t("agentSpace.library")} onClose={onClose} wide>
        <FilesScreen />
      </Sheet>
    );
  if (panel === "insights") return <InsightsSheet onClose={onClose} />;
  if (panel === "brief")
    return (
      <Sheet title={t("agentSpace.marketBrief")} onClose={onClose} wide>
        <MarketBriefingCard plain onRequestClose={onClose} />
      </Sheet>
    );
  if (panel === "capabilities")
    return (
      <Sheet title={`${t("agentSpace.skillCenter")} · ${current.name}`} onClose={onClose} wide>
        <CapabilityHubScreen />
      </Sheet>
    );
  if (panel === "account")
    return (
      <Sheet title={t("agentSpace.account")} onClose={onClose} wide>
        <AccountScreen onSignOut={onSignOut} />
      </Sheet>
    );
  return null;
}
