import type { Dictionary } from "../../types";

/** 统一行情卡片（命名空间：quotes）。 */
const quotes = {
  "quotes.updatedAt": "更新 {time}",
  "quotes.delayed": "延迟",
  "quotes.delayedMinutes": "延迟 {count} 分钟",
  "quotes.closed": "已收盘",
  "quotes.volume": "成交量 {value}",
  "quotes.unavailable": "行情不可用",
  "quotes.retry": "重试",
  "quotes.errorNetwork": "网络异常",
  "quotes.errorTimeout": "请求超时",
  "quotes.errorHttp": "行情请求失败",
  "quotes.errorParse": "行情解析失败",
  "quotes.errorNotFound": "未找到该标的",
  "quotes.errorUnsupported": "暂不支持该标的",
  "quotes.errorProvider": "数据源异常",
  "quotes.a11y": "{code} {name}，最新价 {price}，涨跌 {changePercent}，{time}",
};

export default quotes satisfies Dictionary;
