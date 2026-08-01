#!/bin/sh
# MEAS-01 recheck, corrected file list.
echo "=== stamp on screen ==="
curl -sS http://127.0.0.1:3000/chart/dist-v9/index.html \
  | grep -oE 'v=[0-9]{8}b[0-9]+' | sort -u | head -5

echo "=== STASHED-PANEL-HANDLE (A e7616ab06) on the served panel manager ==="
curl -sS http://127.0.0.1:3000/chart/multichart-prod/multichart-manager.js \
  | grep -c 'mcStashPanelHandles'

echo "=== M17-DI2 COMPLETED-BAR-CLOSE-GUARD, in the files that actually carry it ==="
for f in /chart/modules/replay-system.js /chart/multichart-prod/panel-cmd-bridge.js /chart/chart.js; do
  n=$(curl -sS "http://127.0.0.1:3000$f" | grep -c '__TALARIA_DISABLE_COMPLETED_BAR_CLOSE_GUARD_V1')
  printf '%s = %s\n' "$f" "$n"
done

echo "=== PREFS-CLOUD-FAILURE-CAP on the wire ==="
curl -sS http://127.0.0.1:3000/chart/modules/preferences-sync.js \
  | grep -c '__TALARIA_DISABLE_PREFS_CLOUD_FAILURE_CAP_V1'

echo "=== is the chart shell itself embedded in an iframe by the dashboard ==="
curl -sS http://127.0.0.1:3000/chart/dist-v9/index.html | grep -c 'realm-climb-not-applicable'
