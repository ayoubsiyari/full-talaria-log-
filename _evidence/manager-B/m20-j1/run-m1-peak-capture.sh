#!/usr/bin/env bash
# Guarded runner for the M1 peak capture.
#
# The 04:00 window was granted on the binding condition "no overlap with a soak in either direction".
# That condition is objectively checkable, so this checks it rather than trusting a clock: it refuses
# to run if any browser process, any node process, any remote connection to :3000, or a busy chart
# container is present. It re-checks afterwards so a collision that started mid-run is visible rather
# than silently folded into the result.
#
# No output is suppressed: every check that could invalidate the measurement prints its own result.
set -uo pipefail

echo "=== PREFLIGHT: is the host actually free? ==="
date -u +'  utc=%Y-%m-%dT%H:%M:%SZ'
FAIL=0

BROWSERS=$(ps -eo comm 2>/dev/null | grep -icE 'chrome|chromium' || true)
echo "  browser processes:            $BROWSERS  (need 0)"
[ "$BROWSERS" -ne 0 ] && FAIL=1

# Match on comm, the executable name, not on args: the first version of this check grepped full
# command lines and matched its own, refusing to run against a process that was the check itself.
NODES=$(ps -eo comm 2>/dev/null | grep -cx 'node' || true)
echo "  node processes:               $NODES  (need 0)"
[ "$NODES" -ne 0 ] && FAIL=1

REMOTE=$(ss -tn state established '( sport = :3000 )' 2>/dev/null | tail -n +2 \
         | awk '{print $5}' | sed 's/:[0-9]*$//' | grep -vc '^127\.0\.0\.1$' || true)
echo "  remote connections to :3000:  $REMOTE  (need 0)"
[ "${REMOTE:-0}" -ne 0 ] && FAIL=1

CPU=$(docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}' | awk '/trading-chart-1/{gsub(/%/,"",$2); print int($2)}')
echo "  chart container CPU:          ${CPU}%  (need < 30)"
[ "${CPU:-0}" -ge 30 ] && FAIL=1

echo -n "  loadavg:                      "; cat /proc/loadavg

if [ "$FAIL" -ne 0 ]; then
  echo
  echo "  REFUSING TO RUN — the host is not free. A soak may have started."
  exit 1
fi
echo "  host is free; proceeding."

echo
echo "=== build under test ==="
curl -s --max-time 20 "http://127.0.0.1:3000/chart/dist-v9/index.html?mode=backtest" \
  | grep -oE '20[0-9]{6}b[0-9]{2,4}' | head -1 | sed 's/^/  wire build: /'

echo
echo "=== CAPTURE ==="
cd /root/b-tal01891
set -a; . /root/.talaria-test-env; set +a
node m1-peak-capture.mjs
echo "  capture exit=$?"

echo
echo "=== POSTFLIGHT: did anything else appear while we measured? ==="
date -u +'  utc=%Y-%m-%dT%H:%M:%SZ'
echo -n "  browser processes: "; ps -eo comm 2>/dev/null | grep -icE 'chrome|chromium' || true
echo -n "  remote conns :3000: "; ss -tn state established '( sport = :3000 )' 2>/dev/null | tail -n +2 \
  | awk '{print $5}' | sed 's/:[0-9]*$//' | grep -vc '^127\.0\.0\.1$' || true
docker stats --no-stream --format '  {{.Name}} cpu={{.CPUPerc}}' | head -2
echo -n "  loadavg: "; cat /proc/loadavg
