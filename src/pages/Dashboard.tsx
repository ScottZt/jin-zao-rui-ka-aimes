import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Clock,
  Factory,
  PackageSearch,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
  Volume2,
  VolumeX,
} from 'lucide-react'

type Level = 'green' | 'yellow' | 'red'

type DashboardData = {
  timestamp: string
  header: { companyName: string; plantName: string }
  shift: {
    name: '早班' | '中班' | '晚班' | '夜班'
    remainingMinutes: number
    handoverTime: string
  }
  dailyTask: {
    planTotalQty: number
    actualTotalQty: number
    achievementRate: number
    remainingQty: number
    remainingMinutes: number
  }
  processOutput: Array<{
    processName: string
    planQty: number
    actualQty: number
    achievementRate: number
    status: Level
  }>
  quality: {
    goodQty: number
    badQty: number
    lossRate: number
    topDefects: Array<{ reason: string; qty: number }>
    status: Level
  }
  materials: {
    overview: Array<{ materialKey: string; currentQty: number; safeQty: number; unit: string; status: Level }>
    shortageList: Array<{ materialName: string; currentQty: number; safeQty: number; shortageQty: number; unit: string; status: Level }>
  }
  equipment: {
    fryerOven: { status: '运行' | '待机' | '故障' }
    packer: { status: '运行' | '待机' | '故障' }
    downtimeCount: number
    downtimeMinutes: number
    status: Level
  }
  workforce: {
    onlineCount: number
    perCapitaHourlyOutput: number
    workerDistribution: { noviceCount: number; skilledCount: number }
    skillLevelDistribution: Record<string, number>
  }
  orders: {
    pendingCount: number
    activeCount: number
    completedCount: number
    delayedRiskCount: number
  }
  safety: {
    sanitationStatus: '正常' | '待确认' | '超时'
    sanitationNextDueTime?: string
    shelfLifeWarning: { nearExpiryBatchCount: number; expiredBatchCount: number }
  }
  alerts: Array<{
    id: string
    level: 'yellow' | 'red'
    type: string
    message: string
    shouldVoiceBroadcast: boolean
    createdAt: string
  }>
}

const levelColor = (level: Level) => {
  if (level === 'green') return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25'
  if (level === 'yellow') return 'text-amber-300 bg-amber-500/10 border-amber-500/25'
  return 'text-rose-300 bg-rose-500/10 border-rose-500/25'
}

