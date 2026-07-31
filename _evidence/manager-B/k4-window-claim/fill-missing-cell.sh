#!/usr/bin/env bash
# The missing cell: MANY bars, NO artificial load.
#
# The grid so far, all on one unchanging build:
#
#                      no load        60-request load
#   few bars (~580)    0 ms/s         55 ms/s
#   many bars (>1100)  ???            302-343 ms/s
#
# The empty cell is the entire question, because it is the PO's actual scenario — a zero-trade run
# with nobody generating traffic. If bars alone block the main thread, lag is bars-driven and the
# PO's two days of reports are explained. If they do not, the degradation needs the load condition
# and is narrower than it looks.
#
# Three runs, not one. A single 30s reading is what I got wrong earlier today.
set -uo pipefail
echo "build under test, read from the container:"
docker inspect -f '  image: {{.Config.Image}}' talaria-trading-chart-1
echo -n "  kill-switch: "
docker exec talaria-trading-chart-1 sh -c 'printenv TALARIA_DISABLE_WINDOW_GATE_THREADPOOL_V1 2>/dev/null || echo "<unset>"'
echo

for i in 1 2 3; do
  echo "--- no-load run $i ---"
  LABEL="noload-highbars-r$i" WINDOWS=1 SPEED=10 LOAD=0 MEASURE_MS=30000 \
    /root/b-tal01891/run-freeze-arm.sh 2>&1 | grep -E '^  win1  '
done

echo
echo "=== the completed grid, from freeze-results.jsonl ==="
python3 - <<'PY'
import json
rows=[]
for line in open('/root/b-k4/freeze-results.jsonl'):
    try: d=json.loads(line)
    except: continue
    for r in d['rows']:
        rows.append((d.get('label',''), r.get('barsAtArm'), r.get('blockedMsPerSec'),
                     r.get('longestTaskMs'), r.get('worstTimerGapMs'), r.get('longtasks')))
print(f"  {'label':<24}{'bars':>7}{'blocked ms/s':>14}{'longest':>9}{'worstGap':>10}{'tasks':>7}")
for l,b,ms,lt,wg,n in rows:
    bb = b if b is not None else '-'
    print(f"  {l:<24}{str(bb):>7}{str(ms):>14}{str(lt):>9}{str(wg):>10}{str(n):>7}")
PY
