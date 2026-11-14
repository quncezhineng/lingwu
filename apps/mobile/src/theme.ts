/**
 * 灵悟设计令牌（唯一来源）。
 *
 * 设计语言来自「冷静的投研工作台」：暖灰画布、白色纸面、1px 细描边，
 * 品牌蓝只用于操作、选中和数据强调；红涨绿跌保持独立语义。
 * 全站界面、正文与数据统一使用 Noto Serif SC，与「我的自选」保持一致，
 * 通过字号和字重区分层级。
 *
 * 约束：
 * - 本文件是仓库里唯一允许出现十六进制色值的 App 模块（产物 HTML 模板、图表色板、
 *   服务品牌色在下方登记后同样视为令牌）；
 * - 其余模块只从这里取色、间距、圆角、字阶、阴影、图标线宽；
 * - `colors.primary` 只用于图标描边、选中/聚焦描边、圆点、进度条与浅底，
 *   蓝色文字一律用 `primaryStrong` 或 `primaryAction`；
 * - 卡片靠描边和留白建立层级，阴影只给输入框、弹层和浮导航。
 *
 * 组件语义按 shadcn/ui 的 token convention 组织（见 `semantic`）：
 * background/foreground、card、popover、primary、secondary、muted、accent、
 * destructive、border、input、ring 成对出现，组件只消费语义令牌，不直接写色名。
 * 这一层完全是别名，所有色值仍来自上方 `colors`，主题颜色不发生变化。
 *
 * 排版与布局按 TDesign 设计体系校准（见 `space` / `sizing` / `grid` / `elevation` /
 * `textScale`）：4px 基准栅格、字号 +8 的行高韵律、small / medium / large 三级控件
 * 尺寸、small→default→medium→large→circle 圆角梯度、三层递进阴影。
 * 这一层只约束尺寸、留白与层级，不引入也不改写任何色值，主题配色保持不变；
 * 项目使用 React Native（非 DOM），因此落地的是 TDesign 的设计规范而非 Web 组件实现。
 */
import type { TextStyle, ViewStyle } from "react-native";
import { Platform } from "react-native";
import { webFontFamily } from "./font-family";

