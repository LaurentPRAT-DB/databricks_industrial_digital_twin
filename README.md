# Industrial Digital Twin

A configurable state-machine simulation engine that models any industrial plant or process line. Define your facility layout, machines, process steps, and scheduling in YAML — the engine handles entity spawning, routing, resource contention, and real-time KPI computation. A React dashboard visualizes the live simulation over WebSocket.

Designed for deployment as a **Databricks App** with **Lakebase** (PostgreSQL) for live simulation state and **Lakehouse** (Delta Lake) for historical telemetry, analytics, and ML model training.

---

## Architecture

```
┌─────────────┐     ┌──────────────────────────────┐     ┌─────────────────────┐
│  YAML Config │────►│      Simulation Engine        │────►│  WebSocket Server   │
│  (scenarios) │     │  tick loop · state machine    │     │  (FastAPI + uvicorn)│
└─────────────┘     │  spatial routing · resources  │     └────────┬────────────┘
                    └──────────────┬───────────────┘              │
                                   │                              ▼
                                   ▼                     ┌─────────────────┐
                    ┌──────────────────────────┐         │  React Dashboard │
                    │        Recorder           │         │  (Vite + Tailwind)│
                    │  transitions · positions  │         └─────────────────┘
                    └──────────────┬───────────┘
                                   │
                    ┌──────────────▼───────────┐
                    │   Lakebase (PostgreSQL)   │
                    │   live simulation state   │
                    └──────────────┬───────────┘
                                   │ sync
                    ┌──────────────▼───────────┐
                    │   Lakehouse (Delta Lake)  │
                    │   historical telemetry    │
                    └──────────────┬───────────┘
                                   │
                    ┌──────────────▼───────────┐
                    │   ML Training (MLflow)    │
                    │   predictive maintenance  │
                    │   bottleneck detection    │
                    └──────────────────────────┘
```

---

## Dashboard Views

The React dashboard provides two synchronized visualization modes, toggled via the header button:

### 2D Floor Plan (SVG)

![2D View](docs/screenshots/2d-view.png)

Top-down schematic view with color-coded machines, conveyor paths, and animated entity dots. Shows queue depths, machine busy/idle state, and process flow at a glance.

### 3D Factory View (React Three Fiber)

![3D View](docs/screenshots/3d-view.png)

Interactive 3D perspective with orbit camera controls (drag to rotate, scroll to zoom). Machines render as colored boxes with emissive glow when busy. Entities animate as spheres moving along conveyor paths. Labels float above each station.

Both views share the same WebSocket data feed and stay perfectly in sync when switching.

---

### Engine Modules

| Module | Purpose |
|--------|---------|
| `src/engine/config.py` | Pydantic v2 models — full YAML schema validation |
| `src/engine/loader.py` | YAML parser with flattening and validation |
| `src/engine/engine.py` | Main tick loop, entity lifecycle, state transitions |
| `src/engine/models.py` | Core data classes: `EntityState`, `ResourceState`, `Position` |
| `src/engine/state_graph.py` | FSM executor + condition evaluator (and/or/threshold/duration) |
| `src/engine/spatial.py` | Dijkstra routing on facility graph + position interpolation |
| `src/engine/resource_manager.py` | Machine occupancy, queue management, utilization accounting |
| `src/engine/scheduler.py` | Poisson arrivals with shift-based rate modifiers |
| `src/engine/recorder.py` | Event collection: state transitions, position snapshots, events |

---

## How It Works

### Facility Model
A plant is defined as a 2D coordinate grid with **locations** (machines, buffers, spawn/exit points) connected by **directed paths** with distances. The spatial engine builds a graph and uses Dijkstra's algorithm to route entities between stations.

### State Machine
Each entity type references a **state graph** — a declarative finite state machine with:
- **States**: `queued` (waiting in buffer), `moving` (traversing path), `stationary` (being processed), `terminal` (complete)
- **Transitions**: condition-based rules evaluated per tick (resource availability, property thresholds, duration elapsed, boolean combinators)
- **Actions**: on-enter/on-exit hooks (acquire/release resources, emit events, set properties)

