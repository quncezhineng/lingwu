/**
 * 灵悟设计令牌（唯一来源）。
 *
 * 视觉方向来自 v7 Demo 的「冷静的投研工作台」：暖灰画布、白色纸面、1px 细描边，
 * 蓝色只用于操作与选中，红涨绿跌独立于品牌色，几乎不用阴影与大圆角。
 *
 * 取值口径：以 Demo-v7 的 CSS 实测值为准（见 `shared/UIUX-视觉Delta清单-Demo-v7-to-lingwu.md`
 * §3 的 10 处校正），不采信早期文档转述；对比度按 WCAG AA 修正，不复制 Demo 自身的
 * 3 处不达标色（muted / done 徽标 / 副标题）。
 *
 * 约束：
 * - 本文件是仓库里唯一允许出现十六进制色值的 App 模块（产物 HTML 模板、图表色板、
 *   服务品牌色在下方登记后同样视为令牌）；
 * - 其余模块只从这里取色、间距、圆角、字阶、阴影、图标线宽；
 * - `colors.primary` 只用于图标描边、选中/聚焦描边、圆点、进度条与浅底，
 *   蓝色文字一律用 `primaryStrong`（5.98:1）或 `primaryAction`（4.79:1）。
 *
 * 本模块不依赖任何业务模块，是可被 `ui.tsx`、`icons/` 共同引用的叶子模块。
 */
import type { TextStyle, ViewStyle } from "react-native";
import { Platform } from "react-native";

/** 基础色板。 */
export const colors = {
  canvas: "#F8F8F8", // 页面画布
  paper: "#FFFFFF", // 卡片、输入框与浮层纸面
  surface: "#F4F4F4",
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
  lineStrong: "#D6D6D6",
  /** 选中 / 悬停描边（Demo --accent-line）。 */
  accentLine: "#D9E5FA",
  overlay1: "rgba(48,48,48,0.045)",
  overlay2: "rgba(48,48,48,0.075)",
  overlay3: "rgba(48,48,48,0.11)",
  primary: "#3A83F7",
  onPrimary: "#FFFFFF",
  primaryStrong: "#245FC4",
  primaryAction: "#2F6FD8",
  sky: "#EDF3FF",
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
 * 状态语义（StatusBadge）。
 *
 * 四态统一中性底 `#EFEFEF`，仅文字色区分：running 蓝、其余灰阶；
 * done / paused 取自 Demo 但压深到达标（Demo done #878787 对浅灰仅 3.12:1）。
 */
export const statusColors = {
  surface: "#EFEFEF",
  running: "#4369A2", // 4.83:1
  waiting: "#6F6F6F", // 4.36:1
  done: "#6F6F6F",
  paused: "#666666",
  /** 计划步骤「已完成」图标的低饱和蓝灰（Demo .plan-step.done）。 */
  stepDone: "#8499B8",
} as const;

/** Web 端优先使用中文系统字体；原生端保持在平台字体回退内。 */
export const fonts = {
  sans: Platform.select({
    web: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    ios: "PingFang SC",
    android: "sans-serif",
    default: "sans-serif",
  }),
  serif: Platform.select({
    web: '"Noto Serif SC", "Songti SC", STSong, Georgia, serif',
    ios: "Songti SC",
    android: "serif",
    default: "serif",
  }),
  number: Platform.select({
    web: 'Georgia, "Times New Roman", serif',
    ios: "Georgia",
    android: "serif",
    default: "serif",
  }),
} as const;

/**
 * 间距刻度（4 的倍数）。
 *
 * 分层约束（Delta §4.6）：页面级用 page/pageMobile，区块级用 section*，
 * 组件内允许 2 的倍数（6/10/14 就近写在组件里，不入令牌），
 * 文本行内允许 1–2px 微调。现状 `gap: 8/10/12` 三分天下，新增代码优先取令牌。
 */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  /** 桌面页面横向 padding。 */
  page: 42,
  /** App 页面横向 padding。 */
  pageMobile: 22,
  /** 桌面工作台三栏栅格间距。 */
  gutter: 40,
  /** 触控目标下限。 */
  touch: 44,
} as const;

/**
 * 圆角八档 + 胶囊。
 *
 * 取值与用途来自 Demo CSS 实测（Delta §4.2），对应 lingwu 现状归并：
 * 3/2 → badge，6 → micro，8 → control，12 → field 或 panel，18 → composer，
 * 22 → sheet，其余 19/20/21/30 见各页面收敛记录。
 */
export const radius = {
  badge: 4,
  micro: 5,
  control: 7,
  field: 9,
  card: 10,
  panel: 11,
  composer: 14,
  sheet: 17,
  full: 999,
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
    letterSpacing: 1.4,
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
  /** 26/37：页面 H1（Demo .page-head h1，sans / w500 / ls 1 → 归 0.5）。 */
  h1: {
    fontSize: 26,
    lineHeight: 37,
    fontWeight: "500",
    letterSpacing: 0.5,
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
  /** 31/48：工作台问候（serif，移动 25/40 见 displayCompact）。 */
  display: {
    fontSize: 31,
    lineHeight: 48,
    fontWeight: "500",
    letterSpacing: 0.5,
    fontFamily: fonts.serif,
  },
  /** 25/40：移动端问候。 */
  displayCompact: {
    fontSize: 25,
    lineHeight: 40,
    fontWeight: "500",
    letterSpacing: 0.5,
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
 * 阴影三档。
 *
 * Demo 的卡面阴影透明度只有 0.016–0.05；lingwu 卡面统一「1px 描边、不加阴影」，
 * 仅 composer 与模态保留阴影。
 */
export const shadow = {
  /** 卡面（默认不用；需要浮起时用这一档）。 */
  card: {
    shadowColor: "#5A5A5A",
    shadowOpacity: 0.04,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  /** 输入 composer / 浮层面板。 */
  composer: {
    shadowColor: "#404040",
    shadowOpacity: 0.05,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  /** 侧向抽屉（对话会话栏）。 */
  drawer: {
    shadowColor: "#404040",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: -4, height: 0 },
    elevation: 8,
  },
  /** 模态面板。 */
  sheet: {
    shadowColor: "#2D2D2D",
    shadowOpacity: 0.14,
    shadowRadius: 38,
    shadowOffset: { width: 0, height: 18 },
    elevation: 24,
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
  chats: 248,
} as const;

/**
 * 图标线宽：常规 1.65 / 底栏 1.7 / 导航激活 1.9。
 *
 * 除这三档与填充态 0 之外不允许其它线宽。
 */
export const iconStroke = {
  regular: 1.65,
  tab: 1.7,
  nav: 1.9,
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
