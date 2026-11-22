# 财务报表

[业务导航](README.md)

- [利润表](#financials-income-statements)：`GET /api/a-share/financials/income-statements`
- [资产负债表](#financials-balance-sheets)：`GET /api/a-share/financials/balance-sheets`
- [现金流量表](#financials-cash-flow-statements)：`GET /api/a-share/financials/cash-flow-statements`
- [批量利润表](#financials-income-statements-batch)：`GET /api/a-share/financials/income-statements-batch`
- [批量资产负债表](#financials-balance-sheets-batch)：`GET /api/a-share/financials/balance-sheets-batch`
- [批量现金流量表](#financials-cash-flow-statements-batch)：`GET /api/a-share/financials/cash-flow-statements-batch`

财务报表模块，提供 A 股整体合并报表（consolidated）多期序列，覆盖利润表、资产负债表、现金流量表。
三个接口入参契约**完全一致**，仅返回字段不同（见各自小节）。
所有接口均返回统一响应信封 `ApiResponse`，业务错误经 `code` 字段表达，HTTP 状态码恒为 200。

- 所有金额字段单位为**原币元**，`basic_eps` 单位为**元/股**（量级远小于金额字段，不可做单位换算）；A 股币种恒为 `CNY`。
- 字段为 `null` 表示「该期未披露」，透传不补零。

<a id="financials-income-statements--取数模式"></a>

**取数模式**

三个接口共用两种取数模式，**互斥、二选一**：

| 模式 | 触发条件 | 行为 |
|---|---|---|
| 最近 N 期 | 不传 `start` / `end` | 返回最近 `limit` 期，按 `period_end` 降序。 |
| 时间区间 | 同时传 `start` + `end`（毫秒戳） | 返回 `[start, end]` 闭区间内全部报告期，按 `period_end` 降序。 |

同时传 `start`/`end` 与 `limit`，或仅传 `start`、仅传 `end`（半开区间），返回 `code=1004`。

<a id="financials-income-statements--共有请求参数"></a>

**共有请求参数**

| 参数 | 位置 | 类型 | 必需 | 说明 | 默认值 |
|---|---|---|---|---|---|
| `thscode` | query | string | 是 | 单只标的 thscode，**不接受逗号**；含交易所后缀（如 `600519.SH` / `000858.SZ` / `430047.BJ`）。 | - |
| `period` | query | enum | 是 | 报告期类型：`annual`(仅 Q4 报告期) / `quarterly`(每个季度末)。 | `annual` |
| `limit` | query | integer | 否 | 最近 N 期模式：默认 4，范围 `[1, 20]`。**与 `start`/`end` 互斥**。 | `4` |
| `start` | query | long | 否 | 时间区间模式：起始毫秒戳，需与 `end` 同传；窗口跨度不超过 10 年。 | - |
| `end` | query | long | 否 | 时间区间模式：结束毫秒戳，`end >= start`。 | - |

<a id="financials-income-statements--共有响应字段"></a>

**共有响应字段**

每条 `item` 都含以下元数据字段，`data.timestamp` 取响应中最大的 `period_end_ms`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的完整 thscode。 |
| `ticker` | string | 纯代码（不含后缀）。 |
| `period` | enum | 入参 `period` 回显。 |
| `fiscal_year` | int | 财年（自然年）。 |
| `fiscal_period` | string | `FY` / `Q1` / `Q2` / `Q3` / `Q4`。 |
| `report_date_ms` | long | 披露日（毫秒）。 |
| `period_end_ms` | long | 报告期末（Asia/Shanghai 零点毫秒戳）。 |
| `currency` | string | 币种，A 股恒为 `CNY`。 |

<a id="financials-income-statements"></a>
<a id="financials-income-statements--利润表"></a>
## 利润表

```text
GET /api/a-share/financials/income-statements
```

A 股整体合并利润表多期序列。取数模式与参数见上文。

<a id="financials-income-statements--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只标的 thscode，不接受逗号；含交易所后缀。 |
| `period` | enum | 是 | `annual` | `annual`（仅 Q4 报告期）/ `quarterly`（每个季度末）。 |
| `limit` | integer | 否 | `4` | 最近 N 期模式，范围 `[1, 20]`；与 `start` / `end` 互斥。 |
| `start` | long | 否 | — | 时间区间模式起始毫秒戳，需与 `end` 同传。 |
| `end` | long | 否 | — | 时间区间模式结束毫秒戳，需满足 `end >= start`。 |

<a id="financials-income-statements--请求示例"></a>
### 请求示例

```bash
# 最近 3 期年报
curl 'https://fuyao.aicubes.cn/api/a-share/financials/income-statements?thscode=600519.SH&period=annual&limit=3' \
  -H 'X-api-key: <your-api-key>'

# 2023Q1–2024Q4 全部季报（时间区间模式）
# start = 2023-01-01 00:00:00+08:00 → 1672502400000
# end   = 2024-12-31 00:00:00+08:00 → 1735574400000
curl 'https://fuyao.aicubes.cn/api/a-share/financials/income-statements?thscode=600519.SH&period=quarterly&start=1672502400000&end=1735574400000' \
  -H 'X-api-key: <your-api-key>'
```

<a id="financials-income-statements--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "e5f6g7h8",
  "data": {
    "timestamp": 1735574400000,
    "item": [
      {
        "thscode": "600519.SH",
        "ticker": "600519",
        "period": "annual",
        "fiscal_year": 2024,
        "fiscal_period": "FY",
        "report_date_ms": 1735574400000,
        "period_end_ms": 1735574400000,
        "currency": "CNY",
        "operating_income": 174144000000,
        "operating_costs": 13000000000,
        "operating_expenses": 50000000000,
        "sales_fee": 5000000000,
        "manage_fee": 9000000000,
        "research_and_development_expenses": 150000000,
        "operating_profit": 124000000000,
        "interest_expenses": 0,
        "profit_total": 124000000000,
        "income_tax_expense": 31000000000,
        "net_profit": 93000000000,
        "parent_holder_net_profit": 86000000000,
        "basic_eps": 68.50
      }
    ]
  }
}
```

<a id="financials-income-statements--income-statements-return-fields"></a>
<a id="financials-income-statements--返回字段"></a>
### 返回字段

除上文“共有响应字段”外，利润表 `data.item[]` 还包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `operating_income` | number | 营业收入（原币元）。 |
| `operating_costs` | number | 营业成本（原币元）。 |
| `operating_expenses` | number | 营业总成本（原币元）。 |
| `sales_fee` | number | 销售费用（原币元）。 |
| `manage_fee` | number | 管理费用（原币元）。 |
| `research_and_development_expenses` | number | 研发费用（原币元）。 |
| `operating_profit` | number | 营业利润（原币元）。 |
| `interest_expenses` | number | 利息费用（原币元）。 |
| `profit_total` | number | 利润总额（原币元）。 |
| `income_tax_expense` | number | 所得税费用（原币元）。 |
| `net_profit` | number | 净利润（原币元）。 |
| `parent_holder_net_profit` | number | 归属于母公司股东的净利润（原币元）。 |
| `basic_eps` | number | 基本每股收益（元/股）。 |

<a id="financials-balance-sheets"></a>
<a id="financials-balance-sheets--取数模式"></a>
<a id="financials-balance-sheets--共有请求参数"></a>
<a id="financials-balance-sheets--共有响应字段"></a>
<a id="financials-balance-sheets--资产负债表"></a>
## 资产负债表

```text
GET /api/a-share/financials/balance-sheets
```

A 股整体合并资产负债表多期序列。取数模式与参数同利润表。

<a id="financials-balance-sheets--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只标的 thscode，不接受逗号；含交易所后缀。 |
| `period` | enum | 是 | `annual` | `annual`（仅 Q4 报告期）/ `quarterly`（每个季度末）。 |
| `limit` | integer | 否 | `4` | 最近 N 期模式，范围 `[1, 20]`；与 `start` / `end` 互斥。 |
| `start` | long | 否 | — | 时间区间模式起始毫秒戳，需与 `end` 同传。 |
| `end` | long | 否 | — | 时间区间模式结束毫秒戳，需满足 `end >= start`。 |

<a id="financials-balance-sheets--请求示例"></a>
### 请求示例

```bash
# 五粮液最近 4 期季报（默认 limit=4）
curl 'https://fuyao.aicubes.cn/api/a-share/financials/balance-sheets?thscode=000858.SZ&period=quarterly' \
  -H 'X-api-key: <your-api-key>'
```

<a id="financials-balance-sheets--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "f6g7h8i9",
  "data": {
    "timestamp": 1735574400000,
    "item": [
      {
        "thscode": "000858.SZ",
        "ticker": "000858",
        "period": "quarterly",
        "fiscal_year": 2024,
        "fiscal_period": "Q4",
        "report_date_ms": 1735574400000,
        "period_end_ms": 1735574400000,
        "currency": "CNY",
        "assets_total": 250000000000,
        "total_current_assets": 200000000000,
        "non_current_nets_total": 50000000000,
        "cash": 130000000000,
        "accounts_receivable": 500000000,
        "total_debt": 60000000000,
        "holder_equity_total": 190000000000
      }
    ]
  }
}
```

<a id="financials-balance-sheets--balance-sheets-return-fields"></a>
<a id="financials-balance-sheets--返回字段"></a>
### 返回字段

除上文“共有响应字段”外，资产负债表 `data.item[]` 还包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `assets_total` | number | 资产总计（原币元）。 |
| `total_current_assets` | number | 流动资产合计（原币元）。 |
| `non_current_nets_total` | number | 非流动资产合计（原币元）。 |
| `cash` | number | 货币资金（原币元）。 |
| `accounts_receivable` | number | 应收账款（原币元）。 |
| `total_debt` | number | 负债合计（原币元）。 |
| `holder_equity_total` | number | 所有者权益（股东权益）合计（原币元）。 |

<a id="financials-cash-flow-statements"></a>
<a id="financials-cash-flow-statements--取数模式"></a>
<a id="financials-cash-flow-statements--共有请求参数"></a>
<a id="financials-cash-flow-statements--共有响应字段"></a>
<a id="financials-cash-flow-statements--现金流量表"></a>
## 现金流量表

```text
GET /api/a-share/financials/cash-flow-statements
```

A 股整体合并现金流量表多期序列。取数模式与参数同利润表。

<a id="financials-cash-flow-statements--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只标的 thscode，不接受逗号；含交易所后缀。 |
| `period` | enum | 是 | `annual` | `annual`（仅 Q4 报告期）/ `quarterly`（每个季度末）。 |
| `limit` | integer | 否 | `4` | 最近 N 期模式，范围 `[1, 20]`；与 `start` / `end` 互斥。 |
| `start` | long | 否 | — | 时间区间模式起始毫秒戳，需与 `end` 同传。 |
| `end` | long | 否 | — | 时间区间模式结束毫秒戳，需满足 `end >= start`。 |

<a id="financials-cash-flow-statements--请求示例"></a>
### 请求示例

```bash
# 茅台 2020–2024 全部年报（时间区间模式）
# start = 2020-01-01 00:00:00+08:00 → 1577808000000
# end   = 2024-12-31 00:00:00+08:00 → 1735574400000
curl 'https://fuyao.aicubes.cn/api/a-share/financials/cash-flow-statements?thscode=600519.SH&period=annual&start=1577808000000&end=1735574400000' \
  -H 'X-api-key: <your-api-key>'
```

<a id="financials-cash-flow-statements--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "g7h8i9j0",
  "data": {
    "timestamp": 1735574400000,
    "item": [
      {
        "thscode": "600519.SH",
        "ticker": "600519",
        "period": "annual",
        "fiscal_year": 2024,
        "fiscal_period": "FY",
        "report_date_ms": 1735574400000,
        "period_end_ms": 1735574400000,
        "currency": "CNY",
        "act_cash_flow_net": 92000000000,
        "invest_cash_flow_net": -3000000000,
        "financing_cash_flow_net": -65000000000,
        "pay_fixed_assets_etc_cash": 3500000000,
        "pay_dividends_profits_interest_cash": 64000000000,
        "cash_equivalents_net_addition": 24000000000
      }
    ]
  }
}
```

<a id="financials-cash-flow-statements--cash-flow-statements-return-fields"></a>
<a id="financials-cash-flow-statements--返回字段"></a>
### 返回字段

除上文“共有响应字段”外，现金流量表 `data.item[]` 还包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `act_cash_flow_net` | number | 经营活动产生的现金流量净额（原币元）。 |
| `invest_cash_flow_net` | number | 投资活动产生的现金流量净额（原币元）。 |
| `financing_cash_flow_net` | number | 筹资活动产生的现金流量净额（原币元）。 |
| `pay_fixed_assets_etc_cash` | number | 购建固定资产、无形资产和其他长期资产支付的现金（原币元）。 |
| `pay_dividends_profits_interest_cash` | number | 分配股利、利润或偿付利息支付的现金（原币元）。 |
| `cash_equivalents_net_addition` | number | 现金及现金等价物净增加额（原币元）。 |

<a id="financials-income-statements-batch"></a>
<a id="financials-income-statements-batch--取数模式"></a>
<a id="financials-income-statements-batch--共有请求参数"></a>
<a id="financials-income-statements-batch--共有响应字段"></a>
<a id="financials-income-statements-batch--income-statements-batch"></a>
<a id="financials-income-statements-batch--批量利润表"></a>
## 批量利润表

```text
GET /api/a-share/financials/income-statements-batch
```

对比多只 A 股的整体合并利润表，单次最多 10 个代码。所有标的共用报告期和取数模式：`annual` / `quarterly`；最近 N 期的 `limit` 默认 4、范围 1 至 20；或同时提供 `start` / `end` 查询不超过 10 个自然年的区间。两种模式互斥，半开区间或区间与 `limit` 混用返回 `1004`。

这是原生批量查询接口；所有代码共用查询条件。去除代码首尾空白、按现有代码格式规范化后去重，按首次出现顺序返回。上限先按原始代码项数检查，重复代码仍占用请求额度。

<a id="financials-income-statements-batch--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 英文逗号分隔的完整代码，如 `600519.SH,000858.SZ`；最多 10 个，按去重前数量计数。 |
| `period` | enum | 是 | — | `annual`（仅 Q4 报告期）/ `quarterly`（每个季度末）。 |
| `limit` | integer | 否 | `4` | 最近 N 期模式，范围 `[1, 20]`；与 `start` / `end` 互斥。 |
| `start` | long | 否 | — | 时间区间模式起始毫秒戳，需与 `end` 同传；须为非负毫秒时间戳。 |
| `end` | long | 否 | — | 时间区间模式结束毫秒戳，需满足 `end >= start`；须为非负毫秒时间戳。 |

<a id="financials-income-statements-batch--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/financials/income-statements-batch?thscodes=600519.SH,000858.SZ&period=annual&limit=4' \
  -H 'X-api-key: <your-api-key>'
```

<a id="financials-income-statements-batch--响应示例"></a>
### 响应示例

以下示例包含一个有记录的标的组和一个合法空组。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "compact-batch-example",
  "data": {
    "item": [
      {
        "thscode": "600519.SH",
        "timestamp": 1735574400000,
        "item": [
          {
            "thscode": "600519.SH",
            "ticker": "600519",
            "period": "annual",
            "fiscal_year": 2024,
            "fiscal_period": "FY",
            "report_date_ms": 1735574400000,
            "period_end_ms": 1735574400000,
            "currency": "CNY",
            "operating_income": 174144000000,
            "operating_costs": 13000000000,
            "operating_expenses": 50000000000,
            "sales_fee": 5000000000,
            "manage_fee": 9000000000,
            "research_and_development_expenses": 150000000,
            "operating_profit": 124000000000,
            "interest_expenses": 0,
            "profit_total": 124000000000,
            "income_tax_expense": 31000000000,
            "net_profit": 93000000000,
            "parent_holder_net_profit": 86000000000,
            "basic_eps": 68.5
          }
        ]
      },
      {
        "thscode": "000858.SZ",
        "timestamp": null,
        "item": []
      }
    ]
  }
}
```

<a id="financials-income-statements-batch--返回字段"></a>
### 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `item` | array | 按规范化代码首次出现顺序返回的有效标的组。 |
| `item[].thscode` | string | 该组的完整同花顺代码。 |
| `item[].timestamp` | long \| null | 该组数据时间；合法空组为 `null`。 |
| `item[].item` | array | 该标的的原始业务记录；合法空组为 `[]`。 |

每组 `item[]` 沿用原财报的全部字段及报告期倒序，包括行级 `thscode`、`ticker`、报告期和币种等元数据。`limit` 按每个代码分别生效。
详细业务字段、单位和空值说明见[利润表](#financials-income-statements--income-statements-return-fields)。

有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

<a id="financials-balance-sheets-batch"></a>
<a id="financials-balance-sheets-batch--取数模式"></a>
<a id="financials-balance-sheets-batch--共有请求参数"></a>
<a id="financials-balance-sheets-batch--共有响应字段"></a>
<a id="financials-balance-sheets-batch--balance-sheets-batch"></a>
<a id="financials-balance-sheets-batch--批量资产负债表"></a>
## 批量资产负债表

```text
GET /api/a-share/financials/balance-sheets-batch
```

对比多只 A 股的整体合并资产负债表，单次最多 10 个代码。所有标的共用报告期和取数模式：`annual` / `quarterly`；最近 N 期的 `limit` 默认 4、范围 1 至 20；或同时提供 `start` / `end` 查询不超过 10 个自然年的区间。两种模式互斥，半开区间或区间与 `limit` 混用返回 `1004`。

这是原生批量查询接口；所有代码共用查询条件。去除代码首尾空白、按现有代码格式规范化后去重，按首次出现顺序返回。上限先按原始代码项数检查，重复代码仍占用请求额度。

<a id="financials-balance-sheets-batch--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 英文逗号分隔的完整代码，如 `600519.SH,000858.SZ`；最多 10 个，按去重前数量计数。 |
| `period` | enum | 是 | — | `annual`（仅 Q4 报告期）/ `quarterly`（每个季度末）。 |
| `limit` | integer | 否 | `4` | 最近 N 期模式，范围 `[1, 20]`；与 `start` / `end` 互斥。 |
| `start` | long | 否 | — | 时间区间模式起始毫秒戳，需与 `end` 同传；须为非负毫秒时间戳。 |
| `end` | long | 否 | — | 时间区间模式结束毫秒戳，需满足 `end >= start`；须为非负毫秒时间戳。 |

<a id="financials-balance-sheets-batch--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/financials/balance-sheets-batch?thscodes=600519.SH,000858.SZ&period=annual&limit=4' \
  -H 'X-api-key: <your-api-key>'
```

<a id="financials-balance-sheets-batch--响应示例"></a>
### 响应示例

以下示例包含一个有记录的标的组和一个合法空组。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "compact-batch-example",
  "data": {
    "item": [
      {
        "thscode": "600519.SH",
        "timestamp": 1735574400000,
        "item": [
          {
            "thscode": "600519.SH",
            "ticker": "600519",
            "period": "quarterly",
            "fiscal_year": 2024,
            "fiscal_period": "Q4",
            "report_date_ms": 1735574400000,
            "period_end_ms": 1735574400000,
            "currency": "CNY",
            "assets_total": 250000000000,
            "total_current_assets": 200000000000,
            "non_current_nets_total": 50000000000,
            "cash": 130000000000,
            "accounts_receivable": 500000000,
            "total_debt": 60000000000,
            "holder_equity_total": 190000000000
          }
        ]
      },
      {
        "thscode": "000858.SZ",
        "timestamp": null,
        "item": []
      }
    ]
  }
}
```

<a id="financials-balance-sheets-batch--返回字段"></a>
### 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `item` | array | 按规范化代码首次出现顺序返回的有效标的组。 |
| `item[].thscode` | string | 该组的完整同花顺代码。 |
| `item[].timestamp` | long \| null | 该组数据时间；合法空组为 `null`。 |
| `item[].item` | array | 该标的的原始业务记录；合法空组为 `[]`。 |

每组 `item[]` 沿用原财报的全部字段及报告期倒序，包括行级 `thscode`、`ticker`、报告期和币种等元数据。`limit` 按每个代码分别生效。
详细业务字段、单位和空值说明见[资产负债表](#financials-balance-sheets--balance-sheets-return-fields)。

有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

<a id="financials-cash-flow-statements-batch"></a>
<a id="financials-cash-flow-statements-batch--取数模式"></a>
<a id="financials-cash-flow-statements-batch--共有请求参数"></a>
<a id="financials-cash-flow-statements-batch--共有响应字段"></a>
<a id="financials-cash-flow-statements-batch--cash-flow-statements-batch"></a>
<a id="financials-cash-flow-statements-batch--批量现金流量表"></a>
## 批量现金流量表

```text
GET /api/a-share/financials/cash-flow-statements-batch
```

对比多只 A 股的整体合并现金流量表，单次最多 10 个代码。所有标的共用报告期和取数模式：`annual` / `quarterly`；最近 N 期的 `limit` 默认 4、范围 1 至 20；或同时提供 `start` / `end` 查询不超过 10 个自然年的区间。两种模式互斥，半开区间或区间与 `limit` 混用返回 `1004`。

这是原生批量查询接口；所有代码共用查询条件。去除代码首尾空白、按现有代码格式规范化后去重，按首次出现顺序返回。上限先按原始代码项数检查，重复代码仍占用请求额度。

<a id="financials-cash-flow-statements-batch--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 英文逗号分隔的完整代码，如 `600519.SH,000858.SZ`；最多 10 个，按去重前数量计数。 |
| `period` | enum | 是 | — | `annual`（仅 Q4 报告期）/ `quarterly`（每个季度末）。 |
| `limit` | integer | 否 | `4` | 最近 N 期模式，范围 `[1, 20]`；与 `start` / `end` 互斥。 |
| `start` | long | 否 | — | 时间区间模式起始毫秒戳，需与 `end` 同传；须为非负毫秒时间戳。 |
| `end` | long | 否 | — | 时间区间模式结束毫秒戳，需满足 `end >= start`；须为非负毫秒时间戳。 |

<a id="financials-cash-flow-statements-batch--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/financials/cash-flow-statements-batch?thscodes=600519.SH,000858.SZ&period=annual&limit=4' \
  -H 'X-api-key: <your-api-key>'
```

<a id="financials-cash-flow-statements-batch--响应示例"></a>
### 响应示例

以下示例包含一个有记录的标的组和一个合法空组。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "compact-batch-example",
  "data": {
    "item": [
      {
        "thscode": "600519.SH",
        "timestamp": 1735574400000,
        "item": [
          {
            "thscode": "600519.SH",
            "ticker": "600519",
            "period": "annual",
            "fiscal_year": 2024,
            "fiscal_period": "FY",
            "report_date_ms": 1735574400000,
            "period_end_ms": 1735574400000,
            "currency": "CNY",
            "act_cash_flow_net": 92000000000,
            "invest_cash_flow_net": -3000000000,
            "financing_cash_flow_net": -65000000000,
            "pay_fixed_assets_etc_cash": 3500000000,
            "pay_dividends_profits_interest_cash": 64000000000,
            "cash_equivalents_net_addition": 24000000000
          }
        ]
      },
      {
        "thscode": "000858.SZ",
        "timestamp": null,
        "item": []
      }
    ]
  }
}
```

<a id="financials-cash-flow-statements-batch--返回字段"></a>
### 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `item` | array | 按规范化代码首次出现顺序返回的有效标的组。 |
| `item[].thscode` | string | 该组的完整同花顺代码。 |
| `item[].timestamp` | long \| null | 该组数据时间；合法空组为 `null`。 |
| `item[].item` | array | 该标的的原始业务记录；合法空组为 `[]`。 |

每组 `item[]` 沿用原财报的全部字段及报告期倒序，包括行级 `thscode`、`ticker`、报告期和币种等元数据。`limit` 按每个代码分别生效。
详细业务字段、单位和空值说明见[现金流量表](#financials-cash-flow-statements--cash-flow-statements-return-fields)。

有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。