/** 基础色板。 */
export const colors = {
  canvas: "#F8F8F8", // 页面画布
  sidebar: "#F4F4F4", // 桌面导航底色，与画布形成一层极浅的空间分区
  paper: "#FFFFFF", // 卡片、输入框与浮层纸面
  surface: "#F4F4F4",
  surfaceRaised: "#FAFAFA",
  surfaceSoft: "#F6F6F6", // 折叠面板 / 收起态浅灰底
  tertiary: "#EEEEEE",
  text: "#303030",
  /** 标题专用深灰：比正文更淡一层，形成「冷静克制」的层级（Demo .page-head h1 #555 / .section-heading #494949）。 */
  heading: "#4A4A4A",
  /** 页面 H1 专用色（D5 定稿 #555555）。 */
  pageTitle: "#555555",
  muted: "#696969", // 刻意偏离 Demo 的 #808080（3.72:1），此处 5.17:1 达 AA
  faint: "#6F6F6F", // 次要信息文本，4.73:1 达 AA（Demo #8A8A8A 仅 3.25:1）
  disabled: "#B0B0B0", // 仅可用于禁用控件本身，不得用于「看起来像次要信息」的文本
  line: "#E6E6E6",
  lineSoft: "#EFEFEF",
  lineStrong: "#D6D6D6",
  /**
   * 图标按钮、头像圆钮、毛玻璃、胶囊和搜索条共用的 1px 描边。
   * 落在卡片线 #E6E6E6 和过深的 #C4C4C4 中间，左右悬浮圆钮同一档。
   */
  controlLine: "#D5D5D5",
  /** 选中 / 悬停描边（Demo --accent-line）。 */
  accentLine: "#D9E5FA",
  /** 悬浮按钮的毛玻璃底，让滚到下面的文字仍能读。 */
  glass: "rgba(248,248,248,0.78)",
  glassPressed: "rgba(244,244,244,0.92)",
  overlay1: "rgba(48,48,48,0.045)",
  overlay2: "rgba(48,48,48,0.075)",
  overlay3: "rgba(48,48,48,0.11)",
  primary: "#3A83F7",
  onPrimary: "#FFFFFF",
  primaryStrong: "#245FC4",
  primaryAction: "#2F6FD8",
  sky: "#EDF3FF",
  skyStrong: "#EAF1FF",
  green: "rgba(33,125,98,0.10)",
  success: "#217D62",
  orange: "rgba(211,126,35,0.11)",
  danger: "#C4384B",
  errorSoft: "rgba(196,56,75,0.09)",
  modalShade: "rgba(24,24,24,0.32)",
  /** Toast 底/字（Demo #202020 / #F2F2F2）。 */
  toast: "#202020",
  onToast: "#F2F2F2",
  /** 洞察卡等卡片内的文字型动作链接（Demo #526F9B）。 */
  link: "#526F9B",
  // 行情语义色：遵循中国市场惯例（涨红跌绿），与 danger/success 同色值但语义独立，
  // 避免行情涨跌被误读为「错误 / 成功」状态。
  marketUp: "#C4384B",
  marketDown: "#217D62",
  marketFlat: "#767676",
  marketUpSurface: "rgba(196,56,75,0.08)",
  marketDownSurface: "rgba(33,125,98,0.08)",
  // 文本专用深色变体：上两者直接作为正文色时对白底只有 ~3.9:1 / ~3.0:1，
  // 这里压深到 ≥4.5:1（WCAG AA 正文），图形与浅底仍用上面的原始色。
  marketUpText: "#B42F43",
  marketDownText: "#176A52",
  alertVolume: "#C47B24",
  alertVolumeText: "#8C520E",
  alertVolumeSurface: "rgba(196,123,36,0.10)",
  // 阴影色（RN 阴影属性不接受别名，统一在此登记）。
  shadow: "#000000",
  // 图标未显式传色时的兜底前景色。
  iconFallback: "#303030",
  // PDF / 文档预览视口背板，与纸面区分。
  viewport: "#E7E9E3",
  // 历史遗留头像涂装（旧数据兼容，不再新增）。
  avatarSand: "#FAF0DF",
  avatarLilac: "#F1ECF9",
} as const;

/**
 * shadcn 语义令牌（唯一来源仍是上面的 `colors`）。
 *
 * 组件按「表面 + 前景」成对取色：`card` 配 `cardForeground`，
 * `primary` 配 `primaryForeground`，与 shadcn 的 token convention 一致。
 * 这里只做别名映射，没有引入任何新色值，也不会改变现有主题配色；
 * 需要换肤时只需改这一层，组件样式无需改动。
 */
export const semantic = {
  background: colors.canvas,
  foreground: colors.text,
  card: colors.paper,
  cardForeground: colors.text,
  popover: colors.paper,
  popoverForeground: colors.text,
  /** 选中 / 聚焦语义，沿用项目里「primary 只做描边与圆点」的约束。 */
  primary: colors.primary,
  primaryForeground: colors.onPrimary,
  /** 实心操作按钮沿用项目既有的 primaryAction，避免改变按钮配色。 */
  action: colors.primaryAction,
  secondary: colors.surface,
  secondaryForeground: colors.text,
  muted: colors.surfaceSoft,
  mutedForeground: colors.muted,
  /** 更次要的文本（原本用 colors.faint 的地方）。 */
  subtleForeground: colors.faint,
  placeholder: colors.faint,
  accent: colors.surface,
  accentForeground: colors.text,
  destructive: colors.danger,
  destructiveForeground: colors.onPrimary,
  border: colors.line,
  input: colors.line,
  /** 圆形图标按钮、头像圆钮、悬浮毛玻璃、胶囊、搜索条。 */
  controlBorder: colors.controlLine,
  ring: colors.primary,
  sidebar: colors.sidebar,
  sidebarForeground: colors.muted,
  sidebarAccent: colors.surfaceSoft,
  sidebarBorder: colors.line,
  subtleBorder: colors.lineSoft,
  overlay: colors.modalShade,
} as const;

