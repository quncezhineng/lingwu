# 热门深度专题

[业务导航](README.md)

- 响应为 `{ code, message, request_id, data }`；业务结果通过 code 表达。已处理业务错误返回 HTTP 200，接入限流也可能返回 HTTP 429。
- 带 `_ms` 的时间字段为 Unix 毫秒时间戳；日期为 `yyyy-MM-dd`。其它字符串时间或未确认单位的原值按字段说明处理。
- 可空字段保留 null；长整数内容标识使用字符串，游标原样回传。

```text
GET /api/news/topic/hot-list
```

按热门栏目查询专题，tab_id 由调用方提供。默认且最多 10 条，next_cursor 用于继续查询，has_more 表示是否还有下一页。时间字符串保持原格式。

## 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `tab_id` | integer | 是 | — | 热门专题栏目ID。 |
| `cursor` | string | 否 | — | 分页游标，后续查询原样回传。 |
| `limit` | integer | 否 | `10` | 每页条数，范围1至10。 |
| `important_only` | boolean | 否 | `false` | 是否只查询重要内容。 |

## 请求示例

栏目和内容标识为示例值，请替换为实际值。

```bash
curl 'https://fuyao.aicubes.cn/api/news/topic/hot-list?tab_id=1' \
  -H 'X-api-key: <your-api-key>'
```

## 响应示例

以下为说明字段形状的合成示例。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request-id",
  "data": {
    "items": [
      {
        "id": "9007199254740993",
        "title": "合成示例",
        "cover": "合成示例",
        "url": "https://example.org/content",
        "type": "合成示例",
        "seo_key": "合成示例",
        "propagation_chain": "合成示例",
        "important_flag": 1000,
        "pinned_flag": 1000,
        "pin_label": "合成示例",
        "source_created_at": "合成示例",
        "source_updated_at": "合成示例"
      }
    ],
    "next_cursor": "合成示例",
    "has_more": true
  }
}
```

## 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | array | 专题内容列表。 |
| `items[].id` | string | 不透明标识的十进制字符串，精确保留上游整数各位。 |
| `items[].title` | string | 标题。 |
| `items[].cover` | string 或 null | 封面地址。 |
| `items[].url` | string | 专题内容最终跳转地址，非空。 |
| `items[].type` | string 或 null | 内容类型。 |
| `items[].seo_key` | string 或 null | SEO 标识，仅配置开启时返回。 |
| `items[].propagation_chain` | string 或 null | 传播链路字段。 |
| `items[].important_flag` | integer 或 null | 重要标识。 |
| `items[].pinned_flag` | integer 或 null | 置顶标识。 |
| `items[].pin_label` | string 或 null | 置顶标签。 |
| `items[].source_created_at` | string 或 null | 来源创建时间。 |
| `items[].source_updated_at` | string 或 null | 来源更新时间。 |
| `next_cursor` | string 或 null | 下一页游标。 |
| `has_more` | boolean | 是否还有下一页。 |
