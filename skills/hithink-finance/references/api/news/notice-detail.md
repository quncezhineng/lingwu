# 公告详情与解读

[业务导航](README.md)

- 响应为 `{ code, message, request_id, data }`；业务结果通过 code 表达。已处理业务错误返回 HTTP 200，接入限流也可能返回 HTTP 429。
- 带 `_ms` 的时间字段为 Unix 毫秒时间戳；日期为 `yyyy-MM-dd`。其它字符串时间或未确认单位的原值按字段说明处理。
- 可空字段保留 null；长整数内容标识使用字符串，游标原样回传。

```text
GET /api/news/notice/detail
```

返回公告基本信息及结构化解读。report_period、summary、monthly_report_interpretation 可能为 null。公告序号由调用方提供。

## 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `seq` | string | 是 | — | 不透明序号；快讯首屏传字符串0。 |

## 请求示例

栏目和内容标识为示例值，请替换为实际值。

```bash
curl 'https://fuyao.aicubes.cn/api/news/notice/detail?seq=example-notice-id' \
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
    "seq": "合成示例",
    "guid": "合成示例",
    "title": "合成示例",
    "report_period": "合成示例",
    "summary": {
      "notice_type": "合成示例",
      "items": [
        {
          "title": "合成示例",
          "content": "<p>合成示例正文</p>"
        }
      ]
    },
    "monthly_report_interpretation": {
      "notice_type": "合成示例",
      "has_findings": true,
      "findings": [
        {
          "title": "合成示例",
          "blocks": [
            {
              "sub_title": "合成示例",
              "content_html": "<p>合成示例正文</p>"
            }
          ]
        }
      ],
      "summary_html": "<p>合成示例正文</p>"
    }
  }
}
```

## 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `seq` | string | 公告序号。 |
| `guid` | string 或 null | 公告 GUID。 |
| `title` | string | 公告标题。 |
| `report_period` | string 或 null | 报告期，仅财报类公告有值。 |
| `summary` | object 或 null | 公告解读。 |
| `summary.notice_type` | string | 公告类型。 |
| `summary.items` | array | 解读项列表。 |
| `summary.items[].title` | string | 解读项标题。 |
| `summary.items[].content` | string | 解读项内容。 |
| `monthly_report_interpretation` | object 或 null | 月度公告解读。 |
| `monthly_report_interpretation.notice_type` | string | 公告类型。 |
| `monthly_report_interpretation.has_findings` | boolean | 是否有解读发现。 |
| `monthly_report_interpretation.findings` | array | 解读发现列表。 |
| `monthly_report_interpretation.findings[].title` | string | 发现标题。 |
| `monthly_report_interpretation.findings[].blocks` | array | 发现内容块。 |
| `monthly_report_interpretation.findings[].blocks[].sub_title` | string | 内容块小标题。 |
| `monthly_report_interpretation.findings[].blocks[].content_html` | string | 内容块 HTML。 |
| `monthly_report_interpretation.summary_html` | string | 月度解读摘要 HTML。 |
