# 日期范围异动解读

[业务导航](README.md)

- 响应为 `{ code, message, request_id, data }`；业务结果通过 code 表达。已处理业务错误返回 HTTP 200，接入限流也可能返回 HTTP 429。
- 带 `_ms` 的时间字段为 Unix 毫秒时间戳；日期为 `yyyy-MM-dd`。其它字符串时间或未确认单位的原值按字段说明处理。
- 可空字段保留 null；长整数内容标识使用字符串，游标原样回传。

```text
GET /api/news/anomaly/analysis
```

查询日期范围异动解读。指定标的最多返回 365 天范围，全量最多 30 天；超范围由数据提供方向结束日期截取，was_truncated 表示截断。四个时间字段保留原值，单位及标的编码格式待核实。空列表也可能表示服务降级，不能据此断言期间没有异动。

## 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `begin_date` | string | 是 | — | 开始日期，格式yyyy-MM-dd。 |
| `end_date` | string | 是 | — | 结束日期，格式yyyy-MM-dd。 |
| `thscode` | string | 否 | — | 按上游要求提供的同花顺标的编码，格式待核实；省略查询全量。 |

## 请求示例

栏目和内容标识为示例值，请替换为实际值。

```bash
curl 'https://fuyao.aicubes.cn/api/news/anomaly/analysis?begin_date=2026-10-01&end_date=2026-10-15' \
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
        "analysis_id": "合成示例",
        "domain": "合成示例",
        "analysis_content": "<p>合成示例正文</p>",
        "key_word_list": [
          "合成示例"
        ],
        "anomaly_type": "合成示例",
        "tag_code": "合成示例",
        "tag_name": "合成示例",
        "link_url": "https://example.org/content",
        "create_time": 1000,
        "last_anomaly_time": 1000,
        "first_publish_time": 1000,
        "tag_code_update_time": 1000
      }
    ],
    "was_truncated": true
  }
}
```

## 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | array | 异动解读列表 |
| `items[].analysis_id` | string | 异动解读 ID，可作为业务方幂等键使用 |
| `items[].domain` | string 或 null | 域 |
| `items[].analysis_content` | string 或 null | 解读内容 |
| `items[].key_word_list` | array 或 null | 关键词列表 |
| `items[].anomaly_type` | string 或 null | 异动类型 |
| `items[].tag_code` | string 或 null | 标签编码 |
| `items[].tag_name` | string 或 null | 标签名称 |
| `items[].link_url` | string | 相关内容链接地址（结果页地址） |
| `items[].create_time` | integer 或 null | 异动解读发生时间 |
| `items[].last_anomaly_time` | integer 或 null | 最后一次异动时间 |
| `items[].first_publish_time` | integer 或 null | 第一次进行解读的时间 |
| `items[].tag_code_update_time` | integer 或 null | 标签编码变更时间 |
| `was_truncated` | boolean | 响应数据是否被截断；true 表示结果已截断 |
