#!/usr/bin/env bash
# The canary took a container restart under an active harness. Confirm it came back properly
# rather than assuming it did, and confirm the harness's traffic is flowing again.
set -uo pipefail
echo "=== container health ==="
docker ps --format '{{.Names}} | {{.Status}} | {{.Image}}' | grep -E 'trading-chart|homepage-1' | sed 's/^/  /'
echo
echo "=== end-to-end responses ==="
for u in / /login/ /chart/dist-v9/index.html /chart/modules/replay-system.js /api/auth/me; do
  printf '  %-38s ' "$u"
  curl -sS -o /dev/null -m 10 -w 'http=%{http_code} t=%{time_total}s\n' "http://127.0.0.1:3000$u" 2>&1 || echo FAILED
done
echo
echo "=== traffic since the deploy ==="
docker logs --since 10m talaria-homepage-1 2>&1 | wc -l | sed 's/^/  requests in last 10m: /'
echo "  status codes:"
docker logs --since 10m talaria-homepage-1 2>&1 | awk '{print $9}' | sort | uniq -c | sort -rn | head -6 | sed 's/^/    /'
echo
echo "=== any 5xx since the deploy? ==="
n=$(docker logs --since 20m talaria-homepage-1 2>&1 | awk '$9 ~ /^5/' | wc -l)
echo "  5xx count: $n"
[ "$n" -gt 0 ] && docker logs --since 20m talaria-homepage-1 2>&1 | awk '$9 ~ /^5/' | tail -5 | sed 's/^/    /'
echo
echo "=== trading-chart errors since deploy ==="
docker logs --since 20m talaria-trading-chart-1 2>&1 | grep -iE 'traceback|critical|error' | tail -6 | sed 's/^/  /'
echo "  (empty above is the good case)"
echo
echo "=== freeze state now ==="
/opt/talaria/deploy-freeze-guard.sh status 2>&1 | sed 's/^/  /'
