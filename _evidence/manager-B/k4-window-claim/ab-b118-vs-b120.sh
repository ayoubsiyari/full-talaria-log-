#!/usr/bin/env bash
# A/B the freeze in milliseconds: b118 (the build C's 10x run died on) vs b120 (live).
#
# Same probe, same host, same account, same dataset, same 10x replay, same 60-concurrent gated
# load. The only variable is the build. b118's image was saved at ship time, so this is the real
# defect and not a simulation of it.
#
# The restore to b120 runs on EXIT, including on failure or interrupt, so the canary cannot be
# left on the old build if this script dies. Ownership of the interruption is mine either way.
set -uo pipefail
cd /opt/talaria

RESTORE_TAG=canary-20260731b120
RED_TAG=canary-20260731b118

restore() {
  echo
  echo "=== restoring $RESTORE_TAG ==="
  export HOMEPAGE_IMAGE="talaria-homepage:$RESTORE_TAG"
  export TRADING_CHART_IMAGE="talaria-trading-chart:$RESTORE_TAG"
  docker compose up -d --no-build trading-chart trading-chart-worker homepage >/dev/null 2>&1
  echo 20260731b120 > /root/talaria-restore/LIVE-PIN.txt
  for i in $(seq 1 30); do
    st=$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1 2>/dev/null || echo missing)
    [ "$st" = healthy ] && break
    sleep 3
  done
  echo "  health: $(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1)"
  echo "  wire  : $(curl -s http://127.0.0.1:3000/chart/dist-v9/index.html | grep -o "__TALARIA_CHART_BUILD_ID='[^']*'" | head -1)"
  # put the account's cap back the way the product had it
  docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
    "UPDATE users SET max_sessions=2 WHERE email='qa-canary@talaria-log.com';" | sed 's/^/  cap restored: /'
  rm -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS
  echo "  measurement claim released"
}
trap restore EXIT

cat > /root/talaria-restore/MEASUREMENT-IN-PROGRESS <<EOF
owner=manager-B
what=K4 freeze A/B, b118 vs b120, main-thread blocked ms at 10x
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
note=canary is briefly rolled to b118 for the RED arm and restored to b120 on exit
EOF
echo "measurement claimed"

echo
echo "=== RED arm: roll to $RED_TAG ==="
export HOMEPAGE_IMAGE="talaria-homepage:$RED_TAG"
export TRADING_CHART_IMAGE="talaria-trading-chart:$RED_TAG"
docker compose up -d --no-build trading-chart trading-chart-worker homepage >/dev/null 2>&1
for i in $(seq 1 30); do
  st=$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1 2>/dev/null || echo missing)
  hp=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/chart/dist-v9/index.html || echo 000)
  [ "$st" = healthy ] && [ "$hp" = 200 ] && break
  sleep 3
done
echo 20260731b118 > /root/talaria-restore/LIVE-PIN.txt
echo "  health: $(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1)"
echo "  wire  : $(curl -s http://127.0.0.1:3000/chart/dist-v9/index.html | grep -o "__TALARIA_CHART_BUILD_ID='[^']*'" | head -1)"
echo "  confirm the defect is present (the async gate must be ABSENT on b118):"
docker exec talaria-trading-chart-1 sh -c "grep -c '_require_active_chart_window_async' /app/api_server.py 2>/dev/null || echo 0" \
  | sed 's/^/    _require_active_chart_window_async occurrences: /'

echo
LABEL=b118-RED WINDOWS=1 SPEED=10 LOAD=60 MEASURE_MS=30000 /root/b-tal01891/run-freeze-arm.sh
