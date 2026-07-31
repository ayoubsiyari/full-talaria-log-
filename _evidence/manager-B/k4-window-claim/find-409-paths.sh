#!/usr/bin/env bash
set -uo pipefail
echo "=== QA account limit ==="
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "SELECT id, email, role, max_sessions FROM users WHERE id=128;"
echo "=== how many windows does QA currently hold? ==="
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "SELECT client_id, last_seen_at FROM chart_window_presence WHERE user_id=128 ORDER BY last_seen_at;"
echo "=== a user with max_sessions = 1 exists? (the tight case) ==="
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "SELECT max_sessions, COUNT(*) FROM users GROUP BY max_sessions ORDER BY max_sessions;"
