import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import type { AgentTask } from "../../../packages/domain/src/agent";
import type { Channel } from "../../../packages/domain/src/channel";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { useChannels } from "./channels";
import { useTranslation } from "./i18n";
import { Plus, Sparkles, Trash2, Users } from "./icons";
import { useOrchestrations } from "./orchestration";
import { Button, CheckRow, colors, Empty, ErrorNotice, Field, radius, Sheet, s } from "./ui";
import { useWorkspace } from "./workspace";

/**
 * 多 Agent 群聊频道（M2）。
 *
 * 左侧栏「频道」入口：创建频道（选多个 Agent）→ 进入频道查看成员并发起投研协作。
 * 消息承载复用 CopilotKit thread（每个成员 Agent 一个 thread）；本页负责频道的
 * 元数据管理与成员展示，投研对话由「发起分析」进入编排流程。
 */

export function ChannelsScreen() {
  const { t } = useTranslation();
  const { channels, loading, error, refresh, deleteChannel } = useChannels();
  const { agents } = useAgentSpace();
  const { data: agentWorkspace } = useAgentWorkspace();
  const { plans } = useOrchestrations();
  const { open } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 频道成员 id → Agent 定义，用于展示头像与角色。
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const memberOf = (id: string) => agentById.get(id);

  // 每个频道的投研任务（input.channelId 关联），用于展示协作进度。
  const tasks = agentWorkspace?.tasks ?? [];
  const researchByChannel = useMemo(() => {
    const map = new Map<string, AgentTask[]>();
    for (const task of tasks) {
      const channelId = task.input?.channelId;
      if (typeof channelId !== "string") continue;
      const list = map.get(channelId) ?? [];
      list.push(task);
      map.set(channelId, list);
    }
    return map;
  }, [tasks]);

  return (
    <View style={{ gap: 16 }}>
      <ErrorNotice error={error} />
      <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
        <Text style={[s.heading]}>{t("channels.heading")}</Text>
        <Button primary icon={Plus} onPress={() => setCreating(true)}>
          {t("channels.create")}
        </Button>
      </View>

      {loading && channels.length === 0 ? (
        <Text style={s.muted}>{t("channels.loading")}</Text>
      ) : channels.length === 0 ? (
        <Empty icon={Users} title={t("channels.emptyTitle")} detail={t("channels.emptyDetail")} />
      ) : (
        <View style={{ gap: 10 }}>
          {channels.map((channel) => {
            const members = channel.agentIds
              .map(memberOf)
              .filter((m): m is NonNullable<typeof m> => Boolean(m));
            return (
              <Pressable
                key={channel.id}
                accessibilityRole="button"
                onPress={() => setSelected(channel)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 14,
                  borderRadius: radius.card,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: pressed ? colors.overlay1 : colors.paper,
                })}
              >
                <View style={{ flexDirection: "row", marginRight: 4 }}>
                  {members.slice(0, 3).map((member, index) => (
                    <View key={member.id} style={{ marginLeft: index ? -8 : 0 }}>
                      <AgentOrb avatar={member.avatar} size={28} />
                    </View>
                  ))}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={[s.text, { fontWeight: "600" }]}>
                    {channel.name}
                    <Text style={[s.small, { color: colors.faint, fontWeight: "400" }]}>
                      {`（ ${members.length} ）`}
                    </Text>
                  </Text>
                  <Text numberOfLines={1} style={[s.small, { color: colors.faint }]}>
                    {members.map((m) => m.name).join(" · ")}
                  </Text>
                  <ChannelResearchStatus
                    tasks={researchByChannel.get(channel.id) ?? []}
                    plans={plans}
                    onOpenTask={(taskId) => open({ type: "task", taskId })}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmDelete(channel.id)}
                  hitSlop={6}
                >
                  <Trash2 size={16} color={colors.muted} />
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      )}

      {creating && (
        <CreateChannelSheet
          onClose={() => setCreating(false)}
          onCreated={(channel) => {
            setCreating(false);
            setSelected(channel);
          }}
        />
      )}

      {selected && <ChannelDetailSheet channel={selected} onClose={() => setSelected(null)} />}

      {confirmDelete && (
        <Sheet title={t("channels.deleteTitle")} onClose={() => setConfirmDelete(null)} narrow>
          <View style={{ gap: 12 }}>
            <Text style={s.text}>{t("channels.deleteConfirm")}</Text>
            <View style={[s.row, { gap: 8 }]}>
              <Button
                danger
                onPress={() => {
                  void deleteChannel(confirmDelete).then(() => setConfirmDelete(null));
                }}
              >
                {t("channels.deleteAction")}
              </Button>
              <Button onPress={() => setConfirmDelete(null)}>{t("common.cancel")}</Button>
            </View>
          </View>
        </Sheet>
      )}
    </View>
  );
}

/** 投研任务终态：不再展示「进行中」进度。 */
const RESEARCH_TERMINAL: ReadonlySet<AgentTask["status"]> = new Set([
  "succeeded",
  "failed",
  "cancelled",
]);

/**
 * 频道投研状态条（M2）：在频道卡片里展示该频道最近一次投研的进度。
 * 优先找「进行中」的任务并关联其编排计划展示节点进度；否则展示最近一次终态结果。
 * 点击状态条打开对应任务的详情（查看结果/进度），不触发外层卡片的「进入频道」。
 */
function ChannelResearchStatus({
  tasks,
  plans,
  onOpenTask,
}: {
  tasks: AgentTask[];
  plans: ReturnType<typeof useOrchestrations>["plans"];
  onOpenTask: (taskId: string) => void;
}) {
  const { t } = useTranslation();
  if (tasks.length === 0) return null;

  const active = tasks.find((task) => !RESEARCH_TERMINAL.has(task.status));
  const target = active ?? tasks[0];

  if (active) {
    // 进行中的投研：关联其编排计划，展示「N/M 项专家任务」进度。
    const plan = plans.find((p) => p.parentTaskId === target.id);
    const done = plan ? plan.nodes.filter((n) => n.status === "succeeded").length : 0;
    const total = plan ? plan.nodes.length : 0;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("channels.researchRunning")}
        onPress={() => onOpenTask(target.id)}
        hitSlop={6}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
        <Text style={[s.small, { color: colors.primary, fontWeight: "500" }]}>
          {plan && total > 0
            ? `${t("channels.researchRunning")} · ${t("channels.researchNodeProgress", { done, total })}`
            : t("channels.researchRunning")}
        </Text>
      </Pressable>
    );
  }

  // 终态：展示成功/失败。
  const failed = target.status === "failed";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={failed ? t("channels.researchFailed") : t("channels.researchDone")}
      onPress={() => onOpenTask(target.id)}
      hitSlop={6}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: failed ? colors.danger : colors.success,
        }}
      />
      <Text
        style={[s.small, { color: failed ? colors.danger : colors.success, fontWeight: "500" }]}
      >
        {failed ? t("channels.researchFailed") : t("channels.researchDone")}
      </Text>
    </Pressable>
  );
}

