# Named What-If Scenarios

## Context

The What-If editor currently runs anonymous simulations — you tweak sliders and hit "Run" but there's no indication in the dashboard that you're viewing a what-if run vs. the nominal scenario. The user wants:

1. Each what-if configuration can be saved with a name (e.g., "CNC Aging", "Worst Case")
2. When running, the header clearly shows the what-if name so it's obvious this is a deviation run
3. Future: batch jobs for multiple what-if scenarios (out of scope now, but the named-scenario model prepares for it)

## Changes

### 1. `app/backend/main.py` — Store and return what-if name

- Add `_active_whatif_name: str | None = None` global alongside `_active_scenario_id`
- `POST /api/scenarios/simulate` accepts new optional `name` field → stored in `_active_whatif_name`
- `_static_config` gets a `whatif_name` field (null when nominal)
- `POST /api/scenarios/load` (nominal load) resets `_active_whatif_name = None`
- Frames response (`GET /api/simulation/frames`) includes `whatif_name`

### 2. `app/frontend/src/types/entity.ts`

- Add `whatif_name: string | null` to `SimulationFrameData`

### 3. `app/frontend/src/hooks/useSimulationReplay.ts`

- Derive `whatifName: string | null` from `frameData.whatif_name`
- Expose in return object

### 4. `app/frontend/src/components/ScenarioEditor/ScenarioEditor.tsx`

- Add name text input at top of editor panel (below "What-If Editor" header)
- Placeholder: "Name this scenario..."
- `runSimulation()` sends `name` field in POST body
- `onSimulate` callback now also passes the name up to App

### 5. `app/frontend/src/App.tsx` — Header shows active what-if name

- Track `whatifName` from `sim.whatifName`
- When `whatifName` is set, show an amber badge/label in the header next to the scenario name: "▶ CNC Aging" (or whatever the user typed)
- Clicking the badge or switching scenarios clears it
- Loading screen shows "Computing: {name}..." when a what-if run is in progress

---

## Files to Modify

| File | Change |
|------|--------|
| `app/backend/main.py` | Add `_active_whatif_name`, accept `name` in simulate, include in frames response, reset on nominal load |
| `app/frontend/src/types/entity.ts` | Add `whatif_name` to `SimulationFrameData` |
| `app/frontend/src/hooks/useSimulationReplay.ts` | Expose `whatifName` |
| `app/frontend/src/components/ScenarioEditor/ScenarioEditor.tsx` | Add name input, send name in POST |
| `app/frontend/src/App.tsx` | Display what-if name badge in header, show name during loading |

---

## Verification

1. `uv run pytest tests/` — 23 tests still pass
2. Load nominal scenario → no what-if badge in header
3. Open editor, type "CNC Aging", set some deviations, click Run → header shows amber badge "CNC Aging"
4. Switch scenario via ScenarioPicker → badge disappears (back to nominal)
5. Run unnamed what-if (empty name) → badge shows "What-If" as fallback
