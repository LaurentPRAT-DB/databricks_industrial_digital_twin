#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Full automated deployment: build → DABs deploy → Lakebase → grants → start → health
#
# DABs manages: app definition, env vars, source code sync (configs, backend, frontend dist).
# This script handles what DABs cannot: Lakebase provisioning, SP grants, app restart,
# health verification.
#
# Usage:
#   ./deploy.sh                    # default target: dev
#   ./deploy.sh --target prod      # specify target
#   SKIP_BUILD=1 ./deploy.sh       # skip frontend build
#
# All env vars are configurable for different workspaces:
#   DATABRICKS_PROFILE, APP_NAME, LAKEBASE_PROJECT, LAKEBASE_BRANCH
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

# Parse arguments
TARGET="dev"
for arg in "$@"; do
  case "$arg" in
    --target) :;; # next arg is the target value
    *) [[ "${_prev_arg:-}" == "--target" ]] && TARGET="$arg" ;;
  esac
  _prev_arg="$arg"
done
unset _prev_arg

PROFILE="${DATABRICKS_PROFILE:-FEVM_SERVERLESS_STABLE}"
APP_NAME="${APP_NAME:-industrial-digital-twin-$TARGET}"
LAKEBASE_PROJECT="${LAKEBASE_PROJECT:-industrial-digital-twin}"
LAKEBASE_BRANCH="${LAKEBASE_BRANCH:-production}"
LAKEBASE_HOST="${LAKEBASE_HOST:-}"
SKIP_BUILD="${SKIP_BUILD:-}"

ok()   { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; }
info() { echo "  → $1"; }

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "═══ Industrial Digital Twin — Full Deploy (target: $TARGET) ═══"
echo ""

# ── Step 0: Write build metadata ─────────────────────────────────────
echo "Step 0: Build metadata"
git rev-parse --short HEAD > GIT_COMMIT 2>/dev/null || true
git rev-list --count HEAD > BUILD_NUMBER 2>/dev/null || true
ok "GIT_COMMIT=$(cat GIT_COMMIT), BUILD_NUMBER=$(cat BUILD_NUMBER)"

# ── Step 1: Build frontend ───────────────────────────────────────────
echo "Step 1: Build frontend"
if [[ -n "$SKIP_BUILD" ]]; then
  info "Skipped (SKIP_BUILD=1)"
else
  (cd app/frontend && npm run build) > /dev/null 2>&1 \
    && ok "Frontend built (app/frontend/dist)" \
    || { fail "Frontend build failed"; exit 1; }
fi

# ── Step 2: DABs bundle deploy ───────────────────────────────────────
echo "Step 2: DABs bundle deploy"
databricks bundle deploy --target "$TARGET" 2>&1 | grep -v "^Warning:" \
  && ok "Bundle deployed (app + configs)" \
  || { fail "Bundle deploy failed"; exit 1; }

# ── Step 3: Detect app SP and bundle path ────────────────────────────
echo "Step 3: Detect app configuration"
APP_JSON=$(databricks apps get "$APP_NAME" --output json --profile "$PROFILE" 2>/dev/null || echo "{}")
APP_SP=$(echo "$APP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('service_principal_client_id',''))" 2>/dev/null || true)
APP_URL=$(echo "$APP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))" 2>/dev/null || true)

if [[ -z "$APP_SP" ]]; then
  fail "Could not detect app SP — is the app registered?"
  exit 1
fi
ok "SP: $APP_SP"
ok "URL: ${APP_URL:-unknown}"

# ── Step 4: Lakebase setup ───────────────────────────────────────────
echo "Step 4: Lakebase setup"

# Resolve host from databricks.yml if not set
if [[ -z "$LAKEBASE_HOST" ]]; then
  LAKEBASE_HOST=$(python3 -c "
import yaml
with open('databricks.yml') as f:
    cfg = yaml.safe_load(f)
target = cfg.get('targets', {}).get('$TARGET', {})
tvars = target.get('variables', {})
print(tvars.get('lakebase_host', cfg.get('variables', {}).get('lakebase_host', {}).get('default', '')))
" 2>/dev/null || true)
fi

if [[ -n "$LAKEBASE_PROJECT" ]]; then
  NEW_HOST=$(python3 scripts/setup_lakebase.py \
    --profile "$PROFILE" \
    --project-id "$LAKEBASE_PROJECT" \
    --branch "$LAKEBASE_BRANCH") \
    && { ok "Lakebase ready (host: $NEW_HOST)"; LAKEBASE_HOST="$NEW_HOST"; } \
    || { fail "Lakebase setup failed (non-fatal, app will run without persistence)"; }
else
  info "No LAKEBASE_PROJECT configured — skipping Lakebase"
fi

# ── Step 5: Grant SP permissions ─────────────────────────────────────
echo "Step 5: Grant SP permissions"
export APP_SP APP_NAME LAKEBASE_PROJECT LAKEBASE_BRANCH LAKEBASE_HOST DATABRICKS_PROFILE="$PROFILE"
./scripts/grant_sp_permissions.sh

# ── Step 6: Stop + start app ─────────────────────────────────────────
echo "Step 6: Restart app"
databricks apps stop "$APP_NAME" --profile "$PROFILE" > /dev/null 2>&1 || true
ok "App stopped"
databricks apps start "$APP_NAME" --profile "$PROFILE" > /dev/null 2>&1 &
info "App starting..."

# Wait for RUNNING state (up to 10 minutes)
TIMEOUT=600
ELAPSED=0
STATE=""
while [[ $ELAPSED -lt $TIMEOUT ]]; do
  STATE=$(databricks apps get "$APP_NAME" --output json --profile "$PROFILE" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('app_status',{}).get('state',''))" 2>/dev/null || true)
  if [[ "$STATE" == "RUNNING" ]]; then
    break
  fi
  sleep 30
  ELAPSED=$((ELAPSED + 30))
  info "Waiting for app... (${ELAPSED}s, state: ${STATE:-unknown})"
done

if [[ "$STATE" == "RUNNING" ]]; then
  ok "App is RUNNING"
else
  fail "App did not reach RUNNING state within ${TIMEOUT}s (state: ${STATE:-unknown})"
  info "Continuing with health check — it may fail"
fi

# ── Step 7: Health check ─────────────────────────────────────────────
echo "Step 7: Health check"
if [[ -n "$APP_URL" ]]; then
  python3 scripts/health_check.py --url "$APP_URL" --retries 6 --interval 10 \
    && ok "Health check passed" \
    || fail "Health check failed"
else
  info "No app URL available — skipping health check"
fi

# ── Done ──────────────────────────────────────────────────────────────
echo ""
echo "═══ Deployment complete ═══"
echo "App URL: ${APP_URL:-https://${APP_NAME}.aws.databricksapps.com}"
