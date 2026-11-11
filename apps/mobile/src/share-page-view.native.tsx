/**
 * 前端域名下的公开分享页（原生端）。
 *
 * 原生 App 里没有「路径」概念，分享链接会在系统浏览器中打开，
 * 不需要应用内视图：`isSharePath` 永远返回 null，组件渲染空。
 */

/** 原生端没有 URL 路径，永远不是分享页。 */
export function isSharePath(_pathname: string): string | null {
  return null;
}

/** 原生端分享链接走系统浏览器，应用内无需渲染。 */
export default function SharePageView(_props: { id: string }) {
  return null;
}