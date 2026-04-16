import { Link, useLocation, Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ClipboardList, 
  ListChecks,
  Users, 
  PackageSearch, 
  BrainCircuit, 
  CreditCard, 
  Settings,
  Bell,
  Search,
  User
} from 'lucide-react';
import { motion } from 'framer-motion';

const navigation = [
  { name: '智能看板', href: '/dashboard', icon: LayoutDashboard },
  { name: '工单管理', href: '/work-orders', icon: ClipboardList },
  { name: '智能派工', href: '/dispatch', icon: Users },
  { name: '报工明细', href: '/work-reports', icon: ListChecks },
  { name: '库存管理', href: '/inventory', icon: PackageSearch },
  { name: '人力资源', href: '/skill-center', icon: BrainCircuit },
  { name: '计费中心', href: '/billing', icon: CreditCard },
  { name: '系统设置', href: '/settings', icon: Settings },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-950/50 backdrop-blur-xl flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <div className="w-8 h-8 rounded bg-cyan-500/20 text-cyan-400 flex items-center justify-center mr-3 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <BrainCircuit size={20} />
          </div>
          <h1 className="text-lg font-bold tracking-wider text-slate-100">AIMES <span className="text-cyan-400 font-mono text-sm ml-1">v1.0</span></h1>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || (location.pathname === '/' && item.href === '/dashboard');
            const Icon = item.icon;
            
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`relative flex items-center px-3 py-2.5 text-sm rounded-lg transition-colors group ${
                  isActive 
                    ? 'text-cyan-400 bg-cyan-950/30' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                }`}
              >
                {isActive && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute inset-0 bg-cyan-950/40 rounded-lg border border-cyan-500/30"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon size={18} className="mr-3 relative z-10" />
                <span className="font-medium relative z-10">{item.name}</span>
                
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-cyan-400 rounded-r-full shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center px-3 py-2 bg-slate-900/50 rounded-lg border border-slate-800">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mr-3">
              <User size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">Admin User</p>
              <p className="text-xs text-slate-500 truncate">车间主管</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
        {/* Topbar */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-slate-800/50 backdrop-blur-sm z-10">
          <div className="flex items-center flex-1">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="text" 
                placeholder="搜索工单 / 物料 / 终端..." 
                className="w-full bg-slate-900/50 border border-slate-800 rounded-full pl-10 pr-4 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-slate-600"
              />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span className="text-xs font-mono text-emerald-400">MCP Gateway: Online</span>
            </div>
            <button className="relative p-2 text-slate-400 hover:text-slate-200 transition-colors">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 border-2 border-slate-950" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            <Outlet />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
