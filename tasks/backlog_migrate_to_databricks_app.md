# Migrate Industrial Digital Twin to Databricks App with Lakebase

## Context

The local application (FastAPI + Vite/React) needs to become a Databricks App deployed to
https://fevm-serverless-stable-3n0ihb.cloud.databricks.com/. The persistence layer migrates from local JSON files to Lakebase
(PostgreSQL autoscale) for what-ifs, reports, and simulation ticks. Static scenario configs live in a UC Volume. A build number
and Lakebase health indicator are added to the UI.

## Architecture Decisions

- Lakebase: New autoscale project industrial-digital-twin with a production branch
- UC Catalog/Schema: serverless_stable_3n0ihb_catalog.industrial_digital_twin
- UC Volume: serverless_stable_3n0ihb_catalog.industrial_digital_twin.raw_data — holds YAML configs
- App name: industrial-digital-twin
- Reports: stored as JSONB in Lakebase reports table; markdown artifacts in UC Volume
- Frontend build: built locally, dist included in workspace upload

## Database Schema (Lakebase PostgreSQL)

```sql
CREATE TABLE scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    config_yaml TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE whatifs (
    id SERIAL PRIMARY KEY,
    scenario_id TEXT NOT NULL REFERENCES scenarios(id),
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    overrides JSONB NOT NULL DEFAULT '{}',
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(scenario_id, slug)
);

CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    scenario_id TEXT NOT NULL REFERENCES scenarios(id),
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    report JSONB NOT NULL,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(scenario_id, slug)
);

CREATE TABLE simulation_ticks (
    id BIGSERIAL PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    whatif_name TEXT,
    tick_index INT NOT NULL,
    sim_time TEXT NOT NULL,
    elapsed_s FLOAT NOT NULL,
    entities JSONB NOT NULL,
    resources JSONB NOT NULL,
    metrics JSONB NOT NULL,
    computed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ticks_scenario ON simulation_ticks(scenario_id, whatif_name, tick_index);
```

## Phase 1: Infrastructure Setup (MCP tools)

