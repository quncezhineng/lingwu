# 宽基ETF申购净流入

[业务导航](README.md) · **端内专用** · **同花顺AI客户端可用** · [使用说明](../README.md#端内能力说明)

- 本页接口结构用于说明同花顺AI客户端内的数据契约，当前不作为端外接入入口。
- 所有接口返回统一 `ApiResponse` 信封；时间戳为毫秒级 Unix 时间戳，时区按 `Asia/Shanghai`。
- 金额按表中币种提供，比例为小数；合法 `null` 保留字段键。分页从1开始，实际记录范围以返回值为准。

```text
GET /api/fund/etf-flow/net-inflow-historical
```

查询宽基ETF申购净流入日统计，返回实际可用时间窗口；金额保留负值和 `null`。日统计按 T+1 次日更新约定提供，具体可用日以返回窗口为准。

## 请求参数

无业务参数。

## 请求示例

以下命令仅展示接口路径与参数格式，当前不可用于外部调用。

```bash
curl 'https://fuyao.aicubes.cn/api/fund/etf-flow/net-inflow-historical'
```

## 响应示例

示例中的列表已节选，分页与可用范围按实际响应返回。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request",
  "data": {
    "timestamp": 1791957420054,
    "available_start_date": "2026-07-14",
    "available_end_date": "2026-10-13",
    "item": [
      {
        "date_ms": 1783958400000,
        "net_inflow": 11714291730
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
| `available_start_date` | date | 本份返回序列最早日期 |
| `available_end_date` | date | 本份返回序列最晚日期，金额可能未准备 |
| `item` | array | 业务记录列表 |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `date_ms` | integer | 业务所属日期零点；单位：毫秒 |
| `net_inflow` | number \| null | 业务口径日统计净流入；保留负值与null；单位：元 |