/**
 * 状态语义（StatusBadge）。
 *
 * 四态统一中性底 `#EFEFEF`：只有 running 用蓝、waiting 用行动色（唯一需要用户动手的状态），
 * done / paused 压到 #666666（对 #EFEFEF 4.99:1，达 AA）。
 */
export const statusColors = {
  surface: "#EFEFEF",
  running: "#4369A2", // 4.83:1
  waiting: "#8C520E", // 行动色：等待审批/补充输入是唯一需要人工介入的状态
  done: "#666666", // 4.99:1
  paused: "#666666",
  /** 计划步骤「已完成」图标的低饱和蓝灰（Demo .plan-step.done）。 */
  stepDone: "#8499B8",
} as const;

/** The shared typeface is the watchlist's existing serif stack on every surface. */
const applicationFont = Platform.select({
  web: webFontFamily,
  ios: "Songti SC",
  android: "serif",
  default: "serif",
});
export const fonts = {
  ui: applicationFont,
  // Compatibility aliases keep existing component APIs on the same typeface.
  sans: applicationFont,
  serif: applicationFont,
  number: applicationFont,
} as const;

/**
 * 间距刻度（TDesign 4px 基准栅格）。
 *
 * 既有档位与取值全部保留，保证老代码零回归；补齐 2 / 6 / 10 / 28 / 40 / 48 档，
 * 让原先散落在组件里的裸值有统一的归属。分层约束不变：页面级用 page/pageMobile，
 * 区块级用 section/xxl/xxxl，组件内用 hairline…lg，文本行内才允许 1–2px 微调。
 */
export const space = {
  /** 2：分隔线两侧、图标与文字的微调。 */
  hairline: 2,
  xxs: 4,
  /** 6：紧凑控件内距、标题与副标题的垂直呼吸。 */
  compact: 6,
  xs: 8,
  /** 10：列表行内部的图标—文字间距。 */
  tight: 10,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  /** 28：卡片组之间的中等留白。 */
  relaxed: 28,
  xxl: 32,
  /** 40：分区之间、桌面工作台栏间距。 */
  xxxl: 40,
  /** 48：页面大区块之间的呼吸 / 列表底部留白。 */
  section: 48,
  /** 64：登录页双栏、空状态等大尺度分区间距。 */
  hero: 64,
  /** 桌面页面横向 padding。 */
  page: 42,
  /** App 页面横向 padding。 */
  pageMobile: 22,
  /** 桌面工作台三栏栅格间距。 */
  gutter: 40,
  /** 触控目标下限（RN 无障碍基线，TDesign 触控态同样要求 ≥44）。 */
  touch: 44,
} as const;

/**
 * 圆角：单一基准派生出的三档 + 胶囊（对齐 shadcn 的 `--radius` 派生思路）。
 *
 * 从原来的 6/8/12/16 四档收敛为「徽标 4 / 控件 6 / 容器 8 / 浮层 12」：
 * 半径越小、层级越少，界面越安静，也更接近 shadcn 的克制感。
 * `micro` / `field` / `panel` 保留为语义别名，避免既有引用散落裸值。
 *
 * 下方 `default` / `medium` / `large` / `extraLarge` / `circle` 是 TDesign 的
 * small→default→medium→large→circle 梯度别名；数值沿用既有档位，不新增视觉档。
 */
export const radius = {
  small: 4,
  badge: 4,
  micro: 4,
  default: 6,
  control: 6,
  field: 6,
  /** 卡片 / 面板：TDesign medium 梯度，保持既有 8px 收敛感。 */
  medium: 8,
  card: 8,
  panel: 8,
  large: 12,
  composer: 12,
  sheet: 12,
  /** 底部抽屉 / 大浮层：原先写死在组件里的 16 收敛为令牌。 */
  extraLarge: 16,
  circle: 999,
  full: 999,
} as const;

/**
 * 控件尺寸（TDesign small / medium / large 三级）。
 *
 * 桌面紧凑档可低于触控下限，但调用方需配 `hitSlop`；移动端一律不低于
 * `touch` 44。把原先散落在各页面里的 28 / 32 / 34 / 36 / 40 收敛到同一套刻度，
 * 让按钮、输入框、图标按钮、列表行在同一行里能自然对齐。
 */
