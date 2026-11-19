import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import {
  type Channel,
  type ChannelHistoryPage,
  type ChannelMessage,
  type ChannelToolTrace,
  channelHistoryPageSize,
  normalizeChannelAvatar,
} from "../../../packages/domain/src/channel";
import { appendMemberDelta } from "./channel-live-text";
import { conversationColumnStyle } from "./agent-layout";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import type { AgentDefinition } from "./agent-space-model";
import { useAgentWorkspace } from "./agent-workspace";
import { AppConnectorSheet, type AppConnectorView, useAppConnectors } from "./app-connectors";
import { Text } from "./app-text";
import { AssistantResponse } from "./assistant-response";
import { MySkillDetailSheet, SkillDetailSheet } from "./capability-hub";
import {
  allConnectorOptions,
  type ComposerSelection,
  ComposerSelectionChips,
  type ConnectorOption,
  ConnectorPickerSheet,
  connectorOptions,
  SkillPickerSheet,
  skillDisplayName,
} from "./capability-picker";
import { type ChannelChatStream, streamChannelChat } from "./channel-chat-stream";
import { useChannels } from "./channels";
import { promptWithAttachments } from "./chat-content";
import { ComposerDock } from "./composer-dock";
import {
  awayFromLatestSlack,
  followLatestSlack,
  type PrependAnchor,
  pinnedTailNudge,
  restorePrependOffset,
} from "./conversation-scroll";
import { ComposerAttachments, FilePickerSheet } from "./file-picker";
import { pickAndUploadFile } from "./file-upload";
import { useTranslation } from "./i18n";
import {
  ArrowDown,
  Brain,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Lightbulb,
  Link2,
  Sparkles,
  Upload,
  Users,
} from "./icons";
import { IdeasOverlay } from "./ideas-overlay";
import { MessageActions } from "./message-actions";
import { PromptComposer } from "./prompt-composer";
import { QuoteToolCard } from "./quote-tool-card";
import { publishShare } from "./share-page";
import { skillCatalog } from "./skill-catalog";
import { ToolStep } from "./tool-step";
import { Button, colors, fonts, radius, Sheet, s, shadow } from "./ui";
import { UserMessageMeta } from "./user-message-meta";
import { useWorkspace } from "./workspace";

/**
 * 频道群聊对话页。
 *
 * 与智能体对话同构：用户在频道发一条消息，成员 Agent 依次用自己的 threadId / 人设 /
 * 模型跑一轮真实对话，文本逐字流式回来，像群聊里依次发言（后成员能看到前面的分析）。
 * 消息落库，刷新后回看；用户消息保留附件与选择连接器。
 */

function mergeChannelMessages(
  earlier: readonly ChannelMessage[],
  current: readonly ChannelMessage[],
) {
  const seen = new Set<string>();
  const merged: ChannelMessage[] = [];
  for (const message of [...earlier, ...current]) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    merged.push(message);
  }
  return merged;
}

