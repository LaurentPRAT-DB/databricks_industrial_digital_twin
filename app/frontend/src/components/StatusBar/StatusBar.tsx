import { useEffect, useState } from 'react';

interface HealthStatus {
  build_number: string;
  lakebase: { connected: boolean; latency_ms?: number; host?: string };
}

export default function StatusBar() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    const fetchHealth = () => {
      fetch('/health')
        .then(r => r.json())
        .then(setHealth)
        .catch(() => setHealth(null));
    };
    fetchHealth();
    const id = setInterval(fetchHealth, 30000);
    return () => clearInterval(id);
  }, []);

  if (!health) return null;

  const lb = health.lakebase;

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-800/80 border-t border-slate-700/50 text-[10px] text-slate-500">
      <span className="font-mono">Build #{health.build_number}</span>
      <span className="text-slate-700">|</span>
      <span className="flex items-center gap-1.5">
        <span className={`inline-block w-2 h-2 rounded-full ${lb.connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
        <span className={lb.connected ? 'text-emerald-400' : 'text-red-400'}>
          Lakebase {lb.connected ? `(${lb.latency_ms}ms)` : 'offline'}
        </span>
      </span>
    </div>
  );
}
