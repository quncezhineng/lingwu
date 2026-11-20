/**
 * 研报 HTML 页面单测：agent-html 版式的关键结构、数据落位与降级行为。
 *
 * 断言只压「契约」——章节锚点、涨跌配色、免责声明、离线自包含——
 * 不锁具体像素或文案顺序，避免改版式就红一片。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { type ReportLabels, researchReportDocument } from "../src/report-page.ts";
import { parseResearchReport } from "../src/research.ts";

const LABELS: ReportLabels = {
  disclaimer: "不构成投资建议",
  sources: "数据来源",
  overview: "公司概况",
  financials: "财务概览",
  news: "近期新闻",
  peers: "同业对比",
  valuation: "估值区间",
  risks: "风险提示",
  unavailable: "不可用字段",
  heuristic: "启发式区间估算，非 DCF 模型",
  current: "当前价",
  low: "区间下沿",
  mid: "区间中值",
  high: "区间上沿",
  generatedAt: "生成时间",
  noNews: "暂无新闻",
  noPeers: "暂无同业对比",
  noValuation: "暂无估值区间",
  toc: "目录导航",
  print: "打印 / PDF",
  copyMarkdown: "复制 Markdown",
  copied: "已复制",
  theme: "切换深浅色",
  summary: "结论速览",
  assumptions: "假设",
  caveat: "口径说明",
  position: "区间位置",
  peerName: "名称",
  symbolColumn: "标的",
  fieldColumn: "项目",
  valueColumn: "数值",
  colophon: "单文件 HTML 报告",
  summaryInRange:
    "当前价 {price} 位于估值区间 {low} – {high} 的 {position}% 分位，区间中值 {mid}。",
  summaryAboveHigh: "当前价 {price} 已高于估值区间上沿 {high}。",
  summaryBelowLow: "当前价 {price} 已低于估值区间下沿 {low}。",
  summaryNoPrice: "估值区间 {low} – {high}，中值 {mid}；报告未给出当前价。",
  summaryCoverage: "本次研究覆盖 {items}。",
  summaryRisks: "报告列出 {count} 条风险提示。",
  coverageNews: "{count} 条新闻",
  coveragePeers: "{count} 家同业",
  coverageMissing: "{count} 个字段缺失",
  financialLabels: {
    price: "价格",
    previousClose: "前收盘",
    changePercent: "涨跌幅",
    fiftyTwoWeekHigh: "52 周最高",
    fiftyTwoWeekLow: "52 周最低",
    currency: "币种",
  },
};

const REPORT_PAYLOAD = {
  report: {
    id: "r-1",
    symbol_code: "AAPL",
    title: "Apple Inc. (AAPL) research report",
    sections: {
      company_overview: "Apple trades on NASDAQ.",
      financials: {
        price: 343.91,
        previousClose: 347.7,
        changePercent: -1.1,
        volume: null,
        unavailable: ["volume", "marketCap"],
      },
      news: [
        { title: "Apple ships new chips", url: "https://example.com/a", publishedAt: "2026-10-26" },
      ],
      peer_comparison: [
        { symbol: "MSFT", name: "Microsoft", price: 431.2, changePercent: 0.51 },
        { symbol: "GOOGL", error: "timeout" },
      ],
      valuation: {
        method: "range_heuristic",
        current: 343.91,
        low: 220,
        mid: 300,
        high: 380,
        assumptions: ["区间取自 52 周最低/最高价，未使用 DCF 或可比公司倍数。"],
        caveat: "启发式估值区间，仅供研究参考，不构成投资建议。",
      },
      risks: ["行情为延迟数据（约 15 分钟）。"],
    },
    generated_at: "2026-10-27T06:00:00.000Z",
  },
};

function buildDocument() {
  const report = parseResearchReport(REPORT_PAYLOAD);
  assert.ok(report);
  return researchReportDocument(report, LABELS);
}

test("报告页面：单文件自包含，不引外部 CDN 或图表库", () => {
  const html = buildDocument();
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes('data-action="print"'));
  // 离线可读：没有外部样式、脚本、字体或图表库引用。
  assert.equal(/<link\b/i.test(html), false);
  assert.equal(/<script[^>]+src=/i.test(html), false);
  assert.equal(/cdn\./.test(html), false);
});

test("报告页面：agent-html 版式骨架到位（版头 / 指标条 / 目录 / 卡片 / 折叠）", () => {
  const html = buildDocument();
  assert.ok(html.includes('class="report-header"'));
  assert.ok(html.includes('class="stat-row"'));
  assert.ok(html.includes('class="toc-rail"'));
  assert.ok(html.includes('href="#valuation"'));
  assert.ok(html.includes('class="card"'));
  assert.ok(html.includes("<details"));
  assert.ok(html.includes("data-theme"));
  // 打印时隐藏操作区，深浅色都能出白底 PDF。
  assert.ok(html.includes("@media print"));
});

test("报告页面：保留免责声明、来源链接、启发式标注与缺失字段", () => {
  const html = buildDocument();
  assert.ok(html.includes("不构成投资建议"));
  assert.ok(html.includes("启发式区间估算，非 DCF 模型"));
  assert.ok(html.includes("https://example.com/a"));
  assert.ok(html.includes("不可用字段"));
  assert.ok(html.includes("volume"));
  assert.ok(html.includes("380"));
});

test("报告页面：涨跌按红涨绿跌着色，同业缺失数据退化为原文错误", () => {
  const html = buildDocument();
  // 大盘跌 -1.1% 用绿（--down 类），同业涨 0.51% 用红（--up 类）。
  assert.ok(html.includes('class="stat-mini-val down">-1.10%'));
  assert.ok(html.includes('<span class="up">+0.51%</span>'));
  assert.ok(html.includes("timeout"));
});

test("报告页面：结论速览把当前价落进估值区间分位", () => {
  const html = buildDocument();
  assert.ok(html.includes("结论速览"));
  // (343.91 - 220) / (380 - 220) ≈ 77%
  assert.ok(html.includes("77% 分位"));
  assert.ok(html.includes("区间位置 77%"));
});

test("报告页面：复制回 Agent 的 Markdown 随页面一起下发", () => {
  const html = buildDocument();
  assert.ok(html.includes('id="agent-html-markdown"'));
  assert.ok(html.includes("# Apple Inc. (AAPL) research report"));
  assert.ok(html.includes("| 项目 | 数值 |"));
});

test("报告页面：缺估值、缺新闻、缺同业时降级为空态而不是留死链", () => {
  const report = parseResearchReport({
    report: {
      id: "r-2",
      symbol_code: "TSLA",
      title: "TSLA research report",
      sections: { company_overview: "", financials: {}, news: [], peer_comparison: [], risks: [] },
    },
  });
  assert.ok(report);
  const html = researchReportDocument(report, LABELS);
  assert.ok(html.includes("暂无估值区间"));
  assert.ok(html.includes("暂无新闻"));
  // 没有新闻就没有来源附录，目录里不留指向空章节的锚点。
  assert.equal(html.includes('href="#sources"'), false);
  // 没有价格 / 涨跌 / 估值中值时整条指标带不渲染。
  assert.equal(html.includes('class="stat-row"'), false);
});
