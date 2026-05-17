import { useMemo } from 'react';
import type { Resource, LocationMeta, StateDescription } from '../../types/entity';

interface Props {
  resources: Resource[];
  locations: LocationMeta[];
  stateDescriptions: Record<string, StateDescription>;
  onSelectMachine?: (id: string) => void;
}

function fmtDuration(p: { mean?: number; std?: number; value?: number }) {
  if (p.mean != null) return `${p.mean}s`;
  if (p.value != null) return `${p.value}s`;
  return null;
}

export default function ProcessInfo({ resources, locations, stateDescriptions, onSelectMachine }: Props) {
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
        failure_count: res?.failure_count,
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
    <div className="bg-slate-800 border-t border-slate-700 shrink-0">
      <div className="flex items-center gap-1 px-4 py-2 flex-wrap min-w-0">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-600 text-xs">→</span>}
            <button
              onClick={() => onSelectMachine?.(step.id)}
              className={`flex flex-col px-2 py-1 rounded border text-[10px] font-medium transition-colors cursor-pointer hover:brightness-125 ${
                (step.failure_count ?? 0) > 0
                  ? 'bg-red-900/40 border-red-500/60 text-red-200'
                  : step.maintenance
                    ? 'bg-red-900/40 border-red-600/60 text-red-200'
                    : step.id === bottleneck
                      ? 'bg-amber-900/40 border-amber-600/60 text-amber-200'
                      : step.busy
                        ? 'bg-blue-900/40 border-blue-500/60 text-blue-100'
                        : 'bg-slate-700/60 border-slate-600/50 text-slate-200'
              }`}
              title={`${step.description} — click for details`}
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
                <div className="text-[9px] text-slate-400 font-mono mt-0.5 text-left">
                  {step.cycle_count} cycles
                </div>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
