import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PackageSearch, AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, RefreshCw } from 'lucide-react';

interface InventoryItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  safeStockQty: number;
  currentQty: number;
  status: 'normal' | 'warning' | 'critical';
  lastUpdated: string;
}

interface Transaction {
  id: string;
  materialName: string;
  materialCode: string;
  type: 'in' | 'out';
  qty: number;
  unit: string;
  sourceDocId: string | null;
  timestamp: string;
}

export default function Inventory() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Array<{ id: string; name: string; unit: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);

  const [inOpen, setInOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formOperatorId, setFormOperatorId] = useState('');
  const [formMaterialId, setFormMaterialId] = useState('');
  const [formQty, setFormQty] = useState('10');
  const [formRemark, setFormRemark] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invRes, transRes] = await Promise.all([
        fetch('/api/v1/inventory/status'),
        fetch('/api/v1/inventory/transactions')
      ]);
      
      const invJson = await invRes.json();
      const transJson = await transRes.json();
      
      if (invJson.code === 200) setInventory(invJson.data);
      if (transJson.code === 200) setTransactions(transJson.data);
    } catch (error) {
      console.error('Failed to fetch inventory data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // 模拟实时刷新，每10秒拉取一次最新台账
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    (async () => {
      const [mRes, uRes] = await Promise.all([fetch('/api/v1/materials'), fetch('/api/v1/skills/users')]);
      const [mJson, uJson] = await Promise.all([mRes.json(), uRes.json()]);
      if (mJson.code === 200) setMaterials(mJson.data.map((x: any) => ({ id: x.id, name: x.name, unit: x.unit })));
      if (uJson.code === 200) setUsers(uJson.data.map((x: any) => ({ id: x.id, name: x.name })));
    })();
  }, []);

  useEffect(() => {
    if (!formOperatorId && users.length) setFormOperatorId(users[0].id);
    if (!formMaterialId && materials.length) setFormMaterialId(materials[0].id);
  }, [users, materials, formOperatorId, formMaterialId]);

  const currentMaterial = useMemo(() => materials.find((m) => m.id === formMaterialId) || null, [materials, formMaterialId]);

  const submitStock = async (type: 'in' | 'out') => {
    if (!formMaterialId) return;
    const qty = Number(formQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    setSubmitting(true);
    try {
      const url = type === 'in' ? '/api/v1/inventory/stock-ins' : '/api/v1/inventory/stock-outs';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorId: formOperatorId || undefined,
          remark: formRemark || undefined,
          items: [{ materialId: formMaterialId, qty }],
        }),
      });
      const json = await res.json();
      if (json.code === 200) {
        setInOpen(false);
        setOutOpen(false);
        setFormRemark('');
        fetchData();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'text-rose-400 bg-rose-400/10 border-rose-500/30';
      case 'warning': return 'text-amber-400 bg-amber-400/10 border-amber-500/30';
      default: return 'text-emerald-400 bg-emerald-400/10 border-emerald-500/30';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'critical': return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse';
      case 'warning': return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse';
      default: return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]';
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-wide flex items-center">
            <PackageSearch className="mr-3 text-emerald-400" />
            实时库存监控
          </h1>
          <p className="text-slate-400 text-sm mt-1">单据驱动的库存流转台账，安全库存红线预警系统</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setInOpen(true)}
            className="px-4 py-2 bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 rounded-lg text-sm hover:bg-emerald-600/30 transition-colors shadow-sm flex items-center"
          >
            <ArrowDownRight size={16} className="mr-2" />
            标准入库
          </button>
          <button
            onClick={() => setOutOpen(true)}
            className="px-4 py-2 bg-rose-600/15 border border-rose-500/30 text-rose-300 rounded-lg text-sm hover:bg-rose-600/25 transition-colors shadow-sm flex items-center"
          >
            <ArrowUpRight size={16} className="mr-2" />
            标准出库
          </button>
          <button
            onClick={fetchData}
            className="p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors shadow-sm"
            title="手动刷新数据"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Left: Real-time Inventory Ledger (Takes 2/3 width) */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col overflow-hidden backdrop-blur-sm relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0" />
          <div className="p-5 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/80">
            <h3 className="font-medium text-slate-200 flex items-center">
              库存台账
              <span className="ml-3 px-2 py-0.5 text-xs rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                {inventory.length} 种物料
              </span>
            </h3>
          </div>
          
          <div className="flex-1 overflow-auto p-5 custom-scrollbar">
            {loading && inventory.length === 0 ? (
              <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400"></div>
              </div>
            ) : (
              <div className="grid gap-4">
                {inventory.map((item) => (
                  <motion.div 
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 flex items-center justify-between hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`w-3 h-3 rounded-full ${getStatusDot(item.status)}`} />
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-slate-200 font-medium">{item.name}</h4>
                          <span className="text-xs text-slate-500 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                            {item.code}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center">
                          <Clock size={12} className="mr-1" /> 
                          最后更新: {new Date(item.lastUpdated).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-8">
                      <div className="text-right">
                        <p className="text-xs text-slate-500 mb-1">安全库存</p>
                        <p className="text-sm font-mono text-slate-400">{item.safeStockQty} {item.unit}</p>
                      </div>
                      
                      <div className="text-right w-24">
                        <p className="text-xs text-slate-500 mb-1">当前结存</p>
                        <div className="flex items-baseline justify-end">
                          <span className={`text-2xl font-mono font-bold tracking-tight mr-1 ${item.status === 'normal' ? 'text-slate-100' : 'text-rose-400'}`}>
                            {item.currentQty}
                          </span>
                          <span className="text-sm text-slate-500">{item.unit}</span>
                        </div>
                      </div>

                      <div className={`px-3 py-1 rounded text-xs border flex items-center w-24 justify-center ${getStatusColor(item.status)}`}>
                        {item.status === 'normal' ? '库存正常' : item.status === 'warning' ? '低于安全线' : (
                          <><AlertTriangle size={12} className="mr-1" /> 严重缺料</>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Real-time Transactions (Takes 1/3 width) */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col overflow-hidden backdrop-blur-sm relative">
          <div className="p-5 border-b border-slate-800/50 bg-slate-900/80">
            <h3 className="font-medium text-slate-200 flex items-center">
              实时出入库流水
              <div className="ml-2 w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            </h3>
          </div>
          
          <div className="flex-1 overflow-auto p-4 custom-scrollbar">
            <div className="relative border-l border-slate-800 ml-3 space-y-6 pb-4">
              {transactions.length === 0 && !loading ? (
                <div className="pl-6 text-sm text-slate-500">暂无出入库流水记录</div>
              ) : (
                transactions.map((tx, idx) => (
                  <motion.div 
                    key={tx.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="relative pl-6"
                  >
                    <div className={`absolute -left-2.5 top-1 w-5 h-5 rounded-full border-4 border-slate-950 flex items-center justify-center ${
                      tx.type === 'in' ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}>
                      {tx.type === 'in' ? (
                        <ArrowDownRight size={10} className="text-slate-950" />
                      ) : (
                        <ArrowUpRight size={10} className="text-slate-950" />
                      )}
                    </div>
                    
                    <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-3 hover:bg-slate-900/60 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          tx.type === 'in' ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'
                        }`}>
                          {tx.type === 'in' ? '完工入库' : '生产领料'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(tx.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      
                      <div className="mt-2">
                        <p className="text-sm text-slate-200">{tx.materialName}</p>
                        <div className="flex justify-between items-end mt-1">
                          <p className="text-[10px] text-slate-500">源单: {tx.sourceDocId ? tx.sourceDocId.split('-')[0] + '...' : '手动操作'}</p>
                          <p className={`font-mono font-bold text-sm ${tx.type === 'in' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {tx.type === 'in' ? '+' : '-'}{tx.qty} <span className="text-xs font-normal text-slate-500">{tx.unit}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {(inOpen || outOpen) ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-xl bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="text-slate-100 font-medium">{inOpen ? '标准入库' : '标准出库'}</div>
              <button
                onClick={() => {
                  setInOpen(false);
                  setOutOpen(false);
                }}
                className="text-slate-500 hover:text-slate-200"
              >
                关闭
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">操作人</div>
                <select
                  value={formOperatorId}
                  onChange={(e) => setFormOperatorId(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">物料</div>
                <select
                  value={formMaterialId}
                  onChange={(e) => setFormMaterialId(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">数量 {currentMaterial ? `(${currentMaterial.unit})` : ''}</div>
                <input
                  value={formQty}
                  onChange={(e) => setFormQty(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">备注</div>
                <input
                  value={formRemark}
                  onChange={(e) => setFormRemark(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => {
                  setInOpen(false);
                  setOutOpen(false);
                }}
                className="px-4 py-2 rounded-lg border border-slate-800 bg-slate-950/30 text-slate-300 hover:text-slate-100 hover:border-slate-700 transition-colors"
              >
                取消
              </button>
              <button
                disabled={submitting}
                onClick={() => submitStock(inOpen ? 'in' : 'out')}
                className={`px-4 py-2 rounded-lg transition-colors ${inOpen ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'bg-rose-500 text-slate-950 hover:bg-rose-400'} ${submitting ? 'opacity-70 cursor-wait' : ''}`}
              >
                {submitting ? '提交中...' : '提交'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
