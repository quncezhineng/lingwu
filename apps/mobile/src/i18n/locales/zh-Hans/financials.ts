import type { Dictionary } from "../../types";

/** 财报解析展示（命名空间：financials）。 */
const financials = {
  "financials.title": "财报解析",
  "financials.banner": "对比对象为上一期（YoY），未接入市场一致预期。",
  "financials.metricColumn": "指标",
  "financials.current": "本期",
  "financials.previous": "上期",
  "financials.yoy": "同比",
  "financials.changePp": "变化（pp）",
  "financials.revenue": "营业收入",
  "financials.netProfit": "净利润",
  "financials.eps": "每股收益",
  "financials.grossMargin": "毛利率",
  "financials.operatingCashFlow": "经营现金流",
  "financials.unavailable": "未取到字段",
  "financials.comparisonNone": "未找到上一期数据，仅展示本期。",
  "financials.statusComplete": "完整",
  "financials.statusPartial": "部分字段缺失",
  "financials.statusFailed": "解析失败",
  "financials.noReport": "暂无财报数据。",
  "financials.pasteTitle": "解析财报文本",
  "financials.textPlaceholder": "粘贴财报文本（营业收入、净利润、每股收益、毛利率、经营现金流）…",
  "financials.parseText": "解析文本",
  "financials.uploadPdf": "上传 PDF",
  "financials.parsing": "解析中…",
  "financials.parseFailed": "解析失败，请检查文本内容后重试。",
  "financials.pdfUnsupported": "当前环境未安装 PDF 解析组件，可粘贴文本或联系管理员。",
  "financials.parsedAt": "最近解析 {time}",
  "financials.source": "来源",
  "financials.update": "更新财报",
  "financials.collapse": "收起",
};

export default financials satisfies Dictionary;
