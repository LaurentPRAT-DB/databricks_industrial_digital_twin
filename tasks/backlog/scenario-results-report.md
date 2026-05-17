# Scenario Results Report — Baseline vs What-If Comparison

## Context

Scenarios are the parent container; what-ifs are children with deviation overrides. Currently each is run
individually with no way to compare results. The user wants:
1. Run a scenario's baseline (nominal) plus all its saved what-ifs in one operation
2. A results report showing KPIs side-by-side: baseline vs each what-if
3. What-ifs without names get auto-generated names (slugified from overrides + last modified date)
4. Later: batch execution as Databricks Jobs + Databricks Dashboard for visual comparison. For now: a simple
in-app report.

## Data Model

Each simulation run (baseline or what-if) produces final metrics from the last frame:
`throughput_per_hour`, `wip_count`, `completed`, `avg_utilization_pct`, `total_queue_depth`, `elapsed_hours`

The report is a table:

```
┌───────────────┬────────────┬─────┬───────────┬─────────────┬───────┬──────────┐
│      Run      │ Throughput │ WIP │ Completed │ Utilization │ Queue │ Duration │
├───────────────┼────────────┼─────┼───────────┼─────────────┼───────┼──────────┤
│ Baseline      │ 22.5/hr    │ 2   │ 180       │ 45%         │ 3     │ 8h       │
├───────────────┼────────────┼─────┼───────────┼─────────────┼───────┼──────────┤
│ CNC Aging     │ 18.1/hr    │ 4   │ 145       │ 52%         │ 7     │ 8h       │
├───────────────┼────────────┼─────┼───────────┼─────────────┼───────┼──────────┤
│ Quality Issue │ 20.3/hr    │ 3   │ 162       │ 48%         │ 5     │ 8h       │
└───────────────┴────────────┴─────┴───────────┴─────────────┴───────┴──────────┘
```

With delta columns showing % change from baseline (green = better, red = worse).

## Backend — app/backend/main.py

New endpoint: `POST /api/scenarios/{scenario_id}/run-report`

Runs the baseline + all saved what-ifs sequentially, collects final-frame metrics from each:

```python
@app.post("/api/scenarios/{scenario_id}/run-report")
async def run_scenario_report(scenario_id: str):
    # 1. Run baseline (no overrides) — extract last frame metrics
    # 2. Load all what-ifs from configs/whatif/{scenario_id}/*.json
    # 3. Run each what-if — extract last frame metrics
    # 4. Return { scenario_id, baseline: {...metrics}, whatifs: [{name, overrides, metrics, saved_at}] }
    # 5. Restore the active simulation to baseline after report generation
```

Helper: extract metrics from a simulation run without polluting the global state. Refactor `_precompute_simulation`
to optionally return metrics-only (last frame) without storing frames globally. Or: just run it, grab last frame
metrics, then re-run baseline at the end.

Simpler approach: add a `_run_simulation_metrics(scenario_id, overrides=None)` function that runs the sim engine
directly and returns only the final metrics dict (no frame storage). This avoids touching global state.

### Auto-naming for unnamed what-ifs

When loading what-if files, if `name` is empty or missing:
- Generate from overrides: take first 2 machine IDs with overrides → `"cnc_mill_1+press_fit (2026-05-16)"`
- Fallback: filename stem + `saved_at` date

## Frontend — New ScenarioReport component

`app/frontend/src/components/ScenarioReport/ScenarioReport.tsx`

A panel (same slot as ScenarioEditor / WhatIfSummary) showing:

1. Header: "Scenario Report — {scenario_name}"
2. Run Report button at top — triggers `POST /api/scenarios/{scenario_id}/run-report`
3. Loading state — "Running baseline..." then "Running CNC Aging (2/5)..." progress
4. Results table once complete:
   - Row per run (baseline highlighted, what-ifs below)
   - Columns: Name, Throughput, WIP, Completed, Utilization, Queue
   - Delta badges showing % change from baseline (green ↑ for throughput/completed improvements, red ↓ for degradations)
5. Re-run button to refresh

### UI visibility rules

Machine status is visible when the simulation is ready to start, while running, and while paused. When the report panel is displayed, hide the machine status overlay. Toggling back to the simulation view restores machine status visibility.

### App.tsx integration

Add a "Report" button integrated near the playbar (not in the header) — it's directly related to simulation runs. When clicked, shows the ScenarioReport panel and hides the machine status overlay.

## Files to Modify

| File | Change |
|------|--------|
| `app/backend/main.py` | Add `_run_simulation_metrics()` helper + `POST /api/scenarios/{id}/run-report` endpoint |
| `app/frontend/src/components/ScenarioReport/ScenarioReport.tsx` | New component — report table with baseline vs what-if comparison |
| `app/frontend/src/App.tsx` | Add "Report" button in header, wire up ScenarioReport panel |

## Verification

1. `uv run pytest tests/` — existing tests pass
2. Save 2+ what-ifs for a scenario
3. Click Report → Run Report → table shows baseline + what-ifs with metrics and deltas
4. What-ifs without names show auto-generated names
5. After report completes, the main simulation is still on baseline (not polluted)
