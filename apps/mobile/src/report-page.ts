/**
 * 研报的 HTML 页面：把 ResearchReport 排成一张可离线打开、可打印为 PDF 的
 * 自包含报告页，版式沿用 agent-html 的 Report 母版（见 agent-html.ts）。
 *
 * 版式取向：
 * - 版头只承担「这是什么、什么时候生成、编号是多少」，标的用徽章承载；
 * - 指标条只展示真实存在的行情字段，缺字段时整块不渲染，不留 0 或「—」占位；
 * - 章节顺序按「公司 → 财务 → 同业 → 估值 → 新闻 → 风险」推进，右侧目录
 *   由实际渲染出的章节生成，空章节不会在目录里留下死链；
 * - 估值区间用内联 SVG 画成一条带当前位置的区间轴，避免用表格硬凑空间关系；
 * - 涨跌按 A 股习惯红涨绿跌（`--up` 为红、`--down` 为绿），与状态语义色分开；
 * - 底部保留数据来源与免责声明，并提供「复制 Markdown」把结论带回 Agent。
 *
 * 页面里的每一句话都来自 ReportLabels，保持中英双语可用；数字只从报告里读，
 * 不推算报告没有给出的口径。
 */
import {
  agentHtmlDocument,
  badge,
  callout,
  card,
  dataTable,
  detailsBlock,
  escapeHtml,
  icons,
  propGrid,
  statCard,
  statRow,
} from "./agent-html.ts";
import { activeLocaleTag, formatTemplate } from "./i18n/translate.ts";
import type { ResearchReport } from "./research.ts";

export interface ReportLabels {
  disclaimer: string;
  sources: string;
  overview: string;
  financials: string;
  news: string;
  peers: string;
  valuation: string;
  risks: string;
  unavailable: string;
  heuristic: string;
  current: string;
  low: string;
  mid: string;
  high: string;
  generatedAt: string;
  noNews: string;
  noPeers: string;
  noValuation: string;

  /* —— agent-html 版式与结论速览需要的文案 —— */
  /** 右侧悬浮目录的标题。 */
  toc: string;
  /** 「打印 / PDF」按钮。 */
  print: string;
  /** 「复制 Markdown」按钮。 */
  copyMarkdown: string;
  /** 复制成功后的按钮回显。 */
  copied: string;
  /** 深浅色切换按钮的 title。 */
  theme: string;
  /** 结论速览的标题。 */
  summary: string;
  /** 「假设」折叠面板的标题。 */
  assumptions: string;
  /** 估值口径说明（caveat）的标题。 */
  caveat: string;
  /** 当前价在估值区间中的分位。 */
  position: string;
  /** 同业对比表的「名称」列。 */
  peerName: string;
  /** 同业对比表的「标的」列。 */
  symbolColumn: string;
  /** Markdown 表格的「项目 / 数值」表头。 */
  fieldColumn: string;
  valueColumn: string;
  /** 页脚落款。 */
  colophon: string;
  /** 结论速览：当前价落在区间内。占位符 price/low/high/mid/position。 */
  summaryInRange: string;
  /** 结论速览：当前价高于上沿。占位符 price/high。 */
  summaryAboveHigh: string;
  /** 结论速览：当前价低于下沿。占位符 price/low。 */
  summaryBelowLow: string;
  /** 结论速览：有区间但无当前价。占位符 low/high/mid。 */
  summaryNoPrice: string;
  /** 结论速览：覆盖范围。占位符 items。 */
  summaryCoverage: string;
  /** 结论速览：风险条数。占位符 count。 */
  summaryRisks: string;
  /** 覆盖范围的片段。占位符 count。 */
  coverageNews: string;
  coveragePeers: string;
  coverageMissing: string;

  /** 财务字段的本地化标题：字段名 → 展示名；缺省回退到原始字段名。 */
  financialLabels?: Record<string, string>;
}

