#!/usr/bin/env bash
set -uo pipefail
echo "=== clear the account's window rows so the sequence starts from a known state ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "DELETE FROM chart_window_presence WHERE user_id=128;" | sed 's/^/  /'
echo
cd /root/b-tal01891 && node repro-c-pattern.mjs
echo
echo "--- rows held at the end ---"
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "SELECT client_id, last_seen_at FROM chart_window_presence WHERE user_id=128 ORDER BY last_seen_at;"
