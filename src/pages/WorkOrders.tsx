import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ClipboardList, Plus, Rocket, RefreshCw } from 'lucide-react'

type WorkOrderStatus = 'draft' | 'pending' | 'active' | 'completed'

interface MaterialLite {
  id: string
  code: string
  name: string
  unit: string
}

interface WorkOrderItem {
  id: string
  orderNo: string
  productId: string
  planQty: number
  status: WorkOrderStatus
  createdAt: string
  product: MaterialLite | null
  processPlans?: Array<{ processName: string; planQty: number; actualQty: number; status: string }>
}

interface MaterialItem {
  id: string
  code: string
  name: string
  unit: string
  safeStockQty: number
  currentQty: number
}

export default function WorkOrders() {
  const [status, setStatus] = useState<WorkOrderStatus | 'all'>('all')
  const [items, setItems] = useState<WorkOrderItem[]>([])
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [releasingId, setReleasingId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formProductId, setFormProductId] = useState<string>('')
  const [formPlanQty, setFormPlanQty] = useState<string>('100')

  const filtered = useMemo(() => {
    if (status === 'all') return items
    return items.filter((i) => i.status === status)
  }, [items, status])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [workOrdersRes, materialsRes] = await Promise.all([
        fetch(`/api/v1/work-orders${status === 'all' ? '' : `?status=${status}`}`),
        fetch('/api/v1/materials'),
      ])
      const workOrdersJson = await workOrdersRes.json()
      const materialsJson = await materialsRes.json()
      if (workOrdersJson.code === 200) setItems(workOrdersJson.data)
      if (materialsJson.code === 200) setMaterials(materialsJson.data)
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (!formProductId && materials.length > 0) setFormProductId(materials[0].id)
  }, [materials, formProductId])

  const createOrderNo = () => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const rnd = Math.floor(1000 + Math.random() * 9000)
    return `WO-${y}${m}${day}-${rnd}`
  }

  const onCreate = async () => {
    if (!formProductId) return
    const planQtyNum = Number(formPlanQty)
    if (!Number.isFinite(planQtyNum) || planQtyNum <= 0) return

    setCreating(true)
    try {
      const res = await fetch('/api/v1/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNo: createOrderNo(),
          productId: formProductId,
          planQty: planQtyNum,
        }),
      })
      const json = await res.json()
      if (json.code === 200) {
        setItems((prev) => [json.data, ...prev])
        setFormOpen(false)
      }
    } finally {
      setCreating(false)
    }
  }

  const onRelease = async (id: string) => {
    setReleasingId(id)
    try {
      const res = await fetch(`/api/v1/work-orders/${id}/release`, { method: 'POST' })
      const json = await res.json()
      if (json.code === 200) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: json.data.status } : i)))
      }
    } finally {
      setReleasingId(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-wide flex items-center">
            <ClipboardList className="mr-3 text-cyan-400" />
            工单管理
          </h1>
          <p className="text-slate-400 text-sm mt-1">新建生产计划，按流程下发至派工中枢</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setFormOpen(true)}
            className="px-4 py-2 bg-cyan-600/20 border border-cyan-500/50 text-cyan-300 rounded-lg text-sm hover:bg-cyan-600/30 transition-colors shadow-[0_0_15px_rgba(6,182,212,0.15)] flex items-center"
          >
            <Plus size={16} className="mr-2" />
            新建工单
          </button>
          <button
            onClick={fetchAll}
            className="p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors shadow-sm"
            title="刷新"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap flex-shrink-0">
        {(
          [
            { key: 'all', label: '全部' },
            { key: 'draft', label: '草稿' },
            { key: 'pending', label: '待派工' },
            { key: 'active', label: '生产中' },
            { key: 'completed', label: '已完工' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              status === t.key
                ? 'bg-cyan-950/40 text-cyan-300 border-cyan-500/30'
                : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:bg-slate-900/70 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm">
        <div className="px-5 py-4 border-b border-slate-800/50 bg-slate-900/70 flex justify-between items-center">
          <div className="text-sm text-slate-400">共 {filtered.length} 条工单</div>
          <div className="text-xs text-slate-500 font-mono">下发后自动进入派工推荐</div>
        </div>

        <div className="p-5 overflow-auto custom-scrollbar h-full">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-slate-800 rounded-xl bg-slate-950/30">
              <div className="text-slate-400 text-sm">暂无工单</div>
              <button
                onClick={() => setFormOpen(true)}
                className="mt-4 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm hover:bg-slate-800 transition-colors"
              >
                立即创建
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {filtered.map((i) => (
                <motion.div
                  key={i.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4 hover:border-slate-700 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-400 px-2 py-1 rounded border border-slate-800 bg-slate-900/60">
                        {i.orderNo}
                      </span>
                      <span className={statusBadgeClass(i.status)}>{statusLabel(i.status)}</span>
                    </div>

                    <div className="mt-3 flex flex-col gap-1">
                      <div className="text-slate-200 font-medium truncate">
                        {i.product?.name || '未知产品'}{' '}
                        <span className="text-slate-500 text-xs font-mono ml-2">{i.product?.code}</span>
                      </div>
                      <div className="text-sm text-slate-500">
                        计划数量：<span className="text-slate-200 font-mono">{i.planQty}</span>{' '}
                        <span className="text-slate-500">{i.product?.unit || '个'}</span>
                        <span className="ml-4 text-xs text-slate-600">
                          创建：{new Date(i.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {i.processPlans?.length ? (
                        <OrderProgress plans={i.processPlans} fallbackPlanQty={i.planQty} />
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 justify-end">
                    {i.status === 'draft' ? (
                      <button
                        onClick={() => onRelease(i.id)}
                        disabled={releasingId === i.id}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${
                          releasingId === i.id
                            ? 'bg-cyan-600/40 text-white cursor-wait'
                            : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                        }`}
                      >
                        <Rocket size={16} className="mr-2" />
                        下发
                      </button>
                    ) : i.status === 'pending' ? (
                      <a
                        href="/dispatch"
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30 transition-colors"
                      >
                        去派工
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm px-4">
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="text-slate-200 font-medium">新建生产工单</div>
              <button
                onClick={() => setFormOpen(false)}
                className="text-slate-500 hover:text-slate-200 transition-colors"
              >
                关闭
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <div className="text-sm text-slate-400 mb-2">产品物料</div>
                <select
                  value={formProductId}
                  onChange={(e) => setFormProductId(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code}) / 单位:{m.unit} / 结存:{m.currentQty}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-sm text-slate-400 mb-2">计划生产数量</div>
                <input
                  value={formPlanQty}
                  onChange={(e) => setFormPlanQty(e.target.value)}
                  inputMode="numeric"
                  className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/40">
              <button
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 rounded-lg text-sm bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={onCreate}
                disabled={creating}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  creating
                    ? 'bg-cyan-600/40 text-white cursor-wait'
                    : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                }`}
              >
                {creating ? '创建中...' : '创建草稿'}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </div>
  )
}

function statusLabel(s: WorkOrderStatus) {
  if (s === 'draft') return '草稿'
  if (s === 'pending') return '待派工'
  if (s === 'active') return '生产中'
  return '已完工'
}

function statusBadgeClass(s: WorkOrderStatus) {
  if (s === 'draft') return 'text-slate-300 bg-slate-800/60 border border-slate-700/60 text-xs px-2 py-1 rounded'
  if (s === 'pending') return 'text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 text-xs px-2 py-1 rounded'
  if (s === 'active') return 'text-emerald-300 bg-emerald-950/30 border border-emerald-500/30 text-xs px-2 py-1 rounded'
  return 'text-indigo-300 bg-indigo-950/30 border border-indigo-500/30 text-xs px-2 py-1 rounded'
}

function OrderProgress(props: {
  plans: Array<{ processName: string; planQty: number; actualQty: number; status: string }>
  fallbackPlanQty: number
}) {
  const finalPlan = props.plans.find((p) => p.processName === '成品装箱') || null
  const planQty = finalPlan?.planQty ?? props.fallbackPlanQty
  const actualQty = finalPlan?.actualQty ?? 0
  const rate = planQty > 0 ? (actualQty / planQty) * 100 : 0
  const next = props.plans.find((p) => p.status !== 'completed')?.processName || '—'

  const tone = rate >= 95 ? 'bg-emerald-500' : rate >= 80 ? 'bg-amber-500' : 'bg-rose-500'
  const percent = Math.max(0, Math.min(100, rate))

  return (
    <div className="mt-3 bg-slate-950/30 border border-slate-800 rounded-lg p-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>下一工序：{next}</span>
        <span className="font-mono text-slate-300">
          {actualQty}/{planQty}（{rate.toFixed(1)}%）
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-900/60 overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
