#!/usr/bin/env bash
# My checker guessed container and asset names instead of reading them. Read them.
set -uo pipefail
echo "== containers =="
docker ps --format '  {{.Names}}  {{.Image}}  {{.Status}}'

echo
echo "== how the chart bundle is actually served =="
docker exec talaria-trading-chart-1 sh -c 'ls -la /app/static/chart.js 2>/dev/null; ls /app/static/*.js 2>/dev/null | head -20'
echo "  stamp inside the container's own bundle:"
docker exec talaria-trading-chart-1 sh -c "grep -o '20260731b[0-9]*' /app/static/chart.js 2>/dev/null | head -1" | sed 's/^/    /'

echo
echo "== the route that serves it (needs auth?) =="
grep -nE '(static|StaticFiles|chart\.js)' /root/talaria-deploy/nginx*.conf 2>/dev/null | head -10 || echo "  no nginx conf at that path"
