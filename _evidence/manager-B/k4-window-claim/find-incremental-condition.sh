#!/bin/sh
# Why does the incremental branch never fire? The rate measurement says _tryIncrementalResample was
# called zero times in 30 s while getResampledSeries ran 479 times. Read the guard rather than guess.
set -u
F=$(docker exec talaria-chart-1 sh -c 'ls /app/dist-v9/modules/chart-data-pipeline.js 2>/dev/null || find /app -name "chart-data-pipeline.js" 2>/dev/null | head -1')
echo "file: ${F:-NOT FOUND}"
[ -n "$F" ] || exit 1

echo
echo "=== every mention of the incremental path and the cache key ==="
docker exec talaria-chart-1 grep -n "_tryIncrementalResample\|incrementalResamples\|sourceLen\|_resampleCache\|dataVersion" "$F" || echo "(no matches)"

echo
echo "=== getResampledSeries body ==="
docker exec talaria-chart-1 sh -c "sed -n '/getResampledSeries(/,/^  }/p' '$F' | head -80"
