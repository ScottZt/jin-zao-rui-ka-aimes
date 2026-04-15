import { Router, type Request, type Response } from 'express'
import prisma from '../prisma.js'

const router = Router()

router.get('/processes', async (_req: Request, res: Response) => {
  const items = await prisma.processDefinition.findMany({ orderBy: { processCode: 'asc' } })
  res.json({ code: 200, data: items })
})

router.get('/piece-rates', async (_req: Request, res: Response) => {
  const items = await prisma.pieceRate.findMany({ orderBy: [{ processCode: 'asc' }, { level: 'asc' }, { effectiveFrom: 'desc' }] })
  res.json({ code: 200, data: items })
})

router.put('/piece-rates', async (req: Request, res: Response) => {
  const { processCode, level, unitPrice } = req.body as { processCode: string; level: number; unitPrice: number }
  if (!processCode || !Number.isFinite(Number(level)) || !Number.isFinite(Number(unitPrice))) {
    return res.status(400).json({ code: 400, error: '参数错误' })
  }

  const saved = await prisma.pieceRate.create({
    data: {
      processCode,
      level: Number(level),
      unitPrice: Number(unitPrice),
      effectiveFrom: new Date(),
    },
  })

  res.json({ code: 200, data: saved })
})

router.get('/reward-policies', async (_req: Request, res: Response) => {
  const items = await prisma.rewardPolicy.findMany({ orderBy: { rewardCode: 'asc' } })
  res.json({ code: 200, data: items })
})

router.put('/reward-policies/:rewardCode', async (req: Request, res: Response) => {
  const rewardCode = req.params.rewardCode
  const { enabled, condition, amount, maxAmountPerShift } = req.body as {
    enabled?: boolean
    condition?: any
    amount?: any
    maxAmountPerShift?: number
  }

  const existing = await prisma.rewardPolicy.findUnique({ where: { rewardCode } })
  if (!existing) return res.status(404).json({ code: 404, error: '奖励规则不存在' })

  const saved = await prisma.rewardPolicy.update({
    where: { rewardCode },
    data: {
      enabled: typeof enabled === 'boolean' ? enabled : existing.enabled,
      conditionJson: condition !== undefined ? JSON.stringify(condition) : existing.conditionJson,
      amountJson: amount !== undefined ? JSON.stringify(amount) : existing.amountJson,
      maxAmountPerShift: Number.isFinite(Number(maxAmountPerShift))
        ? Number(maxAmountPerShift)
        : existing.maxAmountPerShift,
    },
  })

  res.json({ code: 200, data: saved })
})

router.get('/penalty-policies', async (_req: Request, res: Response) => {
  const items = await prisma.penaltyPolicy.findMany({ orderBy: { penaltyCode: 'asc' } })
  res.json({ code: 200, data: items })
})

router.put('/penalty-policies/:penaltyCode', async (req: Request, res: Response) => {
  const penaltyCode = req.params.penaltyCode
  const { enabled, condition, amount, maxPenaltyPerShift } = req.body as {
    enabled?: boolean
    condition?: any
    amount?: any
    maxPenaltyPerShift?: number
  }

  const existing = await prisma.penaltyPolicy.findUnique({ where: { penaltyCode } })
  if (!existing) return res.status(404).json({ code: 404, error: '扣罚规则不存在' })

  const saved = await prisma.penaltyPolicy.update({
    where: { penaltyCode },
    data: {
      enabled: typeof enabled === 'boolean' ? enabled : existing.enabled,
      conditionJson: condition !== undefined ? JSON.stringify(condition) : existing.conditionJson,
      amountJson: amount !== undefined ? JSON.stringify(amount) : existing.amountJson,
      maxPenaltyPerShift: Number.isFinite(Number(maxPenaltyPerShift))
        ? Number(maxPenaltyPerShift)
        : existing.maxPenaltyPerShift,
    },
  })

  res.json({ code: 200, data: saved })
})

export default router
