# 资讯事件库

[业务导航](README.md) · **端内专用** · **同花顺AI客户端可用** · [使用说明](../README.md#端内能力说明)

通过受控筛选条件检索资讯事件库，返回事件、正文、评级、主体影响、关联股票、行业概念及关联事件等完整业务字段。

- 本页接口结构用于说明同花顺AI客户端内的数据契约，当前不作为端外接入入口。
- 返回统一 `ApiResponse` 信封；超出单实例每秒 5 次的请求返回 `code=4001`。
- 仅支持下表查询参数，不预设新闻来源或主体影响范围；响应保留完整已声明业务字段。
- 标准时间查询使用 `yyyy-MM-dd`；其他时间字段保留数据源原始字符串格式。

```text
GET /api/news/events/search
```

## 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `query` | string | 否 | — | 标题或正文关键词，最多 200 个字符。 |
| `search_param` | enum | 否 | `event_name` | 检索域：`event_name`（标题）或 `event_summary`（正文摘要）。 |
| `standard_start_time` | string | 否 | — | 标准时间下界，格式 `yyyy-MM-dd`。 |
| `standard_end_time` | string | 否 | — | 标准时间上界，格式 `yyyy-MM-dd`。 |
| `event_grading_score` | string | 否 | — | 逗号分隔的评级，如 `A,B`。 |
| `related_industry_code` | string | 否 | — | 逗号分隔的关联行业代码。 |
| `related_concept_code` | string | 否 | — | 逗号分隔的关联概念代码。 |
| `size` | integer | 否 | `20` | 返回条数，范围 `1-100`。 |

## 请求示例

以下命令仅展示接口路径与参数格式，当前不可用于外部调用；AI 客户端会自动携带已登录身份。

```bash
curl 'https://fuyao.aicubes.cn/api/news/events/search?query=%E6%B5%99%E6%B1%9F&search_param=event_name&size=1'
```

以下为完整业务字段的结构示例，使用示例数据；实际字段值与可选字段是否存在取决于查询结果。

## 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request-id",
  "data": {
    "total": 1,
    "items": [
      {
        "event_id": "example-event",
        "event_name": "示例产业事件",
        "event_summary": "用于说明完整业务字段的示例摘要。",
        "standard_time": "2026-10-19",
        "event_grading": {
          "score": "B",
          "score_reason": "示例评级原因",
          "score_num": 80
        },
        "related_industry": [
          {
            "code": "881001",
            "name": "示例行业",
            "score": "80",
            "to_stock": 1,
            "influence_reason": "示例影响说明",
            "score_num": 80,
            "correlation": "相关",
            "correlation_reason": "示例关联原因",
            "score_reason": "示例评级原因",
            "influence": "中性",
            "source": "示例来源"
          }
        ],
        "related_concept": [
          {
            "code": "885001",
            "name": "示例板块",
            "score": "80",
            "to_stock": 1,
            "influence_reason": "示例影响说明",
            "score_num": 80,
            "correlation": "相关",
            "correlation_reason": "示例关联原因",
            "score_reason": "示例评级原因",
            "influence": "中性",
            "source": "示例来源"
          }
        ],
        "url": "https://example.com/events/example-event",
        "content": "用于说明正文的示例内容。",
        "event_type": [
          "行业动态"
        ],
        "event_subject": [
          {
            "id": 1,
            "name": "示例主体",
            "standard_name": "示例主体标准名",
            "influence": "中性",
            "influence_reason": "示例影响说明"
          }
        ],
        "related_stock": [
          {
            "code": "600000.SH",
            "name": "示例股票",
            "score": "80",
            "influence_reason": "示例影响说明",
            "source": "示例来源",
            "score_reason": "示例评级原因",
            "influence": "中性"
          }
        ],
        "event_time": "2026-10-19 09:30:00",
        "create_time": "2026-10-19 09:35:00",
        "publish_time": "2026-10-19 09:40:00",
        "is_core": "1",
        "same_events": [
          {
            "event_id": "example-related-event",
            "event_name": "示例关联事件",
            "event_summary": "示例摘要",
            "standard_time": "2026-10-18",
            "url": "https://example.com/events/related",
            "event_time": "2026-10-18 09:30:00",
            "news_source": "其他新闻来源"
          }
        ],
        "related_events": [
          {
            "event_id": "example-related-event",
            "event_name": "示例关联事件",
            "event_summary": "示例摘要",
            "standard_time": "2026-10-18",
            "url": "https://example.com/events/related",
            "event_time": "2026-10-18 09:30:00",
            "news_source": "其他新闻来源"
          }
        ],
        "news_source": "其他新闻来源",
        "raw_semantic_score": 0.92
      }
    ]
  }
}
```

## 返回字段

查询不预设新闻来源或主体影响范围。响应继续提供以下完整业务字段；`news_source` 是返回字段，不是本接口的查询参数。

`data` 元数据：

| 字段 | 类型 | 说明 |
|---|---|---|
| `total` | integer | 命中事件总数，可能大于本页条数。 |
| `items` | array | 事件列表，最多为请求的 `size` 条。 |

`data.items[]` 业务字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `event_id` | string \| null | 事件标识。 |
| `event_name` | string \| null | 事件标题。 |
| `event_summary` | string \| null | 事件摘要。 |
| `standard_time` | string \| null | 事件标准时间，查询边界使用 `yyyy-MM-dd`。 |
| `event_grading` | object \| null | 事件评级，包含 `score`、`score_reason`、`score_num`。 |
| `related_industry` / `related_concept` | array | 关联行业、概念，子字段见下表。 |
| `url` / `content` | string \| null | 事件链接、正文。 |
| `event_type` | array of string \| null | 事件类型列表。 |
| `event_subject` | array of object \| null | 事件主体及影响。 |
| `related_stock` | array of object \| null | 关联个股及影响。 |
| `event_time` / `create_time` / `publish_time` | string \| null | 事件发生、创建和发布时间，保留数据源原始字符串格式。 |
| `is_core` | string \| null | 数据源给出的核心事件标记，保留原始字符串。 |
| `same_events` / `related_events` | array of object \| null | 同类或关联事件摘要，子字段见下表。 |
| `news_source` | string \| null | 新闻来源名称，查询不固定限定某个来源。 |
| `raw_semantic_score` | number \| null | 数据源给出的原始语义匹配分数。 |

`event_grading` 子字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `score` / `score_reason` | string \| null | 评级及评级原因。 |
| `score_num` | number \| null | 数值评级分数。 |

`related_industry[]` / `related_concept[]` 子字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` / `name` | string \| null | 行业或概念代码、名称。 |
| `score` / `score_reason` | string \| null | 评级及评级原因。 |
| `score_num` | number \| null | 数值评级分数。 |
| `to_stock` | integer \| null | 数据源给出的关联股票标记，保留原始整数。 |
| `influence` / `influence_reason` | string \| null | 影响及影响原因。 |
| `correlation` / `correlation_reason` | string \| null | 关联程度及关联原因。 |
| `source` | string \| null | 数据源给出的关联来源。 |

`event_subject[]` 子字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | integer \| null | 主体标识。 |
| `name` / `standard_name` | string \| null | 主体名称、标准名称。 |
| `influence` / `influence_reason` | string \| null | 主体影响及原因，可能包含中性。 |

`related_stock[]` 子字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` / `name` | string \| null | 关联股票代码、名称。 |
| `score` / `score_reason` | string \| null | 评级及评级原因。 |
| `influence` / `influence_reason` | string \| null | 对关联个股的影响及原因。 |
| `source` | string \| null | 数据源给出的关联来源。 |

`same_events[]` / `related_events[]` 子字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `event_id` / `event_name` / `event_summary` | string \| null | 关联事件标识、标题、摘要。 |
| `standard_time` / `event_time` | string \| null | 标准时间、事件发生时间。 |
| `url` / `news_source` | string \| null | 关联事件链接、新闻来源。 |

可选扩展字段缺失或类型不匹配时省略，显式 `null` 仍返回 `null`；主体、关联股票与关联事件不递归展开其他字段。原有基础字段缺失时保留既有空值语义，关联行业或概念无数据时返回空数组。
