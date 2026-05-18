# Deployment Guide — Industrial Digital Twin

## Prerequisites

- Databricks CLI installed and authenticated
- Workspace profile configured (e.g., `FEVM_SERVERLESS_STABLE`)
- Python 3.10+ with `databricks-sdk` installed locally
- Frontend built (`app/frontend/dist/` populated)
- Simulation configs in `configs/*.yaml`

## 1. Unity Catalog Setup

Create the catalog, schema, and volume for storing configs:

```bash
# These are workspace-specific — adjust names accordingly
CATALOG="serverless_stable_3n0ihb_catalog"
SCHEMA="industrial_digital_twin"
VOLUME="raw_data"
```

```sql
CREATE SCHEMA IF NOT EXISTS ${CATALOG}.${SCHEMA};
CREATE VOLUME IF NOT EXISTS ${CATALOG}.${SCHEMA}.${VOLUME};
```

Upload simulation YAML configs to the volume (optional — configs are also bundled with the app):

```bash
databricks fs cp configs/ /Volumes/${CATALOG}/${SCHEMA}/${VOLUME}/configs/ --recursive --profile FEVM_SERVERLESS_STABLE
```

## 2. Lakebase Project Setup

### 2.1 Create the Autoscale Lakebase Project

```python
from databricks.sdk import WorkspaceClient
w = WorkspaceClient(profile='FEVM_SERVERLESS_STABLE')

# Create the project (autoscale type)
w.postgres.create_project(
    project_id="industrial-digital-twin",
    # Additional config as needed
)
```

Or via MCP tool:

```
manage_lakebase_database(action="create_or_update", name="industrial-digital-twin", type="autoscale")
```

### 2.2 Create Production Branch + Endpoint

The production branch with a primary read-write endpoint:

```
manage_lakebase_branch(
    action="create_or_update",
    project_name="industrial-digital-twin",
    branch_id="production"
)
```

Note the endpoint host (e.g., `ep-wispy-moon-d2uk1ozo.database.us-east-1.cloud.databricks.com`).

### 2.3 Create Tables

Connect to Lakebase and create the required tables:

```python
from databricks.sdk import WorkspaceClient
import psycopg2

w = WorkspaceClient(profile='FEVM_SERVERLESS_STABLE')
cred = w.postgres.generate_database_credential(
    endpoint='projects/industrial-digital-twin/branches/production/endpoints/primary'
)
me = w.current_user.me()

conn = psycopg2.connect(
    host='<ENDPOINT_HOST>',
    port=5432,
    dbname='databricks_postgres',
    user=me.user_name,
    password=cred.token,
    sslmode='require'
)
conn.autocommit = True
cur = conn.cursor()

# The app's ensure_tables() creates these automatically, but for reference:
cur.execute("""
CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    config JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS simulation_ticks (
    id SERIAL PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    whatif_name TEXT,
    tick_index INT NOT NULL,
    sim_time REAL NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatifs (
    id SERIAL PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    overrides JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    report JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
""")
cur.close()
conn.close()
```

## 3. DABs Bundle Configuration

The bundle is defined by two files:

- **`databricks.yml`** — bundle metadata, sync rules, variables, targets
- **`resources/app.yml`** — Databricks App resource with env vars

Key variables:
- `lakebase_host`: The Lakebase endpoint hostname
- `lakebase_branch`: Branch name (e.g., `production`)

The `SIM_CONFIGS_DIR` env var is set to `configs` (relative path) because:
- UC Volume FUSE (`/Volumes/...`) is **NOT available** inside Databricks Apps
- DABs syncs `configs/*.yaml` to the app's source code directory
- At runtime, CWD is `/app/python/source_code`, so `configs/` resolves correctly

## 4. Deploy the App

```bash
# Validate the bundle
databricks bundle validate -t dev

# Deploy (syncs files + creates/updates app resource)
databricks bundle deploy -t dev

# Run (triggers a new deployment of the app)
databricks bundle run industrial_digital_twin -t dev
```

The app will be created with URL: `https://industrial-digital-twin-dev-<workspace_id>.aws.databricksapps.com`

## 5. Grant App Service Principal Access

After the first deployment, the app's service principal (SP) needs:
1. The `sql` user API scope (for generating Lakebase credentials)
2. A Lakebase OAuth role (for authenticating to the database)

### 5.1 Add SQL Scope to the App

```bash
databricks apps update industrial-digital-twin-dev \
  --json '{"user_api_scopes": ["sql"]}' \
  --profile FEVM_SERVERLESS_STABLE
```

Verify:
```bash
databricks apps get industrial-digital-twin-dev --profile FEVM_SERVERLESS_STABLE | jq '.effective_user_api_scopes'
# Should include "sql"
```

### 5.2 Create Lakebase OAuth Role for the SP

Get the app's service principal client ID:

```bash
databricks apps get industrial-digital-twin-dev --profile FEVM_SERVERLESS_STABLE | jq -r '.service_principal_client_id'
# e.g., 9983ccca-29fe-4580-84ed-eb57ef83cb9b
```

Create a Lakebase role with `LAKEBASE_OAUTH_V1` auth method:

```python
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.postgres import (
    Role, RoleRoleSpec, RoleAuthMethod, RoleIdentityType,
    RoleMembershipRole, RoleAttributes
)

w = WorkspaceClient(profile='FEVM_SERVERLESS_STABLE')

SP_CLIENT_ID = "<service_principal_client_id>"  # from step above

role = Role(
    spec=RoleRoleSpec(
        auth_method=RoleAuthMethod.LAKEBASE_OAUTH_V1,
        identity_type=RoleIdentityType.SERVICE_PRINCIPAL,
        membership_roles=[RoleMembershipRole.DATABRICKS_SUPERUSER],
        postgres_role=SP_CLIENT_ID,
        attributes=RoleAttributes(
            bypassrls=False,
            createdb=False,
            createrole=False,
        ),
    )
)

op = w.postgres.create_role(
    parent='projects/industrial-digital-twin/branches/production',
    role=role,
    role_id=f'sp-{SP_CLIENT_ID[:8]}',
)
print(f"Role created: {op}")
```

