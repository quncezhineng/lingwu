/**
 * 把研究产物（AgentArtifact）渲染成一张自包含的静态 HTML 页面字符串。
 *
 * 该字符串直接交给 HtmlPreview（Web 端 iframe `srcDoc` / 原生端 WebView）
 * 展示。外层页面只生成语义结构与内联样式；产物中的完整 HTML 文档会放进
 * 隔离的嵌套 iframe，并通过 CSP 禁止外部网络请求后执行页面自带的脚本。
 *
 * 排版遵循 shadcn 的 token convention / Typeset / Card / Table 约定：
 * - 语义色变量全部映射到 App `theme.ts` 的既有色板，主题配色不变；
 * - 信息层级固定为「要点速览 → 关键指标 → 报告摘要 → 明细数据」，
 *   让结论与数字先于正文出现；
 * - 无结构的长摘要按句拆段，标量字段收敛成指标卡，表格统一表头与间距。
 *
 * 财务产物（kind === "finance"）仍保留专属的收入/支出/结余统计卡与
 * 分类占比条形图；其余产物按数据结构通用渲染。
 */
import type { AgentArtifact } from "../../../packages/domain/src/agent";
import { assistantMarkdown } from "./assistant-markdown";
import { webFontFamily } from "./font-family";
import { activeLocaleTag, statusLabel, tr } from "./i18n/translate";
import { sandboxedDocument } from "./open-html-document";

/** 转义为 HTML 安全文本。 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHtmlDocument(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const source = value.trimStart();
  return /^<!doctype\s+html(?:\s|>)/i.test(source) || /^<html(?:\s|>)/i.test(source);
}

/** Whether an artifact contains a complete HTML document that can be rendered live. */
export function artifactHasHtmlPreview(artifact: AgentArtifact): boolean {
  return Object.values(artifact.data).some(isHtmlDocument);
}

/**
 * JSON 文本语法高亮：把 JSON.stringify 的输出拆成 key/string/number/boolean/null/
 * 标点五类 token，分别用 span 上色。输入必须是合法 JSON，内部文本仍全部转义。
 */
const JSON_TOKEN_RE =
  /("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}[\],:])/g;
function highlightJson(source: string): string {
  let out = "";
  let lastIndex = 0;
  for (const match of source.matchAll(JSON_TOKEN_RE)) {
    const index = match.index ?? 0;
    out += escapeHtml(source.slice(lastIndex, index));
    const [, str, num, bool, punc] = match;
    const token = str ?? num ?? bool ?? punc;
    let cls = "tok-punc";
    if (str) cls = source[index + match[0].length] === ":" ? "tok-key" : "tok-str";
    else if (num) cls = "tok-num";
    else if (bool) cls = "tok-bool";
    out += `<span class="${cls}">${escapeHtml(token)}</span>`;
    lastIndex = index + match[0].length;
  }
  return out + escapeHtml(source.slice(lastIndex));
}

/** 通用代码文本基础高亮：字符串、数字、URL 三类 token 上色，其余文本转义。 */
const CODE_TOKEN_RE = /("[^"]*"|'[^']*')|(-?\d+(?:\.\d+)?)|(https?:\/\/[^\s]+)/g;
function highlightCode(source: string): string {
  let out = "";
  let lastIndex = 0;
  for (const match of source.matchAll(CODE_TOKEN_RE)) {
    const index = match.index ?? 0;
    out += escapeHtml(source.slice(lastIndex, index));
    const [, str, num, url] = match;
    const token = str ?? num ?? url;
    const cls = str ? "tok-str" : num ? "tok-num" : "tok-url";
    out += `<span class="${cls}">${escapeHtml(token)}</span>`;
    lastIndex = index + match[0].length;
  }
  return out + escapeHtml(source.slice(lastIndex));
}

/**
 * 判断长文本是不是 Markdown 源码：多行且出现标题 / 引用 / 列表 / 代码围栏 / 表格标记。
 * 产物里的 `content`、`notes` 这类字段通常是模型写的 Markdown，需要排版而不是当成代码。
 */
const MARKDOWN_HINT_RE = /(^|\n)\s{0,3}(#{1,6}\s|>\s|[-*+]\s|\d+[.)]\s|```|\|)/;
function looksLikeMarkdown(value: string): boolean {
  return value.includes("\n") && MARKDOWN_HINT_RE.test(value);
}

/** 中文 / 英文句末标点，用于把「一整面文字」拆成可读段落。 */
const SENTENCE_END_RE = /([。！？；;!?])\s*/g;

/**
 * 摘要排版预处理：模型常把整篇研报塞进一个自然段，这里按句末标点拆成
 * 每两句一段；已经带 Markdown 结构（标题/列表/表格）的摘要保持原样，
 * 避免破坏作者自己的信息层级。
 */
function readableSummary(source: string): string {
  const trimmed = source.trim();
  if (!trimmed || MARKDOWN_HINT_RE.test(trimmed)) return trimmed;
  const sentences = trimmed
    .replace(SENTENCE_END_RE, "$1\n")
    .split("\n")
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length < 2) return trimmed;
  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(""));
  }
  return paragraphs.join("\n\n");
}

