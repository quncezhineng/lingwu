import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import type { Channel, ChannelMessage } from "../../../packages/domain/src/channel";
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
import { type ChannelChatStream, streamChannelChat } from "./channel-chat-stream";
import { promptWithAttachments } from "./chat-content";
import { ComposerAttachments, FilePickerSheet } from "./file-picker";
import { pickAndUploadFile } from "./file-upload";
import { useTranslation } from "./i18n";
import { Brain, FileText, FolderOpen, Globe2, Link2, Sparkles, Upload, Users } from "./icons";
import { PromptComposer } from "./prompt-composer";
import { colors, fonts, radius, s } from "./ui";
import { useWorkspace } from "./workspace";

/**
 * 频道群聊对话页。
 *
 * 与智能体对话同构：用户在频道发一条消息，成员 Agent 依次用自己的 threadId / 人设 /
 * 模型跑一轮真实对话，文本逐字流式回来，像群聊里依次发言（后成员能看到前面的分析）。
 * 消息落库，刷新后回看；用户消息保留附件与连接器选择。
 */

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
  const { data: agentWorkspace } = useAgentWorkspace();
  const { notify, api, refresh, workspace, navigate } = useWorkspace();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);
  const streamRef = useRef<ChannelChatStream | null>(null);
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

  // 打开频道先加载历史消息（用户提问 + 成员回复）。切换频道时先清空，避免串味。
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setMessages([]);
    setAttachments([]);
    setSelectedConnectorIds([]);
    setBusy(false);
    streamRef.current?.close();
    streamRef.current = null;
    void api
      .request<ChannelMessage[]>(`/api/channels/${encodeURIComponent(channel.id)}/messages`)
      .then((history) => {
        if (alive) setMessages(history);
      })
      .catch(() => {
        if (alive) setMessages([]);
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, [api, channel.id]);

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

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || busy || !loaded || members.length === 0) return;
    setDraft("");
    setBusy(true);
    const files = workspace.files.filter((f) => attachments.includes(f.id));
    const analysis = (agentWorkspace?.artifacts ?? []).filter((artifact) =>
      attachments.includes(artifact.id),
    );
    // 附件正文与选定连接器一并写进请求：附件进本轮文本上下文，连接器 slug 由后端注入成员工具引导。
    const withAttachments = promptWithAttachments(text, files, analysis);
    try {
      streamRef.current = streamChannelChat(
        api,
        channel.id,
        {
          text: withAttachments,
          attachmentIds: attachments.length ? attachments : undefined,
          connectorSlugs: selectedConnectorIds.length ? selectedConnectorIds : undefined,
        },
        {
          onEvent: (event, data) => {
            if (event === "member_start") {
              setStreamingId(String(data.agentId ?? ""));
            } else if (event === "delta") {
              const agentId = String(data.agentId ?? "");
              const delta = String(data.text ?? "");
              if (!delta) return;
              setMessages((current) => {
                // 正在流式输出的是最后一条同 agent 的 member 消息；没有就新建一条。
                const last = current.at(-1);
                if (
                  last?.role === "member" &&
                  last.agentId === agentId &&
                  last.id.startsWith("live:")
                ) {
                  return [...current.slice(0, -1), { ...last, text: last.text + delta }];
                }
                return [
                  ...current,
                  {
                    id: `live:${agentId}:${Date.now()}`,
                    channelId: channel.id,
                    role: "member",
                    agentId,
                    title: String(data.title ?? ""),
                    text: delta,
                    createdAt: new Date().toISOString(),
                  },
                ];
              });
            } else if (event === "done") {
              setStreamingId(null);
              setBusy(false);
              void refresh();
            } else if (event === "member_done") {
              setStreamingId(null);
            } else if (event === "error") {
              notify(String(data.message ?? t("channels.chatFailed")));
            }
          },
          onError: (message) => {
            notify(message);
            setBusy(false);
            setStreamingId(null);
          },
          // 服务端未发 done 就断开时也要恢复输入，避免一直卡在「生成中」。
          onClose: () => {
            setBusy(false);
            setStreamingId(null);
          },
        },
      );
      // 发送后清空附件与连接器选择，避免带到下一轮。
      setAttachments([]);
      setSelectedConnectorIds([]);
      setPicking(false);
    } catch (e) {
      setBusy(false);
      setStreamingId(null);
      notify(e instanceof Error ? e.message : String(e));
    }
  }, [
    api,
    agentWorkspace?.artifacts,
    attachments,
    busy,
    channel.id,
    draft,
    loaded,
    members.length,
    notify,
    selectedConnectorIds,
    t,
    workspace.files,
  ]);

  function stop() {
    streamRef.current?.close();
    streamRef.current = null;
    setBusy(false);
    setStreamingId(null);
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
                agentId={msg.agentId ?? ""}
                title={msg.title ?? ""}
                text={msg.text}
                streaming={streamingId === msg.agentId && msg.id.startsWith("live:")}
                member={memberById.get(msg.agentId ?? "")}
              />
            ),
          )
        )}

        {busy && streamingId === null && (
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
          onSubmit={busy ? stop : send}
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
  streaming,
  member,
}: {
  agentId: string;
  title: string;
  text: string;
  streaming: boolean;
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
          <AssistantResponse content={text} streaming={streaming} />
        </View>
      </View>
    </View>
  );
}
