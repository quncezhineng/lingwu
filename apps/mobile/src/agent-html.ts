/**
 * Agent HTML 设计系统：单文件、零依赖、可离线打开的报告页面骨架。
 *
 * 版式与设计令牌来自 agent-html（shadcn/ui 中性色 + 语义状态色）：
 * - 只用 CSS 自定义属性组织配色，`data-theme="dark"` 一份映射即得深色模式；
 * - 组件限定在「徽章 / 指标卡 / Callout / 卡片 / 手风琴 / 数据表」六类，
 *   避免每个页面各写一套临时样式；
 * - 交互只用原生能力：`<details>` 折叠、`<dialog>` 弹层、几行内联脚本做
 *   主题切换、目录滚动高亮与「复制 Markdown 回传 Agent」；
 * - 不引任何 CDN、字体或图表库：图表用内联 SVG，图标用内联 SVG 并跟随
 *   `currentColor`，断网、内网、导出后单文件打开都不掉样式。
 *
 * 这里只负责「长什么样」，内容与业务判断由调用方（如 report-page.ts）决定。
 */

/** HTML 文本转义；同时用于属性值（已覆盖引号）。 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ------------------------------------------------------------------ *
 * 设计令牌与组件样式
 * ------------------------------------------------------------------ */

export const AGENT_HTML_CSS = `
:root {
  color-scheme: light;
  --bg: #fafafa;
  --card: #ffffff;
  --card-fg: #09090b;
  --primary: #18181b;
  --primary-fg: #fafafa;
  --secondary: #f4f4f5;
  --secondary-fg: #18181b;
  --muted: #f4f4f5;
  --muted-fg: #71717a;
  --border: #e4e4e7;
  --radius: 8px;
  --radius-sm: 6px;
  --radius-lg: 12px;
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);

  --ok: #16a34a;
  --ok-bg: #f0fdf4;
  --ok-border: #bbf7d0;
  --warn: #d97706;
  --warn-bg: #fffbeb;
  --warn-border: #fde68a;
  --err: #dc2626;
  --err-bg: #fef2f2;
  --err-border: #fecaca;
  --info: #2563eb;
  --info-bg: #eff6ff;
  --info-border: #bfdbfe;

  /* 涨跌配色按 A 股 / 中文习惯：红涨绿跌，与 --ok/--err 的语义色分开维护。 */
  --up: #dc2626;
  --down: #16a34a;
  --flat: #71717a;
}

[data-theme="dark"] {
  color-scheme: dark;
  --bg: #09090b;
  --card: #121215;
  --card-fg: #fafafa;
  --primary: #fafafa;
  --primary-fg: #18181b;
  --secondary: #27272a;
  --secondary-fg: #fafafa;
  --muted: #18181b;
  --muted-fg: #a1a1aa;
  --border: #27272a;
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.4);

  --ok: #4ade80;
  --ok-bg: #052e1680;
  --ok-border: #166534;
  --warn: #fbbf24;
  --warn-bg: #451a0380;
  --warn-border: #854d0e;
  --err: #f87171;
  --err-bg: #450a0a80;
  --err-border: #991b1b;
  --info: #60a5fa;
  --info-bg: #17255480;
  --info-border: #1e40af;

  --up: #f87171;
  --down: #4ade80;
  --flat: #a1a1aa;
}

html { scroll-behavior: smooth; }
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  padding: 32px 20px 56px;
  background: var(--bg);
  color: var(--card-fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, p, ul, ol { margin: 0; }
a { color: var(--info); text-decoration: none; word-break: break-word; }
a:hover { text-decoration: underline; }
code, .mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
.num { font-variant-numeric: tabular-nums; }
.muted { color: var(--muted-fg); }
.strong { font-weight: 600; }
.up { color: var(--up); }
.down { color: var(--down); }
.flat { color: var(--flat); }

/* 布局：宽屏时右侧挂一条悬浮目录，窄屏自动隐藏。 */
.layout-wrapper {
  display: flex;
  gap: 32px;
  justify-content: center;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
}
.container { flex: 1; min-width: 0; max-width: 100%; }
.toc-rail { display: none; width: 176px; flex-shrink: 0; }
@media (min-width: 1080px) { .toc-rail { display: block; } }
.toc-sticky { position: sticky; top: 32px; font-size: 13px; }
.toc-title {
  margin-bottom: 10px;
  padding-left: 10px;
  color: var(--muted-fg);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.toc-link {
  display: block;
  margin-bottom: 2px;
  padding: 6px 10px;
  border-left: 2px solid transparent;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--muted-fg);
  text-decoration: none;
  transition: color 0.15s ease, background 0.15s ease;
}
.toc-link:hover { background: var(--secondary); color: var(--card-fg); text-decoration: none; }
.toc-link.active {
  border-left-color: var(--primary);
  background: var(--secondary);
  color: var(--card-fg);
  font-weight: 600;
}

/* 版头 */
.report-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}
.report-title-box { flex: 1; min-width: 0; }
.report-title-box h1 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 23px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.35;
}
.report-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: 8px;
  color: var(--muted-fg);
  font-size: 12.5px;
}
.report-meta-item { display: inline-flex; align-items: center; gap: 5px; }
.report-meta-item svg { flex-shrink: 0; opacity: 0.75; }
.actions { display: flex; flex-shrink: 0; align-items: center; gap: 8px; }

/* 按钮 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--card-fg);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease;
}
.btn:hover { background: var(--secondary); }
.btn-icon { width: 32px; padding: 0; }

/* 徽章 */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 21px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 9999px;
  background: var(--secondary);
  color: var(--secondary-fg);
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
}
.badge-dot { width: 6px; height: 6px; border-radius: 9999px; background: currentColor; }
.badge-success { border-color: var(--ok-border); background: var(--ok-bg); color: var(--ok); }
.badge-warning { border-color: var(--warn-border); background: var(--warn-bg); color: var(--warn); }
.badge-danger { border-color: var(--err-border); background: var(--err-bg); color: var(--err); }
.badge-info { border-color: var(--info-border); background: var(--info-bg); color: var(--info); }

/* 指标条 */
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.stat-mini {
  padding: 13px 15px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  box-shadow: var(--shadow-sm);
}
.stat-mini-label { color: var(--muted-fg); font-size: 12px; }
.stat-mini-val {
  margin-top: 3px;
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.stat-mini-sub { margin-top: 2px; color: var(--muted-fg); font-size: 11.5px; }

/* Callout */
.callout {
  margin-bottom: 16px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--secondary);
  font-size: 13.5px;
  line-height: 1.65;
}
.callout-success { border-color: var(--ok-border); background: var(--ok-bg); }
.callout-warning { border-color: var(--warn-border); background: var(--warn-bg); }
.callout-danger { border-color: var(--err-border); background: var(--err-bg); }
.callout-info { border-color: var(--info-border); background: var(--info-bg); }
.callout-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 5px;
  color: var(--card-fg);
  font-weight: 600;
}
.callout-success .callout-title { color: var(--ok); }
.callout-warning .callout-title { color: var(--warn); }
.callout-danger .callout-title { color: var(--err); }
.callout-info .callout-title { color: var(--info); }
.callout p + p { margin-top: 8px; }

/* 卡片与章节 */
.card {
  margin-bottom: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 18px;
  border-bottom: 1px solid var(--border);
  font-size: 14.5px;
  font-weight: 600;
}
.card-body { padding: 16px 18px; }
.card-body > * + * { margin-top: 12px; }
.card-note {
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  background: var(--secondary);
  color: var(--muted-fg);
  font-size: 12px;
}

/* 悬浮目录可点、章节锚点留出滚动间距 */
section[id], footer[id] { scroll-margin-top: 24px; }

/* 手风琴（原生 details） */
details { border-bottom: 1px solid var(--border); }
details:last-child { border-bottom: none; }
summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
  user-select: none;
  transition: background 0.15s ease;
}
summary::-webkit-details-marker { display: none; }
summary:hover { background: var(--secondary); }
.chevron { flex-shrink: 0; color: var(--muted-fg); transition: transform 0.2s ease; }
details[open] > summary .chevron { transform: rotate(180deg); }
.accordion-inner { padding: 0 18px 14px; color: var(--muted-fg); font-size: 13px; }
.accordion-inner > * + * { margin-top: 10px; }

/* 键值块 */
.property-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.property-box { padding: 9px 11px; border-radius: var(--radius-sm); background: var(--secondary); }
.property-label { color: var(--muted-fg); font-size: 11px; font-weight: 600; }
.property-value {
  margin-top: 2px;
  color: var(--card-fg);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

/* 数据表 */
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
th {
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--secondary);
  color: var(--muted-fg);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
td { padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
tbody tr:last-child td, tbody tr:last-child th { border-bottom: none; }
tbody tr:hover { background: var(--muted); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.kv th { width: 38%; background: transparent; color: var(--muted-fg); font-weight: 500; }
.kv tbody tr:hover { background: transparent; }

/* 列表与图表 */
.list { padding-left: 18px; font-size: 13.5px; }
.list li + li { margin-top: 6px; }
.list-plain { margin: 0; padding: 0; list-style: none; }
.list-plain li + li { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
.chart svg { display: block; width: 100%; height: auto; }
.chart-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; color: var(--muted-fg); font-size: 11.5px; }
.chart-legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend-swatch { width: 8px; height: 8px; border-radius: 2px; }
.legend-tick { width: 0; height: 10px; border-left: 2px dashed var(--primary); opacity: 0.6; }
.empty {
  padding: 16px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted-fg);
  font-size: 12.5px;
  text-align: center;
}

/* 落款 */
.colophon {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 16px;
  margin-top: 24px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  color: var(--muted-fg);
  font-size: 11.5px;
}

@media (max-width: 720px) {
  body { padding: 20px 14px 40px; }
  .stat-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .property-grid { grid-template-columns: 1fr; }
  .report-header { flex-direction: column; gap: 12px; }
  .actions { width: 100%; }
}

@media print {
  /* 导出 PDF 时留出页边距，避免正文贴到纸边。 */
  @page { margin: 14mm 12mm; }

  /* 打印时强制回浅色，避免深色主题把整页刷成墨块。 */
  :root, [data-theme="dark"] {
    --bg: #ffffff;
    --card: #ffffff;
    --card-fg: #111111;
    --primary: #111111;
    --secondary: #f5f5f5;
    --secondary-fg: #111111;
    --muted: #f5f5f5;
    --muted-fg: #555555;
    --border: #d8d8d8;
    --ok: #15803d;
    --ok-bg: #f0fdf4;
    --warn: #b45309;
    --warn-bg: #fffbeb;
    --err: #b91c1c;
    --err-bg: #fef2f2;
    --info: #1d4ed8;
    --info-bg: #eff6ff;
    --up: #b91c1c;
    --down: #15803d;
    --flat: #555555;
  }
  body { padding: 0; background: #fff; }
  .actions, .toc-rail { display: none !important; }
  .card, .callout, .stat-mini { box-shadow: none; }
  /* 卡片本身可以跨页（财务长表），只保证单行内容与折叠面板不被拦腰截断。 */
  .callout, .stat-mini, tr, details { break-inside: avoid; }
  .card-header { break-after: avoid; }
  details[open] { margin-bottom: 0; }
  .container { max-width: 100% !important; }
  a { color: inherit; }
}
`;

