# 公共基础数据

[全部业务域](../README.md)

标的目录与搜索、交易日历和交易时段。


## 资料与标识

查询目录、搜索、合约或基本资料，取得后续请求所需标识。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [标的列表获取](tickers-list.md) | `GET /api/meta/tickers/list` | 公开 |
| [标的检索](tickers-search.md) | `GET /api/meta/tickers/search` | 公开 |

## 交易日程

交易日、交易时段与会话时间。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [交易日历](../a-share/calendar-trading-days.md) | `GET /api/a-share/calendar/trading-days` | 公开 |
| [期货交易日](../futures/calendar-trading-schedule.md) | `GET /api/futures/calendar/trading-schedule` | 公开 |
| [期货交易时间轴](../futures/calendar-session-timeline.md) | `GET /api/futures/calendar/session-timeline` | 公开 |
| [期权交易时间轴](../options/calendar-session-timeline.md) | `GET /api/options/calendar/session-timeline` | 公开 |
