/**
 * 通知列表只展示标题 + 一句话简介。
 *
 * 通知正文通常是模型写的 Markdown（还可能带着字面量 `\n`），直接铺开太长，
 * 这里去掉标记与空白后截断；完整内容仍旧点「查看任务」进入任务页阅读。
 */
export function notificationExcerpt(body: string, length = 110): string {
  const plain = body
    .replace(/\\n/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > length ? `${plain.slice(0, length - 1).trimEnd()}…` : plain;
}
