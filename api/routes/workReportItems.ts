import { Router, type Request, type Response } from 'express'
import prisma from '../prisma.js'

const router = Router()

const ok = (res: Response, data: any, msg = 'success') => res.json({ code: 200, msg, data })
const bad = (res: Response, msg: string, code = 400) => res.status(code).json({ code, msg, data: null })

const dayKey = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

router.get('/stats', async (req: Request, res: Response) => {
  const groupBy = (req.query.groupBy as string | undefined) || 'process'
  const startAt = (req.query.startAt as string | undefined) || undefined
  const endAt = (req.query.endAt as string | undefined) || undefined

  const where: any = {
    isDeleted: false,
    report: { isDeleted: false },
  }

  if (startAt || endAt) {
    where.reportedAt = {}
    if (startAt) where.reportedAt.gte = new Date(startAt)
    if (endAt) where.reportedAt.lte = new Date(endAt)
  }

  if (groupBy === 'day') {
    const rows = await prisma.workReportItem.findMany({
      where,
      select: { reportedAt: true, goodQty: true, badQty: true, lossQty: true },
      orderBy: { reportedAt: 'asc' },
    })

    const agg = new Map<string, { goodQty: number; badQty: number; lossQty: number }>()
    for (const r of rows) {
      const k = dayKey(r.reportedAt)
      const cur = agg.get(k) || { goodQty: 0, badQty: 0, lossQty: 0 }
      cur.goodQty += r.goodQty
      cur.badQty += r.badQty
      cur.lossQty += r.lossQty
      agg.set(k, cur)
    }

    const data = Array.from(agg.entries()).map(([k, v]) => ({
      day: k,
      ...v,
      totalQty: v.goodQty + v.badQty,
    }))
    return ok(res, data)
  }

  const rows = await prisma.workReportItem.findMany({
    where,
    select: { userId: true, shiftName: true, processName: true, goodQty: true, badQty: true, lossQty: true },
  })

  if (groupBy === 'user') {
    const ids = Array.from(new Set(rows.map((r) => r.userId)))
    const users = await prisma.user.findMany({ where: { id: { in: ids } } })
    const userMap = new Map(users.map((u) => [u.id, u.name]))
    const agg = new Map<string, { goodQty: number; badQty: number; lossQty: number; count: number }>()
    for (const r of rows) {
      const cur = agg.get(r.userId) || { goodQty: 0, badQty: 0, lossQty: 0, count: 0 }
      cur.goodQty += r.goodQty
      cur.badQty += r.badQty
      cur.lossQty += r.lossQty
      cur.count += 1
      agg.set(r.userId, cur)
    }
    const data = Array.from(agg.entries())
      .map(([userId, v]) => ({
        userId,
        userName: userMap.get(userId) || '',
        goodQty: v.goodQty,
        badQty: v.badQty,
        lossQty: v.lossQty,
        totalQty: v.goodQty + v.badQty,
        count: v.count,
      }))
      .sort((a, b) => b.count - a.count)
    return ok(res, data)
  }

  const keyOf = (r: (typeof rows)[number]) => (groupBy === 'shift' ? r.shiftName : r.processName)
  const agg = new Map<string, { goodQty: number; badQty: number; lossQty: number; count: number }>()
  for (const r of rows) {
    const k = keyOf(r)
    const cur = agg.get(k) || { goodQty: 0, badQty: 0, lossQty: 0, count: 0 }
    cur.goodQty += r.goodQty
    cur.badQty += r.badQty
    cur.lossQty += r.lossQty
    cur.count += 1
    agg.set(k, cur)
  }

  const data = Array.from(agg.entries())
    .map(([k, v]) => ({
      [groupBy === 'shift' ? 'shiftName' : 'processName']: k,
      goodQty: v.goodQty,
      badQty: v.badQty,
      lossQty: v.lossQty,
      totalQty: v.goodQty + v.badQty,
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count)

  return ok(res, data)
})

router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1))
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)))

  const userId = (req.query.userId as string | undefined) || undefined
  const processName = (req.query.processName as string | undefined) || undefined
  const productId = (req.query.productId as string | undefined) || undefined
  const shiftName = (req.query.shiftName as string | undefined) || undefined
  const equipment = (req.query.equipment as string | undefined) || undefined
  const workOrderId = (req.query.workOrderId as string | undefined) || undefined
  const startAt = (req.query.startAt as string | undefined) || undefined
  const endAt = (req.query.endAt as string | undefined) || undefined

  const where: any = {
    isDeleted: false,
    report: { isDeleted: false },
  }
  if (userId) where.userId = userId
  if (processName) where.processName = { contains: processName }
  if (productId) where.productId = productId
  if (shiftName) where.shiftName = shiftName
  if (equipment) where.equipment = { contains: equipment }
  if (workOrderId) where.report.workOrderId = workOrderId
  if (startAt || endAt) {
    where.reportedAt = {}
    if (startAt) where.reportedAt.gte = new Date(startAt)
    if (endAt) where.reportedAt.lte = new Date(endAt)
  }

  const [total, list] = await Promise.all([
    prisma.workReportItem.count({ where }),
    prisma.workReportItem.findMany({
      where,
      orderBy: { reportedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: true,
        product: true,
        report: { include: { reporter: true, workOrder: true } },
      },
    }),
  ])

  ok(res, { page, pageSize, total, list })
})

