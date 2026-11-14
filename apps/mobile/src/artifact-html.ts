/**
 * 把研究产物（AgentArtifact）渲染成一张自包含的静态 HTML 页面字符串。
 *
 * 该字符串直接交给 HtmlPreview（Web 端 iframe `srcDoc` / 原生端 WebView）
 * 展示。外层页面只生成语义结构与内联样式；产物中的完整 HTML 文档会放进
 * 隔离的嵌套 iframe，并通过 CSP 禁止外部网络请求后执行页面自带的脚本。
 *
 * 版式按「一份研究报告」来组织，而不是「一堆 JSON 字段」：
 * - 版头（masthead）只放类型、标的、日期这类元信息，标题交给外层弹层；
 * - 正文按章节推进：要点速览 → 报告摘要 → 关键指标 → 各数据章节，
 *   章节带 01/02/03 编号与锚点，超过三节时生成「本页目录」；
 * - 章节标题用衬线体、数据用无衬线体 + tabular-nums，正文 15px/1.75；
 * - 键值对只用于「纯标量对象」，含嵌套结构的一律拆成独立章节，
 *   避免把表格压进 68% 宽的键值列里。
 *
 * 财务产物（kind === "finance"）仍保留专属的收入/支出/结余统计卡与
 * 分类占比条形图；其余产物按数据结构通用渲染。
 */
import type { AgentArtifact } from "../../../packages/domain/src/agent";
import { assistantMarkdown } from "./assistant-markdown";
import { webFontFamily } from "./font-family";
import type { TranslationKey } from "./i18n/locales/en";
import { activeLocaleTag, getActiveLocale, statusLabel, tr } from "./i18n/translate";
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

/**
 * 长字符串是不是自然语言段落。
 *
 * 模型写的 `company_overview` 常常是一百多字的单段中文，旧实现按长度阈值把它
 * 塞进深色代码块；这里用「有中文 / 有句末标点 / 词数够多」三个信号判断散文，
 * 只有真正像代码或机器输出的才留给 `<pre>`。
 */