### 5.3 Grant Table Permissions to the SP

Connect to Lakebase and grant schema-level access:

```python
cred = w.postgres.generate_database_credential(
    endpoint='projects/industrial-digital-twin/branches/production/endpoints/primary'
)
me = w.current_user.me()

conn = psycopg2.connect(
    host='<ENDPOINT_HOST>', port=5432,
    dbname='databricks_postgres', user=me.user_name,
    password=cred.token, sslmode='require'
)
conn.autocommit = True
cur = conn.cursor()

SP_CLIENT_ID = "<service_principal_client_id>"

cur.execute(f'GRANT ALL ON SCHEMA public TO "{SP_CLIENT_ID}";')
cur.execute(f'GRANT ALL ON ALL TABLES IN SCHEMA public TO "{SP_CLIENT_ID}";')
cur.execute(f'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "{SP_CLIENT_ID}";')
cur.execute(f'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "{SP_CLIENT_ID}";')

cur.close()
conn.close()
```

### 5.4 Redeploy to Pick Up New Permissions

```bash
databricks bundle run industrial_digital_twin -t dev
```

## 6. Verification

### 6.1 Check App Status

```bash
databricks apps get industrial-digital-twin-dev --profile FEVM_SERVERLESS_STABLE | jq '{app_status, compute_status}'
# app_status.state should be "RUNNING"
```

### 6.2 Check Logs

```bash
databricks apps logs industrial-digital-twin-dev --profile FEVM_SERVERLESS_STABLE | grep "\[APP\]" | tail -20
```

Expected log sequence:
```
[INFO] startup - Python 3.11.15 | CWD: /app/python/source_code
[INFO] startup - LAKEBASE_HOST=ep-... SIM_CONFIGS_DIR=configs
[INFO] startup - Starting uvicorn...
[INFO] app.backend.main - Industrial Digital Twin — Build 1
[INFO] app.backend.services.lakebase_service - Lakebase OAuth: token acquired
[INFO] app.backend.main - Lakebase: CONNECTED (host=...)
[INFO] app.backend.main - Pre-computed 5761 frames in 0.6s
[INFO] app.backend.services.lakebase_service - Saved 5761 ticks for assembly_line_3station/None
```

### 6.3 Test Endpoints

```bash
TOKEN=$(databricks auth token --profile FEVM_SERVERLESS_STABLE | jq -r '.access_token')
APP_URL="https://industrial-digital-twin-dev-<workspace_id>.aws.databricksapps.com"

# Health (should show lakebase.connected: true)
curl -s -H "Authorization: Bearer $TOKEN" "$APP_URL/health" | jq .

# List scenarios
curl -s -H "Authorization: Bearer $TOKEN" "$APP_URL/api/scenarios" | jq .

# Load a scenario
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id": "ev_battery_pack"}' "$APP_URL/api/scenarios/load" | jq .

# Get simulation frames
curl -s -H "Authorization: Bearer $TOKEN" "$APP_URL/api/simulation/frames" | jq '.frame_count'

# Run what-if simulation
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id": "ev_battery_pack", "name": "Slow Welder", "overrides": {"laser_welder_1": {"cycle_time": 90}}}' \
  "$APP_URL/api/scenarios/simulate" | jq .

# Run comparison report
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"scenario_id": "ev_battery_pack", "whatifs": [{"name": "Slow Welder", "overrides": {"laser_welder_1": {"cycle_time": 90}}}]}' \
  "$APP_URL/api/scenarios/ev_battery_pack/run-report" | jq .
```

### 6.4 Verify Lakebase Persistence

```python
conn = psycopg2.connect(...)
cur = conn.cursor()
cur.execute('SELECT scenario_id, whatif_name, COUNT(*) FROM simulation_ticks GROUP BY 1, 2;')
print(cur.fetchall())
# Should show rows with tick_count = 5761 per scenario
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `PermissionError: '/Volumes'` | UC Volume FUSE not available in Apps | Set `SIM_CONFIGS_DIR=configs` (bundled path) |
| `password authentication failed for user '<sp-id>'` | Missing Lakebase OAuth role | Create role via `w.postgres.create_role()` with `LAKEBASE_OAUTH_V1` |
| `Lakebase OAuth: token acquired` then pool fails | SP missing `sql` scope | `databricks apps update ... --json '{"user_api_scopes": ["sql"]}'` |
| `must be owner of table X` | Tables created by different user | Non-fatal warning; SP can still INSERT/SELECT |
| App health check timeout | Precomputation blocking startup | Use background thread (already implemented) |
| `uvicorn` CLI crashes on import | Module path resolution | Use `python startup.py` as entry point |

## Architecture Notes

- **Entry point**: `python startup.py` (not uvicorn CLI) — ensures proper sys.path and error handling
- **Config loading**: From bundled `configs/` directory (synced by DABs), not UC Volume
- **Lakebase auth**: SP uses `WorkspaceClient().postgres.generate_database_credential()` with M2M OAuth
- **Startup**: Lakebase connection check is non-blocking; simulation precomputation runs in a background thread
- **Dual mode**: When `LAKEBASE_HOST` is set, file-based operations (mkdir, write) are skipped with early returns