| #   | Task                                                                      |
|-----|---------------------------------------------------------------------------|
| 1.1 | Create UC schema industrial_digital_twin in serverless_stable_3n0ihb_catalog |
| 1.2 | Create UC managed volume raw_data                                         |
| 1.3 | Upload configs/*.yaml to /Volumes/.../raw_data/configs/                   |
| 1.4 | Create Lakebase autoscale project industrial-digital-twin                 |
| 1.5 | Create production branch with endpoint                                    |
| 1.6 | Connect to Lakebase and run DDL to create tables                          |
| 1.7 | Run script to populate scenarios table from YAML configs                  |

## Phase 2: Backend — New Lakebase Service

New: `app/backend/services/__init__.py` (empty)

New: `app/backend/services/lakebase_service.py`

Adapted from airport-twin pattern
(`/Users/laurent.prat/Documents/lpdev/databricks_airport_digital_twin/app/backend/services/lakebase_service.py`):
- LakebaseService class with psycopg2 ThreadedConnectionPool
- OAuth via `databricks.sdk.WorkspaceClient().postgres.generate_database_credential()`
- Token caching with 45min refresh
- Connection pool: min=2, max=10, sslmode=require
- Methods:
  - `health_check() -> dict` — returns {connected, latency_ms, host}
  - `ensure_tables()` — idempotent DDL
  - `list_scenarios() -> list[dict]`
  - `get_scenario_config(id) -> str | None` — returns raw YAML
  - `save_whatif(scenario_id, slug, name, overrides) -> bool`
  - `list_whatifs(scenario_id) -> list[dict]`
  - `load_whatif(scenario_id, slug) -> dict | None`
  - `save_report(scenario_id, slug, name, report) -> bool`
  - `list_reports(scenario_id) -> list[dict]`
  - `load_report(scenario_id, slug) -> dict | None`
  - `check_report_exists(scenario_id, slug) -> bool`
  - `save_simulation_ticks(scenario_id, whatif_name, frames) -> int`
  - `get_simulation_ticks(scenario_id, whatif_name) -> list[dict]`
- `get_lakebase_service()` singleton factory
- Env vars: LAKEBASE_HOST, LAKEBASE_PORT, LAKEBASE_DATABASE, LAKEBASE_SCHEMA, LAKEBASE_ENDPOINT_NAME, LAKEBASE_USE_OAUTH

## Phase 3: Backend — Modify app/backend/main.py

- Add BUILD_NUMBER file loading at module level (same pattern as airport twin)
- Add `GET /health` — returns {status, lakebase: {connected, latency_ms}, build_number}
- Add `GET /api/version` — returns {build_number, git_commit}
- Detect Lakebase mode: `USE_LAKEBASE = bool(os.getenv("LAKEBASE_HOST"))`
- When USE_LAKEBASE:
  - CONFIGS_DIR reads from UC Volume path (env SIM_CONFIGS_DIR)
  - What-if save/list/load → delegate to LakebaseService
  - Report save/list/load/check → delegate to LakebaseService
  - After `_precompute_simulation()` → store frames in simulation_ticks
  - On `GET /api/simulation/frames` → read from simulation_ticks if not in memory
- When NOT USE_LAKEBASE (local dev): keep existing file-based logic unchanged
- All existing tests continue to pass (they don't set LAKEBASE_HOST)

## Phase 4: Frontend Changes

Modify: `app/frontend/src/App.tsx`
- Import and render `<StatusBar />` in footer area

New: `app/frontend/src/components/StatusBar/StatusBar.tsx`
- On mount, fetch `GET /health`
- Every 30s, refresh health
- Displays: Build #XXX | green/red dot + "Lakebase" label
- Positioned bottom-left of the screen, subtle styling

## Phase 5: Deployment Config

New: `app.yaml` (project root)

```yaml
command:
  - "uvicorn"
  - "app.backend.main:app"
  - "--host"
  - "0.0.0.0"
  - "--port"
  - "8000"
  - "--log-level"
  - "info"
env:
  - name: LAKEBASE_HOST
    value: "<from-branch-endpoint>"
  - name: LAKEBASE_PORT
    value: "5432"
  - name: LAKEBASE_DATABASE
    value: "databricks_postgres"
  - name: LAKEBASE_SCHEMA
    value: "public"
  - name: LAKEBASE_ENDPOINT_NAME
    value: "projects/industrial-digital-twin/branches/production/endpoints/primary"
  - name: LAKEBASE_USE_OAUTH
    value: "true"
  - name: SIM_CONFIGS_DIR
    value: "/Volumes/serverless_stable_3n0ihb_catalog/industrial_digital_twin/raw_data/configs"
```

New: `requirements.txt` (project root)

```
fastapi==0.115.0
uvicorn==0.32.0
websockets==12.0
pydantic==2.10.0
pyyaml==6.0.2
httpx==0.28.0
psycopg2-binary==2.9.11
databricks-sdk==0.102.0
python-dotenv==1.2.2
```

New: `BUILD_NUMBER` — starts at 1

## Phase 6: Build, Upload & Deploy

1. Build frontend: `cd app/frontend && npm run build`
2. Upload project to workspace: `/Workspace/Users/laurent.prat@databricks.com/industrial-digital-twin`
3. Create app via manage_app with source_code_path
4. Verify deployment succeeds

## Phase 7: Data Loading

New: `scripts/load_configs_to_lakebase.py`
- Connect to Lakebase
- Read YAML files from configs/ (or UC Volume)
- Upsert into scenarios table
- Run via execute_code serverless

## Files Summary

| File                                                | Action                                              |
|-----------------------------------------------------|-----------------------------------------------------|
| app.yaml                                            | CREATE                                              |
| requirements.txt                                    | CREATE                                              |
| BUILD_NUMBER                                        | CREATE                                              |
| app/backend/services/__init__.py                    | CREATE                                              |
| app/backend/services/lakebase_service.py            | CREATE                                              |
| app/backend/main.py                                 | MODIFY                                              |
| pyproject.toml                                      | MODIFY (add psycopg2-binary, databricks-sdk, python-dotenv) |
| app/frontend/src/components/StatusBar/StatusBar.tsx | CREATE                                              |
| app/frontend/src/App.tsx                            | MODIFY (add StatusBar)                              |
| scripts/load_configs_to_lakebase.py                 | CREATE                                              |

## Verification

1. `uv run pytest tests/` — all 77 existing tests pass (file-based fallback)
2. `cd app/frontend && npx tsc --noEmit && npm run build` — clean
3. Lakebase tables created with data
4. App deployed at https://industrial-digital-twin-*.aws.databricksapps.com
5. UI shows build number + green Lakebase dot
6. Simulation replay works E2E through Lakebase-stored ticks
7. What-if and report CRUD persists to Lakebase
