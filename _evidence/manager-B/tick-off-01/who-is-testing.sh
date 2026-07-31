#!/usr/bin/env bash
# Whoever is on b116 right now will lose their session when I restart the containers.
# Human PO mid-test and an automated harness are very different costs, so establish which.
set -uo pipefail
echo "=== user agents in the last 15 minutes ==="
docker logs --since 15m talaria-homepage-1 2>&1 \
  | grep -oE '"Mozilla[^"]*"' | sort | uniq -c | sort -rn | head -5 | sed 's/^/  /'
echo
echo "=== which account is active? ==="
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "SELECT u.email, u.is_admin,
          TO_CHAR(s.last_active_at,'HH24:MI:SS') AS last_active,
          TO_CHAR(s.created_at,'HH24:MI:SS')     AS session_started
     FROM user_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.last_active_at > NOW() - INTERVAL '30 minutes'
    ORDER BY s.last_active_at DESC LIMIT 5;" 2>&1 | sed 's/^/  /'
echo
echo "=== request shape: is this a browser session or a scripted sweep? ==="
docker logs --since 15m talaria-homepage-1 2>&1 | awk '{print $7}' \
  | sed 's/?.*//' | sort | uniq -c | sort -rn | head -12 | sed 's/^/  /'
echo
echo "=== rate over the last 5 minutes (requests per minute) ==="
docker logs --since 5m talaria-homepage-1 2>&1 \
  | grep -oE '[0-9]{2}:[0-9]{2}:[0-9]{2}' | cut -d: -f1-2 | sort | uniq -c | sed 's/^/  /'
echo
echo "=== is a replay/playback actually running? (tick vs candle traffic) ==="
docker logs --since 15m talaria-homepage-1 2>&1 | grep -cE '/api/file/[0-9]+/(bars|smart)' \
  | sed 's/^/  bar+smart fetches: /'
echo
echo "=== any human page navigations, or only XHR? ==="
docker logs --since 15m talaria-homepage-1 2>&1 \
  | grep -E '"GET /(dashboard|login|chart)' | tail -6 | awk '{print $4, $7, $9}' | sed 's/^/  /'
echo "  (no page loads + steady XHR = a harness already running, not a person clicking)"
