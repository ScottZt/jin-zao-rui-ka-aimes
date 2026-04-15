import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // 1. Create a User (Worker)
  const worker = await prisma.user.create({
    data: {
      name: '张三',
      cardId: 'C12345',
      role: 'worker',
      status: 'active',
    },
  })
  
  const worker2 = await prisma.user.create({
    data: {
      name: '李四',
      cardId: 'C12346',
      role: 'worker',
      status: 'active',
    },
  })
  console.log('Created workers:', worker.name, worker2.name)

  // Add SkillModel for Li Si (Food Industry)
  await prisma.skillModel.create({
    data: {
      targetType: 'user',
      targetId: worker2.id,
      metrics: JSON.stringify({ 
        tags: ['肉饼煎制熟练工', '高效组装工', '高级全能工'],
        hourlyOutput: 120, 
        defectRate: 0.005, 
        hygieneCompliance: 100,
        processes: ['肉饼煎制', '汉堡组装', '面包烘烤'] 
      }),
      level: 3
    }
  })

  // Add SkillModel for Zhang San (Food Industry)
  await prisma.skillModel.create({
    data: {
      targetType: 'user',
      targetId: worker.id,
      metrics: JSON.stringify({ 
        tags: ['精细切配工', '初级'],
        hourlyOutput: 80, 
        defectRate: 0.02, 
        hygieneCompliance: 98,
        processes: ['蔬菜切配', '包装封口'] 
      }),
      level: 1
    }
  })

  // 2. Create Material
  const material = await prisma.material.create({
    data: {
      code: 'MAT-BURGER-01',
      name: '经典双层牛肉汉堡',
      unit: '个',
      safeStockQty: 500,
      inventory: {
        create: {
          currentQty: 100,
        },
      },
    },
  })
 
  const material2 = await prisma.material.create({
    data: {
      code: 'MAT-BURGER-02',
      name: '香辣鸡腿堡',
      unit: '个',
      safeStockQty: 300,
      inventory: {
        create: {
          currentQty: 60,
        },
      },
    },
  })
 
  const bun = await prisma.material.create({
    data: {
      code: 'MAT-ING-BUN',
      name: '面包胚',
      unit: '份',
      safeStockQty: 800,
      inventory: { create: { currentQty: 260 } },
    },
  })
 
  const patty = await prisma.material.create({
    data: {
      code: 'MAT-ING-PATTY',
      name: '肉饼',
      unit: '片',
      safeStockQty: 800,
      inventory: { create: { currentQty: 320 } },
    },
  })
 
  const veg = await prisma.material.create({
    data: {
      code: 'MAT-ING-VEG',
      name: '蔬菜包（生菜/番茄/洋葱）',
      unit: '份',
      safeStockQty: 600,
      inventory: { create: { currentQty: 120 } },
    },
  })
 
  const sauce = await prisma.material.create({
    data: {
      code: 'MAT-ING-SAUCE',
      name: '酱料',
      unit: '份',
      safeStockQty: 600,
      inventory: { create: { currentQty: 520 } },
    },
  })
 
  const pack = await prisma.material.create({
    data: {
      code: 'MAT-ING-PACK',
      name: '包装材料',
      unit: '套',
      safeStockQty: 1000,
      inventory: { create: { currentQty: 480 } },
    },
  })

  const bomRows = [
    { productId: material.id, materialId: bun.id, qtyPerUnit: 1 },
    { productId: material.id, materialId: patty.id, qtyPerUnit: 1 },
    { productId: material.id, materialId: veg.id, qtyPerUnit: 1 },
    { productId: material.id, materialId: sauce.id, qtyPerUnit: 1 },
    { productId: material.id, materialId: pack.id, qtyPerUnit: 1 },
    { productId: material2.id, materialId: bun.id, qtyPerUnit: 1 },
    { productId: material2.id, materialId: patty.id, qtyPerUnit: 1 },
    { productId: material2.id, materialId: veg.id, qtyPerUnit: 1 },
    { productId: material2.id, materialId: sauce.id, qtyPerUnit: 1 },
    { productId: material2.id, materialId: pack.id, qtyPerUnit: 1 },
  ]

  for (const r of bomRows) {
    await prisma.bOMItem.create({ data: r })
  }

  // 3. Create a WorkOrder
  const order = await prisma.workOrder.create({
    data: {
      orderNo: 'WO-20260415-001',
      productId: material.id,
      planQty: 1000,
      status: 'active',
    },
  })
  
  const pendingOrder = await prisma.workOrder.create({
    data: {
      orderNo: 'WO-20260416-002',
      productId: material.id,
      planQty: 500,
      status: 'pending',
    },
  })
 
  await prisma.workOrder.create({
    data: {
      orderNo: 'WO-20260416-003',
      productId: material.id,
      planQty: 300,
      status: 'draft',
    },
  })
 
  await prisma.workOrder.create({
    data: {
      orderNo: 'WO-20260416-004',
      productId: material2.id,
      planQty: 400,
      status: 'pending',
    },
  })
 
  await prisma.workOrder.create({
    data: {
      orderNo: 'WO-20260416-005',
      productId: material2.id,
      planQty: 200,
      status: 'pending',
    },
  })

  const processSeq = [
    '面包烘烤',
    '肉饼煎制/炸制',
    '蔬菜切配',
    '酱料涂抹',
    '汉堡组装',
    '包装封口',
    '成品装箱',
  ]

  const allOrders = await prisma.workOrder.findMany()
  for (const o of allOrders) {
    const baseStatus = o.status === 'draft' ? 'draft' : 'pending'
    for (const p of processSeq) {
      await prisma.workOrderProcessPlan.create({
        data: {
          orderId: o.id,
          processName: p,
          planQty: o.planQty,
          actualQty: 0,
          status: baseStatus,
        },
      })
    }
  }

  await prisma.workOrderProcessPlan.updateMany({
    where: { orderId: order.id, processName: '蔬菜切配' },
    data: { status: 'active' },
  })

  await prisma.systemSetting.upsert({
    where: { key: 'general' },
    create: {
      key: 'general',
      value: JSON.stringify({ companyName: '汉堡工厂', plantName: '一期车间' }),
    },
    update: {
      value: JSON.stringify({ companyName: '汉堡工厂', plantName: '一期车间' }),
    },
  })

  await prisma.systemSetting.upsert({
    where: { key: 'llmPricing' },
    create: {
      key: 'llmPricing',
      value: JSON.stringify({ costPer1k: 0.002 }),
    },
    update: {
      value: JSON.stringify({ costPer1k: 0.002 }),
    },
  })

  await prisma.systemSetting.upsert({
    where: { key: 'skillMultipliers' },
    create: {
      key: 'skillMultipliers',
      value: JSON.stringify({ 0: 0, 1: 1.0, 2: 1.2, 3: 1.5, 4: 2.0 }),
    },
    update: {
      value: JSON.stringify({ 0: 0, 1: 1.0, 2: 1.2, 3: 1.5, 4: 2.0 }),
    },
  })

  await prisma.systemSetting.upsert({
    where: { key: 'mcpGateway' },
    create: {
      key: 'mcpGateway',
      value: JSON.stringify({
        enabled: true,
        systems: [
          { name: '企业微信', endpoint: 'https://qyapi.weixin.qq.com/', authStrategy: 'webhook' },
          { name: 'ERP', endpoint: 'https://erp.example.com/api', authStrategy: 'token' },
        ],
        retry: { maxAttempts: 5, backoffMs: 1000 },
      }),
    },
    update: {
      value: JSON.stringify({
        enabled: true,
        systems: [
          { name: '企业微信', endpoint: 'https://qyapi.weixin.qq.com/', authStrategy: 'webhook' },
          { name: 'ERP', endpoint: 'https://erp.example.com/api', authStrategy: 'token' },
        ],
        retry: { maxAttempts: 5, backoffMs: 1000 },
      }),
    },
  })

  const processes = [
    { processCode: 'P_BAKE_BUN', processName: '面包烘烤', unit: '份', minLevel: 2, isFinalCount: false },
    { processCode: 'P_FRY_PATTY', processName: '肉饼煎制/炸制', unit: '份', minLevel: 2, isFinalCount: false },
    { processCode: 'P_CUT_VEG', processName: '蔬菜切配', unit: '份', minLevel: 1, isFinalCount: false },
    { processCode: 'P_SPREAD_SAUCE', processName: '酱料涂抹', unit: '份', minLevel: 2, isFinalCount: false },
    { processCode: 'P_ASSEMBLE', processName: '汉堡组装', unit: '个', minLevel: 2, isFinalCount: false },
    { processCode: 'P_PACK', processName: '包装封口', unit: '套', minLevel: 1, isFinalCount: true },
    { processCode: 'P_BOX', processName: '成品装箱', unit: '个', minLevel: 1, isFinalCount: true },
    { processCode: 'P_CLEAN_EQUIP', processName: '设备清洁', unit: '次', minLevel: 1, isFinalCount: false },
    { processCode: 'P_SANITATION', processName: '卫生合规', unit: '次', minLevel: 1, isFinalCount: false },
  ]

  for (const p of processes) {
    await prisma.processDefinition.upsert({
      where: { processCode: p.processCode },
      create: p,
      update: p,
    })
  }

  const pieceRates: Array<{ processCode: string; level: number; unitPrice: number }> = [
    { processCode: 'P_CUT_VEG', level: 1, unitPrice: 0.05 },
    { processCode: 'P_CUT_VEG', level: 2, unitPrice: 0.06 },
    { processCode: 'P_CUT_VEG', level: 3, unitPrice: 0.07 },
    { processCode: 'P_CUT_VEG', level: 4, unitPrice: 0.08 },
    { processCode: 'P_CUT_VEG', level: 5, unitPrice: 0.09 },
    { processCode: 'P_PACK', level: 1, unitPrice: 0.06 },
    { processCode: 'P_PACK', level: 2, unitPrice: 0.08 },
    { processCode: 'P_PACK', level: 3, unitPrice: 0.1 },
    { processCode: 'P_PACK', level: 4, unitPrice: 0.12 },
    { processCode: 'P_PACK', level: 5, unitPrice: 0.14 },
    { processCode: 'P_BOX', level: 1, unitPrice: 0.02 },
    { processCode: 'P_BOX', level: 2, unitPrice: 0.025 },
    { processCode: 'P_BOX', level: 3, unitPrice: 0.03 },
    { processCode: 'P_BOX', level: 4, unitPrice: 0.035 },
    { processCode: 'P_BOX', level: 5, unitPrice: 0.04 },
    { processCode: 'P_BAKE_BUN', level: 2, unitPrice: 0.08 },
    { processCode: 'P_BAKE_BUN', level: 3, unitPrice: 0.1 },
    { processCode: 'P_BAKE_BUN', level: 4, unitPrice: 0.12 },
    { processCode: 'P_BAKE_BUN', level: 5, unitPrice: 0.14 },
    { processCode: 'P_FRY_PATTY', level: 2, unitPrice: 0.16 },
    { processCode: 'P_FRY_PATTY', level: 3, unitPrice: 0.19 },
    { processCode: 'P_FRY_PATTY', level: 4, unitPrice: 0.22 },
    { processCode: 'P_FRY_PATTY', level: 5, unitPrice: 0.25 },
    { processCode: 'P_SPREAD_SAUCE', level: 2, unitPrice: 0.03 },
    { processCode: 'P_SPREAD_SAUCE', level: 3, unitPrice: 0.04 },
    { processCode: 'P_SPREAD_SAUCE', level: 4, unitPrice: 0.05 },
    { processCode: 'P_SPREAD_SAUCE', level: 5, unitPrice: 0.06 },
    { processCode: 'P_ASSEMBLE', level: 2, unitPrice: 0.12 },
    { processCode: 'P_ASSEMBLE', level: 3, unitPrice: 0.15 },
    { processCode: 'P_ASSEMBLE', level: 4, unitPrice: 0.18 },
    { processCode: 'P_ASSEMBLE', level: 5, unitPrice: 0.22 },
    { processCode: 'P_CLEAN_EQUIP', level: 1, unitPrice: 2 },
    { processCode: 'P_CLEAN_EQUIP', level: 2, unitPrice: 3 },
    { processCode: 'P_CLEAN_EQUIP', level: 3, unitPrice: 4 },
    { processCode: 'P_CLEAN_EQUIP', level: 4, unitPrice: 5 },
    { processCode: 'P_CLEAN_EQUIP', level: 5, unitPrice: 6 },
    { processCode: 'P_SANITATION', level: 1, unitPrice: 2 },
    { processCode: 'P_SANITATION', level: 2, unitPrice: 3 },
    { processCode: 'P_SANITATION', level: 3, unitPrice: 4 },
    { processCode: 'P_SANITATION', level: 4, unitPrice: 5 },
    { processCode: 'P_SANITATION', level: 5, unitPrice: 6 },
  ]

  const effectiveFrom = new Date()
  for (const r of pieceRates) {
    await prisma.pieceRate.create({
      data: { processCode: r.processCode, level: r.level, unitPrice: r.unitPrice, effectiveFrom },
    })
  }

  await prisma.rewardPolicy.upsert({
    where: { rewardCode: 'R_ZERO_DEFECT' },
    create: {
      rewardCode: 'R_ZERO_DEFECT',
      rewardName: '全工序无次品奖励',
      triggerScope: 'shift',
      conditionJson: JSON.stringify({ minGoodQty: 200 }),
      amountJson: JSON.stringify({ type: 'fixed', amount: 30 }),
      maxAmountPerShift: 30,
      enabled: true,
    },
    update: {
      rewardName: '全工序无次品奖励',
      triggerScope: 'shift',
      conditionJson: JSON.stringify({ minGoodQty: 200 }),
      amountJson: JSON.stringify({ type: 'fixed', amount: 30 }),
      maxAmountPerShift: 30,
      enabled: true,
    },
  })

  await prisma.rewardPolicy.upsert({
    where: { rewardCode: 'R_FAULT_REPORT_VERIFIED' },
    create: {
      rewardCode: 'R_FAULT_REPORT_VERIFIED',
      rewardName: '设备异常核实奖励',
      triggerScope: 'shift',
      conditionJson: JSON.stringify({ perEvent: true }),
      amountJson: JSON.stringify({ type: 'fixed', amount: 10 }),
      maxAmountPerShift: 30,
      enabled: true,
    },
    update: {
      rewardName: '设备异常核实奖励',
      triggerScope: 'shift',
      conditionJson: JSON.stringify({ perEvent: true }),
      amountJson: JSON.stringify({ type: 'fixed', amount: 10 }),
      maxAmountPerShift: 30,
      enabled: true,
    },
  })

  await prisma.penaltyPolicy.upsert({
    where: { penaltyCode: 'P_LOSS_OVER' },
    create: {
      penaltyCode: 'P_LOSS_OVER',
      penaltyName: '个人损耗率超标扣减',
      triggerScope: 'shift',
      conditionJson: JSON.stringify({ threshold: 0.03, minGoodQty: 100 }),
      amountJson: JSON.stringify({ type: 'formula', formula: '(rate-threshold)*goodQty*0.2', cap: 50 }),
      maxPenaltyPerShift: 50,
      enabled: true,
    },
    update: {
      penaltyName: '个人损耗率超标扣减',
      triggerScope: 'shift',
      conditionJson: JSON.stringify({ threshold: 0.03, minGoodQty: 100 }),
      amountJson: JSON.stringify({ type: 'formula', formula: '(rate-threshold)*goodQty*0.2', cap: 50 }),
      maxPenaltyPerShift: 50,
      enabled: true,
    },
  })

  // 4. Create a Task for the worker
  const task = await prisma.task.create({
    data: {
      orderId: order.id,
      processName: '蔬菜切配', // Food industry process
      userId: worker.id,
      unitPrice: 0.15, // Base price for cutting
      status: 'active',
    },
  })
  console.log('Created task for worker:', task.processName)

  console.log('Database seeded successfully.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
