import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import type { Channel } from "../../../packages/domain/src/channel";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import type { AgentDefinition } from "./agent-space-model";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { AssistantResponse } from "./assistant-response";
import { useTranslation } from "./i18n";
import { Sparkles, Users } from "./icons";
import { useOrchestrations } from "./orchestration";
import { PromptComposer } from "./prompt-composer";
import { colors, radius, s } from "./ui";
import { useWorkspace } from "./workspace";

/**
 * 频道群聊对话页（M2）。
 *
 * 与 Agent 对话页同级的「多 Agent 群聊」：用户在频道发一条消息，编排者拆解后
 * 各成员 Agent 用自己的 thread + 人设独立执行，结果以「成员回复」形式聚合展示。
 * 消息承载：用户消息本地暂存，成员回复来自编排子任务 result（轮询编排计划）。
 */

type ChannelMessage =
  | { id: string; role: "user"; text: string; at: string }
  | { id: string; role: "member"; agentId: string; title: string; text: string; at: string };

export function ChannelChatScreen({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { agents } = useAgentSpace();
  const { delegate } = useAgentWorkspace();
  const { plans } = useOrchestrations();
  const { notify } = useWorkspace();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);

  const members = useMemo(
    () =>
      channel.agentIds
        .map((id) => agents.find((a) => a.id === id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [agents, channel.agentIds],
  );
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // 当前投研的编排计划：把已完成的节点结果渲染成成员回复。
  const activePlan = useMemo(
    () => (activeTaskId ? plans.find((p) => p.parentTaskId === activeTaskId) : undefined),
    [plans, activeTaskId],
  );

  // 编排计划里「有结果」的节点 → 转成成员回复消息（去重、保持节点顺序）。
  useEffect(() => {
    if (!activePlan) return;
    setMessages((existing) => {
      const seen = new Set(existing.map((m) => m.id));
      const additions: ChannelMessage[] = [];
      for (const node of activePlan.nodes) {
        if (!node.result) continue;
        const key = `member:${node.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const member = memberById.get(node.agentTemplate);
        additions.push({
          id: key,
          role: "member",
          agentId: member?.id ?? node.agentTemplate,
          title: node.title,
          text: node.result,
          at: activePlan.updatedAt,
        });
      }
      return additions.length ? [...existing, ...additions] : existing;
    });
  }, [activePlan, memberById]);

  // 编排终态后停止「进行中」态。
  useEffect(() => {
    if (activePlan && (activePlan.status === "succeeded" || activePlan.status === "failed")) {
      setBusy(false);
      setActiveTaskId(null);
    }
  }, [activePlan]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    const userMsg: ChannelMessage = {
      id: `user:${Date.now()}`,
      role: "user",
      text,
      at: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);
    // 每行一个成员：`name（role）→ id`，让编排者把 DAG 节点精确指派到具体成员。
    const roster = members
      .map((m) => `${m.name}（${m.role || t("channels.roleUnset")}）→ id:${m.id}`)
      .join("\n");
    const prompt = t("channels.researchPrompt", {
      topic: text,
      roster,
      description: channel.description || t("channels.noGoal"),
    });
    try {
      const task = await delegate(
        {
          title: `${channel.name} · ${text.slice(0, 40)}`,
          prompt,
          kind: "agent",
          input: { forceOrchestration: true, channelId: channel.id },
        },
        `channel-research:${channel.id}:${Date.now()}`,
      );
      setActiveTaskId(task.id);
      notify(t("channels.researchStarted"));
    } catch (e) {
      setBusy(false);
      setMessages((m) => [
        ...m,
        {
          id: `err:${Date.now()}`,
          role: "member",
          agentId: "",
          title: t("channels.researchFailed"),
          text: e instanceof Error ? e.message : String(e),
          at: new Date().toISOString(),
        },
      ]);
    }
  }

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        ref={listRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 14, paddingHorizontal: 18, paddingVertical: 16 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <View style={{ alignItems: "center", gap: 12, paddingTop: 40 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: radius.full,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.sky,
              }}
            >
              <Users size={26} color={colors.primary} strokeWidth={1.7} />
            </View>
            <Text style={[s.heading, { textAlign: "center" }]}>{t("channels.chatEmptyTitle")}</Text>
            <Text style={[s.muted, { textAlign: "center", maxWidth: 420 }]}>
              {t("channels.chatEmptyDetail")}
            </Text>
            {members.length > 0 && (
              <View style={{ flexDirection: "row", marginTop: 4 }}>
                {members.map((m, i) => (
                  <View key={m.id} style={{ marginLeft: i ? -8 : 0 }}>
                    <AgentOrb avatar={m.avatar} size={32} />
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {messages.map((msg) =>
          msg.role === "user" ? (
            <UserBubble key={msg.id} text={msg.text} />
          ) : (
            <MemberBubble
              key={msg.id}
              agentId={msg.agentId}
              title={msg.title}
              text={msg.text}
              member={memberById.get(msg.agentId)}
            />
          ),
        )}

        {busy && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
            <Sparkles size={14} color={colors.primary} />
            <Text style={[s.small, { color: colors.primary }]}>{t("channels.sending")}</Text>
          </View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 18, paddingBottom: 12 }}>
        <PromptComposer
          value={draft}
          onChangeText={setDraft}
          onSubmit={() => void send()}
          placeholder={t("channels.composerPlaceholder")}
          accessibilityLabel={t("channels.composerPlaceholder")}
          sendLabel={t("chat.sendMessage")}
          busy={busy}
        />
      </View>
    </View>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <View style={{ alignItems: "flex-end" }}>
      <View
        style={{
          maxWidth: "82%",
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: radius.card,
          backgroundColor: colors.sky,
        }}
      >
        <Text style={s.text}>{text}</Text>
      </View>
    </View>
  );
}

function MemberBubble({
  agentId,
  title,
  text,
  member,
}: {
  agentId: string;
  title: string;
  text: string;
  member?: AgentDefinition;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      <View style={{ marginTop: 2 }}>
        {member ? (
          <AgentOrb avatar={member.avatar} size={32} />
        ) : (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: radius.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.surface,
            }}
          >
            <Users size={16} color={colors.muted} />
          </View>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
            {member?.name ?? agentId}
          </Text>
          {member?.role ? (
            <Text style={[s.small, { color: colors.faint }]}>{member.role}</Text>
          ) : null}
        </View>
        {title ? <Text style={[s.small, { color: colors.primaryStrong }]}>{title}</Text> : null}
        <View
          style={{
            alignSelf: "flex-start",
            maxWidth: "100%",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.paper,
          }}
        >
          <AssistantResponse content={text} />
        </View>
      </View>
    </View>
  );
}
