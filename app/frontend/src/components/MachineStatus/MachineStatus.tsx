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
            className={`flex items-center justify-between p-2 rounded ${
              m.status === 'busy' ? 'bg-blue-900/40 border border-blue-700' :
              m.status === 'maintenance' ? 'bg-red-900/40 border border-red-700' :
              'bg-slate-700/50 border border-slate-600'
            }`}
          >
            <div className="min-w-0 flex-1 mr-2">
              <span className="text-sm font-medium text-white">
                {labelMap[m.id] || m.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              {m.occupants.length > 0 && (
                <span className="ml-2 text-xs text-blue-300 truncate">
                  {m.occupants[0]}
                </span>
              )}
            </div>
            <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded ${
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
