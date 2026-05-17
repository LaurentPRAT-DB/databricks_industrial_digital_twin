# glTF Equipment Models for 3D Factory View

## Context

The 3D view currently renders machines as simple colored boxes. We want higher fidelity using real glTF models sourced from Sketchfab/CC0 libraries. The **Kenney Factory Kit** (CC0, 140 pieces, ~20-50KB each) provides exactly the right low-poly industrial assets: machines, conveyors, hoppers, robots, scanners, cranes, pistons.

The sister repo `databricks_airport_digital_twin` has a proven pattern for glTF loading with React Three Fiber (`useGLTF` + `Suspense` + `ErrorBoundary` + `scene.clone(true)`).

---

## Asset Selection

Map each location type in our scenarios to a Kenney GLB model:

| Equipment Archetype | GLB File | Used For |
|---|---|---|
| `machine` (default) | `machine.glb` (25KB) | Generic processing station |
| `machine_heavy` | `machine-fortified.glb` (29KB) | EAF, rolling mill, press |
| `machine_window` | `machine-window.glb` (38KB) | Reflow oven, pasteurizer (visible interior) |
| `machine_bed` | `machine-bed.glb` (51KB) | CNC, pick-and-place, printer |
| `robot_arm` | `robot-arm-a.glb` (49KB) | Robotic stations (palletizer, coating) |
| `scanner` | `scanner-high.glb` (21KB) | Inspection (AOI, SPI, ICT) |
| `conveyor` | `conveyor-long-sides.glb` (22KB) | Buffers (queue areas) |
| `hopper` | `hopper-high-round.glb` (16KB) | Spawn points (material input) |
| `crane` | `crane.glb` (52KB) | Exit points (output/shipping) |
| `piston` | `piston-round.glb` (37KB) | Press, capper, stamping |

Total: ~10 models, ~340KB additional static assets.

---

## Implementation

### 1. Copy GLB assets → `app/frontend/public/models/equipment/`

Copy 10 selected GLBs from `/tmp/kenney_factory_kit/Models/GLB format/` into the Vite public directory. They'll be served at `/models/equipment/*.glb`.

### 2. Create model registry → `app/frontend/src/config/equipmentModels.ts`

Adapted from airport's `aircraftModels.ts` (`src/config/aircraftModels.ts`):

```ts
interface EquipmentModelConfig {
  url: string;
  scale: number;
  rotationOffset: { x: number; y: number; z: number };
}

const EQUIPMENT_MODELS: Record<string, EquipmentModelConfig> = { ... };

function getEquipmentModel(locationType: string, modelHint?: string): EquipmentModelConfig
```

Lookup: `modelHint` (from config `properties.model`) → `locationType` mapping → `DEFAULT` fallback.

### 3. Create glTF loader → `app/frontend/src/components/FloorPlan/GLTFEquipment.tsx`

Adapted from airport's `GLTFAircraft.tsx` (`src/components/Map3D/GLTFAircraft.tsx`):

- `useGLTF(url)` — no Draco needed (Kenney models are uncompressed, small)
- `scene.clone(true)` per instance for unique materials
- Material override: busy machines get emissive blue glow, idle get semi-transparent
- Status color applied to base material (blue=machine, green=spawn, amber=exit)
- `<Suspense fallback={<LoadingPlaceholder/>}>` + `<GLTFErrorBoundary fallback={<BoxFallback/>}>`
- `preloadEquipmentModels()` export for early loading

### 4. Update `FloorPlan3D.tsx`

Replace `LocationBox` primitive geometry with `<GLTFEquipment>`:
- Pass: resource, label, model config
- Keep: entity spheres, conveyor paths, floor grid, HTML labels
- Adjust lighting: bump ambient to 0.6, add hemisphere light for better PBR

### 5. Add `model` property hints to YAML configs

In `facility.locations[].properties.model` — optional per-station override:
```yaml
- id: reflow_oven
  type: machine
  properties:
    model: machine_window
```

Engine already passes `properties` through to `LocationMeta` on the frontend. No backend/engine changes needed — just YAML config additions.

### 6. Update Vite config for code splitting

Add manual chunks (from airport pattern in `vite.config.ts`):
```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        three: ['three', '@react-three/fiber', '@react-three/drei'],
      },
    },
  },
},
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `app/frontend/public/models/equipment/*.glb` (10 files) | Create — copy from Kenney kit |
| `app/frontend/src/config/equipmentModels.ts` | Create — model registry + lookup |
| `app/frontend/src/components/FloorPlan/GLTFEquipment.tsx` | Create — loader + error boundary |
| `app/frontend/src/components/FloorPlan/FloorPlan3D.tsx` | Modify — use GLTFEquipment, improve lighting |
| `app/frontend/vite.config.ts` | Modify — add manualChunks |
| `configs/steel_mini_mill.yaml` | Modify — add `model` properties |
| `configs/smt_electronics_assembly.yaml` | Modify — add `model` properties |
| `configs/beverage_bottling_line.yaml` | Modify — add `model` properties |
| `configs/assembly_line_3station.yaml` | Modify — add `model` properties |
| `configs/ev_battery_pack.yaml` | Modify — add `model` properties |

---

## Verification

1. `cd app/frontend && npm run build` — compiles without errors
2. Start server, switch to 3D view for each scenario
3. Verify: distinct model shapes for machines vs buffers vs spawn vs exit
4. Verify: busy machines glow blue, idle are dimmed
5. Verify: fallback works (rename a GLB → should show placeholder box)
6. Network tab: each GLB loaded once, ~300KB total
7. Run `python3 -m pytest tests/ -x` — engine tests still pass (no backend changes)
