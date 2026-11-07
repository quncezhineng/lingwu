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
  type AgentSkill,
  type AgentTemplateId,
  parsePreferenceFocus,
} from "./agent-space-model";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { MarketBriefingCard } from "./briefing-card";
import { CapabilityHubScreen, MySkillDetailSheet, SkillDetailSheet } from "./capability-hub";
import { skillDisplayName } from "./capability-picker";
import { useTranslation } from "./i18n";
import {
  ChevronRight,
  Clock3,
  FolderOpen,
  Heart,
  type MessageCircle,
  Plus,
  Shapes,
  Sparkles,
  Star,
  Target,
} from "./icons";
import { InsightCard } from "./insight-card";
import { PreferencesScreen } from "./preferences-screen";
import { FilesScreen } from "./screens";
import { skillCatalog } from "./skill-catalog";
import { TaskHubScreen } from "./task-hub";
import { Button, colors, Field, HoverPressable, radius, Sheet, s } from "./ui";
import { WatchlistAddSheet } from "./watchlist";
import { WatchlistHubScreen } from "./watchlist-hub";
import { useWorkspace } from "./workspace";

export type AgentPanel =
  | "more"
  | "create"
  | "preferences"
  | "memory"
  | "watchlist"
  | "watchlist-add"
  | "tasks"
  | "files"
  | "insights"
  | "brief"
  | "capabilities"
  | "account";

export function PanelButton({
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
    <HoverPressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed, hovered }) => ({
        minHeight: 46,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: radius.card,
        backgroundColor: active
          ? colors.sky
          : pressed
            ? colors.overlay2
            : hovered
              ? colors.overlay1
              : "transparent",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      })}
    >
      <View
        style={{
          width: compact ? 30 : 34,
          height: compact ? 30 : 34,
          borderRadius: radius.control,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? colors.paper : colors.surface,
        }}
      >
        <Icon size={17} color={active ? colors.primary : colors.muted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
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
    </HoverPressable>
  );
}

function SheetSection({ children }: { children: React.ReactNode }) {
  return <View style={{ gap: 4, marginBottom: 16 }}>{children}</View>;
}

