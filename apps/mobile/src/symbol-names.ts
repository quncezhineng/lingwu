/**
 * 标的名称的多语言映射。
 *
 * 行情源（Yahoo / 部分 AKShare 路径）只给英文公司名，而产品需要「中文界面显示中文名、
 * 英文界面显示英文名」。这里用一张静态表兜住常用标的：命中就按当前语言取名字，
 * 未命中则回退到行情源返回的名字，避免出现空白或英文占位。
 *
 * 维护约定：新增映射时中英文都要填，代码写成不带市场后缀的裸代码（大小写不敏感，
 * 港股的 700 / 0700 两种写法都能命中）。
 */
import type { TranslationKey } from "./i18n";
import { getActiveLocale } from "./i18n/translate";
import type { Locale } from "./i18n/types";

/** 市场标记的文案 key：中文界面显示「A股 / 港股 / 美股」，英文界面显示缩写。 */
export const SYMBOL_MARKET_LABEL_KEYS = {
  US: "markets.marketUS",
  CN: "markets.marketCN",
  HK: "markets.marketHK",
  ETF: "markets.marketETF",
  FUND: "markets.marketFund",
} as const satisfies Record<string, TranslationKey>;

type SymbolNames = { zh: string; en: string };

const SYMBOL_NAMES: Record<string, SymbolNames> = {
  // A 股
  "600519": { zh: "贵州茅台", en: "Kweichow Moutai" },
  "601318": { zh: "中国平安", en: "Ping An Insurance" },
  "300750": { zh: "宁德时代", en: "CATL" },
  "000858": { zh: "五粮液", en: "Wuliangye Yibin" },
  "600036": { zh: "招商银行", en: "China Merchants Bank" },
  "601398": { zh: "工商银行", en: "ICBC" },
  "601288": { zh: "农业银行", en: "Agricultural Bank of China" },
  "601988": { zh: "中国银行", en: "Bank of China" },
  "600028": { zh: "中国石化", en: "Sinopec" },
  "601857": { zh: "中国石油", en: "PetroChina" },
  "600030": { zh: "中信证券", en: "CITIC Securities" },
  "000333": { zh: "美的集团", en: "Midea Group" },
  "000651": { zh: "格力电器", en: "Gree Electric" },
  "002594": { zh: "比亚迪", en: "BYD" },
  "601899": { zh: "紫金矿业", en: "Zijin Mining" },
  "600276": { zh: "恒瑞医药", en: "Hengrui Pharmaceuticals" },
  "601012": { zh: "隆基绿能", en: "LONGi Green Energy" },
  "600887": { zh: "伊利股份", en: "Yili Group" },
  "601888": { zh: "中国中免", en: "China Tourism Group Duty Free" },
  "000001": { zh: "平安银行", en: "Ping An Bank" },
  "600900": { zh: "长江电力", en: "China Yangtze Power" },
  "601166": { zh: "兴业银行", en: "Industrial Bank" },
  "002415": { zh: "海康威视", en: "Hikvision" },
  "300059": { zh: "东方财富", en: "East Money" },
  "688981": { zh: "中芯国际", en: "SMIC" },
  "601668": { zh: "中国建筑", en: "China State Construction" },
  "600048": { zh: "保利发展", en: "Poly Developments" },
  "000002": { zh: "万科A", en: "China Vanke" },
  "601088": { zh: "中国神华", en: "China Shenhua" },
  "600309": { zh: "万华化学", en: "Wanhua Chemical" },
  "002230": { zh: "科大讯飞", en: "iFlytek" },
  "603259": { zh: "药明康德", en: "WuXi AppTec" },
  "510300": { zh: "沪深300ETF", en: "CSI 300 ETF" },
  "005827": { zh: "易方达蓝筹精选混合", en: "E Fund Blue Chip Select" },
  // 港股
  "0700": { zh: "腾讯控股", en: "Tencent Holdings" },
  "9988": { zh: "阿里巴巴-SW", en: "Alibaba Group" },
  "0941": { zh: "中国移动", en: "China Mobile" },
  "3690": { zh: "美团-W", en: "Meituan" },
  "1810": { zh: "小米集团-W", en: "Xiaomi Group" },
  "9618": { zh: "京东集团-SW", en: "JD.com" },
  "2318": { zh: "中国平安", en: "Ping An Insurance" },
  "1299": { zh: "友邦保险", en: "AIA Group" },
  "0388": { zh: "香港交易所", en: "HKEX" },
  "0005": { zh: "汇丰控股", en: "HSBC Holdings" },
  "1024": { zh: "快手-W", en: "Kuaishou" },
  "9888": { zh: "百度集团-SW", en: "Baidu" },
  "2015": { zh: "理想汽车-W", en: "Li Auto" },
  "9866": { zh: "蔚来-SW", en: "NIO" },
  // 美股 / ETF
  AAPL: { zh: "苹果", en: "Apple" },
  MSFT: { zh: "微软", en: "Microsoft" },
  NVDA: { zh: "英伟达", en: "NVIDIA" },
  TSLA: { zh: "特斯拉", en: "Tesla" },
  GOOGL: { zh: "谷歌", en: "Alphabet" },
  AMZN: { zh: "亚马逊", en: "Amazon" },
  META: { zh: "Meta", en: "Meta Platforms" },
  BABA: { zh: "阿里巴巴", en: "Alibaba" },
  PDD: { zh: "拼多多", en: "PDD Holdings" },
  JD: { zh: "京东", en: "JD.com" },
  NIO: { zh: "蔚来", en: "NIO" },
  TSM: { zh: "台积电", en: "TSMC" },
  SPY: { zh: "标普500ETF", en: "SPDR S&P 500 ETF" },
  QQQ: { zh: "纳斯达克100ETF", en: "Invesco QQQ Trust" },
};

/** 去掉 `.SS` / `.SH` / `.SZ` / `.HK` / `.US` 等市场后缀，得到裸代码。 */
function bareCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/\.[A-Z]+$/, "");
}

/** 港股常见「700.HK」与「0700.HK」混用，数字代码多给几种补零写法。 */
function codeCandidates(code: string): string[] {
  const bare = bareCode(code);
  if (!/^\d+$/.test(bare)) return [bare];
  return [bare, bare.padStart(4, "0"), bare.padStart(6, "0"), bare.replace(/^0+/, "")];
}

/**
 * 按当前语言取标的名称：中文界面优先中文名，其它语言优先英文名，
 * 表里没有的代码回退到行情源提供的名字。
 *
 * 省略 `locale` 时读取当前激活语言（与 `tr()` / `activeLocaleTag()` 一致），
 * 组件只要调用了 `useTranslation()` 就会在切换语言时重新渲染，名称随之更新。
 */
export function localizedSymbolName(
  symbol: { code: string; name: string },
  locale: Locale = getActiveLocale(),
): string {
  const fallback = symbol.name?.trim() ?? "";
  for (const candidate of codeCandidates(symbol.code)) {
    const entry = SYMBOL_NAMES[candidate];
    if (entry) return locale === "zh-Hans" ? entry.zh : entry.en;
  }
  return fallback;
}
