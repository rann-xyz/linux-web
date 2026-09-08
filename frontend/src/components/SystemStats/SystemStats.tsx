'use client';

interface SystemInfo {
  os: string;
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  storageUsed: number;
  storageTotal: number;
  uptime: number;
}

interface SystemStatsProps {
  systemInfo: SystemInfo | null;
}

export function SystemStats({ systemInfo }: SystemStatsProps) {
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const memoryPercent = systemInfo
    ? Math.round((systemInfo.memoryUsed / systemInfo.memoryTotal) * 100)
    : 0;
  const storagePercent = systemInfo
    ? Math.round((systemInfo.storageUsed / systemInfo.storageTotal) * 100)
    : 0;

  return (
    <footer className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-t border-[#30363d] text-xs text-[#8b949e]">
      <div className="flex items-center gap-4 flex-wrap">
        {/* CPU */}
        <div className="flex items-center gap-1.5">
          <span>CPU</span>
          <div className="w-24 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                (systemInfo?.cpuUsage || 0) > 80
                  ? 'bg-[#f85149]'
                  : (systemInfo?.cpuUsage || 0) > 50
                  ? 'bg-[#d29922]'
                  : 'bg-[#3fb950]'
              }`}
              style={{ width: `${systemInfo?.cpuUsage || 0}%` }}
            />
          </div>
          <span>{systemInfo?.cpuUsage?.toFixed(1) || 0}%</span>
        </div>

        {/* RAM */}
        <div className="flex items-center gap-1.5">
          <span>RAM</span>
          <div className="w-24 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                memoryPercent > 80
                  ? 'bg-[#f85149]'
                  : memoryPercent > 50
                  ? 'bg-[#d29922]'
                  : 'bg-[#58a6ff]'
              }`}
              style={{ width: `${memoryPercent}%` }}
            />
          </div>
          <span>
            {systemInfo
              ? `${systemInfo.memoryUsed.toFixed(1)}GB / ${systemInfo.memoryTotal}GB`
              : '0GB / 0GB'}
          </span>
        </div>

        {/* Storage */}
        <div className="flex items-center gap-1.5">
          <span>STORAGE</span>
          <div className="w-24 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                storagePercent > 80
                  ? 'bg-[#f85149]'
                  : storagePercent > 50
                  ? 'bg-[#d29922]'
                  : 'bg-[#bc8cff]'
              }`}
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          <span>
            {systemInfo
              ? `${systemInfo.storageUsed.toFixed(1)}GB / ${systemInfo.storageTotal}GB`
              : '0GB / 0GB'}
          </span>
        </div>
      </div>

      {/* Uptime */}
      {systemInfo && (
        <div className="flex items-center gap-1.5">
          <span>⏱️</span>
          <span>{formatUptime(systemInfo.uptime)}</span>
        </div>
      )}
    </footer>
  );
}