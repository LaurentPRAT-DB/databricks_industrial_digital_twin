#!/bin/bash
# Start backend + frontend for local development
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Start backend
echo "Starting backend on :8000..."
uv run uvicorn app.backend.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start frontend
echo "Starting frontend on :3000..."
cd app/frontend && npm run dev &
FRONTEND_PID=$!

cd "$SCRIPT_DIR"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
echo "Backend: http://localhost:8000  |  Frontend: http://localhost:3000"
wait