/** 结论性 / 动作性措辞：只有命中的句子才能进入「要点速览」。 */
const TAKEAWAY_HINT_RE =
  /(不给|建议|结论|风险|预警|不构成|意味着|表明|判断|复核|上限|关注|尚未|无法|排除)/;

/**
 * 「要点速览」：对没有 Markdown 结构的长摘要做保守的原句摘取。
 * 只取长度适中且含结论词的句子（数字仅用于同分排序），按原文顺序保留前三条；
 * 命中不足两条时不展示该区块，避免把大段数据细节当成重点。
 */
function extractTakeaways(summary: string): string[] {
  const trimmed = summary.trim();
  if (!trimmed || MARKDOWN_HINT_RE.test(trimmed)) return [];
  const sentences = trimmed
    .replace(SENTENCE_END_RE, "$1\n")
    .split("\n")
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12 && sentence.length <= 100);
  if (sentences.length < 3) return [];
  const selected = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: (TAKEAWAY_HINT_RE.test(sentence) ? 10 : 0) + (/\d/.test(sentence) ? 1 : 0),
    }))
    .filter((item) => item.score >= 10)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index);
  return selected.length >= 2 ? selected.map((item) => item.sentence) : [];
}

/** 要点里可能出现 `**加粗**`，走一次行内 Markdown（html:false，输出安全）。 */
function inlineMarkdown(source: string): string {
  return assistantMarkdown
    .render(source)
    .trim()
    .replace(/^<p>/, "")
    .replace(/<\/p>$/, "");
}

/**
 * 标量值/对象 -> 展示 HTML。
 *
 * 默认（块级）：
 * - 多行的 Markdown 文本按正文排版渲染（标题、列表、引用、表格、代码块）；
 * - 其它多行或超长字符串（代码/JSON）用深色代码块 + 基础语法高亮；
 * - 对象/数组用 JSON 代码块 + 语法高亮。
 * `inline = true` 时（表格单元格等场景）一律走转义后的行内纯文本，避免嵌套撑坏布局。
 */
