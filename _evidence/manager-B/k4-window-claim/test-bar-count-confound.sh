#!/usr/bin/env bash
# Is the freeze metric measuring the build, or measuring how many bars are loaded?
#
# Suspicion: replay position persists in the session, so each run starts with more bars than the
# last and has more to render every frame. Across my earlier runs the bar count climbed 579 -> 1955
# and blocked main-thread time climbed with it. If that is the whole story, my b118-vs-b120 A/B
# compared 798-1115 bars against 579-888 bars and attributed the difference to the build.
#
# This settles it on ONE build with nothing else changing: consecutive runs, bar count recorded at
# arm time, on b120 throughout. If blocked ms/s tracks barsAtArm, the metric needs the position
# controlled before it can be a threshold, and my 5.9x has to be withdrawn.
set -uo pipefail
RUNS="${RUNS:-5}"
echo "build under test (from the container, not a file):"
docker inspect -f '  image: {{.Config.Image}}' talaria-trading-chart-1
docker exec talaria-trading-chart-1 sh -c 'grep -c K4-P0-BARS-OFF-LOOP-V1 /app/api_server.py' | sed 's/^/  off-loop marker: /'
echo -n "  kill-switch: "
docker exec talaria-trading-chart-1 sh -c 'printenv TALARIA_DISABLE_WINDOW_GATE_THREADPOOL_V1 2>/dev/null || echo "<unset>"'
echo

for i in $(seq 1 "$RUNS"); do
  LABEL="confound-r$i" WINDOWS=1 SPEED=10 LOAD=60 MEASURE_MS=30000 \
    /root/b-tal01891/run-freeze-arm.sh 2>&1 | grep -E '^  win1  '
done

echo
echo "=== barsAtArm vs blockedMsPerSec, same build throughout ==="
python3 - <<'PY'
import json
rows=[]
for line in open('/root/b-k4/freeze-results.jsonl'):
    try: d=json.loads(line)
    except: continue
    if not d.get('label','').startswith('confound-'): continue
    for r in d['rows']:
        rows.append((r.get('barsAtArm'), r.get('blockedMsPerSec'), r.get('longestTaskMs')))
print(f"  {'barsAtArm':>10} {'blocked ms/s':>13} {'longest ms':>11}")
for b,ms,lt in rows:
    print(f"  {b:>10} {ms:>13} {lt:>11}")
if len(rows)>=3:
    xs=[r[0] for r in rows]; ys=[r[1] for r in rows]
    n=len(xs); mx=sum(xs)/n; my=sum(ys)/n
    num=sum((x-mx)*(y-my) for x,y in zip(xs,ys))
    dx=sum((x-mx)**2 for x in xs)**0.5; dy=sum((y-my)**2 for y in ys)**0.5
    r = num/(dx*dy) if dx and dy else 0
    print(f"\n  correlation(bars, blocked ms/s) = {r:.3f}  over {n} runs, one build")
    print("  near +1 means the metric is tracking replay position, not the build.")
PY
