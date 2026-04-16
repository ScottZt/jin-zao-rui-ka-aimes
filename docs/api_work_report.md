# 报工模块 RESTful API 文档

## 统一返回
```json
{ "code": 200, "msg": "success", "data": {} }
```
- `code=200` 成功
- 非 200：失败（`data=null`），`msg` 给出原因

## 1) 报工明细 work_report_item

### 1.1 新增报工明细（提交）
- URL：`POST /api/v1/work-report-items`
- 入参（JSON）
```json
{
  "reporterId": "用户ID(提交人)",
  "workOrderId": "工单ID(可选)",
  "shiftName": "早班/晚班/夜班",
  "remark": "备注(可选)",
  "reportAt": "报工单时间(可选, ISO8601)",

  "userId": "员工ID",
  "processCode": "工序编码(可选)",
  "processName": "工序名称",
  "productId": "产品ID(对应 materials 表)",
  "goodQty": 50,
  "badQty": 2,
  "lossQty": 1,
  "equipment": "设备(可选)",
  "skillLevel": 2,
  "reportedAt": "明细时间(可选, ISO8601)"
}
```
- 出参 data：创建后的明细记录

### 1.2 分页查询明细（列表 + 筛选）
- URL：`GET /api/v1/work-report-items`
- Query
  - `page`：默认 1
  - `pageSize`：默认 20，最大 100
  - `userId`：员工筛选
  - `processName`：工序名称模糊匹配
  - `productId`：产品筛选
  - `shiftName`：班次筛选
  - `equipment`：设备模糊匹配
  - `workOrderId`：工单筛选
  - `startAt/endAt`：时间范围（ISO8601，对应 reportedAt）
- 出参 data
```json
{
  "page": 1,
  "pageSize": 20,
  "total": 123,
  "list": [
    {
      "id": "xxx",
      "userId": "员工ID",
      "processName": "蔬菜切配",
      "productId": "产品ID",
      "goodQty": 50,
      "badQty": 2,
      "lossQty": 1,
      "shiftName": "早班",
      "equipment": "切配台1",
      "skillLevel": 2,
      "reportedAt": "2026-04-15T08:10:00.000Z",
      "user": { "id": "xxx", "name": "张三" },
      "product": { "id": "xxx", "name": "经典双层牛肉汉堡", "code": "MAT-BURGER-01", "unit": "个" },
      "report": {
        "id": "xxx",
        "reporter": { "id": "xxx", "name": "李四" },
        "workOrder": { "id": "xxx", "orderNo": "WO-20260415-001" }
      }
    }
  ]
}
```

### 1.3 明细详情
- URL：`GET /api/v1/work-report-items/{id}`

### 1.4 修改明细
- URL：`PUT /api/v1/work-report-items/{id}`
- 入参（JSON，均可选）
```json
{
  "userId": "员工ID",
  "processCode": "工序编码(可为 null)",
  "processName": "工序名称",
  "productId": "产品ID",
  "goodQty": 80,
  "badQty": 0,
  "lossQty": 0,
  "shiftName": "晚班",
  "equipment": "设备(可为 null)",
  "skillLevel": 3,
  "reportedAt": "2026-04-15T10:00:00.000Z"
}
```

### 1.5 删除明细
- URL：`DELETE /api/v1/work-report-items/{id}`
- 说明：软删明细；若该报工单下无剩余明细，则同时软删报工单头

### 1.6 统计
- URL：`GET /api/v1/work-report-items/stats`
- Query
  - `groupBy`：`process|user|shift|day`（默认 process）
  - `startAt/endAt`：时间范围（可选）
- 示例：按工序统计
  - `GET /api/v1/work-report-items/stats?groupBy=process&startAt=2026-04-15T00:00:00.000Z`

## 2) 报工单 work_report（单头 + 多明细）

### 2.1 新建报工单（一次提交多明细）
- URL：`POST /api/v1/work-reports`
- 入参（JSON）
```json
{
  "reporterId": "提交人ID",
  "workOrderId": "工单ID(可选)",
  "shiftName": "早班/晚班/夜班",
  "remark": "备注(可选)",
  "reportAt": "单据时间(可选, ISO8601)",
  "items": [
    {
      "userId": "员工ID",
      "processCode": "工序编码(可选)",
      "processName": "工序名称",
      "productId": "产品ID",
      "goodQty": 50,
      "badQty": 2,
      "lossQty": 1,
      "shiftName": "早班(可选, 默认继承)",
      "equipment": "设备(可选)",
      "skillLevel": 2,
      "reportedAt": "明细时间(可选, ISO8601)"
    }
  ]
}
```

### 2.2 报工单分页列表
- URL：`GET /api/v1/work-reports`
- Query：`page/pageSize/reporterId/workOrderId/shiftName/startAt/endAt`

### 2.3 报工单详情
- URL：`GET /api/v1/work-reports/{id}`

### 2.4 更新报工单（替换明细）
- URL：`PUT /api/v1/work-reports/{id}`
- 说明：会将原明细标记为删除，再插入新明细

### 2.5 删除报工单
- URL：`DELETE /api/v1/work-reports/{id}`