export const sizing = {
  /** 小号：密集表格、行内操作。 */
  controlSm: 28,
  /** 中号（默认）：常规按钮、图标按钮、输入框。 */
  controlMd: 32,
  /** 大号：主操作、表单确认。 */
  controlLg: 40,
  /** 特大号：移动端主按钮、底部操作。 */
  controlXl: 48,
  /** 输入框：比按钮略高，容纳 14/22 行高 + 上下内距。 */
  inputMd: 36,
  inputLg: 40,
  /** 列表行最小高度：单行 40 / 双行 56。 */
  rowMd: 40,
  rowLg: 56,
  /** 图标底座：与按钮同档，避免同一行里两个方块不一样高。 */
  iconSm: 28,
  iconMd: 32,
  iconLg: 40,
  /** 触控目标下限。 */
  touch: 44,
} as const;

/**
 * 内容栅格（TDesign 24 栅格的简化落地）。
 *
 * 页面统一按「12 列 + 固定 gutter」思考：列宽 = (容器宽 - gutter × (列数 - 1)) / 列数。
 * 这里只登记常量，供 `CardGrid`、`PageHeader` 与壳层复用，不改变任何页面结构。
 */
export const grid = {
  columns: 12,
  /** 卡片网格间距（原 `CardGrid` 里写死的 10 收敛为 4px 栅格值）。 */
  gap: 12,
  /** 桌面内容列与侧栏之间的间距。 */
  gutter: 24,
  /** 窄屏卡片网格间距。 */
  gapCompact: 8,
  /** 阅读列最佳行宽，长文超过这个宽度就主动收窄。 */
  readingMax: 760,
} as const;

/**
 * 底部对话输入。单行时用 radius.full，浏览器会收成高度的一半，两端是完整半圆。
 * 多行不再跟着变高去取一半，否则两端会鼓成过大的半圆；这时用 pillRadius，
 * 它等于单行最小高度的一半。
 */
const composerMinHeight = 52;
export const composerMetrics = {
  minHeight: composerMinHeight,
  padding: 6,
  control: 36,
  pillRadius: composerMinHeight / 2,
  /** 高度超过单行这么多，就从胶囊收成大圆角。 */
  growSlack: 8,
} as const;

/**
 * 字阶九档（+ 两个数据档与洞察标题特例）。
 *
 * 行高按 Demo 的阅读感取松（正文 1.6，长文 1.78），字距一律非负：
 * CJK 大字号使用负字距会压缩字面、显「挤」。
 */
export const typography = {
  /** 10/14：大写小标签（日期眉标、分区眉标、计数）。 */
  eyebrow: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: fonts.sans,
  },
  /** 11/17：辅助标签、时间戳、文本按钮。 */
  caption: {
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "500",
    letterSpacing: 0,
    fontFamily: fonts.sans,
  },
  /** 12/19：列表次要信息、导航项。 */
  meta: {
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "400",
    letterSpacing: 0,
    fontFamily: fonts.sans,
  },
  /** 14/25：长文 / AI 正文 / 洞察卡正文。 */
  prose: {
    fontSize: 14,
    lineHeight: 25,
    fontWeight: "400",
    letterSpacing: 0,
    fontFamily: fonts.sans,
  },
  /** 15/24：列表、表单与界面正文。 */
  body: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "400",
    letterSpacing: 0,
    fontFamily: fonts.sans,
  },
  /** 16/24：区块标题。 */
  heading: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
    letterSpacing: 0,
    fontFamily: fonts.sans,
  },
  /** 15/22：侧栏列表和右侧身份上的「名称 · 角色」。比 16 略小，长名称少截断。 */
  agentName: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: 0,
    fontFamily: fonts.serif,
  },
  /** 22/32：页面 H1 与浮层标题，统一字体 / w500 / ls 0.3。 */
  h1: {
    fontSize: 22,
    lineHeight: 32,
    fontWeight: "500",
    letterSpacing: 0.3,
    fontFamily: fonts.sans,
  },
  /** 20/26：度量数字。 */
  data: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
    letterSpacing: 0,
    fontFamily: fonts.number,
  },
  /** 24/30：行情详情页的大号度量数字。 */
  dataLg: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
    letterSpacing: 0,
    fontFamily: fonts.number,
  },
  /** 28/40：工作台问候（serif，移动 22/34 见 displayCompact）。 */
  display: {
    fontSize: 28,
    lineHeight: 40,
    fontWeight: "500",
    letterSpacing: 0.4,
    fontFamily: fonts.serif,
  },
  /** 22/34：移动端问候。 */
  displayCompact: {
    fontSize: 22,
    lineHeight: 34,
    fontWeight: "500",
    letterSpacing: 0.4,
    fontFamily: fonts.serif,
  },
  /** 17/29：洞察卡标题（serif 特例，Delta §5.1：17/1.7）。 */
  insightTitle: {
    fontSize: 17,
    lineHeight: 29,
    fontWeight: "500",
    letterSpacing: 0.1,
    fontFamily: fonts.serif,
  },
} as const satisfies Record<string, TextStyle>;

