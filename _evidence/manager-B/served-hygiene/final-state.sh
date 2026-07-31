#!/usr/bin/env bash
set -uo pipefail
echo "--- live pin ---"
cat /root/talaria-restore/LIVE-PIN.txt
echo "--- container images ---"
for c in talaria-homepage-1 talaria-trading-chart-1 talaria-trading-chart-worker-1; do
  printf '  %s = %s\n' "$c" "$(docker inspect -f '{{.Config.Image}}' "$c")"
done
echo "--- health ---"
docker inspect -f '  trading-chart={{.State.Health.Status}}' talaria-trading-chart-1
echo "--- stamp on the wire ---"
curl -sS -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/dist-v9/index.html \
  | grep -oE "__TALARIA_CHART_BUILD_ID='[^']+'" | head -1 | sed 's/^/  /'
echo "--- rollback targets available ---"
ls -1 /root/talaria-restore/images/ | tail -4 | sed 's/^/  /'
echo "--- freeze ---"
/opt/talaria/deploy-freeze-guard.sh status
