/**
 * `/s/:id` 分享路径的识别。
 *
 * 抽成独立模块（不含 react-native 依赖）是为了让入口判断和测试都只依赖纯字符串逻辑：
 * App 在 Web 端首次渲染前要凭它决定「渲染分享页」还是「渲染工作区」。
 */

/** 分享 id 由服务端生成：`randomBytes(12)` 的 base64url 编码，恒为 16 个字符。 */
const SHARE_PATH = /(?:^|\/)s\/([A-Za-z0-9_-]{8,32})\/?$/;

/**
 * 匹配 `/s/:id`，返回分享 id；不是分享页则返回 null。
 *
 * 允许前缀路径（`/sub/s/:id`）：前端可能部署在子路径下，服务端链接仍是
 * `PUBLIC_WEB_URL + /s/:id`，这里宽松一点可避免因网关前缀差异落到首页。
 */
export function isSharePath(pathname: string): string | null {
  return SHARE_PATH.exec(pathname)?.[1] ?? null;
}
