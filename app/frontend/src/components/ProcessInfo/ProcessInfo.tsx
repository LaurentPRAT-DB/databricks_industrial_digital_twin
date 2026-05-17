import { useMemo, useState } from 'react';
import type { Resource, LocationMeta, StateDescription } from '../../types/entity';

interface Props {
  resources: Resource[];
  locations: LocationMeta[];
  stateDescriptions: Record<string, StateDescription>;
}

function fmtDuration(p: { mean?: number; std?: number; value?: number }) {
  if (p.mean != null) return `${p.mean}s`;
  if (p.value != null) return `${p.value}s`;
  return null;
}

export default function ProcessInfo({ resources, locations, stateDescriptions }: Props) {
  const [infoOpen, setInfoOpen] = useState(false);

  const machines = useMemo(
    () => locations.filter(l => l.type === 'machine'),
    [locations],
  );

  const steps = useMemo(() => {
    const stationaryStates = Object.entries(stateDescriptions)
      .filter(([, v]) => v.type === 'stationary')
      .map(([name, info]) => ({
        stateName: name,
        label: name.replace(/_/g, ' '),
        description: info.description,
        duration: info.duration ? fmtDuration(info.duration) : null,
      }));

    return machines.map((loc, i) => {
      const res = resources.find(r => r.id === loc.id);
      const stateInfo = stationaryStates[i];
      return {
        id: loc.id,
        label: loc.label,
        busy: res?.status === 'busy',
        maintenance: res?.status === 'maintenance',
        cycleTime: loc.properties?.cycle_time_mean,
        duration: stateInfo?.duration,
        description: stateInfo?.description || loc.label,
        cycle_count: res?.cycle_count,
        busy_pct: res?.busy_pct,
        idle_pct: res?.idle_pct,
        down_pct: res?.down_pct,
        failure_count: res?.failure_count,
        total_downtime_s: res?.total_downtime_s,
      };
    });
  }, [machines, resources, stateDescriptions]);

  const bottleneck = useMemo(() => {
    let max = 0, id = '';
    for (const s of steps) {
      const t = s.cycleTime || 0;
      if (t > max) { max = t; id = s.id; }
    }
    return id;
  }, [steps]);

  if (locations.length === 0) return null;

  return (
    <div className="bg-slate-800 border-t border-slate-700 shrink-0 relative">
      <div className="flex items-start gap-3 px-4 py-2">
        {/* Flow info button */}
        <button
          onClick={() => setInfoOpen(!infoOpen)}
          className={`shrink-0 mt-1 w-5 h-5 flex items-center justify-center rounded-full border text-[9px] font-bold transition-colors ${
            infoOpen
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400'
          }`}
          title="Process flow details"
        >
          i
        </button>

        {/* Station flow chips — wraps to multiple lines */}
        <div className="flex items-center flex-wrap gap-1 min-w-0 flex-1">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-1">
              {i > 0 && <span className="text-slate-600 text-xs">→</span>}
              <div
                className={`flex flex-col px-2 py-1 rounded border text-[10px] font-medium transition-colors ${
                  step.maintenance
                    ? 'bg-red-900/40 border-red-600/60 text-red-200'
                    : step.id === bottleneck
                      ? 'bg-amber-900/40 border-amber-600/60 text-amber-200'
                      : step.busy
                        ? 'bg-blue-900/40 border-blue-500/60 text-blue-100'
                        : 'bg-slate-700/60 border-slate-600/50 text-slate-200'
                }`}
                title={step.description}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    step.maintenance ? 'bg-red-400 animate-pulse' :
                    step.busy ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'
                  }`} />
                  <span className="capitalize whitespace-nowrap">{step.label}</span>
                  {(step.duration || step.cycleTime) && (
                    <span className="text-[9px] text-slate-400 font-mono">
                      {step.duration || `${step.cycleTime}s`}
                    </span>
                  )}
                </div>
                {step.cycle_count !== undefined && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] text-slate-400 font-mono">{step.cycle_count} cyc</span>
                    {step.busy_pct !== undefined && (
                      <div className="flex items-center gap-0.5 flex-1">
                        <div className="flex-1 h-1 rounded-full bg-slate-600 overflow-hidden flex min-w-[30px]">
                          <div className="h-full bg-blue-500" style={{ width: `${step.busy_pct}%` }} />
                          <div className="h-full bg-red-500" style={{ width: `${step.down_pct || 0}%` }} />
                        </div>
                        <span className="text-[8px] text-slate-500 w-6 text-right">{step.busy_pct}%</span>
                      </div>
                    )}
                    {(step.failure_count ?? 0) > 0 && (
                      <span className="text-[8px] text-red-400">{step.failure_count}✕</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info panel (shown on click) */}
      {infoOpen && (
        <div className="absolute bottom-full left-0 right-0 bg-slate-900 border border-slate-700 rounded-t-lg shadow-xl p-4 z-10">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-bold text-white">Process Flow</h3>
            <button
              onClick={() => setInfoOpen(false)}
              className="text-slate-500 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
            {steps.map((step, i) => (
              <div key={step.id} className="p-2 rounded bg-slate-800/60 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-slate-500 font-mono">{i + 1}.</span>
                  <span className="text-[11px] font-semibold text-slate-200 capitalize">{step.label}</span>
                  {step.id === bottleneck && <span className="text-[9px] text-amber-400 font-bold">BOTTLENECK</span>}
                </div>
                <div className="text-[10px] text-slate-400 mb-1.5">{step.description}</div>
                {step.cycle_count !== undefined && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-2 rounded-full bg-slate-600 overflow-hidden flex">
                        <div className="h-full bg-blue-500" style={{ width: `${step.busy_pct || 0}%` }} />
                        <div className="h-full bg-red-500" style={{ width: `${step.down_pct || 0}%` }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-x-2 text-[9px] font-mono">
                      <div><span className="text-blue-400">Busy</span> <span className="text-slate-300">{step.busy_pct ?? 0}%</span></div>
                      <div><span className="text-slate-400">Idle</span> <span className="text-slate-300">{step.idle_pct ?? 0}%</span></div>
                      <div><span className="text-red-400">Down</span> <span className="text-slate-300">{step.down_pct ?? 0}%</span></div>
                    </div>
                    <div className="grid grid-cols-3 gap-x-2 text-[9px] font-mono">
                      <div><span className="text-slate-500">Cycles</span> <span className="text-slate-300">{step.cycle_count}</span></div>
                      <div><span className="text-slate-500">Failures</span> <span className={step.failure_count ? 'text-red-300' : 'text-slate-300'}>{step.failure_count ?? 0}</span></div>
                      <div><span className="text-slate-500">Downtime</span> <span className="text-slate-300">{step.total_downtime_s != null ? `${Math.round(step.total_downtime_s)}s` : '0s'}</span></div>
                    </div>
                  </div>
                )}
                {step.cycle_count === undefined && (step.duration || step.cycleTime) && (
                  <div className="text-[10px] text-slate-500 font-mono">
                    Cycle: {step.duration || `${step.cycleTime}s`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
