# Per-Equipment Telemetry Enrichment

## Context

The simulation engine currently tracks only aggregate metrics (avg utilization, total throughput, total queue depth). Individual machine telemetry is minimal — `total_busy_time` exists on `ResourceState` but isn't exposed in frame data. YAML configs declare `mtbf_hours` and `cycle_time_mean` in properties but these are never read by the engine.

For industrial digital twin use cases, per-equipment telemetry is essential for identifying bottlenecks, predicting maintenance, and running what-if analysis at the machine level.

## Current State

**Tracked globally:** throughput/hr, WIP count, completed count, avg utilization %, total queue depth, elapsed hours.

**Per resource (in frames):** status, occupants, queue_depth. `total_busy_time` tracked internally but NOT in `to_dict()`.

**Events recorded:** state transitions (entity/from/to/location), machine_breakdown, breakdown_resolved, quality_defect_rework.

**Config properties declared but unused:** `mtbf_hours`, `cycle_time_mean` (in location properties).

## Telemetry to Add

### Tier 1 — High Impact, Low Effort

| Metric | Where | Implementation |
|--------|-------|----------------|
| **Cycle count** per machine | `ResourceState` | New `cycle_count: int` field, increment on stationary→transit transition at that location |
| **Per-machine utilization** (individual) | `ResourceState.to_dict()` | Expose existing `total_busy_time`, compute `utilization_pct` in `to_dict()` |
| **Total downtime** per machine | `ResourceState` | New `total_downtime: float`, accumulate breakdown durations |
| **Idle time** per machine | Computed | `elapsed - busy_time - downtime` |
| **Utilization breakdown** | `to_dict()` | `busy_pct`, `idle_pct`, `down_pct` per machine |
| **Entity lead time** | `EntityState.properties` | Stamp `spawn_time` on creation, compute `lead_time = done_time - spawn_time` on completion |
| **Avg lead time** | Global metrics | Running average of completed entity lead times |

### Tier 2 — Medium Impact, Medium Effort

| Metric | Where | Implementation |
|--------|-------|----------------|
| **MTBF (actual)** per machine | `ResourceState` | Track `failure_count` and `last_failure_time`, compute `total_uptime / failure_count` |
| **MTTR (actual)** per machine | `ResourceState` | Accumulate repair durations, compute `total_downtime / failure_count` |
| **OEE** per machine | Computed | `Availability × Performance × Quality` where: Availability = (elapsed - downtime) / elapsed, Performance = (cycle_count × ideal_cycle_time) / (elapsed - downtime), Quality = (cycle_count - defect_count) / cycle_count |
| **Queue wait time** per entity | `EntityState` | Record time entity enters queue state, compute wait = process_start - queue_enter |
| **Avg queue wait** per buffer | `ResourceState` | Running average of wait times for entities passing through |
| **Machine action log** | API endpoint | Aggregate `recorder.state_transitions` grouped by location, expose via `GET /api/machines/{id}/log` |

### Tier 3 — Future / Synthetic Sensors

| Metric | Notes |
|--------|-------|
| **Energy consumption** | Per-machine power profile in config (kW when idle/busy/startup), integrate over time |
| **Temperature** | Synthetic signal: baseline + load-dependent rise + noise, configurable per machine |
| **Vibration** | Synthetic signal: normal distribution baseline + degradation drift + spike on failure |
| **Predictive maintenance score** | Derived from degradation_rate + cycle_count + vibration trend |

## Files to Modify

| File | Change |
|------|--------|
| `src/engine/models.py` | Add `cycle_count`, `total_downtime`, `failure_count`, `last_failure_time` to `ResourceState`. Add `spawn_time` tracking. Expose in `to_dict()` |
| `src/engine/engine.py` | Increment counters on transitions. Stamp entity spawn time. Track downtime. Compute lead time on completion |
| `src/engine/engine.py` | Expand `get_metrics()` with per-machine breakdown and avg lead time |
| `app/backend/main.py` | Per-machine metrics included in frame data (already via `to_dict()`) |
| `app/frontend/src/types/entity.ts` | Add telemetry fields to `Resource` type |
| `app/frontend/src/components/MachineStatus/MachineStatus.tsx` | Display cycle count, utilization breakdown, downtime |

## Implementation Order

1. **ResourceState fields** — cycle_count, total_downtime, failure_count (models.py)
2. **Engine counters** — increment on transitions, track downtime, stamp spawn_time (engine.py)
3. **Expose in to_dict()** — utilization breakdown, cycle count, downtime (models.py)
4. **Global metrics** — per-machine utilization array, avg lead time (engine.py)
5. **Frontend types** — update Resource interface (entity.ts)
6. **MachineStatus UI** — show new metrics (MachineStatus.tsx)
7. **Tests** — verify counters increment correctly, lead time computed

## Verification

1. `uv run pytest tests/ -x` — existing tests pass
2. Load scenario → run simulation → each machine shows cycle count incrementing
3. Machine utilization breakdown: busy + idle + down = 100%
4. Trigger what-if with `failure_probability=0.1` → downtime and failure count visible
5. Completed entities show lead time in metrics
6. Report KPIs include per-machine utilization breakdown
