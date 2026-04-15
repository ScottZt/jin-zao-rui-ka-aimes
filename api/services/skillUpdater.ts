import prisma from '../prisma.js'

type SkillMetrics = {
  tags?: string[]
  processes?: string[]
  hourlyOutput?: number
  defectRate?: number
  hygieneCompliance?: number
}

const safeJsonParse = (value: string | null | undefined) => {
  if (!value) return null
  try {
    return JSON.parse(value) as SkillMetrics
  } catch {
    return null
  }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const ema = (prev: number, next: number, alpha: number) => prev * (1 - alpha) + next * alpha

const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)))

async function getOrCreateUserSkill(userId: string) {
  const existing = await prisma.skillModel.findFirst({
    where: { targetType: 'user', targetId: userId },
  })

  if (existing) return existing

  return prisma.skillModel.create({
    data: {
      targetType: 'user',
      targetId: userId,
      level: 0,
      metrics: JSON.stringify({
        tags: ['新员工/学徒'],
        processes: [],
        hourlyOutput: 0,
        defectRate: 0,
        hygieneCompliance: 100,
      } satisfies SkillMetrics),
    },
  })
}

function inferTags(level: number, processName: string, hourlyOutput: number, defectRate: number, processes: string[]) {
  const tags: string[] = []
  if (level === 0) tags.push('新员工/学徒')
  if (processName.includes('组装') && hourlyOutput >= 100) tags.push('高效组装工')
  if ((processName.includes('切配') || processName.includes('蔬菜')) && defectRate <= 0.02) tags.push('精细切配工')
  if (processName.includes('烘烤') && defectRate <= 0.01) tags.push('面包烘烤熟练工')
  if (processName.includes('煎制') || processName.includes('炸')) tags.push('肉饼煎制熟练工')
  if (processName.includes('包装') && hourlyOutput >= 120) tags.push('高速包装工')
  if (processes.length >= 5) tags.push('多工序全能工')
  return uniq(tags)
}

export async function updateSkillFromReport(params: {
  userId: string
  processName: string
  goodQty: number
  badQty: number
}) {
  const model = await getOrCreateUserSkill(params.userId)
  const current = safeJsonParse(model.metrics) || {}

  const prevHourly = Number(current.hourlyOutput ?? 0)
  const prevDefect = Number(current.defectRate ?? 0)
  const prevHygiene = Number(current.hygieneCompliance ?? 100)

  const denom = params.goodQty + params.badQty
  const currentDefect = denom > 0 ? params.badQty / denom : 0

  const estimatedHourly = clamp(params.goodQty * 2, 0, 260)
  const hourlyOutput = Math.round(ema(prevHourly, estimatedHourly, 0.2))
  const defectRate = Number(ema(prevDefect, currentDefect, 0.2).toFixed(4))

  const processes = uniq([...(Array.isArray(current.processes) ? current.processes : []), params.processName])
  const existingTags = Array.isArray(current.tags) ? current.tags : []
  const inferredTags = inferTags(model.level, params.processName, hourlyOutput, defectRate, processes)
  const tags = uniq([...existingTags, ...inferredTags])

  const metrics: SkillMetrics = {
    ...current,
    tags,
    processes,
    hourlyOutput,
    defectRate,
    hygieneCompliance: clamp(prevHygiene, 0, 100),
  }

  return prisma.skillModel.update({
    where: { id: model.id },
    data: { metrics: JSON.stringify(metrics) },
  })
}

export async function updateSkillFromException(params: { userId: string; exceptionType: string }) {
  const model = await getOrCreateUserSkill(params.userId)
  const current = safeJsonParse(model.metrics) || {}
  const prevHygiene = Number(current.hygieneCompliance ?? 100)

  const hygieneCompliance =
    params.exceptionType === '卫生合规' ? clamp(prevHygiene - 5, 0, 100) : clamp(prevHygiene, 0, 100)

  const metrics: SkillMetrics = {
    ...current,
    hygieneCompliance,
  }

  return prisma.skillModel.update({
    where: { id: model.id },
    data: { metrics: JSON.stringify(metrics) },
  })
}

