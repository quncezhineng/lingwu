import { useState } from "react";
import { Pressable, View } from "react-native";
import type { AgentArtifact } from "../../../packages/domain/src/agent";
import { AccountScreen } from "./account";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import {
  AGENT_CAPABILITY_LABELS,
  AGENT_TEMPLATES,
  type AgentAvatarId,
  type AgentTemplateId,
} from "./agent-space-model";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { BotEditPage } from "./bot-pages/edit";
import { BotGoalsMemoryPage } from "./bot-pages/goals-memory";
import { BotHistoryPage } from "./bot-pages/history";
import { BotLibraryPage } from "./bot-pages/library";
import { useBotResources } from "./bot-pages/shared";
import { BotSkillsPage } from "./bot-pages/skills";
import { MarketBriefingCard } from "./briefing-card";
import { CapabilityHubScreen } from "./capability-hub";
import { useTranslation } from "./i18n";
import {
  ChevronRight,
  Clock3,
  type MessageCircle,
  Plus,
  Settings2,
  Sparkles,
  Star,
  Target,
} from "./icons";
import { InsightCard } from "./insight-card";
import { ModelSelector } from "./model-selector";
import { FilesScreen } from "./screens";
import { TaskHubScreen } from "./task-hub";
import { Button, colors, Field, radius, Sheet, s, typography } from "./ui";
import { WatchlistAddSheet } from "./watchlist";
import { WatchlistHubScreen } from "./watchlist-hub";
import { useWorkspace } from "./workspace";

