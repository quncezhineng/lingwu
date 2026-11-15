import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import type { Channel } from "../../../packages/domain/src/channel";
import { agentLayout } from "./agent-layout";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import type { AgentDefinition } from "./agent-space-model";
import { useAgentWorkspace } from "./agent-workspace";
import { type AppConnectorView, useAppConnectors } from "./app-connectors";
import { Text } from "./app-text";
import { AssistantResponse } from "./assistant-response";
import {
  type ComposerSelection,
  ComposerSelectionChips,
  type ConnectorOption,
  ConnectorPickerSheet,
} from "./capability-picker";
import { promptWithAttachments } from "./chat-content";
import { ComposerAttachments, FilePickerSheet } from "./file-picker";
import { pickAndUploadFile } from "./file-upload";
import { useTranslation } from "./i18n";
import { Brain, FileText, FolderOpen, Globe2, Link2, Sparkles, Upload, Users } from "./icons";
import { useOrchestrations } from "./orchestration";
import { PromptComposer } from "./prompt-composer";
import { colors, fonts, radius, s } from "./ui";
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

/** 应用连接器分类 → 输入区选择弹层里的图标。 */
function connectorIcon(category: AppConnectorView["category"]) {
  switch (category) {
    case "search":
      return Globe2;
    case "office":
    case "documents":
    case "files":
      return FileText;
    case "development":
      return Link2;
    default:
      return Brain;
  }
}

