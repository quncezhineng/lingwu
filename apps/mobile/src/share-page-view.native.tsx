/**
 * 前端域名下的公开分享页（原生端）。
 *
 * 原生 App 里没有「路径」概念，分享链接会在系统浏览器中打开，
 * 不需要应用内视图：App 入口的 `parseSharePath` 依赖 `window`，
 * 原生端恒为 none，因此这个组件不会被渲染。
 */

/** 原生端分享链接走系统浏览器，应用内无需渲染。 */
export default function SharePageView(_props: { id: string; broken?: boolean }) {
  return null;
}
