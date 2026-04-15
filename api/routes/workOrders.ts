import { Router, type Request, type Response } from 'express'
import prisma from '../prisma.js'

const router = Router()

const processSeq = [
  '面包烘烤',
  '肉饼煎制/炸制',
  '蔬菜切配',
  '酱料涂抹',
  '汉堡组装',
  '包装封口',
  '成品装箱',
]

router.get('/', async (req: Request, res: Response) => {
  const status = (req.query.status as string | undefined) || undefined

  const items = await prisma.workOrder.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  })

  const productIds = Array.from(new Set(items.map((i) => i.productId)))
  const materials = await prisma.material.findMany({
    where: { id: { in: productIds } },
  })
  const materialMap = new Map(materials.map((m) => [m.id, m]))

  const orderIds = items.map((i) => i.id)
  const plans = await prisma.workOrderProcessPlan.findMany({
    where: { orderId: { in: orderIds } },
  })
  const planMap = new Map<string, typeof plans>()
  for (const p of plans) {
    const arr = planMap.get(p.orderId) || []
    arr.push(p)
    planMap.set(p.orderId, arr)
  }

  res.json({
    code: 200,
    data: items.map((i) => ({
      ...i,
      product: materialMap.get(i.productId)
        ? {
            id: materialMap.get(i.productId)!.id,
            code: materialMap.get(i.productId)!.code,
            name: materialMap.get(i.productId)!.name,
            unit: materialMap.get(i.productId)!.unit,
          }
        : null,
      processPlans: (planMap.get(i.id) || [])
        .sort((a, b) => processSeq.indexOf(a.processName) - processSeq.indexOf(b.processName))
        .map((p) => ({
          processName: p.processName,
          planQty: p.planQty,
          actualQty: p.actualQty,
          status: p.status,
        })),
    })),
  })
})

router.post('/', async (req: Request, res: Response) => {
  const { orderNo, productId, planQty } = req.body as {
    orderNo: string
    productId: string
    planQty: number
  }

  if (!orderNo || !productId || !Number.isFinite(Number(planQty))) {
    return res.status(400).json({ code: 400, error: '参数错误' })
  }

  const material = await prisma.material.findUnique({ where: { id: productId } })
  if (!material) return res.status(400).json({ code: 400, error: '产品物料不存在' })

  const created = await prisma.workOrder.create({
    data: {
      orderNo,
      productId,
      planQty: Number(planQty),
      status: 'draft',
    },
  })

  await prisma.workOrderProcessPlan.createMany({
    data: processSeq.map((p) => ({
      orderId: created.id,
      processName: p,
      planQty: created.planQty,
      actualQty: 0,
      status: 'draft',
    })),
  })

  res.json({
    code: 200,
    data: {
      ...created,
      product: { id: material.id, code: material.code, name: material.name, unit: material.unit },
      processPlans: processSeq.map((p) => ({ processName: p, planQty: created.planQty, actualQty: 0, status: 'draft' })),
    },
  })
})

router.post('/:id/release', async (req: Request, res: Response) => {
  const id = req.params.id

  const order = await prisma.workOrder.findUnique({ where: { id } })
  if (!order) return res.status(404).json({ code: 404, error: '工单不存在' })
  if (order.status !== 'draft') {
    return res.status(400).json({ code: 400, error: '仅草稿工单允许下发' })
  }

  const updated = await prisma.workOrder.update({
    where: { id },
    data: { status: 'pending' },
  })

  await prisma.workOrderProcessPlan.updateMany({
    where: { orderId: id, status: 'draft' },
    data: { status: 'pending' },
  })

  res.json({ code: 200, data: updated })
})

export default router
