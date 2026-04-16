import { Router, type Request, type Response } from 'express'
import prisma from '../prisma.js'

const router = Router()

const ok = (res: Response, data: any, msg = 'success') => res.json({ code: 200, msg, data })
const bad = (res: Response, msg: string, code = 400) => res.status(code).json({ code, msg, data: null })

const genNo = (prefix: string) => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const rnd = Math.floor(1000 + Math.random() * 9000)
  return `${prefix}-${y}${m}${day}${hh}${mm}${ss}-${rnd}`
}

router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1))
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)))

  const reporterId = (req.query.reporterId as string | undefined) || undefined
  const workOrderId = (req.query.workOrderId as string | undefined) || undefined
  const shiftName = (req.query.shiftName as string | undefined) || undefined
  const startAt = (req.query.startAt as string | undefined) || undefined
  const endAt = (req.query.endAt as string | undefined) || undefined

  const where: any = { isDeleted: false }
  if (reporterId) where.reporterId = reporterId
  if (workOrderId) where.workOrderId = workOrderId
  if (shiftName) where.shiftName = shiftName
  if (startAt || endAt) {
    where.reportAt = {}
    if (startAt) where.reportAt.gte = new Date(startAt)
    if (endAt) where.reportAt.lte = new Date(endAt)
  }

  const [total, list] = await Promise.all([
    prisma.workReport.count({ where }),
    prisma.workReport.findMany({
      where,
      orderBy: { reportAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        reporter: true,
        workOrder: true,
        items: { where: { isDeleted: false }, include: { user: true, product: true } },
      },
    }),
  ])

  ok(res, { page, pageSize, total, list })
})

router.get('/:id', async (req: Request, res: Response) => {
  const id = req.params.id
  const report = await prisma.workReport.findFirst({
    where: { id, isDeleted: false },
    include: {
      reporter: true,
      workOrder: true,
      items: { where: { isDeleted: false }, include: { user: true, product: true } },
    },
  })

  if (!report) return bad(res, 'not found', 404)
  ok(res, report)
})

router.post('/', async (req: Request, res: Response) => {
  const body = req.body as {
    reporterId?: string
    workOrderId?: string
    shiftName?: string
    remark?: string
    reportAt?: string
    items?: Array<{
      userId?: string
      processCode?: string
      processName?: string
      productId?: string
      goodQty?: number
      badQty?: number
      lossQty?: number
      shiftName?: string
      equipment?: string
      skillLevel?: number
      reportedAt?: string
    }>
  }

  if (!body.reporterId) return bad(res, 'reporterId required')
  if (!body.shiftName) return bad(res, 'shiftName required')
  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) return bad(res, 'items required')

  for (const it of items) {
    if (!it.userId) return bad(res, 'item.userId required')
    if (!it.processName) return bad(res, 'item.processName required')
    if (!it.productId) return bad(res, 'item.productId required')
    if (!Number.isFinite(Number(it.goodQty ?? 0))) return bad(res, 'item.goodQty invalid')
    if (!Number.isFinite(Number(it.badQty ?? 0))) return bad(res, 'item.badQty invalid')
    if (!Number.isFinite(Number(it.lossQty ?? 0))) return bad(res, 'item.lossQty invalid')
  }

  const created = await prisma.workReport.create({
    data: {
      reportNo: genNo('WR'),
      reporterId: body.reporterId,
      workOrderId: body.workOrderId,
      shiftName: body.shiftName,
      remark: body.remark,
      reportAt: body.reportAt ? new Date(body.reportAt) : new Date(),
      items: {
        create: items.map((it) => ({
          userId: it.userId!,
          processCode: it.processCode,
          processName: it.processName!,
          productId: it.productId!,
          goodQty: Math.max(0, Number(it.goodQty ?? 0)),
          badQty: Math.max(0, Number(it.badQty ?? 0)),
          lossQty: Math.max(0, Number(it.lossQty ?? 0)),
          shiftName: it.shiftName || body.shiftName!,
          equipment: it.equipment,
          skillLevel: Math.max(0, Number(it.skillLevel ?? 1)),
          reportedAt: it.reportedAt ? new Date(it.reportedAt) : new Date(),
        })),
      },
    },
    include: { items: true },
  })

  ok(res, created, 'created')
})

router.put('/:id', async (req: Request, res: Response) => {
  const id = req.params.id
  const body = req.body as {
    workOrderId?: string | null
    shiftName?: string
    remark?: string | null
    reportAt?: string
    items?: Array<{
      id?: string
      userId?: string
      processCode?: string
      processName?: string
      productId?: string
      goodQty?: number
      badQty?: number
      lossQty?: number
      shiftName?: string
      equipment?: string
      skillLevel?: number
      reportedAt?: string
    }>
  }

  const existing = await prisma.workReport.findFirst({
    where: { id, isDeleted: false },
    include: { items: { where: { isDeleted: false } } },
  })
  if (!existing) return bad(res, 'not found', 404)

  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) return bad(res, 'items required')

  for (const it of items) {
    if (!it.userId) return bad(res, 'item.userId required')
    if (!it.processName) return bad(res, 'item.processName required')
    if (!it.productId) return bad(res, 'item.productId required')
    if (!Number.isFinite(Number(it.goodQty ?? 0))) return bad(res, 'item.goodQty invalid')
    if (!Number.isFinite(Number(it.badQty ?? 0))) return bad(res, 'item.badQty invalid')
    if (!Number.isFinite(Number(it.lossQty ?? 0))) return bad(res, 'item.lossQty invalid')
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.workReportItem.updateMany({
      where: { reportId: id, isDeleted: false },
      data: { isDeleted: true },
    })

    await tx.workReportItem.createMany({
      data: items.map((it) => ({
        reportId: id,
        userId: it.userId!,
        processCode: it.processCode,
        processName: it.processName!,
        productId: it.productId!,
        goodQty: Math.max(0, Number(it.goodQty ?? 0)),
        badQty: Math.max(0, Number(it.badQty ?? 0)),
        lossQty: Math.max(0, Number(it.lossQty ?? 0)),
        shiftName: it.shiftName || (body.shiftName || existing.shiftName),
        equipment: it.equipment,
        skillLevel: Math.max(0, Number(it.skillLevel ?? 1)),
        reportedAt: it.reportedAt ? new Date(it.reportedAt) : new Date(),
        isDeleted: false,
      })),
    })

    return tx.workReport.update({
      where: { id },
      data: {
        workOrderId: body.workOrderId === null ? null : body.workOrderId ?? existing.workOrderId,
        shiftName: body.shiftName ?? existing.shiftName,
        remark: body.remark === null ? null : body.remark ?? existing.remark,
        reportAt: body.reportAt ? new Date(body.reportAt) : existing.reportAt,
      },
      include: { items: { where: { isDeleted: false } } },
    })
  })

  ok(res, updated, 'updated')
})

router.delete('/:id', async (req: Request, res: Response) => {
  const id = req.params.id
  const existing = await prisma.workReport.findFirst({ where: { id, isDeleted: false } })
  if (!existing) return bad(res, 'not found', 404)

  await prisma.workReport.update({ where: { id }, data: { isDeleted: true } })
  ok(res, true, 'deleted')
})

export default router
