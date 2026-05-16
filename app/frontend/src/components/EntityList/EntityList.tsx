import type { Entity } from '../../types/entity';

interface Props {
  entities: Entity[];
}

const STATE_DOTS: Record<string, string> = {
  waiting: 'bg-yellow-500',
  in_transit: 'bg-green-500',
  machining: 'bg-blue-500',
  assembling: 'bg-purple-500',
  inspecting: 'bg-pink-500',
};

export default function EntityList({ entities }: Props) {
  const sorted = [...entities].sort((a, b) => a.id.localeCompare(b.id));
  const display = sorted.slice(0, 30);

  return (
    <div className="bg-slate-800 rounded-lg p-4 max-h-64 overflow-y-auto">
      <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
        Active Entities ({entities.length})
      </h2>
      <div className="space-y-1">
        {display.map(e => (
          <div key={e.id} className="flex items-center gap-2 text-xs text-slate-300 py-0.5">
            <span className={`w-2 h-2 rounded-full ${STATE_DOTS[e.state] || 'bg-gray-500'}`} />
            <span className="font-mono flex-1 truncate">{e.id}</span>
            <span className="text-slate-500">{e.state}</span>
            {e.current_location && (
              <span className="text-slate-600">@ {e.current_location}</span>
            )}
          </div>
        ))}
        {entities.length > 30 && (
          <div className="text-xs text-slate-500 pt-1">
            +{entities.length - 30} more...
          </div>
        )}
      </div>
    </div>
  );
}