export function CreateChannelSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}) {
  const { t } = useTranslation();
  const { agents } = useAgentSpace();
  const { createChannel } = useChannels();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  async function submit() {
    setError("");
    if (!name.trim()) {
      setError(t("channels.nameRequired"));
      return;
    }
    if (selectedIds.length < 2) {
      setError(t("channels.minMembers"));
      return;
    }
    setBusy(true);
    try {
      const channel = await createChannel({
        name: name.trim(),
        agentIds: selectedIds,
        description: description.trim() || undefined,
      });
      onCreated(channel);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("channels.create")} onClose={onClose}>
      <View style={{ gap: 14 }}>
        <Field label={t("channels.nameLabel")} value={name} onChangeText={setName} />
        <Field
          label={t("channels.descriptionLabel")}
          value={description}
          onChangeText={setDescription}
          placeholder={t("channels.descriptionPlaceholder")}
        />
        <Text style={[s.heading, { fontSize: 14 }]}>{t("channels.membersLabel")}</Text>
        <ScrollView style={{ maxHeight: 280 }}>
          {agents.map((agent) => (
            <View key={agent.id} style={[s.row, { gap: 10, paddingVertical: 4 }]}>
              <AgentOrb avatar={agent.avatar} size={26} />
              <CheckRow
                label={`${agent.name}${agent.role ? ` · ${agent.role}` : ""}`}
                checked={selectedIds.includes(agent.id)}
                onPress={() => toggle(agent.id)}
              />
            </View>
          ))}
        </ScrollView>
        <ErrorNotice error={error} />
        <Button primary busy={busy} onPress={() => void submit()}>
          {t("channels.createConfirm")}
        </Button>
      </View>
    </Sheet>
  );
}

function ChannelDetailSheet({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const { t } = useTranslation();
  const { agents } = useAgentSpace();
  const { delegate } = useAgentWorkspace();
  const { notify } = useWorkspace();
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const members = channel.agentIds
    .map((id) => agents.find((a) => a.id === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  // 直接创建顶层投研任务（绕过主对话 agent 的两跳判断），结构化标记
  // forceOrchestration 保证服务端把该任务切换为「必须编排」——不依赖模型自觉。
  async function startResearch() {
    const topic = goal.trim();
    if (!topic) {
      setError(t("channels.researchRequired"));
      return;
    }
    setError("");
    // 每行一个成员：`name（role）→ agentId`，让编排者把 DAG 节点精确指派到具体成员 Agent。
    const roster = members
      .map((m) => `${m.name}（${m.role || t("channels.roleUnset")}）→ id:${m.id}`)
      .join("\n");
    const prompt = t("channels.researchPrompt", {
      topic,
      roster,
      description: channel.description || t("channels.noGoal"),
      instructionsContext: channel.instructions
        ? t("channels.instructionsContext", { instructions: channel.instructions })
        : "",
    });
    setBusy(true);
    try {
      await delegate(
        {
          title: `${channel.name} · ${topic}`,
          prompt,
          kind: "agent",
          input: { forceOrchestration: true, channelId: channel.id },
        },
        `channel-research:${channel.id}:${Date.now()}`,
      );
      notify(t("channels.researchStarted"));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={channel.name} subtitle={channel.description} onClose={onClose}>
      <View style={{ gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text style={[s.heading, { fontSize: 14 }]}>{t("channels.membersLabel")}</Text>
          {members.map((member) => (
            <View key={member.id} style={[s.row, { gap: 10, alignItems: "center" }]}>
              <AgentOrb avatar={member.avatar} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={[s.text, { fontWeight: "600" }]}>{member.name}</Text>
                <Text style={[s.small, { color: colors.faint }]}>{member.role}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ gap: 10 }}>
          <Text style={[s.heading, { fontSize: 14 }]}>{t("channels.researchLabel")}</Text>
          <Field
            label={t("channels.researchPlaceholder")}
            value={goal}
            onChangeText={setGoal}
            multiline
            placeholder={t("channels.researchPlaceholder")}
          />
          <ErrorNotice error={error} />
          <Button primary icon={Sparkles} busy={busy} onPress={() => void startResearch()}>
            {t("channels.researchAction")}
          </Button>
          <Text style={[s.small, { color: colors.faint }]}>{t("channels.chatHint")}</Text>
        </View>
      </View>
    </Sheet>
  );
}