/* ------------------------------------------------------------------ *
 * 内联图标：stroke 跟随 currentColor，深浅色自动适配。
 * ------------------------------------------------------------------ */

export const icons = {
  target:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>',
  calendar:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  hash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg>',
  check:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  warning:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>',
  info: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>',
  chevron:
    '<svg class="chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
  printer:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  moon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1 -9 -9Z"/></svg>',
} as const;

/* ------------------------------------------------------------------ *
 * 组件构造器：只拼字符串，不依赖 DOM，方便在 RN / Node 里调用。
 * ------------------------------------------------------------------ */

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "",
  success: " badge-success",
  warning: " badge-warning",
  danger: " badge-danger",
  info: " badge-info",
};

/** 状态徽章；`dot` 为 true 时带一个语义色圆点。 */
export function badge(text: string, tone: Tone = "neutral", dot = false): string {
  const point = dot ? '<span class="badge-dot"></span>' : "";
  return `<span class="badge${TONE_CLASS[tone]}">${point}${escapeHtml(text)}</span>`;
}

/** 指标卡；`tone` 只用于数值着色（如涨跌）。 */
export function statCard(input: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down" | "flat";
}): string {
  const cls = input.tone ? ` ${input.tone}` : "";
  const sub = input.sub ? `<div class="stat-mini-sub">${input.sub}</div>` : "";
  return `<div class="stat-mini"><div class="stat-mini-label">${escapeHtml(input.label)}</div><div class="stat-mini-val${cls}">${input.value}</div>${sub}</div>`;
}

