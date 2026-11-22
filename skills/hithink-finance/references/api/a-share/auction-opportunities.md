# 集合竞价机会

[业务导航](README.md)

- [集合竞价个股机会筛选](#special-data-auction-stock-opportunities)：`GET /api/a-share/special-data/auction-stock-opportunities`
- [集合竞价可选交易日期](#special-data-auction-opportunity-dates)：`GET /api/a-share/special-data/auction-opportunity-dates`

- 所有接口返回统一 `ApiResponse` 信封；时间戳为毫秒级 Unix 时间戳，时区按 `Asia/Shanghai`。
- 金额按表中币种提供，比例为小数；合法 `null` 保留字段键。分页从1开始，实际记录范围以返回值为准。

<a id="special-data-auction-stock-opportunities"></a>
<a id="special-data-auction-stock-opportunities--集合竞价个股机会筛选"></a>
## 集合竞价个股机会筛选

```text
GET /api/a-share/special-data/auction-stock-opportunities
```

筛选实时或历史集合竞价机会，一个股票可包含多条机会记录。涨幅为小数比例，数量保持返回尺度；数量单位尚未定义。说明和评级保留原值，关联板块保留 JSON 或 `null`。

<a id="special-data-auction-stock-opportunities--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `date` | string | 否 | — | 查询日期，YYYY-MM-DD；默认日期与有效范围见接口说明；须属于可用日期集合 |
| `warn_types` | string | 否 | — | 逗号分隔的机会类型码；省略查询全部；当前类型为68710/68711/68712/68713/68714/68715/68716/68717/68718/68719/68720/68721/68722/68723/68724/68725/68726/68727 |
| `market` | string | 否 | `a_share` | 适用市场：a_share/sh_sz_main/sh_a/sz_a/gem/star |
| `exclude_st` | boolean | 否 | `false` | 是否排除ST股票，默认false |
| `thscodes` | string | 否 | — | 逗号分隔A股标准代码，最多50个token |
| `sort_by` | string | 否 | `warn_time` | warn_time或warn_type |
| `sort_order` | string | 否 | `desc` | desc或asc |
| `page` | integer | 否 | `1` | 从1开始的页码 |
| `size` | integer | 否 | `20` | 每页1至20条，默认20 |

<a id="special-data-auction-stock-opportunities--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/special-data/auction-stock-opportunities?date=2026-10-12&warn_types=68710&page=1&size=20' \
  -H 'X-api-key: <your-api-key>'
```

<a id="special-data-auction-stock-opportunities--响应示例"></a>
### 响应示例

示例中的列表已节选，分页与可用范围按实际响应返回。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request",
  "data": {
    "timestamp": 1791957420099,
    "trade_date": "2026-10-12",
    "mode": "history",
    "item": [
      {
        "thscode": "603190.SH",
        "ticker": "603190",
        "name": "亚通精工",
        "warn_type": "68710",
        "warn_name": "涨停试盘",
        "warn_timestamp": 1791767895000,
        "bid_price": 16.03,
        "bid_change_ratio": 0,
        "bid_amount": 137858,
        "previous_amount": 29087826,
        "bid_volume": 8600,
        "previous_volume": 1847020,
        "explain": "1.0",
        "grade": null,
        "related_block": null
      }
    ],
    "pagination": {
      "page": 1,
      "size": 20,
      "total": 33,
      "has_next": true
    }
  }
}
```

<a id="special-data-auction-stock-opportunities--返回字段"></a>
### 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | integer | 快照采样时间；单位：毫秒 |
| `trade_date` | date | 所属交易日 |
| `mode` | enum | real_time/history |
| `item` | array | 业务记录列表 |
| `pagination` | object | 分页对象，包含page、size、total和has_next |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 标准A股标识 |
| `ticker` | string | 6位股票代码 |
| `name` | string | 股票名称 |
| `warn_type` | string | 原始异动类型码 |
| `warn_name` | string \| null | 返回类型名称；新未知类型暂null，原码保留 |
| `warn_timestamp` | integer | 异动发生时间；单位：毫秒 |
| `bid_price` | number \| null | 匹配价；单位：元 |
| `bid_change_ratio` | number \| null | 竞价涨幅；单位：小数比例 |
| `bid_amount` | number \| null | 竞价金额；单位：元 |
| `previous_amount` | number \| null | 昨日成交额；单位：元 |
| `bid_volume` | number \| null | 竞价量，按返回尺度提供；数量单位尚未定义 |
| `previous_volume` | number \| null | 昨日成交量，按返回尺度提供；数量单位尚未定义 |
| `explain` | string \| null | 异动说明原值，例如代码字符串1.0 |
| `grade` | string \| null | 评级原值 |
| `related_block` | json \| null | 关联板块的JSON原值，可为null；非空结构按实际返回值 |

**`data.pagination` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `page` | integer | 从1开始的页码 |
| `size` | integer | 本页请求大小 |
| `total` | integer \| null | 结果总数；未提供时为null |
| `has_next` | boolean | 是否存在后续页 |

<a id="special-data-auction-opportunity-dates"></a>

<a id="special-data-auction-opportunity-dates--集合竞价可选交易日期"></a>
## 集合竞价可选交易日期

```text
GET /api/a-share/special-data/auction-opportunity-dates
```

查询集合竞价可用交易日期。日期按升序返回，实际保留范围由日期集合决定。

<a id="special-data-auction-opportunity-dates--请求参数"></a>
### 请求参数

无业务参数。

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| — | — | 否 | — | 无业务参数。 |

<a id="special-data-auction-opportunity-dates--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/special-data/auction-opportunity-dates' \
  -H 'X-api-key: <your-api-key>'
```

<a id="special-data-auction-opportunity-dates--响应示例"></a>
### 响应示例

示例中的列表已节选，分页与可用范围按实际响应返回。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request",
  "data": {
    "timestamp": 1791957420098,
    "source_updated_at": 1791893766000,
    "dates": [
      "2025-10-13",
      "2026-10-13"
    ],
    "latest_date": "2026-10-13"
  }
}
```

<a id="special-data-auction-opportunity-dates--返回字段"></a>
### 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | integer | 采样时间；单位：毫秒 |
| `source_updated_at` | integer \| null | 业务数据源更新时间；单位：毫秒 |
| `dates` | array[date] | 返回可用日期，升序 |
| `latest_date` | date | 默认历史查询日期 |
