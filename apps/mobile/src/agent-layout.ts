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

/**
 * 对话页的内容列：标题、输入框等「整列」元素共用这一条宽度。
 *
 * 因为智能体对话页与频道对话页必须是同一个设计宽度，这两条列样式
 * 由 `agent-layout` 统一导出，两个页面都从这里取，避免各写一份数值后走偏。
 */
export const conversationColumnStyle = {
  width: "100%",
  maxWidth: agentLayout.columnMaxWidth,
  alignSelf: "center",
} as const;

/** 消息列比内容列稍窄，左右各留出 8px，气泡不贴到输入框的边缘线上。 */
export const messageColumnStyle = {
  ...conversationColumnStyle,
  maxWidth: agentLayout.messageMaxWidth,
} as const;
