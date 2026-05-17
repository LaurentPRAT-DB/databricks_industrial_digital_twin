import type { Resource, LocationMeta } from '../../types/entity';

interface Props {
  resources: Resource[];
  locations: LocationMeta[];
}

export default function MachineStatus({ resources, locations }: Props) {
  const machines = resources.filter(r => r.type === 'machine');
  const labelMap = Object.fromEntries(locations.map(l => [l.id, l.label]));

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
        Machine Status
      </h2>
      <div className="space-y-2">
        {machines.map(m => (
          <div
            key={m.id}
            className="flex items-center justify-between p-2 rounded bg-slate-700/50 border border-slate-600 h-[52px]"
          >
            <div className="min-w-0 flex-1 mr-2">
              <div className="text-sm font-medium text-white truncate">
                {labelMap[m.id] || m.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </div>
              <div className="text-xs text-blue-300 truncate h-4">
                {m.occupants.length > 0 ? m.occupants[0] : ' '}
              </div>
            </div>
            <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded w-[82px] text-center ${
              m.status === 'busy' ? 'bg-blue-600 text-white' :
              m.status === 'maintenance' ? 'bg-red-600 text-white' :
              'bg-green-600/60 text-green-200'
            }`}>
              {m.status.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
