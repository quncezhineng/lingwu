# 同花顺新增概念

[业务导航](README.md) · **端内专用** · **同花顺AI客户端可用** · [使用说明](../README.md#端内能力说明)

- 本页接口结构用于说明同花顺AI客户端内的数据契约，当前不作为端外接入入口。
- 所有接口返回统一 `ApiResponse` 信封；时间戳为毫秒级 Unix 时间戳，时区按 `Asia/Shanghai`。
- 金额按表中币种提供，比例为小数；合法 `null` 保留字段键。分页从1开始，实际记录范围以返回值为准。

```text
GET /api/a-share-index/baseinfo/new-concepts
```

分页查询新增概念及创建时间，保留概念业务代码；尚未登记的标准指数代码为 `null`。

## 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `page` | integer | 否 | `1` | 从1开始的页码 |
| `size` | integer | 否 | `15` | 每页1至15条，默认15 |

## 请求示例

以下命令仅展示接口路径与参数格式，当前不可用于外部调用。

```bash
curl 'https://fuyao.aicubes.cn/api/a-share-index/baseinfo/new-concepts?page=1&size=15'
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
        "record_id": 38306,
        "concept_code": "886113",
        "thscode": null,
        "name": "2026三季报预增",
        "created_at": 1791532812000
      }
    ],
    "pagination": {
      "page": 1,
      "size": 15,
      "total": 60,
      "has_next": true
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
| `record_id` | integer | 概念新增事件记录标识 |
| `concept_code` | string | 概念代码 |
| `thscode` | string \| null | 可映射的标准指数标识 |
| `name` | string | 概念名称 |
| `created_at` | integer | 本概念新增时间；单位：毫秒 |

**`data.pagination` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `page` | integer | 从1开始的页码 |
| `size` | integer | 本页请求大小 |
| `total` | integer \| null | 结果总数；未提供时为null |
| `has_next` | boolean | 是否存在后续页 |
