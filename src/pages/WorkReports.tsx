import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ClipboardList, Plus, RefreshCw, Trash2, Pencil } from 'lucide-react'

type WorkReportItem = {
  id: string
  userId: string
  processCode?: string | null
  processName: string
  productId: string
  goodQty: number
  badQty: number
  lossQty: number
  shiftName: string
  equipment?: string | null
  skillLevel: number
  reportedAt: string
  user?: { id: string; name: string }
  product?: { id: string; name: string; code: string; unit: string }
  report?: { id: string; reporter?: { id: string; name: string } | null; workOrder?: { id: string; orderNo: string } | null }
}

type UserLite = { id: string; name: string }
type ProcessLite = { processCode: string; processName: string }
type MaterialLite = { id: string; name: string; code: string; unit: string }

const toNum = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function WorkReports() {
  const [items, setItems] = useState<WorkReportItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)

  const [users, setUsers] = useState<UserLite[]>([])
  const [processes, setProcesses] = useState<ProcessLite[]>([])
  const [materials, setMaterials] = useState<MaterialLite[]>([])

  const [filterUserId, setFilterUserId] = useState<string>('')
  const [filterProcessName, setFilterProcessName] = useState<string>('')
  const [filterProductId, setFilterProductId] = useState<string>('')
  const [filterShiftName, setFilterShiftName] = useState<string>('')

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formReporterId, setFormReporterId] = useState<string>('')
  const [formUserId, setFormUserId] = useState<string>('')
  const [formProcessCode, setFormProcessCode] = useState<string>('')
  const [formProcessName, setFormProcessName] = useState<string>('')
  const [formProductId, setFormProductId] = useState<string>('')
  const [formGoodQty, setFormGoodQty] = useState<string>('0')
  const [formBadQty, setFormBadQty] = useState<string>('0')
  const [formLossQty, setFormLossQty] = useState<string>('0')
  const [formShiftName, setFormShiftName] = useState<string>('早班')
  const [formEquipment, setFormEquipment] = useState<string>('')
  const [formSkillLevel, setFormSkillLevel] = useState<string>('1')

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  const fetchBase = useCallback(async () => {
    const [uRes, pRes, mRes] = await Promise.all([
      fetch('/api/v1/skills/users'),
      fetch('/api/v1/processes'),
      fetch('/api/v1/materials'),
    ])
    const [uJson, pJson, mJson] = await Promise.all([uRes.json(), pRes.json(), mRes.json()])
    if (uJson.code === 200) setUsers(uJson.data.map((x: any) => ({ id: x.id, name: x.name })))
    if (pJson.code === 200) setProcesses(pJson.data.map((x: any) => ({ processCode: x.processCode, processName: x.processName })))
    if (mJson.code === 200) setMaterials(mJson.data.map((x: any) => ({ id: x.id, name: x.name, code: x.code, unit: x.unit })))
  }, [])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set('page', String(page))
      qs.set('pageSize', String(pageSize))
      if (filterUserId) qs.set('userId', filterUserId)
      if (filterProcessName) qs.set('processName', filterProcessName)
      if (filterProductId) qs.set('productId', filterProductId)
      if (filterShiftName) qs.set('shiftName', filterShiftName)

      const res = await fetch(`/api/v1/work-report-items?${qs.toString()}`)
      const json = await res.json()
      if (json.code === 200) {
        setItems(json.data.list)
        setTotal(json.data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [filterProcessName, filterProductId, filterShiftName, filterUserId, page, pageSize])

  useEffect(() => {
    fetchBase()
  }, [fetchBase])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  useEffect(() => {
    if (!formReporterId && users.length) setFormReporterId(users[0].id)
    if (!formUserId && users.length) setFormUserId(users[0].id)
    if (!formProductId && materials.length) setFormProductId(materials[0].id)
  }, [users, materials, formReporterId, formUserId, formProductId])

  const onNew = () => {
    setEditingId(null)
    setFormGoodQty('0')
    setFormBadQty('0')
    setFormLossQty('0')
    setFormShiftName('早班')
    setFormEquipment('')
    setFormSkillLevel('1')
    setFormProcessCode('')
    setFormProcessName('')
    setFormOpen(true)
  }

  const onEdit = (it: WorkReportItem) => {
    setEditingId(it.id)
    setFormReporterId(it.report?.reporter?.id || formReporterId)
    setFormUserId(it.userId)
    setFormProcessCode(it.processCode || '')
    setFormProcessName(it.processName)
    setFormProductId(it.productId)
    setFormGoodQty(String(it.goodQty))
    setFormBadQty(String(it.badQty))
    setFormLossQty(String(it.lossQty))
    setFormShiftName(it.shiftName)
    setFormEquipment(it.equipment || '')
    setFormSkillLevel(String(it.skillLevel))
    setFormOpen(true)
  }

  const submit = async () => {
    if (!formReporterId || !formUserId || !formProcessName || !formProductId || !formShiftName) return

    const payload = {
      reporterId: formReporterId,
      userId: formUserId,
      processCode: formProcessCode || undefined,
      processName: formProcessName,
      productId: formProductId,
      goodQty: toNum(formGoodQty),
      badQty: toNum(formBadQty),
      lossQty: toNum(formLossQty),
      shiftName: formShiftName,
      equipment: formEquipment || undefined,
      skillLevel: toNum(formSkillLevel),
    }

    if (!editingId) {
      const res = await fetch('/api/v1/work-report-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.code === 200) {
        setFormOpen(false)
        fetchList()
      }
      return
    }

    const res = await fetch(`/api/v1/work-report-items/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: payload.userId,
        processCode: payload.processCode ?? null,
        processName: payload.processName,
        productId: payload.productId,
        goodQty: payload.goodQty,
        badQty: payload.badQty,
        lossQty: payload.lossQty,
        shiftName: payload.shiftName,
        equipment: payload.equipment ?? null,
        skillLevel: payload.skillLevel,
      }),
    })
    const json = await res.json()
    if (json.code === 200) {
      setFormOpen(false)
      fetchList()
    }
  }

  const onDelete = async (id: string) => {
    const res = await fetch(`/api/v1/work-report-items/${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.code === 200) fetchList()
  }

  const onProcessPick = (code: string) => {
    setFormProcessCode(code)
    const p = processes.find((x) => x.processCode === code)
    if (p) setFormProcessName(p.processName)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-wide flex items-center">
            <ClipboardList className="mr-3 text-cyan-400" />
            报工明细
          </h1>
          <p className="text-slate-400 text-sm mt-1">支持查询、分页、增删改查与统计接口</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onNew}
            className="px-4 py-2 bg-cyan-600/20 border border-cyan-500/50 text-cyan-300 rounded-lg text-sm hover:bg-cyan-600/30 transition-colors shadow-[0_0_15px_rgba(6,182,212,0.15)] flex items-center"
          >
            <Plus size={16} className="mr-2" />
            新增报工
          </button>
          <button
            onClick={fetchList}
            className="p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors shadow-sm"
            title="刷新"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-end flex-shrink-0">
        <div>
          <div className="text-xs text-slate-500 mb-1">员工</div>
          <select
            value={filterUserId}
            onChange={(e) => {
              setPage(1)
              setFilterUserId(e.target.value)
            }}
            className="bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            <option value="">全部</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">工序</div>
          <input
            value={filterProcessName}
            onChange={(e) => {
              setPage(1)
              setFilterProcessName(e.target.value)
            }}
            placeholder="模糊匹配"
            className="bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
          />
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">产品</div>
          <select
            value={filterProductId}
            onChange={(e) => {
              setPage(1)
              setFilterProductId(e.target.value)
            }}
            className="bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            <option value="">全部</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">班次</div>
          <select
            value={filterShiftName}
            onChange={(e) => {
              setPage(1)
              setFilterShiftName(e.target.value)
            }}
            className="bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            <option value="">全部</option>
            <option value="早班">早班</option>
            <option value="晚班">晚班</option>
            <option value="夜班">夜班</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="text-xs text-slate-500">
            共 <span className="text-slate-200 font-mono">{total}</span> 条
          </div>
          <select
            value={pageSize}
            onChange={(e) => {
              setPage(1)
              setPageSize(Number(e.target.value))
            }}
            className="bg-slate-950/40 border border-slate-800 rounded-lg px-2 py-2 text-sm text-slate-200"
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}/页
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm">
        <div className="p-4 overflow-auto custom-scrollbar h-full">
          {loading && !items.length ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-slate-800 rounded-xl bg-slate-950/30">
              <div className="text-slate-400 text-sm">暂无报工记录</div>
              <button onClick={onNew} className="mt-4 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm hover:bg-slate-800 transition-colors">
                立即新增
              </button>
            </div>
          ) : (
            <div className="min-w-[1000px]">
              <div className="grid grid-cols-12 gap-2 text-xs text-slate-500 border-b border-slate-800 pb-2">
                <div className="col-span-2">时间</div>
                <div className="col-span-1">员工</div>
                <div className="col-span-2">工序</div>
                <div className="col-span-2">产品</div>
                <div className="col-span-1 text-right">合格</div>
                <div className="col-span-1 text-right">次品</div>
                <div className="col-span-1 text-right">损耗</div>
                <div className="col-span-1">班次</div>
                <div className="col-span-1">操作</div>
              </div>
              <div className="divide-y divide-slate-800">
                {items.map((it) => (
                  <motion.div key={it.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-12 gap-2 py-3 text-sm text-slate-200">
                    <div className="col-span-2 font-mono text-xs text-slate-400">{new Date(it.reportedAt).toLocaleString()}</div>
                    <div className="col-span-1">{it.user?.name || '—'}</div>
                    <div className="col-span-2">{it.processName}</div>
                    <div className="col-span-2">
                      <div className="truncate">{it.product?.name || '—'}</div>
                      <div className="text-[10px] text-slate-600 font-mono">{it.product?.code || ''}</div>
                    </div>
                    <div className="col-span-1 text-right font-mono">{it.goodQty}</div>
                    <div className="col-span-1 text-right font-mono text-amber-300">{it.badQty}</div>
                    <div className="col-span-1 text-right font-mono text-rose-300">{it.lossQty}</div>
                    <div className="col-span-1">{it.shiftName}</div>
                    <div className="col-span-1 flex justify-end gap-2">
                      <button onClick={() => onEdit(it)} className="p-2 rounded-lg border border-slate-800 bg-slate-950/30 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/30 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => onDelete(it.id)} className="p-2 rounded-lg border border-slate-800 bg-slate-950/30 text-slate-300 hover:text-rose-300 hover:border-rose-500/30 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between flex-shrink-0">
        <div className="text-xs text-slate-500">
          第 <span className="font-mono text-slate-200">{page}</span> / <span className="font-mono text-slate-200">{totalPages}</span> 页
        </div>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={`px-3 py-2 rounded-lg border text-sm ${page <= 1 ? 'border-slate-800 text-slate-600 bg-slate-950/30 cursor-not-allowed' : 'border-slate-800 text-slate-300 bg-slate-950/30 hover:text-slate-100 hover:border-slate-700'}`}
          >
            上一页
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className={`px-3 py-2 rounded-lg border text-sm ${page >= totalPages ? 'border-slate-800 text-slate-600 bg-slate-950/30 cursor-not-allowed' : 'border-slate-800 text-slate-300 bg-slate-950/30 hover:text-slate-100 hover:border-slate-700'}`}
          >
            下一页
          </button>
        </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="text-slate-100 font-medium">{editingId ? '编辑报工' : '新增报工'}</div>
              <button onClick={() => setFormOpen(false)} className="text-slate-500 hover:text-slate-200">
                关闭
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">操作人（报工提交人）</div>
                <select value={formReporterId} onChange={(e) => setFormReporterId(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200">
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">员工</div>
                <select value={formUserId} onChange={(e) => setFormUserId(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200">
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">工序（标准）</div>
                <select value={formProcessCode} onChange={(e) => onProcessPick(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200">
                  <option value="">自定义</option>
                  {processes.map((p) => (
                    <option key={p.processCode} value={p.processCode}>
                      {p.processName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">工序名称</div>
                <input value={formProcessName} onChange={(e) => setFormProcessName(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200" />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">产品</div>
                <select value={formProductId} onChange={(e) => setFormProductId(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200">
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">班次</div>
                <select value={formShiftName} onChange={(e) => setFormShiftName(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200">
                  <option value="早班">早班</option>
                  <option value="晚班">晚班</option>
                  <option value="夜班">夜班</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">合格数</div>
                <input value={formGoodQty} onChange={(e) => setFormGoodQty(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono" />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">次品数</div>
                <input value={formBadQty} onChange={(e) => setFormBadQty(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono" />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">损耗数</div>
                <input value={formLossQty} onChange={(e) => setFormLossQty(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono" />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">设备</div>
                <input value={formEquipment} onChange={(e) => setFormEquipment(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200" />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Skill 等级</div>
                <input value={formSkillLevel} onChange={(e) => setFormSkillLevel(e.target.value)} className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
              <button onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg border border-slate-800 bg-slate-950/30 text-slate-300 hover:text-slate-100 hover:border-slate-700 transition-colors">
                取消
              </button>
              <button onClick={submit} className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors">
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