export function statRow(cards: string[]): string {
  if (cards.length === 0) return "";
  return `<section class="stat-row">${cards.join("")}</section>`;
}

/** 结论 / 风险提示块。`body` 已是 HTML，调用方负责转义。 */
export function callout(input: {
  title: string;
  body: string;
  tone?: Tone;
  icon?: keyof typeof icons;
  id?: string;
}): string {
  const modifier = input.tone && input.tone !== "neutral" ? ` callout-${input.tone}` : "";
  const icon = input.icon ? icons[input.icon] : "";
  const id = input.id ? ` id="${escapeHtml(input.id)}"` : "";
  return `<section${id} class="callout${modifier}"><div class="callout-title">${icon}<span>${escapeHtml(
    input.title,
  )}</span></div>${input.body}</section>`;
}

/** 带标题（与可选计数徽章）的章节卡片。 */
export function card(input: { id?: string; title: string; badge?: string; body: string }): string {
  const id = input.id ? ` id="${escapeHtml(input.id)}"` : "";
  const flag = input.badge ? `<span class="badge">${escapeHtml(input.badge)}</span>` : "";
  return `<section${id} class="card"><div class="card-header"><span>${escapeHtml(
    input.title,
  )}</span>${flag}</div><div class="card-body">${input.body}</div></section>`;
}

