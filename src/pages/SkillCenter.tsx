import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from 'recharts'
import { BrainCircuit, BadgeCheck, RefreshCw } from 'lucide-react'

type SkillUser = {
  id: string
  name: string
  cardId: string
  skill: null | {
    level: number
    tags: string[]
    processes: string[]
    hourlyOutput: number
    defectRate: number
    hygieneCompliance: number
  }
}

type RadarRow = { name: string; value: number }

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const normalizeProfile = (u: SkillUser): RadarRow[] => {
  const s = u.skill
  const level = s?.level ?? 0
  const hourly = s?.hourlyOutput ?? 0
  const defectRate = s?.defectRate ?? 0
  const hygiene = s?.hygieneCompliance ?? 0
  const processes = s?.processes ?? []

  const capacity = clamp((hourly / 160) * 100, 0, 100)
  const quality = clamp((1 - defectRate) * 100, 0, 100)
  const hygieneScore = clamp(hygiene, 0, 100)
  const versatility = clamp((processes.length / 10) * 100, 0, 100)
  const levelScore = clamp((level / 4) * 100, 0, 100)

  return [
    { name: '产能', value: Math.round(capacity) },
    { name: '质量', value: Math.round(quality) },
    { name: '卫生', value: Math.round(hygieneScore) },
    { name: '多能', value: Math.round(versatility) },
    { name: '等级', value: Math.round(levelScore) },
  ]
}

const levelLabel = (level: number) => {
  if (level === 0) return 'Lv0 新员工'
  if (level === 1) return 'Lv1 初级'
  if (level === 2) return 'Lv2 中级'
  if (level === 3) return 'Lv3 高级'
  return 'Lv4 技师'
}

export default function SkillCenter() {
  const [users, setUsers] = useState<SkillUser[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const selected = useMemo(() => users.find((u) => u.id === selectedId) || null, [users, selectedId])
  const radarData = useMemo(() => (selected ? normalizeProfile(selected) : []), [selected])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/skills/users')
      const json = await res.json()
      if (json.code === 200) {
        setUsers(json.data)
        if (!selectedId && json.data.length > 0) setSelectedId(json.data[0].id)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-wide flex items-center">
            <BrainCircuit className="mr-3 text-indigo-400" />
            人力资源
          </h1>
          <p className="text-slate-400 text-sm mt-1">员工画像雷达图与技能档案，用于智能派工、新人培训与组织效能提升</p>
        </div>
        <button
          onClick={fetchUsers}
          className="p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors shadow-sm"
          title="刷新"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-1 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm flex flex-col min-h-0">
          <div className="px-5 py-4 border-b border-slate-800/50 bg-slate-900/70 flex justify-between items-center">
            <div className="text-sm text-slate-300">员工列表</div>
            <div className="text-xs text-slate-500">{users.length} 人</div>
          </div>
          <div className="p-4 overflow-auto custom-scrollbar flex-1">
            {loading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-400"></div>
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((u) => {
                  const active = u.id === selectedId
                  const level = u.skill?.level ?? 0
                  return (
                    <button
                      key={u.id}
                      onClick={() => setSelectedId(u.id)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                        active
                          ? 'bg-indigo-950/40 border-indigo-500/30 text-slate-100'
                          : 'bg-slate-950/30 border-slate-800 text-slate-300 hover:bg-slate-900/60 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs font-mono text-slate-500">{u.cardId}</div>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <div className="text-xs text-indigo-300">{levelLabel(level)}</div>
                        <div className="text-xs text-slate-500">
                          覆盖 {u.skill?.processes?.length ?? 0} 道工序
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm flex flex-col min-h-0">
          <div className="px-5 py-4 border-b border-slate-800/50 bg-slate-900/70 flex justify-between items-center">
            <div className="text-sm text-slate-300 flex items-center">
              <BadgeCheck size={16} className="mr-2 text-indigo-400" />
              员工画像
            </div>
            <div className="text-xs text-slate-500">0-100 标准化评分</div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 p-6 flex-1 min-h-0">
            <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-4 flex flex-col min-h-0">
              <div className="text-sm text-slate-300 mb-3">
                {selected ? (
                  <span className="text-slate-100 font-medium">{selected.name}</span>
                ) : (
                  '请选择员工'
                )}
                {selected?.skill ? (
                  <span className="ml-2 text-xs text-indigo-300">{levelLabel(selected.skill.level)}</span>
                ) : null}
              </div>
              <div className="flex-1 min-h-[260px]">
                {selected ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#1f2937" />
                      <PolarAngleAxis dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        stroke="#334155"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0b1220',
                          border: '1px solid #1e293b',
                          borderRadius: 8,
                          color: '#e2e8f0',
                        }}
                        formatter={(v: any) => [`${v} / 100`, '评分']}
                      />
                      <Radar
                        name="画像"
                        dataKey="value"
                        stroke="#818cf8"
                        fill="#818cf8"
                        fillOpacity={0.25}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            </div>

            <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-4 flex flex-col min-h-0">
              <div className="text-sm text-slate-300 mb-3">关键指标</div>
              {selected?.skill ? (
                <div className="space-y-4 overflow-auto custom-scrollbar pr-2">
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard title="每小时产量" value={`${selected.skill.hourlyOutput || 0}`} suffix="个/小时" />
                    <MetricCard
                      title="不合格品率"
                      value={`${((selected.skill.defectRate || 0) * 100).toFixed(2)}`}
                      suffix="%"
                    />
                    <MetricCard title="卫生合规分" value={`${selected.skill.hygieneCompliance || 0}`} suffix="/100" />
                    <MetricCard title="工序覆盖" value={`${selected.skill.processes.length}`} suffix="道" />
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 mb-2">Skill 标签</div>
                    <div className="flex flex-wrap gap-2">
                      {(selected.skill.tags || []).length ? (
                        selected.skill.tags.map((t) => (
                          <span
                            key={t}
                            className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                          >
                            {t}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-600">暂无标签</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 mb-2">擅长工序</div>
                    <div className="flex flex-wrap gap-2">
                      {(selected.skill.processes || []).length ? (
                        selected.skill.processes.map((p) => (
                          <span
                            key={p}
                            className="text-xs px-2.5 py-1 rounded-full bg-slate-800/60 text-slate-200 border border-slate-700/60"
                          >
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-600">暂无工序</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">该员工尚未建立 Skill 画像</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard(props: { title: string; value: string; suffix: string }) {
  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className="bg-slate-900/40 border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition-colors"
    >
      <div className="text-xs text-slate-500">{props.title}</div>
      <div className="mt-1 flex items-baseline">
        <div className="text-xl font-mono font-bold text-slate-100">{props.value}</div>
        <div className="ml-2 text-xs text-slate-500">{props.suffix}</div>
      </div>
    </motion.div>
  )
}
