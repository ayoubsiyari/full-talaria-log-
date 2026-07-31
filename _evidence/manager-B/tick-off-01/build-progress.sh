#!/usr/bin/env bash
set -uo pipefail
echo "=== is the ship script alive? ==="
pgrep -af "ship-b117.sh" | sed 's/^/  /' || echo "  ship script NOT running"
echo
echo "=== docker build activity ==="
pgrep -af "docker|buildkit" | head -8 | sed 's/^/  /'
echo
echo "=== buildkit progress (recent layers) ==="
docker system df 2>/dev/null | sed 's/^/  /'
echo
echo "=== deploy in progress marker ==="
ls -la /root/talaria-restore/DEPLOY-IN-PROGRESS 2>&1 | sed 's/^/  /'
echo
echo "=== has anything been tagged yet? ==="
docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}}' \
  | grep -E "b117|latest" | head -8 | sed 's/^/  /'
echo
echo "=== current live build id on the wire ==="
curl -sS -m 8 http://127.0.0.1:3000/chart/dist-v9/index.html 2>/dev/null \
  | grep -oE "__TALARIA_CHART_BUILD_ID='[^']+'" | head -1 | sed 's/^/  /'
echo
echo "=== container states ==="
docker ps --format '{{.Names}} {{.Status}} {{.Image}}' | grep talaria | sed 's/^/  /'
echo
echo "=== cpu: is the box actually working? ==="
uptime | sed 's/^/  /'
top -bn1 | head -12 | tail -6 | sed 's/^/  /'
