# 指数数据

[业务导航](README.md)

- [同花顺指数列表](#catalog-ths-index-list)：`GET /api/a-share-index/catalog/ths-index-list`
- [同花顺指数成分股](#constituents-ths-stock-list)：`GET /api/a-share-index/constituents/ths-stock-list`
- [指数行情快照](#prices-snapshot)：`GET /api/a-share-index/prices/snapshot`
- [指数历史 K 线](#prices-historical)：`GET /api/a-share-index/prices/historical`
- [指数批量历史 K 线](#prices-historical-batch)：`GET /api/a-share-index/prices/historical-batch`

指数数据域，承载同花顺指数列表浏览、成分股清单、指数行情快照与历史 K 线。
典型调用顺序：先用 catalog 或 meta 拿到目标指数的 `thscode`，再按场景取成分股、快照或历史 K 线。

- `thscode` 入参均会被 `trim().toUpperCase()` 标准化，**不接受逗号**，单次仅支持一个指数。
- 指数行情覆盖上证交易所指数（如 `000001.SH`）、深证交易所指数（如 `399001.SZ`）、同花顺板块（如 `886042.TI`）与同花顺行业指数（如 `881101.TI`）。

<a id="catalog-ths-index-list"></a>
<a id="catalog-ths-index-list--同花顺指数列表"></a>
## 同花顺指数列表

```text
GET /api/a-share-index/catalog/ths-index-list
```

按 `tag`（概念 / 区域 / 特色 / 行业）列出同花顺指数清单，单 `tag` 一次性全量返回，
无分页参数。

<a id="catalog-ths-index-list--请求参数"></a>
### 请求参数

| 参数 | 位置 | 类型 | 必需 | 说明 | 默认值 |
|---|---|---|---|---|---|
| `tag` | query | string | 否 | 标签白名单：`cn_concept`(A 股概念) / `region`(区域指数) / `tszs`(特色指数) / `industry`(行业指数)。大小写不敏感。 | `cn_concept` |

<a id="catalog-ths-index-list--请求示例"></a>
### 请求示例

```bash
# 拉取全部概念板块
curl 'https://fuyao.aicubes.cn/api/a-share-index/catalog/ths-index-list?tag=cn_concept' \
  -H 'X-api-key: <your-api-key>'

# 拉取全部同花顺行业指数
curl 'https://fuyao.aicubes.cn/api/a-share-index/catalog/ths-index-list?tag=industry' \
  -H 'X-api-key: <your-api-key>'
```

<a id="catalog-ths-index-list--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "e5f6g7h8",
  "data": {
    "timestamp": 1748102400000,
    "item": [
      {
        "thscode": "886042.TI",
        "name": "白酒概念"
      },
      {
        "thscode": "886041.TI",
        "name": "新能源车"
      }
    ]
  }
}
```

<a id="catalog-ths-index-list--响应字段"></a>
### 响应字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间戳（毫秒）。 |
| `item[].thscode` | string | 同花顺指数的完整 thscode，如 `886042.TI`。 |
| `item[].name` | string | 同花顺指数展示名称。 |

> 指数维度不暴露纯代码 `ticker`。

<a id="constituents-ths-stock-list"></a>

<a id="constituents-ths-stock-list--同花顺指数成分股"></a>
## 同花顺指数成分股

```text
GET /api/a-share-index/constituents/ths-stock-list
```

按单个指数 `thscode` 返回当前成分股清单。
支持同花顺板块指数（如 `886042.TI`）与标准指数（如沪深 300 `000300.SH` / `399300.SZ`）。

<a id="constituents-ths-stock-list--请求参数"></a>
### 请求参数

| 参数 | 位置 | 类型 | 必需 | 说明 | 默认值 |
|---|---|---|---|---|---|
| `thscode` | query | string | 是 | 指数 thscode，形如 `{ticker}.{suffix}`。入参会被 `trim().toUpperCase()` 标准化；**不接受逗号**，单次仅支持一个指数。 | - |

<a id="constituents-ths-stock-list--请求示例"></a>
### 请求示例

```bash
# 拉取某同花顺概念板块成分股
curl 'https://fuyao.aicubes.cn/api/a-share-index/constituents/ths-stock-list?thscode=886042.TI' \
  -H 'X-api-key: <your-api-key>'

# 拉取沪深 300 成分股
curl 'https://fuyao.aicubes.cn/api/a-share-index/constituents/ths-stock-list?thscode=000300.SH' \
  -H 'X-api-key: <your-api-key>'
```

<a id="constituents-ths-stock-list--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "f6g7h8i9",
  "data": {
    "timestamp": 1748102400000,
    "item": [
      {
        "thscode": "600519.SH",
        "ticker": "600519",
        "name": "贵州茅台"
      },
      {
        "thscode": "000858.SZ",
        "ticker": "000858",
        "name": "五粮液"
      }
    ]
  }
}
```

<a id="constituents-ths-stock-list--响应字段"></a>
### 响应字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间戳（毫秒）。 |
| `item[].thscode` | string | 成分股完整 thscode。 |
| `item[].ticker` | string | 成分股纯代码。 |
| `item[].name` | string | 成分股展示名称。 |

<a id="prices-snapshot"></a>

<a id="prices-snapshot--指数行情快照"></a>
## 指数行情快照

```text
GET /api/a-share-index/prices/snapshot
```

按 `thscodes` 批量获取指数最新行情。与 A 股行情快照不同，本接口**必须传 `thscodes`**，
不支持空入参枚举全指数。

<a id="prices-snapshot--请求参数"></a>
### 请求参数

| 参数 | 位置 | 类型 | 必需 | 说明 | 默认值 |
|---|---|---|---|---|---|
| `thscodes` | query | string | 是 | 逗号分隔的指数 thscode 列表，如 `000001.SH,399001.SZ,886042.TI,881101.TI`。 | - |

<a id="prices-snapshot--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/a-share-index/prices/snapshot?thscodes=000001.SH,399001.SZ,886042.TI,881101.TI' \
  -H 'X-api-key: <your-api-key>'
```

<a id="prices-snapshot--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "7e25804be878464ba420037155f041e6",
  "data": {
    "timestamp": 1784275991000,
    "total": 4,
    "item": [
      {
        "thscode": "000001.SH",
        "ticker": "000001",
        "last_price": 3388.06,
        "price_change": 12.21,
        "price_change_ratio_pct": 0.3617,
        "open_price": 3370.25,
        "high_price": 3392.18,
        "low_price": 3365.4,
        "prev_price": 3375.85,
        "volume": 321000000,
        "turnover": 420000000000
      }
    ]
  }
}
```

<a id="prices-snapshot--响应字段"></a>
### 响应字段

`data` 为 `SnapshotData`，`item[]` 为 `PriceSnapshotItem`，字段结构与
[A 股行情快照](../a-share/prices.md#prices-snapshot--响应字段) 一致。

<a id="prices-historical"></a>

<a id="prices-historical--指数历史-k-线"></a>
## 指数历史 K 线

```text
GET /api/a-share-index/prices/historical
```

获取单只指数的历史 K 线序列。每次请求仅支持一个 `thscode`，只支持 `start` / `end` 时间区间模式，
目前仅支持查询近 5 个自然年的数据，下界以查询日（`Asia/Shanghai`）向前滚动 5 年的当地零点计算。指数无复权语义，因此没有 `adjust` 参数；本接口也没有 `offset` 参数。

<a id="prices-historical--请求参数"></a>
### 请求参数

| 参数 | 位置 | 类型 | 必需 | 说明 | 默认值 |
|---|---|---|---|---|---|
| `thscode` | query | string | 是 | 单只指数 thscode，**不接受逗号**。 | - |
| `interval` | query | string | 是 | K 线周期，当前仅支持 `1d`（日线）。 | `1d` |
| `start` | query | long | 是 | 起始时间，毫秒 Unix 时间戳。 | - |
| `end` | query | long | 是 | 结束时间，毫秒 Unix 时间戳；必须不早于 `start`，且查询区间需落在近 5 年的数据范围内。 | - |

<a id="prices-historical--请求示例"></a>
### 请求示例

```bash
# 上证综指过去一年日线
curl 'https://fuyao.aicubes.cn/api/a-share-index/prices/historical?thscode=000001.SH&interval=1d&start=1716105600000&end=1747641600000' \
  -H 'X-api-key: <your-api-key>'

# 同花顺白酒概念
curl 'https://fuyao.aicubes.cn/api/a-share-index/prices/historical?thscode=886042.TI&interval=1d&start=1716105600000&end=1747641600000' \
  -H 'X-api-key: <your-api-key>'
```

<a id="prices-historical--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "b9f91af9c77a42d6b8a04738793d2fa2",
  "data": {
    "timestamp": 1747584000000,
    "adjust": null,
    "item": [
      {
        "date_ms": 1716134400000,
        "open_price": 3108.22,
        "high_price": 3125.74,
        "low_price": 3101.15,
        "close_price": 3120.68,
        "volume": 281000000,
        "turnover": 360000000000
      }
    ]
  }
}
```

<a id="prices-historical--响应字段"></a>
### 响应字段

`data` 为 `HistoricalData`，`item[]` 为 `PriceBarItem`，字段结构与
[A 股历史 K 线](../a-share/prices.md#prices-historical--响应字段) 一致。指数接口响应中的 `data.adjust`
固定为 `null`。

<a id="prices-historical-batch"></a>
<a id="prices-historical-batch--historical-batch"></a>
<a id="prices-historical-batch--指数批量历史-k-线"></a>
## 指数批量历史 K 线

```text
GET /api/a-share-index/prices/historical-batch
```

在同一时间窗口比较交易所指数、同花顺概念或行业指数。单次最多 10 个代码，仅支持日线 `1d`；查询范围为近 5 个自然年，下界以本次查询日（`Asia/Shanghai`）向前滚动 5 年的当地零点计算。例如查询日为 2026-11-03，下界为 2021-11-03 零点；并非任意两个历史日期间的 5 年跨度。

这是原生批量查询接口；所有代码共用查询条件。去除代码首尾空白、按现有代码格式规范化后去重，按首次出现顺序返回。上限先按原始代码项数检查，重复代码仍占用请求额度。

<a id="prices-historical-batch--请求参数"></a>
### 请求参数

| 参数 | 位置 | 类型 | 必需 | 说明 | 默认值 |
|---|---|---|---|---|---|
| `thscodes` | query | string | 是 | 英文逗号分隔的完整代码，如 `000001.SH,399001.SZ`；最多 10 个，按去重前数量计数。 | — |
| `interval` | query | string | 是 | K 线周期，当前仅支持 `1d`（日线）。 | — |
| `start` | query | long | 是 | 起始时间，毫秒 Unix 时间戳；须为非负毫秒时间戳。 | - |
| `end` | query | long | 是 | 结束时间，毫秒 Unix 时间戳；必须不早于 `start`，且查询区间需落在近 5 年的数据范围内；须为非负毫秒时间戳。 | - |

<a id="prices-historical-batch--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/a-share-index/prices/historical-batch?thscodes=000001.SH,399001.SZ&interval=1d&start=1735660800000&end=1767196800000' \
  -H 'X-api-key: <your-api-key>'
```

<a id="prices-historical-batch--响应示例"></a>
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
        "thscode": "000001.SH",
        "timestamp": 1767110400000,
        "item": [
          {
            "date_ms": 1767110400000,
            "open_price": 3108.22,
            "high_price": 3125.74,
            "low_price": 3101.15,
            "close_price": 3120.68,
            "volume": 281000000,
            "turnover": 360000000000
          }
        ]
      },
      {
        "thscode": "399001.SZ",
        "timestamp": null,
        "item": []
      }
    ]
  }
}
```

<a id="prices-historical-batch--返回字段"></a>
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
详细业务字段、单位和空值说明见[指数历史 K 线](#prices-historical--指数历史-k-线)。

有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。
