/**
 * Shared layout dimensions from the v3 Bot prototype, adapted to full-width web/native screens.
 *
 * 按 TDesign 8px 栅格对齐：所有列宽、顶栏高度与页面内距都落在 8 的倍数上，
 * 三栏内容列、悬浮顶栏与二级页顶栏因此能共用同一条视觉基准线。
 * 数值只做 1–4px 的收敛，不改变栏的数量、断点与交互行为。
 */
export const agentLayout = {
  columnMaxWidth: 968,
  messageMaxWidth: 952,
  onboardingMaxWidth: 576,
  sheetMaxWidth: 480,
  drawerMaxWidth: 352,
  headerHeight: 72,
  pagePadding: 24,
  /**
   * 二级页内容列的最大宽度。
   *
   * 页面顶栏（返回 + 标题）与页面正文必须共用这一个值，
   * 否则右侧栏收起、主列变宽时，顶栏会比正文窄一截，返回按钮与标题就会浮在内容之外。
   */
  pageMaxWidth: 1184,
} as const;
