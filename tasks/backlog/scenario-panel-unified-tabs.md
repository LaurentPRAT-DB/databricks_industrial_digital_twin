# Scenario Panel UX — Unified Tabbed Side Panel

## Context

The header currently has 4 flat buttons (+ New, Library, What-If, Report) that all relate to the active scenario but show no hierarchy. Each toggles a separate panel with mutex logic. The goal is to consolidate these into a single right-side tabbed panel that makes the Scenario → What-If → Report relationship clear, and move "+ New Scenario" into the ScenarioPicker dropdown.

## Approach

Create a new ScenarioPanel component that contains two tabs (What-Ifs, Report). The What-Ifs tab merges the current WhatIfLibrary list with inline ScenarioEditor. The Report tab embeds ScenarioReport. The ScenarioPicker gets a "+ New Scenario" option that opens PlanBuilder.

The existing MachineStatus + EntityList right sidebar stays as-is but is hidden when the ScenarioPanel is open — the panel takes its slot.

---

## Implementation Steps

### 1. Update ScenarioPicker — add "+ New Scenario" option

**File:** `app/frontend/src/components/ScenarioPicker/ScenarioPicker.tsx`

- Add a new prop: `onNewScenario: () => void`
- In the dropdown, add a "+ New Scenario" button at the top of the list (before the scenario items)
- Styled with emerald/dashed border like the PlanBuilder trigger

### 2. Create ScenarioPanel container

**File:** `app/frontend/src/components/ScenarioPanel/ScenarioPanel.tsx` (new)

Props:
```ts
interface Props {
  scenarioId: string;
  scenarioName: string;
  sim: ReturnType<typeof useSimulationReplay>;
  onClose: () => void;
}
```

Structure:
- Panel header: scenario name + close button
- Tab bar: What-Ifs | Report (two tabs, styled like segmented control)
- Tab content area renders either WhatIfTab or ReportTab
- Width: w-[480px] (same as current Report/PlanBuilder)

### 3. Create WhatIfTab — library + editor + run controls

**File:** `app/frontend/src/components/ScenarioPanel/WhatIfTab.tsx` (new)

This merges WhatIfLibrary list + ScenarioEditor + run controls into one vertical flow:

- **Top section:** List of saved what-ifs with checkboxes for batch selection
  - Each item has: checkbox (for run selection) + name + click to edit
  - Active/editing what-if highlighted
  - "+ New What-If" button at top of list
  - Select All / Deselect All links
- **Middle section:** Editor (inline, appears when creating/editing a what-if)
  - Reuse ScenarioEditor's slider UI, presets, save logic
  - "Back to list" link to collapse editor
  - When a what-if is actively running: show WhatIfSummary-style compact view with Edit button
- **Bottom section:** Run button (sticky footer)
  - All what-ifs checked → **"Run All"** (runs nominal + all what-ifs, generates report)
  - Some checked → **"Run Selected (N)"** (runs nominal + N selected what-ifs)
  - None checked or no what-ifs exist → **"Run Nominal"** (runs scenario with default parameters only)
  - Running triggers simulation for each selected what-if + nominal, saves report, then switches to Report tab

### 4. Create ReportTab — saved reports browser

**File:** `app/frontend/src/components/ScenarioPanel/ReportTab.tsx` (new)

The Report tab lists previously generated reports and displays their content. It does NOT trigger runs — that's the What-If tab's job.

**Layout (top to bottom):**

1. **Report List** — chronological list of saved reports for this scenario
   - Each item shows: timestamp + scenario name + what-ifs included count
   - Click to expand/view
   - Delete button per report
   - Empty state: "No reports yet. Go to What-Ifs tab and run a simulation."

2. **Report Detail** — rendered when a report is selected
   - **Header section:**
     - Scenario name + run timestamp
     - What-ifs included (list of names)
     - Per what-if: parameters that differ from nominal (e.g., "CNC Mill: cycle_time_factor=1.5, failure_probability=0.1")
   - **KPI Comparison Table:**
     - Rows: each KPI (throughput, avg cycle time, utilization per machine, queue depths, etc.)
     - Columns: Nominal | What-If 1 | What-If 2 | ... 
     - Delta indicators: green/red arrows showing % change vs nominal
   - **Summary:** overall impact narrative (optional, can be added later)

**Report data model (saved to disk):**
```ts
interface SavedReport {
  id: string;
  scenario_id: string;
  scenario_name: string;
  timestamp: string;
  runs: Array<{
    name: string;          // "Nominal" or what-if name
    overrides: Record<string, DeviationParams>;  // empty for nominal
    kpis: Record<string, number>;
  }>;
}
```

