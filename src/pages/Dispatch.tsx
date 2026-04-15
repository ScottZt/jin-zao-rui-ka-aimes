import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, AlertCircle, CheckCircle2, ChevronRight, Zap } from 'lucide-react';

interface Recommendation {
  orderId: string;
  orderNo: string;
  productId: string;
  product?: {
    id: string;
    code: string;
    name: string;
    unit: string;
  } | null;
  planQty: number;
  requiredProcess: string;
  unitPrice: number;
  recommendedUser: {
    id: string;
    name: string;
    skillLevel: number;
  } | null;
  matchReason: string;
}

export default function Dispatch() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const fetchRecommendations = async () => {
    try {
      const res = await fetch('/api/v1/dispatch/recommendations');
      const json = await res.json();
      if (json.code === 200) {
        setRecommendations(json.data);
      }
    } catch (error) {
      console.error('Failed to fetch recommendations', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (rec: Recommendation) => {
    if (!rec.recommendedUser) return;
    setAssigning(rec.orderId);

    try {
      const res = await fetch('/api/v1/dispatch/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: rec.orderId,
          userId: rec.recommendedUser.id,
          processName: rec.requiredProcess,
          unitPrice: rec.unitPrice
        })
      });
      
      const json = await res.json();
      if (json.code === 200) {
        // Remove from list after successful assignment
        setRecommendations(prev => prev.filter(r => r.orderId !== rec.orderId));
      }
    } catch (error) {
      console.error('Assignment failed', error);
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-wide">智能派工中枢</h1>
          <p className="text-slate-400 text-sm mt-1">基于员工 Skill 画像自动推荐最佳人选，提高生产效能</p>
        </div>
        <button 
          onClick={fetchRecommendations}
          className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm hover:bg-slate-800 transition-colors shadow-sm flex items-center"
        >
          <Zap size={16} className="mr-2 text-cyan-400" />
          重新运行模型
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
        </div>
      ) : recommendations.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-slate-900/30 border border-slate-800 rounded-xl border-dashed">
          <CheckCircle2 size={48} className="text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300">当前无待派工的工单</h3>
          <p className="text-slate-500 text-sm mt-2">所有生产计划已分配完毕</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {recommendations.map((rec) => (
            <motion.div 
              key={rec.orderId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 backdrop-blur-sm relative overflow-hidden flex flex-col md:flex-row gap-6 md:items-center justify-between group hover:border-slate-700 transition-colors"
            >
              {/* Left: Order Info */}
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-3">
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 text-xs font-mono rounded-md border border-slate-700">
                    {rec.orderNo}
                  </span>
                  <span className="text-sm text-slate-500">
                    计划生产量: <strong className="text-slate-200">{rec.planQty}</strong> {rec.product?.unit || '个'}
                  </span>
                </div>
                <div className="text-slate-200 font-medium">
                  {rec.product?.name || '未知产品'}
                  {rec.product?.code ? (
                    <span className="ml-2 text-xs text-slate-500 font-mono">{rec.product.code}</span>
                  ) : null}
                </div>
                <h3 className="text-lg font-medium text-slate-200 flex items-center">
                  待分派工序: 
                  <span className="ml-2 text-cyan-400 font-bold px-3 py-1 bg-cyan-950/30 rounded-lg border border-cyan-900/50">
                    {rec.requiredProcess}
                  </span>
                </h3>
              </div>

              {/* Middle: AI Recommendation */}
              <div className="flex-1 bg-indigo-950/20 border border-indigo-500/20 rounded-lg p-4 relative">
                <div className="absolute -top-3 -left-3">
                  <div className="bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)] flex items-center">
                    <Zap size={10} className="mr-1" />
                    AI 推荐
                  </div>
                </div>
                
                {rec.recommendedUser ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                          <Users size={20} className="text-indigo-400" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-200 text-lg">{rec.recommendedUser.name}</p>
                          <p className="text-xs text-indigo-400">Skill Level: Lv.{rec.recommendedUser.skillLevel}</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-slate-400 mt-3 leading-relaxed">
                      {rec.matchReason}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center text-rose-400 py-4">
                    <AlertCircle size={18} className="mr-2" />
                    <span className="text-sm">当前无符合此工序技能要求的空闲员工</span>
                  </div>
                )}
              </div>

              {/* Right: Action */}
              <div className="w-full md:w-auto flex md:flex-col justify-end items-end gap-3">
                <div className="text-right hidden md:block mb-2">
                  <p className="text-xs text-slate-500">预设单价</p>
                  <p className="text-lg font-mono text-emerald-400">¥{rec.unitPrice.toFixed(2)}</p>
                </div>
                <button
                  disabled={!rec.recommendedUser || assigning === rec.orderId}
                  onClick={() => handleAssign(rec)}
                  className={`w-full md:w-auto px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center ${
                    !rec.recommendedUser
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : assigning === rec.orderId
                      ? 'bg-cyan-600/50 text-white cursor-wait'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:shadow-[0_0_20px_rgba(6,182,212,0.5)]'
                  }`}
                >
                  {assigning === rec.orderId ? (
                    '派发中...'
                  ) : (
                    <>
                      一键派发任务
                      <ChevronRight size={16} className="ml-1" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
