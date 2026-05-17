# Plan Builder — Text-to-Config Scenario Generator

## Context

Users currently must write YAML configs manually to create new factory scenarios. We want a Plan Builder UI that lets users:

1. Pick from industry templates (pre-built process flows for common industries)
2. Customize station names, cycle times, and order via a structured editor
3. Paste a free-text description that gets parsed into stations
4. Generate and save a complete simulation config

The order of stations defines the spatial layout (left-to-right linear flow in the 100×50 coordinate space).

---

## Industry Templates

Pre-built templates with realistic defaults (sourced from Wikipedia + engineering references):

| Template | Stations | Spawn Rate | Entity |
|----------|----------|------------|--------|
| Automotive Body Shop | Stamping → Welding → Painting → Trim Assembly → Final Assembly → QC | 12/hr | vehicle_body |
| Pharmaceutical Tablets | Powder Feeding → Blending → Milling → Granulation → Tablet Press → Coating → QC | 200/hr | tablet_batch |
| Food Processing (Dairy) | Receiving → Pasteurization → Homogenization → Filling → Sealing → Labeling → Cold Storage | 150/hr | milk_carton |
| Semiconductor Fab | Wafer Clean → Oxidation → Photolithography → Etching → Doping → Metallization → Testing | 8/hr | wafer |
| Furniture Assembly | Wood Cutting → Sanding → Drilling → Assembly → Finishing → Packing | 20/hr | furniture_unit |
| Custom (blank) | User-defined | User-defined | User-defined |

Each template provides: station names, default cycle times (normal distribution), suggested 3D model hints, spawn rate, entity type, and description.

---

## Architecture

### Frontend: PlanBuilder component (new panel, similar to ScenarioEditor)

Opens from a "+ New" button in the header (next to ScenarioPicker). Renders as a right-side panel (w-[480px]).

**UI sections (top to bottom):**

1. **Template selector** — dropdown/cards to pick an industry template or "Custom"
2. **Scenario metadata** — name input, description textarea, duration (default 8h), spawn rate slider
3. **Station list** — ordered list of stations, each with:
   - Name (text input)
   - Cycle time mean (number input, seconds)
   - Cycle time std (number input, seconds)
   - 3D model picker (dropdown from equipmentModels registry)
   - Drag handle for reordering (or up/down arrows)
   - Delete button
   - "Add station" button at bottom
4. **Entity type** — name input, optional variant list (comma-separated)
5. **Free-text import** — expandable textarea with placeholder showing example format:
   ```
   Stamping (60s) → Welding (120s, σ=15s) → Painting (300s) → Assembly (180s) → QC (45s)
   ```
   "Parse" button converts text into the station list above
6. **Preview** — mini text summary showing flow: `Stamping → Welding → ... (6 stations, ~12/hr)`
7. **Footer** — "Generate & Run" button (creates YAML, saves to configs/, loads simulation)

### Backend: `POST /api/scenarios/generate`

Receives the structured config from the frontend and:

1. Generates the full YAML config (locations, paths, state_graph, entity_types, schedule)
2. Saves to `configs/{slugified_name}.yaml`
3. Pre-computes the simulation
4. Returns the scenario ID for loading

### Config generation logic (backend, pure Python)

`src/engine/plan_builder.py` — a standalone module that takes a `PlanSpec` dataclass and produces a `SimulationConfig`:

```python
@dataclass
class StationSpec:
    name: str           # "Welding"
    cycle_mean: float   # 120.0 seconds
    cycle_std: float    # 15.0 seconds
    model_3d: str       # "machine_heavy"

@dataclass
class PlanSpec:
    name: str
    description: str
    duration_hours: float
    entity_type: str
    entity_variants: list[str]
    spawn_rate_per_hour: float
    stations: list[StationSpec]
    seed: int | None
```

**Layout algorithm (auto-placement):**
- Coordinate space: 100×50 meters
- Spawn point at x=5, y=25
- Stations spread evenly across x=10..90
- Buffer placed before each station (offset x-3)
- Exit point at x=95, y=25
- Parallel stations (future): offset y±8 from center
- Paths auto-generated connecting sequential locations

**State graph generation:**
- `waiting` (queued, at spawn_point)
- `in_transit` (moving, speed constant 5.0)
- N stationary states named `{station_id_snake}` with duration `normal(mean, std)`
- `done` (terminal, at exit_point)
- Transitions follow the same `station_index` pattern as existing configs
- `on_enter`: acquire_resource + emit_event, `on_exit`: release_resource + emit_event

---

## Free-text Parser

Simple regex-based parser in the frontend (`parseProcessDescription`):

**Supported formats:**
```
Stamping (60s) → Welding (120s, σ=15s) → Painting (300s)
Stamping → Welding → Painting
1. Stamping - 60 seconds
2. Welding - 120 seconds
```

**Rules:**
- Split on `→`, `->`, `>`, or numbered lines
- Extract name from text before parentheses
- Extract mean from `(\d+s)` pattern
- Extract std from `σ=(\d+)s` or `std=(\d+)s`
- Default std = 10% of mean when not specified
- Default mean = 60s when not specified

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/engine/plan_builder.py` | Create — PlanSpec → SimulationConfig generator |
| `app/backend/main.py` | Modify — add `POST /api/scenarios/generate` endpoint |
| `app/frontend/src/components/PlanBuilder/PlanBuilder.tsx` | Create — main panel component |
| `app/frontend/src/components/PlanBuilder/templates.ts` | Create — industry template definitions |
| `app/frontend/src/components/PlanBuilder/parseDescription.ts` | Create — free-text parser |
| `app/frontend/src/App.tsx` | Modify — add "+ New" button in header, toggle PlanBuilder panel |

---

## Verification

1. `python3 -m pytest tests/ -x` — existing tests pass
2. Write unit test for `plan_builder.py`: generate from PlanSpec, validate output has correct locations/paths/state_graph structure
3. `npm run build` — compiles without errors
4. Start server, click "+ New", pick "Automotive Body Shop" template
5. Verify station list populated with 6 stations and realistic defaults
6. Click "Generate & Run" → simulation loads, entities flow through all stations
7. Test free-text: paste "Cutting (30s) → Sanding (45s) → Assembly (90s)" → parse → generates 3 stations
8. Test custom: add/remove/reorder stations, change cycle times, generate
9. Verify generated YAML saved to `configs/` and appears in ScenarioPicker dropdown