### Entity Lifecycle
```
Spawn (Poisson) → Route to first station → Wait/Process → Route to next → ... → Exit (destroy)
```

Entities carry typed properties (product variant, station index) that influence routing and transition conditions.

### Resource Contention
Machines have finite capacity. When busy, arriving entities queue in upstream buffers. The resource manager tracks per-machine busy time for utilization metrics.

---

## Bundled Scenarios

| Scenario | Config File | Process Flow | Stations | Rate |
|----------|-------------|--------------|----------|------|
| **Smartphone Chassis Line** | `assembly_line_3station.yaml` | CNC Milling → Press-Fit Assembly → CMM Inspection | 4 machines (2 parallel CNC) | 20/hr |
| **EV Battery Pack Assembly** | `ev_battery_pack.yaml` | Cell Stacking → Laser Welding → EOL Testing | 4 machines (2 parallel stackers) | 24/hr |

Each scenario defines its own spatial layout, process durations, failure rates (MTBF), and shift schedules.

---

## KPIs & Metrics

### Real-Time Dashboard Metrics

| Metric | Description | Unit |
|--------|-------------|------|
| `throughput_per_hour` | Completed products per simulated hour | units/hr |
| `wip_count` | Active entities currently in the system | count |
| `completed` | Total products that reached terminal state | count |
| `avg_utilization_pct` | Mean machine busy percentage across all stations | % |
| `total_queue_depth` | Sum of entities waiting across all buffers | count |
| `elapsed_hours` | Simulated time elapsed since start | hours |

### Per-Station Metrics

| Metric | Source | Description |
|--------|--------|-------------|
| Cycle Time | Config `cycle_time_mean` | Average processing duration per unit |
| MTBF | Config `mtbf_hours` | Mean time between failures |
| Utilization | `total_busy_time / elapsed_time` | Percentage of time the machine was occupied |
| Queue Depth | Resource manager | Current entities waiting for this station |
| Bottleneck | Derived (max cycle time) | Station limiting overall throughput |

### Historical Analytics (Lakehouse)

| Analysis | Data Source | Outcome |
|----------|-------------|---------|
| Throughput trends | State transitions → `done` | Production rate over time by shift/scenario |
| Cycle time distribution | Stationary state durations | Process stability and drift detection |
| Queue buildup patterns | Resource snapshots | Identify capacity constraints |
| Failure correlation | Event records (MTBF events) | Predictive maintenance scheduling |

---

## Databricks Platform Integration

### Lakebase (PostgreSQL)

Live simulation state for low-latency dashboard queries:

```sql
-- Entity positions (updated every tick)
CREATE TABLE sim_entities (
    entity_id       TEXT PRIMARY KEY,
    entity_type     TEXT,
    state           TEXT,
    x               FLOAT,
    y               FLOAT,
    current_location TEXT,
    properties      JSONB,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Resource/machine status
CREATE TABLE sim_resources (
    resource_id     TEXT PRIMARY KEY,
    type            TEXT,
    status          TEXT,
    occupants       TEXT[],
    queue_depth     INT,
    total_busy_time FLOAT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Live metrics
CREATE TABLE sim_metrics (
    scenario_id         TEXT,
    throughput_per_hour FLOAT,
    wip_count           INT,
    avg_utilization_pct FLOAT,
    captured_at         TIMESTAMPTZ DEFAULT NOW()
);
```

The application writes to Lakebase on every broadcast tick (~1s), giving the dashboard sub-second query latency.

### Lakehouse (Delta Lake)

Historical telemetry archived for long-term analytics and ML:

