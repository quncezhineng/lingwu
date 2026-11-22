# 资讯详情

[业务导航](README.md)

- 响应为 `{ code, message, request_id, data }`；业务结果通过 code 表达。已处理业务错误返回 HTTP 200，接入限流也可能返回 HTTP 429。
- 带 `_ms` 的时间字段为 Unix 毫秒时间戳；日期为 `yyyy-MM-dd`。其它字符串时间或未确认单位的原值按字段说明处理。
- 可空字段保留 null；长整数内容标识使用字符串，游标原样回传。

```text
GET /api/news/article/detail
```

仅返回可对外提供的资讯。正文保留 HTML；展示时按内容安全策略处理。不存在或不可提供时返回业务错误。

## 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `client_type` | string | 是 | — | 客户端类型：WEB、WEB_ENCRYPTED、PC、PC_LIST，不区分大小写。 |
| `encoded_seq` | string | 是 | — | 密文资讯标识。 |

## 请求示例

栏目和内容标识为示例值，请替换为实际值。

```bash
curl 'https://fuyao.aicubes.cn/api/news/article/detail?client_type=WEB&encoded_seq=example-encoded-id' \
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
    "encoded_seq": "合成示例",
    "title": "合成示例",
    "author": "合成示例",
    "summary": "合成示例",
    "content": "<p>合成示例正文</p>",
    "source": "合成示例",
    "publish_time_ms": 1000000,
    "is_kuaixun": true
  }
}
```

## 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `encoded_seq` | string | 请求中的密文资讯序列号；不返回明文 seq。 |
| `title` | string | 资讯标题。 |
| `author` | string 或 null | 作者；缺失时显式返回 null。 |
| `summary` | string 或 null | 摘要；缺失时显式返回 null。 |
| `content` | string | HTML 正文。 |
| `source` | string 或 null | 来源名称；缺失时显式返回 null。 |
| `publish_time_ms` | integer | Unix毫秒级时间戳；由上游秒级值精确乘1000。 |
| `is_kuaixun` | boolean 或 null | 是否为快讯；缺失时显式返回 null。 |
