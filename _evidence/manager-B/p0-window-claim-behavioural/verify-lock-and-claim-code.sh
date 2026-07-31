#!/usr/bin/env bash
set -euo pipefail

echo "=== PG: second FOR UPDATE should block ~15s ==="
docker exec -d talaria-db-1 psql -U talaria -d talaria -c \
  "BEGIN; SELECT id FROM users WHERE id=13 FOR UPDATE; SELECT pg_sleep(15); COMMIT;"
sleep 1
START=$(date +%s.%N)
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "BEGIN; SELECT id FROM users WHERE id=13 FOR UPDATE; COMMIT;"
END=$(date +%s.%N)
python3 - <<PY
start=float("${START}"); end=float("${END}")
print(f"second_lock_elapsed={end-start:.3f}s")
PY

echo "=== claim lock sites in deployed api_server ==="
docker exec talaria-trading-chart-1 sh -c \
  'grep -n "_lock_user_for_session_quota\|with_for_update\|def chart_window_claim\|windows/claim\|chart_windows" /app/api_server.py | head -50'

echo "=== function body excerpt ==="
docker exec talaria-trading-chart-1 sh -c \
  'sed -n "13040,13080p;14300,14420p" /app/api_server.py' | head -160