| Table | Partition | Content |
|-------|-----------|---------|
| `telemetry.position_snapshots` | `scenario / run_id / date` | Entity position + state every N seconds |
| `telemetry.state_transitions` | `scenario / run_id / date` | Every state change with timestamps |
| `telemetry.events` | `scenario / run_id / event_type` | Machine events (start, complete, failure) |
| `telemetry.resource_utilization` | `scenario / run_id / date` | Per-machine busy/idle time series |

Data flows from Lakebase → Delta via **reverse ETL sync** (Databricks Lakebase Sync) or direct writes from the recorder module.

### ML & Model Training

| Use Case | Features | Target | Approach |
|----------|----------|--------|----------|
| **Bottleneck Prediction** | Queue depths, utilization rates, entity counts | Which station will block next | Classification (XGBoost) |
| **Predictive Maintenance** | Cumulative busy time, cycle count, MTBF history | Time to next failure | Survival analysis |
| **Cycle Time Optimization** | Product variant, shift, temperature proxy | Optimal process parameters | Bayesian optimization |
| **Anomaly Detection** | Rolling throughput, queue variance | Operational anomalies | Isolation Forest |

All models registered in **MLflow**, features served via **Feature Store**, inference endpoints via **Model Serving**.

---

## Developer Guide

### Prerequisites

