# Scenario Panel UX — Unified Tabbed Side Panel

## Context

Currently the header has flat, competing buttons: `+ New` | `Library` | `What-If` | `Report` | `ScenarioPicker`.
These are all scenario operations but the parent-child relationship is invisible. The user must mentally map
which buttons relate to what.

The natural hierarchy is: **Scenario → What-If → Report**. Library is just saved what-ifs for a scenario.
All three should be grouped in a single panel that reflects this relationship.

## Design

Replace the 4 header buttons (Library, What-If, + New, Report) with a single collapsible right panel that
auto-opens when a scenario is loaded.

### Panel structure

```
┌─────────────────────────────────┐
│  Scenario: CNC Production Line  │  ← panel header (scenario name)
├────────┬──────────┐             │
│ What-Ifs│  Report  │             │  ← two tabs
├────────┴──────────┴─────────────┤
│                                 │
│  [tab content here]             │
│                                 │
└─────────────────────────────────┘
```

### Tab 1: What-Ifs (default)

Merges the current Library + What-If Editor into a single flow:

1. **List view** (was Library) — shows all saved what-ifs for the active scenario
   - Each item: name, override summary, saved date
   - Click → loads that what-if into the editor below (inline)
   - Active what-if highlighted
2. **"+ New What-If" button** at top of list — opens editor with blank overrides
3. **Editor** (was ScenarioEditor) — appears below the list when creating/editing
   - Machine override sliders
   - Save / Apply / Delete actions
   - Collapse back to list-only when not editing

Flow: list is always visible at the top → editor expands below when active.

### Tab 2: Report

The ScenarioReport component (baseline vs what-if comparison table).
- "Run Report" button triggers batch execution
- Results table with delta badges
- Machine status hidden while this tab is active (per scenario-results-report.md)

### Header simplification

Before (header buttons):
```
[2D/3D] [+ New] [Library] [What-If] [Report] [ScenarioPicker]
```

After:
```
[2D/3D] [ScenarioPicker ▾] [▶ panel toggle]
```

- `ScenarioPicker` — dropdown that includes a "+ New Scenario" option at the top (opens PlanBuilder). Loading a scenario auto-opens the panel on the What-Ifs tab.
- Panel toggle — collapse/expand the right panel (keyboard shortcut: `]`)

The `+ New` button moves inside the ScenarioPicker since creating a scenario is the same domain as selecting one.

### Auto-open behavior

- On scenario load: panel opens on **What-Ifs** tab
  - If the scenario has saved what-ifs → show the list
  - If no what-ifs exist → show empty state with "+ Create your first What-If" CTA
- Panel can be manually collapsed; state persists during session

### Machine status visibility

- **What-Ifs tab active + simulation ready/running/paused** → machine status visible
- **Report tab active** → machine status hidden
- **Panel collapsed** → machine status follows simulation state (visible if running/ready/paused)

## Files to Modify

| File | Change |
|------|--------|
| `app/frontend/src/App.tsx` | Remove Library/What-If/Report buttons from header. Add panel toggle. Wire up tabbed panel. |
| `app/frontend/src/components/ScenarioPanel/ScenarioPanel.tsx` | **New** — tabbed container with What-Ifs and Report tabs |
| `app/frontend/src/components/ScenarioPanel/WhatIfTab.tsx` | **New** — merges WhatIfLibrary list + ScenarioEditor into single tabbed view |
| `app/frontend/src/components/ScenarioPanel/ReportTab.tsx` | **New** — wraps ScenarioReport for panel context |
| `app/frontend/src/components/WhatIfLibrary/WhatIfLibrary.tsx` | Refactor into list-only component (reused inside WhatIfTab) |
| `app/frontend/src/components/ScenarioEditor/ScenarioEditor.tsx` | Refactor to work inline within WhatIfTab (no standalone panel mode) |
| `app/frontend/src/components/ScenarioReport/ScenarioReport.tsx` | Minor: adapt to panel width constraints |

## Verification

1. Load a scenario → panel auto-opens on What-Ifs tab showing saved what-ifs
2. Click a what-if → editor expands inline below the list
3. Click "+ New What-If" → blank editor appears
4. Switch to Report tab → machine status disappears, report UI shown
5. Collapse panel → simulation view reclaims full width
6. Header is clean: only New Scenario, ScenarioPicker, and panel toggle remain
7. No regression in simulation playback or PlanBuilder