export function AgentMoreContent({
  onPanel,
  onOpenApps,
  onOpenAgentSkills,
  onInspectSkill,
  compact = true,
}: {
  onPanel: (panel: AgentPanel) => void;
  /** 应用与能力是独立页面，不走浮层：由调用方负责跳转。 */
  onOpenApps: () => void;
  /** 解锁更多功能：进入当前 Agent 详情设置的「技能」分区，由调用方负责跳转。 */
  onOpenAgentSkills: () => void;
  /** 点击能力卡片展示该技能的只读详情，由调用方作为兄弟节点挂载弹层，避免嵌套 Modal。 */
  onInspectSkill?: (skillId: string) => void;
  compact?: boolean;
}) {
  const { t, locale } = useTranslation();
  const { current } = useAgentSpace();
  const { data } = useAgentWorkspace();
  const tasks = data?.tasks ?? [];
  const activeTasks = tasks.filter(
    (task) => !["succeeded", "failed", "cancelled"].includes(task.status),
  );
  // 「更多能力」展示当前 Agent 的独有能力：优先用该 Agent 自定义 + 从技能目录
  // 专门安装的技能（这才是真正区分不同 Agent 的东西）；没有独有能力时回退到
  // 该 Agent 模板的核心投研能力，避免落入通用的 research/files/memory/search 文案。
  const distinctive = [
    ...current.customSkills.map((skill) => skill.id),
    ...current.installedSkills,
  ];
  const capabilities =
    distinctive.length > 0
      ? distinctive.slice(0, 4)
      : current.skills
          .filter((skill) => !["files", "memory", "search", "notes"].includes(skill))
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
          icon={Clock3}
          title={t("agentSpace.tasks")}
          detail={t("agentSpace.tasksDetail")}
          badge={activeTasks.length}
          onPress={() => onPanel("tasks")}
        />
        <PanelButton
          compact={compact}
          icon={Star}
          title={t("agentSpace.watchlistAndPortfolio")}
          detail={t("agentSpace.watchlistDetail")}
          onPress={() => onPanel("watchlist")}
        />
        <PanelButton
          compact={compact}
          icon={FolderOpen}
          title={t("app.navFiles")}
          detail={t("app.destFilesDetail")}
          onPress={() => onPanel("files")}
        />
        <PanelButton
          compact={compact}
          icon={Heart}
          title={t("app.navPreferences")}
          detail={t("details.settingsPreferencesDetail")}
          onPress={() => onPanel("memory")}
        />
        <PanelButton
          compact={compact}
          icon={Shapes}
          title={t("app.navApps")}
          detail={t("app.destAppsDetail")}
          onPress={onOpenApps}
        />
      </SheetSection>

      {!!capabilities.length && (
        <Text
          style={{
            marginTop: 16,
            marginBottom: 8,
            paddingHorizontal: 8,
            fontSize: 12,
            fontWeight: "600",
            color: colors.muted,
          }}
        >
          {t("agentSpace.agentCapabilities", { name: current.name })}
        </Text>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {capabilities.map((capability) => {
          // 系统能力查固定标签表；独有能力（安装/自建技能）走技能目录的展示名。
          const displayName =
            AGENT_CAPABILITY_LABELS[capability]?.[locale === "zh-Hans" ? "zh" : "en"] ||
            skillDisplayName(capability, current.customSkills);
          // 判定该能力是否有对应的详情：优先自建技能，其次技能目录；
          // 其余系统能力没有详情页，维持打开「技能中心」面板的原行为。
          const inspectable =
            current.customSkills.some((skill) => skill.id === capability) ||
            skillCatalog.some((skill) => skill.id === capability);
          return (
            <Pressable
              key={capability}
              accessibilityRole="button"
              onPress={() => (inspectable ? onInspectSkill?.(capability) : onPanel("capabilities"))}
              style={({ pressed }) => ({
                width: "47%",
                minHeight: 60,
                padding: 10,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: pressed ? colors.surface : colors.paper,
                gap: 8,
              })}
            >
              <Sparkles size={15} color={colors.primary} />
              <Text style={[s.text, { fontSize: 13, fontWeight: "600" }]} numberOfLines={2}>
                {displayName}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenAgentSkills}
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
  onOpenAgentSkills,
  onInspectSkill,
}: {
  onClose: () => void;
  onPanel: (panel: AgentPanel) => void;
  onOpenAgentSkills: () => void;
  onInspectSkill?: (skillId: string) => void;
}) {
  const { t } = useTranslation();
  const { navigate } = useWorkspace();
  return (
    <Sheet botLayout title={t("agentSpace.more")} onClose={onClose} wide>
      <AgentMoreContent
        onPanel={onPanel}
        onInspectSkill={onInspectSkill}
        onOpenApps={() => {
          onClose();
          navigate("apps");
        }}
        onOpenAgentSkills={() => {
          onClose();
          onOpenAgentSkills();
        }}
      />
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

function PreferencesSheet({ onClose }: { onClose: () => void }) {
  const { t, locale } = useTranslation();
  const { preferences, setPreferences, resetPreferences } = useAgentSpace();
  const [name, setName] = useState(preferences.name);
  const [risk, setRisk] = useState(preferences.risk);
  const [horizon, setHorizon] = useState(preferences.horizon);
  const [goal, setGoal] = useState(preferences.goal);
  const [following, setFollowing] = useState(() =>
    [...preferences.markets, ...preferences.areas].join(locale === "zh-Hans" ? "、" : ", "),
  );
  const [confirmingClear, setConfirmingClear] = useState(false);
  const options = [
    ["稳健一些", "riskSteady"],
    ["均衡一些", "riskBalanced"],
    ["更积极一些", "riskActive"],
    ["还不确定", "riskUnsure"],
  ] as const;
  const horizons = ["1—2年", "3年以上", "还不确定"] as const;
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
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: risk === value ? colors.primary : colors.line,
              backgroundColor: risk === value ? colors.sky : colors.paper,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: risk === value ? colors.primaryStrong : colors.muted,
              }}
            >
              {t(`agentSpace.${labelKey}` as "agentSpace.riskSteady")}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={[s.small, { fontWeight: "600", color: colors.text, marginBottom: 8 }]}>
        {t("agentSpace.horizonPreference")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
        {horizons.map((value) => {
          const selected = horizon === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setHorizon(selected ? "" : value)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.line,
                backgroundColor: selected ? colors.sky : colors.paper,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: selected ? colors.primaryStrong : colors.muted,
                }}
              >
                {value}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Field
        label={t("agentSpace.goal")}
        value={goal}
        onChangeText={setGoal}
        maxLength={120}
        multiline
      />
      <Field
        label={t("agentSpace.following")}
        value={following}
        onChangeText={setFollowing}
        placeholder={t("agentSpace.followingPlaceholder")}
        maxLength={600}
      />
      <Button
        primary
        onPress={() => {
          setPreferences({
            name: name.trim(),
            risk,
            horizon,
            goal,
            ...parsePreferenceFocus(following),
          });
          onClose();
        }}
      >
        {t("agentSpace.savePreferences")}
      </Button>
      {confirmingClear ? (
        <>
          <Text style={[s.small, { textAlign: "center", marginTop: 14 }]}>
            {t("agentSpace.clearPreferencesConfirm")}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Button
              danger
              style={{ flex: 1 }}
              onPress={() => {
                resetPreferences();
                onClose();
              }}
            >
              {t("agentSpace.clearPreferencesAction")}
            </Button>
            <Button style={{ flex: 1 }} onPress={() => setConfirmingClear(false)}>
              {t("common.cancel")}
            </Button>
          </View>
        </>
      ) : (
        <Button style={{ marginTop: 8 }} onPress={() => setConfirmingClear(true)}>
          {t("agentSpace.clearPreferences")}
        </Button>
      )}
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

/**
 * 基于 skillId 渲染技能的只读详情：
 * 自建技能 → MySkillDetailSheet；目录技能 → SkillDetailSheet（不传 agents/onToggleInstall，
 * 右上角无「添加到智能体」按钮）；均查不到（系统能力）返回 null，由调用方保持原行为。
 */
export function AgentSkillInspectSheet({
  skillId,
  onClose,
}: {
  skillId: string;
  onClose: () => void;
}) {
  const { current } = useAgentSpace();
  const custom = current.customSkills.find((skill) => skill.id === skillId);
  if (custom) {
    return <MySkillDetailSheet title={custom.name} skill={custom} onClose={onClose} />;
  }
  const entry = skillCatalog.find((skill) => skill.id === skillId);
  if (!entry) return null;
  return <SkillDetailSheet skill={entry} onClose={onClose} />;
}

export function AgentSheets({
  panel,
  onClose,
  onPanel,
  onSignOut,
  onDismiss,
  onOpenAgentSkills,
}: {
  panel?: AgentPanel;
  onDismiss: () => void;
  onClose: () => void;
  onPanel: (panel: AgentPanel) => void;
  onSignOut: () => void;
  /** 解锁更多功能：进入当前 Agent 详情设置的「技能」分区，由 AgentProductShell 持有实现。 */
  onOpenAgentSkills: () => void;
}) {
  const { t } = useTranslation();
  const { current } = useAgentSpace();
  // 能力卡片点击后展示的技能详情 id；作为兄弟节点挂载，避免与 AgentMoreSheet 嵌套 Modal。
  const [inspectSkillId, setInspectSkillId] = useState<string | null>(null);
  if (!panel) return null;
  if (panel === "more")
    return (
      <>
        <AgentMoreSheet
          onClose={onClose}
          onPanel={onPanel}
          onOpenAgentSkills={onOpenAgentSkills}
          onInspectSkill={setInspectSkillId}
        />
        {inspectSkillId && (
          <AgentSkillInspectSheet
            skillId={inspectSkillId}
            onClose={() => setInspectSkillId(null)}
          />
        )}
      </>
    );
  if (panel === "create") return <CreateAgentSheet onClose={onClose} onCreated={onClose} />;
  if (panel === "preferences") return <PreferencesSheet onClose={onClose} />;
  if (panel === "memory")
    return (
      <Sheet botLayout title={t("agent.memory")} onClose={onClose} wide>
        <PreferencesScreen embedded />
      </Sheet>
    );
  if (panel === "watchlist-add") return <WatchlistAddSheet onClose={onDismiss} />;
  if (panel === "watchlist")
    return (
      <Sheet botLayout title={t("agentSpace.watchlistAndPortfolio")} onClose={onClose} wide>
        <WatchlistHubScreen mode="embedded" onOpenChat={onClose} />
      </Sheet>
    );
  if (panel === "tasks")
    return (
      <Sheet botLayout title={t("agentSpace.tasks")} onClose={onDismiss} wide>
        {/* 任务为全局视图：汇总所有 Agent 的全部任务，不按当前 Agent 过滤。 */}
        <TaskHubScreen initialTab="tasks" />
      </Sheet>
    );
  if (panel === "files")
    return (
      <Sheet botLayout title={t("agentSpace.library")} onClose={onClose} wide>
        {/* 投入分析会把提示词预填进对话，这里先关掉弹层让用户看到输入框。 */}
        <FilesScreen embedded onOpenChat={onClose} />
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
        <CapabilityHubScreen mode="embedded" onOpenChat={onClose} />
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