- Python >= 3.10
- Node.js >= 18
- [uv](https://docs.astral.sh/uv/) package manager

### Installation

```bash
# Clone and install Python dependencies
cd databricks_industrial_digital_twin
uv sync

# Install frontend dependencies
cd app/frontend
npm install
cd ../..
```

### Local Development

```bash
# One command — starts backend (:8000) + frontend (:3000)
./dev.sh
```

Or manually:

```bash
# Terminal 1 — Backend (auto-reload on code changes)
uv run uvicorn app.backend.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend (Vite dev server with HMR)
cd app/frontend && npm run dev
```

Open http://localhost:3000 — the Vite dev server proxies `/api` and `/ws` to the backend.

### Running Tests

```bash
uv run pytest tests/
```

23 tests covering: engine lifecycle, config loading, spatial routing, state graph evaluation.

### Building for Production

```bash
cd app/frontend && npm run build
```

Static assets are output to `app/frontend/dist/`. The FastAPI backend serves them automatically when the `dist/` directory exists.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SIM_CONFIG` | `assembly_line_3station` | Default scenario to load on startup |
| `SIM_CONFIGS_DIR` | `configs` | Directory containing YAML scenario files |
| `SIM_SPEED` | `60` | Simulation speed multiplier (60 = 1 sim-minute per real-second) |

---

## Databricks App Deployment

### app.yaml

```yaml
command:
  - uvicorn
  - app.backend.main:app
  - --host=0.0.0.0
  - --port=8000

env:
  - name: SIM_CONFIG
    value: assembly_line_3station
  - name: SIM_SPEED
    value: "60"
  - name: SIM_CONFIGS_DIR
    value: configs
  - name: LAKEBASE_HOST
    value: "${resources.lakebase.host}"
  - name: LAKEBASE_PASSWORD
    valueFrom: secret/lakebase-token

resources:
  - name: lakebase
    type: lakebase-instance
```

### Deploy Steps

```bash
# 1. Build frontend
cd app/frontend && npm run build && cd ../..

# 2. Upload to workspace volume
databricks fs cp -r . /Volumes/catalog/schema/raw_data/digital-twin-app/

# 3. Create/deploy the app
databricks apps create --name industrial-digital-twin \
  --source-code-path /Volumes/catalog/schema/raw_data/digital-twin-app
```

### Lakebase Setup

```bash
# Create a provisioned PostgreSQL instance
databricks lakebase create --name digital-twin-db --capacity CU_1

# Generate OAuth token for app connection
databricks lakebase generate-credential --instance digital-twin-db
```

The application uses the Lakebase connection to persist live entity state and metrics for sub-second dashboard queries.

### Lakehouse Setup

```sql
-- Create Unity Catalog objects
CREATE CATALOG IF NOT EXISTS digital_twin;
CREATE SCHEMA IF NOT EXISTS digital_twin.telemetry;

-- Historical tables (populated by DLT pipeline or direct recorder writes)
CREATE TABLE digital_twin.telemetry.state_transitions (
    scenario_id     STRING,
    run_id          STRING,
    sim_time        TIMESTAMP,
    entity_id       STRING,
    from_state      STRING,
    to_state        STRING,
    location        STRING
) USING DELTA
PARTITIONED BY (scenario_id, run_id);

CREATE TABLE digital_twin.telemetry.position_snapshots (
    scenario_id     STRING,
    run_id          STRING,
    sim_time        TIMESTAMP,
    entity_id       STRING,
    x               DOUBLE,
    y               DOUBLE,
    state           STRING
) USING DELTA
PARTITIONED BY (scenario_id, run_id);
```

### Monitoring

- App logs: `databricks apps get --name industrial-digital-twin --include-logs`
- Simulation status: `GET /api/status`
- WebSocket health: connection indicator in dashboard header

---

## Creating Custom Scenarios

Create a new YAML file in `configs/`:

```yaml
simulation:
  name: "My Custom Plant"
  description: "Step A → Step B → Step C"
  duration_hours: 8
  time_step_seconds: 1
  seed: 42

facility:
  name: "Plant Name"
  coordinate_system: cartesian_2d
  bounds: { width: 100, height: 50, unit: meters }

  locations:
    - id: intake
      type: spawn_point
      label: "Intake"
      position: { x: 10, y: 25 }

    - id: machine_1
      type: machine
      label: "Machine 1"
      position: { x: 50, y: 25 }
      capacity: 1
      properties: { cycle_time_mean: 120, mtbf_hours: 500 }

    - id: output
      type: exit_point
      label: "Output"
      position: { x: 90, y: 25 }

  paths:
    - from: intake
      to: machine_1
      distance: 40
    - from: machine_1
      to: output
      distance: 40

state_graphs:
  product_flow:
    states:
      waiting:
        type: queued
        queue_discipline: FIFO
      in_transit:
        type: moving
        speed:
          distribution: constant
          params: { value: 1.5 }
      processing:
        type: stationary
        duration:
          distribution: normal
          params: { mean: 120, std: 15 }
        on_enter:
          - action: acquire_resource
            resource_type: machine
        on_exit:
          - action: release_resource
            resource_type: machine
      done:
        type: terminal
        on_enter:
          - action: destroy_entity

    transitions:
      - from: in_transit
        to: processing
        condition:
          type: arrived_at_destination
        priority: 1
      - from: processing
        to: in_transit
        condition:
          type: duration_elapsed
        priority: 1
        next_location: { type: next_in_sequence }

entity_types:
  product:
    state_graph: product_flow
    initial_state: waiting
    spawn_rule: schedule

schedule:
  type: poisson
  rate_per_hour: 20
```

The scenario appears automatically in the dashboard's scenario picker.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/scenarios` | List available scenario configs with active flag |
| `POST` | `/api/scenarios/load` | Switch active scenario `{"id": "config_name"}` |
| `GET` | `/api/config` | Current simulation name, description, facility |
| `GET` | `/api/status` | Simulation runtime status and elapsed time |
| `GET` | `/api/entities` | Snapshot of all active entities |
| `GET` | `/api/resources` | Current machine/buffer states |
| `GET` | `/api/metrics` | Real-time KPI metrics |
| `WS` | `/ws/entities` | Real-time stream: initial state + delta updates every ~1s |

### WebSocket Protocol

**Initial message** (on connect):
```json
{"type": "initial", "data": {"entities": [...], "resources": [...], "metrics": {...}, "config": {...}, "paths": [...], "locations": [...], "state_descriptions": {...}}}
```

**Delta updates** (every tick):
```json
{"type": "entity_delta", "data": {"deltas": [...], "removed": [...], "metrics": {...}, "resources": [...]}}
```

---

## License

MIT
