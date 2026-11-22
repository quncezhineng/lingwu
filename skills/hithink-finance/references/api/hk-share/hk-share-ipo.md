# 新股发行与认购

[业务导航](README.md)

- [港股新股递表记录](#ipo-application-list)：`GET /api/hk-share/ipo/application-list`
- [港股认购与待上市日历](#ipo-calendar-list)：`GET /api/hk-share/ipo/calendar-list`
- [港股新股发行详情](#ipo-issue-detail)：`GET /api/hk-share/ipo/issue-detail`

- 所有接口返回统一 `ApiResponse` 信封；时间戳为毫秒级 Unix 时间戳，时区按 `Asia/Shanghai`。
- 金额按表中币种提供，比例为小数；合法 `null` 保留字段键。分页从1开始，实际记录范围以返回值为准。

<a id="ipo-application-list"></a>
<a id="ipo-application-list--港股新股递表记录"></a>
## 港股新股递表记录

```text
GET /api/hk-share/ipo/application-list
```

分页查询港股公司递表记录，保留同一公司的重复申请。页码从 1 开始，每页 50 条；总数未知时为 `null`，以 `has_next` 判断后续页。

<a id="ipo-application-list--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `page` | integer | 否 | `1` | 从1开始的页码 |

<a id="ipo-application-list--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/hk-share/ipo/application-list?page=1' \
  -H 'X-api-key: <your-api-key>'
```

<a id="ipo-application-list--响应示例"></a>
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
        "company_name": "Pinnacle Marine Holdings Ltd",
        "application_date": "2026-10-08"
      }
    ],
    "pagination": {
      "page": 1,
      "size": 50,
      "total": null,
      "has_next": true
    }
  }
}
```

<a id="ipo-application-list--返回字段"></a>
### 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `item` | array | 业务记录列表 |
| `pagination` | object | 分页对象，包含page、size、total和has_next |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `company_name` | string | 递表公司名称 |
| `application_date` | date \| null | 递表日期 |

**`data.pagination` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `page` | integer | 从1开始的页码 |
| `size` | integer | 本页请求大小 |
| `total` | integer \| null | 结果总数；未提供时为null |
| `has_next` | boolean | 是否存在后续页 |

<a id="ipo-calendar-list"></a>

<a id="ipo-calendar-list--港股认购与待上市日历"></a>
## 港股认购与待上市日历

```text
GET /api/hk-share/ipo/calendar-list
```

查询港股可认购或待上市列表。`issue_code` 是发行记录标识，正式证券代码未确定时为 `null`；价格区间、每手股数与入场费详情由发行详情接口查询。截止日期为公共招股日期。

<a id="ipo-calendar-list--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `status` | string | 是 | — | 发行阶段：subscribable/awaiting_listing |

<a id="ipo-calendar-list--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/hk-share/ipo/calendar-list?status=subscribable' \
  -H 'X-api-key: <your-api-key>'
```

<a id="ipo-calendar-list--响应示例"></a>
### 响应示例

示例中的列表已节选，分页与可用范围按实际响应返回。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request",
  "data": {
    "status": "subscribable",
    "item": [
      {
        "issue_code": "HK6157",
        "thscode": null,
        "name": "瘦西湖文旅",
        "listing_date": null,
        "issue_price": null,
        "currency": "HKD",
        "subscription_end_date": "2026-10-20",
        "entry_fee": 5121.14,
        "issue_price_text": "3.92-5.07"
      }
    ]
  }
}
```

<a id="ipo-calendar-list--返回字段"></a>
### 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | enum | 当前阶段 |
| `item` | array | 业务记录列表 |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `issue_code` | string | 发行记录标识，保留返回HK前缀等值 |
| `thscode` | string \| null | 正式代码；尚未确认时为空 |
| `name` | string | 发行股票名称 |
| `listing_date` | date \| null | 上市日期 |
| `issue_price` | number \| null | 已定发行价；可认购仅区间时本字段null；单位：HKD |
| `currency` | string \| null | HKD |
| `subscription_end_date` | date \| null | 公共招股截止日期；不是各券商精确时点 |
| `entry_fee` | number \| null | 业务返回入场费，不拆解其中费用；单位：HKD |
| `issue_price_text` | string \| null | 返回招股价展示文本；不从文本虚构单一发行价 |

<a id="ipo-issue-detail"></a>

<a id="ipo-issue-detail--港股新股发行详情"></a>
## 港股新股发行详情

```text
GET /api/hk-share/ipo/issue-detail
```

按发行记录标识查询港股招股价格区间、每手股数与入场费。金额币种为港元，区间和费用为空时保留 `null`，本接口不表示该发行记录当前可认购。

<a id="ipo-issue-detail--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `issue_code` | string | 是 | — | 日历中的发行记录标识，最多32字符 |

<a id="ipo-issue-detail--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/hk-share/ipo/issue-detail?issue_code=HK2636' \
  -H 'X-api-key: <your-api-key>'
```

<a id="ipo-issue-detail--响应示例"></a>
### 响应示例

示例中的列表已节选，分页与可用范围按实际响应返回。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request",
  "data": {
    "issue_code": "HK2636",
    "currency": "HKD",
    "issue_price_range": {
      "lower": 35.3,
      "upper": 38.8
    },
    "lot_size": 100,
    "entry_fee": 3919.13
  }
}
```

<a id="ipo-issue-detail--返回字段"></a>
### 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `issue_code` | string | 返回发行标识 |
| `currency` | string | HKD |
| `issue_price_range` | object \| null | 招股价格区间对象，包含可空的lower与upper；单位：HKD |
| `lot_size` | integer \| null | 每手股数；单位：股 |
| `entry_fee` | number \| null | 业务返回入场费，不自行按价格/股数推算；单位：HKD |

**`data.issue_price_range` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `lower` | number \| null | 报价下界；单位：HKD |
| `upper` | number \| null | 报价上界；单位：HKD |
