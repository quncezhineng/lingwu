# A 股

[全部业务域](../README.md)

股票价格、财务、估值、竞价与特色数据。指数走势进入指数域，基金净值进入基金域。


## 新股

按市场与发行阶段查询新股，使用发行标识查询港股发行详情。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [新股发行与申购](ipo-calendar-list.md) | `GET /api/a-share/ipo/calendar-list` | 公开 |

## 行情

查询当前价格选择行情快照，查询历史价格序列选择历史 K 线。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [行情快照](prices.md#prices-snapshot) | `GET /api/a-share/prices/snapshot` | 公开 |
| [历史 K 线](prices.md#prices-historical) | `GET /api/a-share/prices/historical` | 公开 |
| [批量历史 K 线](prices.md#prices-historical-batch) | `GET /api/a-share/prices/historical-batch` | 公开 |

## 财务报表与指标

明确报告期、报表类型与指标含义。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [财务指标数据](financials-indicators.md) | `GET /api/a-share/financials/indicators` | 公开 |
| [利润表](financials.md#financials-income-statements) | `GET /api/a-share/financials/income-statements` | 公开 |
| [资产负债表](financials.md#financials-balance-sheets) | `GET /api/a-share/financials/balance-sheets` | 公开 |
| [现金流量表](financials.md#financials-cash-flow-statements) | `GET /api/a-share/financials/cash-flow-statements` | 公开 |
| [批量利润表](financials.md#financials-income-statements-batch) | `GET /api/a-share/financials/income-statements-batch` | 公开 |
| [批量资产负债表](financials.md#financials-balance-sheets-batch) | `GET /api/a-share/financials/balance-sheets-batch` | 公开 |
| [批量现金流量表](financials.md#financials-cash-flow-statements-batch) | `GET /api/a-share/financials/cash-flow-statements-batch` | 公开 |

## 同花顺功能数据

竞价机会、涨跌停与连板统计、龙虎榜、热榜和异动；先确认是否支持历史。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [龙虎榜数据](special-data-dragon-tiger-list.md) | `GET /api/a-share/special-data/dragon-tiger-list` | 公开 |
| [涨停强度与晋级统计](special-data-limit-up-statistics.md) | `GET /api/a-share/special-data/limit-up-statistics` | 公开 |
| [个股机构交易详情](special-data-dragon-tiger-stock-institution.md) | `GET /api/a-share/special-data/dragon-tiger-stock-institution` | 公开 |
| [异动股票](special-data-abnormal-monitor-list.md) | `GET /api/a-share/special-data/abnormal-monitor-list` | 公开 |
| [市场成交额预测](special-data-turnover-prediction-snapshot.md) | `GET /api/a-share/special-data/turnover-prediction-snapshot` | 端内专用，客户端可用 |
| [个股异动原因列表](anomaly-analysis.md#special-data-anomaly-analysis-list) | `GET /api/a-share/special-data/anomaly-analysis-list` | 公开 |
| [按股票查询个股异动原因](anomaly-analysis.md#special-data-anomaly-analysis-stock) | `GET /api/a-share/special-data/anomaly-analysis-stock` | 公开 |
| [A股集合竞价快照](auction.md#auction-snapshot) | `GET /api/a-share/auction/snapshot` | 公开 |
| [短线风向标竞价基准](auction.md#auction-short-term-benchmark) | `GET /api/a-share/auction/short-term-benchmark` | 公开 |
| [飙升榜](hot-list-data.md#special-data-skyrocket-list) | `GET /api/a-share/special-data/skyrocket-list` | 公开 |
| [A股热股榜单](hot-list-data.md#special-data-hot-stock-list) | `GET /api/a-share/special-data/hot-stock-list` | 公开 |
| [历史热股排行](hot-list-data.md#special-data-hot-stock-list-history) | `GET /api/a-share/special-data/hot-stock-list-history` | 公开 |
| [个股排名走势](hot-list-data.md#special-data-hot-stock-rank-trend) | `GET /api/a-share/special-data/hot-stock-rank-trend` | 公开 |
| [涨停股票池](limit-up-data.md#special-data-limit-up-pool) | `GET /api/a-share/special-data/limit-up-pool` | 公开 |
| [跌停股票池](limit-up-data.md#special-data-limit-down-pool) | `GET /api/a-share/special-data/limit-down-pool` | 公开 |
| [炸板股票池](limit-up-data.md#special-data-limit-break-pool) | `GET /api/a-share/special-data/limit-break-pool` | 公开 |
| [连板天梯](limit-up-data.md#special-data-limit-up-ladder) | `GET /api/a-share/special-data/limit-up-ladder` | 公开 |
| [营业部经典战绩](dragon-tiger-department.md#special-data-dragon-tiger-department-classic-record) | `GET /api/a-share/special-data/dragon-tiger-department-classic-record` | 公开 |
| [营业部历史上榜记录](dragon-tiger-department.md#special-data-dragon-tiger-department-history) | `GET /api/a-share/special-data/dragon-tiger-department-history` | 公开 |
| [集合竞价个股机会筛选](auction-opportunities.md#special-data-auction-stock-opportunities) | `GET /api/a-share/special-data/auction-stock-opportunities` | 公开 |
| [集合竞价可选交易日期](auction-opportunities.md#special-data-auction-opportunity-dates) | `GET /api/a-share/special-data/auction-opportunity-dates` | 公开 |
| [筹码形态可选日期](chip-shape.md#special-data-chip-shape-dates) | `GET /api/a-share/special-data/chip-shape-dates` | 端内专用，客户端可用 |
| [筹码形态股票筛选](chip-shape.md#special-data-chip-shape-stocks) | `GET /api/a-share/special-data/chip-shape-stocks` | 端内专用，客户端可用 |

## 估值

查询估值快照，保留空值及负值。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [估值数据](valuations-snapshot.md) | `GET /api/a-share/valuations/snapshot` | 公开 |

## 公司行动

查询 A 股复权因子和除权除息事件。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [除复权数据](corporate-actions-adjustment-factors.md) | `GET /api/a-share/corporate-actions/adjustment-factors` | 公开 |

## 资金流向

端内主力资金快照和历史。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [资金流向实时快照](capital-flow.md#capital-flow-snapshot) | `GET /api/a-share/capital-flow/snapshot` | 端内专用，客户端可用 |
| [资金流向历史](capital-flow.md#capital-flow-historical) | `GET /api/a-share/capital-flow/historical` | 端内专用，客户端可用 |

## 高频动向

端内高频动向、参与度、历史与单日分时。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [高频历史](high-frequency.md#high-frequency-historical) | `GET /api/a-share/high-frequency/historical` | 端内专用，客户端可用 |
| [单日高频分时](high-frequency.md#high-frequency-intraday) | `GET /api/a-share/high-frequency/intraday` | 端内专用，客户端可用 |
