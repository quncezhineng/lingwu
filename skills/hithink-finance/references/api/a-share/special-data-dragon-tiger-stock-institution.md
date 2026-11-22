# 个股机构交易详情

[业务导航](README.md)

- 所有接口返回统一 `ApiResponse` 信封；时间戳为毫秒级 Unix 时间戳，时区按 `Asia/Shanghai`。
- 金额按表中币种提供，比例为小数；合法 `null` 保留字段键。分页从1开始，实际记录范围以返回值为准。

```text
GET /api/a-share/special-data/dragon-tiger-stock-institution
```

按股票和交易日查询机构买入、卖出、净买入金额，以及机构数量、比例和营业部身份。同一股票的一日与三日上榜区间分别保留；省略区间参数时返回实际记录。

## 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单个A股标准代码 |
| `date` | string | 否 | — | 查询日期，YYYY-MM-DD；默认日期与有效范围见接口说明；省略使用最近已完成交易日，查询范围为一年 |
| `range_days` | integer | 否 | — | 上榜区间，1或3；省略返回两类实际记录 |

## 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/special-data/dragon-tiger-stock-institution?thscode=301052.SZ&date=2026-10-12' \
  -H 'X-api-key: <your-api-key>'
```

## 响应示例

示例中的列表已节选，分页与可用范围按实际响应返回。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request",
  "data": {
    "thscode": "301052.SZ",
    "trade_date": "2026-10-12",
    "item": [
      {
        "range_days": 1,
        "start_date": "2026-10-12",
        "end_date": "2026-10-12",
        "org_buy_value": 78242315.6,
        "org_sell_value": 83760760,
        "org_net_value": -5518444.4,
        "org_buy_num": 3,
        "org_sell_num": 5,
        "org_net_rate": -0.00945038,
        "buy_departments": [
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "T000027098",
            "name": "平安证券股份有限公司浙江分公司"
          },
          {
            "department_id": "T000058048",
            "name": "平安证券股份有限公司金华李渔路证券营业部"
          },
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "THS59",
            "name": "机构专用"
          }
        ],
        "sell_departments": [
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "THS59",
            "name": "机构专用"
          }
        ]
      },
      {
        "range_days": 3,
        "start_date": "2026-10-09",
        "end_date": "2026-10-12",
        "org_buy_value": 133230431.75,
        "org_sell_value": 107636728,
        "org_net_value": 25593703.75,
        "org_buy_num": 4,
        "org_sell_num": 5,
        "org_net_rate": 0.03327691,
        "buy_departments": [
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "T000027098",
            "name": "平安证券股份有限公司浙江分公司"
          }
        ],
        "sell_departments": [
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "THS59",
            "name": "机构专用"
          },
          {
            "department_id": "THS59",
            "name": "机构专用"
          }
        ]
      }
    ]
  }
}
```

## 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 股票标识 |
| `trade_date` | date | 查询日 |
| `item` | array | 业务记录列表 |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `range_days` | integer | 上榜统计区间 |
| `start_date` | date | 区间起日 |
| `end_date` | date | 区间末日 |
| `org_buy_value` | number \| null | 机构买入汇总；单位：元 |
| `org_sell_value` | number \| null | 机构卖出汇总；单位：元 |
| `org_net_value` | number \| null | 机构净买入；单位：元 |
| `org_buy_num` | integer \| null | 买入机构数 |
| `org_sell_num` | integer \| null | 卖出机构数 |
| `org_net_rate` | number \| null | 区间机构净买入比例；单位：小数比例 |
| `buy_departments[]` | array[object] | 买入席位ID与名称索引 |
| `sell_departments[]` | array[object] | 卖出席位ID与名称索引 |

营业部身份对象包含 `department_id`（营业部业务标识）与 `name`（名称，可空）。