export type AgentPanel =
  | "more"
  | "manage"
  | "bot-edit"
  | "bot-library"
  | "bot-skills"
  | "bot-history"
  | "bot-goals-memory"
  | "create"
  | "preferences"
  | "watchlist"
  | "watchlist-add"
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
  compact = false,
}: {
  icon: typeof MessageCircle;
  title: string;
  detail?: string;
  badge?: number;
  onPress: () => void;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        paddingHorizontal: 7,
        paddingVertical: 8,
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
          width: compact ? 32 : 38,
          height: compact ? 32 : 38,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? colors.paper : colors.surface,
        }}
      >
        <Icon size={18} color={active ? colors.primary : colors.muted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={[s.text, { fontSize: 13, fontWeight: "500" }]}>{title}</Text>
        {!!detail && !compact && (
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
  return <View style={{ gap: 4, marginBottom: 16 }}>{children}</View>;
}

export function AgentMoreContent({
  onPanel,
  compact = true,
  showWatchlistLink = true,
}: {
  onPanel: (panel: AgentPanel) => void;
  compact?: boolean;
  showWatchlistLink?: boolean;
}) {
  const { t, locale } = useTranslation();
  const { current } = useAgentSpace();
  const { data } = useAgentWorkspace();
  const tasks = data?.tasks ?? [];
  const activeTasks = tasks.filter(
    (task) => !["succeeded", "failed", "cancelled"].includes(task.status),
  );
  const capabilityPriority = ["reminder", "research", "financials"];
  const capabilityRank = (id: string) => {
    const index = capabilityPriority.indexOf(id);
    return index < 0 ? capabilityPriority.length : index;
  };
  const capabilities = current.skills
    .filter((skill) => !["quote", "brief", "notes"].includes(skill))
    .sort((a, b) => capabilityRank(a) - capabilityRank(b))
    .slice(0, 4);
  return (
    <View style={{ gap: 6 }}>
      <SheetSection>
        <PanelButton
          compact={compact}
          icon={Star}
          title={t("agentSpace.marketBrief")}
          detail={t("agentSpace.marketBriefDetail")}
          onPress={() => onPanel("brief")}
        />
        <PanelButton
          compact={compact}
          icon={Sparkles}
          title={t("agentSpace.insights")}
          detail={t("agentSpace.insightsDetail")}
          onPress={() => onPanel("insights")}
        />
        {showWatchlistLink && (
          <PanelButton
            compact={compact}
            icon={Star}
            title={t("agentSpace.watchlist")}
            detail={t("agentSpace.watchlistDetail")}
            onPress={() => onPanel("watchlist")}
          />
        )}
        <PanelButton
          compact={compact}
          icon={Clock3}
          title={t("agentSpace.tasks")}
          detail={t("agentSpace.tasksDetail")}
          badge={activeTasks.length}
          onPress={() => onPanel("tasks")}
        />
      </SheetSection>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
        {capabilities.map((capability) => {
          const label = AGENT_CAPABILITY_LABELS[capability];
          return (
            <Pressable
              key={capability}
              accessibilityRole="button"
              onPress={() => onPanel("capabilities")}
              style={({ pressed }) => ({
                width: "47%",
                minHeight: 64,
                padding: 11,
                borderRadius: 15,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: pressed ? colors.surface : colors.paper,
                gap: 9,
              })}
            >
              <Sparkles size={15} color={colors.primary} />
              <Text style={[s.text, { fontSize: 13, fontWeight: "600" }]} numberOfLines={2}>
                {label ? label[locale === "zh-Hans" ? "zh" : "en"] : capability}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => onPanel("capabilities")}
        style={({ pressed }) => ({
          minHeight: 43,
          marginTop: 8,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: colors.lineStrong,
          borderRadius: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
          backgroundColor: pressed ? colors.overlay1 : "transparent",
        })}
      >
        <Plus size={17} color={colors.faint} />
        <Text style={{ fontSize: 13, color: colors.faint }}>
          {t("agentSpace.unlockMoreFeatures")}
        </Text>
      </Pressable>
    </View>
  );
}

function AgentMoreSheet({
  onClose,
  onPanel,
}: {
  onClose: () => void;
  onPanel: (panel: AgentPanel) => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet botLayout title={t("agentSpace.more")} onClose={onClose} wide>
      <AgentMoreContent onPanel={onPanel} />
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
        botLayout
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
    <Sheet botLayout title={t("agentSpace.customizeTitle")} onClose={onClose} narrow>
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

function AgentManagerSheet({
  onClose,
  onPanel,
  onDismiss,
}: {
  onClose: () => void;
  onPanel: (panel: AgentPanel) => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const { current, data, tasks: agentTasks, artifacts: agentArtifacts, files } = useBotResources();
  const libraryCount = agentArtifacts.length + files.length;
  const skillCount = current.skills.length + current.customSkills.length;

  return (
    <Sheet botLayout title={current.name} onClose={onClose} narrow>
      <View
        style={{
          paddingTop: 9,
          gap: 15,
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
          <Button small icon={Settings2} onPress={() => onPanel("bot-edit")}>
            {t("agent.edit")}
          </Button>
        </View>
        <Text
          style={[
            s.muted,
            {
              fontSize: 11,
              lineHeight: 22,
              padding: 15,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.accentLine,
              backgroundColor: colors.sky,
            },
          ]}
        >
          {current.persona}
        </Text>
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 6,
            paddingVertical: 15,
            borderRadius: 17,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.paper,
          }}
        >
          {(
            [
              ["tasks", String(data?.tasks.length ?? 0), t("agentSpace.tasks")],
              ["bot-library", String(libraryCount), t("agentSpace.library")],
              ["bot-skills", String(skillCount), t("agentSpace.skills")],
            ] as const
          ).map(([id, value, label], index) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${value}`}
              onPress={() => onPanel(id)}
              style={{
                flex: 1,
                minHeight: 56,
                borderRightWidth: index < 2 ? 1 : 0,
                borderRightColor: colors.line,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <Text style={[s.metric, { fontSize: 22, color: colors.primaryStrong }]}>{value}</Text>
              <Text style={[s.small, { color: colors.faint }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 12, gap: 4 }}>
        <SheetSection>
          <PanelButton
            icon={Clock3}
            title={t("agentSpace.analysisHistory")}
            detail={`${agentTasks.length} · ${current.name}`}
            onPress={() => onPanel("bot-history")}
          />
          <PanelButton
            icon={Target}
            title={t("agentSpace.goalsMemory")}
            detail={`${data?.goals.length ?? 0} · ${data?.memories.length ?? 0}`}
            onPress={() => onPanel("bot-goals-memory")}
          />
        </SheetSection>
        <ModelSelector onManage={onDismiss} />
      </View>
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
      botLayout
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
    <Sheet botLayout title={t("agentSpace.insights")} onClose={onClose} wide>
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
  onDismiss,
}: {
  panel?: AgentPanel;
  onDismiss: () => void;
  onClose: () => void;
  onPanel: (panel: AgentPanel) => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const { current } = useAgentSpace();
  if (!panel) return null;
  if (panel === "more") return <AgentMoreSheet onClose={onClose} onPanel={onPanel} />;
  if (panel === "manage")
    return <AgentManagerSheet onClose={onClose} onPanel={onPanel} onDismiss={onDismiss} />;
  if (panel === "bot-edit") return <BotEditPage onClose={onClose} onDeleted={onDismiss} />;
  if (panel === "bot-library") return <BotLibraryPage onClose={onDismiss} />;
  if (panel === "bot-skills") return <BotSkillsPage onClose={onDismiss} />;
  if (panel === "bot-history") return <BotHistoryPage onClose={onDismiss} />;
  if (panel === "bot-goals-memory") return <BotGoalsMemoryPage onClose={onDismiss} />;
  if (panel === "create") return <CreateAgentSheet onClose={onClose} onCreated={onClose} />;
  if (panel === "preferences") return <PreferencesSheet onClose={onClose} />;
  if (panel === "watchlist-add") return <WatchlistAddSheet onClose={onDismiss} />;
  if (panel === "watchlist")
    return (
      <Sheet botLayout title={t("agentSpace.watchlist")} onClose={onClose} wide>
        <WatchlistHubScreen mode="embedded" />
      </Sheet>
    );
  if (panel === "tasks")
    return (
      <Sheet botLayout title={t("agentSpace.tasks")} onClose={onDismiss} wide>
        <TaskHubScreen initialTab="tasks" />
      </Sheet>
    );
  if (panel === "files")
    return (
      <Sheet botLayout title={t("agentSpace.library")} onClose={onClose} wide>
        <FilesScreen />
      </Sheet>
    );
  if (panel === "insights") return <InsightsSheet onClose={onClose} />;
  if (panel === "brief")
    return (
      <Sheet botLayout title={t("agentSpace.marketBrief")} onClose={onClose} wide>
        <MarketBriefingCard plain onRequestClose={onClose} />
      </Sheet>
    );
  if (panel === "capabilities")
    return (
      <Sheet
        botLayout
        title={`${t("agentSpace.skillCenter")} · ${current.name}`}
        onClose={onClose}
        wide
      >
        <CapabilityHubScreen mode="embedded" />
      </Sheet>
    );
  if (panel === "account")
    return (
      <Sheet botLayout title={t("agentSpace.account")} onClose={onClose} wide>
        <AccountScreen onSignOut={onSignOut} onOpenPreferences={() => onPanel("preferences")} />
      </Sheet>
    );
  return null;
}
