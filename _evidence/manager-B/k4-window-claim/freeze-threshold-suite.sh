#!/usr/bin/env bash
# K4 — turn one reading into a threshold.
#
# Two things are missing before 55 ms/s can be a BUDGET-01 ceiling:
#
#   VER-07  it is one 30s sample. A ceiling set from n=1 is not a threshold, it is an anecdote.
#           So: repeated runs, and the spread is reported alongside the middle.
#   GATE-01 a gate that has never been shown to fail is not evidence. I showed failure by rolling
#           the canary back to b118 — which is exactly the manoeuvre that produced my pin bug.
#           A permanent gate must be falsifiable IN PLACE, so this restores the defect with the
#           shipped kill-switch on the live build instead of swapping images.
#
# Safety, written against my own last mistake:
#   - the .env is backed up and its sha256 recorded BEFORE anything is touched
#   - restore runs on EXIT (failure, interrupt, anything) and re-verifies the sha256
#   - no command whose failure changes what is deployed has its output suppressed
#   - the final state is verified by interrogating the CONTAINER, never a file I wrote
set -uo pipefail
cd /opt/talaria
ENVF="./chart v 1.4/chart/.env"
BAK=/root/b-k4/env.backup
FLAG=TALARIA_DISABLE_WINDOW_GATE_THREADPOOL_V1
mkdir -p /root/b-k4
RUNS="${RUNS:-3}"

cp "$ENVF" "$BAK"
ORIG_SHA=$(sha256sum "$ENVF" | cut -d' ' -f1)
echo "env backed up  sha256=$ORIG_SHA"

recreate() {
  echo "  --- recreating trading-chart (output shown) ---"
  docker compose up -d --no-build --force-recreate trading-chart
  echo "  compose exit: $?"
  for i in $(seq 1 40); do
    st=$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1 2>/dev/null || echo missing)
    hp=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/chart/dist-v9/index.html || echo 000)
    [ "$st" = healthy ] && [ "$hp" = 200 ] && break
    sleep 4
  done
  echo "  health=$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1)"
  echo -n "  flag in container: "
  docker exec talaria-trading-chart-1 sh -c "printenv $FLAG 2>/dev/null || echo '<unset>'"
}

restore() {
  echo
  echo "=== RESTORE ==="
  cp "$BAK" "$ENVF"
  NEW_SHA=$(sha256sum "$ENVF" | cut -d' ' -f1)
  if [ "$NEW_SHA" = "$ORIG_SHA" ]; then echo "  .env sha256 matches original: $NEW_SHA"
  else echo "  .env SHA MISMATCH orig=$ORIG_SHA now=$NEW_SHA"; fi
  recreate
  echo "  --- verify against the container, not a file ---"
  docker inspect -f '  image: {{.Config.Image}}' talaria-trading-chart-1
  curl -s http://127.0.0.1:3000/chart/dist-v9/index.html | grep -o "TALARIA_CHART_BUILD_ID='[^']*'" | head -1 | sed 's/^/  wire: /'
  docker exec talaria-trading-chart-1 sh -c 'grep -c K4-P0-BARS-OFF-LOOP-V1 /app/api_server.py' | sed 's/^/  off-loop marker: /'
  docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
    "UPDATE users SET max_sessions=2 WHERE email='qa-canary@talaria-log.com';" | sed 's/^/  cap restored: /'
  rm -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS
  echo "  measurement claim released"
}
trap restore EXIT

cat > /root/talaria-restore/MEASUREMENT-IN-PROGRESS <<EOF
owner=manager-B
what=K4 freeze threshold suite, repeated runs plus in-place kill-switch RED arm
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
note=the shipped kill-switch is toggled via .env; b120 image is never swapped
EOF

echo
echo "############ ARM 1: b120 as shipped, $RUNS runs ############"
for i in $(seq 1 "$RUNS"); do
  echo "--- green run $i ---"
  LABEL="b120-green-r$i" WINDOWS=1 SPEED=10 LOAD=60 MEASURE_MS=30000 \
    /root/b-tal01891/run-freeze-arm.sh 2>&1 | grep -E 'blocked per second|longest thread freeze|longest chart stall|barsNow|win1  '
done

echo
echo "############ ARM 2: same build, defect restored in place via $FLAG ############"
printf '\n%s=1\n' "$FLAG" >> "$ENVF"
recreate
echo
for i in $(seq 1 "$RUNS"); do
  echo "--- red run $i ---"
  LABEL="b120-killswitch-r$i" WINDOWS=1 SPEED=10 LOAD=60 MEASURE_MS=30000 \
    /root/b-tal01891/run-freeze-arm.sh 2>&1 | grep -E 'blocked per second|longest thread freeze|longest chart stall|barsNow|win1  '
done
