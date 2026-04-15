import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';

const router = Router();

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