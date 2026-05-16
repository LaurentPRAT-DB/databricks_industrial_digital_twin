import type { LocationMeta } from '../../types/entity';

interface Props {
  whatifName: string;
  overrides: Record<string, Record<string, number>>;
  locations: LocationMeta[];
  onEdit: () => void;
}

const PARAM_LABELS: Record<string, { label: string; format: (v: number) => string }> = {
  cycle_time_factor: { label: 'Cycle Time', format: v => `${v.toFixed(1)}x` },
  cycle_time_variability: { label: 'Variability', format: v => `${v.toFixed(1)}x` },
  failure_probability: { label: 'Failure Rate', format: v => `${(v * 100).toFixed(1)}%` },
  failure_duration_mean: { label: 'Repair Time', format: v => `${v}s` },
  failure_duration_std: { label: 'Repair Std', format: v => `${v}s` },
  degradation_rate: { label: 'Degradation', format: v => `${v.toFixed(1)} s/hr` },
  quality_defect_rate: { label: 'Defect Rate', format: v => `${(v * 100).toFixed(1)}%` },
};

export default function WhatIfSummary({ whatifName, overrides, locations, onEdit }: Props) {
  const affectedLocations = Object.entries(overrides).filter(([, params]) => Object.keys(params).length > 0);

  return (
    <div className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wide">{whatifName}</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">Active what-if parameters</p>
        </div>
        <button
          onClick={onEdit}
          className="px-2 py-1 text-[10px] font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
        >
          Edit
        </button>
      </div>

      {/* Parameter list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {affectedLocations.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">No deviations applied</p>
        ) : (
          affectedLocations.map(([locId, params]) => {
            const loc = locations.find(l => l.id === locId);
            const label = loc?.label || locId.replace(/_/g, ' ');
            return (
              <div key={locId} className="bg-slate-750 border border-slate-600 rounded-lg p-3">
                <div className="text-xs font-bold text-white mb-2 capitalize">{label}</div>
                <div className="space-y-1">
                  {Object.entries(params).map(([key, value]) => {
                    const info = PARAM_LABELS[key];
                    if (!info) return null;
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-[10px] text-amber-400">{info.label}</span>
                        <span className="text-[10px] font-mono text-amber-300">{info.format(value)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
