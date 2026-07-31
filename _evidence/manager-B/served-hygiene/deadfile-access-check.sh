#!/usr/bin/env bash
# Has anything ever actually REQUESTED the candidate dead files?
# Static-ref analysis can miss a dynamically built path; the access log cannot.
set -uo pipefail
C=talaria-homepage-1

echo "=== log span available ==="
docker logs "$C" 2>&1 | head -1 | cut -c1-120
docker logs "$C" 2>&1 | wc -l | sed 's/^/  total log lines: /'

for f in chart-indicators-readable.js \
         chart-indicators-with-hma.js \
         chart-indicators-working-backup-final.js \
         chart-indicators.js \
         'indicator formuls.text' \
         indicator-replay-ui-sync.mjs; do
  n=$(docker logs "$C" 2>&1 | grep -cF -- "$f" || true)
  printf '  requests=%-6s %s\n' "$n" "$f"
done

echo
echo "=== control: a file we KNOW is loaded ==="
n=$(docker logs "$C" 2>&1 | grep -cF -- 'chart-indicators-full.js' || true)
printf '  requests=%-6s %s\n' "$n" 'chart-indicators-full.js  (control, must be > 0)'
n=$(docker logs "$C" 2>&1 | grep -cF -- 'indicator-ui.js' || true)
printf '  requests=%-6s %s\n' "$n" 'indicator-ui.js  (control)'
