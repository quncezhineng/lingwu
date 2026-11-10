import type { LingWuApi } from "./api";

/** 发布分享所需的对话内容。 */
export interface ShareInput {
  /** 用户提问；可能为空。 */
  question: string;
  /** 助手回复的原始 Markdown。 */
  answer: string;
}

/**
 * 把「提问 + 回复」发布成一张公开网页，返回可分享的绝对链接。
 *
 * 服务端生成不可猜的短 id 并持久化，`GET /s/:id` 无需登录即可阅读。
 */
export async function publishShare(api: LingWuApi, input: ShareInput): Promise<string> {
  const result = await api.request<{ id: string; url: string }>("/api/shares", input);
  if (!result?.url) throw new Error("Share link was not returned.");
  return result.url;
}
