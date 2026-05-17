export interface EquipmentModelConfig {
  url: string;
  scale: number;
  rotationOffset: { x: number; y: number; z: number };
}

export const EQUIPMENT_MODELS: Record<string, EquipmentModelConfig> = {
  machine:        { url: '/models/equipment/machine.glb',            scale: 2.5, rotationOffset: { x: 0, y: 0, z: 0 } },
  machine_heavy:  { url: '/models/equipment/machine-fortified.glb',  scale: 2.5, rotationOffset: { x: 0, y: 0, z: 0 } },
  machine_window: { url: '/models/equipment/machine-window.glb',     scale: 2.5, rotationOffset: { x: 0, y: 0, z: 0 } },
  machine_bed:    { url: '/models/equipment/machine-bed.glb',        scale: 2.5, rotationOffset: { x: 0, y: 0, z: 0 } },
  robot_arm:      { url: '/models/equipment/robot-arm-a.glb',        scale: 2.5, rotationOffset: { x: 0, y: 0, z: 0 } },
  scanner:        { url: '/models/equipment/scanner-high.glb',       scale: 2.5, rotationOffset: { x: 0, y: 0, z: 0 } },
  conveyor:       { url: '/models/equipment/conveyor-long-sides.glb', scale: 2.0, rotationOffset: { x: 0, y: 0, z: 0 } },
  hopper:         { url: '/models/equipment/hopper-high-round.glb',  scale: 2.5, rotationOffset: { x: 0, y: 0, z: 0 } },
  crane:          { url: '/models/equipment/crane.glb',              scale: 2.5, rotationOffset: { x: 0, y: 0, z: 0 } },
  piston:         { url: '/models/equipment/piston-round.glb',       scale: 2.5, rotationOffset: { x: 0, y: 0, z: 0 } },
};

const LOCATION_TYPE_DEFAULTS: Record<string, string> = {
  machine: 'machine',
  buffer: 'conveyor',
  spawn_point: 'hopper',
  exit_point: 'crane',
};

export function getEquipmentModel(locationType: string, modelHint?: string): EquipmentModelConfig {
  if (modelHint && EQUIPMENT_MODELS[modelHint]) {
    return EQUIPMENT_MODELS[modelHint];
  }
  const key = LOCATION_TYPE_DEFAULTS[locationType] || 'machine';
  return EQUIPMENT_MODELS[key];
}

export function preloadEquipmentModels() {
  return Object.values(EQUIPMENT_MODELS).map(m => m.url);
}
