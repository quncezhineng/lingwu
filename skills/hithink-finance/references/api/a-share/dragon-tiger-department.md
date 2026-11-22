# 营业部数据

[业务导航](README.md)

- [营业部经典战绩](#special-data-dragon-tiger-department-classic-record)：`GET /api/a-share/special-data/dragon-tiger-department-classic-record`
- [营业部历史上榜记录](#special-data-dragon-tiger-department-history)：`GET /api/a-share/special-data/dragon-tiger-department-history`

- 所有接口返回统一 `ApiResponse` 信封；时间戳为毫秒级 Unix 时间戳，时区按 `Asia/Shanghai`。
- 金额按表中币种提供，比例为小数；合法 `null` 保留字段键。分页从1开始，实际记录范围以返回值为准。

<a id="special-data-dragon-tiger-department-classic-record"></a>
<a id="special-data-dragon-tiger-department-classic-record--营业部经典战绩"></a>
## 营业部经典战绩

```text
GET /api/a-share/special-data/dragon-tiger-department-classic-record
```

查询营业部身份及一条代表战绩。无代表战绩时，`classic_record` 为 `null`。

<a id="special-data-dragon-tiger-department-classic-record--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `department_id` | string | 是 | — | 营业部业务标识 |

<a id="special-data-dragon-tiger-department-classic-record--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/special-data/dragon-tiger-department-classic-record?department_id=Q1218139C1' \
  -H 'X-api-key: <your-api-key>'
```

<a id="special-data-dragon-tiger-department-classic-record--响应示例"></a>
### 响应示例

示例中的列表已节选，分页与可用范围按实际响应返回。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request",
  "data": {
    "department_id": "Q1218139C1",
    "department_name": "高盛(中国)上海浦东新区世纪大道证券营业部",
    "organization_id": "Q1218139C1",
    "classic_record": {
      "thscode": "603272.SH",
      "name": "*ST联翔",
      "board_pattern": "24天14板"
    }
  }
}
```

<a id="special-data-dragon-tiger-department-classic-record--返回字段"></a>
### 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `department_id` | string | 当前查询使用的营业部ID |
| `department_name` | string \| null | 营业部名称 |
| `organization_id` | string \| null | 组织业务标识 |
| `classic_record` | object \| null | 代表战绩对象，缺失时为null |

**`data.classic_record` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string \| null | 返回已提供标准股票代码 |
| `name` | string \| null | 股票名称 |
| `board_pattern` | string \| null | 几天几板原始描述 |

<a id="special-data-dragon-tiger-department-history"></a>

<a id="special-data-dragon-tiger-department-history--营业部历史上榜记录"></a>
## 营业部历史上榜记录

成功响应中的代码与名称可能为null或空字符串，字段键和全部记录保留；分页信息按实际源返回。

```text
GET /api/a-share/special-data/dragon-tiger-department-history
```

分页查询营业部上榜股票，支持净买入金额档位和排序；同股不同上榜记录分别保留。

<a id="special-data-dragon-tiger-department-history--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `department_id` | string | 是 | — | 营业部业务标识 |
| `page` | integer | 否 | `1` | 从1开始的页码 |
| `size` | integer | 否 | `30` | 每页1至30条，默认30 |
| `min_net_buy_amount` | integer | 否 | — | 净买入金额档位：5000000/30000000/50000000/100000000，单位元 |
| `sort_field` | string | 否 | `trade_date` | 排序字段：trade_date/change_ratio/net_buy_amount |
| `sort_dir` | string | 否 | `desc` | asc或desc |

<a id="special-data-dragon-tiger-department-history--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/special-data/dragon-tiger-department-history?department_id=Q1218139C1&page=1&size=30' \
  -H 'X-api-key: <your-api-key>'
```

<a id="special-data-dragon-tiger-department-history--响应示例"></a>
### 响应示例

示例中的列表已节选，分页与可用范围按实际响应返回。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request",
  "data": {
    "item": [
      {
        "thscode": "600408.SH",
        "name": "安泰集团",
        "trade_date": "2026-10-12",
        "change_ratio": -0.066138,
        "net_buy_amount": -19330482,
        "rank_type": 0
      }
    ],
    "pagination": {
      "page": 1,
      "size": 30,
      "total": 4048,
      "has_next": true
    }
  }
}
```

<a id="special-data-dragon-tiger-department-history--返回字段"></a>
### 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `item` | array | 业务记录列表 |
| `pagination` | object | 分页对象，包含page、size、total和has_next |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string \| null | 股票标准代码 ；源null或空字符串原样保留，缺失值为null |
| `name` | string \| null | 名称 ；源null或空字符串原样保留，缺失值为null |
| `trade_date` | date | 上榜交易日 |
| `change_ratio` | number \| null | 当日涨跌幅；单位：小数比例 |
| `net_buy_amount` | number \| null | 净买入；单位：元 |
| `rank_type` | integer | 保留返回榜单区间码 |

**`data.pagination` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `page` | integer | 从1开始的页码 |
| `size` | integer | 本页请求大小 |
| `total` | integer \| null | 结果总数；未提供时为null |
| `has_next` | boolean | 是否存在后续页 |
