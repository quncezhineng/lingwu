/** Shared layout dimensions from the v3 Bot prototype, adapted to full-width web/native screens. */
export const agentLayout = {
  columnMaxWidth: 965,
  messageMaxWidth: 955,
  onboardingMaxWidth: 580,
  sheetMaxWidth: 480,
  drawerMaxWidth: 350,
  headerHeight: 74,
  pagePadding: 25,
  /**
   * 二级页内容列的最大宽度。
   *
   * 页面顶栏（返回 + 标题）与页面正文必须共用这一个值，
   * 否则右侧栏收起、主列变宽时，顶栏会比正文窄一截，返回按钮与标题就会浮在内容之外。
   */
  pageMaxWidth: 1180,
} as const;
