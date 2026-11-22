# 基金行情数据

[业务导航](README.md)

- [场内基金行情快照](#market-snapshot)：`GET /api/fund/market/snapshot`
- [场内基金历史日线行情](#market-historical)：`GET /api/fund/market/historical`
- [场内基金批量历史日线行情](#market-historical-batch)：`GET /api/fund/market/historical-batch`

- 标的代码须带市场后缀。快照接口使用 `thscode`（支持英文逗号分隔），历史批量接口使用 `thscodes`；快照支持 ETF/LOF，历史日线仅支持 ETF。价格字段按原始货币计价。

<a id="market-snapshot"></a>
<a id="market-snapshot--场内基金行情快照"></a>
## 场内基金行情快照

```text
GET /api/fund/market/snapshot
```

支持 ETF 和 LOF，`thscode` 可传单个代码或英文逗号分隔的多个代码，每次最多 100 个原始代码项。规范化后稳定去重，一次请求返回平铺行情记录。未知、不支持或缺报价的项目省略。

<a id="market-snapshot--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 1 至 100 个完整 ETF/LOF 代码，英文逗号分隔，如 `510300.SH,161725.SZ`；先检查原始项数，再去除首尾空白、转大写并稳定去重。 |

空段返回 `1002`，超过 100 个原始项返回 `1003`。去重后仅一个目标且不支持其类型返回 `3004`；其它零有效目标返回 `3001`；有效目标全部无报价返回 `3002`。

<a id="market-snapshot--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/fund/market/snapshot?thscode=510300.SH,161725.SZ' \
  -H 'X-api-key: <your-api-key>'
```

<a id="market-snapshot--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "558cdc5105964a93953b1a541e7af901",
  "data": {
    "timestamp": 1784210584000,
    "item": [
      {
        "thscode": "510300.SH",
        "ticker": "510300",
        "last_price": 4.753,
        "open_price": 4.775,
        "high_price": 4.825,
        "low_price": 4.724,
        "prev_price": 4.838,
        "price_change_ratio_pct": -1.756924,
        "price_change": -0.085,
        "volume": 1657822800,
        "turnover": 7909234100,
        "price_amplitude_ratio_pct": 2.08764,
        "turnover_ratio_pct": 9.012068
      }
    ]
  }
}
```

<a id="market-snapshot--返回字段"></a>
### 返回字段

`data.timestamp` 为本次快照最新的上游有效时间，使用毫秒级 Unix 时间戳；无有效数据时为 `null`。

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | ETF 或 LOF 的完整同花顺代码。 |
| `ticker` | string | ETF 或 LOF 的纯基金代码，仅用于展示。 |
| `last_price` | number | 最新价。 |
| `open_price` | number | 开盘价。 |
| `high_price` | number | 最高价。 |
| `low_price` | number | 最低价。 |
| `prev_price` | number | 昨收价。 |
| `price_change_ratio_pct` | number | 涨跌幅，百分数原值。 |
| `price_change` | number | 涨跌额。 |
| `price_amplitude_ratio_pct` | number | 振幅，百分数原值。 |
| `volume` | number | 成交量。 |
| `turnover` | number | 成交额。 |
| `turnover_ratio_pct` | number | 换手率，百分数原值。 |

<a id="market-historical"></a>

<a id="market-historical--场内基金历史日线行情"></a>
## 场内基金历史日线行情

```text
GET /api/fund/market/historical
```

仅支持 ETF；单次只允许一个 `thscode`，查询窗口最长 5 个自然年。价格数据采用前复权口径；实际行情可获取范围为近 5 年。

<a id="market-historical--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只 ETF 的完整 thscode，必须保留市场后缀；不接受逗号分隔的多个值。 |
| `interval` | string | 否 | `1d` | K 线周期，当前仅支持 `1d`（日线）。 |
| `start` | long | 是 | — | 起始时间，毫秒级 Unix 时间戳。 |
| `end` | long | 是 | — | 结束时间，毫秒级 Unix 时间戳；必须不早于 `start`，且窗口最长 5 个自然年。 |

<a id="market-historical--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/fund/market/historical?thscode=510300.SH&interval=1d&start=1626451200000&end=1784217600000' \
  -H 'X-api-key: <your-api-key>'
```

<a id="market-historical--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "f47444ed0e0d4e1c883ecb66511dc311",
  "data": {
    "timestamp": 1784131200000,
    "thscode": "510300.SH",
    "interval": "1d",
    "adjust": null,
    "item": [
      {
        "date_ms": 1626624000000,
        "volume": 332046160,
        "turnover": 1709347700,
        "open_price": 4.728,
        "high_price": 4.769,
        "low_price": 4.687,
        "close_price": 4.759
      },
      {
        "date_ms": 1626710400000,
        "volume": 306679330,
        "turnover": 1581145200,
        "open_price": 4.721,
        "high_price": 4.76,
        "low_price": 4.712,
        "close_price": 4.746
      }
    ]
  }
}
```

<a id="market-historical--返回字段"></a>
### 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据就绪时间，取序列中最新一根 K 线的有效时间。 |
| `thscode` | string | 请求中的 ETF thscode。 |
| `interval` | string | K 线周期，固定为 `1d`。 |
| `adjust` | null | 当前固定为 `null`；价格数据仍采用前复权口径。 |
| `item` | array | 历史日线数据列表。 |

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `date_ms` | long | 交易日期，毫秒级 Unix 时间戳。 |
| `open_price` | number | 前复权开盘价。 |
| `high_price` | number | 前复权最高价。 |
| `low_price` | number | 前复权最低价。 |
| `close_price` | number | 前复权收盘价。 |
| `volume` | number | 成交量。 |
| `turnover` | number | 成交额。 |

通用参数与错误码参见[基金 API 总览](README.md)。

<a id="market-historical-batch"></a>
<a id="market-historical-batch--historical-batch"></a>
<a id="market-historical-batch--场内基金批量历史日线行情"></a>
## 场内基金批量历史日线行情

```text
GET /api/fund/market/historical-batch
```

比较多只 ETF 的前复权历史日线，单次最多 10 个代码，仅支持 `1d`。查询窗口最长 5 个自然年，可获取的实际行情为近 5 年；较早数据可能为空，5 年窗口上限并不保证任意历史年份均有行情。

这是原生批量查询接口；所有代码共用查询条件。去除代码首尾空白、按现有代码格式规范化后去重，按首次出现顺序返回。上限先按原始代码项数检查，重复代码仍占用请求额度。

<a id="market-historical-batch--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 英文逗号分隔的完整代码，如 `510300.SH,159915.SZ`；最多 10 个，按去重前数量计数。 |
| `interval` | string | 否 | `1d` | K 线周期，当前仅支持 `1d`（日线）。 |
| `start` | long | 是 | — | 起始时间，毫秒级 Unix 时间戳；须为非负毫秒时间戳。 |
| `end` | long | 是 | — | 结束时间，毫秒级 Unix 时间戳；必须不早于 `start`，且窗口最长 5 个自然年；须为非负毫秒时间戳。 |

<a id="market-historical-batch--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/fund/market/historical-batch?thscodes=510300.SH,159915.SZ&interval=1d&start=1735660800000&end=1767196800000' \
  -H 'X-api-key: <your-api-key>'
```

<a id="market-historical-batch--响应示例"></a>
### 响应示例

以下示例包含一个有记录的标的组和一个合法空组。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "compact-batch-example",
  "data": {
    "interval": "1d",
    "adjust": null,
    "item": [
      {
        "thscode": "510300.SH",
        "timestamp": 1767110400000,
        "item": [
          {
            "date_ms": 1767110400000,
            "volume": 332046160,
            "turnover": 1709347700,
            "open_price": 4.728,
            "high_price": 4.769,
            "low_price": 4.687,
            "close_price": 4.759
          },
          {
            "date_ms": 1767110400000,
            "volume": 306679330,
            "turnover": 1581145200,
            "open_price": 4.721,
            "high_price": 4.76,
            "low_price": 4.712,
            "close_price": 4.746
          }
        ]
      },
      {
        "thscode": "159915.SZ",
        "timestamp": null,
        "item": []
      }
    ]
  }
}
```

<a id="market-historical-batch--返回字段"></a>
### 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `interval` | string | 固定为 `1d`（日线）。 |
| `adjust` | null | 固定为 `null`。 |
| `item` | array | 按规范化代码首次出现顺序返回的有效标的组。 |
| `item[].thscode` | string | 该组的完整同花顺代码。 |
| `item[].timestamp` | long \| null | 该组数据时间；合法空组为 `null`。 |
| `item[].item` | array | 该标的的原始业务记录；合法空组为 `[]`。 |

每组 `item[]` 沿用原 K 线字段和升序；K 线记录本身不增加标的代码。
详细业务字段、单位和空值说明见[场内基金历史日线行情](#market-historical--场内基金历史日线行情)。

有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。
