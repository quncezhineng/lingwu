# 涨停强度与晋级统计

[业务导航](README.md)

- 所有接口返回统一 `ApiResponse` 信封；时间戳为毫秒级 Unix 时间戳，时区按 `Asia/Shanghai`。
- 金额按表中币种提供，比例为小数；合法 `null` 保留字段键。分页从1开始，实际记录范围以返回值为准。

```text
GET /api/a-share/special-data/limit-up-statistics
```

查询封板率、涨停打开家数、页面板数档位及精确连板家数。二、三、四和五板以上的晋级率为页面档位口径；五板以上为合并档位，精确家数仅包含实际返回的板数。

## 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `date` | string | 否 | — | 查询日期，YYYY-MM-DD；默认日期与有效范围见接口说明；省略使用当天或最近交易日，范围为一年 |

## 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/special-data/limit-up-statistics?date=2026-10-12' \
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
    "timestamp": 1791957420015,
    "trade_date": "2026-10-12",
    "seal_rate": 0.647887323943662,
    "open_stock_count": 25,
    "limit_up_stock_count": 46,
    "touched_limit_up_stock_count": 71,
    "page_boards": [
      {
        "board_level": "one",
        "stock_count": 28,
        "promotion_rate": null
      },
      {
        "board_level": "two",
        "stock_count": 14,
        "promotion_rate": 0.25
      },
      {
        "board_level": "three",
        "stock_count": 1,
        "promotion_rate": 0.13
      },
      {
        "board_level": "four",
        "stock_count": 0,
        "promotion_rate": 0
      },
      {
        "board_level": "five_plus",
        "stock_count": 3,
        "promotion_rate": 0.75
      }
    ],
    "exact_boards": [
      {
        "board_num": 10,
        "stock_count": 1
      },
      {
        "board_num": 6,
        "stock_count": 2
      },
      {
        "board_num": 3,
        "stock_count": 1
      },
      {
        "board_num": 2,
        "stock_count": 14
      }
    ]
  }
}
```

## 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | integer | 采样时间；单位：毫秒 |
| `trade_date` | date | 业务所属交易日；核对请求日期 |
| `seal_rate` | number \| null | 数据返回封板率，小数保持原值；单位：小数比例 |
| `open_stock_count` | integer | 市场涨停打开股票家数；单位：家 |
| `limit_up_stock_count` | integer | 封板汇总家数；单位：家 |
| `touched_limit_up_stock_count` | integer | 返回封板率对应的汇总基数；单位：家 |
| `page_boards` | array | 页面板数档位 |
| `exact_boards` | array | 精确连板家数 |

**`data.page_boards[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `board_level` | enum | one/two/three/four/five_plus |
| `stock_count` | integer | 对应板数档位家数；单位：家 |
| `promotion_rate` | number \| null | 页面档位晋级率；five_plus为合并档位，one为null；单位：小数比例 |

**`data.exact_boards[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `board_num` | integer | 返回实际返回的精确板数，N≥2 |
| `stock_count` | integer | 恰好N板家数，由返回直接提供；单位：家 |
