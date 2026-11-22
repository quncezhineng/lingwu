# 同花顺筹码形态

[业务导航](README.md) · **端内专用** · **同花顺AI客户端可用** · [使用说明](../README.md#端内能力说明)

- [筹码形态可选日期](#special-data-chip-shape-dates)：`GET /api/a-share/special-data/chip-shape-dates`
- [筹码形态股票筛选](#special-data-chip-shape-stocks)：`GET /api/a-share/special-data/chip-shape-stocks`

- 本页接口结构用于说明同花顺AI客户端内的数据契约，当前不作为端外接入入口。
- 所有接口返回统一 `ApiResponse` 信封；时间戳为毫秒级 Unix 时间戳，时区按 `Asia/Shanghai`。
- 金额按表中币种提供，比例为小数；合法 `null` 保留字段键。分页从1开始，实际记录范围以返回值为准。

<a id="special-data-chip-shape-dates"></a>
<a id="special-data-chip-shape-dates--筹码形态可选日期"></a>
## 筹码形态可选日期

```text
GET /api/a-share/special-data/chip-shape-dates
```

查询筹码选股可用日期及最新日期，选股日期以本接口返回的集合为边界。

<a id="special-data-chip-shape-dates--请求参数"></a>
### 请求参数

无业务参数。

<a id="special-data-chip-shape-dates--请求示例"></a>
### 请求示例

以下命令仅展示接口路径与参数格式，当前不可用于外部调用。

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/special-data/chip-shape-dates'
```

<a id="special-data-chip-shape-dates--响应示例"></a>
### 响应示例

示例中的列表已节选，分页与可用范围按实际响应返回。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request",
  "data": {
    "latest_date": "2026-10-13",
    "dates": [
      "2026-04-13",
      "2026-10-13"
    ]
  }
}
```

<a id="special-data-chip-shape-dates--返回字段"></a>
### 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `latest_date` | date | 数据返回最新可选日期 |
| `dates` | array[date] | 真实可选日期集合 |

<a id="special-data-chip-shape-stocks"></a>

<a id="special-data-chip-shape-stocks--筹码形态股票筛选"></a>
## 筹码形态股票筛选

```text
GET /api/a-share/special-data/chip-shape-stocks
```

按双峰、高位密集、低位密集或低位锁定形态查询股票，保持筛选结果顺序。

<a id="special-data-chip-shape-stocks--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `shape` | string | 是 | — | double_peak/high_position_dense/low_position_dense/low_position_locked |
| `date` | string | 否 | — | 查询日期，YYYY-MM-DD；默认日期与有效范围见接口说明；须属于可用日期集合 |
| `page` | integer | 否 | `1` | 从1开始的页码 |
| `size` | integer | 否 | `20` | 每页1至20条，默认20 |

<a id="special-data-chip-shape-stocks--请求示例"></a>
### 请求示例

以下命令仅展示接口路径与参数格式，当前不可用于外部调用。

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/special-data/chip-shape-stocks?shape=double_peak&date=2026-10-13&page=1&size=20'
```

<a id="special-data-chip-shape-stocks--响应示例"></a>
### 响应示例

示例中的列表已节选，分页与可用范围按实际响应返回。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request",
  "data": {
    "date": "2026-10-13",
    "shape": "double_peak",
    "item": [
      {
        "thscode": "300833.SZ",
        "name": "浩洋股份"
      }
    ],
    "pagination": {
      "page": 1,
      "size": 20,
      "total": 42,
      "has_next": true
    }
  }
}
```

<a id="special-data-chip-shape-stocks--返回字段"></a>
### 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `date` | date | 本页对应日期 |
| `shape` | enum | 筛选形态 |
| `item` | array | 业务记录列表 |
| `pagination` | object | 分页对象，包含page、size、total和has_next |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 标准股票代码 |
| `name` | string | 股票名称 |

**`data.pagination` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `page` | integer | 从1开始的页码 |
| `size` | integer | 本页请求大小 |
| `total` | integer \| null | 结果总数；未提供时为null |
| `has_next` | boolean | 是否存在后续页 |
