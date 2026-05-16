import { useMemo } from 'react';
import type { Resource, LocationMeta, StateDescription, Metrics } from '../../types/entity';

interface Props {
  resources: Resource[];
  locations: LocationMeta[];
  stateDescriptions: Record<string, StateDescription>;
  metrics: Metrics;
}

function fmtDuration(p: { mean?: number; std?: number; value?: number }) {
  if (p.mean != null) return p.std ? `~${p.mean}s` : `${p.mean}s`;
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
        mtbf: loc.properties?.mtbf_hours,
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
    <div className="bg-slate-800/80 border-t border-slate-700 px-5 py-2.5 shrink-0">
      <div className="flex items-center gap-5">

        {/* Process Flow — inline chain */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">Flow</span>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {processSteps.map((step, i) => (
              <div key={step.name} className="flex items-center gap-1.5 shrink-0">
                {i > 0 && <span className="text-slate-600 text-xs">→</span>}
                <div className="bg-slate-700/70 border border-slate-600/60 rounded px-2 py-1" title={step.description}>
                  <span className="text-[11px] font-medium text-slate-200 capitalize">{step.name}</span>
                  {step.duration && (
                    <span className="text-[10px] text-slate-400 ml-1">{step.duration}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-slate-700 shrink-0" />

        {/* Station status — compact row */}
        <div className="flex items-center gap-3 shrink-0">
          {stationStats.map(s => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${s.busy ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-[11px] text-slate-300">{s.label}</span>
              {s.cycleTime && (
                <span className="text-[10px] text-slate-500">{s.cycleTime}s</span>
              )}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-slate-700 shrink-0" />

        {/* Key metrics — inline */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-center">
            <div className="text-sm font-bold text-white font-mono leading-none">{metrics.throughput_per_hour}</div>
            <div className="text-[9px] text-slate-500 uppercase">units/hr</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-white font-mono leading-none">{metrics.avg_utilization_pct}%</div>
            <div className="text-[9px] text-slate-500 uppercase">util</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-white font-mono leading-none">{metrics.wip_count}</div>
            <div className="text-[9px] text-slate-500 uppercase">WIP</div>
          </div>
          {bottleneck && (
            <div className="text-center">
              <div className="text-[11px] font-bold text-amber-400 font-mono leading-none">{bottleneck}</div>
              <div className="text-[9px] text-slate-500 uppercase">bottleneck</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
