#!/bin/zsh
# Run this from the CardioAI project root. Starts Python API + Vite together.
set -e
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  echo "Missing .venv; start this script from your existing CardioAI project root."
  exit 1
fi
if [[ ! -d frontend/node_modules ]]; then
  echo "Frontend dependencies missing: run (cd frontend && npm install) first."
  exit 1
fi

.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload &
API_PID=$!
(cd frontend && npm run dev -- --host 127.0.0.1) &
VITE_PID=$!
cleanup() {
  kill "$API_PID" "$VITE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
sleep 4
if ! curl --silent --fail http://127.0.0.1:8000/health >/dev/null; then
  echo "FastAPI could not start. Look at the error above (models/dependencies/port)."
  exit 1
fi
open http://127.0.0.1:5173
printf '\nCardioVision is running. Press Ctrl+C to stop both servers.\n'
wait
