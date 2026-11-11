import { View } from "react-native";
import { API_URL } from "./api";
import { colors } from "./ui";

/**
 * 前端域名下的公开分享页（Web）。
 *
 * 「分享为链接」生成的链接指向前端域名（PUBLIC_WEB_URL），收件人在浏览器里
 * 直开 `/s/:id` 时会命中这个 SPA 入口。这里不做任何登录/鉴权，直接用 iframe
 * 加载 API 端的 `GET /s/:id`（由服务端渲染无需登录的静态页），保证分享链接
 * 在前端域名下可用，且内容渲染逻辑仍归服务端一份。
 */

/** 匹配 `/s/:id` 分享路径，返回分享 id；不是分享页则返回 null。 */
export function isSharePath(pathname: string): string | null {
  const match = /^\/s\/([A-Za-z0-9_-]{8,32})\/?$/.exec(pathname);
  return match ? match[1] : null;
}

/** 前端的分享页视图：把 API 渲染的分享内容嵌进 iframe，占满整个视口。 */
export default function SharePageView({ id }: { id: string }) {
  const src = `${API_URL}/s/${encodeURIComponent(id)}`;
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <iframe
        title="分享页"
        src={src}
        referrerPolicy="no-referrer"
        style={{
          width: "100%",
          height: "100%",
          border: 0,
          backgroundColor: "#F8F8F8",
        }}
      />
    </View>
  );
}
