#!/usr/bin/env bash
# The freeze protects a PO test window. Before lifting it I should establish that no window is
# actually open — "D is idle" is a claim about D, not evidence about the canary.
set -uo pipefail
echo "=== freeze state ==="
/opt/talaria/deploy-freeze-guard.sh status 2>&1 || cat /root/talaria-restore/DEPLOY-FREEZE.json 2>/dev/null
echo
echo "=== is anyone using the canary right now? ==="
NOW=$(date -u +%s)
echo "  now: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
last=$(docker logs --tail 4000 talaria-homepage-1 2>&1 | grep -oE '\[[0-9]{2}/[A-Za-z]{3}/[0-9]{4}:[0-9:]{8}' | tail -1)
echo "  last request in homepage log: ${last:-none}"
echo
echo "  --- requests in the last 15 minutes, by client ---"
docker logs --since 15m talaria-homepage-1 2>&1 | awk '{print $1}' | sort | uniq -c | sort -rn | head -8 | sed 's/^/    /'
echo "    (empty = nobody has touched the canary in 15 minutes)"
echo
echo "  --- non-asset requests in the last 60 minutes ---"
docker logs --since 60m talaria-homepage-1 2>&1 \
  | grep -E '"(GET|POST) /(api|dashboard|login|journal)' \
  | awk '{print $1, $4, $7}' | tail -12 | sed 's/^/    /'
echo
echo "  --- active sessions in the database ---"
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT COALESCE(TO_CHAR(MAX(last_active_at),'YYYY-MM-DD HH24:MI:SS'),'none'),
          COUNT(*) FILTER (WHERE last_active_at > NOW() - INTERVAL '15 minutes')
   FROM user_sessions;" 2>&1 | sed 's/^/    most_recent | active_last_15m: /'
