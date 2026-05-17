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
  cycle_count?: number;
  busy_pct?: number;
  idle_pct?: number;
  down_pct?: number;
  failure_count?: number;
  total_downtime_s?: number;
}

export interface MachineStats {
  cycle_count: number;
  busy_pct: number;
  idle_pct: number;
  down_pct: number;
  failure_count: number;
}

export interface Metrics {
  throughput_per_hour: number;
  wip_count: number;
  completed: number;
  avg_utilization_pct: number;
  total_queue_depth: number;
  elapsed_hours: number;
  avg_lead_time_s?: number;
  machine_stats?: Record<string, MachineStats>;
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

export interface SimFrame {
  sim_time: string;
  elapsed_s: number;
  entities: Entity[];
  resources: Resource[];
  metrics: Metrics;
}

export type PlaybackSpeed = 1 | 2 | 5 | 10 | 30 | 60;

export interface DeviationParams {
  cycle_time_factor: number;
  cycle_time_variability: number;
  failure_probability: number;
  failure_duration_mean: number;
  failure_duration_std: number;
  degradation_rate: number;
  quality_defect_rate: number;
}

export interface LocationParameter {
  id: string;
  label: string;
  cycle_time_mean: number | null;
  mtbf_hours: number | null;
  deviations: DeviationParams;
}

export interface SimulationFrameData {
  config: SimConfig;
  paths: PathSegment[];
  locations: LocationMeta[];
  state_descriptions: Record<string, StateDescription>;
  frames: SimFrame[];
  frame_count: number;
  snapshot_interval_s: number;
  scenario_id: string;
  whatif_name: string | null;
  whatif_overrides: Record<string, Record<string, number>> | null;
}
