# 个股分时新闻

[业务导航](README.md)

- 响应为 `{ code, message, request_id, data }`；业务结果通过 code 表达。已处理业务错误返回 HTTP 200，接入限流也可能返回 HTTP 429。
- 带 `_ms` 的时间字段为 Unix 毫秒时间戳；日期为 `yyyy-MM-dd`。其它字符串时间或未确认单位的原值按字段说明处理。
- 可空字段保留 null；长整数内容标识使用字符串，游标原样回传。

```text
GET /api/news/stock/timeline-list
```

使用完整同花顺代码 thscode 查询。首屏 offset=first，后续原样回传 offset；size 省略时使用数据提供方行为。jump_url 保留原值，不保证可用于资讯详情查询。

## 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整同花顺代码，例如300033.SZ。 |
| `offset` | string | 是 | — | 分页偏移量，首屏first；后续原样回传。 |
| `size` | integer | 否 | — | 每页条数，范围1至100；省略使用上游行为。 |

## 请求示例

以下示例查询同花顺的分时新闻。

```bash
curl 'https://fuyao.aicubes.cn/api/news/stock/timeline-list?thscode=300033.SZ&offset=first' \
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
        "id": "合成示例",
        "type": 1000,
        "title": "合成示例",
        "author": "合成示例",
        "source": "合成示例",
        "summary": "合成示例",
        "publish_time_ms": 1000,
        "jump_url": "https://example.org/content",
        "pic_url": "https://example.org/content"
      }
    ],
    "has_more": true,
    "offset": "合成示例"
  }
}
```

## 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | array | 分时新闻列表；可能为空。 |
| `items[].id` | string | 内容 ID。 |
| `items[].type` | integer 或 null | 内容类型。 |
| `items[].title` | string | 新闻标题。 |
| `items[].author` | string 或 null | 作者。 |
| `items[].source` | string 或 null | 新闻来源。 |
| `items[].summary` | string 或 null | 新闻摘要。 |
| `items[].publish_time_ms` | integer 或 null | Unix毫秒级时间戳；保持上游毫秒数值。 |
| `items[].jump_url` | string | 新闻跳转地址，非空 HTTP/HTTPS URL；不保证为密文 URL。 |
| `items[].pic_url` | string 或 null | 新闻图片地址。 |
| `has_more` | boolean | 是否还有下一页。 |
| `offset` | string | 下一页偏移量，用于后续分页请求。 |
