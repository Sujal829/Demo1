import SignalList from '../../components/Signals/SignalList';
import Heatmap from '../../components/Dashboard/Heatmap';
import { Activity, TrendingUp, ShieldAlert, Wallet } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Market Overview</h1>
        <p className="text-gray-400">AI-driven analysis and predictions in real-time.</p>
      </header>
      
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="System Accuracy" value="82.4%" icon={<Activity className="w-6 h-6 text-primary" />} trend="+2.1%" />
        <MetricCard title="Active Signals" value="14" icon={<TrendingUp className="w-6 h-6 text-success" />} />
        <MetricCard title="Market Risk" value="High" icon={<ShieldAlert className="w-6 h-6 text-warning" />} />
        <MetricCard title="Portfolio P&L" value="+$4,250" icon={<Wallet className="w-6 h-6 text-success" />} trend="+5.2%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <div className="lg:col-span-2">
          <Heatmap />
        </div>
        <div className="lg:col-span-1">
          <SignalList />
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, trend }: { title: string; value: string; icon: React.ReactNode; trend?: string }) {
  return (
    <div className="glass-panel p-6 flex items-center justify-between">
      <div>
        <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
        <h4 className="text-2xl font-bold">{value}</h4>
        {trend && <span className="text-xs text-success mt-1 block">{trend} this week</span>}
      </div>
      <div className="bg-gray-800 p-3 rounded-full">
        {icon}
      </div>
    </div>
  );
}
