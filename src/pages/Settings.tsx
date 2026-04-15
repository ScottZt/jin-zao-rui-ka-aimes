import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Settings2, Save, RefreshCw, PlugZap, Wallet, Factory, Coins } from 'lucide-react'

type SettingItem = { key: string; value: any; updatedAt: string }

type GeneralSetting = { companyName: string; plantName: string }
type LlmPricingSetting = { costPer1k: number }
type SkillMultipliersSetting = Record<string, number>
type McpGatewaySetting = {
  enabled: boolean
  systems: { name: string; endpoint: string; authStrategy: string }[]
  retry: { maxAttempts: number; backoffMs: number }
}
type ProcessDef = { processCode: string; processName: string; unit: string; minLevel: number; isFinalCount: boolean }
type PieceRateRow = { processCode: string; level: number; unitPrice: number; effectiveFrom: string }
type RewardPolicy = { rewardCode: string; rewardName: string; conditionJson: string; amountJson: string; maxAmountPerShift: number; enabled: boolean }
type PenaltyPolicy = { penaltyCode: string; penaltyName: string; conditionJson: string; amountJson: string; maxPenaltyPerShift: number; enabled: boolean }

const safeNumber = (v: any, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export default function Settings() {
  const [items, setItems] = useState<SettingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const map = useMemo(() => new Map(items.map((i) => [i.key, i])), [items])

  const [general, setGeneral] = useState<GeneralSetting>({ companyName: '', plantName: '' })
  const [llmPricing, setLlmPricing] = useState<LlmPricingSetting>({ costPer1k: 0.002 })
  const [skillMultipliers, setSkillMultipliers] = useState<SkillMultipliersSetting>({
    0: 0,
    1: 1.0,
    2: 1.2,
    3: 1.5,
    4: 2.0,
  })
  const [mcpGateway, setMcpGateway] = useState<McpGatewaySetting>({
    enabled: true,
    systems: [],
    retry: { maxAttempts: 5, backoffMs: 1000 },
  })
  const [processes, setProcesses] = useState<ProcessDef[]>([])
  const [pieceRates, setPieceRates] = useState<Record<string, Record<number, number>>>({})
  const [rewardZeroDefect, setRewardZeroDefect] = useState({ enabled: true, minGoodQty: 200, amount: 30, cap: 30 })
  const [rewardFault, setRewardFault] = useState({ enabled: true, amount: 10, cap: 30 })
  const [penaltyLossOver, setPenaltyLossOver] = useState({ enabled: true, threshold: 0.03, minGoodQty: 100, cap: 50 })

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/settings')
      const json = await res.json()
      if (json.code === 200) {
        setItems(json.data)
        const g = json.data.find((x: SettingItem) => x.key === 'general')?.value
        const lp = json.data.find((x: SettingItem) => x.key === 'llmPricing')?.value
        const sm = json.data.find((x: SettingItem) => x.key === 'skillMultipliers')?.value
        const mg = json.data.find((x: SettingItem) => x.key === 'mcpGateway')?.value

        if (g) setGeneral({ companyName: g.companyName || '', plantName: g.plantName || '' })
        if (lp) setLlmPricing({ costPer1k: safeNumber(lp.costPer1k, 0.002) })
        if (sm) setSkillMultipliers(sm)
        if (mg) {
          setMcpGateway({
            enabled: Boolean(mg.enabled),
            systems: Array.isArray(mg.systems) ? mg.systems : [],
            retry: {
              maxAttempts: safeNumber(mg.retry?.maxAttempts, 5),
              backoffMs: safeNumber(mg.retry?.backoffMs, 1000),
            },
          })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchWageRules = async () => {
    try {
      const [pRes, rRes, rpRes, ppRes] = await Promise.all([
        fetch('/api/v1/wage-rules/processes'),
        fetch('/api/v1/wage-rules/piece-rates'),
        fetch('/api/v1/wage-rules/reward-policies'),
        fetch('/api/v1/wage-rules/penalty-policies'),
      ])
      const pJson = await pRes.json()
      const rJson = await rRes.json()
      const rpJson = await rpRes.json()
      const ppJson = await ppRes.json()
      if (pJson.code === 200) setProcesses(pJson.data)
      if (rJson.code === 200) {
        const latest = new Map<string, Map<number, { unitPrice: number; effectiveFrom: string }>>()
        for (const row of rJson.data as PieceRateRow[]) {
          const byLevel = latest.get(row.processCode) || new Map()
          const existing = byLevel.get(row.level)
          if (!existing || new Date(row.effectiveFrom).getTime() > new Date(existing.effectiveFrom).getTime()) {
            byLevel.set(row.level, { unitPrice: row.unitPrice, effectiveFrom: row.effectiveFrom })
          }
          latest.set(row.processCode, byLevel)
        }

        const m: Record<string, Record<number, number>> = {}
        for (const [code, byLevel] of latest.entries()) {
          m[code] = {}
          for (const [lv, v] of byLevel.entries()) m[code][lv] = v.unitPrice
        }
        setPieceRates(m)
      }

      if (rpJson.code === 200) {
        const rows = rpJson.data as RewardPolicy[]
        const z = rows.find((x) => x.rewardCode === 'R_ZERO_DEFECT')
        if (z) {
          const c = safeParseJson(z.conditionJson) || {}
          const a = safeParseJson(z.amountJson) || {}
          setRewardZeroDefect({
            enabled: Boolean(z.enabled),
            minGoodQty: safeNumber(c.minGoodQty, 200),
            amount: safeNumber(a.amount, 30),
            cap: safeNumber(z.maxAmountPerShift, 30),
          })
        }

        const f = rows.find((x) => x.rewardCode === 'R_FAULT_REPORT_VERIFIED')
        if (f) {
          const a = safeParseJson(f.amountJson) || {}
          setRewardFault({
            enabled: Boolean(f.enabled),
            amount: safeNumber(a.amount, 10),
            cap: safeNumber(f.maxAmountPerShift, 30),
          })
        }
      }

      if (ppJson.code === 200) {
        const rows = ppJson.data as PenaltyPolicy[]
        const p = rows.find((x) => x.penaltyCode === 'P_LOSS_OVER')
        if (p) {
          const c = safeParseJson(p.conditionJson) || {}
          setPenaltyLossOver({
            enabled: Boolean(p.enabled),
            threshold: safeNumber(c.threshold, 0.03),
            minGoodQty: safeNumber(c.minGoodQty, 100),
            cap: safeNumber(p.maxPenaltyPerShift, 50),
          })
        }
      }
    } catch {
    }
  }

  useEffect(() => {
    fetchSettings()
    fetchWageRules()
  }, [])

  const save = async (key: string, value: any) => {
    setSavingKey(key)
    try {
      const res = await fetch(`/api/v1/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      const json = await res.json()
      if (json.code === 200) {
        await fetchSettings()
      }
    } finally {
      setSavingKey(null)
    }
  }

  const savePieceRate = async (processCode: string, level: number, unitPrice: number) => {
    setSavingKey(`pieceRate:${processCode}:${level}`)
    try {
      const res = await fetch('/api/v1/wage-rules/piece-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processCode, level, unitPrice }),
      })
      const json = await res.json()
      if (json.code === 200) await fetchWageRules()
    } finally {
      setSavingKey(null)
    }
  }

  const saveRewardZeroDefect = async () => {
    setSavingKey('reward:R_ZERO_DEFECT')
    try {
      const res = await fetch('/api/v1/wage-rules/reward-policies/R_ZERO_DEFECT', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: rewardZeroDefect.enabled,
          condition: { minGoodQty: rewardZeroDefect.minGoodQty },
          amount: { type: 'fixed', amount: rewardZeroDefect.amount },
          maxAmountPerShift: rewardZeroDefect.cap,
        }),
      })
      const json = await res.json()
      if (json.code === 200) await fetchWageRules()
    } finally {
      setSavingKey(null)
    }
  }

  const saveRewardFault = async () => {
    setSavingKey('reward:R_FAULT_REPORT_VERIFIED')
    try {
      const res = await fetch('/api/v1/wage-rules/reward-policies/R_FAULT_REPORT_VERIFIED', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: rewardFault.enabled,
          condition: { perEvent: true },
          amount: { type: 'fixed', amount: rewardFault.amount },
          maxAmountPerShift: rewardFault.cap,
        }),
      })
      const json = await res.json()
      if (json.code === 200) await fetchWageRules()
    } finally {
      setSavingKey(null)
    }
  }

  const savePenaltyLossOver = async () => {
    setSavingKey('penalty:P_LOSS_OVER')
    try {
      const res = await fetch('/api/v1/wage-rules/penalty-policies/P_LOSS_OVER', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: penaltyLossOver.enabled,
          condition: { threshold: penaltyLossOver.threshold, minGoodQty: penaltyLossOver.minGoodQty },
          amount: { type: 'formula', formula: '(rate-threshold)*goodQty*0.2', cap: penaltyLossOver.cap },
          maxPenaltyPerShift: penaltyLossOver.cap,
        }),
      })
      const json = await res.json()
      if (json.code === 200) await fetchWageRules()
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-wide flex items-center">
            <Settings2 className="mr-3 text-slate-300" />
            系统设置
          </h1>
          <p className="text-slate-400 text-sm mt-1">MCP 集成配置、计费参数、计件倍率等关键系统参数</p>
        </div>

        <button
          onClick={fetchSettings}
          className="p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors shadow-sm"
          title="刷新"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="xl:col-span-2 space-y-6 overflow-auto custom-scrollbar pr-2">
          <Section
            title="基础信息"
            icon={<Factory size={16} className="text-cyan-400" />}
            subtitle={`最后更新：${map.get('general')?.updatedAt ? new Date(map.get('general')!.updatedAt).toLocaleString() : '—'}`}
            actions={
              <SaveButton
                loading={savingKey === 'general'}
                onClick={() => save('general', general)}
                label="保存"
              />
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="企业名称">
                <input
                  value={general.companyName}
                  onChange={(e) => setGeneral((p) => ({ ...p, companyName: e.target.value }))}
                  className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                />
              </Field>
              <Field label="车间/工厂">
                <input
                  value={general.plantName}
                  onChange={(e) => setGeneral((p) => ({ ...p, plantName: e.target.value }))}
                  className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                />
              </Field>
            </div>
          </Section>

          <Section
            title="大模型计费"
            icon={<Wallet size={16} className="text-rose-400" />}
            subtitle={`最后更新：${map.get('llmPricing')?.updatedAt ? new Date(map.get('llmPricing')!.updatedAt).toLocaleString() : '—'}`}
            actions={
              <SaveButton
                loading={savingKey === 'llmPricing'}
                onClick={() => save('llmPricing', llmPricing)}
                label="保存"
              />
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="单价（元 / 1K Tokens）">
                <input
                  inputMode="decimal"
                  value={String(llmPricing.costPer1k)}
                  onChange={(e) =>
                    setLlmPricing({ costPer1k: safeNumber(e.target.value, llmPricing.costPer1k) })
                  }
                  className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/30"
                />
              </Field>
            </div>
          </Section>

          <Section
            title="计件倍率（按 Skill 等级）"
            icon={<Wallet size={16} className="text-emerald-400" />}
            subtitle={`最后更新：${map.get('skillMultipliers')?.updatedAt ? new Date(map.get('skillMultipliers')!.updatedAt).toLocaleString() : '—'}`}
            actions={
              <SaveButton
                loading={savingKey === 'skillMultipliers'}
                onClick={() => save('skillMultipliers', skillMultipliers)}
                label="保存"
              />
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {['0', '1', '2', '3', '4'].map((k) => (
                <Field key={k} label={`Lv${k}`}>
                  <input
                    inputMode="decimal"
                    value={String(skillMultipliers[k] ?? 0)}
                    onChange={(e) =>
                      setSkillMultipliers((p) => ({ ...p, [k]: safeNumber(e.target.value, p[k] ?? 0) }))
                    }
                    className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                  />
                </Field>
              ))}
            </div>
          </Section>

          <Section
            title="MCP 集成网关"
            icon={<PlugZap size={16} className="text-indigo-400" />}
            subtitle={`最后更新：${map.get('mcpGateway')?.updatedAt ? new Date(map.get('mcpGateway')!.updatedAt).toLocaleString() : '—'}`}
            actions={
              <SaveButton
                loading={savingKey === 'mcpGateway'}
                onClick={() => save('mcpGateway', mcpGateway)}
                label="保存"
              />
            }
          >
            <div className="flex items-center justify-between bg-slate-950/30 border border-slate-800 rounded-lg p-4">
              <div>
                <div className="text-sm text-slate-200 font-medium">启用网关</div>
                <div className="text-xs text-slate-500 mt-1">统一入口、协议转换、重试、日志与映射</div>
              </div>
              <button
                onClick={() => setMcpGateway((p) => ({ ...p, enabled: !p.enabled }))}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  mcpGateway.enabled
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400'
                }`}
              >
                {mcpGateway.enabled ? '已启用' : '已关闭'}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Field label="最大重试次数">
                <input
                  inputMode="numeric"
                  value={String(mcpGateway.retry.maxAttempts)}
                  onChange={(e) =>
                    setMcpGateway((p) => ({
                      ...p,
                      retry: { ...p.retry, maxAttempts: Math.max(0, Math.floor(safeNumber(e.target.value, p.retry.maxAttempts))) },
                    }))
                  }
                  className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
                />
              </Field>
              <Field label="退避间隔（ms）">
                <input
                  inputMode="numeric"
                  value={String(mcpGateway.retry.backoffMs)}
                  onChange={(e) =>
                    setMcpGateway((p) => ({
                      ...p,
                      retry: { ...p.retry, backoffMs: Math.max(0, Math.floor(safeNumber(e.target.value, p.retry.backoffMs))) },
                    }))
                  }
                  className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
                />
              </Field>
            </div>

            <div className="mt-5">
              <div className="text-xs text-slate-500 mb-2">已接入系统</div>
              <div className="space-y-3">
                {mcpGateway.systems.map((s, idx) => (
                  <div
                    key={`${s.name}-${idx}`}
                    className="bg-slate-950/30 border border-slate-800 rounded-lg p-4"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input
                        value={s.name}
                        onChange={(e) =>
                          setMcpGateway((p) => ({
                            ...p,
                            systems: p.systems.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                          }))
                        }
                        className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
                        placeholder="系统名称"
                      />
                      <input
                        value={s.endpoint}
                        onChange={(e) =>
                          setMcpGateway((p) => ({
                            ...p,
                            systems: p.systems.map((x, i) => (i === idx ? { ...x, endpoint: e.target.value } : x)),
                          }))
                        }
                        className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
                        placeholder="Endpoint"
                      />
                      <input
                        value={s.authStrategy}
                        onChange={(e) =>
                          setMcpGateway((p) => ({
                            ...p,
                            systems: p.systems.map((x, i) => (i === idx ? { ...x, authStrategy: e.target.value } : x)),
                          }))
                        }
                        className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
                        placeholder="鉴权策略"
                      />
                    </div>
                  </div>
                ))}

                <button
                  onClick={() =>
                    setMcpGateway((p) => ({
                      ...p,
                      systems: [...p.systems, { name: '新系统', endpoint: '', authStrategy: 'token' }],
                    }))
                  }
                  className="w-full px-4 py-2 rounded-lg text-sm bg-slate-900/40 border border-slate-800 text-slate-300 hover:bg-slate-900/70 transition-colors"
                >
                  添加系统
                </button>
              </div>
            </div>
          </Section>

          <Section
            title="计件单价（按等级浮动）"
            icon={<Coins size={16} className="text-emerald-400" />}
            subtitle="同一工序不同等级不同单价，保存后立即生效"
            actions={<div className="text-xs text-slate-500">Lv1~Lv5</div>}
          >
            <div className="overflow-auto custom-scrollbar">
              <div className="min-w-[820px] grid grid-cols-7 gap-2 text-xs text-slate-500 mb-2">
                <div>工序</div>
                <div className="text-center">Lv1</div>
                <div className="text-center">Lv2</div>
                <div className="text-center">Lv3</div>
                <div className="text-center">Lv4</div>
                <div className="text-center">Lv5</div>
                <div className="text-center">单位</div>
              </div>

              <div className="space-y-2">
                {processes.map((p) => (
                  <div key={p.processCode} className="grid grid-cols-7 gap-2 items-center bg-slate-950/30 border border-slate-800 rounded-lg p-3">
                    <div className="text-sm text-slate-200 font-medium">{p.processName}</div>
                    {[1, 2, 3, 4, 5].map((lv) => (
                      <div key={lv} className="flex flex-col items-center gap-2">
                        <input
                          inputMode="decimal"
                          value={String(pieceRates?.[p.processCode]?.[lv] ?? '')}
                          onChange={(e) =>
                            setPieceRates((prev) => ({
                              ...prev,
                              [p.processCode]: { ...(prev[p.processCode] || {}), [lv]: safeNumber(e.target.value, prev?.[p.processCode]?.[lv] ?? 0) },
                            }))
                          }
                          className="w-full text-center bg-slate-900/60 border border-slate-800 rounded-md px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                        />
                        <button
                          onClick={() => savePieceRate(p.processCode, lv, Number(pieceRates?.[p.processCode]?.[lv] ?? 0))}
                          disabled={savingKey === `pieceRate:${p.processCode}:${lv}`}
                          className={`w-full px-2 py-1 rounded-md border text-xs ${
                            savingKey === `pieceRate:${p.processCode}:${lv}`
                              ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-wait'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                          }`}
                        >
                          {savingKey === `pieceRate:${p.processCode}:${lv}` ? '保存中' : '保存'}
                        </button>
                      </div>
                    ))}
                    <div className="text-center text-sm text-slate-400">{p.unit}</div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section
            title="奖励 / 扣罚（班次）"
            icon={<Coins size={16} className="text-amber-400" />}
            subtitle="只扣异常，不苛责；金额与阈值可配置"
            actions={<div className="text-xs text-slate-500">规则即时生效</div>}
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-200 font-medium">全工序无次品奖励</div>
                  <button
                    onClick={() => setRewardZeroDefect((p) => ({ ...p, enabled: !p.enabled }))}
                    className={`px-3 py-1 rounded-lg text-xs border ${
                      rewardZeroDefect.enabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-900/40 text-slate-400'
                    }`}
                  >
                    {rewardZeroDefect.enabled ? '启用' : '关闭'}
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <Field label="最低合格数">
                    <input
                      inputMode="numeric"
                      value={String(rewardZeroDefect.minGoodQty)}
                      onChange={(e) => setRewardZeroDefect((p) => ({ ...p, minGoodQty: Math.floor(safeNumber(e.target.value, p.minGoodQty)) }))}
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                    />
                  </Field>
                  <Field label="奖励金额(元)">
                    <input
                      inputMode="decimal"
                      value={String(rewardZeroDefect.amount)}
                      onChange={(e) => setRewardZeroDefect((p) => ({ ...p, amount: safeNumber(e.target.value, p.amount) }))}
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                    />
                  </Field>
                  <Field label="封顶(元)">
                    <input
                      inputMode="decimal"
                      value={String(rewardZeroDefect.cap)}
                      onChange={(e) => setRewardZeroDefect((p) => ({ ...p, cap: safeNumber(e.target.value, p.cap) }))}
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                    />
                  </Field>
                </div>
                <div className="mt-4">
                  <SaveButton loading={savingKey === 'reward:R_ZERO_DEFECT'} onClick={saveRewardZeroDefect} label="保存规则" />
                </div>
              </div>

              <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-200 font-medium">设备异常核实奖励</div>
                  <button
                    onClick={() => setRewardFault((p) => ({ ...p, enabled: !p.enabled }))}
                    className={`px-3 py-1 rounded-lg text-xs border ${
                      rewardFault.enabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-900/40 text-slate-400'
                    }`}
                  >
                    {rewardFault.enabled ? '启用' : '关闭'}
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Field label="每次奖励(元)">
                    <input
                      inputMode="decimal"
                      value={String(rewardFault.amount)}
                      onChange={(e) => setRewardFault((p) => ({ ...p, amount: safeNumber(e.target.value, p.amount) }))}
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                    />
                  </Field>
                  <Field label="封顶(元)">
                    <input
                      inputMode="decimal"
                      value={String(rewardFault.cap)}
                      onChange={(e) => setRewardFault((p) => ({ ...p, cap: safeNumber(e.target.value, p.cap) }))}
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                    />
                  </Field>
                </div>
                <div className="mt-4">
                  <SaveButton loading={savingKey === 'reward:R_FAULT_REPORT_VERIFIED'} onClick={saveRewardFault} label="保存规则" />
                </div>
              </div>

              <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-200 font-medium">损耗率超标扣减</div>
                  <button
                    onClick={() => setPenaltyLossOver((p) => ({ ...p, enabled: !p.enabled }))}
                    className={`px-3 py-1 rounded-lg text-xs border ${
                      penaltyLossOver.enabled ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-slate-800 bg-slate-900/40 text-slate-400'
                    }`}
                  >
                    {penaltyLossOver.enabled ? '启用' : '关闭'}
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <Field label="阈值(0-1)">
                    <input
                      inputMode="decimal"
                      value={String(penaltyLossOver.threshold)}
                      onChange={(e) => setPenaltyLossOver((p) => ({ ...p, threshold: safeNumber(e.target.value, p.threshold) }))}
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/30"
                    />
                  </Field>
                  <Field label="最低合格数">
                    <input
                      inputMode="numeric"
                      value={String(penaltyLossOver.minGoodQty)}
                      onChange={(e) => setPenaltyLossOver((p) => ({ ...p, minGoodQty: Math.floor(safeNumber(e.target.value, p.minGoodQty)) }))}
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/30"
                    />
                  </Field>
                  <Field label="封顶(元)">
                    <input
                      inputMode="decimal"
                      value={String(penaltyLossOver.cap)}
                      onChange={(e) => setPenaltyLossOver((p) => ({ ...p, cap: safeNumber(e.target.value, p.cap) }))}
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/30"
                    />
                  </Field>
                </div>
                <div className="mt-4">
                  <SaveButton loading={savingKey === 'penalty:P_LOSS_OVER'} onClick={savePenaltyLossOver} label="保存规则" />
                </div>
              </div>
            </div>
          </Section>
        </div>

        <div className="xl:col-span-1 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm h-fit">
          <div className="px-5 py-4 border-b border-slate-800/50 bg-slate-900/70">
            <div className="text-sm text-slate-300">运行概览</div>
          </div>
          <div className="p-5 space-y-4">
            <SummaryCard
              title="企业"
              value={general.companyName || '—'}
              hint={general.plantName ? `车间：${general.plantName}` : '—'}
            />
            <SummaryCard
              title="LLM 单价"
              value={`${llmPricing.costPer1k.toFixed(4)} 元 / 1K`}
              hint="用于 Token 费用预估"
            />
            <SummaryCard
              title="网关状态"
              value={mcpGateway.enabled ? '启用' : '关闭'}
              hint={`${mcpGateway.systems.length} 个系统`}
            />
            <div className="text-xs text-slate-600">
              配置将写入数据库并实时生效。请避免在此页面录入任何密钥或敏感信息。
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section(props: {
  title: string
  subtitle: string
  icon: React.ReactNode
  actions: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm">
      <div className="px-5 py-4 border-b border-slate-800/50 bg-slate-900/70 flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-lg bg-slate-950/50 border border-slate-800 flex items-center justify-center mr-3">
            {props.icon}
          </div>
          <div>
            <div className="text-sm text-slate-200 font-medium">{props.title}</div>
            <div className="text-xs text-slate-500 mt-0.5">{props.subtitle}</div>
          </div>
        </div>
        {props.actions}
      </div>
      <div className="p-5">{props.children}</div>
    </div>
  )
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-2">{props.label}</div>
      {props.children}
    </div>
  )
}

function SaveButton(props: { loading: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.loading}
      className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors ${
        props.loading
          ? 'bg-slate-800 text-slate-400 cursor-wait'
          : 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30'
      }`}
    >
      <Save size={16} className="mr-2" />
      {props.loading ? '保存中...' : props.label}
    </button>
  )
}

function SummaryCard(props: { title: string; value: string; hint: string }) {
  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className="bg-slate-950/30 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors"
    >
      <div className="text-xs text-slate-500">{props.title}</div>
      <div className="mt-1 text-lg font-mono font-bold text-slate-100">{props.value}</div>
      <div className="mt-1 text-xs text-slate-600">{props.hint}</div>
    </motion.div>
  )
}

function safeParseJson(v: any) {
  if (typeof v !== 'string') return null
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}