router.get('/:id', async (req: Request, res: Response) => {
  const id = req.params.id
  const item = await prisma.workReportItem.findFirst({
    where: { id, isDeleted: false, report: { isDeleted: false } },
    include: {
      user: true,
      product: true,
      report: { include: { reporter: true, workOrder: true } },
    },
  })
  if (!item) return bad(res, 'not found', 404)
  ok(res, item)
})

router.post('/', async (req: Request, res: Response) => {
  const body = req.body as {
    reporterId?: string
    workOrderId?: string
    shiftName?: string
    remark?: string
    reportAt?: string
    userId?: string
    processCode?: string
    processName?: string
    productId?: string
    goodQty?: number
    badQty?: number
    lossQty?: number
    equipment?: string
    skillLevel?: number
    reportedAt?: string
  }

  if (!body.reporterId) return bad(res, 'reporterId required')
  if (!body.shiftName) return bad(res, 'shiftName required')
  if (!body.userId) return bad(res, 'userId required')
  if (!body.processName) return bad(res, 'processName required')
  if (!body.productId) return bad(res, 'productId required')

  const created = await prisma.workReport.create({
    data: {
      reportNo: `WR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      reporterId: body.reporterId,
      workOrderId: body.workOrderId,
      shiftName: body.shiftName,
      remark: body.remark,
      reportAt: body.reportAt ? new Date(body.reportAt) : new Date(),
      items: {
        create: {
          userId: body.userId,
          processCode: body.processCode,
          processName: body.processName,
          productId: body.productId,
          goodQty: Math.max(0, Number(body.goodQty ?? 0)),
          badQty: Math.max(0, Number(body.badQty ?? 0)),
          lossQty: Math.max(0, Number(body.lossQty ?? 0)),
          shiftName: body.shiftName,
          equipment: body.equipment,
          skillLevel: Math.max(0, Number(body.skillLevel ?? 1)),
          reportedAt: body.reportedAt ? new Date(body.reportedAt) : new Date(),
        },
      },
    },
    include: { items: { where: { isDeleted: false } } },
  })

  ok(res, created.items[0], 'created')
})

router.put('/:id', async (req: Request, res: Response) => {
  const id = req.params.id
  const body = req.body as Partial<{
    userId: string
    processCode: string | null
    processName: string
    productId: string
    goodQty: number
    badQty: number
    lossQty: number
    shiftName: string
    equipment: string | null
    skillLevel: number
    reportedAt: string
  }>

  const existing = await prisma.workReportItem.findFirst({
    where: { id, isDeleted: false, report: { isDeleted: false } },
  })
  if (!existing) return bad(res, 'not found', 404)

  const updated = await prisma.workReportItem.update({
    where: { id },
    data: {
      userId: body.userId ?? existing.userId,
      processCode: body.processCode === null ? null : body.processCode ?? existing.processCode,
      processName: body.processName ?? existing.processName,
      productId: body.productId ?? existing.productId,
      goodQty: body.goodQty === undefined ? existing.goodQty : Math.max(0, Number(body.goodQty)),
      badQty: body.badQty === undefined ? existing.badQty : Math.max(0, Number(body.badQty)),
      lossQty: body.lossQty === undefined ? existing.lossQty : Math.max(0, Number(body.lossQty)),
      shiftName: body.shiftName ?? existing.shiftName,
      equipment: body.equipment === null ? null : body.equipment ?? existing.equipment,
      skillLevel: body.skillLevel === undefined ? existing.skillLevel : Math.max(0, Number(body.skillLevel)),
      reportedAt: body.reportedAt ? new Date(body.reportedAt) : existing.reportedAt,
    },
  })

  ok(res, updated, 'updated')
})

router.delete('/:id', async (req: Request, res: Response) => {
  const id = req.params.id
  const existing = await prisma.workReportItem.findFirst({
    where: { id, isDeleted: false, report: { isDeleted: false } },
  })
  if (!existing) return bad(res, 'not found', 404)

  await prisma.workReportItem.update({ where: { id }, data: { isDeleted: true } })

  const remaining = await prisma.workReportItem.count({
    where: { reportId: existing.reportId, isDeleted: false },
  })
  if (remaining === 0) {
    await prisma.workReport.update({ where: { id: existing.reportId }, data: { isDeleted: true } })
  }

  ok(res, true, 'deleted')
})

export default router
