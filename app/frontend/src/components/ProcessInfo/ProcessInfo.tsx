import { useMemo, useState } from 'react';
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
  return null;
}

export default function ProcessInfo({ resources, locations, stateDescriptions, metrics }: Props) {
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
        cycleTime: loc.properties?.cycle_time_mean,
        duration: stateInfo?.duration,
        description: stateInfo?.description || loc.label,
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
                className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-medium transition-colors ${
                  step.id === bottleneck
                    ? 'bg-amber-900/40 border-amber-600/60 text-amber-200'
                    : step.busy
                      ? 'bg-blue-900/40 border-blue-500/60 text-blue-100'
                      : 'bg-slate-700/60 border-slate-600/50 text-slate-200'
                }`}
                title={step.description}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  step.busy ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'
                }`} />
                <span className="capitalize whitespace-nowrap">{step.label}</span>
                {(step.duration || step.cycleTime) && (
                  <span className="text-[9px] text-slate-400 font-mono">
                    {step.duration || `${step.cycleTime}s`}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-3 shrink-0 pl-3 border-l border-slate-700/50">
          <div className="text-center leading-tight">
            <div className="text-xs font-bold text-white font-mono">{metrics.throughput_per_hour}</div>
            <div className="text-[8px] text-slate-500 uppercase">/hr</div>
          </div>
          <div className="text-center leading-tight">
            <div className="text-xs font-bold text-white font-mono">{metrics.avg_utilization_pct}%</div>
            <div className="text-[8px] text-slate-500 uppercase">util</div>
          </div>
          <div className="text-center leading-tight">
            <div className="text-xs font-bold text-white font-mono">{metrics.wip_count}</div>
            <div className="text-[8px] text-slate-500 uppercase">wip</div>
          </div>
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
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {steps.map((step, i) => (
              <div key={step.id} className="flex items-start gap-2 p-2 rounded bg-slate-800/60 border border-slate-700/50">
                <span className="text-[10px] text-slate-500 font-mono mt-0.5">{i + 1}.</span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-200 capitalize">{step.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{step.description}</div>
                  {(step.duration || step.cycleTime) && (
                    <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                      Cycle: {step.duration || `${step.cycleTime}s`}
                      {step.id === bottleneck && <span className="text-amber-400 ml-2">← bottleneck</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
