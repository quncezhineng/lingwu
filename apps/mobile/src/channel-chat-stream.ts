import { Platform } from "react-native";
import type { LingWuApi } from "./api";

/**
 * 频道群聊流式对话客户端。
 *
 * POST /api/channels/:id/chat 返回 SSE：member_start / delta / member_done / done / error。
 * Web 用 fetch 的可读流，React Native 用 XHR 的渐进 responseText（与 conversation-stream 同口径）。
 */
export interface ChannelChatCallbacks {
  onEvent: (event: string, data: Record<string, unknown>) => void;
  onError?: (message: string) => void;
  /** 流正常结束（含服务端未发 done 的兜底场景）。 */
  onClose?: () => void;
}

export interface ChannelChatRequest {
  text: string;
  attachmentIds?: string[];
  connectorSlugs?: string[];
  /** 本轮选定的频道技能 id：服务端注入成员提示词，成员可用 use_skill 读取方法。 */
  skillIds?: string[];
}

export interface ChannelChatStream {
  close(): void;
}

function parseFrames(
  buffer: string,
  onEvent: (event: string, data: Record<string, unknown>) => void,
): string {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  for (const frame of frames) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) continue;
    try {
      onEvent(event, JSON.parse(dataLines.join("\n")) as Record<string, unknown>);
    } catch {
      // 忽略无法解析的帧（如心跳注释）。
    }
  }
  return rest;
}

export function streamChannelChat(
  api: LingWuApi,
  channelId: string,
  body: ChannelChatRequest,
  callbacks: ChannelChatCallbacks,
): ChannelChatStream {
  const url = api.url(`/api/channels/${encodeURIComponent(channelId)}/chat`);
  const payload = JSON.stringify(body);
  let closed = false;
  let buffer = "";

  if (Platform.OS !== "web" || typeof ReadableStream === "undefined") {
    const xhr = new XMLHttpRequest();
    let offset = 0;
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${api.token}`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onprogress = () => {
      if (closed) return;
      const text = xhr.responseText || "";
      if (text.length <= offset) return;
      buffer += text.slice(offset);
      offset = text.length;
      buffer = parseFrames(buffer, (event, data) => {
        if (!closed) callbacks.onEvent(event, data);
      });
    };
    xhr.onerror = () => {
      if (!closed) callbacks.onError?.("Live reply connection was lost.");
    };
    xhr.onloadend = () => {
      if (closed) return;
      if (xhr.status >= 400) callbacks.onError?.(`Channel chat failed (${xhr.status}).`);
      else callbacks.onClose?.();
    };
    xhr.send(payload);
    return {
      close() {
        closed = true;
        xhr.abort();
      },
    };
  }

  const controller = new AbortController();
  void (async () => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${api.token}`,
          "Content-Type": "application/json",
        },
        body: payload,
        signal: controller.signal,
      });
      if (!response.ok || !response.body)
        throw new Error(`Channel chat failed (${response.status}).`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.length) {
          buffer += decoder.decode(value, { stream: true });
          buffer = parseFrames(buffer, (event, data) => {
            if (!closed) callbacks.onEvent(event, data);
          });
        }
      }
    } catch (error) {
      if (!closed && !controller.signal.aborted)
        callbacks.onError?.(error instanceof Error ? error.message : String(error));
    } finally {
      if (!closed) callbacks.onClose?.();
    }
  })();
  return {
    close() {
      closed = true;
      controller.abort();
    },
  };
}
