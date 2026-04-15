import { Router, type Request, type Response } from 'express'
import prisma from '../prisma.js'

const router = Router()

const safeJsonParse = (value: string | null | undefined) => {
  if (!value) return null
  try {
    return JSON.parse(value) as any
  } catch {
    return null
  }
}

router.get('/users', async (_req: Request, res: Response) => {
  const workers = await prisma.user.findMany({
    where: { role: 'worker', status: 'active' },
    orderBy: { name: 'asc' },
  })

  const ids = workers.map((w) => w.id)
  const skills = await prisma.skillModel.findMany({
    where: { targetType: 'user', targetId: { in: ids } },
  })
  const skillMap = new Map(skills.map((s) => [s.targetId, s]))

  res.json({
    code: 200,
    data: workers.map((w) => {
      const s = skillMap.get(w.id) || null
      const metrics = safeJsonParse(s?.metrics)
      const processes = Array.isArray(metrics?.processes) ? metrics.processes : []
      const tags = Array.isArray(metrics?.tags) ? metrics.tags : []

      return {
        id: w.id,
        name: w.name,
        cardId: w.cardId,
        skill: s
          ? {
              level: s.level,
              tags,
              processes,
              hourlyOutput: Number(metrics?.hourlyOutput ?? 0),
              defectRate: Number(metrics?.defectRate ?? 0),
              hygieneCompliance: Number(metrics?.hygieneCompliance ?? 0),
            }
          : null,
      }
    }),
  })
})

export default router

