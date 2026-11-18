import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { Channel, ChannelInput } from "../../../packages/domain/src/channel";
import { useWorkspace } from "./workspace";

/**
 * 多 Agent 群聊频道数据层。
 *
 * 频道元数据（成员、名称）走后端 `/api/channels`；消息承载复用 CopilotKit thread
 * （每个成员 Agent 一个 thread）。这里管理频道的增删改查与当前选中频道。
 */
interface ChannelsContextValue {
  channels: Channel[];
  loading: boolean;
  error: string;
  /** 当前选中的频道（与 Agent 空间的 current 同级，用于左侧栏高亮 + 对话区）。 */
  currentChannelId: string | null;
  selectChannel: (id: string | null) => void;
  refresh: () => Promise<void>;
  createChannel: (input: ChannelInput) => Promise<Channel>;
  updateChannel: (id: string, patch: Partial<ChannelInput>) => Promise<Channel>;
  /** 聊天里 @ 了一位成员后，先把组长标到本地列表。服务端会在同一轮里落库。 */
  noteLeader: (id: string, leaderId: string) => void;
  deleteChannel: (id: string) => Promise<void>;
}

const ChannelsContext = createContext<ChannelsContextValue | null>(null);

export function ChannelsProvider({ children }: { children: ReactNode }) {
  const { api } = useWorkspace();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await api.request<Channel[]>("/api/channels");
      setChannels(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectChannel = useCallback((id: string | null) => setCurrentChannelId(id), []);

  const createChannel = useCallback(
    async (input: ChannelInput) => {
      const channel = await api.request<Channel>("/api/channels", input, "POST");
      setChannels((items) => [...items, channel]);
      setCurrentChannelId(channel.id);
      return channel;
    },
    [api],
  );

  const updateChannel = useCallback(
    async (id: string, patch: Partial<ChannelInput>) => {
      const channel = await api.request<Channel>(`/api/channels/${id}`, patch, "PATCH");
      setChannels((items) => items.map((item) => (item.id === id ? channel : item)));
      return channel;
    },
    [api],
  );

  const noteLeader = useCallback((id: string, leaderId: string) => {
    setChannels((items) =>
      items.map((item) => (item.id === id ? { ...item, leaderId } : item)),
    );
  }, []);

  const deleteChannel = useCallback(
    async (id: string) => {
      await api.request(`/api/channels/${id}`, undefined, "DELETE");
      setChannels((items) => items.filter((item) => item.id !== id));
      if (currentChannelId === id) setCurrentChannelId(null);
    },
    [api, currentChannelId],
  );

  return (
    <ChannelsContext.Provider
      value={{
        channels,
        loading,
        error,
        currentChannelId,
        selectChannel,
        refresh,
        createChannel,
        updateChannel,
        noteLeader,
        deleteChannel,
      }}
    >
      {children}
    </ChannelsContext.Provider>
  );
}

export function useChannels() {
  const context = useContext(ChannelsContext);
  if (!context) throw new Error("Channels provider is unavailable");
  return context;
}