function looksLikeProse(value: string): boolean {
  if (/[\u4e00-\u9fff]/.test(value)) return true;
  if (/[.!?。！？]["”'）)]?\s/.test(value)) return true;
  return value.split(/\s+/).filter(Boolean).length >= 24;
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
 * 已知领域字段的中英文标签。
 *
 * 产物字段名来自模型，无法穷举；这里只覆盖高频字段，其余走 `humanize()` 兜底，
 * 保证界面上出现的是「市盈率 / P/E」而不是「Pe」，也不会漏出下划线。
 */
const DOMAIN_LABELS: Record<string, { zh: string; en: string }> = {
  // 标的与行情
  name: { zh: "名称", en: "Name" },
  code: { zh: "代码", en: "Code" },
  symbol: { zh: "代码", en: "Symbol" },
  symbol_code: { zh: "标的代码", en: "Symbol" },
  symbolName: { zh: "标的", en: "Symbol" },
  price: { zh: "最新价", en: "Price" },
  change: { zh: "涨跌", en: "Change" },
  changePercent: { zh: "涨跌幅", en: "Change %" },
  pct_change: { zh: "涨跌幅", en: "Change %" },
  close: { zh: "收盘价", en: "Close" },
  open: { zh: "开盘价", en: "Open" },
  high: { zh: "最高价", en: "High" },
  low: { zh: "最低价", en: "Low" },
  mid: { zh: "中位", en: "Mid" },
  volume: { zh: "成交量", en: "Volume" },
  amount: { zh: "金额", en: "Amount" },
  turnover: { zh: "成交额", en: "Turnover" },
  currency: { zh: "币种", en: "Currency" },
  // 估值与财务
  pe: { zh: "市盈率", en: "P/E" },
  pb: { zh: "市净率", en: "P/B" },
  ps: { zh: "市销率", en: "P/S" },
  roe: { zh: "净资产收益率", en: "ROE" },
  eps: { zh: "每股收益", en: "EPS" },
  marketCap: { zh: "总市值", en: "Market cap" },
  market_cap: { zh: "总市值", en: "Market cap" },
  revenue: { zh: "营业收入", en: "Revenue" },
  netIncome: { zh: "净利润", en: "Net income" },
  net_income: { zh: "净利润", en: "Net income" },
  revenueGrowth: { zh: "营收增长", en: "Revenue growth" },
  revenue_growth: { zh: "营收增长", en: "Revenue growth" },
  netMargin: { zh: "净利率", en: "Net margin" },
  net_margin: { zh: "净利率", en: "Net margin" },
  grossMargin: { zh: "毛利率", en: "Gross margin" },
  freeCashFlow: { zh: "自由现金流", en: "Free cash flow" },
  dividend: { zh: "分红", en: "Dividend" },
  income: { zh: "收入", en: "Income" },
  spending: { zh: "支出", en: "Spending" },
  saved: { zh: "结余", en: "Saved" },
  // 章节与结构
  sections: { zh: "正文", en: "Sections" },
  company_overview: { zh: "公司概览", en: "Company overview" },
  financials: { zh: "财务概览", en: "Financials" },
  news: { zh: "相关资讯", en: "News" },
  peer_comparison: { zh: "同业对比", en: "Peer comparison" },
  peers: { zh: "同业对比", en: "Peers" },
  valuation: { zh: "估值参考", en: "Valuation" },
  risks: { zh: "风险提示", en: "Risks" },
  market_data: { zh: "市场数据", en: "Market data" },
  indices: { zh: "主要指数", en: "Indices" },
  symbol_updates: { zh: "自选异动", en: "Watchlist moves" },
  transactions: { zh: "交易明细", en: "Transactions" },
  merchant: { zh: "商户", en: "Merchant" },
  payee: { zh: "收款方", en: "Payee" },
  categories: { zh: "分类占比", en: "Categories" },
  period: { zh: "统计区间", en: "Period" },
  // 通用字段
  html: { zh: "HTML 页面", en: "HTML page" },
  title: { zh: "标题", en: "Title" },
  summary: { zh: "要点", en: "Summary" },
  content: { zh: "正文", en: "Body" },
  note: { zh: "说明", en: "Note" },
  notes: { zh: "备注", en: "Notes" },
  method: { zh: "方法", en: "Method" },
  source: { zh: "来源", en: "Source" },
  sources: { zh: "来源", en: "Sources" },
  url: { zh: "链接", en: "Link" },
  link: { zh: "链接", en: "Link" },
  date: { zh: "日期", en: "Date" },
  as_of: { zh: "数据时间", en: "As of" },
  published_at: { zh: "发布时间", en: "Published" },
  author: { zh: "作者", en: "Author" },
  tags: { zh: "标签", en: "Tags" },
  basis: { zh: "依据", en: "Basis" },
  limits: { zh: "局限", en: "Limits" },
  revisit: { zh: "回看", en: "Revisit" },
  count: { zh: "数量", en: "Count" },
  takeaways: { zh: "要点", en: "Takeaways" },
  conclusion: { zh: "结论", en: "Conclusion" },
  takeaway: { zh: "结论", en: "Takeaway" },
  plain: { zh: "通俗解释", en: "In plain terms" },
  score: { zh: "评分", en: "Score" },
  category: { zh: "分类", en: "Category" },
  status: { zh: "状态", en: "Status" },
};

/** 下划线 / 驼峰 -> 可读词形，并保留全大写缩写（PE、ROE、URL）。 */
function humanize(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced
    .split(" ")
    .map((word) =>
      /^[A-Z0-9]{2,}$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/** 字段名 -> 当前语言的展示标签（不含转义）。 */
function labelText(key: string): string {
  const hit = DOMAIN_LABELS[key] ?? DOMAIN_LABELS[key.toLowerCase()];
  if (hit) return getActiveLocale() === "zh-Hans" ? hit.zh : hit.en;
  return humanize(key);
}

/** 字段名 -> 已转义的展示标签。 */
function label(key: string): string {
  return escapeHtml(labelText(key));
}

/** 技术性字段：属于记录自身元数据，不进正文，也不当业务指标。 */
const TECHNICAL_KEYS = new Set([
  "id",
  "ids",
  "owner",
  "user_id",
  "userId",
  "task_id",
  "taskId",
  "artifact_id",
  "goalId",
  "goal_id",
  "kind",
  "type",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "generated_at",
  "generatedAt",
  "title",
  "symbol_code",
  "date",
]);

/** 数字列右对齐：纯数字 / 百分比 / 带常见单位的数值。 */
function isNumeric(value: unknown): boolean {
  return (
    typeof value === "number" ||
    (typeof value === "string" && /^[-+]?[\d,.%万亿元倍]+\s*$/.test(value.trim()))
  );
}

/** 表格：表头、斑马线已去除（改用细行线）、数值列右对齐，外层负责窄屏横向滚动。 */
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

/** 键值明细：两列定义列表，带 1px 行分隔；数值行右对齐便于纵向比对。 */
function renderKeyValue(value: Record<string, unknown>): string {
  return `<dl class="kv">${Object.entries(value)
    .map(
      ([key, item]) =>
        `<dt>${label(key)}</dt><dd${isNumeric(item) ? ' class="num"' : ""}>${renderCell(item)}</dd>`,
    )
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

/** 单元格里的裸链接：压成「域名/路径」短文本，完整地址放 title 供悬停查看。 */
function cellString(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const display = trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    const short = display.length > 46 ? `${display.slice(0, 46)}…` : display;
    return `<span class="url" title="${escapeHtml(trimmed)}">${escapeHtml(short)}</span>`;
  }
  return text(value, true);
}

/** 表格单元格内联渲染：记录展开为紧凑键值串，避免表格里再嵌整张表。 */
function renderCell(value: unknown): string {
  if (Array.isArray(value)) return value.map(renderCell).join("、");
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${label(key)}：${renderCell(item)}`)
      .join(" · ");
  }
  if (typeof value === "string") return cellString(value);
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

/**
 * 标量值/对象 -> 展示 HTML。
 *
 * - 多行的 Markdown 文本按正文排版渲染（标题、列表、引用、表格、代码块）；
 * - 长自然语言段落同样按正文渲染，不再因为「太长」被塞进代码块；
 * - 真正的多行机器输出（代码 / JSON）用深色代码块 + 基础语法高亮；
 * - `inline = true` 时（表格单元格等场景）一律走转义后的行内纯文本。
 */
function text(value: unknown, inline = false): string {
  if (typeof value === "string") {
    if (!inline && (value.includes("\n") || value.length > 120)) {
      if (looksLikeMarkdown(value) || looksLikeProse(value)) {
        return `<div class="markdown">${assistantMarkdown.render(value)}</div>`;
      }
      return `<pre class="code">${highlightCode(value)}</pre>`;
    }
    return escapeHtml(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return escapeHtml(
      value.toLocaleString(activeLocaleTag(), {
        maximumFractionDigits: 2,
      }),
    );
  }
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (value === null || value === undefined) return "—";
  const json = JSON.stringify(value, null, 2);
  return inline
    ? escapeHtml(json)
    : `<pre class="code" data-lang="json">${highlightJson(json)}</pre>`;
}

/**
 * 财务产物专属内容：统计区间 + 分类占比条形图 + 交易明细表。
 *
 * 收入/支出/结余三张卡由「关键指标」统一渲染，这里不再重复画一遍。
 */
function renderFinance(artifact: AgentArtifact): string {
  const data = artifact.data;
  const period = isRecord(data.period) ? data.period : undefined;
  const periodText = period
    ? [period.from, period.to]
        .filter((item): item is string => typeof item === "string")
        .map((item) => formatDay(item) || formatStamp(item) || item)
        .join(" – ")
    : "";
  const meta = periodText
    ? `<div class="meta-row"><span class="meta-item"><span class="meta-key">${escapeHtml(
        labelText("period"),
      )}</span>${escapeHtml(periodText)}</span></div>`
    : "";
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
    ${meta}
    ${bars ? `<section class="block"><h3 class="block-title">${escapeHtml(tr("agent.whereMoneyWent"))}</h3>${bars}</section>` : ""}
    <section class="block"><h3 class="block-title">${escapeHtml(tr("agent.viewTransactions"))}</h3>${renderValue(transactions)}</section>`;
}

/**
 * 洞察三段在报告里以「依据与局限」附录的形式出现（依据 / 还不能判断什么 /
 * 何时回看），正文不再重复渲染这些数据键。
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

/** 正文型字段：即使是短文本也属于内容，不能收进「关键指标」。 */
const CONTENT_KEYS = new Set([
  "content",
  "body",
  "markdown",
  "text",
  "description",
  "detail",
  "details",
  "notes",
  "note",
  "summary",
  "plain",
  "plainExplanation",
  "basis",
  "limits",
  "revisit",
  "conclusion",
  "takeaway",
  "verdict",
  "comment",
  "overview",
]);

/** 适合作为「关键指标」的标量：数值或一行短文本，且不是 Markdown / HTML 文档。 */
function isMetric(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  return (
    value.length <= 48 &&
    !value.includes("\n") &&
    !/[。！？]$/.test(value.trim()) &&
    !MARKDOWN_HINT_RE.test(value) &&
    !isHtmlDocument(value)
  );
}

/** 记录里是否还有嵌套结构（决定它该展开成章节，还是收成键值表）。 */
function hasNested(value: Record<string, unknown>): boolean {
  return Object.values(value).some((item) => Array.isArray(item) || isRecord(item));
}

/**
 * 正文首行若是 `# 标题`，且与产物标题重复，则去掉这一行。
 * 弹层头部 / 导出文档已经有一次标题，正文里的同名 H1 只会造成视觉重复。
 */
function stripDuplicateTitle(
  data: Record<string, unknown>,
  title: string,
): Record<string, unknown> {
  const wanted = title.trim();
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      const match = /^#\s+(.+?)\s*\n+/.exec(value);
      if (match && match[1].trim() === wanted) {
        cleaned[key] = value.slice(match[0].length);
        continue;
      }
    }
    cleaned[key] = value;
  }
  return cleaned;
}

/** 时间类字段：值是可解析的日期字符串时按时间排版，而不是甩一串 ISO 原文。 */
const DATE_KEYS = new Set([
  "as_of",
  "asOf",
  "date",
  "published_at",
  "publishedAt",
  "generated_at",
  "generatedAt",
  "created_at",
  "createdAt",
  "updated_at",
  "updatedAt",
  "review_at",
  "revisitAt",
  "period_start",
  "period_end",
]);

/** 短标量：可以并进元信息行，不值得单独占一节。带句读的文字仍算正文。 */
function isShortScalar(value: unknown): boolean {
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length <= 40 && !trimmed.includes("\n") && !/[。，、；：！？“”]/.test(trimmed);
}

/** 纯命名空间字段：子项各自成节，父级标题本身没有信息量。 */
const NAMESPACE_KEYS = new Set(["sections", "data", "payload", "result", "report", "details"]);

/** 标量 -> 展示 HTML（时间字段格式化，其余走通用文本）。 */
function scalarHtml(key: string, value: unknown): string {
  if (typeof value === "string" && DATE_KEYS.has(key)) {
    const stamp = formatDay(value) || formatStamp(value);
    if (stamp) return `<time datetime="${escapeHtml(value)}">${escapeHtml(stamp)}</time>`;
  }
  return isShortScalar(value) ? cellString(String(value)) : text(value);
}

/**
 * 一段正文内容：标题 + 内容。
 *
 * `html` 用于已经在别处渲染好的片段（要点速览、摘要、指标格），`value` 保留
 * 原始数据值，让 HTML 与 Markdown 两条导出路径共用同一份章节结构。
 */
interface Section {
  id: string;
  title: string;
  html?: string;
  value?: unknown;
}

function sectionId(key: string): string {
  return `sec-${key.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()}`;
}

/** 章节内容渲染：完整 HTML 文档走隔离预览，散文按段落排版，其余按数据结构渲染。 */
function sectionBody(section: Section): string {
  if (section.html !== undefined) return section.html;
  const value = section.value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return `<span class="empty">${tr("agent.artifactEmpty")}</span>`;
    if (!isHtmlDocument(trimmed) && (looksLikeMarkdown(trimmed) || looksLikeProse(trimmed))) {
      return `<div class="markdown">${assistantMarkdown.render(trimmed)}</div>`;
    }
  }
  return isHtmlDocument(value) ? htmlPreview(value, section.title) : renderValue(section.value);
}

/**
 * 把一个字段收成章节。
 *
 * 三种情况分开处理，避免「一张表塞进 68% 宽的键值列」这类挤压缩排：
 * - 纯标量对象（`financials`、`valuation`）收成键值表；
 * - 命名空间对象（`sections`、`market_data`）把结构化子项各自提成章节，
 *   零散的标量子项（`as_of` 之类）合成一行元信息，不单独占一节；
 * - 其余（长文本、数组、HTML 文档）按自身结构渲染。
 */
function pushSection(
  sections: Section[],
  key: string,
  value: unknown,
  depth: number,
  title = labelText(key),
): void {
  if (!isRecord(value) || isHtmlDocument(value) || !hasNested(value) || depth >= 2) {
    sections.push({ id: sectionId(key), title, value });
    return;
  }
  const entries = Object.entries(value).filter(([childKey]) => !TECHNICAL_KEYS.has(childKey));
  const structured = entries.filter(([, item]) => !isShortScalar(item));
  const meta = entries.filter(([, item]) => isShortScalar(item));

  // 纯命名空间（`sections`）：拆开更利于阅读，父级标题本身没有信息量。
  if (meta.length === 0 || NAMESPACE_KEYS.has(key)) {
    for (const [childKey, childValue] of entries) {
      pushSection(sections, `${key}-${childKey}`, childValue, depth + 1, labelText(childKey));
    }
    return;
  }

  // 混合对象（`market_data`）：结构化子项带小标题，标量子项收成一行元信息。
  const parts: string[] = [];
  if (meta.length) {
    parts.push(
      `<div class="meta-row">${meta
        .map(
          ([metaKey, metaValue]) =>
            `<span class="meta-item"><span class="meta-key">${label(metaKey)}</span>${scalarHtml(metaKey, metaValue)}</span>`,
        )
        .join("")}</div>`,
    );
  }
  for (const [childKey, childValue] of structured) {
    parts.push(
      `<div class="block"><h3 class="block-title">${label(childKey)}</h3>${
        isRecord(childValue) && !hasNested(childValue)
          ? renderKeyValue(childValue)
          : renderValue(childValue)
      }</div>`,
    );
  }
  sections.push({ id: sectionId(key), title, html: parts.join("") });
}

/**
 * 通用产物拆解：顶层标量收进「关键指标」，其余字段各自成章节。
 * 数字与结论因此排在长正文之前，读者先看到「是多少」再看「为什么」。
 */
function splitGeneric(artifact: AgentArtifact): {
  metrics: Array<[string, unknown]>;
  sections: Section[];
} {
  const metrics: Array<[string, unknown]> = [];
  const sections: Section[] = [];
  const data = stripDuplicateTitle(artifact.data, artifact.title);
  for (const [key, value] of Object.entries(data)) {
    if (TECHNICAL_KEYS.has(key) || INSIGHT_SECTION_KEYS.has(key)) continue;
    // 产物摘要已在正文顶部单独成节，data 里的同名字段不再重复一遍。
    if (key === "summary" && artifact.summary.trim()) continue;
    if (isMetric(value) && !CONTENT_KEYS.has(key)) {
      metrics.push([key, value]);
      continue;
    }
    pushSection(sections, key, value, 0);
  }
  return { metrics, sections };
}

/** 指标卡：编号式数据格，数量决定列数，避免最后一行被拉成不等宽的卡。 */
function renderMetrics(metrics: Array<[string, unknown]>): string {
  if (metrics.length === 0) return "";
  const shown = metrics.slice(0, 8);
  const rest = metrics.slice(8);
  // 三个以上指标均分整幅宽度；一两个指标固定卡宽，避免被拉成一整条。
  const columns = Math.min(shown.length, 4);
  const template =
    shown.length >= 3
      ? `repeat(${columns}, minmax(0, 1fr))`
      : `repeat(${shown.length}, minmax(0, 220px))`;
  const cards = shown
    .map(
      ([key, value]) => `
      <div class="metric">
        <div class="metric-label">${label(key)}</div>
        <div class="metric-value${typeof value === "number" ? " numeric" : ""}">${text(value, true)}</div>
      </div>`,
    )
    .join("");
  const more = rest.length
    ? `<div class="metrics-more"><span class="metrics-more-label">${escapeHtml(tr("agent.artifactMoreMetrics"))}</span>${renderKeyValue(Object.fromEntries(rest))}</div>`
    : "";
  return `<div class="metrics" style="--metrics-template:${template}">${cards}</div>${more}`;
}

/** 需要展示合规声明的产物类型。 */
const DISCLAIMER_KINDS = new Set(["report", "research_report", "market_briefing", "finance"]);

/** 章节编号：01 / 02 / 03。 */
function sectionNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/** 目录：章节数够多时才生成，两列竖向排布（01/02 在左列，03/04 在右列）。 */
function renderToc(sections: Section[]): string {
  if (sections.length < 3) return "";
  const rows = Math.ceil(sections.length / 2);
  const items = sections
    .map(
      (section, index) => `<li>
        <a href="#${section.id}">
          <span class="toc-num">${sectionNumber(index)}</span>
          <span class="toc-text">${escapeHtml(section.title)}</span>
        </a>
      </li>`,
    )
    .join("");
  return `<nav class="toc" aria-label="${escapeHtml(tr("agent.artifactToc"))}">
    <div class="toc-title">${escapeHtml(tr("agent.artifactToc"))}</div>
    <ol style="--toc-rows:${rows}">${items}</ol>
  </nav>`;
}

/** 只带日期的字段（`2026-10-01`）：不补时分，也不做时区换算。 */
function formatDay(value: string): string {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return "";
  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(activeLocaleTag(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 日期时间：紧凑格式，不带「at」这类口语连接词。 */
export function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(activeLocaleTag(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 摘要是不是一行元信息（`600519.SS · 3 news · 5 peers`），是则并入版头。 */
function isMetaSummary(summary: string): boolean {
  const trimmed = summary.trim();
  return trimmed.length <= 72 && trimmed.includes("·") && !/[。！？!?]/.test(trimmed);
}

/**
 * 生成研究产物的完整 HTML 文档。
 *
 * `standalone = false` 时用于 App 内的详情浮层：标题已经在浮层头部显示，
 * 文档里不再重复，直接以版头元信息与正文开场；导出与分享仍用完整标题版本。
 */
export function renderArtifactHtml(
  artifact: AgentArtifact,
  options: { standalone?: boolean } = {},
): string {
  const standalone = options.standalone ?? true;
  const kind = statusLabel(artifact.kind);
  const stamp = formatStamp(artifact.createdAt);
  const rawSummary = artifact.summary.trim();
  const metaSummary = rawSummary && isMetaSummary(rawSummary) ? rawSummary : "";
  const summary = metaSummary ? "" : readableSummary(artifact.summary);
  const takeaways = metaSummary ? [] : extractTakeaways(artifact.summary);

  const sections: Section[] = [];
  if (takeaways.length) {
    sections.push({
      id: "highlights",
      title: tr("agent.artifactHighlights"),
      html: `<ol class="takeaways">${takeaways.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ol>`,
    });
  }
  if (summary) {
    sections.push({
      id: "summary",
      title: tr("agent.artifactSummaryHeading"),
      html: `<section class="summary markdown">${assistantMarkdown.render(summary)}</section>`,
    });
  }
  if (artifact.kind === "finance") {
    const metrics = renderMetrics(
      ["income", "spending", "saved"]
        .filter((key) => artifact.data[key] !== undefined)
        .map((key) => [key, artifact.data[key]] as [string, unknown]),
    );
    if (metrics)
      sections.push({ id: "metrics", title: tr("agent.artifactKeyMetrics"), html: metrics });
    sections.push({
      id: "finance",
      title: tr("agent.artifactDetailsHeading"),
      html: renderFinance(artifact),
    });
  } else {
    const split = splitGeneric(artifact);
    const metrics = renderMetrics(split.metrics);
    if (metrics)
      sections.push({ id: "metrics", title: tr("agent.artifactKeyMetrics"), html: metrics });
    sections.push(...split.sections);
  }

  // 洞察三段：放在正文之后，作为「依据与局限」附录，而不是正文里的散字段。
  const appendix = (
    [
      [
        "ui.insightBasis",
        artifact.data.basis ?? artifact.data.evidence ?? artifact.data.evidenceSummary,
      ],
      ["ui.insightLimits", artifact.data.limits ?? artifact.data.caveats ?? artifact.data.unknowns],
      [
        "ui.insightRevisit",
        artifact.data.revisit ?? artifact.data.reviewAt ?? artifact.data.revisitAt,
      ],
    ] as Array<[TranslationKey, unknown]>
  ).filter(
    (item): item is [TranslationKey, string] => typeof item[1] === "string" && !!item[1].trim(),
  );
  if (appendix.length) {
    sections.push({
      id: "appendix",
      title: tr("agent.artifactAppendix"),
      html: `<dl class="kv appendix">${appendix
        .map(([key, value]) => `<dt>${escapeHtml(tr(key))}</dt><dd>${text(value)}</dd>`)
        .join("")}</dl>`,
    });
  }

  const body = sections
    .map(
      (
        section,
        index,
      ) => `<section class="report-section" id="${section.id}" aria-labelledby="${section.id}-heading">
      <div class="section-head">
        <span class="section-num">${sectionNumber(index)}</span>
        <h2 class="section-title" id="${section.id}-heading">${escapeHtml(section.title)}</h2>
      </div>
      ${sectionBody(section)}
    </section>`,
    )
    .join("\n");

  const metaParts: string[] = [];
  if (metaSummary) metaParts.push(escapeHtml(metaSummary));
  if (stamp)
    metaParts.push(
      `<time datetime="${escapeHtml(artifact.createdAt)}">${escapeHtml(stamp)}</time>`,
    );
  const disclaimer = DISCLAIMER_KINDS.has(artifact.kind)
    ? `<footer class="disclaimer">${escapeHtml(tr("ui.disclaimer"))}</footer>`
    : "";

  return `<!DOCTYPE html>
<html lang="${getActiveLocale() === "zh-Hans" ? "zh-CN" : "en"}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(artifact.title)}</title>
<style>
  :root {
    color-scheme: light;
    /* 全部映射到 App theme.ts 的既有色板，报告页不引入新颜色 */
    --page: #FFFFFF;
    --ink: #2B2B2B;
    --ink-strong: #1D1D1D;
    --ink-soft: #6A6A6A;
    --ink-faint: #8A8A8A;
    --rule: #E4E4E4;
    --rule-soft: #F0F0F0;
    --wash: #FAFAFA;
    --accent: #245FC4;
    --accent-soft: #EDF3FF;
    --accent-line: #D9E5FA;
    --radius: 10px;
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB",
      "Noto Sans SC", "Microsoft YaHei", sans-serif;
    --font-serif: ${webFontFamily};
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
  body {
    margin: 0;
    background: var(--page);
    color: var(--ink);
    font: 15px/1.78 var(--font-sans);
    -webkit-font-smoothing: antialiased;
  }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  /* 内容区与弹层融为一体，不再「白卡套白卡」 */
  .page { max-width: 880px; margin: 0 auto; padding: 26px 34px 48px; }

  /* 版头：类型 + 标的 + 时间，用一条实线收口，形成研报的抬头感 */
  .report-head {
    display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px;
    padding-bottom: 12px; border-bottom: 2px solid var(--ink-strong);
  }
  .report-title {
    margin: 0 0 10px; font: 600 26px/1.35 var(--font-serif); color: var(--ink-strong);
    letter-spacing: .01em;
  }
  .report-title:last-child { margin-bottom: 6px; }
  .chip {
    display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 3px;
    background: var(--accent-soft); color: var(--accent);
    font-size: 11px; font-weight: 600; line-height: 18px; letter-spacing: .02em;
    transform: translateY(-1px);
  }
  .meta { color: var(--ink-soft); font-size: 12px; letter-spacing: .01em; }
  .meta-sep { color: var(--ink-faint); }

  /* 目次 */
  .toc {
    margin-top: 22px; padding: 14px 16px 12px;
    background: var(--wash); border: 1px solid var(--rule); border-radius: var(--radius);
  }
  .toc-title {
    margin-bottom: 9px; color: var(--ink-faint);
    font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase;
  }
  .toc ol {
    margin: 0; padding: 0; list-style: none;
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(var(--toc-rows, 1), auto);
    grid-auto-flow: column; gap: 2px 24px;
  }
  .toc a {
    display: flex; gap: 8px; align-items: baseline;
    padding: 4px 0; color: var(--ink); font-size: 13px; line-height: 1.5;
    text-decoration: none;
  }
  .toc a:hover { color: var(--accent); }
  .toc-num { color: var(--ink-faint); font-size: 11px; font-variant-numeric: tabular-nums; }

  /* 章节：编号 + 衬线标题 + 一条细线 */
  .report-section { margin-top: 34px; scroll-margin-top: 16px; }
  .section-head {
    display: flex; align-items: baseline; gap: 10px;
    margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--rule);
  }
  .section-num {
    color: var(--accent); font-size: 11px; font-weight: 600; letter-spacing: .1em;
    font-variant-numeric: tabular-nums;
  }
  .section-title {
    margin: 0; font: 600 17px/1.5 var(--font-serif); color: var(--ink-strong);
    letter-spacing: .01em;
  }

  /* 要点速览：左侧强调线，读起来像研报的「核心观点」 */
  .takeaways {
    margin: 0; padding: 2px 0 2px 18px; list-style: none; counter-reset: takeaway;
    border-left: 2px solid var(--accent-line);
  }
  .takeaways li {
    position: relative; counter-increment: takeaway; padding: 5px 0 5px 24px;
    font-size: 14px; line-height: 1.75;
  }
  .takeaways li::before {
    content: counter(takeaway); position: absolute; left: 0; top: 7px;
    width: 16px; height: 16px; border-radius: 50%; background: var(--accent-soft);
    color: var(--accent); font-size: 10px; font-weight: 600;
    line-height: 16px; text-align: center;
  }

  /* 关键指标：等宽数据格，数量决定列数 */
  .metrics {
    display: grid; gap: 10px;
    grid-template-columns: var(--metrics-template, repeat(2, minmax(0, 1fr)));
  }
  .metric {
    padding: 13px 15px 14px; background: var(--page);
    border: 1px solid var(--rule); border-radius: var(--radius);
  }
  .metric-label {
    color: var(--ink-soft); font-size: 11.5px; line-height: 1.5; letter-spacing: .01em;
  }
  .metric-value {
    margin-top: 7px; font-size: 22px; line-height: 1.25; font-weight: 600;
    color: var(--ink-strong); font-variant-numeric: tabular-nums; overflow-wrap: anywhere;
  }
  .metric-value.numeric { color: var(--accent); }
  .metrics-more { margin-top: 14px; }
  .metrics-more-label {
    display: block; margin-bottom: 8px;
    color: var(--ink-faint); font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
  }

  /* 摘要与正文 */
  .summary { max-width: 70ch; }
  .summary > :first-child, .markdown > :first-child { margin-top: 0; }
  .summary > :last-child, .markdown > :last-child { margin-bottom: 0; }
  .summary > p:first-child { font-size: 16px; line-height: 1.85; color: var(--ink-strong); }
  .markdown h1, .markdown h2, .markdown h3, .markdown h4 {
    margin: 1.5em 0 .6em; color: var(--ink-strong); font-family: var(--font-serif);
    font-weight: 600; line-height: 1.5;
  }
  .markdown h1 { font-size: 20px; }
  .markdown h2 { font-size: 17px; }
  .markdown h3 { font-size: 15px; }
  .markdown h4 { font-size: 14px; }
  .markdown p, .markdown ul, .markdown ol { margin: 0 0 1em; }
  .markdown ul, .markdown ol { padding-left: 20px; }
  .markdown li + li { margin-top: 5px; }
  .markdown li::marker { color: var(--ink-faint); }
  .markdown a { color: var(--accent); text-underline-offset: 2px; }
  .markdown blockquote {
    margin: 1.1em 0; padding: 1px 0 1px 14px;
    border-left: 2px solid var(--rule); color: var(--ink-soft);
  }
  .markdown code {
    padding: 1px 5px; border-radius: 4px; background: var(--wash); color: var(--accent);
    font: 12.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .markdown pre {
    margin: 1.1em 0; padding: 12px 14px; border-radius: var(--radius);
    background: #1F2430; color: #D7DAE0; overflow: auto;
  }
  .markdown pre code { padding: 0; background: transparent; color: inherit; }
  .markdown hr { border: 0; border-top: 1px solid var(--rule); margin: 1.6em 0; }
  .markdown strong { font-weight: 600; color: var(--ink-strong); }
  .markdown img { max-width: 100%; height: auto; border-radius: var(--radius); }
  .markdown table { width: 100%; border-collapse: collapse; font-size: 13.5px; margin: 1.1em 0; }
  .markdown th, .markdown td { padding: 9px 12px; border-bottom: 1px solid var(--rule-soft); text-align: left; }
  .markdown th { background: var(--wash); color: var(--ink-soft); font-size: 12px; font-weight: 600; }

  /* 数据章节 */
  .block { margin-top: 24px; }
  .block:first-child { margin-top: 0; }
  .block-title {
    margin: 0 0 10px; font: 600 13.5px/1.5 var(--font-sans); color: var(--ink-strong);
    letter-spacing: .01em;
  }
  /* 混合对象里的零散标量（数据时间、口径等）：一行元信息，不单独占一节 */
  .meta-row {
    display: flex; flex-wrap: wrap; gap: 4px 20px; margin: 0 0 16px;
    color: var(--ink-soft); font-size: 12.5px;
  }
  .meta-item { display: inline-flex; align-items: baseline; gap: 6px; }
  .meta-key { color: var(--ink-faint); }
  .url { color: var(--ink-soft); font-size: 12.5px; text-decoration: underline; text-decoration-color: var(--rule); text-underline-offset: 2px; }
  .typeset-scroll {
    overflow-x: auto; -webkit-overflow-scrolling: touch;
    border: 1px solid var(--rule); border-radius: var(--radius);
  }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { padding: 9px 13px; text-align: left; vertical-align: top; }
  th {
    background: var(--wash); color: var(--ink-soft);
    font-size: 11.5px; font-weight: 600; letter-spacing: .04em; white-space: nowrap;
    border-bottom: 1px solid var(--rule);
  }
  td { border-bottom: 1px solid var(--rule-soft); }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: #FCFCFC; }
  th.numeric, td.numeric { text-align: right; font-variant-numeric: tabular-nums; }

  dl.kv {
    display: grid; grid-template-columns: minmax(112px, 26%) 1fr; margin: 0;
    border: 1px solid var(--rule); border-radius: var(--radius); overflow: hidden;
  }
  dt, dd { padding: 10px 13px; border-bottom: 1px solid var(--rule-soft); }
  dt { color: var(--ink-soft); font-size: 12.5px; background: var(--wash); }
  dd { margin: 0; font-size: 13.5px; overflow-wrap: anywhere; }
  dd.num { text-align: right; font-variant-numeric: tabular-nums; color: var(--ink-strong); }
  dl.kv > dt:nth-last-of-type(1), dl.kv > dd:nth-last-of-type(1) { border-bottom: 0; }

  ul.bullet-list { margin: 0; padding-left: 20px; }
  .bullet-list li { margin: 0 0 6px; }
  .bullet-list li::marker { color: var(--ink-faint); }
  .bullet-list .markdown { margin: 4px 0; }
  .empty, .note { color: var(--ink-faint); font-size: 12.5px; }
  .note { margin: 8px 0 0; }

  /* 财务产物：占比条 */
  .bar-row {
    display: grid; grid-template-columns: minmax(88px, 20%) 1fr 92px;
    align-items: center; gap: 12px; margin: 9px 0;
  }
  .bar-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { height: 7px; border-radius: 4px; background: #F0F0F0; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; background: var(--accent); }
  .bar-value {
    font-size: 13px; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums;
  }

  /* 完整 HTML 产物与代码块的隔离预览 */
  .html-document { display: grid; gap: 10px; }
  .html-preview-frame {
    display: block; width: 100%; height: min(78vh, 860px); min-height: 520px;
    border: 1px solid var(--rule); border-radius: var(--radius); background: var(--page);
  }
  .source summary {
    width: fit-content; cursor: pointer; color: var(--ink-soft);
    font-size: 12px; padding: 2px 0; user-select: none;
  }
  .source[open] summary { margin-bottom: 8px; }
  .source pre.code { max-height: 420px; }
  pre { margin: 0; padding: 10px 12px; background: var(--wash); border-radius: var(--radius); overflow: auto; font-size: 12.5px; }
  pre.code {
    margin: 0; padding: 12px 14px; background: #1F2430; color: #D7DAE0;
    border-radius: var(--radius); overflow: auto;
    font: 12.5px/1.7 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  pre.code .tok-key { color: #C792EA; }
  pre.code .tok-str { color: #C3E88D; }
  pre.code .tok-num { color: #F78C6C; }
  pre.code .tok-bool { color: #82AAFF; }
  pre.code .tok-punc { color: #7A8189; }
  pre.code .tok-url { color: #82AAFF; text-decoration: underline; }

  dl.kv.appendix { margin-top: 0; }
  .disclaimer {
    margin-top: 40px; padding-top: 12px; border-top: 1px solid var(--rule);
    color: var(--ink-faint); font-size: 11.5px; line-height: 1.7;
  }

  @media (max-width: 640px) {
    body { font-size: 14.5px; }
    .page { padding: 20px 18px 36px; }
    .report-title { font-size: 22px; }
    .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .metric-value { font-size: 19px; }
    .toc ol { grid-template-columns: 1fr; grid-template-rows: none; grid-auto-flow: row; }
    .bar-row { grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; }
    .bar-value { grid-column: 2; text-align: left; }
    dl.kv { grid-template-columns: minmax(88px, 34%) 1fr; }
    .html-preview-frame { min-height: 420px; height: 66vh; }
  }
  @media print {
    .page { max-width: none; padding: 0; }
    .toc { break-inside: avoid; }
    .report-section { break-inside: auto; }
    .section-head { break-after: avoid; }
  }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    * { transition: none !important; animation: none !important; }
  }
</style>
</head>
<body>
  <main class="page" aria-label="${escapeHtml(artifact.title)}">
    ${
      standalone
        ? `<h1 class="report-title">${escapeHtml(artifact.title)}</h1>`
        : `<h1 class="sr-only">${escapeHtml(artifact.title)}</h1>`
    }
    ${
      standalone
        ? `<header class="report-head">
      <span class="chip">${escapeHtml(kind)}</span>
      ${metaParts.join('<span class="meta-sep" aria-hidden="true">·</span>')}
    </header>`
        : // App 内详情浮层：版头（类型 Chip + 生成时间）已移到浮层标题下方，
          // 文档里不再重复；仅当摘要本身就是一句元信息（如「报告已保存」）时，
          // 把它保留成正文前的一行小字，避免信息丢失。
          metaSummary
          ? `<p class="note" style="margin-top:0">${escapeHtml(metaSummary)}</p>`
          : ""
    }
    ${renderToc(sections)}
    ${body}
    ${disclaimer}
  </main>
</body>
</html>`;
}

/**
 * Markdown 单元格：压成单行文本。
 *
 * GFM 表格的行以换行分隔，单元格里出现换行会把表格截断，因此这里把换行、
 * 竖线统一折叠；对象/数组用「键：值」串起来，保持一行可读。
 */
function markdownCell(value: unknown): string {
  if (Array.isArray(value)) return value.map(markdownCell).join("、") || "—";
  if (isRecord(value)) {
    const pairs = Object.entries(value).map(
      ([key, item]) => `${labelText(key)}：${markdownCell(item)}`,
    );
    return pairs.join("；") || "—";
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value.toLocaleString(activeLocaleTag(), {
          maximumFractionDigits: 2,
        })
      : "—";
  }
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (value === null || value === undefined) return "—";
  const text = String(value)
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
  return text || "—";
}

/** 记录数组 -> GFM 表格。 */
function markdownTable(rows: Record<string, unknown>[]): string {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (!keys.length) return "—";
  const header = `| ${keys.map(labelText).join(" | ")} |`;
  const divider = `| ${keys.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${keys.map((key) => markdownCell(row[key])).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

/**
 * 与 `isHtmlDocument` 同一判定，但返回普通布尔值。
 *
 * `isHtmlDocument` 是类型守卫，在 `typeof value === "string"` 之后调用会把
 * 假分支里的字符串收窄成 `never`；这里包一层，保住后续字符串操作的类型。
 */
function isHtmlSource(value: string): boolean {
  return isHtmlDocument(value);
}

/**
 * 任意数据值 -> Markdown 块。
 *
 * 长文本如果是 Markdown 源码就原样保留（模型写的研报不该被拍平），
 * 否则包进代码块；完整 HTML 页面只留一行指引，避免把整页源码塞进导出文件。
 */
function markdownValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    const samples = value.slice(0, 100);
    if (samples.every(isRecord)) return markdownTable(samples);
    return samples.map((item) => `- ${markdownCell(item)}`).join("\n");
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => `- **${labelText(key)}**: ${markdownCell(item)}`)
      .join("\n");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "—";
    if (isHtmlSource(trimmed)) return `> ${tr("agent.artifactHtmlAttachment")}`;
    if (trimmed.includes("\n") || trimmed.length > 120) {
      return looksLikeMarkdown(trimmed) ? trimmed : `\`\`\`\n${trimmed}\n\`\`\``;
    }
    return trimmed;
  }
  return markdownCell(value);
}

/** 报告头部的日期文本：与 HTML 报告保持一致。 */
function reportDateText(iso: string): string {
  return formatStamp(iso);
}

/**
 * 生成研究产物的 Markdown 文档（导出 / 公开分享页共用）。
 *
 * 信息顺序与 HTML 报告一致：标题与元信息 → 摘要 → 关键指标 → 明细数据。
 * 表格与列表都走标准 GFM，粘到飞书、Notion、GitHub 都能直接排版。
 */
export function renderArtifactMarkdown(artifact: AgentArtifact): string {
  const parts: string[] = [`# ${artifact.title}`, ""];
  const dateText = reportDateText(artifact.createdAt);
  const meta = [statusLabel(artifact.kind), dateText].filter(Boolean).join(" · ");
  if (meta) parts.push(`> ${meta}`, "");

  const summary = readableSummary(artifact.summary).trim();
  if (summary) parts.push(summary, "");

  if (artifact.kind === "finance") {
    const data = artifact.data;
    parts.push(
      `## ${tr("agent.artifactKeyMetrics")}`,
      "",
      [
        `- **${tr("agent.financeIncome")}**: ${markdownCell(data.income)}`,
        `- **${tr("agent.financeSpending")}**: ${markdownCell(data.spending)}`,
        `- **${tr("agent.financeRemaining")}**: ${markdownCell(data.saved)}`,
      ].join("\n"),
      "",
    );
    const categories = Array.isArray(data.categories) ? data.categories : [];
    if (categories.length) {
      parts.push(`## ${tr("agent.whereMoneyWent")}`, "", markdownValue(categories), "");
    }
    const transactions = Array.isArray(data.transactions) ? data.transactions : [];
    if (transactions.length) {
      parts.push(`## ${tr("agent.viewTransactions")}`, "", markdownValue(transactions), "");
    }
  } else {
    const { metrics, sections } = splitGeneric(artifact);
    if (metrics.length) {
      parts.push(
        `## ${tr("agent.artifactKeyMetrics")}`,
        "",
        metrics.map(([key, value]) => `- **${labelText(key)}**: ${markdownCell(value)}`).join("\n"),
        "",
      );
    }
    for (const section of sections) {
      parts.push(`## ${section.title}`, "", markdownValue(section.value), "");
    }
  }

  if (DISCLAIMER_KINDS.has(artifact.kind)) {
    parts.push("---", "", `_${tr("ui.disclaimer")}_`, "");
  }
  return `${parts
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}
