# What-If Anomaly Parametrization System

## Context

The simulation currently models nominal behavior only — machines have `cycle_time_mean` and `mtbf_hours` declared in YAML properties but failures are never actually triggered in the engine. The `random_failure` condition type exists in `state_graph.py` (line 33) but no scenario uses it. The user wants each equipment to be configurable with nominal behavior + deviations that produce anomalies, malfunctions, and failures, enabling what-if analysis to evaluate impact on the whole process.

## Design: Runtime Override Architecture

The system adds a `DeviationConfig` to the Pydantic schema and lets the frontend send per-machine parameter overrides via a new API endpoint. The engine applies deviations during pre-computation — no YAML files are mutated.

```
Scenario Editor (UI)  ──POST──►  /api/scenarios/simulate
  per-machine sliders              {scenario_id, overrides: {location_id: {param: value}}}
                                         │
                                         ▼
                                   Engine with deviation parameters applied
                                         │
                                         ▼
                                   Pre-computed frames (same format, different KPIs)
```

---

## Deviation Parameters Per Machine

| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| cycle_time_factor | 0.5 — 3.0 | 1.0 | Multiplier on nominal cycle time |
| cycle_time_variability | 0.5 — 5.0 | 1.0 | Multiplier on duration std dev |
| failure_probability | 0 — 0.2 | 0.0 | Chance of breakdown per processing cycle |
| failure_duration_mean | 60 — 1800 | 300 | Mean repair time (seconds) |
| failure_duration_std | 0 — 300 | 60 | Repair time variability |
| degradation_rate | 0 — 10 | 0.0 | Seconds added to cycle time per hour of operation |
| quality_defect_rate | 0 — 0.3 | 0.0 | Probability product needs rework at same station |

---

## Files to Modify/Create

### 1. `src/engine/config.py` — Add DeviationConfig

- New `DeviationConfig(BaseModel)` with the 7 parameters above
- Add `deviations: Optional[DeviationConfig] = None` to `LocationConfig`

### 2. `src/engine/engine.py` — Apply deviations during simulation

- Add `_deviation_overrides: dict[str, DeviationConfig]` to `__init__` + setter method
- Modify `_compute_state_duration(state_config, location_id)` to:
  - Multiply base duration by `cycle_time_factor`
  - Scale std dev by `cycle_time_variability`
  - Add `degradation_rate * elapsed_hours` drift
- Add failure injection in `_handle_transition()`:
  - When exiting a stationary state, roll against `failure_probability`
  - If triggered: set `entity.breakdown_remaining` to sampled repair duration, keep resource acquired
  - In `_update_entity()`: count down `breakdown_remaining` before allowing normal transition
- Add quality defect logic in `_handle_transition()`:
  - When exiting a stationary state, roll against `quality_defect_rate`
  - If triggered: DON'T increment `station_index`, re-route entity back to same machine

### 3. `src/engine/models.py` — Add breakdown state tracking

- Add `breakdown_remaining: float = 0.0` to `EntityState`
- Add `is_broken_down` property

### 4. `app/backend/main.py` — New API endpoints

- `GET /api/scenarios/{scenario_id}/parameters` — returns per-location parameter schema with current values
- `POST /api/scenarios/simulate` — accepts `{id, overrides}`, runs simulation with deviations, replaces active frames
- Modify `_precompute_simulation()` to accept optional overrides dict

### 5. `configs/assembly_line_3station.yaml` + `configs/ev_battery_pack.yaml`

- Add `deviations:` block to each machine location with default (neutral) values
- This makes the parametrizable range discoverable by the UI

### 6. `app/frontend/src/types/entity.ts` — Add deviation types

- `DeviationParams` interface matching the 7 parameters
- `LocationParameter` interface for the parameters endpoint response

### 7. `app/frontend/src/components/ScenarioEditor/ScenarioEditor.tsx` — New component

- Slide-out panel from header button
- One card per machine with:
  - Machine name + nominal cycle time (read-only)
  - Sliders for each deviation parameter with labels, ranges, current values
- "Run Simulation" button → POST overrides → reload frames
- "Reset to Nominal" button
- Quick presets: "Nominal", "Aging Equipment", "Quality Issue", "Machine Down"

### 8. `app/frontend/src/App.tsx` — Integration

- Add "What-If" button in header next to 2D/3D toggle
- Toggle `ScenarioEditor` visibility
- Wire `onSimulate` callback to `sim.loadFrames`

---

## Implementation Order

1. **Config + Models** — `config.py` (DeviationConfig), `models.py` (breakdown_remaining)
2. **Engine core** — `engine.py` (apply deviations, failure injection, quality defects)
3. **Backend API** — `main.py` (parameters + simulate endpoints)
4. **YAML defaults** — Both scenario configs
5. **Frontend types** — `entity.ts`
6. **Scenario Editor UI** — `ScenarioEditor.tsx` + `App.tsx` integration
7. **Test end-to-end** — verify KPI impact

---

## Verification

1. `uv run pytest tests/` — existing 23 tests still pass (deviations default to neutral)
2. Load scenario nominally → identical KPIs to before (backwards compatible)
3. Set CNC Mill `failure_probability=0.1` → observe throughput drop + queue buildup in dashboard
4. Set `cycle_time_factor=2.0` on bottleneck → cascading delays visible
5. Set `quality_defect_rate=0.15` → observe WIP increase from rework
6. "Reset to Nominal" → returns to baseline KPIs
7. Frontend renders editor with working sliders, "Run" triggers re-computation and frame reload
