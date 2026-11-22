# 市场成交额预测

[业务导航](README.md) · **端内专用** · **同花顺AI客户端可用** · [使用说明](../README.md#端内能力说明)

- 本页接口结构用于说明同花顺AI客户端内的数据契约，当前不作为端外接入入口。
- 所有接口返回统一 `ApiResponse` 信封；时间戳为毫秒级 Unix 时间戳，时区按 `Asia/Shanghai`。
- 金额按表中币种提供，比例为小数；合法 `null` 保留字段键。分页从1开始，实际记录范围以返回值为准。

```text
GET /api/a-share/special-data/turnover-prediction-snapshot
```

查询当前市场成交额预测快照。`source_updated_at` 为业务图表更新时间；预测增减额等于预测全天成交额减昨日成交额，任一输入为空时差值为 `null`。

## 请求参数

无业务参数。

## 请求示例

以下命令仅展示接口路径与参数格式，当前不可用于外部调用。

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/special-data/turnover-prediction-snapshot'
```

## 响应示例

示例中的列表已节选，分页与可用范围按实际响应返回。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request",
  "data": {
    "timestamp": 1791957420050,
    "source_updated_at": 1791881980000,
    "predict_turnover": 1688900400000,
    "previous_turnover": 1550743500000,
    "predict_turnover_change": 138156900000
  }
}
```

## 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | integer | 快照采样时间；单位：毫秒 |
| `source_updated_at` | integer \| null | 业务数据源更新时间；单位：毫秒 |
| `predict_turnover` | number \| null | 市场预测全天成交额；单位：元 |
| `previous_turnover` | number \| null | 预测变化所参照的昨日全天成交额；单位：元 |
| `predict_turnover_change` | number \| null | 用户授权的预测增减额；任一输入为null则null；单位：元 |
