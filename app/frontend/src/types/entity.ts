export interface Entity {
  id: string;
  entity_type: string;
  state: string;
  x: number;
  y: number;
  target_location: string | null;
  current_location: string | null;
  properties: Record<string, unknown>;
}

export interface Resource {
  id: string;
  type: string;
  x: number;
  y: number;
  capacity: number;
  occupants: string[];
  queue_depth: number;
  status: string;
  properties: Record<string, unknown>;
}

export interface Metrics {
  throughput_per_hour: number;
  wip_count: number;
  completed: number;
  avg_utilization_pct: number;
  total_queue_depth: number;
  elapsed_hours: number;
}

export interface SimConfig {
  name: string;
  description: string;
  facility_name: string;
}

export interface PathSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface LocationMeta {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  capacity: number;
  properties?: Record<string, number>;
  model_3d?: string;
}

export interface StateDescription {
  description: string;
  type: string;
  duration?: { mean?: number; std?: number; value?: number };
}

export interface SimulationState {
  entities: Entity[];
  resources: Resource[];
  metrics: Metrics;
  config: SimConfig;
  paths: PathSegment[];
  locations: LocationMeta[];
  state_descriptions: Record<string, StateDescription>;
  sim_time: string;
}
