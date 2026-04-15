import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';

const router = Router();

const processSeq = [
  '面包烘烤',
  '肉饼煎制/炸制',
  '蔬菜切配',
  '酱料涂抹',
  '汉堡组装',
  '包装封口',
  '成品装箱',
];

const normalizeProcessName = (raw: string) => {
  if (raw === '肉饼煎制') return '肉饼煎制/炸制';
  if (raw === '炸肉饼') return '肉饼煎制/炸制';
  return raw;
};

router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const pendingOrders = await prisma.workOrder.findMany({
      where: { status: 'pending' },
      include: { processPlans: true },
    });

    if (pendingOrders.length === 0) {
      return res.json({
        code: 200,
        data: [],
        message: '当前无待派工的工单'
      });
    }

    const workers = await prisma.user.findMany({
      where: { role: 'worker', status: 'active' }
    });

    const skillModels = await prisma.skillModel.findMany({
      where: { targetType: 'user' }
    });

    const productIds = Array.from(new Set(pendingOrders.map((o) => o.productId)));
    const materials = await prisma.material.findMany({
      where: { id: { in: productIds } },
    });
    const materialMap = new Map(materials.map((m) => [m.id, m]));

    const minLevelByProcess: Record<string, number> = {
      '蔬菜切配': 1,
      '包装封口': 1,
      '成品装箱': 1,
      '面包烘烤': 2,
      '肉饼煎制/炸制': 2,
      '酱料涂抹': 2,
      '汉堡组装': 2,
    };

    const baseUnitPriceByProcess: Record<string, number> = {
      '肉饼煎制/炸制': 0.18,
      '面包烘烤': 0.10,
      '蔬菜切配': 0.06,
      '酱料涂抹': 0.04,
      '汉堡组装': 0.14,
      '包装封口': 0.08,
      '成品装箱': 0.02,
    };

    const parseMetrics = (metrics: string | null | undefined) => {
      if (!metrics) return null;
      try {
        return JSON.parse(metrics) as any;
      } catch {
        return null;
      }
    };

    const orderIds = pendingOrders.map((o) => o.id);
    const activeTasks = await prisma.task.findMany({
      where: { status: 'active', orderId: { in: orderIds } },
      select: { orderId: true, processName: true },
    });
    const activeTaskSet = new Set(activeTasks.map((t) => `${t.orderId}:${normalizeProcessName(t.processName)}`));

    const getWorkerProfile = (userId: string) => {
      const skill = skillModels.find((s) => s.targetId === userId) || null;
      return {
        skillLevel: skill?.level ?? 1,
        metrics: parseMetrics(skill?.metrics),
      };
    };

    const recommendations = pendingOrders.map((order) => {
      const plans = (order.processPlans || [])
        .map((p) => ({ ...p, processName: normalizeProcessName(p.processName) }))
        .sort((a, b) => processSeq.indexOf(a.processName) - processSeq.indexOf(b.processName));

      const nextPlan =
        plans.find((p) => p.status === 'pending' && !activeTaskSet.has(`${order.id}:${p.processName}`)) ||
        plans.find((p) => p.status !== 'completed' && !activeTaskSet.has(`${order.id}:${p.processName}`)) ||
        null;

      const requiredProcess = nextPlan ? nextPlan.processName : '包装封口';
      const minLevel = minLevelByProcess[requiredProcess] ?? 1;

      const scored = workers
        .map((w) => {
          const profile = getWorkerProfile(w.id);
          const processesRaw: string[] = Array.isArray(profile.metrics?.processes) ? profile.metrics.processes : [];
          const processes = processesRaw.map((p: string) => normalizeProcessName(p));
          const tags: string[] = Array.isArray(profile.metrics?.tags) ? profile.metrics.tags : [];
          const hourlyOutput = Number(profile.metrics?.hourlyOutput ?? 0);
          const defectRate = Number(profile.metrics?.defectRate ?? 0);
          const hygieneCompliance = Number(profile.metrics?.hygieneCompliance ?? 0);
          const hasProcess = processes.includes(requiredProcess);

          if (profile.skillLevel < minLevel) {
            return { worker: w, profile, score: -1_000_000, hasProcess, tags };
          }

          const score =
            profile.skillLevel * 500 +
            (hasProcess ? 2000 : -3000) +
            hourlyOutput * 5 +
            hygieneCompliance * 2 -
            defectRate * 100000;

          return { worker: w, profile, score, hasProcess, tags };
        })
        .sort((a, b) => b.score - a.score);

      const best = scored[0] ?? null;
      const recommendedWorker = best && best.score > -999_999 ? best.worker : null;
      const skillLevel = best ? best.profile.skillLevel : 1;
      const tags = best?.tags ?? [];
      const unitPrice = baseUnitPriceByProcess[requiredProcess] ?? 0.05;

      const material = materialMap.get(order.productId) || null;
      const matchReason = recommendedWorker
        ? `匹配工序【${requiredProcess}】，Skill 等级 Lv.${skillLevel}，标签：${tags.slice(0, 3).join(' / ') || '暂无'}。建议优先派发以保证产能与质量。`
        : `当前暂无满足【${requiredProcess}】最低技能等级（Lv.${minLevel}）的空闲员工。`;

      return {
        orderId: order.id,
        orderNo: order.orderNo,
        productId: order.productId,
        product: material
          ? { id: material.id, code: material.code, name: material.name, unit: material.unit }
          : null,
        planQty: order.planQty,
        requiredProcess: requiredProcess,
        recommendedUser: recommendedWorker
          ? {
              id: recommendedWorker.id,
              name: recommendedWorker.name,
              skillLevel: skillLevel,
            }
          : null,
        matchReason: matchReason,
        unitPrice: unitPrice,
      };
    });

    return res.json({
      code: 200,
      data: recommendations,
      message: 'success'
    });

  } catch (error) {
    console.error("Dispatch recommendation error:", error);
    return res.status(500).json({ code: 500, error: "获取推荐派工失败" });
  }
});

router.post('/assign', async (req: Request, res: Response) => {
  const { orderId, userId, processName, unitPrice } = req.body;

  try {
    const order = await prisma.workOrder.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ code: 404, error: "工单不存在" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ code: 404, error: "工人不存在" });

    const task = await prisma.task.create({
      data: {
        orderId,
        userId,
        processName,
        unitPrice: Number(unitPrice),
        status: 'active'
      }
    });

    await prisma.workOrder.update({
      where: { id: orderId },
      data: { status: 'active' }
    });

    await prisma.workOrderProcessPlan.updateMany({
      where: { orderId, processName: normalizeProcessName(processName) },
      data: { status: 'active' },
    });

    return res.json({
      code: 200,
      data: task,
      message: '派工成功'
    });

  } catch (error) {
    console.error("Dispatch assign error:", error);
    return res.status(500).json({ code: 500, error: "派工失败" });
  }
});

export default router;
