# hamburger_mes 数据库结构说明（MySQL）

## 约定
- 库名：hamburger_mes
- 字符集：utf8mb4
- 引擎：InnoDB
- 每表通用字段：`id`、`create_time`、`update_time`、`is_deleted`
- `is_deleted` 采用“删除时间戳”语义：`0=未删除；>0=删除时间戳（建议毫秒）`

## 主数据
- user：员工/操作人基础信息（NFC 卡号 card_id、角色 role、状态 status）
- process：工序字典（process_code/process_name/min_skill_level/is_final_count）
- material：物料主数据（material_type 区分 原材料/半成品/成品/包装物料）
- product：产品主数据（可选关联 material，用于“成品也是物料”的场景）
- skill：员工 Skill 画像（skill_level + tags_json/metrics_json）

## 生产
- work_order：工单（产品、计划数量、状态、起止时间）
- work_report：报工单头（一次提交的报工单据，支持多明细）
- work_report_item：报工明细（员工/工序/产品/合格/次品/损耗/班次/设备/Skill 等级/时间）

## 库存
- inventory：当前库存（material_id 唯一；current_qty/locked_qty）
- stock_in / stock_in_item：标准入库单（单据头/行）
- stock_out / stock_out_item：标准出库单（单据头/行）
- inventory_flow：库存流水台账（每次入/出库、以及未来可扩展的报工扣料/完工入库，记录 before_qty/after_qty）

## 异常
- exception：异常事件（缺料/设备/品质等），可关联工单、报工明细、物料、设备等

## 推荐关键索引
- work_report_item：`(employee_user_id, report_time)`、`(process_id, report_time)`、`(product_id, report_time)`
- inventory_flow：`(material_id, flow_time)`、`(biz_type, biz_id)`
- stock_in/stock_out：`(stock_time)`、`(work_order_id)`

## 建表 SQL
- 可执行 SQL 见 [mysql_schema.sql](file:///Users/lidong/Desktop/%E9%87%91%E9%80%A0%E7%9D%BF%E5%8D%A1-AIMES/docs/mysql_schema.sql)

