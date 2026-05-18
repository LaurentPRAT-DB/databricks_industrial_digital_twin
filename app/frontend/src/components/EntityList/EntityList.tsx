import type { Entity, LocationMeta, StateDescription } from '../../types/entity';

interface Props {
  entities: Entity[];
  locations: LocationMeta[];
  stateDescriptions: Record<string, StateDescription>;
}

const FIXED_DOTS: Record<string, string> = {
  waiting: 'bg-yellow-500',
  in_transit: 'bg-green-500',
  done: 'bg-gray-500',
};

const PROCESS_DOTS = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-teal-500'];

function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function EntityList({ entities, locations, stateDescriptions }: Props) {
  const sorted = [...entities].sort((a, b) => a.id.localeCompare(b.id));
  const display = sorted.slice(0, 30);
  const labelMap = Object.fromEntries(locations.map(l => [l.id, l.label]));

  const processStates = Array.from(new Set(
    entities.map(e => e.state).filter(s => !FIXED_DOTS[s])
  ));

  const getDot = (state: string) => {
    if (FIXED_DOTS[state]) return FIXED_DOTS[state];
    const idx = processStates.indexOf(state);
    return idx >= 0 ? PROCESS_DOTS[idx % PROCESS_DOTS.length] : 'bg-gray-500';
  };

  const stateLabel = (state: string) => {
    const desc = stateDescriptions[state];
    if (desc?.type === 'moving') return 'In Transit';
    if (desc?.type === 'queued') return 'Waiting';
    return humanize(state);
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
        Active Entities ({entities.length})
      </h2>
      <div className="space-y-1">
        {display.map(e => (
          <div key={e.id} className="flex items-center gap-2 text-xs text-slate-300 py-0.5">
            <span className={`shrink-0 w-2 h-2 rounded-full ${getDot(e.state)}`} />
            <span className="font-mono truncate">{e.id}</span>
            <span className="text-slate-500 shrink-0">{stateLabel(e.state)}</span>
            {e.current_location && (
              <span className="text-slate-600 shrink-0">@ {labelMap[e.current_location] || humanize(e.current_location)}</span>
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
