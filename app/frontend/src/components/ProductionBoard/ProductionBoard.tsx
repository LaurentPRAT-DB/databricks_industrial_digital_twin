import type { Metrics } from '../../types/entity';

interface Props {
  metrics: Metrics;
}

export default function ProductionBoard({ metrics }: Props) {
  const cards = [
    { label: 'Throughput', value: `${metrics.throughput_per_hour}/hr`, color: 'text-emerald-400' },
    { label: 'WIP', value: `${metrics.wip_count}`, color: 'text-blue-400' },
    { label: 'Completed', value: `${metrics.completed}`, color: 'text-amber-400' },
    { label: 'Utilization', value: `${metrics.avg_utilization_pct}%`, color: 'text-purple-400' },
    { label: 'Queue Depth', value: `${metrics.total_queue_depth}`, color: 'text-rose-400' },
    { label: 'Elapsed', value: `${metrics.elapsed_hours}h`, color: 'text-slate-400' },
  ];

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
        Production KPIs
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-slate-700/50 rounded p-2 text-center">
            <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-slate-400">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
