/**
 * `/s/:id` 分享路径的识别。
 *
 * 抽成独立模块（不含 react-native 依赖）是为了让入口判断和测试都只依赖纯字符串逻辑：
 * App 在 Web 端首次渲染前要凭它决定「渲染分享页」还是「渲染工作区」。
 *
 * 这里刻意区分三态而不是「命中 / 不命中」：
 * 路径里确实带了 `/s/xxx`，但 `xxx` 不是服务端会生成的形状时，说明链接被复制坏了
 * （邮件/微信把句末标点、引号、尖括号一起带进来是常事）。若这时退回 `null`，
 * 收件人会落到工作区或登录页，看起来就是「链接点进去进不了页面」——
 * 所以这种情况要显式告诉用户「链接不完整」，而不是静默当普通页面处理。
 */

/** 宽松地切出 `/s/` 后面那一段；id 形状另由 `SHARE_ID` 校验。 */
const SHARE_PATH = /(?:^|\/)s\/([^/]+)\/?$/;

/** 服务端生成的形状：`randomBytes(12)` 的 base64url 编码，恒为 16 个字符。 */
const SHARE_ID = /^[A-Za-z0-9_-]{8,32}$/;

/** 复制粘贴常在 URL 末尾带上的标点/引号，判形之前先剥掉。 */
const TRAILING_NOISE = /[.,;:!?)\]}>'"”’、。，；：）】》]+$/;

export type SharePath =
  | { kind: "share"; id: string }
  /** 像是分享链接，但 id 不合法（被截断或粘进了多余字符）。 */
  | { kind: "broken" }
  /** 普通页面。 */
  | { kind: "none" };

/** 去掉百分号编码与尾随标点，避免「编码过的 `s`」「句末句号」把整条链接判死。 */
function clean(pathname: string): string {
  let value = pathname;
  try {
    value = decodeURIComponent(pathname);
  } catch {
    // 非法百分号编码：保留原样，交给下面的正则判断。
  }
  return value.replace(TRAILING_NOISE, "");
}

/** 识别分享路径，区分「合法分享」「链接不完整」「普通页面」三种情况。 */
export function parseSharePath(pathname: string): SharePath {
  const candidate = SHARE_PATH.exec(clean(pathname))?.[1];
  if (!candidate) return { kind: "none" };
  return SHARE_ID.test(candidate) ? { kind: "share", id: candidate } : { kind: "broken" };
}

/**
 * 匹配 `/s/:id`，返回分享 id；不是分享页则返回 null。
 *
 * 允许前缀路径（`/sub/s/:id`）：前端可能部署在子路径下，服务端链接仍是
 * `PUBLIC_WEB_URL + /s/:id`，这里宽松一点可避免因网关前缀差异落到首页。
 */
export function isSharePath(pathname: string): string | null {
  const parsed = parseSharePath(pathname);
  return parsed.kind === "share" ? parsed.id : null;
}