function formatNumber(value: number | undefined): string {
  return value === undefined
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** 涨跌方向：中文语境红涨绿跌，对应 --up / --down。 */
function direction(value: number | undefined): "up" | "down" | "flat" {
  if (value === undefined || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

function signedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function metaItem(icon: string, text: string): string {
  return `<span class="report-meta-item">${icon}<span>${escapeHtml(text)}</span></span>`;
}

/** 财务字段 → 「标签 / 数值」行；跳过 null 与内部标记字段。 */
function financialRows(report: ResearchReport, labels: ReportLabels) {
  return Object.entries(report.financials)
    .filter(([key, value]) => key !== "unavailable" && value !== null && value !== undefined)
    .map(([key, value]) => ({
      key,
      label: labels.financialLabels?.[key] ?? key,
      value:
        typeof value === "number"
          ? formatNumber(value)
          : typeof value === "string"
            ? value
            : JSON.stringify(value),
    }));
}

/** 估值区间轴：横向带 + 中值刻度 + 当前价标记；纯 SVG，不引图表库。 */
function valuationChart(report: ResearchReport, labels: ReportLabels): string {
  const valuation = report.valuation;
  if (!valuation) return "";
  const price = num(report.financials.price);
  const bounds = [Math.min(valuation.low, valuation.high), Math.max(valuation.low, valuation.high)];
  const lo = price === undefined ? bounds[0] : Math.min(bounds[0], price);
  const hi = price === undefined ? bounds[1] : Math.max(bounds[1], price);
  const span = hi - lo;
  const pad = span > 0 ? span * 0.08 : Math.max(Math.abs(hi) * 0.08, 1);
  const width = 720;
  const x = (value: number) => 10 + ((value - (lo - pad)) / (hi + pad - (lo - pad))) * (width - 20);
  const bandStart = x(bounds[0]);
  const bandEnd = x(bounds[1]);
  const midX = x(valuation.mid);

  const markerX = price === undefined ? undefined : x(price);
  // 标记贴边时把文字锚点收回页面内，避免标签被裁掉。
  const anchor =
    markerX === undefined
      ? "middle"
      : markerX < 90
        ? "start"
        : markerX > width - 90
          ? "end"
          : "middle";
  const marker =
    markerX === undefined
      ? ""
      : `<line x1="${markerX.toFixed(1)}" y1="22" x2="${markerX.toFixed(1)}" y2="62" stroke="var(--info)" stroke-width="1" stroke-dasharray="3 3" opacity="0.65"/>
         <circle cx="${markerX.toFixed(1)}" cy="50" r="5.5" fill="var(--card)" stroke="var(--info)" stroke-width="2"/>
         <text x="${markerX.toFixed(1)}" y="15" font-size="11.5" font-weight="600" fill="var(--info)" text-anchor="${anchor}">${escapeHtml(
           `${labels.current} ${formatNumber(price)}`,
         )}</text>`;

  const position =
    price === undefined || bounds[1] === bounds[0]
      ? undefined
      : Math.round(((price - bounds[0]) / (bounds[1] - bounds[0])) * 100);

  return `<div class="chart">
  <svg viewBox="0 0 ${width} 92" role="img" aria-label="${escapeHtml(
    `${labels.valuation} ${formatNumber(bounds[0])} - ${formatNumber(bounds[1])}`,
  )}">
    <rect x="10" y="45" width="${width - 20}" height="10" rx="5" fill="var(--secondary)" stroke="var(--border)"/>
    <rect x="${bandStart.toFixed(1)}" y="45" width="${Math.max(bandEnd - bandStart, 1).toFixed(
      1,
    )}" height="10" rx="5" fill="var(--primary)" opacity="0.16" stroke="var(--primary)" stroke-opacity="0.35"/>
    <line x1="${midX.toFixed(1)}" y1="38" x2="${midX.toFixed(
      1,
    )}" y2="62" stroke="var(--primary)" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.5"/>
    ${marker}
    <text x="${bandStart.toFixed(1)}" y="80" font-size="11" fill="var(--muted-fg)" text-anchor="start">${escapeHtml(
      `${labels.low} ${formatNumber(bounds[0])}`,
    )}</text>
    <text x="${bandEnd.toFixed(1)}" y="80" font-size="11" fill="var(--muted-fg)" text-anchor="end">${escapeHtml(
      `${labels.high} ${formatNumber(bounds[1])}`,
    )}</text>
  </svg>
  <div class="chart-legend">
    <span><i class="legend-tick"></i>${escapeHtml(
      `${labels.mid} ${formatNumber(valuation.mid)}`,
    )}</span>
    ${
      position === undefined
        ? ""
        : `<span><i class="legend-swatch" style="background:var(--info)"></i>${escapeHtml(
            `${labels.position} ${position}%`,
          )}</span>`
    }
  </div>
</div>`;
}

/** 结论速览：只用报告里已有的数字下判断，不补外部信息。 */
function summaryCallout(report: ResearchReport, labels: ReportLabels): string {
  const paragraphs: string[] = [];
  const price = num(report.financials.price);
  const currency = str(report.financials.currency) ?? "";
  const valuation = report.valuation;
  let tone: "info" | "warning" = "info";

  if (valuation) {
    const money =
      price === undefined ? "" : `${formatNumber(price)}${currency ? ` ${currency}` : ""}`;
    if (price === undefined) {
      paragraphs.push(
        formatTemplate(labels.summaryNoPrice, {
          low: formatNumber(valuation.low),
          high: formatNumber(valuation.high),
          mid: formatNumber(valuation.mid),
        }),
      );
    } else if (price > valuation.high) {
      tone = "warning";
      paragraphs.push(
        formatTemplate(labels.summaryAboveHigh, {
          price: money,
          high: formatNumber(valuation.high),
        }),
      );
    } else if (price < valuation.low) {
      tone = "warning";
      paragraphs.push(
        formatTemplate(labels.summaryBelowLow, {
          price: money,
          low: formatNumber(valuation.low),
        }),
      );
    } else if (valuation.high !== valuation.low) {
      paragraphs.push(
        formatTemplate(labels.summaryInRange, {
          price: money,
          low: formatNumber(valuation.low),
          high: formatNumber(valuation.high),
          mid: formatNumber(valuation.mid),
          position: Math.round(((price - valuation.low) / (valuation.high - valuation.low)) * 100),
        }),
      );
    }
  }

  const coverage = [
    report.news.length ? formatTemplate(labels.coverageNews, { count: report.news.length }) : "",
    report.peers.length ? formatTemplate(labels.coveragePeers, { count: report.peers.length }) : "",
    report.unavailable.length
      ? formatTemplate(labels.coverageMissing, { count: report.unavailable.length })
      : "",
  ].filter(Boolean);
  if (coverage.length) {
    paragraphs.push(formatTemplate(labels.summaryCoverage, { items: coverage.join(" / ") }));
  }
  if (report.risks.length) {
    paragraphs.push(formatTemplate(labels.summaryRisks, { count: report.risks.length }));
  }
  if (paragraphs.length === 0) return "";

  return callout({
    title: labels.summary,
    tone,
    icon: tone === "warning" ? "warning" : "check",
    body: paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join(""),
  });
}

/** 供「复制 Markdown」使用：把结论与表格压成可回传 Agent 的纯文本。 */
function reportMarkdown(report: ResearchReport, labels: ReportLabels, stamp: string): string {
  const lines: string[] = [`# ${report.title}`, ""];
  lines.push(
    `> ${report.symbolCode} · ${labels.generatedAt} ${stamp}${report.id ? ` · ${report.id}` : ""}`,
  );

  if (report.companyOverview) {
    lines.push("", `## ${labels.overview}`, report.companyOverview);
  }

  const financials = financialRows(report, labels);
  if (financials.length) {
    lines.push(
      "",
      `## ${labels.financials}`,
      "",
      `| ${labels.fieldColumn} | ${labels.valueColumn} |`,
      "| --- | --- |",
    );
    for (const row of financials) lines.push(`| ${row.label} | ${row.value} |`);
  }
  if (report.unavailable.length) {
    lines.push("", `${labels.unavailable}: ${report.unavailable.join(", ")}`);
  }

  if (report.valuation) {
    const valuation = report.valuation;
    lines.push(
      "",
      `## ${labels.valuation} (${labels.heuristic})`,
      `- ${labels.current}: ${formatNumber(num(report.financials.price))}`,
      `- ${labels.low}: ${formatNumber(valuation.low)}`,
      `- ${labels.mid}: ${formatNumber(valuation.mid)}`,
      `- ${labels.high}: ${formatNumber(valuation.high)}`,
    );
    if (valuation.assumptions.length) {
      lines.push("", `### ${labels.assumptions}`);
      for (const item of valuation.assumptions) lines.push(`- ${item}`);
    }
    if (valuation.caveat) lines.push("", `> ${valuation.caveat}`);
  }

  if (report.peers.length) {
    lines.push(
      "",
      `## ${labels.peers}`,
      "",
      `| ${labels.symbolColumn} | ${labels.peerName} | ${labels.current} | ${
        labels.financialLabels?.changePercent ?? "changePercent"
      } |`,
      "| --- | --- | --- | --- |",
    );
    for (const peer of report.peers) {
      const change =
        peer.changePercent === undefined ? (peer.error ?? "—") : signedPercent(peer.changePercent);
      lines.push(
        `| ${peer.symbol} | ${peer.name ?? "—"} | ${formatNumber(peer.price)} | ${change} |`,
      );
    }
  }

  if (report.news.length) {
    lines.push("", `## ${labels.news}`);
    for (const item of report.news) {
      lines.push(
        `- [${item.title}](${item.url})${item.publishedAt ? ` · ${item.publishedAt}` : ""}`,
      );
    }
  }

  if (report.risks.length) {
    lines.push("", `## ${labels.risks}`);
    for (const risk of report.risks) lines.push(`- ${risk}`);
  }

  if (report.news.length) {
    lines.push("", `## ${labels.sources}`);
    for (const item of report.news) lines.push(`- ${item.url}`);
  }

  lines.push("", `> ${labels.disclaimer}`);
  return lines.join("\n");
}

/** 生成打印 / 分享 / 存档用的单文件 HTML 报告页。 */
export function researchReportDocument(report: ResearchReport, labels: ReportLabels): string {
  const locale = activeLocaleTag();
  const stamp = (() => {
    const time = new Date(report.generatedAt);
    return Number.isNaN(time.getTime()) ? report.generatedAt : time.toLocaleString(locale);
  })();

  const price = num(report.financials.price);
  const changePercent = num(report.financials.changePercent);
  const previousClose = num(report.financials.previousClose);
  const high52 = num(report.financials.fiftyTwoWeekHigh);
  const low52 = num(report.financials.fiftyTwoWeekLow);
  const currency = str(report.financials.currency);
  const changeLabel = labels.financialLabels?.changePercent ?? "changePercent";

  /* —— 版头与操作区 —— */
  const header = `<h1><span>${escapeHtml(report.title)}</span>${badge(
    report.symbolCode || report.id,
    "info",
    true,
  )}</h1>
<div class="report-meta">
${metaItem(icons.target, report.symbolCode || report.id)}
${metaItem(icons.calendar, `${labels.generatedAt} ${stamp}`)}
${report.id ? metaItem(icons.hash, report.id) : ""}
</div>`;

  const actions = [
    `<button type="button" class="btn" data-action="copy-md" data-copied="${escapeHtml(
      labels.copied,
    )}" title="${escapeHtml(labels.copyMarkdown)}">${icons.copy}<span>${escapeHtml(
      labels.copyMarkdown,
    )}</span></button>`,
    `<button type="button" class="btn" data-action="print" title="${escapeHtml(
      labels.print,
    )}">${icons.printer}<span>${escapeHtml(labels.print)}</span></button>`,
    `<button type="button" class="btn btn-icon" data-action="theme" title="${escapeHtml(
      labels.theme,
    )}">${icons.moon}</button>`,
  ].join("");

  /* —— 指标条：只放有值的字段 —— */
  const stats: string[] = [];
  if (price !== undefined) {
    stats.push(statCard({ label: labels.current, value: formatNumber(price), sub: currency }));
  }
  if (changePercent !== undefined) {
    stats.push(
      statCard({
        label: changeLabel,
        value: signedPercent(changePercent),
        sub:
          previousClose === undefined
            ? undefined
            : `${labels.financialLabels?.previousClose ?? "previousClose"} ${formatNumber(
                previousClose,
              )}`,
        tone: direction(changePercent),
      }),
    );
  }
  if (high52 !== undefined) {
    stats.push(
      statCard({
        label: labels.financialLabels?.fiftyTwoWeekHigh ?? "fiftyTwoWeekHigh",
        value: formatNumber(high52),
        sub:
          low52 === undefined
            ? undefined
            : `${labels.financialLabels?.fiftyTwoWeekLow ?? "fiftyTwoWeekLow"} ${formatNumber(
                low52,
              )}`,
      }),
    );
  }
  if (report.valuation) {
    // 中值只做数字呈现：当前价相对中值的高低已经在结论速览里用文字说清楚了，
    // 再染一层红绿会被误读成涨跌。
    stats.push(
      statCard({
        label: labels.mid,
        value: formatNumber(report.valuation.mid),
        sub: `${formatNumber(report.valuation.low)} – ${formatNumber(report.valuation.high)}`,
      }),
    );
  }

  /* —— 章节 —— */
  const toc: { id: string; label: string }[] = [{ id: "overview", label: labels.overview }];
  const sections: string[] = [
    card({
      id: "overview",
      title: labels.overview,
      body: report.companyOverview
        ? `<p>${escapeHtml(report.companyOverview)}</p>`
        : `<div class="empty">—</div>`,
    }),
  ];

  const financials = financialRows(report, labels);
  if (financials.length || report.unavailable.length) {
    toc.push({ id: "financials", label: labels.financials });
    const table = financials.length
      ? `<div class="table-wrap"><table class="kv"><tbody>${financials
          .map(
            (row) =>
              `<tr><th scope="row">${escapeHtml(row.label)}</th><td class="num">${escapeHtml(
                row.value,
              )}</td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : `<div class="empty">—</div>`;
    const missing = report.unavailable.length
      ? `<div class="card-note">${escapeHtml(labels.unavailable)}：${escapeHtml(
          report.unavailable.join("、"),
        )}</div>`
      : "";
    sections.push(
      card({
        id: "financials",
        title: labels.financials,
        badge: `${financials.length}`,
        body: `${table}${missing}`,
      }),
    );
  }

  toc.push({ id: "peers", label: labels.peers });
  sections.push(
    card({
      id: "peers",
      title: labels.peers,
      badge: report.peers.length ? `${report.peers.length}` : undefined,
      body: dataTable({
        head: [
          { label: labels.symbolColumn },
          { label: labels.peerName },
          { label: labels.current, numeric: true },
          { label: changeLabel, numeric: true },
        ],
        rows: report.peers.map((peer) => {
          const change =
            peer.changePercent === undefined
              ? `<span class="muted">${escapeHtml(peer.error ?? "—")}</span>`
              : `<span class="${direction(peer.changePercent)}">${escapeHtml(
                  signedPercent(peer.changePercent),
                )}</span>`;
          return [
            `<span class="mono strong">${escapeHtml(peer.symbol)}</span>`,
            escapeHtml(peer.name ?? "—"),
            formatNumber(peer.price),
            change,
          ];
        }),
        empty: labels.noPeers,
      }),
    }),
  );

  toc.push({ id: "valuation", label: labels.valuation });
  if (report.valuation) {
    const valuation = report.valuation;
    const assumptions = valuation.assumptions.length
      ? `<ul class="list">${valuation.assumptions
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ul>`
      : `<p class="muted">—</p>`;
    sections.push(
      card({
        id: "valuation",
        title: labels.valuation,
        body: [
          `<div class="card-note">${escapeHtml(labels.heuristic)}</div>`,
          valuationChart(report, labels),
          propGrid([
            { label: labels.current, value: escapeHtml(formatNumber(price)) },
            { label: labels.low, value: escapeHtml(formatNumber(valuation.low)) },
            { label: labels.mid, value: escapeHtml(formatNumber(valuation.mid)) },
            { label: labels.high, value: escapeHtml(formatNumber(valuation.high)) },
          ]),
          detailsBlock({
            summary: labels.assumptions,
            body: assumptions,
            aside: badge(`${valuation.assumptions.length}`, "neutral"),
          }),
          valuation.caveat
            ? callout({
                title: labels.caveat,
                tone: "info",
                icon: "info",
                body: `<p>${escapeHtml(valuation.caveat)}</p>`,
              })
            : "",
        ]
          .filter(Boolean)
          .join(""),
      }),
    );
  } else {
    sections.push(
      card({
        id: "valuation",
        title: labels.valuation,
        body: `<div class="empty">${escapeHtml(labels.noValuation)}</div>`,
      }),
    );
  }

  toc.push({ id: "news", label: labels.news });
  sections.push(
    card({
      id: "news",
      title: labels.news,
      badge: report.news.length ? `${report.news.length}` : undefined,
      body: report.news.length
        ? `<ul class="list-plain">${report.news
            .map(
              (item) =>
                `<li><a href="${escapeHtml(item.url)}" rel="noreferrer" target="_blank">${escapeHtml(
                  item.title,
                )}</a>${item.publishedAt ? ` ${badge(item.publishedAt)}` : ""}</li>`,
            )
            .join("")}</ul>`
        : `<div class="empty">${escapeHtml(labels.noNews)}</div>`,
    }),
  );

  if (report.risks.length) {
    toc.push({ id: "risks", label: labels.risks });
    sections.push(
      callout({
        id: "risks",
        title: labels.risks,
        tone: "warning",
        icon: "warning",
        body: `<ul class="list">${report.risks
          .map((risk) => `<li>${escapeHtml(risk)}</li>`)
          .join("")}</ul>`,
      }),
    );
  }

  if (report.news.length) {
    toc.push({ id: "sources", label: labels.sources });
    sections.push(
      card({
        id: "sources",
        title: labels.sources,
        body: `<ul class="list">${report.news
          .map(
            (item) =>
              `<li><a href="${escapeHtml(item.url)}" rel="noreferrer" target="_blank">${escapeHtml(
                item.url,
              )}</a></li>`,
          )
          .join("")}</ul><p class="muted">${escapeHtml(labels.disclaimer)}</p>`,
      }),
    );
  }

  const colophon = `<footer class="colophon"><div>${escapeHtml(
    labels.colophon,
  )}</div><div>${escapeHtml(`${report.symbolCode} · ${stamp}`)}</div></footer>`;

  return agentHtmlDocument({
    title: report.title,
    lang: locale,
    header,
    actions,
    toc,
    tocTitle: labels.toc,
    body: `${statRow(stats)}${summaryCallout(report, labels)}${sections.join("")}${colophon}`,
    markdown: reportMarkdown(report, labels, stamp),
  });
}
