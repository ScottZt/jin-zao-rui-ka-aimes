# 库存标准出入库逻辑设计

## 目标
- 标准入库单/出库单（单据头 + 明细行）
- 自动生成库存流水台账（before_qty/after_qty）
- 库存实时计算（以 inventory.current_qty 为准，流水可追溯）
- 支持关联工单、备注、操作人、操作时间

## 数据结构（MySQL 口径）
- inventory：当前库存（material_id 唯一）
- stock_in/stock_in_item：标准入库单
- stock_out/stock_out_item：标准出库单
- inventory_flow：库存流水（强审计）

## 并发控制（悲观锁）
### 入库
1. 开启事务
2. 写入 stock_in（头）与 stock_in_item（行）
3. 对每一行物料执行：
   - `SELECT current_qty FROM inventory WHERE material_id=? FOR UPDATE`
   - 若无记录则插入 inventory 行（current_qty=0）
   - `UPDATE inventory SET current_qty = current_qty + ? WHERE material_id=?`
   - 插入 inventory_flow（direction=in，before_qty/after_qty）
4. 提交事务

### 出库（防止超卖）
1. 开启事务
2. 写入 stock_out（头）与 stock_out_item（行）
3. 对每一行物料执行：
   - `SELECT current_qty FROM inventory WHERE material_id=? FOR UPDATE`
   - 校验 `current_qty >= qty`，不满足则回滚并返回“库存不足”
   - `UPDATE inventory SET current_qty = current_qty - ? WHERE material_id=?`
   - 插入 inventory_flow（direction=out，before_qty/after_qty）
4. 提交事务

## 现有仓库（Node/Express + Prisma）实现说明
- 已新增 API：
  - `POST /api/v1/inventory/stock-ins`（标准入库）
  - `POST /api/v1/inventory/stock-outs`（标准出库）
  - `GET /api/v1/inventory/stock-ins` / `GET /api/v1/inventory/stock-outs`（分页列表）
  - `GET /api/v1/inventory/ledger`（库存流水）
- SQLite 环境不支持 `SELECT ... FOR UPDATE`，当前实现用 Prisma 事务保证单次操作的原子性；上生产切换 MySQL 时按“悲观锁”流程落库即可。

