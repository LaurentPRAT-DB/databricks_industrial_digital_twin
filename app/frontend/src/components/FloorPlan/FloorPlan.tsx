import { useMemo } from 'react';
import type { Entity, Resource, PathSegment } from '../../types/entity';

interface Props {
  entities: Entity[];
  resources: Resource[];
  paths: PathSegment[];
}

const SCALE = 6;
const PADDING = 20;

const LOCATION_COLORS: Record<string, string> = {
  machine: '#3b82f6',
  buffer: '#6b7280',
  spawn_point: '#10b981',
  exit_point: '#f59e0b',
};

const FIXED_STATE_COLORS: Record<string, string> = {
  waiting: '#eab308',
  in_transit: '#22c55e',
  done: '#6b7280',
};

const PROCESS_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6'];

function getStateColor(state: string, processStates: string[]): string {
  if (FIXED_STATE_COLORS[state]) return FIXED_STATE_COLORS[state];
  const idx = processStates.indexOf(state);
  return idx >= 0 ? PROCESS_COLORS[idx % PROCESS_COLORS.length] : '#9ca3af';
}

export default function FloorPlan({ entities, resources, paths }: Props) {
  const width = 100 * SCALE + PADDING * 2;
  const height = 50 * SCALE + PADDING * 2;

  const allStates = useMemo(() => {
    const seen = new Set<string>();
    for (const e of entities) seen.add(e.state);
    return Array.from(seen);
  }, [entities]);

  const processStates = useMemo(
    () => allStates.filter(s => !FIXED_STATE_COLORS[s]),
    [allStates],
  );

  const legendStates = useMemo(() => {
    const fixed = Object.keys(FIXED_STATE_COLORS).filter(s => allStates.includes(s));
    return [...fixed.slice(0, 2), ...processStates, ...fixed.slice(2)];
  }, [allStates, processStates]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-full bg-slate-800 rounded-lg"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Paths */}
      {paths.map((p, i) => (
        <line
          key={`path-${i}`}
          x1={p.from.x * SCALE + PADDING}
          y1={p.from.y * SCALE + PADDING}
          x2={p.to.x * SCALE + PADDING}
          y2={p.to.y * SCALE + PADDING}
          stroke="#374151"
          strokeWidth="2"
          strokeDasharray="4 2"
        />
      ))}

      {/* Resources (locations) */}
      {resources.map((r) => {
        const cx = r.x * SCALE + PADDING;
        const cy = r.y * SCALE + PADDING;
        const color = LOCATION_COLORS[r.type] || '#4b5563';
        const size = r.type === 'machine' ? 14 : 10;
        const isBusy = r.status === 'busy';

        return (
          <g key={r.id}>
            <rect
              x={cx - size}
              y={cy - size}
              width={size * 2}
              height={size * 2}
              rx={r.type === 'buffer' ? 2 : 4}
              fill={isBusy ? color : `${color}44`}
              stroke={color}
              strokeWidth={isBusy ? 2 : 1}
            />
            <text
              x={cx}
              y={cy + size + 12}
              textAnchor="middle"
              fontSize="8"
              fill="#9ca3af"
            >
              {r.id.replace(/_/g, ' ')}
            </text>
            {r.type === 'machine' && (
              <text
                x={cx}
                y={cy + 3}
                textAnchor="middle"
                fontSize="7"
                fill="white"
                fontWeight="bold"
              >
                {isBusy ? '⚙' : '○'}
              </text>
            )}
            {r.type === 'buffer' && r.queue_depth > 0 && (
              <text
                x={cx}
                y={cy + 3}
                textAnchor="middle"
                fontSize="7"
                fill="white"
              >
                {r.queue_depth}
              </text>
            )}
          </g>
        );
      })}

      {/* Entities */}
      {entities.map((e) => {
        const cx = e.x * SCALE + PADDING;
        const cy = e.y * SCALE + PADDING;
        const color = getStateColor(e.state, processStates);

        return (
          <circle
            key={e.id}
            cx={cx}
            cy={cy}
            r={4}
            fill={color}
            stroke="white"
            strokeWidth="0.5"
            opacity={0.9}
          >
            <title>{`${e.id} [${e.state}]`}</title>
          </circle>
        );
      })}

      {/* Legend */}
      <g transform={`translate(${width - 130}, 10)`}>
        {legendStates.map((state, i) => (
          <g key={state} transform={`translate(0, ${i * 14})`}>
            <circle cx={5} cy={5} r={4} fill={getStateColor(state, processStates)} />
            <text x={14} y={9} fontSize="8" fill="#d1d5db">{state.replace(/_/g, ' ')}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