function text(value: unknown, inline = false): string {
  if (typeof value === "string") {
    if (!inline && (value.includes("\n") || value.length > 120)) {
      return looksLikeMarkdown(value)
        ? `<div class="markdown">${assistantMarkdown.render(value)}</div>`
        : `<pre class="code">${highlightCode(value)}</pre>`;
    }
    return escapeHtml(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return escapeHtml(value.toLocaleString(activeLocaleTag(), { maximumFractionDigits: 2 }));
  }
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (value === null || value === undefined) return "—";
  const json = JSON.stringify(value, null, 2);
  return inline
    ? escapeHtml(json)
    : `<pre class="code" data-lang="json">${highlightJson(json)}</pre>`;
}

/** 领域字段名（下划线分隔）-> 人类可读标题。 */
function label(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return escapeHtml(spaced.charAt(0).toUpperCase() + spaced.slice(1));
}

/** 数字列右对齐：纯数字 / 百分比 / 带常见单位的数值。 */
function isNumeric(value: unknown): boolean {
  return (
    typeof value === "number" ||
    (typeof value === "string" && /^[-+]?[\d,.%万亿元倍]+\s*$/.test(value.trim()))
  );
}

/** shadcn Table：表头、斑马线、数值列右对齐，外层容器负责窄屏横向滚动。 */
function renderTable(rows: Record<string, unknown>[]): string {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const numericKeys = new Set(
    keys.filter((key) => rows.every((row) => row[key] === undefined || isNumeric(row[key]))),
  );
  const align = (key: string) => (numericKeys.has(key) ? ' class="numeric"' : "");
  return `<div class="typeset-scroll"><table>
    <thead><tr>${keys.map((key) => `<th${align(key)}>${label(key)}</th>`).join("")}</tr></thead>
    <tbody>${rows
      .map(
        (row) =>
          `<tr>${keys.map((key) => `<td${align(key)}>${renderCell(row[key])}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody>
  </table></div>`;
}

/** 键值明细：两列定义列表，带 1px 行分隔，替代原来散落的裸 `<dl>`。 */
function renderKeyValue(value: Record<string, unknown>): string {
  return `<dl class="kv">${Object.entries(value)
    .map(([key, item]) => `<dt>${label(key)}</dt><dd>${renderCell(item)}</dd>`)
    .join("")}</dl>`;
}

/** 递归渲染一个任意值：数组 -> 表格/列表，对象 -> 键值表，标量 -> 文本。 */
function renderValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return `<span class="empty">${tr("agent.artifactEmpty")}</span>`;
    const samples = value.slice(0, 100);
    if (samples.every(isRecord)) {
      return `${renderTable(samples)}${
        value.length > 100
          ? `<p class="note">${tr("agent.artifactTruncated", { count: value.length - 100 })}</p>`
          : ""
      }`;
    }
    return `<ul class="bullet-list">${samples.map((item) => `<li>${renderValue(item)}</li>`).join("")}</ul>`;
  }
  if (isRecord(value)) return renderKeyValue(value);
  return text(value);
}

/** 表格单元格内联渲染：记录展开为紧凑键值串，避免表格里再嵌整张表。 */
function renderCell(value: unknown): string {
  if (Array.isArray(value)) return value.map(renderCell).join(", ");
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${label(key)}：${renderCell(item)}`)
      .join(" · ");
  }
  return text(value, true);
}

/** Render a complete HTML artifact inside an isolated live-preview frame. */
function htmlPreview(source: string, title: string): string {
  return `
    <div class="html-document">
      <iframe
        class="html-preview-frame"
        title="${escapeHtml(title)}"
        srcdoc="${escapeHtml(sandboxedDocument(source))}"
        sandbox="allow-scripts allow-forms allow-modals allow-popups"
        referrerpolicy="no-referrer"
      ></iframe>
      <details class="source">
        <summary>${escapeHtml(tr("agent.artifactViewSource"))}</summary>
        <pre class="code" data-lang="html">${highlightCode(source)}</pre>
      </details>
    </div>`;
}

/** 金额（带货币样式的数字文本）。 */
function amount(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return text(value);
  return number.toLocaleString(activeLocaleTag(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 财务产物专属：收入/支出/结余统计卡 + 分类占比条形图 + 交易明细表。 */
function renderFinance(artifact: AgentArtifact): string {
  const data = artifact.data;
  const stat = (labelKey: string, value: unknown, accent = "") => `
      <div class="stat ${accent}">
        <div class="stat-label">${escapeHtml(tr(labelKey))}</div>
        <div class="stat-value">${amount(value)}</div>
      </div>`;
  const cards = [
    stat("agent.financeIncome", data.income),
    stat("agent.financeSpending", data.spending),
    stat("agent.financeRemaining", data.saved, "positive"),
  ].join("");
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const spending = Math.max(1, Number(data.spending) || 1);
  const bars = categories
    .map((category) => {
      const row = isRecord(category) ? category : {};
      const rowValue = Number(row.amount) || 0;
      return `
        <div class="bar-row">
          <span class="bar-name">${text(row.name ?? "—")}</span>
          <div class="bar"><div class="bar-fill" style="width:${Math.min(100, (rowValue / spending) * 100)}%"></div></div>
          <span class="bar-value">${amount(rowValue)}</span>
        </div>`;
    })
    .join("");
  const transactions = Array.isArray(data.transactions) ? data.transactions : [];
  return `
    <section class="stats">${cards}</section>
    ${bars ? `<section class="block"><h3>${escapeHtml(tr("agent.whereMoneyWent"))}</h3>${bars}</section>` : ""}
    <section class="block"><h3>${escapeHtml(tr("agent.viewTransactions"))}</h3>${renderValue(transactions)}</section>`;
}

/**
 * 洞察三段在详情浮层顶部已有独立展示（依据 / 还不能判断什么 / 何时回看），
 * 产物 HTML 里再画一遍会重复，这里统一排除这些数据键（含别名）。
 */
const INSIGHT_SECTION_KEYS = new Set([
  "basis",
  "evidence",
  "evidenceSummary",
  "limits",
  "caveats",
  "unknowns",
  "revisit",
  "reviewAt",
  "revisitAt",
]);

/** 适合作为「关键指标」的标量：数值或一行短文本，且不是 Markdown / HTML 文档。 */
function isMetric(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  return (
    value.length <= 48 &&
    !value.includes("\n") &&
    !MARKDOWN_HINT_RE.test(value) &&
    !isHtmlDocument(value)
  );
}

/** 指标卡：把散落的 `pb: 1.16` 这类顶层标量收成大数字，超过 6 个归入键值表。 */
function renderMetrics(metrics: Array<[string, unknown]>): string {
  if (metrics.length === 0) return "";
  const cards = metrics
    .slice(0, 6)
    .map(
      ([key, value]) => `
      <div class="metric">
        <div class="metric-label">${label(key)}</div>
        <div class="metric-value${typeof value === "number" ? " numeric" : ""}">${text(value, true)}</div>
      </div>`,
    )
    .join("");
  const rest = metrics.slice(6);
  const more = rest.length
    ? `<section class="block"><h3>${escapeHtml(tr("agent.artifactMoreMetrics"))}</h3>${renderKeyValue(
        Object.fromEntries(rest),
      )}</section>`
    : "";
  return `<section class="report-section" aria-labelledby="metrics-heading">
    <h2 class="section-title" id="metrics-heading">${escapeHtml(tr("agent.artifactKeyMetrics"))}</h2>
    <div class="metrics">${cards}</div>${more}
  </section>`;
}

/**
 * 通用产物渲染：拆成「关键指标」与「明细数据」两部分，由页面按顺序插入，
 * 保证数字与结论出现在长摘要之前。
 */
function splitGeneric(artifact: AgentArtifact): { metrics: string; details: string } {
  const metrics: Array<[string, unknown]> = [];
  const blocks: string[] = [];
  for (const [key, value] of Object.entries(artifact.data)) {
    if (INSIGHT_SECTION_KEYS.has(key)) continue;
    if (isMetric(value)) {
      metrics.push([key, value]);
      continue;
    }
    const body = isHtmlDocument(value) ? htmlPreview(value, artifact.title) : renderValue(value);
    blocks.push(`<section class="block"><h3>${label(key)}</h3>${body}</section>`);
  }
  const details = blocks.length
    ? `<section class="report-section" aria-labelledby="details-heading">
        <h2 class="section-title" id="details-heading">${escapeHtml(tr("agent.artifactDetailsHeading"))}</h2>
        ${blocks.join("")}
      </section>`
    : "";
  return { metrics: renderMetrics(metrics), details };
}

/** 需要展示合规声明的产物类型。 */
const DISCLAIMER_KINDS = new Set(["report", "research_report", "market_briefing", "finance"]);

/** 生成研究产物的完整 HTML 文档。 */
export function renderArtifactHtml(artifact: AgentArtifact): string {
  const kind = statusLabel(artifact.kind);
  const createdAt = new Date(artifact.createdAt);
  const dateText = Number.isNaN(createdAt.getTime())
    ? "—"
    : createdAt.toLocaleString(activeLocaleTag(), {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
  const summary = readableSummary(artifact.summary);
  const takeaways = extractTakeaways(artifact.summary);
  const highlights = takeaways.length
    ? `<section class="report-section" aria-labelledby="highlights-heading">
        <h2 class="section-title" id="highlights-heading">${escapeHtml(tr("agent.artifactHighlights"))}</h2>
        <ol class="takeaways">${takeaways.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ol>
      </section>`
    : "";
  const summaryBlock = summary.trim()
    ? `<section class="report-section" aria-labelledby="summary-heading">
        <h2 class="section-title" id="summary-heading">${escapeHtml(tr("agent.artifactSummaryHeading"))}</h2>
        <section class="summary markdown">${assistantMarkdown.render(summary)}</section>
      </section>`
    : "";
  const { metrics, details } =
    artifact.kind === "finance"
      ? { metrics: "", details: renderFinance(artifact) }
      : splitGeneric(artifact);
  const disclaimer = DISCLAIMER_KINDS.has(artifact.kind)
    ? `<footer class="disclaimer">${escapeHtml(tr("ui.disclaimer"))}</footer>`
    : "";
  return `<!DOCTYPE html>
<html lang="${activeLocaleTag()}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(artifact.title)}</title>
<style>
  :root {
    color-scheme: light;
    /* 全部映射到 App theme.ts 的既有色板，报告页不引入新颜色 */
    --background: #F8F8F8;
    --foreground: #303030;
    --card: #FFFFFF;
    --muted: #F6F6F6;
    --muted-foreground: #696969;
    --accent: #F4F4F4;
    --primary: #3A83F7;
    --primary-strong: #245FC4;
    --primary-soft: #EDF3FF;
    --accent-line: #D9E5FA;
    --border: #E6E6E6;
    --subtle-border: #EFEFEF;
    --ring: #3A83F7;
    --radius: 8px;
    /* shadcn Typeset 的三个节奏变量 */
    --typeset-size: 14px;
    --typeset-leading: 1.85;
    --typeset-flow: 1.1em;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background: var(--card);
    color: var(--foreground);
    font: var(--typeset-size)/var(--typeset-leading) ${webFontFamily};
  }
  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  /* 内容区与弹层融为一体，不再「白卡套白卡」 */
  .page { max-width: 860px; margin: 0 auto; padding: 20px 28px 40px; }
  .report-head { display: flex; align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
  .chip {
    display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px;
    background: var(--primary-soft); color: var(--primary-strong);
    font-size: 11px; font-weight: 600; line-height: 18px;
  }
  .meta { color: var(--muted-foreground); font-size: 12px; }
  .report-section { margin-top: 24px; }
  .section-title {
    display: flex; align-items: center; gap: 8px; margin: 0 0 12px; padding-bottom: 8px;
    border-bottom: 1px solid var(--border); font-size: 14px; font-weight: 600; line-height: 1.5;
  }
  /* 要点速览：shadcn Alert / Callout 的轻量形态 */
  .takeaways {
    margin: 0; padding: 8px 12px; list-style: none; counter-reset: takeaway;
    background: var(--primary-soft); border: 1px solid var(--accent-line); border-radius: var(--radius);
  }
  .takeaways li {
    position: relative; counter-increment: takeaway; padding: 5px 0 5px 26px;
    font-size: 13px; line-height: 1.7;
  }
  .takeaways li + li { border-top: 1px solid var(--accent-line); }
  .takeaways li::before {
    content: counter(takeaway); position: absolute; left: 0; top: 8px;
    width: 17px; height: 17px; border-radius: 50%; background: var(--card);
    color: var(--primary-strong); font-size: 10px; font-weight: 600;
    line-height: 17px; text-align: center;
  }
  /* 关键指标：shadcn Card 组合，数字用 tabular-nums 对齐 */
  .metrics { display: flex; flex-wrap: wrap; gap: 10px; }
  .metric {
    flex: 1 1 150px; max-width: 240px; min-width: 140px;
    padding: 12px 14px; background: var(--card); border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .metric-label { color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
  .metric-value {
    margin-top: 6px; font-size: 20px; line-height: 1.3; font-weight: 600;
    font-variant-numeric: tabular-nums; overflow-wrap: anywhere;
  }
  .metric-value.numeric { color: var(--primary-strong); }
  /* 报告摘要：Typeset 节奏 + 首段 lead */
  .summary { max-width: 72ch; color: var(--foreground); font-size: var(--typeset-size); }
  .summary > :first-child, .markdown > :first-child { margin-top: 0; }
  .summary > :last-child, .markdown > :last-child { margin-bottom: 0; }
  .summary > p:first-child { font-size: 15px; font-weight: 500; }
  .summary h1, .summary h2, .summary h3, .markdown h1, .markdown h2, .markdown h3,
  .summary h4, .markdown h4 { color: var(--foreground); line-height: 1.5; margin: var(--typeset-flow) 0 8px; }
  .summary h1, .markdown h1 { font-size: 19px; }
  .summary h2, .markdown h2 { font-size: 16px; }
  .summary h3, .markdown h3 { font-size: 14px; }
  .summary p, .markdown p, .summary ul, .summary ol, .markdown ul, .markdown ol {
    margin: 0 0 var(--typeset-flow);
  }
  .summary ul, .summary ol, .markdown ul, .markdown ol { padding-left: 22px; }
  .summary li + li, .markdown li + li { margin-top: 4px; }
  .summary a, .markdown a { color: var(--primary-strong); }
  .summary blockquote, .markdown blockquote {
    margin: var(--typeset-flow) 0; padding: 2px 0 2px 14px;
    border-left: 2px solid var(--border); color: var(--muted-foreground);
  }
  .summary code, .markdown code {
    padding: 1px 5px; border-radius: 4px; background: var(--muted); color: var(--primary-strong);
    font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .summary pre, .markdown pre {
    margin: var(--typeset-flow) 0; padding: 12px 14px; border-radius: var(--radius);
    background: #1F2430; color: #D7DAE0; overflow: auto;
  }
  .summary pre code, .markdown pre code { padding: 0; background: transparent; color: inherit; }
  .markdown { color: var(--foreground); }
  .markdown hr { border: 0; border-top: 1px solid var(--border); margin: var(--typeset-flow) 0; }
  .markdown strong { font-weight: 600; }
  .markdown img { max-width: 100%; height: auto; border-radius: var(--radius); }
  /* 明细数据：Card 式分区 + shadcn Table */
  .block { margin-top: 20px; }
  .block h3 { margin: 0 0 10px; font-size: 13px; font-weight: 600; }
  .typeset-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border); border-radius: var(--radius); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 9px 12px; text-align: left; vertical-align: top; }
  th {
    background: var(--muted); color: var(--muted-foreground); font-size: 11px; font-weight: 600;
    letter-spacing: .04em; white-space: nowrap; border-bottom: 1px solid var(--border);
  }
  td { border-bottom: 1px solid var(--subtle-border); }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: var(--muted); }
  th.numeric, td.numeric { text-align: right; font-variant-numeric: tabular-nums; }
  dl.kv { display: grid; grid-template-columns: minmax(120px, 32%) 1fr; margin: 0; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  dt, dd { padding: 9px 12px; border-bottom: 1px solid var(--subtle-border); }
  dt { color: var(--muted-foreground); font-size: 12px; font-weight: 600; }
  dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
  dl.kv > dt:nth-last-of-type(1), dl.kv > dd:nth-last-of-type(1) { border-bottom: 0; }
  ul.bullet-list { margin: 0; padding-left: 20px; }
  .bullet-list li + li { margin-top: 6px; }
  .empty, .note { color: var(--muted-foreground); font-size: 12px; }
  .note { margin: 8px 0 0; }
  /* 财务产物沿用统计卡与占比条，颜色与新的语义层一致 */
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .stat { padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--muted); }
  .stat-label { color: var(--muted-foreground); font-size: 11px; }
  .stat-value { margin-top: 4px; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .stat.positive .stat-value { color: #217D62; }
  .bar-row { display: grid; grid-template-columns: minmax(90px, 22%) 1fr 90px; align-items: center; gap: 12px; margin: 8px 0; }
  .bar-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { height: 8px; border-radius: 6px; background: var(--accent); overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 6px; background: var(--primary); }
  .bar-value { font-size: 13px; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
  /* 完整 HTML 产物与代码块的隔离预览 */
  .html-document { display: grid; gap: 10px; }
  .html-preview-frame { display: block; width: 100%; height: min(78vh, 860px); min-height: 520px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); }
  .source summary { width: fit-content; cursor: pointer; color: var(--muted-foreground); font-size: 12px; padding: 2px 0; user-select: none; }
  .source[open] summary { margin-bottom: 8px; }
  .source pre.code { max-height: 420px; }
  pre { margin: 0; padding: 10px 12px; background: var(--muted); border-radius: var(--radius); overflow: auto; font-size: 12px; }
  pre.code { margin: 0; padding: 12px 14px; background: #1F2430; color: #D7DAE0; border-radius: var(--radius); overflow: auto; font: 12px/1.65 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  pre.code .tok-key { color: #C792EA; }
  pre.code .tok-str { color: #C3E88D; }
  pre.code .tok-num { color: #F78C6C; }
  pre.code .tok-bool { color: #82AAFF; }
  pre.code .tok-punc { color: #7A8189; }
  pre.code .tok-url { color: #82AAFF; text-decoration: underline; }
  .disclaimer { margin-top: 32px; padding-top: 12px; border-top: 1px solid var(--border); color: var(--muted-foreground); font-size: 11px; }
  @media (max-width: 560px) {
    .page { padding: 16px 16px 32px; }
    .metric { flex-basis: calc(50% - 5px); max-width: none; min-width: 0; }
    .stats { grid-template-columns: 1fr; }
    .bar-row { grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; }
    .bar-value { grid-column: 2; text-align: left; }
    dl.kv { grid-template-columns: minmax(96px, 38%) 1fr; }
    .html-preview-frame { min-height: 440px; height: 68vh; }
  }
  @media (prefers-reduced-motion: reduce) {
    * { scroll-behavior: auto !important; transition: none !important; animation: none !important; }
  }
</style>
</head>
<body>
  <main class="page" aria-label="${escapeHtml(artifact.title)}">
    <header class="report-head">
      <span class="chip">${escapeHtml(kind)}</span>
      <time class="meta" datetime="${escapeHtml(artifact.createdAt)}">${escapeHtml(dateText)}</time>
      <h1 class="sr-only">${escapeHtml(artifact.title)}</h1>
    </header>
    ${highlights}
    ${metrics}
    ${summaryBlock}
    ${details}
    ${disclaimer}
  </main>
</body>
</html>`;
}
