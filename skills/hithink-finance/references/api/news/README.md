# 资讯事件

[全部业务域](../README.md)

资讯详情、快讯、公告解读、热门专题、日期范围异动解读与个股分时新闻；事件检索按端内范围使用。


## 资讯查询

按已知标识查询正文和公告解读，或查询快讯、专题、日期范围异动及个股分时新闻。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [资讯详情](article-detail.md) | `GET /api/news/article/detail` | 公开 |
| [公告详情与解读](notice-detail.md) | `GET /api/news/notice/detail` | 公开 |
| [热门深度专题](topic-hot-list.md) | `GET /api/news/topic/hot-list` | 公开 |
| [日期范围异动解读](anomaly-analysis.md) | `GET /api/news/anomaly/analysis` | 公开 |
| [个股分时新闻](stock-timeline-list.md) | `GET /api/news/stock/timeline-list` | 公开 |
| [快讯列表](news-flash.md#flash-list) | `GET /api/news/flash/list` | 公开 |
| [快讯刷新](news-flash.md#flash-refresh) | `GET /api/news/flash/refresh` | 公开 |

## 资讯事件

按关键词、时间、评级、行业或概念筛选事件。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [资讯事件库](events-search.md) | `GET /api/news/events/search` | 端内专用，客户端可用 |
