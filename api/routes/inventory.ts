import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';

const router = Router();

const ok = (res: Response, data: any, msg = 'success') => res.json({ code: 200, msg, data });
const bad = (res: Response, msg: string, code = 400) => res.status(code).json({ code, msg, data: null });

const genNo = (prefix: string) => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${day}${hh}${mm}${ss}-${rnd}`;
};

router.get('/stock-ins', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));

  const [total, list] = await Promise.all([
    prisma.stockIn.count({ where: { isDeleted: false } }),
    prisma.stockIn.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { items: { include: { material: true } }, operator: true, workOrder: true },
    }),
  ]);

  ok(res, { page, pageSize, total, list });
});

router.get('/stock-ins/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const doc = await prisma.stockIn.findFirst({
    where: { id, isDeleted: false },
    include: { items: { include: { material: true } }, operator: true, workOrder: true },
  });
  if (!doc) return bad(res, 'not found', 404);
  ok(res, doc);
});

router.post('/stock-ins', async (req: Request, res: Response) => {
  const body = req.body as {
    operatorId?: string;
    workOrderId?: string;
    remark?: string;
    items?: Array<{ materialId?: string; qty?: number }>;
  };

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return bad(res, 'items required');
  for (const it of items) {
    if (!it.materialId) return bad(res, 'item.materialId required');
    if (!Number.isFinite(Number(it.qty)) || Number(it.qty) <= 0) return bad(res, 'item.qty invalid');
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const stockIn = await tx.stockIn.create({
        data: {
          stockInNo: genNo('SI'),
          operatorId: body.operatorId,
          workOrderId: body.workOrderId,
          remark: body.remark,
          items: {
            create: items.map((it) => ({
              materialId: it.materialId!,
              qty: Math.floor(Number(it.qty)),
            })),
          },
        },
      });

      for (const it of items) {
        const qty = Math.floor(Number(it.qty));
        const inv = await tx.inventory.findUnique({ where: { materialId: it.materialId! } });
        const beforeQty = inv?.currentQty ?? 0;
        const afterQty = beforeQty + qty;

        if (!inv) {
          await tx.inventory.create({ data: { materialId: it.materialId!, currentQty: afterQty } });
        } else {
          await tx.inventory.update({
            where: { materialId: it.materialId! },
            data: { currentQty: afterQty },
          });
        }

        await tx.inventoryLedger.create({
          data: {
            materialId: it.materialId!,
            direction: 'in',
            bizType: 'stock_in',
            bizId: stockIn.id,
            qty,
            beforeQty,
            afterQty,
            operatorId: body.operatorId,
            workOrderId: body.workOrderId,
            remark: body.remark,
          },
        });

        await tx.transaction.create({
          data: {
            materialId: it.materialId!,
            orderId: body.workOrderId,
            type: 'in',
            qty,
            sourceDocId: stockIn.id,
          },
        });
      }

      return tx.stockIn.findUnique({
        where: { id: stockIn.id },
        include: { items: { include: { material: true } }, operator: true, workOrder: true },
      });
    });

    ok(res, created, 'created');
  } catch (e: any) {
    console.error('stock-in error:', e);
    bad(res, 'stock-in failed', 500);
  }
});

router.get('/stock-outs', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));

  const [total, list] = await Promise.all([
    prisma.stockOut.count({ where: { isDeleted: false } }),
    prisma.stockOut.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { items: { include: { material: true } }, operator: true, workOrder: true },
    }),
  ]);

  ok(res, { page, pageSize, total, list });
});

router.get('/stock-outs/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const doc = await prisma.stockOut.findFirst({
    where: { id, isDeleted: false },
    include: { items: { include: { material: true } }, operator: true, workOrder: true },
  });
  if (!doc) return bad(res, 'not found', 404);
  ok(res, doc);
});

router.post('/stock-outs', async (req: Request, res: Response) => {
  const body = req.body as {
    operatorId?: string;
    workOrderId?: string;
    remark?: string;
    items?: Array<{ materialId?: string; qty?: number }>;
  };

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return bad(res, 'items required');
  for (const it of items) {
    if (!it.materialId) return bad(res, 'item.materialId required');
    if (!Number.isFinite(Number(it.qty)) || Number(it.qty) <= 0) return bad(res, 'item.qty invalid');
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      for (const it of items) {
        const qty = Math.floor(Number(it.qty));
        const inv = await tx.inventory.findUnique({ where: { materialId: it.materialId! } });
        const beforeQty = inv?.currentQty ?? 0;
        if (beforeQty < qty) {
          throw new Error(`insufficient_stock:${it.materialId}`);
        }
      }

      const stockOut = await tx.stockOut.create({
        data: {
          stockOutNo: genNo('SO'),
          operatorId: body.operatorId,
          workOrderId: body.workOrderId,
          remark: body.remark,
          items: {
            create: items.map((it) => ({
              materialId: it.materialId!,
              qty: Math.floor(Number(it.qty)),
            })),
          },
        },
      });

      for (const it of items) {
        const qty = Math.floor(Number(it.qty));
        const inv = await tx.inventory.findUnique({ where: { materialId: it.materialId! } });
        const beforeQty = inv?.currentQty ?? 0;
        const afterQty = Math.max(0, beforeQty - qty);

        if (!inv) {
          await tx.inventory.create({ data: { materialId: it.materialId!, currentQty: afterQty } });
        } else {
          await tx.inventory.update({
            where: { materialId: it.materialId! },
            data: { currentQty: afterQty },
          });
        }

        await tx.inventoryLedger.create({
          data: {
            materialId: it.materialId!,
            direction: 'out',
            bizType: 'stock_out',
            bizId: stockOut.id,
            qty,
            beforeQty,
            afterQty,
            operatorId: body.operatorId,
            workOrderId: body.workOrderId,
            remark: body.remark,
          },
        });

        await tx.transaction.create({
          data: {
            materialId: it.materialId!,
            orderId: body.workOrderId,
            type: 'out',
            qty,
            sourceDocId: stockOut.id,
          },
        });
      }

      return tx.stockOut.findUnique({
        where: { id: stockOut.id },
        include: { items: { include: { material: true } }, operator: true, workOrder: true },
      });
    });

    ok(res, created, 'created');
  } catch (e: any) {
    const msg = typeof e?.message === 'string' && e.message.startsWith('insufficient_stock:') ? '库存不足' : 'stock-out failed';
    const code = msg === '库存不足' ? 400 : 500;
    bad(res, msg, code);
  }
});

router.get('/ledger', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 50)));

  const materialId = (req.query.materialId as string | undefined) || undefined;
  const direction = (req.query.direction as string | undefined) || undefined;
  const bizType = (req.query.bizType as string | undefined) || undefined;

  const where: any = {};
  if (materialId) where.materialId = materialId;
  if (direction) where.direction = direction;
  if (bizType) where.bizType = bizType;

  const [total, list] = await Promise.all([
    prisma.inventoryLedger.count({ where }),
    prisma.inventoryLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { material: true, operator: true },
    }),
  ]);

  ok(res, { page, pageSize, total, list });
});

// GET /api/v1/inventory/status
// 获取实时库存台账与安全库存预警
router.get('/status', async (req: Request, res: Response) => {
  try {
    const materials = await prisma.material.findMany({
      include: {
        inventory: true,
      },
      orderBy: {
        code: 'asc'
      }
    });

    const inventoryStatus = materials.map(mat => {
      const currentQty = mat.inventory?.currentQty || 0;
      const isWarning = currentQty < mat.safeStockQty;
      
      // Calculate warning level
      let warningLevel = 'normal';
      if (isWarning) {
        warningLevel = currentQty <= (mat.safeStockQty * 0.5) ? 'critical' : 'warning';
      }

      return {
        id: mat.id,
        code: mat.code,
        name: mat.name,
        unit: mat.unit,
        safeStockQty: mat.safeStockQty,
        currentQty: currentQty,
        status: warningLevel,
        lastUpdated: mat.inventory?.updatedAt || new Date()
      };
    });

    return res.json({
      code: 200,
      data: inventoryStatus,
      message: 'success'
    });
  } catch (error) {
    console.error("Fetch inventory status error:", error);
    return res.status(500).json({ code: 500, error: "获取库存状态失败" });
  }
});

// GET /api/v1/inventory/transactions
// 获取库存流水明细 (基于报工产生的出入库流水)
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    
    const transactions = await prisma.transaction.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        material: true
      }
    });

    const formattedTransactions = transactions.map(t => ({
      id: t.id,
      materialName: t.material.name,
      materialCode: t.material.code,
      type: t.type, // 'in' or 'out'
      qty: t.qty,
      unit: t.material.unit,
      sourceDocId: t.sourceDocId,
      timestamp: t.createdAt
    }));

    return res.json({
      code: 200,
      data: formattedTransactions,
      message: 'success'
    });
  } catch (error) {
    console.error("Fetch transactions error:", error);
    return res.status(500).json({ code: 500, error: "获取库存流水失败" });
  }
});

export default router;
