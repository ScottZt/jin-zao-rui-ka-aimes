import { Router, type Request, type Response } from 'express'
import prisma from '../prisma.js'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
  const items = await prisma.processDefinition.findMany({
    orderBy: { processCode: 'asc' },
  })

  res.json({
    code: 200,
    data: items.map((p) => ({
      id: p.id,
      processCode: p.processCode,
      processName: p.processName,
      unit: p.unit,
      minLevel: p.minLevel,
      isFinalCount: p.isFinalCount,
    })),
  })
})

export default router
