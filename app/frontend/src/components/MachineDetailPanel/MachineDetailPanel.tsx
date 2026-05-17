import type { Resource, LocationMeta } from '../../types/entity';

interface Props {
  machineId: string;
  resources: Resource[];
  locations: LocationMeta[];
  onClose: () => void;
}

function fmtDowntime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function MachineDetailPanel({ machineId, resources, locations, onClose }: Props) {
  const resource = resources.find(r => r.id === machineId);
  const location = locations.find(l => l.id === machineId);

  if (!resource || !location) return null;

  const label = location.label || machineId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const statusColor =
    resource.status === 'busy' ? 'bg-blue-600 text-white' :
    resource.status === 'maintenance' ? 'bg-red-600 text-white' :
    'bg-green-600/60 text-green-200';

  const busyPct = resource.busy_pct ?? 0;
  const idlePct = resource.idle_pct ?? 0;
  const downPct = resource.down_pct ?? 0;
  const hasTelemetry = resource.cycle_count !== undefined;

  return (
    <div className="w-80 border-l border-slate-700 bg-slate-900 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div>
          <h2 className="text-sm font-bold text-white">{label}</h2>
          <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded ${statusColor}`}>
            {resource.status.toUpperCase()}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white text-sm px-1"
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Current occupant */}
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Processing</div>
          <div className="text-sm text-slate-200 font-mono">
            {resource.occupants.length > 0 ? resource.occupants[0] : '—'}
          </div>
        </div>

        {/* Queue */}
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Queue Depth</div>
          <div className="text-sm text-slate-200 font-mono">{resource.queue_depth}</div>
        </div>

        {hasTelemetry && (
          <>
            {/* Cycle count */}
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Cycle Count</div>
              <div className="text-2xl font-bold text-white font-mono">{resource.cycle_count}</div>
            </div>

            {/* Utilization bar */}
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Utilization</div>
              <div className="h-3 rounded-full bg-slate-700 overflow-hidden flex">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${busyPct}%` }} />
                <div className="h-full bg-red-500 transition-all" style={{ width: `${downPct}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="text-center">
                  <div className="text-sm font-bold text-blue-400 font-mono">{busyPct}%</div>
                  <div className="text-[9px] text-slate-500">Busy</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-slate-400 font-mono">{idlePct}%</div>
                  <div className="text-[9px] text-slate-500">Idle</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-red-400 font-mono">{downPct}%</div>
                  <div className="text-[9px] text-slate-500">Down</div>
                </div>
              </div>
            </div>

            {/* Failures */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Failures</div>
                <div className={`text-lg font-bold font-mono ${(resource.failure_count ?? 0) > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                  {resource.failure_count ?? 0}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Total Downtime</div>
                <div className="text-lg font-bold text-slate-300 font-mono">
                  {fmtDowntime(resource.total_downtime_s ?? 0)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
