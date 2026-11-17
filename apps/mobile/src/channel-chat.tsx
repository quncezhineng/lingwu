import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, ScrollView, View } from "react-native";
import {
  type Channel,
  type ChannelMessage,
  normalizeChannelAvatar,
} from "../../../packages/domain/src/channel";
import { conversationColumnStyle } from "./agent-layout";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import type { AgentDefinition } from "./agent-space-model";
import { useAgentWorkspace } from "./agent-workspace";
import { useAppConnectors } from "./app-connectors";
import { Text } from "./app-text";
import { AssistantResponse } from "./assistant-response";
import { MySkillDetailSheet, SkillDetailSheet } from "./capability-hub";
import {
  appConnectorOptions,
  type ComposerSelection,
  ComposerSelectionChips,
  type ConnectorOption,
  ConnectorPickerSheet,
  SkillPickerSheet,
  skillDisplayName,
} from "./capability-picker";
import { type ChannelChatStream, streamChannelChat } from "./channel-chat-stream";
import { promptWithAttachments } from "./chat-content";
import { ComposerDock } from "./composer-dock";
import { ComposerAttachments, FilePickerSheet } from "./file-picker";
import { pickAndUploadFile } from "./file-upload";
import { useTranslation } from "./i18n";
import { Brain, FolderOpen, Lightbulb, Link2, Sparkles, Upload, Users } from "./icons";
import { IdeasOverlay } from "./ideas-overlay";
import { MessageActions } from "./message-actions";
import { PromptComposer } from "./prompt-composer";
import { publishShare } from "./share-page";
import { skillCatalog } from "./skill-catalog";
import { colors, fonts, radius, s } from "./ui";
import { UserMessageMeta } from "./user-message-meta";
import { useWorkspace } from "./workspace";

/**
 * 频道群聊对话页。
 *
 * 与智能体对话同构：用户在频道发一条消息，成员 Agent 依次用自己的 threadId / 人设 /
 * 模型跑一轮真实对话，文本逐字流式回来，像群聊里依次发言（后成员能看到前面的分析）。
 * 消息落库，刷新后回看；用户消息保留附件与连接器选择。
 */