/** 刷新最新一页时留下已经向上翻出来的更早消息，丢掉还没落库的临时气泡。 */
function stitchLatestPage(current: readonly ChannelMessage[], latest: readonly ChannelMessage[]) {
  if (!latest.length) return current.filter((message) => !message.id.startsWith("live:"));
  const floor = latest[0]?.createdAt ?? "";
  const kept = current.filter(
    (message) =>
      !message.id.startsWith("live:") &&
      message.createdAt < floor &&
      !latest.some((item) => item.id === message.id),
  );
  return mergeChannelMessages(kept, latest);
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
  const { agents, skillLibrary } = useAgentSpace();
  const { data: agentWorkspace } = useAgentWorkspace();
  const { notify, api, refresh, workspace, navigate, open } = useWorkspace();
  const { noteLeader } = useChannels();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [positioned, setPositioned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [streamingIds, setStreamingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const listRef = useRef<ScrollView>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const initialScroll = useRef(true);
  const followLatest = useRef(true);
  const olderRequest = useRef(false);
  const preserveY = useRef<number | null>(null);
  const prependAnchor = useRef<PrependAnchor | null>(null);
  const scrollMetrics = useRef({ height: 0, y: 0, bottomInset: 0 });
  const scrollViewport = useRef(0);
  const ownScroll = useRef(false);
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
  // 附件与选择连接器（与 Agent 对话页同一套能力选择）。
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

  // 频道连接器候选：内置连接器（智能体电脑 / Google 系 / OpenBot）+ 账户级应用连接器，
  // 与「所有技能与链接」模块同源，让弹层里列出全部连接器。
  const appConnectors = useAppConnectors(api);
  const connectorChoices: ConnectorOption[] = useMemo(
    () => allConnectorOptions(connectorOptions(workspace), appConnectors.items),
    [workspace, appConnectors.items],
  );
  const selectedConnectors: ComposerSelection[] = connectorChoices
    .filter((option) => selectedConnectorIds.includes(option.id))
    .map((option) => ({ id: option.id, name: option.name }));

  // —— 「选择连接器」弹层内的直接连接：账户级连接器在弹层外再挂一个连接表单
  // （兄弟节点，避免嵌套 Modal），内置连接器（智能体电脑 / Gmail / 日历 / OpenBot）
  // 各走自己的连接路径；连接成功后刷新候选并自动勾选，给出明确反馈。
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);
  const [openbotSheetOpen, setOpenbotSheetOpen] = useState(false);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const googleConnected = workspace.connections.some(
    (connection) =>
      connection.id === "google" &&
      (connection.status === "connected" || connection.status === "sample"),
  );
  /** Google 系连接器（Gmail / 日历）的 OAuth 连接：与「所有技能与链接」同一流程。 */
  async function openGoogleConnector(id: "gmail" | "calendar") {
    if (googleConnecting) return;
    if (googleConnected) {
      navigate(id === "gmail" ? "mail" : "calendar");
      return;
    }
    setGoogleConnecting(true);
    try {
      const result = await api.request<{ url: string | null }>("/api/google/connect", {
        capability: "read",
      });
      if (result.url) {
        await Linking.openURL(result.url);
        notify(t("screens.connectionsNotifyFinish"));
      } else {
        await refresh();
        notify(t("screens.connectionsNotifyLocalReady"));
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    } finally {
      setGoogleConnecting(false);
    }
  }
  /** 弹层里点击「去连接」：按连接器类型分发到各自的连接流程。 */
  function handleConnectorConnect(id: string) {
    if (appConnectors.items.some((item) => item.slug === id)) {
      setConnectingSlug(id);
      return;
    }
    if (id === "browser") {
      open({ type: "computer" });
      return;
    }
    if (id === "gmail" || id === "calendar") {
      void openGoogleConnector(id);
      return;
    }
    if (id === "openbot") {
      setOpenbotSheetOpen(true);
    }
  }
  /** 账户级连接器连接成功：刷新目录、把新连接器自动勾进当前对话，并提示结果。 */
  function handleAppConnectorChanged(connectedSlug: string) {
    void appConnectors.refresh();
    setSelectedConnectorIds((ids) => (ids.includes(connectedSlug) ? ids : [...ids, connectedSlug]));
    const option = connectorChoices.find((candidate) => candidate.id === connectedSlug);
    if (option) notify(t("chat.connectorConnectedToast", { name: option.name }));
  }

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
  const mentionQuery = draft.match(/@([^\s@]*)$/)?.[1];
  const mentionCandidates =
    mentionQuery === undefined
      ? []
      : members.filter((member) => mentionQuery === "" || member.name.includes(mentionQuery));

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

  const historyPath = useCallback(
    (before?: string) =>
      `/api/channels/${encodeURIComponent(channel.id)}/messages?limit=${channelHistoryPageSize}${
        before ? `&before=${encodeURIComponent(before)}` : ""
      }`,
    [channel.id],
  );
  const loadHistory = useCallback(
    async (mode: "open" | "tail" = "tail") => {
      try {
        const page = await api.request<ChannelHistoryPage>(historyPath());
        if (mode === "open") {
          setMessages(page.messages);
          setHasOlder(page.hasMore);
        } else {
          setMessages((current) => stitchLatestPage(current, page.messages));
          setHasOlder((current) => current || page.hasMore);
        }
        setOlderError(false);
      } catch {
        if (mode === "open") {
          setMessages([]);
          setHasOlder(false);
        }
      } finally {
        setLoaded(true);
      }
    },
    [api, historyPath],
  );
  const holdReadingPosition = useCallback(() => {
    preserveY.current = scrollMetrics.current.y;
    followLatest.current = false;
  }, []);
  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current[0];
    if (
      !loaded ||
      !hasOlder ||
      !oldest ||
      olderRequest.current ||
      initialScroll.current ||
      prependAnchor.current
    )
      return;
    olderRequest.current = true;
    setLoadingOlder(true);
    setOlderError(false);
    try {
      const page = await api.request<ChannelHistoryPage>(historyPath(oldest.id));
      const nextFirst = page.messages[0]?.id;
      if (nextFirst && nextFirst !== oldest.id)
        prependAnchor.current = {
          ...scrollMetrics.current,
          firstMessageId: nextFirst,
        };
      followLatest.current = false;
      setMessages((current) => mergeChannelMessages(page.messages, current));
      setHasOlder(page.hasMore);
    } catch {
      setOlderError(true);
    } finally {
      olderRequest.current = false;
      setLoadingOlder(false);
    }
  }, [api, hasOlder, historyPath, loaded]);

  // 打开频道只取最新一页，并先藏起来再跳到末尾。切换频道时先清空，避免串味。
  useEffect(() => {
    let alive = true;
    initialScroll.current = true;
    followLatest.current = true;
    preserveY.current = null;
    prependAnchor.current = null;
    setPositioned(false);
    setLoaded(false);
    setMessages([]);
    setHasOlder(false);
    setOlderError(false);
    setAttachments([]);
    setSelectedConnectorIds([]);
    setSelectedSkillIds([]);
    setSkillPickerOpen(false);
    setInspectSkillId(null);
    setBusy(false);
    streamRef.current?.close();
    streamRef.current = null;
    void loadHistory("open").finally(() => {
      if (!alive) setLoaded(true);
    });
    return () => {
      alive = false;
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, [loadHistory]);

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
  useEffect(() => {
    if (!loaded || !initialScroll.current) return;
    let reveal = 0;
    const position = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
      reveal = requestAnimationFrame(() => {
        initialScroll.current = false;
        setPositioned(true);
      });
    });
    return () => {
      cancelAnimationFrame(position);
      cancelAnimationFrame(reveal);
    };
  }, [loaded, channel.id]);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const id = "lingwu-channel-scroll-anchor";
    const style = document.getElementById(id) ?? document.createElement("style");
    style.id = id;
    style.textContent =
      "[data-testid='channel-chat-viewport'],[data-testid='channel-chat-viewport'] *{overflow-anchor:none !important}";
    document.head.appendChild(style);
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
    setMessages((current) => [
      ...current,
      {
        id: `live:user:${Date.now()}`,
        channelId: channel.id,
        role: "user",
        text,
        createdAt: new Date().toISOString(),
      },
    ]);
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
            if (event === "leader") {
              const leaderId = String(data.leaderId ?? "");
              if (leaderId) noteLeader(channel.id, leaderId);
            } else if (event === "member_start") {
              const agentId = String(data.agentId ?? "");
              setStreamingIds((current) => {
                const next = new Set(current);
                next.add(agentId);
                return next;
              });
              setMessages((current) => {
                if (
                  current.some(
                    (message) =>
                      message.role === "member" &&
                      message.agentId === agentId &&
                      message.id.startsWith("live:"),
                  )
                )
                  return current;
                return [
                  ...current,
                  {
                    id: `live:${agentId}:${Date.now()}`,
                    channelId: channel.id,
                    role: "member",
                    agentId,
                    title: String(data.title ?? ""),
                    text: "",
                    createdAt: new Date().toISOString(),
                    tools: [],
                  },
                ];
              });
            } else if (event === "tool") {
              const agentId = String(data.agentId ?? "");
              const tool = data.tool as ChannelToolTrace | undefined;
              if (!tool?.id) return;
              setMessages((current) =>
                current.map((message) => {
                  if (
                    message.role !== "member" ||
                    message.agentId !== agentId ||
                    !message.id.startsWith("live:")
                  )
                    return message;
                  const tools = message.tools ?? [];
                  const next = tools.some((item) => item.id === tool.id)
                    ? tools.map((item) => (item.id === tool.id ? { ...item, ...tool } : item))
                    : [...tools, tool];
                  return { ...message, tools: next };
                }),
              );
            } else if (event === "delta") {
              const agentId = String(data.agentId ?? "");
              const delta = String(data.text ?? "");
              if (!delta) return;
              setMessages((current) =>
                appendMemberDelta(current, channel.id, agentId, delta, String(data.title ?? "")),
              );
            } else if (event === "done") {
              setStreamingIds(new Set());
              setBusy(false);
              void loadHistory();
            } else if (event === "member_done") {
              const agentId = String(data.agentId ?? "");
              const finalText = typeof data.text === "string" ? data.text : "";
              setStreamingIds((current) => {
                if (!current.has(agentId)) return current;
                const next = new Set(current);
                next.delete(agentId);
                return next;
              });
              // 同一位会先分工、再总结。结束上一条后再开新气泡，避免总结写进分工里。
              setMessages((current) =>
                current.map((message) => {
                  if (
                    message.role !== "member" ||
                    message.agentId !== agentId ||
                    !message.id.startsWith("live:")
                  )
                    return message;
                  return {
                    ...message,
                    id: message.id.replace("live:", "said:"),
                    text: finalText || message.text,
                  };
                }),
              );
            } else if (event === "error") {
              notify(String(data.message ?? t("channels.chatFailed")));
            }
          },
          onError: (message) => {
            notify(message);
            setBusy(false);
            setStreamingIds(new Set());
          },
          // 断开时服务端会留下已经说出的内容，这里重新读一次历史。
          onClose: () => {
            setBusy(false);
            setStreamingIds(new Set());
            void loadHistory();
          },
        },
      );
      // 发送后清空附件与选择连接器，避免带到下一轮。
      setAttachments([]);
      setSelectedConnectorIds([]);
      setSelectedSkillIds([]);
      setPicking(false);
    } catch (e) {
      setBusy(false);
      setStreamingIds(new Set());
      notify(e instanceof Error ? e.message : String(e));
    }
  }, [
    api,
    agentWorkspace?.artifacts,
    attachments,
    busy,
    channel.id,
    draft,
    loadHistory,
    loaded,
    members,
    noteLeader,
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
    setStreamingIds(new Set());
    // 服务端在断开时先落库，稍后再读，刷新前也能看到已经说出的内容。
    setTimeout(() => void loadHistory(), 400);
  }

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        testID="channel-chat-viewport"
        ref={listRef}
        // 消息列与输入框共用 conversationColumnStyle：回复区块宽度与输入对话框完全一致。
        style={[conversationColumnStyle, { flex: 1, opacity: positioned ? 1 : 0 }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={100}
        onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
          const previousY = scrollMetrics.current.y;
          scrollViewport.current = layoutMeasurement.height;
          scrollMetrics.current.y = contentOffset.y;
          if (initialScroll.current || prependAnchor.current || preserveY.current !== null) return;
          const gap = contentSize.height - contentOffset.y - layoutMeasurement.height;
          const away = messagesRef.current.length > 0 && gap > awayFromLatestSlack;
          if (ownScroll.current) {
            ownScroll.current = false;
            if (gap < followLatestSlack) {
              followLatest.current = true;
              setAwayFromLatest(false);
            }
            return;
          }
          followLatest.current = gap < followLatestSlack;
          setAwayFromLatest(away);
          if (contentOffset.y < 160 && contentOffset.y < previousY && !olderError) void loadOlder();
        }}
        onContentSizeChange={(_width, height) => {
          const previousHeight = scrollMetrics.current.height;
          const previousOffset = scrollMetrics.current.y;
          scrollMetrics.current = {
            ...scrollMetrics.current,
            height,
            bottomInset: contentBottomInset,
          };
          if (!loaded) return;
          if (preserveY.current !== null) {
            const y = preserveY.current;
            preserveY.current = null;
            ownScroll.current = true;
            scrollMetrics.current.y = y;
            listRef.current?.scrollTo({ y, animated: false });
            return;
          }
          if (prependAnchor.current) {
            const y = restorePrependOffset(prependAnchor.current, {
              height,
              bottomInset: contentBottomInset,
              firstMessageId: messagesRef.current[0]?.id ?? null,
            });
            if (y === undefined) return;
            prependAnchor.current = null;
            ownScroll.current = true;
            scrollMetrics.current.y = y;
            listRef.current?.scrollTo({ y, animated: false });
            return;
          }
          if (initialScroll.current) {
            listRef.current?.scrollToEnd({ animated: false });
            return;
          }
          const next = pinnedTailNudge({
            following: followLatest.current,
            previousHeight,
            height,
            offset: previousOffset,
            viewport: scrollViewport.current,
          });
          if (next === undefined) {
            if (!followLatest.current) {
              const gap = height - previousOffset - scrollViewport.current;
              setAwayFromLatest(messagesRef.current.length > 0 && gap > awayFromLatestSlack);
            }
            return;
          }
          ownScroll.current = true;
          scrollMetrics.current.y = next;
          listRef.current?.scrollTo({ y: next, animated: false });
        }}
        contentContainerStyle={{
          gap: 13,
          paddingTop: contentTopInset,
          // 输入框悬浮后不再占用文档流，这里用实时测量的输入框高度给它留出站位，
          // 最后一条消息可以完整滚到输入框上方，滚动时内容不会被遮挡。
          paddingBottom: contentBottomInset,
          flexGrow: 1,
        }}
      >
        {hasOlder && (
          <View style={{ height: 34, justifyContent: "center", alignItems: "center" }}>
            {loadingOlder ? (
              <ActivityIndicator
                size="small"
                color={colors.faint}
                accessibilityLabel={t("chat.loadingEarlierMessages")}
              />
            ) : (
              <Pressable accessibilityRole="button" onPress={() => void loadOlder()} hitSlop={8}>
                <Text style={{ color: olderError ? colors.primary : colors.muted, fontSize: 12 }}>
                  {t(olderError ? "chat.retryEarlierMessages" : "chat.loadEarlierMessages")}
                </Text>
              </Pressable>
            )}
          </View>
        )}
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
                tools={msg.tools}
                streaming={streamingIds.has(msg.agentId ?? "") && msg.id.startsWith("live:")}
                member={memberById.get(msg.agentId ?? "")}
                prompt={promptByMessageId.get(msg.id) ?? ""}
                at={Date.parse(msg.createdAt)}
                onNotify={notify}
                onPublishShare={(input) => publishShare(api, input)}
                onHold={holdReadingPosition}
              />
            ),
          )
        )}

        {busy && streamingIds.size === 0 && (
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
        {awayFromLatest && (
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              bottom: "100%",
              left: 0,
              right: 0,
              paddingBottom: 10,
              alignItems: "center",
              zIndex: 2,
            }}
          >
            <Button
              small
              icon={ArrowDown}
              style={{ backgroundColor: `${colors.paper}E6`, ...shadow.card }}
              onPress={() => {
                followLatest.current = true;
                setAwayFromLatest(false);
                listRef.current?.scrollToEnd({ animated: true });
              }}
            >
              {t("chat.latestMessages")}
            </Button>
          </View>
        )}
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
        {mentionCandidates.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {mentionCandidates.map((member) => (
              <Pressable
                key={member.id}
                accessibilityRole="button"
                accessibilityLabel={`@${member.name}`}
                onPress={() =>
                  setDraft((value) => value.replace(/@([^\s@]*)$/, `@${member.name} `))
                }
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: radius.full,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <Text style={[s.small, { color: colors.text }]}>{`@${member.name}`}</Text>
              </Pressable>
            ))}
          </View>
        )}
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
        <>
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
            onConnect={handleConnectorConnect}
          />
          {connectingSlug && appConnectors.items.some((item) => item.slug === connectingSlug) && (
            <AppConnectorSheet
              item={
                appConnectors.items.find((item) => item.slug === connectingSlug) as AppConnectorView
              }
              api={api}
              onClose={() => setConnectingSlug(null)}
              onChanged={() => handleAppConnectorChanged(connectingSlug)}
            />
          )}
          {openbotSheetOpen && (
            <Sheet
              title="OpenBot"
              subtitle={t("screens.connectionsOpenBotSubtitle")}
              onClose={() => setOpenbotSheetOpen(false)}
            >
              <View style={{ gap: 14 }}>
                <Text style={s.text}>{t("screens.connectionsOpenBotNotice")}</Text>
                <Text style={s.muted}>{t("screens.connectionsOpenBotDetail")}</Text>
              </View>
            </Sheet>
          )}
        </>
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