export function propGrid(pairs: { label: string; value: string }[]): string {
  if (pairs.length === 0) return "";
  const boxes = pairs
    .map(
      (pair) =>
        `<div class="property-box"><div class="property-label">${escapeHtml(
          pair.label,
        )}</div><div class="property-value">${pair.value}</div></div>`,
    )
    .join("");
  return `<div class="property-grid">${boxes}</div>`;
}

/** 原生折叠面板，无需 JavaScript。 */
export function detailsBlock(input: {
  summary: string;
  body: string;
  open?: boolean;
  aside?: string;
}): string {
  const open = input.open ? " open" : "";
  const aside = input.aside ?? "";
  return `<details${open}><summary><div>${escapeHtml(input.summary)}</div><div style="display:flex;align-items:center;gap:8px">${aside}${icons.chevron}</div></summary><div class="accordion-inner">${input.body}</div></details>`;
}

/** 数据表；`rows` 里每个单元格已是 HTML。 */
export function dataTable(input: {
  head: { label: string; numeric?: boolean }[];
  rows: string[][];
  empty?: string;
}): string {
  if (input.rows.length === 0) {
    return `<div class="empty">${escapeHtml(input.empty ?? "—")}</div>`;
  }
  const head = input.head
    .map((cell) => `<th${cell.numeric ? ' class="num"' : ""}>${escapeHtml(cell.label)}</th>`)
    .join("");
  const rows = input.rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, index) => `<td${input.head[index]?.numeric ? ' class="num"' : ""}>${cell}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ------------------------------------------------------------------ *
 * 整页骨架
 * ------------------------------------------------------------------ */

export interface AgentHtmlPage {
  title: string;
  /** `<html lang>`，缺省 zh-CN。 */
  lang?: string;
  /** 版头左侧内容（标题 + 徽章 + 元信息）。 */
  header: string;
  /** 版头右侧操作区；只放带 `data-action` 的按钮。 */
  actions?: string;
  /** 右侧悬浮目录；为空则不渲染目录栏。 */
  toc?: { id: string; label: string }[];
  /** 目录栏标题，缺省「目录导航」。 */
  tocTitle?: string;
  /** 页面主体。 */
  body: string;
  /** 可一键复制回 Agent 的 Markdown 原文。 */
  markdown?: string;
  /** 页面级样式微调。 */
  css?: string;
}

/**
 * 组装整页 HTML。
 *
 * 脚本只做三件事：跟随系统深浅色并允许手动切换、目录点击与滚动高亮、
 * 把 Markdown 复制回剪贴板。全部包在 IIFE 里，不污染全局。
 */
export function agentHtmlDocument(page: AgentHtmlPage): string {
  const toc = page.toc?.length
    ? `<aside class="toc-rail"><div class="toc-sticky"><div class="toc-title">${escapeHtml(
        page.tocTitle ?? "目录导航",
      )}</div><nav>${page.toc
        .map((item, index) => {
          const active = index === 0 ? " active" : "";
          return `<a class="toc-link${active}" href="#${escapeHtml(item.id)}">${escapeHtml(
            item.label,
          )}</a>`;
        })
        .join("")}</nav></div></aside>`
    : "";

  const ids = (page.toc ?? []).map((item) => item.id);
  const markdownSlot =
    typeof page.markdown === "string"
      ? `<script type="application/json" id="agent-html-markdown">${JSON.stringify(
          page.markdown,
        ).replace(/</g, "\\u003c")}</script>`
      : "";

  return `<!doctype html>
