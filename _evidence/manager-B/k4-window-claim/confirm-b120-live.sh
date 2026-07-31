#!/usr/bin/env bash
set -uo pipefail
echo "=== live pin ==="
cat /root/talaria-restore/LIVE-PIN.txt
echo "=== wire build id ==="
curl -s http://127.0.0.1:3000/chart/dist-v9/index.html | grep -o "TALARIA_CHART_BUILD_ID='[^']*'" | head -2
echo "=== container images ==="
docker inspect -f '{{.Config.Image}}' talaria-trading-chart-1
docker inspect -f '{{.Config.Image}}' talaria-homepage-1
echo "=== health ==="
docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1
echo "=== both fixes present in the RUNNING container ==="
docker exec talaria-trading-chart-1 sh -c 'grep -c _require_active_chart_window_async /app/api_server.py' | sed 's/^/  async gate: /'
docker exec talaria-trading-chart-1 sh -c 'grep -c K4-P0-BARS-OFF-LOOP-V1 /app/api_server.py' | sed 's/^/  off-loop handlers marker: /'
docker exec talaria-trading-chart-1 sh -c 'grep -c "^def get_file_bars(" /app/api_server.py' | sed 's/^/  get_file_bars is sync def: /'
echo "=== measurement claim released? ==="
if [ -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS ]; then echo "  STILL CLAIMED"; else echo "  released"; fi
echo "=== account cap back to product value? ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT email||' max_sessions='||max_sessions FROM users WHERE email='qa-canary@talaria-log.com';" | sed 's/^/  /'
echo "=== product still answers ==="
curl -s -o /dev/null -w '  chart shell -> %{http_code}\n' http://127.0.0.1:3000/chart/dist-v9/index.html
curl -s -o /dev/null -w '  health      -> %{http_code}\n' http://127.0.0.1:3000/api/health
