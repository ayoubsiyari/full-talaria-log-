#!/usr/bin/env bash
set -uo pipefail
Q() { docker exec talaria-db-1 psql -U talaria -d talaria -A -F' | ' -c "$1"; }
echo "=== the QA account used in every probe so far ==="
Q "SELECT id, email, role, max_sessions FROM users WHERE id=128;"
echo
echo "=== distribution of max_sessions across real accounts ==="
Q "SELECT COALESCE(max_sessions,-1) AS max_sessions, COUNT(*) FROM users GROUP BY 1 ORDER BY 1;"
echo
echo "=== windows currently held by the QA account ==="
Q "SELECT COUNT(*) FROM chart_window_presence WHERE user_id=128;"
echo
echo "=== stale cutoff constant in the running image ==="
docker exec talaria-trading-chart-1 sh -lc "grep -n '_CHART_WINDOW_STALE_SECONDS' /app/api_server.py | head -3"