/** 频道里的工具过程收成一行。进行中只显示「工作中」；做完后默认收起，点开才能看每一步。 */
function ChannelWorkFold({ tools, onHold }: { tools: ChannelToolTrace[]; onHold?: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const working = tools.some((tool) => tool.result === undefined);
  useEffect(() => {
    if (working) setOpen(false);
  }, [working]);
  const label = working
    ? t("channels.working")
    : t("channels.workProcess", { count: tools.length });
  return (
    <View style={{ gap: 8 }} testID="channel-work-fold">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, busy: working }}
        disabled={working}
        onPress={() => {
          if (working) return;
          onHold?.();
          setOpen((value) => !value);
        }}
        style={{
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.surface,
        }}
      >
        {working ? (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={{ width: 14, height: 14, transform: [{ scale: 0.72 }] }}
          />
        ) : open ? (
          <ChevronDown size={14} color={colors.muted} />
        ) : (
          <ChevronRight size={14} color={colors.muted} />
        )}
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{label}</Text>
      </Pressable>
      {open && !working
        ? tools.map((tool) => (
            <ToolStep
              key={tool.id}
              tool={tool.name}
              args={tool.args}
              result={tool.result}
              status="complete"
              defaultOpen={false}
            >
              {tool.name === "get_quote" ? (
                <QuoteToolCard result={tool.result} loading={false} />
              ) : null}
            </ToolStep>
          ))
        : null}
    </View>
  );
}

function MemberBubble({
  agentId,
  title,
  text,
  tools,
  streaming,
  member,
  prompt,
  at,
  onNotify,
  onPublishShare,
  onHold,
}: {
  agentId: string;
  title: string;
  text: string;
  tools?: ChannelToolTrace[];
  streaming: boolean;
  member?: AgentDefinition;
  /** 该条回复对应的用户提问；有值时一并出现在分享的图片与网页里。 */
  prompt: string;
  /** 回复时间（毫秒）。非数字时该字段无效，操作栏不显示时间。 */
  at: number;
  onNotify: (message: string) => void;
  onPublishShare: (input: { question: string; answer: string }) => Promise<string>;
  /** 展开工具过程前记下阅读位置，避免列表被拉到最底部。 */
  onHold?: () => void;
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
        {!!tools?.length && <ChannelWorkFold tools={tools} onHold={onHold} />}
        {(text || !tools?.length) && (
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
        )}
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