**Backend support:**
- `POST /api/scenarios/run-batch` — accepts `{ scenario_id, whatif_names: string[] }`, runs nominal + each what-if, computes KPIs for each, saves report to `reports/{scenario_id}/{timestamp}.json`, returns the report
- `GET /api/scenarios/{scenario_id}/reports` — lists saved reports
- `GET /api/scenarios/{scenario_id}/reports/{report_id}` — returns full report detail
- `DELETE /api/scenarios/{scenario_id}/reports/{report_id}` — removes a saved report

**Report header detail — per what-if parameter diff:**
For each what-if in the report, show only the parameters that differ from nominal defaults:
```
CNC Aging:
  - cnc_mill: cycle_time_factor=1.3, degradation_rate=2.0, failure_probability=0.03
  - press_fit: quality_defect_rate=0.1

Worst Case:
  - All machines: failure_probability=0.15, cycle_time_factor=2.0
```

### 5. Refactor App.tsx

**File:** `app/frontend/src/App.tsx`

Changes:
- Remove state: `showEditor`, `showLibrary`, `showReport`, `editorInitialWhatIf`
- Add state: `showPanel: boolean` (panel open/close), `showPlanBuilder: boolean` (kept separate since it's a creation flow)
- Remove header buttons: Library, What-If, Report, + New
- Keep: 2D/3D toggle, ScenarioPicker (with new `onNewScenario` prop)
- Add: Panel toggle button (simple icon/chevron)
- Right sidebar logic:
  - If `showPanel && sim.scenarioId` → render `<ScenarioPanel />`
  - Else → render default sidebar (MachineStatus + EntityList)
  - If `showPlanBuilder` → render `<PlanBuilder />` (overlays, same as current)
- `handleScenarioLoad`: set `showPanel = true` after load (auto-open)

### 6. Machine status visibility

- Panel closed (default sidebar visible) → MachineStatus always shown
- Panel open, What-Ifs tab → MachineStatus hidden (panel replaces sidebar)
- Panel open, Report tab → MachineStatus hidden (panel replaces sidebar)

This is naturally handled by the either/or logic: panel open = no sidebar, panel closed = sidebar.

---

## Files Summary

| File | Action |
|------|--------|
| `app/frontend/src/components/ScenarioPanel/ScenarioPanel.tsx` | Create — tabbed container |
| `app/frontend/src/components/ScenarioPanel/WhatIfTab.tsx` | Create — merged library + editor |
| `app/frontend/src/components/ScenarioPanel/ReportTab.tsx` | Create — wraps report content |
| `app/frontend/src/components/ScenarioPicker/ScenarioPicker.tsx` | Modify — add "+ New Scenario" |
| `app/frontend/src/App.tsx` | Modify — simplify header, wire ScenarioPanel |
| `app/frontend/src/components/ScenarioReport/ScenarioReport.tsx` | Modify — export inner content for embedding (remove outer shell/header) |
| `app/frontend/src/components/WhatIfLibrary/WhatIfLibrary.tsx` | Can be deleted after migration (or kept if referenced) |
| `app/frontend/src/components/ScenarioEditor/ScenarioEditor.tsx` | Keep as-is, import into WhatIfTab |
| `app/frontend/src/components/ScenarioEditor/WhatIfSummary.tsx` | Keep as-is, import into WhatIfTab for active state |

---

## Verification

1. `npm run dev` — app loads, no console errors
2. ScenarioPicker dropdown shows "+ New Scenario" at top → clicking opens PlanBuilder
3. Loading a scenario auto-opens the panel on What-Ifs tab
4. What-Ifs tab shows list of saved what-ifs with checkboxes, clicking one opens editor inline
5. "+ New What-If" in the tab opens blank editor
6. Check all what-ifs → "Run All" button → runs nominal + all what-ifs → auto-switches to Report tab
7. Deselect 2 what-ifs → button changes to "Run Selected (N)" → runs only selected subset
8. Deselect all → "Run Nominal" → runs scenario with default params only
9. No saved what-ifs → "Run Nominal" shown directly (no checkbox list)
10. Report tab lists previously saved reports with timestamps
11. Click a report → header shows scenario name, included what-ifs, per what-if parameter diffs from nominal
12. Report body shows KPI comparison table: Nominal vs each what-if with delta indicators
13. Delete a report → removed from list
14. Closing panel restores the default sidebar with MachineStatus + EntityList
15. Panel toggle button collapses/expands the panel
16. MachineStatus is visible when panel is closed and sim is ready/running/paused
