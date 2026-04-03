import { CampaignStats } from '@/types/campaign';

interface StatsBarProps {
  stats: CampaignStats;
}

interface ProgressBarProps {
  label: string;
  value: number; // 0.0 to 1.0
  color: string;
}

function ProgressBar({ label, value, color }: ProgressBarProps) {
  const pct = Math.round(value * 100);
  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full ${color} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
        Delivery Stats
      </h3>

      <ProgressBar label="Send Rate" value={stats.send_rate} color="bg-blue-500" />
      <ProgressBar label="Open Rate" value={stats.open_rate} color="bg-green-500" />

      <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{stats.sent}</p>
          <p className="text-xs text-gray-500 mt-0.5">Sent</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-500">{stats.failed}</p>
          <p className="text-xs text-gray-500 mt-0.5">Failed</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.opened}</p>
          <p className="text-xs text-gray-500 mt-0.5">Opened</p>
        </div>
      </div>
    </div>
  );
}
