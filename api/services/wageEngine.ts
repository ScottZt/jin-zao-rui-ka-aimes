import prisma from '../prisma.js'

const normalizeProcessNameToCode = (name: string) => {
  if (name === '包装') name = '包装封口'
  if (name === '组装') name = '汉堡组装'
  if (name === '切配') name = '蔬菜切配'
  if (name === '肉饼煎制') name = '肉饼煎制/炸制'
  if (name === '炸肉饼') name = '肉饼煎制/炸制'

  const map: Record<string, string> = {
    '面包烘烤': 'P_BAKE_BUN',
    '肉饼煎制/炸制': 'P_FRY_PATTY',
    '蔬菜切配': 'P_CUT_VEG',
    '酱料涂抹': 'P_SPREAD_SAUCE',
    '汉堡组装': 'P_ASSEMBLE',
    '包装封口': 'P_PACK',
    '成品装箱': 'P_BOX',
    '设备清洁': 'P_CLEAN_EQUIP',
    '卫生合规': 'P_SANITATION',
  }

  return map[name] || null
}

const getShiftRange = (now: Date) => {
  const h = now.getHours()
  let start = 8
  let end = 16
  let name: '早班' | '晚班' | '夜班' = '早班'

  if (h >= 16 && h < 24) {
    start = 16
    end = 24
    name = '晚班'
  } else if (h >= 0 && h < 8) {
    start = 0
    end = 8
    name = '夜班'
  }

  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), start, 0, 0)
  const endAt = end === 24 ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59) : new Date(day.getFullYear(), day.getMonth(), day.getDate(), end, 0, 0)
  return { name, startAt, endAt }
}

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value) as any
  } catch {
    return null
  }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export async function computeSettlementForUserNow(userId: string) {
  const now = new Date()
  const shift = getShiftRange(now)

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('user not found')

  const skill = await prisma.skillModel.findFirst({ where: { targetType: 'user', targetId: userId } })
  const level = skill?.level ?? 1

  const logs = await prisma.reportLog.findMany({
    where: {
      userId,
      createdAt: { gte: shift.startAt, lte: shift.endAt },
    },
    include: { task: true },
  })

  const agg = new Map<string, { goodQty: number; badQty: number }>()
  for (const l of logs) {
    const processCode = normalizeProcessNameToCode(l.task.processName)
    if (!processCode) continue
    const cur = agg.get(processCode) || { goodQty: 0, badQty: 0 }
    cur.goodQty += l.goodQty
    cur.badQty += l.badQty
    agg.set(processCode, cur)
  }

  const processCodes = Array.from(agg.keys())
  const rates = await prisma.pieceRate.findMany({
    where: { processCode: { in: processCodes }, level },
    orderBy: { effectiveFrom: 'desc' },
  })
  const rateMap = new Map(rates.map((r) => [r.processCode, r.unitPrice]))

  const lines = processCodes.map((pc) => {
    const q = agg.get(pc)!
    const unitPrice = rateMap.get(pc) ?? 0
    const amount = q.goodQty * unitPrice
    return { processCode: pc, level, goodQty: q.goodQty, badQty: q.badQty, unitPrice, amount: Number(amount.toFixed(2)) }
  })

  const pieceAmount = Number(lines.reduce((s, x) => s + x.amount, 0).toFixed(2))

  const totalGood = lines.reduce((s, x) => s + x.goodQty, 0)
  const totalBad = lines.reduce((s, x) => s + x.badQty, 0)
  const defectRate = totalGood + totalBad > 0 ? totalBad / (totalGood + totalBad) : 0

  const rewardPolicies = await prisma.rewardPolicy.findMany({ where: { enabled: true } })
  const penaltyPolicies = await prisma.penaltyPolicy.findMany({ where: { enabled: true } })

  let rewardAmount = 0
  const rewardItems: Array<{ code: string; name: string; amount: number }> = []

  for (const rp of rewardPolicies) {
    if (rp.rewardCode === 'R_ZERO_DEFECT') {
      const cond = safeJsonParse(rp.conditionJson) || {}
      const minGoodQty = Number(cond.minGoodQty ?? 0)
      if (totalBad === 0 && totalGood >= minGoodQty) {
        const amtCfg = safeJsonParse(rp.amountJson) || { type: 'fixed', amount: 0 }
        const amt = Number(amtCfg.amount ?? 0)
        const applied = rp.maxAmountPerShift > 0 ? Math.min(amt, rp.maxAmountPerShift) : amt
        rewardAmount += applied
        rewardItems.push({ code: rp.rewardCode, name: rp.rewardName, amount: applied })
      }
    }

    if (rp.rewardCode === 'R_FAULT_REPORT_VERIFIED') {
      const events = await prisma.equipmentEvent.count({
        where: { createdAt: { gte: shift.startAt, lte: shift.endAt }, status: 'fault', reportedByUserId: userId },
      })
      if (events > 0) {
        const amtCfg = safeJsonParse(rp.amountJson) || { type: 'fixed', amount: 0 }
        const per = Number(amtCfg.amount ?? 0)
        const raw = per * events
        const applied = rp.maxAmountPerShift > 0 ? Math.min(raw, rp.maxAmountPerShift) : raw
        rewardAmount += applied
        rewardItems.push({ code: rp.rewardCode, name: rp.rewardName, amount: Number(applied.toFixed(2)) })
      }
    }
  }

  let penaltyAmount = 0
  const penaltyItems: Array<{ code: string; name: string; amount: number }> = []

  for (const pp of penaltyPolicies) {
    if (pp.penaltyCode === 'P_LOSS_OVER') {
      const cond = safeJsonParse(pp.conditionJson) || {}
      const threshold = Number(cond.threshold ?? 0.03)
      const minGoodQty = Number(cond.minGoodQty ?? 100)
      if (totalGood >= minGoodQty && defectRate > threshold) {
        const over = defectRate - threshold
        const raw = over * totalGood * 0.2
        const applied = pp.maxPenaltyPerShift > 0 ? Math.min(raw, pp.maxPenaltyPerShift) : raw
        penaltyAmount += applied
        penaltyItems.push({ code: pp.penaltyCode, name: pp.penaltyName, amount: Number(applied.toFixed(2)) })
      }
    }
  }

  rewardAmount = Number(rewardAmount.toFixed(2))
  penaltyAmount = Number(penaltyAmount.toFixed(2))

  const finalAmount = Number((pieceAmount + rewardAmount - penaltyAmount).toFixed(2))

  const breakdown = {
    scope: 'shift',
    shiftName: shift.name,
    periodStart: shift.startAt.toISOString(),
    periodEnd: shift.endAt.toISOString(),
    user: { id: user.id, name: user.name, cardId: user.cardId, level },
    lines,
    totals: {
      goodQty: totalGood,
      badQty: totalBad,
      defectRate: Number((defectRate * 100).toFixed(2)),
      pieceAmount,
      rewardAmount,
      penaltyAmount,
      finalAmount,
    },
    rewards: rewardItems,
    penalties: penaltyItems,
  }

  const saved = await prisma.wageSettlement.upsert({
    where: { userId_scope_periodStart: { userId, scope: 'shift', periodStart: shift.startAt } },
    create: {
      userId,
      scope: 'shift',
      periodStart: shift.startAt,
      periodEnd: shift.endAt,
      pieceAmount,
      rewardAmount,
      penaltyAmount,
      finalAmount,
      breakdownJson: JSON.stringify(breakdown),
    },
    update: {
      periodEnd: shift.endAt,
      pieceAmount,
      rewardAmount,
      penaltyAmount,
      finalAmount,
      breakdownJson: JSON.stringify(breakdown),
    },
  })

  return { settlementId: saved.id, breakdown }
}
