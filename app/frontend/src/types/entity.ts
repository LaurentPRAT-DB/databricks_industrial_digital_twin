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

export interface SimulationState {
  entities: Entity[];
  resources: Resource[];
  metrics: Metrics;
  config: SimConfig;
  paths: PathSegment[];
  sim_time: string;
}
