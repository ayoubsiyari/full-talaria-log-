#!/bin/sh
# PREFS-500 probe: name the failure, then say whether it is every save or some.
echo "=== containers ==="
docker ps --format '{{.Names}} {{.Image}}'

echo "=== which service owns /api/chart/preferences ==="
grep -rn "chart/preferences" /opt/talaria --include=*.py -l 2>/dev/null | head -5

echo "=== recent 500s / tracebacks, all app containers ==="
for c in talaria-trading-chart-1 talaria-homepage-1 talaria-trading-chart-worker-1; do
  echo "-- $c --"
  docker logs --since 90m "$c" 2>&1 | grep -nEi 'preferences|Traceback|Error|500 ' | tail -40
done

echo "=== live GET probe (unauthenticated) ==="
curl -sS -o /tmp/prefs-get.txt -w 'GET_status=%{http_code}\n' http://127.0.0.1:3000/api/chart/preferences || true
head -c 400 /tmp/prefs-get.txt; echo

echo "=== nginx access-log slice for the endpoint ==="
docker exec talaria-homepage-1 sh -c 'tail -2000 /var/log/nginx/access.log 2>/dev/null | grep "chart/preferences" | awk "{print \$6, \$7, \$9}" | sort | uniq -c | sort -rn | head -20' || true
