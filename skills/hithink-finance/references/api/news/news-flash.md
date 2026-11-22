# 快讯

[业务导航](README.md)

- [快讯列表](#flash-list)：`GET /api/news/flash/list`
- [快讯刷新](#flash-refresh)：`GET /api/news/flash/refresh`

- 响应为 `{ code, message, request_id, data }`；业务结果通过 code 表达。已处理业务错误返回 HTTP 200，接入限流也可能返回 HTTP 429。
- 带 `_ms` 的时间字段为 Unix 毫秒时间戳；日期为 `yyyy-MM-dd`。其它字符串时间或未确认单位的原值按字段说明处理。
- 可空字段保留 null；长整数内容标识使用字符串，游标原样回传。

<a id="flash-list"></a>
<a id="flash-list--快讯列表"></a>
## 快讯列表

```text
GET /api/news/flash/list
```

首屏 seq 传字符串 `0`。后续传入约定序号；单次数量及翻页边界以数据提供方为准。快讯 id、seq 为字符串，tags.id 为整数。

<a id="flash-list--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `tag_id` | integer | 是 | — | 快讯栏目ID。 |
| `seq` | string | 是 | — | 不透明序号；快讯首屏传字符串0。 |

<a id="flash-list--请求示例"></a>
### 请求示例

栏目和内容标识为示例值，请替换为实际值。

```bash
curl 'https://fuyao.aicubes.cn/api/news/flash/list?tag_id=21103&seq=0' \
  -H 'X-api-key: <your-api-key>'
```

<a id="flash-list--响应示例"></a>
### 响应示例

以下为说明字段形状的合成示例。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request-id",
  "data": {
    "items": [
      {
        "id": "1000",
        "seq": "9007199254740993",
        "title": "合成示例",
        "encoded_url": "https://example.org/content",
        "summary": "合成示例",
        "tags": [
          {
            "id": 1000,
            "name": "合成示例"
          }
        ],
        "type": 1000,
        "create_time_ms": 1000000,
        "update_time_ms": 1000000,
        "pic_url": "https://example.org/content"
      }
    ]
  }
}
```

<a id="flash-list--返回字段"></a>
### 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | array | 快讯列表。 |
| `items[].id` | string | 不透明标识的十进制字符串，精确保留上游整数各位。 |
| `items[].seq` | string | 不透明标识的十进制字符串，精确保留上游整数各位。 |
| `items[].title` | string | 快讯标题。 |
| `items[].encoded_url` | string | 密文文章详情跳转地址，非空。 |
| `items[].summary` | string 或 null | 快讯摘要。 |
| `items[].tags` | array | 快讯栏目标签。 |
| `items[].tags[].id` | integer | 栏目标签 ID，保持上游整数类型。 |
| `items[].tags[].name` | string | 栏目名称。 |
| `items[].type` | integer | 快讯类型。 |
| `items[].create_time_ms` | integer | Unix毫秒级时间戳；由上游秒级值精确乘1000。 |
| `items[].update_time_ms` | integer | Unix毫秒级时间戳；由上游秒级值精确乘1000。 |
| `items[].pic_url` | string 或 null | 封面地址，无配图时可能为空。 |

<a id="flash-refresh"></a>

<a id="flash-refresh--快讯刷新"></a>
## 快讯刷新

```text
GET /api/news/flash/refresh
```

传入已知最新 seq 和创建时间。create_time_ms 为毫秒值，须能整除 1000；调用方按业务需要处理重复记录。

<a id="flash-refresh--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `tag_id` | integer | 是 | — | 快讯栏目ID。 |
| `seq` | string | 是 | — | 不透明序号；快讯首屏传字符串0。 |
| `create_time_ms` | integer | 是 | — | 客户端已知快讯创建时间，毫秒值须能整除1000。 |

<a id="flash-refresh--请求示例"></a>
### 请求示例

栏目和内容标识为示例值，请替换为实际值。

```bash
curl 'https://fuyao.aicubes.cn/api/news/flash/refresh?tag_id=21103&seq=667642844&create_time_ms=1788868800000' \
  -H 'X-api-key: <your-api-key>'
```

<a id="flash-refresh--响应示例"></a>
### 响应示例

以下为说明字段形状的合成示例。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request-id",
  "data": {
    "items": [
      {
        "id": "1000",
        "seq": "9007199254740993",
        "title": "合成示例",
        "encoded_url": "https://example.org/content",
        "summary": "合成示例",
        "tags": [
          {
            "id": 1000,
            "name": "合成示例"
          }
        ],
        "type": 1000,
        "create_time_ms": 1000000,
        "update_time_ms": 1000000,
        "pic_url": "https://example.org/content"
      }
    ]
  }
}
```

<a id="flash-refresh--返回字段"></a>
### 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | array | 快讯列表。 |
| `items[].id` | string | 不透明标识的十进制字符串，精确保留上游整数各位。 |
| `items[].seq` | string | 不透明标识的十进制字符串，精确保留上游整数各位。 |
| `items[].title` | string | 快讯标题。 |
| `items[].encoded_url` | string | 密文文章详情跳转地址，非空。 |
| `items[].summary` | string 或 null | 快讯摘要。 |
| `items[].tags` | array | 快讯栏目标签。 |
| `items[].tags[].id` | integer | 栏目标签 ID，保持上游整数类型。 |
| `items[].tags[].name` | string | 栏目名称。 |
| `items[].type` | integer | 快讯类型。 |
| `items[].create_time_ms` | integer | Unix毫秒级时间戳；由上游秒级值精确乘1000。 |
| `items[].update_time_ms` | integer | Unix毫秒级时间戳；由上游秒级值精确乘1000。 |
| `items[].pic_url` | string 或 null | 封面地址，无配图时可能为空。 |
