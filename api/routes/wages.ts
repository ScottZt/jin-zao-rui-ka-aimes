import { Router, type Request, type Response } from 'express'
import prisma from '../prisma.js'
import { computeSettlementForUserNow } from '../services/wageEngine.js'

const router = Router()

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value) as any
  } catch {
    return null
  }
}

router.post('/recalculate', async (req: Request, res: Response) => {
  const { userId } = req.body as { userId: string }
  if (!userId) return res.status(400).json({ code: 400, error: 'userId required' })

  const result = await computeSettlementForUserNow(userId)
  res.json({ code: 200, data: result })
})

router.get('/settlements', async (req: Request, res: Response) => {
  const userId = (req.query.userId as string | undefined) || undefined
  const take = Number(req.query.limit ?? 20)

  const items = await prisma.wageSettlement.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: Number.isFinite(take) ? take : 20,
    include: { user: true },
  })

  res.json({
    code: 200,
    data: items.map((i) => ({
      id: i.id,
      scope: i.scope,
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      pieceAmount: i.pieceAmount,
      rewardAmount: i.rewardAmount,
      penaltyAmount: i.penaltyAmount,
      finalAmount: i.finalAmount,
      user: { id: i.user.id, name: i.user.name, cardId: i.user.cardId },
      breakdown: safeJsonParse(i.breakdownJson),
      createdAt: i.createdAt,
    })),
  })
})

export default router

