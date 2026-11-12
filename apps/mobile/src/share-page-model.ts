/**
 * 公开分享页的正文模型。
 *
 * 分享内容来自服务端的 `GET /s/:id/data`，字段可能因历史数据缺失，
 * 所以统一在这里做一次防御式解析：前端只渲染解析成功的记录。
 */

/** 一条公开分享的对话内容。 */
export interface SharedConversation {
  id: string;
  /** 用户提问；可能为空（例如会话首条就是助手消息）。 */
  question: string;
  /** 助手回复的原始 Markdown。 */
  answer: string;
  createdAt: string;
}

/** 把接口返回值收成模型；缺正文或结构不对时返回 null，由调用方兜错误态。 */
export function parseSharedConversation(value: unknown): SharedConversation | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || !input.id) return null;
  if (typeof input.answer !== "string" || !input.answer) return null;
  return {
    id: input.id,
    question: typeof input.question === "string" ? input.question : "",
    answer: input.answer,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : "",
  };
}

/** 页脚日期：与服务端分享页一致，用 `YYYY-MM-DD`。时间不可解析时返回空串。 */
export function formatShareDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
