import { Router, type Request, type Response } from 'express'
import prisma from '../prisma.js'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
  const items = await prisma.material.findMany({
    include: {
      inventory: true,
    },
    orderBy: { code: 'asc' },
  })

  res.json({
    code: 200,
    data: items.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit,
      safeStockQty: m.safeStockQty,
      currentQty: m.inventory?.currentQty ?? 0,
    })),
  })
})

export default router