/** 与 Delta 文档 `type` 命名对齐的别名（避免与 TS `import type` 冲突，主名称为 typography）。 */
export const type = typography;

/**
 * TDesign 语义字阶：行高按「字号 + 8」的韵律对齐到 2px 栅格。
 *
 * 项目原有的 `typography` 十三档保持不变（避免长文阅读感与既有布局回归）；
 * 这一组别名专门给「页面里写死 fontSize: 13 / 14 / 18」的通用组件用，
 * 让同一层级在不同页面落到同一档字号 / 行高 / 字重上。
 * fontFamily 一律复用既有 `fonts`，字体与配色都不变。
 */
export const textScale = {
  /** 10/18：眉标、计数、徽标。 */
  markSmall: {
    fontSize: 10,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: 0.8,
    fontFamily: fonts.sans,
  },
  /** 12/20：时间戳、辅助说明、表单标签。 */
  markMedium: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: "500",
    fontFamily: fonts.sans,
  },
  /** 12/20：列表次要信息。 */
  bodySmall: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: "400",
    fontFamily: fonts.sans,
  },
  /** 14/22：界面正文、按钮、输入。 */
  bodyMedium: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "400",
    fontFamily: fonts.sans,
  },
  /** 16/24：大号正文、强调行。 */
  bodyLarge: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400",
    fontFamily: fonts.sans,
  },
  /** 14/22：最小一级区块标题。 */
  titleSmall: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
    fontFamily: fonts.sans,
  },
  /** 16/24：区块标题。 */
  titleMedium: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
    fontFamily: fonts.sans,
  },
  /** 20/28：页面 H1 / 弹层主标题。 */
  titleLarge: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600",
    fontFamily: fonts.sans,
  },
  /** 24/32：数据强调、大标题。 */
  headlineSmall: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "500",
    fontFamily: fonts.serif,
  },
  /** 28/36：工作台问候。 */
  headlineMedium: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "500",
    fontFamily: fonts.serif,
  },
} as const satisfies Record<string, TextStyle>;

/**
 * 阴影：只保留「浮在画布之上」这一层极淡的晕（shadcn 以 1px 描边为主）。
 *
 * 色值保持原样，只收紧扩散半径、位移与不透明度，让卡片与浮层更平整；
 * 同一元素只允许叠加一档阴影，避免多层阴影糊成灰边。
 */