export function ChannelChatScreen({
  channel,
  contentTopInset = 15,
}: {
  channel: Channel;
  /** 悬浮顶栏下的滚动起始内距，与 Agent 对话页同一取值。 */
  contentTopInset?: number;
}) {
  const { t } = useTranslation();
  const { agents, skillLibrary } = useAgentSpace();
  const { data: agentWorkspace } = useAgentWorkspace();
  const { notify, api, refresh, workspace, navigate } = useWorkspace();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);
  const streamRef = useRef<ChannelChatStream | null>(null);
  // 悬浮输入框：输入框绝对定位悬浮在页面底部，不占用文档流；消息列表用它实时测量出的
  // 高度做底部内距（contentBottomInset）预留滚动站位，滚动时不会被输入框遮挡。
  // 刻意不做大面积灰色垫层：输入框白色圆角卡片自带不透明背景，悬浮时即可盖住滚到最下面的内容。
  const [keyboardPadding, setKeyboardPadding] = useState(0);
  const [composerDockHeight, setComposerDockHeight] = useState(70);
  const measuredDockHeight = useRef(70);
  const contentBottomInset = composerDockHeight + 20;
  const onComposerHeightChange = useCallback((height: number) => {
    // 输入法与光标会带来 1px 级抖动；差值小于 8px 不动滚动占位，避免消息列表来回跳。
    if (Math.abs(height - measuredDockHeight.current) < 8) return;
    measuredDockHeight.current = height;
    setComposerDockHeight(height);
  }, []);
  // 附件与连接器选择（与 Agent 对话页同一套能力选择）。
  const [attachments, setAttachments] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [connectorPickerOpen, setConnectorPickerOpen] = useState(false);
  /** 灵感浮层：和智能体对话页同一个组件，模板点选后只填进本频道输入框。 */
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [selectedConnectorIds, setSelectedConnectorIds] = useState<string[]>([]);
  // 频道技能选择（与 Agent 对话的技能选择同组件）：勾选后进入本轮讨论上下文。
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  /** 技能选择弹层里正在查看的技能详情：作为兄弟节点挂载，避免与选择弹层嵌套 Modal。 */
  const [inspectSkillId, setInspectSkillId] = useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);

  // 频道用「账户级应用连接器」（slug 与后端 use_connection 一致），而非旧版 connections。
  const appConnectors = useAppConnectors(api);
  const connectorChoices: ConnectorOption[] = useMemo(
    () => appConnectorOptions(appConnectors.items),
    [appConnectors.items],
  );
  const selectedConnectors: ComposerSelection[] = connectorChoices
    .filter((option) => selectedConnectorIds.includes(option.id))
    .map((option) => ({ id: option.id, name: option.name }));

  // 频道共享技能：目录技能（channel.installedSkills）+ 账户技能库引用（channel.skillRefs）。
  // 与频道详情「技能」分区同一读取口径，只列频道自己添加的技能，不混入成员各自的能力。
  const channelInstalledSkills = channel.installedSkills ?? [];
  const channelCustomSkills = useMemo(
    () =>
      (channel.skillRefs ?? [])
        .map((id) => skillLibrary.find((skill) => skill.id === id))
        .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill)),
    [channel.skillRefs, skillLibrary],
  );
  const selectedSkills: ComposerSelection[] = selectedSkillIds.map((id) => ({
    id,
    name: skillDisplayName(id, channelCustomSkills),
  }));

  const members = useMemo(
    () =>
      channel.agentIds
        .map((id) => agents.find((a) => a.id === id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [agents, channel.agentIds],
  );
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // 每条成员回复对应的用户提问：分享为图片 / 链接时一并带上，让分享内容自带上下文。
  // 单次前向遍历维护「最近一条用户消息」，避免在渲染循环里反复切数组。
  const promptByMessageId = useMemo(() => {
    const map = new Map<string, string>();
    let lastPrompt = "";
    for (const message of messages) {
      if (message.role === "user") lastPrompt = message.text;
      map.set(message.id, lastPrompt);
    }
    return map;
  }, [messages]);

  // 打开频道先加载历史消息（用户提问 + 成员回复）。切换频道时先清空，避免串味。
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setMessages([]);
    setAttachments([]);
    setSelectedConnectorIds([]);
    setSelectedSkillIds([]);
    setSkillPickerOpen(false);
    setInspectSkillId(null);
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

  // Android 键盘从底部顶起悬浮输入框；iOS 由 ComposerDock 内部的
  // KeyboardAvoidingView（behavior=padding）接管，这里只处理 Android 的额外上推。
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const onShow = (e: { endCoordinates: { height: number } }) => {
      const bottomNavHeight = 74;
      setKeyboardPadding(Math.max(0, e.endCoordinates.height - bottomNavHeight));
    };
    const onHide = () => setKeyboardPadding(0);
    const showSub = Keyboard.addListener("keyboardDidShow", onShow);
    const hideSub = Keyboard.addListener("keyboardDidHide", onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
          skillIds: selectedSkillIds.length ? selectedSkillIds : undefined,
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
      setSelectedSkillIds([]);
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
    selectedSkillIds,
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
        // 消息列与输入框共用 conversationColumnStyle：回复区块宽度与输入对话框完全一致。
        style={[conversationColumnStyle, { flex: 1 }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          gap: 13,
          paddingTop: contentTopInset,
          // 输入框悬浮后不再占用文档流，这里用实时测量的输入框高度给它留出站位，
          // 最后一条消息可以完整滚到输入框上方，滚动时内容不会被遮挡。
          paddingBottom: contentBottomInset,
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
            <AgentOrb avatar={normalizeChannelAvatar(channel.avatar)} size={56} />
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
              <UserBubble
                key={msg.id}
                text={msg.text}
                at={Date.parse(msg.createdAt)}
                onNotify={notify}
              />
            ) : (
              <MemberBubble
                key={msg.id}
                agentId={msg.agentId ?? ""}
                title={msg.title ?? ""}
                text={msg.text}
                streaming={streamingId === msg.agentId && msg.id.startsWith("live:")}
                member={memberById.get(msg.agentId ?? "")}
                prompt={promptByMessageId.get(msg.id) ?? ""}
                at={Date.parse(msg.createdAt)}
                onNotify={notify}
                onPublishShare={(input) => publishShare(api, input)}
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

      {/* 输入框悬浮在页面底部：ComposerDock 绝对定位、不再占用文档流；
          消息列表的 contentBottomInset 已实时给它留出滚动站位。 */}
      <ComposerDock
        floating
        keyboardPadding={keyboardPadding}
        onHeightChange={onComposerHeightChange}
      >
        {/* 圆角过渡垫层：与悬浮输入框同款全圆角、左右各外扩 8px 的底色底托。
            内容向下滚动经过输入框背后时，它的直角边缘会被这层大圆角"收住"，
            露出的遮挡线是一段圆弧，与输入框圆角完全一致，不再出现硬切的白边直角。 */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: -5,
            right: -5,
            top: -0,
            bottom: -20,
            backgroundColor: colors.canvas,
            borderRadius: radius.full,
          }}
        />
        <PromptComposer
          style={[conversationColumnStyle, { marginBottom: 12 }]}
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
              // 频道技能：勾选频道共享技能进入本轮讨论，与 Agent 对话的技能选择同组件。
              key: "skills",
              icon: Brain,
              label: t("chat.channelSkillPickerTool"),
              active: selectedSkillIds.length > 0,
              onPress: () => setSkillPickerOpen(true),
            },
            {
              key: "connectors",
              icon: Link2,
              label: t("chat.connectorPickerTool"),
              active: selectedConnectorIds.length > 0,
              onPress: () => setConnectorPickerOpen(true),
            },
          ]}
          cornerAction={{
            // 与智能体对话页同一位置（输入框右上角）、同一入口：打开灵感浮层挑模板。
            icon: Lightbulb,
            label: t("agentSpace.openIdeasPage"),
            onPress: () => setIdeasOpen(true),
          }}
          attachments={
            <>
              <ComposerSelectionChips
                items={selectedSkills}
                icon={Brain}
                removeLabel={(name) => t("chat.removeSkill", { name })}
                onRemove={(id) =>
                  setSelectedSkillIds((ids) => ids.filter((candidate) => candidate !== id))
                }
              />
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
      </ComposerDock>

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
      {skillPickerOpen && (
        <>
          <SkillPickerSheet
            // 只列频道共享技能：目录技能（channel.installedSkills）+ 频道自建的账户技能库引用。
            customSkills={channelCustomSkills}
            installedCatalogIds={channelInstalledSkills}
            selectedIds={selectedSkillIds}
            onToggle={(id) =>
              setSelectedSkillIds((ids) =>
                ids.includes(id) ? ids.filter((candidate) => candidate !== id) : [...ids, id],
              )
            }
            onInspectSkill={setInspectSkillId}
            title={t("chat.channelSkillPickerTitle")}
            subtitle={t("chat.channelSkillPickerSubtitle")}
            mineHeading={t("chat.channelSkillPickerMineHeading")}
            emptyDetail={t("chat.channelSkillPickerEmptyDetail")}
            onConfirm={() => {
              setSkillPickerOpen(false);
              setInspectSkillId(null);
            }}
            onClose={() => {
              setSkillPickerOpen(false);
              setInspectSkillId(null);
            }}
          />
          {inspectSkillId && (
            <ChannelSkillInspectSheet
              skillId={inspectSkillId}
              onClose={() => setInspectSkillId(null)}
            />
          )}
        </>
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
      {ideasOpen && (
        <IdeasOverlay
          onClose={() => setIdeasOpen(false)}
          subtitle={t("channels.ideasSubtitle")}
          // 频道里不回填工作区草稿、也不跳去智能体对话：直接写进本频道输入框，由用户确认后再发。
          onPickPrompt={(prompt) => setDraft(prompt)}
        />
      )}
    </View>
  );
}

/**
 * 频道技能只读详情：频道自建（技能库引用）→ MySkillDetailSheet；
 * 频道已装的目录技能 → SkillDetailSheet（只读）；都查不到（系统能力）返回 null。
 */
function ChannelSkillInspectSheet({ skillId, onClose }: { skillId: string; onClose: () => void }) {
  const { skillLibrary } = useAgentSpace();
  const custom = skillLibrary.find((skill) => skill.id === skillId);
  if (custom) {
    return <MySkillDetailSheet title={custom.name} skill={custom} onClose={onClose} />;
  }
  const entry = skillCatalog.find((skill) => skill.id === skillId);
  if (!entry) return null;
  return <SkillDetailSheet skill={entry} onClose={onClose} />;
}

function UserBubble({
  text,
  at,
  onNotify,
}: {
  text: string;
  /** 发送时间（毫秒）。拿不到时间时这一行只留复制按钮。 */
  at: number;
  onNotify: (message: string) => void;
}) {
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
      {/* 与智能体对话页一致：提问气泡右下角显示发送时间 + 复制。 */}
      {!!text && <UserMessageMeta text={text} at={at} onNotify={onNotify} />}
    </View>
  );
}

function MemberBubble({
  agentId,
  title,
  text,
  streaming,
  member,
  prompt,
  at,
  onNotify,
  onPublishShare,
}: {
  agentId: string;
  title: string;
  text: string;
  streaming: boolean;
  member?: AgentDefinition;
  /** 该条回复对应的用户提问；有值时一并出现在分享的图片与网页里。 */
  prompt: string;
  /** 回复时间（毫秒）。非数字时该字段无效，操作栏不显示时间。 */
  at: number;
  onNotify: (message: string) => void;
  onPublishShare: (input: { question: string; answer: string }) => Promise<string>;
}) {
  return (
    <View style={{ position: "relative", width: "100%" }}>
      {/* 头像悬浮在消息卡片左上方、不占行内宽度，回复卡片才能撑满整列与下方输入框同宽 */}
      <View style={{ position: "absolute", top: 2, left: 0, zIndex: 1 }}>
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
      <View style={{ width: "100%", gap: 4 }}>
        {/* 名字、标题与卡片内容统一左缩进，避开左侧悬浮头像 */}
        <View style={{ paddingLeft: 42, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
            {member?.name ?? agentId}
          </Text>
        </View>
        <View style={{ paddingLeft: 42 }}>
          {title ? <Text style={[s.small, { color: colors.primaryStrong }]}>{title}</Text> : null}
        </View>
        <View
          style={{
            alignSelf: "stretch",
            // 左右 padding 相等（56+14 的一半），回复正文在卡片内水平居中。
            paddingLeft: 35,
            paddingRight: 35,
            paddingVertical: 10,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.paper,
          }}
        >
          <AssistantResponse content={text} streaming={streaming} />
        </View>
        {/* 回复底部功能栏：喜欢/不喜欢、复制与导出 Markdown、分享为图片/链接、时间显示，
            与智能体对话页回复底部同一套交互。整栏左移贴齐回复卡片的左侧框线（整列左缘），
            不再保留 56px 缩进。 */}
        <View>
          <MessageActions
            markdown={text}
            prompt={prompt}
            at={streaming ? 0 : at}
            onNotify={onNotify}
            onPublishShare={onPublishShare}
          />
        </View>
      </View>
    </View>
  );
}
