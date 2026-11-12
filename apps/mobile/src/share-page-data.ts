/**
 * 公开分享页取数。
 *
 * 分享页在 Web 端由 SPA 原生渲染，正文由 `GET /s/:id/data` 提供（无需登录）。
 * 这里把「成功 / 不存在 / 出错」三态显式分开，UI 才能给出对应的提示，
 * 而不是把网络故障说成「分享已失效」。
 */
import { API_URL } from "./api";
import { parseSharedConversation, type SharedConversation } from "./share-page-model";

export type SharedConversationResult =
  | { status: "ok"; share: SharedConversation }
  | { status: "missing" }
  | { status: "error" };

/** 分享正文的接口地址。 */
export function sharedConversationUrl(id: string): string {
  return `${API_URL}/s/${encodeURIComponent(id)}/data`;
}

/** 服务端渲染的分享页，作为前端渲染失败时的兜底入口。 */
export function sharedPageUrl(id: string): string {
  return `${API_URL}/s/${encodeURIComponent(id)}`;
}

/** 读取一条分享。主动取消（abort）时抛出，交由调用方忽略。 */
export async function fetchSharedConversation(
  id: string,
  signal?: AbortSignal,
): Promise<SharedConversationResult> {
  try {
    const response = await fetch(sharedConversationUrl(id), {
      signal,
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) return { status: "missing" };
    if (!response.ok) return { status: "error" };
    const share = parseSharedConversation(await response.json());
    return share ? { status: "ok", share } : { status: "error" };
  } catch (error) {
    if (signal?.aborted || (error as { name?: string })?.name === "AbortError") throw error;
    return { status: "error" };
  }
}