export const shadow = {
  /** 卡面（默认不用；需要浮起时用这一档）。 */
  card: {
    shadowColor: "#5A5A5A",
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  /** 输入 composer / 浮层面板。 */
  composer: {
    shadowColor: "#404040",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  /** 侧向抽屉（对话会话栏）。 */
  drawer: {
    shadowColor: "#404040",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: -2, height: 0 },
    elevation: 4,
  },
  /** 模态面板。 */
  sheet: {
    shadowColor: "#2D2D2D",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
} as const satisfies Record<string, ViewStyle>;

/**
 * 层级阴影（TDesign shadow-1 / shadow-2 / shadow-3 三级递进）。
 *
 * 阴影色一律复用上方 `shadow` 里已登记的色值，不引入任何新颜色；
 * 只把位移、扩散与不透明度排成「贴着画布 / 浮在画布 / 盖在画布上」三级，
 * 卡片默认仍靠 1px 描边建立层级，只有浮层消费 level2 / level3。
 */
export const elevation = {
  /** 贴着画布：需要强调的卡片、悬停态容器。 */
  level1: {
    shadowColor: shadow.card.shadowColor,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  /** 浮在画布：输入区、下拉菜单、抽屉。 */
  level2: {
    shadowColor: shadow.composer.shadowColor,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  /** 盖在画布上：模态面板、全屏浮层。 */
  level3: {
    shadowColor: shadow.sheet.shadowColor,
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
} as const satisfies Record<string, ViewStyle>;

/**
 * 断点。
 *
 * 与 Demo 一致：<760 为 App 单列 + 底栏；≥1000 为 Web 三栏（侧栏 + 内容 + 右栏）；
 * ≥1340 为超宽内容上限。页面里不再写裸数字，统一从这里取。
 */
export const breakpoints = {
  mobile: 760,
  desktop: 1000,
  wide: 1340,
} as const;

/** 壳层固定宽度（侧栏、会话列表），页面计算内容宽度时复用。 */
export const layout = {
  sidebar: 232,
  sidebarCollapsed: 72,
  chats: 248,
  /** 桌面顶栏与移动顶栏高度。 */
  topBarDesktop: 76,
  topBarMobile: 72,
  /** 页面内容上限与阅读列上限。 */
  contentMax: 1340,
  conversationMax: 920,
  readingMax: 760,
  /** 移动端底栏。 */
  bottomNav: 64,
} as const;

/** 交互节奏：RN 只消费毫秒值，CSS / Web 端可换算为 duration。 */
export const motion = {
  fast: 120,
  base: 180,
  slow: 300,
} as const;

/**
 * 图标线宽：常规与底栏统一 1.75，仅导航激活态用 2（Lucide 默认线宽）。
 *
 * 全站只保留这两档，图标重量不再随位置漂移；除两档与填充态 0 之外
 * 不允许其它线宽。
 */
export const iconStroke = {
  regular: 1.75,
  tab: 1.75,
  nav: 2,
} as const;

/**
 * 第三方服务品牌色。
 *
 * 仅用于 Connections 列表里的服务识别（Gmail / Google 日历 / 浏览器 / OpenBot），
 * 让用户一眼认出对接的是哪个外部服务；它们不参与品牌主操作，
 * 避免外部服务色与 LingWu 的蓝色操作层级混淆。
 * `surface` 是配套的浅色底座，用于图标背板。
 */
export const serviceBrands = {
  gmail: { fg: "#EA5B4D", surface: "rgba(234,91,77,0.12)" },
  googleCalendar: { fg: "#4285F4", surface: "rgba(66,133,244,0.12)" },
  browser: { fg: "#1987CF", surface: "rgba(25,135,207,0.12)" },
  openbot: { fg: "#6866A6", surface: "rgba(104,102,166,0.12)" },
} as const;

/**
 * 应用 / 技能图标的识别色（capability hub）。
 *
 * 与 `serviceBrands` 同级：只用于让用户快速区分不同应用，不参与品牌操作层级。
 */
export const appBrands = {
  dailyReview: { fg: "#7A5A22", surface: "#FAF4E9" },
  portfolioReview: { fg: "#496B43", surface: "#EEF5EC" },
  earnings: { fg: "#B15B27", surface: "#FAEFE7" },
  report: { fg: "#59648A", surface: "#F0F2F8" },
  notes: { fg: "#45716B", surface: "#ECF4F2" },
  monitoring: { fg: "#92514D", surface: "#F8EEED" },
} as const;

/**
 * 组合图表的分类色序列（资产配置环图等）。
 *
 * 图表需要可区分的多色序列，属于数据可视化语义，不参与品牌层级；
 * 超出序列长度时回退到 `chartNeutral`。
 */
export const chartSeries = [
  "#3A83F7",
  "#2FB3FF",
  "#3C7FB1",
  "#2A9D8F",
  "#C9922E",
  "#7B61A8",
  "#8A8F98",
] as const;

/** 图表「其它」分类的中性色。 */
export const chartNeutral = "#B0B6BF";