const levelDot = (level: Level) => {
  if (level === 'green') return 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]'
  if (level === 'yellow') return 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)] animate-pulse'
  return 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.9)] animate-pulse'
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const spokenRef = useRef<Set<string>>(new Set())

  const fetchData = async () => {
    try {
      const res = await fetch('/api/v1/dashboard/burger')
      const json = await res.json()
      if (json.code === 200) setData(json.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 10000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!voiceEnabled) return
    if (!data?.alerts?.length) return
    const voice = window.speechSynthesis
    if (!voice) return

    const newAlerts = data.alerts.filter((a) => a.shouldVoiceBroadcast && !spokenRef.current.has(a.id))
    if (!newAlerts.length) return

    for (const a of newAlerts.slice(0, 2)) {
      const u = new SpeechSynthesisUtterance(`注意：${a.type}。${a.message}`)
      u.lang = 'zh-CN'
      voice.speak(u)
      spokenRef.current.add(a.id)
    }
  }, [data, voiceEnabled])

  const headerTitle = useMemo(() => {
    if (!data) return '汉堡工厂生产实时看板'
    return `${data.header.companyName} · ${data.header.plantName} · 生产实时看板`
  }, [data])

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Factory size={20} className="text-cyan-300" />
            </div>
            <div>
              <div className="text-lg md:text-xl font-bold tracking-wide text-slate-100">{headerTitle}</div>
              <div className="text-xs md:text-sm text-slate-400 mt-0.5 flex items-center gap-3">
                <span className="inline-flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${data?.shift ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  {data?.shift ? `${data.shift.name} · 剩余 ${data.shift.remainingMinutes} 分钟` : '10 秒级刷新'}
                </span>
                <span className="hidden md:inline">更新时间：{data ? new Date(data.timestamp).toLocaleTimeString() : '—'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setVoiceEnabled((v) => !v)}
              className={`px-3 py-2 rounded-lg border text-sm transition-colors ${voiceEnabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-950/30 text-slate-400 hover:text-slate-200'}`}
            >
              {voiceEnabled ? (
                <span className="inline-flex items-center gap-2">
                  <Volume2 size={16} />
                  语音播报开
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <VolumeX size={16} />
                  语音播报关
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <BigMetric title="计划总产量" value={loading ? '—' : String(data?.dailyTask.planTotalQty ?? 0)} unit="个" tone="neutral" />
            <BigMetric title="实际完成" value={loading ? '—' : String(data?.dailyTask.actualTotalQty ?? 0)} unit="个" tone="good" />
            <BigMetric
              title="达成率"
              value={loading ? '—' : `${(data?.dailyTask.achievementRate ?? 0).toFixed(1)}`}
              unit="%"
              tone={rateTone(data?.dailyTask.achievementRate ?? 0)}
            />
            <BigMetric title="剩余产量" value={loading ? '—' : String(data?.dailyTask.remainingQty ?? 0)} unit="个" tone="warn" />
            <BigMetric title="剩余时间" value={loading ? '—' : String(data?.dailyTask.remainingMinutes ?? 0)} unit="分钟" tone="neutral" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Panel title="关键工序实时产量（计划 / 实际 / 达成率）" icon={<Clock size={16} className="text-cyan-300" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(data?.processOutput ?? []).map((p) => (
                <ProcessRow
                  key={p.processName}
                  name={p.processName}
                  plan={p.planQty}
                  actual={p.actualQty}
                  rate={p.achievementRate}
                  level={p.status}
                />
              ))}
              {loading && !data ? (
                <div className="md:col-span-2 h-28 rounded-xl bg-slate-950/40 border border-slate-800 animate-pulse" />
              ) : null}
            </div>
          </Panel>

          <Panel title="订单交付" icon={<Truck size={16} className="text-indigo-300" />}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MiniKpi title="待生产订单" value={data?.orders.pendingCount ?? 0} level={data?.orders.pendingCount ? 'yellow' : 'green'} />
              <MiniKpi title="生产中订单" value={data?.orders.activeCount ?? 0} level={data?.orders.activeCount ? 'green' : 'yellow'} />
              <MiniKpi title="已完成订单" value={data?.orders.completedCount ?? 0} level="green" />
              <MiniKpi title="延迟风险订单" value={data?.orders.delayedRiskCount ?? 0} level={(data?.orders.delayedRiskCount ?? 0) > 0 ? 'red' : 'green'} />
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="品质与损耗" icon={<AlertTriangle size={16} className="text-rose-300" />}>
            <div className="grid grid-cols-3 gap-3">
              <MiniKpi title="合格品" value={data?.quality.goodQty ?? 0} level="green" />
              <MiniKpi title="次品/报废" value={data?.quality.badQty ?? 0} level={(data?.quality.status ?? 'green') === 'red' ? 'red' : 'yellow'} />
              <MiniKpi title="损耗率" value={`${(data?.quality.lossRate ?? 0).toFixed(1)}%`} level={data?.quality.status ?? 'green'} />
            </div>
            <div className="mt-4">
              <div className="text-xs text-slate-500 mb-2">常见次品原因</div>
              <div className="grid grid-cols-2 gap-2">
                {(data?.quality.topDefects ?? []).slice(0, 6).map((d) => (
                  <div key={d.reason} className="bg-slate-950/30 border border-slate-800 rounded-lg px-3 py-2 flex justify-between">
                    <span className="text-sm text-slate-200">{d.reason}</span>
                    <span className="text-sm font-mono text-slate-400">{d.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="物料缺料预警" icon={<PackageSearch size={16} className="text-amber-300" />}>
            <div className="space-y-3">
              {(data?.materials.overview ?? []).map((m) => (
                <StockRow
                  key={m.materialKey}
                  name={m.materialKey}
                  current={m.currentQty}
                  safe={m.safeQty}
                  unit={m.unit}
                  level={m.status}
                />
              ))}
            </div>

            {(data?.materials.shortageList?.length ?? 0) > 0 ? (
              <div className="mt-4">
                <div className="text-xs text-slate-500 mb-2">缺料清单</div>
                <div className="space-y-2">
                  {data!.materials.shortageList.slice(0, 5).map((s) => (
                    <div key={s.materialName} className={`rounded-lg border px-3 py-2 ${levelColor(s.status as Level)}`}>
                      <div className="flex justify-between items-center">
                        <div className="text-sm font-medium">{s.materialName}</div>
                        <div className="text-sm font-mono">缺口 {s.shortageQty}{s.unit}</div>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        当前 {s.currentQty}{s.unit} / 安全线 {s.safeQty}{s.unit}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel title="设备状态" icon={<Wrench size={16} className="text-emerald-300" />}>
            <div className="grid grid-cols-2 gap-3">
              <DeviceCard title="炸炉/烤箱" status={data?.equipment.fryerOven.status ?? '运行'} level={data?.equipment.status ?? 'green'} />
              <DeviceCard title="包装机" status={data?.equipment.packer.status ?? '运行'} level={data?.equipment.status ?? 'green'} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <MiniKpi title="停机次数" value={data?.equipment.downtimeCount ?? 0} level={(data?.equipment.downtimeCount ?? 0) > 0 ? 'yellow' : 'green'} />
              <MiniKpi title="停机时长" value={`${data?.equipment.downtimeMinutes ?? 0} 分`} level={(data?.equipment.downtimeMinutes ?? 0) >= 30 ? 'red' : (data?.equipment.downtimeMinutes ?? 0) > 0 ? 'yellow' : 'green'} />
            </div>
          </Panel>

          <Panel title="人员效率 / 时效与安全" icon={<Users size={16} className="text-slate-200" />}>
            <div className="grid grid-cols-2 gap-3">
              <MiniKpi title="在线人数" value={data?.workforce.onlineCount ?? 0} level={(data?.workforce.onlineCount ?? 0) > 0 ? 'green' : 'yellow'} />
              <MiniKpi title="人均小时产量" value={`${data?.workforce.perCapitaHourlyOutput ?? 0}`} level="green" />
            </div>
            <div className="mt-3 bg-slate-950/30 border border-slate-800 rounded-xl p-3">
              <div className="flex justify-between text-xs text-slate-500">
                <span>熟练工(Lv2+)</span>
                <span>{data?.workforce.workerDistribution.skilledCount ?? 0} 人</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>新员工(Lv0~Lv1)</span>
                <span>{data?.workforce.workerDistribution.noviceCount ?? 0} 人</span>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {['Lv0', 'Lv1', 'Lv2', 'Lv3', 'Lv4'].map((k) => (
                  <div key={k} className="bg-slate-900/40 border border-slate-800 rounded-lg p-2 text-center">
                    <div className="text-[10px] text-slate-500">{k}</div>
                    <div className="text-sm font-mono font-bold text-slate-100">{data?.workforce.skillLevelDistribution?.[k] ?? 0}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 bg-slate-950/30 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-200">
                <ShieldCheck size={16} className={safetyIconColor(data?.safety.sanitationStatus ?? '正常')} />
                卫生消毒
              </div>
              <div className={`text-sm font-medium ${safetyTextColor(data?.safety.sanitationStatus ?? '正常')}`}>
                {data?.safety.sanitationStatus ?? '正常'}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {(data?.alerts?.length ?? 0) > 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/50 flex items-center justify-between">
            <div className="text-sm text-slate-200 font-medium">异常滚动</div>
            <div className="text-xs text-slate-500">红色异常将触发语音播报</div>
          </div>
          <div className="p-4 overflow-hidden">
            <div className="flex gap-3 flex-wrap">
              {data!.alerts.slice(0, 8).map((a) => (
                <div key={a.id} className={`px-3 py-2 rounded-lg border ${levelColor(a.level)}`}>
                  <div className="text-xs opacity-80">{a.type}</div>
                  <div className="text-sm font-medium">{a.message}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Panel(props: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-950/40 border border-slate-800 flex items-center justify-center">
            {props.icon}
          </div>
          <div className="text-sm md:text-base text-slate-200 font-semibold">{props.title}</div>
        </div>
      </div>
      <div className="p-5">{props.children}</div>
    </div>
  )
}

function BigMetric(props: { title: string; value: string; unit: string; tone: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const toneClass =
    props.tone === 'good'
      ? 'border-emerald-500/25 bg-emerald-500/10'
      : props.tone === 'warn'
      ? 'border-amber-500/25 bg-amber-500/10'
      : props.tone === 'bad'
      ? 'border-rose-500/25 bg-rose-500/10'
      : 'border-slate-800 bg-slate-950/30'

  const valueClass =
    props.tone === 'good'
      ? 'text-emerald-300'
      : props.tone === 'warn'
      ? 'text-amber-300'
      : props.tone === 'bad'
      ? 'text-rose-300'
      : 'text-slate-100'

  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className={`rounded-2xl border p-4 ${toneClass}`}
    >
      <div className="text-xs md:text-sm text-slate-400">{props.title}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className={`text-3xl md:text-4xl font-mono font-extrabold tracking-tight ${valueClass}`}>{props.value}</div>
        <div className="text-sm text-slate-500">{props.unit}</div>
      </div>
    </motion.div>
  )
}

function ProcessRow(props: { name: string; plan: number; actual: number; rate: number; level: Level }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex items-center justify-between">
        <div className="text-base md:text-lg font-semibold text-slate-100">{props.name}</div>
        <div className={`px-2.5 py-1 rounded-lg border text-sm font-mono ${levelColor(props.level)}`}>{props.rate.toFixed(1)}%</div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <SmallNumber title="计划" value={props.plan} />
        <SmallNumber title="实际" value={props.actual} />
        <SmallNumber title="差值" value={Math.max(0, props.plan - props.actual)} />
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-900/60 overflow-hidden">
        <div className={`h-full ${progressColor(props.level)}`} style={{ width: `${clamp(props.rate, 0, 100)}%` }} />
      </div>
    </div>
  )
}

function SmallNumber(props: { title: string; value: number }) {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
      <div className="text-[11px] text-slate-500">{props.title}</div>
      <div className="text-lg md:text-xl font-mono font-bold text-slate-100 mt-1">{props.value}</div>
    </div>
  )
}

function MiniKpi(props: { title: string; value: any; level: Level }) {
  return (
    <div className={`rounded-xl border p-4 ${levelColor(props.level)}`}>
      <div className="text-xs opacity-80">{props.title}</div>
      <div className="mt-2 text-2xl font-mono font-extrabold tracking-tight">{props.value}</div>
    </div>
  )
}

function StockRow(props: { name: string; current: number; safe: number; unit: string; level: Level }) {
  const percent = props.safe > 0 ? (props.current / props.safe) * 100 : 0
  return (
    <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${levelDot(props.level)}`} />
          <div className="text-sm font-medium text-slate-100">{props.name}</div>
        </div>
        <div className="text-sm font-mono text-slate-200">
          {props.current}{props.unit}
          <span className="text-slate-500"> / {props.safe}{props.unit}</span>
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-900/60 overflow-hidden">
        <div className={`h-full ${progressColor(props.level)}`} style={{ width: `${clamp(percent, 0, 120)}%` }} />
      </div>
    </div>
  )
}

function DeviceCard(props: { title: string; status: string; level: Level }) {
  return (
    <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-4">
      <div className="text-sm text-slate-300">{props.title}</div>
      <div className="mt-2 flex items-center justify-between">
        <div className="text-xl font-bold text-slate-100">{props.status}</div>
        <div className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${levelColor(props.status === '故障' ? 'red' : props.level)}`}>
          {props.status === '故障' ? '异常' : '正常'}
        </div>
      </div>
    </div>
  )
}

function rateTone(rate: number) {
  if (rate >= 95) return 'good'
  if (rate >= 80) return 'warn'
  return 'bad'
}

function progressColor(level: Level) {
  if (level === 'green') return 'bg-emerald-500'
  if (level === 'yellow') return 'bg-amber-500'
  return 'bg-rose-500'
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function safetyTextColor(status: string) {
  if (status === '正常') return 'text-emerald-300'
  if (status === '待确认') return 'text-amber-300'
  return 'text-rose-300'
}

function safetyIconColor(status: string) {
  if (status === '正常') return 'text-emerald-300'
  if (status === '待确认') return 'text-amber-300'
  return 'text-rose-300'
}