export function ChannelChatScreen({
  channel,
  contentTopInset = 15,
}: {
  channel: Channel;
  /** 悬浮顶栏下的滚动起始内距，与 Agent 对话页同一取值。 */
  contentTopInset?: number;
}) {
  const { t } = useTranslation();
  const { agents } = useAgentSpace();
  const { delegate, data: agentWorkspace } = useAgentWorkspace();
  const { plans } = useOrchestrations();
  const { notify, api, refresh, workspace, navigate } = useWorkspace();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);
  // 附件与连接器选择（与 Agent 对话页同一套能力选择）。
  const [attachments, setAttachments] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [connectorPickerOpen, setConnectorPickerOpen] = useState(false);
  const [selectedConnectorIds, setSelectedConnectorIds] = useState<string[]>([]);

  // 频道用「账户级应用连接器」（slug 与后端 use_connection 一致），而非旧版 connections。
  const appConnectors = useAppConnectors(api);
  const connectorChoices: ConnectorOption[] = useMemo(
    () =>
      appConnectors.items.map((item) => ({
        id: item.slug,
        name: item.name,
        detail: item.summary,
        connected: item.connected,
        icon: connectorIcon(item.category),
      })),
    [appConnectors.items],
  );
  const selectedConnectors: ComposerSelection[] = connectorChoices
    .filter((option) => selectedConnectorIds.includes(option.id))
    .map((option) => ({ id: option.id, name: option.name }));

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

  async function uploadMaterial() {
    if (uploading) return;
    setUploading(true);
    try {
      const file = await pickAndUploadFile(api);
      if (!file) return;
      await refresh();
      setAttachments((ids) => (ids.includes(file.id) ? ids : [...ids, file.id]));
      setPickerSelection((ids) => (ids.includes(file.id) ? ids : [...ids, file.id]));
      setPicking(false);
      notify(t("chat.uploadMaterialDone", { name: file.name }));
    } catch (e) {
      notify(
        t("chat.uploadMaterialFailed", {
          detail: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setUploading(false);
    }
  }
  function openFilePicker() {
    setPickerSelection(attachments);
    setPicking(true);
  }

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
    // 附件：把选中的文件/分析产物作为「附加文档」引用进投研请求。
    const files = workspace.files.filter((f) => attachments.includes(f.id));
    const analysis = (agentWorkspace?.artifacts ?? []).filter((artifact) =>
      attachments.includes(artifact.id),
    );
    // 连接器：把已选应用连接器（slug）注入投研请求，并随任务 input 下传给成员子任务，
    // 由后端 createSubtask/executeModelTask 强约束成员用 use_connection 真正调用。
    const connectorSlugs = selectedConnectors.map((c) => c.id);
    const connectorLine = connectorSlugs.length
      ? `\n\nSelected connectors: ${selectedConnectors
          .map((c) => `${c.name} (slug: ${c.id})`)
          .join(", ")}`
      : "";
    const topic = `${text}${connectorLine}`;
    const prompt = t("channels.researchPrompt", {
      topic: promptWithAttachments(topic, files, analysis),
      roster,
      description: channel.description || t("channels.noGoal"),
      instructionsContext: channel.instructions
        ? t("channels.instructionsContext", { instructions: channel.instructions })
        : "",
    });
    try {
      const task = await delegate(
        {
          title: `${channel.name} · ${text.slice(0, 40)}`,
          prompt,
          kind: "agent",
          input: {
            forceOrchestration: true,
            channelId: channel.id,
            ...(connectorSlugs.length ? { channelConnectorSlugs: connectorSlugs } : {}),
          },
        },
        `channel-research:${channel.id}:${Date.now()}`,
      );
      setActiveTaskId(task.id);
      notify(t("channels.researchStarted"));
      // 发送后清空附件与连接器选择，避免带到下一轮。
      setAttachments([]);
      setSelectedConnectorIds([]);
      setPicking(false);
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
        testID="channel-chat-viewport"
        ref={listRef}
        style={{
          flex: 1,
          width: "100%",
          maxWidth: agentLayout.columnMaxWidth,
          alignSelf: "center",
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          gap: 13,
          paddingTop: contentTopInset,
          paddingBottom: 20,
          paddingHorizontal: 8,
          flexGrow: 1,
        }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View
            style={{
              flexGrow: 1,
              flexShrink: 0,
              justifyContent: "center",
              paddingVertical: 28,
              alignItems: "center",
              gap: 14,
            }}
          >
            <AgentOrb avatar={channel.avatar ?? "orb"} size={56} />
            <Text
              accessibilityLabel={t("channels.chatEmptyTitle")}
              style={{
                maxWidth: 560,
                textAlign: "center",
                color: colors.heading,
                fontSize: 22,
                lineHeight: 32,
                fontWeight: "500",
                letterSpacing: 0.2,
                fontFamily: fonts.sans,
              }}
            >
              {t("channels.chatEmptyTitle")}
            </Text>
            <Text
              style={[
                s.muted,
                { textAlign: "center", maxWidth: 540, fontSize: 13, lineHeight: 22 },
              ]}
            >
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
        ) : (
          messages.map((msg) =>
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
          )
        )}

        {busy && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
            <Sparkles size={14} color={colors.primary} />
            <Text style={[s.small, { color: colors.primary }]}>{t("channels.sending")}</Text>
          </View>
        )}
      </ScrollView>

      <View
        style={{
          width: "100%",
          maxWidth: agentLayout.columnMaxWidth,
          alignSelf: "center",
          paddingHorizontal: 8,
          paddingBottom: 12,
        }}
      >
        <PromptComposer
          value={draft}
          onChangeText={setDraft}
          onSubmit={() => void send()}
          placeholder={t("channels.composerPlaceholder")}
          accessibilityLabel={t("channels.composerPlaceholder")}
          sendLabel={t("chat.sendMessage")}
          stopLabel={t("chat.stopReply")}
          busy={busy}
          inputMinHeight={38}
          inputMaxHeight={104}
          dense
          inline
          tools={[
            {
              key: "attach",
              icon: Upload,
              label: t("chat.uploadMaterial"),
              active: uploading,
              onPress: () => void uploadMaterial(),
            },
            {
              key: "files",
              icon: FolderOpen,
              label: t("chat.filePickerTool"),
              active: picking,
              onPress: openFilePicker,
            },
            {
              key: "connectors",
              icon: Link2,
              label: t("chat.connectorPickerTool"),
              active: selectedConnectorIds.length > 0,
              onPress: () => setConnectorPickerOpen(true),
            },
          ]}
          attachments={
            <>
              <ComposerAttachments
                files={workspace.files}
                analysis={agentWorkspace?.artifacts ?? []}
                selectedIds={attachments}
                onRemove={(id) =>
                  setAttachments((ids) => ids.filter((candidate) => candidate !== id))
                }
              />
              <ComposerSelectionChips
                items={selectedConnectors}
                icon={Link2}
                removeLabel={(name) => t("chat.removeConnector", { name })}
                onRemove={(id) =>
                  setSelectedConnectorIds((ids) => ids.filter((candidate) => candidate !== id))
                }
              />
            </>
          }
        />
      </View>

      {picking && (
        <FilePickerSheet
          files={workspace.files}
          analysis={agentWorkspace?.artifacts ?? []}
          selectedIds={pickerSelection}
          onToggle={(id) =>
            setPickerSelection((ids) =>
              ids.includes(id) ? ids.filter((candidate) => candidate !== id) : [...ids, id],
            )
          }
          onConfirm={() => {
            setAttachments(pickerSelection);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
          onUpload={uploadMaterial}
          onBrowse={() => {
            setPicking(false);
            navigate("files");
          }}
        />
      )}
      {connectorPickerOpen && (
        <ConnectorPickerSheet
          options={connectorChoices}
          selectedIds={selectedConnectorIds}
          onToggle={(id) =>
            setSelectedConnectorIds((ids) =>
              ids.includes(id) ? ids.filter((candidate) => candidate !== id) : [...ids, id],
            )
          }
          onConfirm={() => setConnectorPickerOpen(false)}
          onClose={() => setConnectorPickerOpen(false)}
          onManage={() => {
            setConnectorPickerOpen(false);
            navigate("connections");
          }}
          onConnect={() => {
            setConnectorPickerOpen(false);
            navigate("connections");
          }}
        />
      )}
    </View>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <View style={{ alignSelf: "flex-end", maxWidth: 560 }}>
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderRadius: radius.card,
          backgroundColor: colors.primary,
        }}
      >
        <Text
          selectable
          style={{
            color: colors.onPrimary,
            fontFamily: fonts.sans,
            fontSize: 16,
            lineHeight: 24,
          }}
        >
          {text}
        </Text>
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
