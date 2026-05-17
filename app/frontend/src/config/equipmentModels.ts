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

export const CURATED_MODEL_KEYS = Object.keys(EQUIPMENT_MODELS);

export const ALL_MODEL_KEYS: string[] = [
  'arrow', 'arrow-basic', 'arrow-basic-rounded', 'arrow-rounded',
  'box-large', 'box-long', 'box-small', 'box-wide',
  'button-floor-round', 'button-floor-round-small', 'button-floor-square', 'button-floor-square-small',
  'catwalk-corner', 'catwalk-cross', 'catwalk-junction', 'catwalk-stairs', 'catwalk-stairs-loop', 'catwalk-straight',
  'cog-a', 'cog-b', 'cog-c', 'cog-d', 'cog-e', 'cone',
  'conveyor', 'conveyor-bars', 'conveyor-bars-fence', 'conveyor-bars-fence-slope',
  'conveyor-bars-high', 'conveyor-bars-high-slope', 'conveyor-bars-sides',
  'conveyor-bars-stripe', 'conveyor-bars-stripe-fence', 'conveyor-bars-stripe-fence-slope',
  'conveyor-bars-stripe-high', 'conveyor-bars-stripe-high-slope', 'conveyor-bars-stripe-side',
  'conveyor-corner', 'conveyor-cross', 'conveyor-junction-t',
  'conveyor-long', 'conveyor-long-part-end', 'conveyor-long-part-middle',
  'conveyor-long-sides', 'conveyor-long-sides-part-end', 'conveyor-long-sides-part-middle',
  'conveyor-long-stripe', 'conveyor-long-stripe-sides', 'conveyor-long-stripe-sides-part-end', 'conveyor-long-stripe-sides-part-middle',
  'conveyor-sides', 'conveyor-sides-cross', 'conveyor-sides-junction-t',
  'conveyor-stripe', 'conveyor-stripe-corner', 'conveyor-stripe-cross', 'conveyor-stripe-junction-t',
  'conveyor-stripe-part-end', 'conveyor-stripe-part-middle',
  'conveyor-stripe-sides', 'conveyor-stripe-sides-cross', 'conveyor-stripe-sides-junction-t',
  'crane', 'crane-lift', 'crane-magnet',
  'door', 'door-wide-closed', 'door-wide-half', 'door-wide-open',
  'floor', 'floor-large',
  'hopper-high-round', 'hopper-high-square', 'hopper-round', 'hopper-square',
  'indicator-special-area', 'indicator-special-arrow', 'indicator-special-cross', 'indicator-special-lines',
  'lever-double', 'lever-single',
  'machine', 'machine-bed', 'machine-connection-hole', 'machine-connection-pipe', 'machine-fortified', 'machine-window', 'machine-window-bar',
  'oopi',
  'pipe-glass-large', 'pipe-glass-large-bend', 'pipe-glass-large-bump', 'pipe-glass-large-cross',
  'pipe-glass-large-curve', 'pipe-glass-large-junction', 'pipe-glass-large-long', 'pipe-glass-large-side', 'pipe-glass-large-valve',
  'pipe-large', 'pipe-large-bend', 'pipe-large-bump', 'pipe-large-cross',
  'pipe-large-curve', 'pipe-large-junction', 'pipe-large-long', 'pipe-large-side', 'pipe-large-valve',
  'piston-round', 'piston-square', 'piston-thin-round', 'piston-thin-square',
  'robot-arm-a', 'robot-arm-b',
  'scanner-high', 'scanner-low',
  'screen-flat', 'screen-hanging-small', 'screen-hanging-wide', 'screen-panel-flat', 'screen-panel-small', 'screen-panel-wide', 'screen-small', 'screen-wide',
  'structure-corner-inner', 'structure-corner-outer', 'structure-doorway', 'structure-doorway-wide',
  'structure-high', 'structure-medium', 'structure-short', 'structure-tall', 'structure-wall',
  'structure-window', 'structure-window-wide',
  'structure-yellow-high', 'structure-yellow-medium', 'structure-yellow-short', 'structure-yellow-tall',
  'top', 'top-large', 'top-large-checkerboard',
  'warning-orange', 'warning-traffic',
];

const DEFAULT_CONFIG: Omit<EquipmentModelConfig, 'url'> = { scale: 2.5, rotationOffset: { x: 0, y: 0, z: 0 } };

const LOCATION_TYPE_DEFAULTS: Record<string, string> = {
  machine: 'machine',
  buffer: 'conveyor',
  spawn_point: 'hopper',
  exit_point: 'crane',
};

export function getEquipmentModel(locationType: string, modelHint?: string): EquipmentModelConfig {
  if (modelHint) {
    if (EQUIPMENT_MODELS[modelHint]) return EQUIPMENT_MODELS[modelHint];
    const glbName = modelHint.replace(/_/g, '-');
    return { url: `/models/equipment/${glbName}.glb`, ...DEFAULT_CONFIG };
  }
  const key = LOCATION_TYPE_DEFAULTS[locationType] || 'machine';
  return EQUIPMENT_MODELS[key];
}

export function preloadEquipmentModels() {
  return Object.values(EQUIPMENT_MODELS).map(m => m.url);
}
