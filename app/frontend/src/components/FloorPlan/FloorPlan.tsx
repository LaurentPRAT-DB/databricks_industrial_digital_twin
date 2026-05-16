import { useMemo } from 'react';
import type { Entity, Resource, PathSegment, LocationMeta } from '../../types/entity';

interface Props {
  entities: Entity[];
  resources: Resource[];
  paths: PathSegment[];
  locations: LocationMeta[];
}

const SCALE = 7;
const PADDING = 30;

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

export default function FloorPlan({ entities, resources, paths, locations }: Props) {
  const width = 100 * SCALE + PADDING * 2;
  const height = 50 * SCALE + PADDING * 2;

  const labelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const loc of locations) m.set(loc.id, loc.label);
    return m;
  }, [locations]);

  const processStates = useMemo(
    () => {
      const seen = new Set<string>();
      for (const e of entities) {
        if (!FIXED_STATE_COLORS[e.state]) seen.add(e.state);
      }
      return Array.from(seen);
    },
    [entities],
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-full bg-slate-800/50 rounded-lg"
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
          stroke="#475569"
          strokeWidth="1.5"
          strokeDasharray="6 3"
          opacity="0.6"
        />
      ))}

      {/* Resources (locations) */}
      {resources.map((r) => {
        const cx = r.x * SCALE + PADDING;
        const cy = r.y * SCALE + PADDING;
        const color = LOCATION_COLORS[r.type] || '#4b5563';
        const size = r.type === 'machine' ? 16 : 11;
        const isBusy = r.status === 'busy';
        const label = labelMap.get(r.id) || r.id.replace(/_/g, ' ');
        const isAboveCenter = r.y < 25;

        return (
          <g key={r.id}>
            {/* Glow effect for busy machines */}
            {isBusy && r.type === 'machine' && (
              <rect
                x={cx - size - 3}
                y={cy - size - 3}
                width={(size + 3) * 2}
                height={(size + 3) * 2}
                rx={6}
                fill="none"
                stroke={color}
                strokeWidth="1"
                opacity="0.4"
              />
            )}
            <rect
              x={cx - size}
              y={cy - size}
              width={size * 2}
              height={size * 2}
              rx={r.type === 'buffer' ? 3 : 5}
              fill={isBusy ? color : `${color}33`}
              stroke={color}
              strokeWidth={isBusy ? 2 : 1.2}
            />
            {/* Label — positioned above or below depending on vertical position */}
            <text
              x={cx}
              y={isAboveCenter ? cy - size - 8 : cy + size + 14}
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill="#f1f5f9"
              letterSpacing="0.3"
            >
              {label}
            </text>
            {/* Machine icon */}
            {r.type === 'machine' && (
              <text
                x={cx}
                y={cy + 4}
                textAnchor="middle"
                fontSize="9"
                fill="white"
                fontWeight="bold"
              >
                {isBusy ? '⚙' : '○'}
              </text>
            )}
            {/* Buffer count */}
            {r.type === 'buffer' && r.queue_depth > 0 && (
              <text
                x={cx}
                y={cy + 4}
                textAnchor="middle"
                fontSize="9"
                fill="white"
                fontWeight="bold"
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
            r={4.5}
            fill={color}
            stroke="white"
            strokeWidth="0.6"
            opacity={0.9}
          >
            <title>{`${e.id} [${e.state}]`}</title>
          </circle>
        );
      })}
    </svg>
  );
}
