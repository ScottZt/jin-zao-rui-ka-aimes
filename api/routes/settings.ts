import { Router, type Request, type Response } from 'express'
import prisma from '../prisma.js'

const router = Router()

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value) as any
  } catch {
    return value
  }
}

router.get('/', async (_req: Request, res: Response) => {
  const items = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } })
  res.json({
    code: 200,
    data: items.map((i) => ({
      key: i.key,
      value: safeJsonParse(i.value),
      updatedAt: i.updatedAt,
    })),
  })
})

router.get('/:key', async (req: Request, res: Response) => {
  const key = req.params.key
  const item = await prisma.systemSetting.findUnique({ where: { key } })
  if (!item) return res.status(404).json({ code: 404, error: '配置不存在' })

  res.json({ code: 200, data: { key: item.key, value: safeJsonParse(item.value), updatedAt: item.updatedAt } })
})

router.put('/:key', async (req: Request, res: Response) => {
  const key = req.params.key
  const { value } = req.body as { value: any }

  const saved = await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value ?? null) },
    update: { value: JSON.stringify(value ?? null) },
  })

  res.json({ code: 200, data: { key: saved.key, value: safeJsonParse(saved.value), updatedAt: saved.updatedAt } })
})

export default router

