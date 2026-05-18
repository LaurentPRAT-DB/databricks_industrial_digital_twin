#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Grant permissions to the Databricks App service principal.
#
# What this script handles (DABs cannot manage these):
#   1. Workspace CAN_READ on bundle directory
#   2. Lakebase role creation + table/sequence grants
#
# Prerequisites:
#   1. databricks bundle deploy (creates workspace objects)
#   2. App must exist (registers the SP)
#
# Usage:
#   ./scripts/grant_sp_permissions.sh
#   APP_SP=<sp-uuid> ./scripts/grant_sp_permissions.sh
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration (override via env vars for different workspaces) ───
APP_SP="${APP_SP:-}"
BUNDLE_DIR="${BUNDLE_DIR:-}"
APP_NAME="${APP_NAME:-industrial-digital-twin-dev}"
LAKEBASE_PROJECT="${LAKEBASE_PROJECT:-industrial-digital-twin}"
LAKEBASE_BRANCH="${LAKEBASE_BRANCH:-production}"
LAKEBASE_HOST="${LAKEBASE_HOST:-}"
PROFILE="${DATABRICKS_PROFILE:-FEVM_SERVERLESS_STABLE}"

# ── Auto-detect SP and bundle dir from app if not set ───────────────
if [[ -z "$APP_SP" ]]; then
  echo "Auto-detecting app service principal..."
  APP_SP=$(databricks apps get "$APP_NAME" --output json --profile "$PROFILE" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('service_principal_client_id',''))" 2>/dev/null || true)
  if [[ -z "$APP_SP" ]]; then
    echo "ERROR: Could not detect APP_SP. Set APP_SP env var or ensure app is deployed."
    exit 1
  fi
  echo "  Detected SP: $APP_SP"
fi

if [[ -z "$BUNDLE_DIR" ]]; then
  echo "Auto-detecting bundle workspace directory..."
  BUNDLE_DIR=$(databricks apps get "$APP_NAME" --output json --profile "$PROFILE" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('default_source_code_path',''))" 2>/dev/null || true)
  if [[ -z "$BUNDLE_DIR" ]]; then
    echo "ERROR: Could not detect BUNDLE_DIR. Set BUNDLE_DIR env var."
    exit 1
  fi
  BUNDLE_DIR="${BUNDLE_DIR#/Workspace}"
  echo "  Detected bundle dir: $BUNDLE_DIR"
fi

ERRORS=0
ok()   { echo "  [OK] $1"; }
skip() { echo "  [SKIP] $1"; }
fail() { echo "  [FAIL] $1"; ERRORS=$((ERRORS + 1)); }

# ── 1. Workspace: CAN_READ on bundle directory ──────────────────────
echo ""
echo "1. Workspace directory permissions..."
DIR_ID=$(databricks workspace get-status "$BUNDLE_DIR" --output json --profile "$PROFILE" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['object_id'])" 2>/dev/null || echo "")
if [[ -n "$DIR_ID" ]]; then
  databricks workspace update-permissions directories "$DIR_ID" --json "{
    \"access_control_list\": [
      {\"service_principal_name\": \"$APP_SP\", \"permission_level\": \"CAN_READ\"}
    ]
  }" --profile "$PROFILE" > /dev/null 2>&1 \
    && ok "CAN_READ on bundle directory" \
    || fail "Could not set CAN_READ on bundle directory"
else
  fail "Bundle directory not found at $BUNDLE_DIR — run 'databricks bundle deploy' first"
fi

# ── 2. Lakebase: role creation + table grants ────────────────────────
echo "2. Lakebase permissions..."

LAKEBASE_ENDPOINT="projects/$LAKEBASE_PROJECT/branches/$LAKEBASE_BRANCH/endpoints/primary"

python3 - "$APP_SP" "$LAKEBASE_ENDPOINT" "$LAKEBASE_HOST" "$PROFILE" <<'PYEOF'
import sys

app_sp = sys.argv[1]
endpoint = sys.argv[2]
lb_host = sys.argv[3]
profile = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None

parts = endpoint.split("/")
branch_parent = "/".join(parts[:4])

try:
    from databricks.sdk import WorkspaceClient
    from databricks.sdk.service.postgres import (
        Role, RoleRoleSpec, RoleAuthMethod, RoleIdentityType, RoleAttributes
    )

    w = WorkspaceClient(profile=profile) if profile else WorkspaceClient()

    # Check branch exists, then create role for SP
    try:
        existing_roles = list(w.postgres.list_roles(parent=branch_parent))
    except Exception as e:
        if "not found" in str(e).lower():
            print(f"  [SKIP] Lakebase branch '{branch_parent}' does not exist yet")
            sys.exit(0)
        raise

    sp_has_role = any(
        r.status and r.status.postgres_role == app_sp
        for r in existing_roles
    )

    if sp_has_role:
        print(f"  [OK] Lakebase role exists for SP {app_sp[:8]}...")
    else:
        role = Role(spec=RoleRoleSpec(
            postgres_role=app_sp,
            auth_method=RoleAuthMethod.LAKEBASE_OAUTH_V1,
            identity_type=RoleIdentityType.SERVICE_PRINCIPAL,
            attributes=RoleAttributes(bypassrls=False, createdb=False, createrole=False)
        ))
        w.postgres.create_role(parent=branch_parent, role=role)
        print(f"  [OK] Created Lakebase role for SP {app_sp[:8]}...")

    # Grant table permissions via SQL
    cred = w.postgres.generate_database_credential(endpoint=endpoint)
    me = w.current_user.me()

    import psycopg2
    conn = psycopg2.connect(
        host=lb_host, port=5432, dbname="databricks_postgres",
        user=me.user_name, password=cred.token, sslmode="require"
    )
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute(f'GRANT USAGE ON SCHEMA public TO "{app_sp}"')
    cur.execute(f'GRANT CREATE ON SCHEMA public TO "{app_sp}"')
    cur.execute(f'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "{app_sp}"')
    cur.execute(f'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "{app_sp}"')

    # Grant on all existing tables
    cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    tables = [row[0] for row in cur.fetchall()]
    for t in tables:
        cur.execute(f'GRANT ALL PRIVILEGES ON TABLE "{t}" TO "{app_sp}"')

    # Grant on all existing sequences
    cur.execute("SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'")
    sequences = [row[0] for row in cur.fetchall()]
    for s in sequences:
        cur.execute(f'GRANT ALL PRIVILEGES ON SEQUENCE "{s}" TO "{app_sp}"')

    conn.close()
    print(f"  [OK] Lakebase SQL grants on {len(tables)} table(s), {len(sequences)} sequence(s)")

except ImportError as e:
    print(f"  [SKIP] Lakebase role (missing dependency: {e})")
except Exception as e:
    print(f"  [FAIL] Lakebase permissions: {e}")
    sys.exit(1)
PYEOF

# ── Summary ──────────────────────────────────────────────────────────
echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo "=== $ERRORS error(s) — fix the above and re-run ==="
  exit 1
else
  echo "=== All permissions configured successfully ==="
fi
