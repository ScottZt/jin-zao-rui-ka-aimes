import prisma from '../prisma.js'

const inferEquipmentType = (text: string) => {
  if (text.includes('烤箱')) return '烤箱'
  if (text.includes('炸') || text.includes('炸炉')) return '炸炉'
  if (text.includes('包装')) return '包装机'
  return '未知设备'
}

export async function createEquipmentFaultEvent(params: { taskId: string; description: string }) {
  const now = new Date()
  const endedAt = new Date(now.getTime() + 10 * 60 * 1000)
  const task = await prisma.task.findUnique({ where: { id: params.taskId } })

  return prisma.equipmentEvent.create({
    data: {
      equipmentType: inferEquipmentType(params.description),
      status: 'fault',
      reportedByUserId: task?.userId || null,
      description: params.description,
      startedAt: now,
      endedAt,
      durationMinutes: 10,
    },
  })
}
