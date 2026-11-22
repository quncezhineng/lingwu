# 异动股票

[业务导航](README.md)

- 所有接口返回统一 `ApiResponse` 信封；时间戳为毫秒级 Unix 时间戳，时区按 `Asia/Shanghai`。
- 金额按表中币种提供，比例为小数；合法 `null` 保留字段键。分页从1开始，实际记录范围以返回值为准。

```text
GET /api/a-share/special-data/abnormal-monitor-list
```

查询当前或历史异动监控记录。开始和结束日期保留原监控区间，结束日期可为空；类型码 `1`、`2` 对应严重异动，其余为重点监控。

成功响应中的代码与名称可能为null或空字符串，字段键和全部记录保留；分页信息按实际源返回。

## 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `state` | string | 否 | `current` | current或history |
| `page` | integer | 否 | `1` | 从1开始的页码 |
| `size` | integer | 否 | `30` | 每页1至30条，默认30 |

## 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/special-data/abnormal-monitor-list?state=current&page=1&size=30' \
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
    "item": [
      {
        "thscode": "600825.SH",
        "name": "新华传媒",
        "start_date_ms": 1791734400000,
        "end_date_ms": 1792684800000,
        "monitor_type": 1,
        "monitor_label": "严重异动"
      }
    ],
    "pagination": {
      "page": 1,
      "size": 30,
      "total": 6,
      "has_next": false
    }
  }
}
```

## 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `item` | array | 业务记录列表 |
| `pagination` | object | 分页对象，包含page、size、total和has_next |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string \| null | 股票标准代码 ；源null或空字符串原样保留，缺失值为null |
| `name` | string \| null | 股票名称 ；源null或空字符串原样保留，缺失值为null |
| `start_date_ms` | integer | 监控开始日期；单位：毫秒 |
| `end_date_ms` | integer \| null | 结束日期；单位：毫秒 |
| `monitor_type` | integer | 原始业务类型码 |
| `monitor_label` | string | 1/2=严重异动，其它=重点监控 |

**`data.pagination` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `page` | integer | 从1开始的页码 |
| `size` | integer | 本页请求大小 |
| `total` | integer \| null | 结果总数；未提供时为null |
| `has_next` | boolean | 是否存在后续页 |
