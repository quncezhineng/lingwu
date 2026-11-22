# 新股发行与申购

[业务导航](README.md)

- 所有接口返回统一 `ApiResponse` 信封；时间戳为毫秒级 Unix 时间戳，时区按 `Asia/Shanghai`。
- 金额按表中币种提供，比例为小数；合法 `null` 保留字段键。分页从1开始，实际记录范围以返回值为准。

```text
GET /api/a-share/ipo/calendar-list
```

按沪深或京市及待申购、可申购、待上市阶段查询股票发行记录。股票代码与申购代码分别提供，上市日期和发行价未确定时为 `null`。

## 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `market` | string | 是 | — | 适用市场：sh_sz/bj |
| `status` | string | 是 | — | 发行阶段：upcoming/subscribable/awaiting_listing |

## 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/ipo/calendar-list?market=bj&status=subscribable' \
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
    "market": "bj",
    "status": "subscribable",
    "item": [
      {
        "thscode": "920285.BJ",
        "ticker": "920285",
        "name": "远大健科",
        "subscription_code": "920285",
        "subscription_date": "2026-10-14",
        "listing_date": null,
        "issue_price": 20.3
      }
    ]
  }
}
```

## 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `market` | enum | 数据市场分组 |
| `status` | enum | 返回返回的发行阶段 |
| `item` | array | 业务记录列表 |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string \| null | 发行股票的标准形式代码 |
| `ticker` | string | 发行股票代码 |
| `name` | string | 股票名称 |
| `subscription_code` | string \| null | 申购代码 |
| `subscription_date` | date \| null | 申购日期 |
| `listing_date` | date \| null | 上市日期 |
| `issue_price` | number \| null | 返回发行价，未确定时null；单位：元 |
