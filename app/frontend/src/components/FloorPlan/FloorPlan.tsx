import type { Entity, Resource } from '../../types/entity';

interface Props {
  entities: Entity[];
  resources: Resource[];
}

const SCALE = 6;
const PADDING = 20;

const LOCATION_COLORS: Record<string, string> = {
  machine: '#3b82f6',
  buffer: '#6b7280',
  spawn_point: '#10b981',
  exit_point: '#f59e0b',
};

const STATE_COLORS: Record<string, string> = {
  waiting: '#eab308',
  in_transit: '#22c55e',
  machining: '#3b82f6',
  assembling: '#8b5cf6',
  inspecting: '#ec4899',
  done: '#6b7280',
};

const PATHS = [
  { from: { x: 5, y: 25 }, to: { x: 20, y: 25 } },
  { from: { x: 20, y: 25 }, to: { x: 35, y: 15 } },
  { from: { x: 20, y: 25 }, to: { x: 35, y: 35 } },
  { from: { x: 35, y: 15 }, to: { x: 50, y: 25 } },
  { from: { x: 35, y: 35 }, to: { x: 50, y: 25 } },
  { from: { x: 50, y: 25 }, to: { x: 65, y: 25 } },
  { from: { x: 65, y: 25 }, to: { x: 80, y: 25 } },
  { from: { x: 80, y: 25 }, to: { x: 90, y: 25 } },
  { from: { x: 90, y: 25 }, to: { x: 95, y: 25 } },
];

export default function FloorPlan({ entities, resources }: Props) {
  const width = 100 * SCALE + PADDING * 2;
  const height = 50 * SCALE + PADDING * 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-full bg-slate-800 rounded-lg"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Paths */}
      {PATHS.map((p, i) => (
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
        const color = STATE_COLORS[e.state] || '#9ca3af';

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
      <g transform={`translate(${width - 120}, 10)`}>
        {Object.entries(STATE_COLORS).map(([state, color], i) => (
          <g key={state} transform={`translate(0, ${i * 14})`}>
            <circle cx={5} cy={5} r={4} fill={color} />
            <text x={14} y={9} fontSize="8" fill="#d1d5db">{state}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