<html lang="${escapeHtml(page.lang ?? "zh-CN")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(page.title)}</title>
<style>${AGENT_HTML_CSS}${page.css ?? ""}</style>
</head>
<body>
<div class="layout-wrapper">
${toc}
<div class="container">
<header class="report-header">
<div class="report-title-box">${page.header}</div>
${page.actions ? `<div class="actions">${page.actions}</div>` : ""}
</header>
${page.body}
</div>
</div>
${markdownSlot}
<script>
(function () {
  var root = document.documentElement;
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    root.setAttribute("data-theme", "dark");
  }

  // 目录滚动高亮：只观察真实存在的章节，避免空引用报错。
  var links = Array.prototype.slice.call(document.querySelectorAll(".toc-link"));
  var ids = ${JSON.stringify(ids)};
  var targets = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
  var manual = false;
  var timer = null;

  function setActive(id) {
    links.forEach(function (link) {
      link.classList.toggle("active", link.getAttribute("href") === "#" + id);
    });
  }

  links.forEach(function (link) {
    link.addEventListener("click", function (event) {
      var id = link.getAttribute("href").slice(1);
      var target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      setActive(id);
      manual = true;
      clearTimeout(timer);
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      timer = setTimeout(function () { manual = false; }, 800);
    });
  });

  if (targets.length && "IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      if (manual) return;
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    }, { rootMargin: "-8% 0px -70% 0px" });
    targets.forEach(function (target) { observer.observe(target); });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (error) {}
    document.body.removeChild(area);
    return Promise.resolve();
  }

  document.addEventListener("click", function (event) {
    var trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    var action = trigger.getAttribute("data-action");

    if (action === "theme") {
      root.setAttribute("data-theme", root.getAttribute("data-theme") === "dark" ? "light" : "dark");
      return;
    }
    if (action === "print") {
      window.print();
      return;
    }
    if (action === "copy-md") {
      var slot = document.getElementById("agent-html-markdown");
      if (!slot) return;
      var markdown = "";
      try { markdown = JSON.parse(slot.textContent || '""'); } catch (error) { return; }
      var label = trigger.querySelector("span");
      var original = label ? label.textContent : "";
      copyText(markdown).then(function () {
        if (!label) return;
        label.textContent = trigger.getAttribute("data-copied") || "Copied";
        setTimeout(function () { label.textContent = original; }, 1600);
      });
    }
  });
})();
</script>
</body>
</html>`;
}
