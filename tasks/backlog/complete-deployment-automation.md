# Complete Deployment Automation

## Context

The Industrial Digital Twin app needs a single-command deployment that works against any Databricks workspace. Currently the project has DABs config (databricks.yml, resources/app.yml) and a working Lakebase service, but lacks the orchestration scripts to go from zero to running app on a new workspace. The airport twin sister project (databricks_airport_digital_twin) has a proven pattern: deploy.sh + scripts/setup_lakebase_autoscaling.py + scripts/grant_sp_permissions.sh + scripts/health_check.py.

**Goal: `./deploy.sh` produces a fully running app with Lakebase, grants, and verified health — no manual steps.**

## What Already Exists

- `databricks.yml` — DABs bundle with sync rules, variables (lakebase_host, lakebase_branch), target dev
- `resources/app.yml` — App resource with all env vars
- `app.yaml` + `startup.py` — Runtime entry point (uvicorn on :8000)
- `app/backend/services/lakebase_service.py` — ensure_tables() auto-creates 4 tables + index on startup
- `app/backend/main.py` — /health endpoint with Lakebase connectivity check
- `configs/*.yaml` — 9 scenario configs (synced by DABs, read from filesystem at runtime)
- `BUILD_NUMBER`, `GIT_COMMIT` — Build metadata

## Files to Create

| File | Purpose |
|------|---------|
| `deploy.sh` | Master orchestrator |
| `scripts/setup_lakebase.py` | Create project + branch, wait for ACTIVE, run DDL, set PUBLIC grants |
| `scripts/lakebase_schema.sql` | Idempotent DDL (same as ensure_tables + PUBLIC grants) |
| `scripts/grant_sp_permissions.sh` | Create Lakebase role for app SP + grant tables/sequences |
| `scripts/health_check.py` | Verify /health returns connected, exit 0/1 |
| `databricks.yml` | Add prod target |

## Implementation Details

### 1. scripts/lakebase_schema.sql

```sql
-- Lakebase Schema for Industrial Digital Twin
CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    config_yaml TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS whatifs (
    id SERIAL PRIMARY KEY,
    scenario_id TEXT NOT NULL REFERENCES scenarios(id),
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    overrides JSONB NOT NULL DEFAULT '{}',
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(scenario_id, slug)
);
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    scenario_id TEXT NOT NULL REFERENCES scenarios(id),
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    report JSONB NOT NULL,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(scenario_id, slug)
);
CREATE TABLE IF NOT EXISTS simulation_ticks (
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
CREATE INDEX IF NOT EXISTS idx_ticks_scenario
    ON simulation_ticks(scenario_id, whatif_name, tick_index);

-- Allow any authenticated role (including app SP) to read/write
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO PUBLIC;
```

### 2. scripts/setup_lakebase.py

Adapted from airport twin's `setup_lakebase_autoscaling.py`:
- Uses databricks CLI for project/branch CRUD
- Uses `databricks.sdk.WorkspaceClient` for branch creation (SDK has typed methods)
- Polls endpoint status until ACTIVE
- Connects via psycopg2 with OAuth token to run schema SQL
- Outputs endpoint host on stdout (captured by deploy.sh)

CLI: `python scripts/setup_lakebase.py --profile PROFILE --project-id industrial-digital-twin --branch production`

### 3. scripts/grant_sp_permissions.sh

Simpler than airport (no UC tables, volumes, Genie, secrets):
1. Auto-detect APP_SP from `databricks apps get`
2. Auto-detect BUNDLE_DIR for workspace CAN_READ
3. Create Lakebase role for SP (OAuth identity via SDK)
4. Grant SP: USAGE + CREATE on schema, ALL on existing tables/sequences, DEFAULT PRIVILEGES
5. Grant CAN_READ on bundle workspace directory

### 4. scripts/health_check.py

- Hit `{url}/health` with httpx, retry up to 60s (5s intervals)
- Check `status == "ok"` and `lakebase.connected == true`
- Print pretty or JSON output
- Exit 0/1

### 5. deploy.sh

```bash
#!/usr/bin/env bash
# Full automated deployment: build → DABs → Lakebase → grants → start → health
```

Steps:
- **Step 0**: Write build metadata (`git rev-parse` → GIT_COMMIT, `rev-list --count` → BUILD_NUMBER)
- **Step 1**: Build frontend (`npm run build`) — `SKIP_BUILD=1` skips
- **Step 2**: DABs bundle deploy (uploads all synced files including `configs/*.yaml`)
- **Step 3**: Detect app SP + bundle path from `databricks apps get`
- **Step 4**: Lakebase setup (`python scripts/setup_lakebase.py`)
- **Step 5**: Grant SP permissions (`./scripts/grant_sp_permissions.sh`)
- **Step 6**: Stop + start app, poll for RUNNING state (up to 10min)
- **Step 7**: Health check (`python scripts/health_check.py --url $APP_URL`)

Env vars for workspace portability:
```bash
PROFILE="${DATABRICKS_PROFILE:-FEVM_SERVERLESS_STABLE}"
APP_NAME="${APP_NAME:-industrial-digital-twin-$TARGET}"
LAKEBASE_PROJECT="${LAKEBASE_PROJECT:-industrial-digital-twin}"
LAKEBASE_BRANCH="${LAKEBASE_BRANCH:-production}"
```

### 6. databricks.yml — Add prod target

```yaml
targets:
  dev:
    default: true
    mode: development
    workspace:
      profile: FEVM_SERVERLESS_STABLE
    variables:
      lakebase_branch: "production"
      lakebase_host: "ep-wispy-moon-d2uk1ozo.database.us-east-1.cloud.databricks.com"
  prod:
    workspace:
      profile: FEVM_SERVERLESS_PROD
    variables:
      lakebase_branch: "production"
      lakebase_host: ""
```

## Verification

1. `./deploy.sh` — full end-to-end on dev target
2. App reaches RUNNING state
3. `python scripts/health_check.py --url <app-url>` exits 0 with `lakebase.connected: true`
4. Open app in browser → scenarios load, simulation plays
5. For a different workspace: `DATABRICKS_PROFILE=OTHER_PROFILE ./deploy.sh --target prod`
