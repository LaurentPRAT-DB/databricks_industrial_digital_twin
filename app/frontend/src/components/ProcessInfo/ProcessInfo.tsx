import { useMemo } from 'react';
import type { Resource, LocationMeta, StateDescription, Metrics } from '../../types/entity';

interface Props {
  resources: Resource[];
  locations: LocationMeta[];
  stateDescriptions: Record<string, StateDescription>;
  metrics: Metrics;
}

function fmtDuration(p: { mean?: number; std?: number; value?: number }) {
  if (p.mean != null) return `${p.mean}s`;
  if (p.value != null) return `${p.value}s`;
  return '—';
}

export default function ProcessInfo({ resources, locations, stateDescriptions, metrics }: Props) {
  const machines = useMemo(
    () => locations.filter(l => l.type === 'machine'),
    [locations],
  );

  const processSteps = useMemo(() => {
    return Object.entries(stateDescriptions)
      .filter(([, v]) => v.type === 'stationary')
      .map(([name, info]) => ({
        name: name.replace(/_/g, ' '),
        description: info.description,
        duration: info.duration ? fmtDuration(info.duration) : null,
      }));
  }, [stateDescriptions]);

  const stationStats = useMemo(() => {
    return machines.map(loc => {
      const res = resources.find(r => r.id === loc.id);
      return {
        label: loc.label,
        busy: res?.status === 'busy',
        cycleTime: loc.properties?.cycle_time_mean,
      };
    });
  }, [machines, resources]);

  const bottleneck = useMemo(() => {
    let max = 0, name = '';
    for (const s of stationStats) {
      if (s.cycleTime && s.cycleTime > max) { max = s.cycleTime; name = s.label; }
    }
    return name;
  }, [stationStats]);

  if (locations.length === 0) return null;

  return (
    <div className="bg-slate-800 border-t border-slate-700 shrink-0">
      {/* Row 1: Process Flow */}
      <div className="flex items-center h-9 px-4 border-b border-slate-700/50">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-16 shrink-0">Flow</span>
        <div className="flex items-center gap-1 overflow-x-auto min-w-0 flex-1 py-1">
          {processSteps.map((step, i) => (
            <div key={step.name} className="flex items-center gap-1 shrink-0">
              {i > 0 && <span className="text-slate-600 text-[10px]">→</span>}
              <span
                className="text-[10px] text-slate-300 bg-slate-700/60 border border-slate-600/50 rounded px-1.5 py-0.5 capitalize whitespace-nowrap"
                title={step.description}
              >
                {step.name}
                {step.duration && <span className="text-slate-500 ml-1">{step.duration}</span>}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3 pl-3 border-l border-slate-700/50">
          <div className="text-center leading-tight">
            <div className="text-[11px] font-bold text-white font-mono">{metrics.throughput_per_hour}</div>
            <div className="text-[8px] text-slate-500 uppercase">/hr</div>
          </div>
          <div className="text-center leading-tight">
            <div className="text-[11px] font-bold text-white font-mono">{metrics.avg_utilization_pct}%</div>
            <div className="text-[8px] text-slate-500 uppercase">util</div>
          </div>
          <div className="text-center leading-tight">
            <div className="text-[11px] font-bold text-white font-mono">{metrics.wip_count}</div>
            <div className="text-[8px] text-slate-500 uppercase">wip</div>
          </div>
          {bottleneck && (
            <div className="text-center leading-tight">
              <div className="text-[10px] font-bold text-amber-400 font-mono">{bottleneck}</div>
              <div className="text-[8px] text-slate-500 uppercase">btnk</div>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Station Status */}
      <div className="flex items-center h-7 px-4 border-b border-slate-700/50">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-16 shrink-0">Stations</span>
        <div className="flex items-center gap-3 overflow-x-auto min-w-0 flex-1">
          {stationStats.map(s => (
            <div key={s.label} className="flex items-center gap-1 shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${s.busy ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-[10px] text-slate-400">{s.label}</span>
              {s.cycleTime && <span className="text-[9px] text-slate-600">{s.cycleTime}s</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
